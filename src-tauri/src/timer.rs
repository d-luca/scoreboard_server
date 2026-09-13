//! Monotonic countdown engine (tauri-rebuild doc 03 §3).
//!
//! `tokio::time::Instant` is monotonic and follows paused time in tests — a
//! wall-clock jump (NTP step, DST) cannot corrupt the countdown. The Electron
//! implementation used `Date.now()` and *was* vulnerable to that.

use std::sync::Arc;

use tokio::task::JoinHandle;
use tokio::time::{Duration, Instant, MissedTickBehavior};

use crate::state::{Action, AppState, ScoreboardState, TimerDirection, MAX_TIMER_SECS};

/// How often the tick task wakes up. The second boundary is published within
/// 100 ms of the true boundary, and pausing preserves sub-second fractions,
/// so a match paused 50 times still ends at exactly 00:00.
const TICK_INTERVAL: Duration = Duration::from_millis(100);

pub struct TimerEngine {
    running: bool,
    /// Counting down: seconds remaining. Counting up: seconds elapsed.
    /// Frozen while paused.
    remaining: Duration,
    /// Instant at which the timer reaches zero (countdown) or, in count-up
    /// mode, the [`Instant`] the clock started counting from — displayed
    /// elapsed is `now - started_at + remaining`.
    deadline: Option<Instant>,
    direction: TimerDirection,
    task: Option<JoinHandle<()>>,
}

impl TimerEngine {
    pub fn new() -> Self {
        Self {
            running: false,
            remaining: Duration::ZERO,
            deadline: None,
            direction: TimerDirection::Down,
            task: None,
        }
    }

    /// Displayed value. Countdown shows the ceiling: the UI shows `15:00`
    /// for the whole first second, matching broadcast convention and the
    /// Electron t=0 behaviour. Count-up floors and clamps at
    /// [`MAX_TIMER_SECS`] (99:59:59) without stopping the engine.
    pub fn displayed(&self) -> u32 {
        self.elapsed_value().min(MAX_TIMER_SECS)
    }

    /// The underlying clock value without the cap. Count-up keeps
    /// accumulating past [`MAX_TIMER_SECS`] so the tick task still publishes
    /// when the *displayed* value reaches the cap; countdown never exceeds
    /// the cap anyway.
    fn elapsed_value(&self) -> u32 {
        let raw = match (self.direction, self.running, self.deadline) {
            (TimerDirection::Down, true, Some(deadline)) => {
                deadline.saturating_duration_since(Instant::now())
            }
            (TimerDirection::Up, true, Some(started)) => self.remaining + started.elapsed(),
            _ => self.remaining,
        };
        match self.direction {
            TimerDirection::Down => displayed_duration(raw),
            TimerDirection::Up => u32::try_from(raw.as_secs()).unwrap_or(u32::MAX),
        }
    }

    #[cfg(test)]
    pub fn is_running(&self) -> bool {
        self.running
    }

    /// Handle a timer action against the scoreboard state. Caller holds the
    /// scoreboard write guard; this method never publishes.
    pub fn apply(&mut self, shared: &Arc<AppState>, sb: &mut ScoreboardState, action: &Action) {
        match *action {
            Action::TimerStart => {
                if self.running {
                    return;
                }
                match self.direction {
                    // Countdown cannot start from zero.
                    TimerDirection::Down if self.remaining.is_zero() => return,
                    TimerDirection::Down => {
                        self.deadline = Some(Instant::now() + self.remaining);
                    }
                    TimerDirection::Up => {
                        self.deadline = Some(Instant::now());
                    }
                }
                self.running = true;
                sb.is_timer_running = true;
                self.spawn_tick(shared);
            }
            Action::TimerPause => {
                self.pause(sb);
            }
            Action::TimerStop => {
                self.pause(sb);
                self.remaining = Duration::ZERO;
                sb.timer = 0;
            }
            Action::TimerSet { seconds } => {
                self.set(sb, seconds);
            }
            Action::TimerAdjust { delta } => {
                let seconds = self.displayed().saturating_add_signed(delta);
                self.set(sb, seconds);
            }
            Action::TimerLoadout { slot } => {
                let seconds = match slot {
                    1 => sb.timer_loadout1,
                    2 => sb.timer_loadout2,
                    _ => sb.timer_loadout3,
                };
                // Pauses first if running [NEW].
                self.pause(sb);
                self.set(sb, seconds);
            }
            Action::TimerSetDirection { direction } => {
                // Pause and keep the displayed value; the engine holds the
                // direction so the tick task never needs the scoreboard lock.
                self.pause(sb);
                self.direction = direction;
                sb.timer_direction = direction;
            }
            _ => {}
        }
    }

    /// Freeze, keep value. No-op if not running.
    fn pause(&mut self, sb: &mut ScoreboardState) {
        if !self.running {
            return;
        }
        self.remaining = match (self.direction, self.deadline) {
            (TimerDirection::Down, Some(deadline)) => {
                deadline.saturating_duration_since(Instant::now())
            }
            (TimerDirection::Up, Some(started)) => {
                let elapsed = self.remaining + started.elapsed();
                // Keep the frozen value at the cap, not above it.
                elapsed.min(Duration::from_secs(u64::from(MAX_TIMER_SECS)))
            }
            _ => Duration::ZERO,
        };
        sb.timer = self.displayed();
        self.deadline = None;
        self.running = false;
        sb.is_timer_running = false;
        self.abort_task();
    }

    /// Set absolute value (remaining when counting down, elapsed when
    /// counting up). If running: rebase the anchor instant, the task keeps
    /// running. In countdown mode `seconds == 0` while running pauses first;
    /// count-up treats 0 as a normal rebase to zero.
    fn set(&mut self, sb: &mut ScoreboardState, seconds: u32) {
        let seconds = seconds.min(MAX_TIMER_SECS);
        if seconds == 0 && self.direction == TimerDirection::Down {
            self.pause(sb);
        }
        self.remaining = Duration::from_secs(u64::from(seconds));
        sb.timer = seconds;
        if self.running {
            self.deadline = Some(match self.direction {
                TimerDirection::Down => Instant::now() + self.remaining,
                TimerDirection::Up => Instant::now(),
            });
        }
    }

    /// Called by the tick task when the countdown hits zero.
    pub fn on_finished(&mut self) {
        self.running = false;
        self.deadline = None;
        self.remaining = Duration::ZERO;
        self.task = None;
    }

    /// Whether the countdown is at zero (finished) — count-up never is.
    pub fn is_finished(&self) -> bool {
        self.direction == TimerDirection::Down && self.displayed() == 0
    }

    fn abort_task(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }

    fn spawn_tick(&mut self, shared: &Arc<AppState>) {
        self.abort_task();
        let shared = Arc::clone(shared);
        self.task = Some(tokio::spawn(async move {
            let mut ticker = tokio::time::interval(TICK_INTERVAL);
            ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
            let mut last_published = {
                let engine = shared.timer.lock().await;
                engine.displayed()
            };
            loop {
                ticker.tick().await;
                // Lock the engine only long enough to read the display and
                // the finished flag; never hold it across
                // `set_timer_and_publish` / `timer_reached_zero` (which take
                // the scoreboard lock) — that would invert the dispatch lock
                // order.
                let (now_displayed, finished) = {
                    let engine = shared.timer.lock().await;
                    (engine.displayed(), engine.is_finished())
                };
                if finished {
                    shared.timer_reached_zero().await;
                    break;
                }
                // Compare uncapped so the publish at the cap is not skipped
                // (`elapsed` keeps moving while `displayed` is frozen there).
                let now_elapsed = {
                    let engine = shared.timer.lock().await;
                    engine.elapsed_value()
                };
                if now_elapsed != last_published {
                    last_published = now_elapsed;
                    shared.set_timer_and_publish(now_displayed).await;
                }
            }
        }));
    }
}

fn displayed_duration(remaining: Duration) -> u32 {
    u32::try_from(remaining.as_secs()).unwrap_or(u32::MAX) + u32::from(remaining.subsec_nanos() > 0)
}

impl Default for TimerEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ServerEvent;
    use tokio::time::{advance, sleep};

    /// Let the spawned tick task run until it goes idle again.
    async fn settle() {
        for _ in 0..20 {
            tokio::task::yield_now().await;
        }
    }

    /// The engine's live display value — the source of truth the tick task
    /// publishes from. Asserting on this avoids racing the 100 ms publisher.
    async fn engine_displayed(state: &AppState) -> u32 {
        state.timer.lock().await.displayed()
    }

    /// Count `TimerFinished` events already sitting in the channel.
    fn finished_events(rx: &mut tokio::sync::broadcast::Receiver<ServerEvent>) -> usize {
        let mut count = 0;
        loop {
            match rx.try_recv() {
                Ok(ServerEvent::TimerFinished) => count += 1,
                Ok(_) | Err(tokio::sync::broadcast::error::TryRecvError::Lagged(_)) => {}
                Err(tokio::sync::broadcast::error::TryRecvError::Empty)
                | Err(tokio::sync::broadcast::error::TryRecvError::Closed) => break,
            }
        }
        count
    }

    #[tokio::test(start_paused = true)]
    async fn finishes_exactly_once_at_zero() {
        let state = AppState::new();
        let mut rx = state.subscribe();
        state
            .dispatch(Action::TimerSet { seconds: 10 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();

        advance(Duration::from_secs(10)).await;
        settle().await;

        let sb = state.current().await;
        assert_eq!(sb.timer, 0);
        assert!(!sb.is_timer_running);
        let mut finished = 0;
        while let Ok(event) = rx.try_recv() {
            match event {
                ServerEvent::State(state) if state.timer == 0 => {
                    assert!(!state.is_timer_running);
                }
                ServerEvent::TimerFinished => finished += 1,
                _ => {}
            }
        }
        assert_eq!(finished, 1);
    }

    #[tokio::test(start_paused = true)]
    async fn pause_resume_preserves_total_elapsed() {
        let state = AppState::new();
        let mut rx = state.subscribe();
        state
            .dispatch(Action::TimerSet { seconds: 10 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();

        advance(Duration::from_millis(3500)).await;
        settle().await;
        state.dispatch(Action::TimerPause).await.unwrap();
        // Paused at 12.4s-style fractions: the long wall-clock gap must not
        // move the countdown.
        advance(Duration::from_secs(60)).await;
        settle().await;
        assert_eq!(state.current().await.timer, 7);

        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_millis(6500)).await;
        settle().await;

        assert_eq!(state.current().await.timer, 0);
        assert_eq!(finished_events(&mut rx), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn timer_set_while_running_keeps_task_alive() {
        let state = AppState::new();
        let mut rx = state.subscribe();
        state
            .dispatch(Action::TimerSet { seconds: 10 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(2)).await;
        settle().await;

        state
            .dispatch(Action::TimerSet { seconds: 30 })
            .await
            .unwrap();
        assert!(state.current().await.is_timer_running);
        assert!(state.timer.lock().await.is_running());

        advance(Duration::from_secs(30)).await;
        settle().await;
        assert_eq!(state.current().await.timer, 0);
        assert_eq!(finished_events(&mut rx), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn timer_set_to_zero_pauses() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSet { seconds: 10 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        state
            .dispatch(Action::TimerSet { seconds: 0 })
            .await
            .unwrap();
        let sb = state.current().await;
        assert_eq!(sb.timer, 0);
        assert!(!sb.is_timer_running);
    }

    #[tokio::test(start_paused = true)]
    async fn pause_preserves_value_but_stop_zeroes_it() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSet { seconds: 10 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(3)).await;
        state.dispatch(Action::TimerPause).await.unwrap();
        assert_eq!(state.current().await.timer, 7);

        state.dispatch(Action::TimerStop).await.unwrap();
        let stopped = state.current().await;
        assert_eq!(stopped.timer, 0);
        assert!(!stopped.is_timer_running);
    }

    #[tokio::test(start_paused = true)]
    async fn hundred_pause_resume_cycles_accumulate_under_one_second_error() {
        let state = AppState::new();
        let mut rx = state.subscribe();
        state
            .dispatch(Action::TimerSet { seconds: 600 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();

        for _ in 0..100 {
            advance(Duration::from_millis(50)).await;
            state.dispatch(Action::TimerPause).await.unwrap();
            advance(Duration::from_secs(1)).await; // wall-clock noise
            state.dispatch(Action::TimerStart).await.unwrap();
        }
        settle().await;

        // 100 × 50 ms = exactly 5 s of running time elapsed.
        assert_eq!(state.current().await.timer, 595);

        advance(Duration::from_secs(595)).await;
        settle().await;
        assert_eq!(state.current().await.timer, 0);
        assert_eq!(finished_events(&mut rx), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn timer_start_is_noop_at_zero() {
        let state = AppState::new();
        state.dispatch(Action::TimerStart).await.unwrap();
        assert!(!state.current().await.is_timer_running);
    }

    #[tokio::test(start_paused = true)]
    async fn timer_adjust_clamps_at_zero_and_pauses() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSet { seconds: 5 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        state
            .dispatch(Action::TimerAdjust { delta: -10 })
            .await
            .unwrap();
        let sb = state.current().await;
        assert_eq!(sb.timer, 0);
        assert!(!sb.is_timer_running);
    }

    #[tokio::test(start_paused = true)]
    async fn loadout_pauses_then_sets() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSet { seconds: 100 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        state
            .dispatch(Action::TimerLoadout { slot: 2 })
            .await
            .unwrap();
        let sb = state.current().await;
        assert_eq!(sb.timer, 2700);
        assert!(!sb.is_timer_running);
        // Engine agrees with state, so a later Start resumes from 2700.
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(1)).await;
        sleep(Duration::ZERO).await; // let the tick task wake
        settle().await;
        assert!(state.current().await.timer <= 2700);
    }

    #[tokio::test(start_paused = true)]
    async fn count_up_starts_from_zero_and_never_finishes() {
        let state = AppState::new();
        let mut rx = state.subscribe();
        state
            .dispatch(Action::TimerSetDirection {
                direction: TimerDirection::Up,
            })
            .await
            .unwrap();
        // Start at zero is legal in count-up mode.
        state.dispatch(Action::TimerStart).await.unwrap();
        assert!(state.current().await.is_timer_running);

        advance(Duration::from_secs(5)).await;
        sleep(Duration::ZERO).await;
        settle().await;
        // The engine reached 5 elapsed and is still running.
        assert_eq!(engine_displayed(&state).await, 5);
        assert!(state.current().await.is_timer_running);
        // No `TimerFinished`, no buzzer — the up-clock has no zero to reach.
        assert_eq!(finished_events(&mut rx), 0);
    }

    #[tokio::test(start_paused = true)]
    async fn count_up_pauses_and_resumes() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSetDirection {
                direction: TimerDirection::Up,
            })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(3)).await;
        sleep(Duration::ZERO).await;
        settle().await;
        assert_eq!(engine_displayed(&state).await, 3);

        state.dispatch(Action::TimerPause).await.unwrap();
        assert_eq!(engine_displayed(&state).await, 3);
        advance(Duration::from_secs(60)).await; // wall-clock noise
        settle().await;
        assert_eq!(engine_displayed(&state).await, 3);

        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(2)).await;
        sleep(Duration::ZERO).await;
        settle().await;
        assert_eq!(engine_displayed(&state).await, 5);
    }

    #[tokio::test(start_paused = true)]
    async fn count_up_freezes_at_cap_but_keeps_running() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSetDirection {
                direction: TimerDirection::Up,
            })
            .await
            .unwrap();
        state
            .dispatch(Action::TimerSet {
                seconds: MAX_TIMER_SECS - 2,
            })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(10)).await;
        sleep(Duration::ZERO).await;
        settle().await;

        // Frozen at the cap, still running.
        assert_eq!(engine_displayed(&state).await, MAX_TIMER_SECS);
        assert!(state.current().await.is_timer_running);

        // Pausing at the cap keeps the capped value.
        state.dispatch(Action::TimerPause).await.unwrap();
        assert_eq!(state.current().await.timer, MAX_TIMER_SECS);
    }

    #[tokio::test(start_paused = true)]
    async fn direction_switch_pauses_and_keeps_value() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSet { seconds: 100 })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(3)).await;
        sleep(Duration::ZERO).await;
        settle().await;

        state
            .dispatch(Action::TimerSetDirection {
                direction: TimerDirection::Up,
            })
            .await
            .unwrap();
        let sb = state.current().await;
        assert!(!sb.is_timer_running);
        assert_eq!(sb.timer, 97);
        assert_eq!(sb.timer_direction, TimerDirection::Up);
        // Engine agrees: up-mode Start resumes counting from 97 upward.
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(2)).await;
        sleep(Duration::ZERO).await;
        settle().await;
        assert_eq!(engine_displayed(&state).await, 99);
    }

    #[tokio::test(start_paused = true)]
    async fn count_up_set_to_zero_rebases_without_pausing() {
        let state = AppState::new();
        state
            .dispatch(Action::TimerSetDirection {
                direction: TimerDirection::Up,
            })
            .await
            .unwrap();
        state.dispatch(Action::TimerStart).await.unwrap();
        advance(Duration::from_secs(5)).await;
        sleep(Duration::ZERO).await;
        settle().await;
        assert_eq!(engine_displayed(&state).await, 5);

        state
            .dispatch(Action::TimerSet { seconds: 0 })
            .await
            .unwrap();
        assert!(state.current().await.is_timer_running);
        advance(Duration::from_secs(2)).await;
        sleep(Duration::ZERO).await;
        settle().await;
        assert_eq!(engine_displayed(&state).await, 2);
    }
}
