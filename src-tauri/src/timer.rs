//! Monotonic countdown engine (tauri-rebuild doc 03 §3).
//!
//! `tokio::time::Instant` is monotonic and follows paused time in tests — a
//! wall-clock jump (NTP step, DST) cannot corrupt the countdown. The Electron
//! implementation used `Date.now()` and *was* vulnerable to that.

use std::sync::Arc;

use tokio::task::JoinHandle;
use tokio::time::{Duration, Instant, MissedTickBehavior};

use crate::state::{Action, AppState, ScoreboardState};

/// How often the tick task wakes up. The second boundary is published within
/// 100 ms of the true boundary, and pausing preserves sub-second fractions,
/// so a match paused 50 times still ends at exactly 00:00.
const TICK_INTERVAL: Duration = Duration::from_millis(100);

pub struct TimerEngine {
    running: bool,
    /// Remaining time when paused.
    remaining: Duration,
    /// Instant at which the timer reaches zero, while running.
    deadline: Option<Instant>,
    task: Option<JoinHandle<()>>,
}

impl TimerEngine {
    pub fn new() -> Self {
        Self {
            running: false,
            remaining: Duration::ZERO,
            deadline: None,
            task: None,
        }
    }

    /// Displayed value, ceiling: the UI shows `15:00` for the whole first
    /// second, matching broadcast convention and the Electron t=0 behaviour.
    pub fn displayed(&self) -> u32 {
        let remaining = match (self.running, self.deadline) {
            (true, Some(deadline)) => deadline.saturating_duration_since(Instant::now()),
            _ => self.remaining,
        };
        displayed_duration(remaining)
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
                // No-op if `timer == 0` or already running.
                if self.running || self.remaining.is_zero() {
                    return;
                }
                self.deadline = Some(Instant::now() + self.remaining);
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
            _ => {}
        }
    }

    /// Freeze, keep value. No-op if not running.
    fn pause(&mut self, sb: &mut ScoreboardState) {
        if !self.running {
            return;
        }
        self.remaining = self
            .deadline
            .map(|d| d.saturating_duration_since(Instant::now()))
            .unwrap_or_default();
        sb.timer = displayed_duration(self.remaining);
        self.deadline = None;
        self.running = false;
        sb.is_timer_running = false;
        self.abort_task();
    }

    /// Set absolute value. If running: recompute the deadline, the task keeps
    /// running. If `seconds == 0` while running: pause first.
    fn set(&mut self, sb: &mut ScoreboardState, seconds: u32) {
        if seconds == 0 {
            self.pause(sb);
        }
        self.remaining = Duration::from_secs(u64::from(seconds));
        sb.timer = seconds;
        if self.running {
            self.deadline = Some(Instant::now() + self.remaining);
        }
    }

    /// Called by the tick task when the countdown hits zero.
    pub fn on_finished(&mut self) {
        self.running = false;
        self.deadline = None;
        self.remaining = Duration::ZERO;
        self.task = None;
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
                let now_displayed = {
                    // Lock the engine only long enough to read the display;
                    // never hold it across `set_timer_and_publish` (which
                    // takes the scoreboard lock) — that would invert the
                    // dispatch lock order.
                    let engine = shared.timer.lock().await;
                    engine.displayed()
                };
                if now_displayed == 0 {
                    shared.timer_reached_zero().await;
                    break;
                }
                if now_displayed != last_published {
                    last_published = now_displayed;
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
}
