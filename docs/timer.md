# Timer engine

Source: [`src-tauri/src/timer.rs`](../src-tauri/src/timer.rs), driven through
`AppState::dispatch` in [`state.rs`](../src-tauri/src/state.rs).

## Requirements

- No drift, independent of window focus or load (webview timers get throttled; Rust
  tasks do not).
- Immune to wall-clock changes (NTP steps, DST).
- Pause/resume must not accumulate error.
- `timer-finished` fires exactly once per countdown.

## Design

The engine stores a monotonic `tokio::time::Instant` anchor, never a wall-clock time:

| Direction        | Running                                                | Paused             |
| ---------------- | ------------------------------------------------------ | ------------------ |
| `down` (default) | `deadline = now + remaining`; value = `deadline - now` | `remaining` frozen |
| `up`             | `started = now`; value = `remaining + (now - started)` | `remaining` frozen |

- **Countdown displays the ceiling** — `15:00` is shown for the whole first second, the
  broadcast convention.
- **Count-up floors** and freezes the display at `MAX_TIMER_SECS` = 359 999
  (99:59:59) while the engine keeps running. It never finishes and never buzzes.
- Values are capped at 99:59:59 everywhere (`timer-set`, loadouts).
- The engine owns the direction, so the tick task never needs the scoreboard lock to
  compute a value. The direction is seeded from settings at startup
  (`TimerEngine::with_direction`), so count-up survives a restart.

## Tick task

While running, a tokio task ticks every **100 ms** (`MissedTickBehavior::Delay`):

1. Lock the engine briefly, read the displayed value and the finished flag, release.
2. If the countdown reached 0 → `timer_reached_zero()`: stop, set `isTimerRunning = false`,
   publish the state and `ServerEvent::TimerFinished` once, end the task.
3. Otherwise publish only when the value changed (so roughly once per second).

Lock order is scoreboard → engine. The task must not hold the engine lock while
publishing, because publishing takes the scoreboard lock.

The backend never plays sound. The main webview decides whether to buzz on
`timer:finished` (`buzzerAutoPlay`); see [protocol.md](protocol.md#tauri-events).

## Actions

| Action                | Countdown (`down`)                                     | Count-up (`up`)                          |
| --------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `timer-start`         | No-op at 0 or when already running                     | Starts from any value, including 0       |
| `timer-pause`         | Freeze, keep the value                                 | same                                     |
| `timer-stop`          | Freeze and set 0                                       | same                                     |
| `timer-set`           | Set value; 0 while running pauses                      | Set value; 0 rebases **without** pausing |
| `timer-adjust`        | `value + delta`, clamped at 0 (0 while running pauses) | `value + delta`, clamped at 0            |
| `timer-loadout`       | Pause, then set the loadout value                      | same                                     |
| `timer-set-direction` | Pause, keep the displayed value, switch direction      | same                                     |

While running, `timer-set` / `timer-adjust` rebase the anchor and the task keeps running.

The UI disables Start when the countdown is at 0; in count-up Start is always enabled.

## Tests

Tokio paused-time tests in `timer.rs` (`tokio::time::pause` + `advance`):

- finishes exactly once at zero
- pause/resume preserves total elapsed; 100 pause/resume cycles accumulate < 1 s error
- `timer-set` while running keeps the task alive; set to 0 pauses (countdown)
- pause keeps the value, stop zeroes it
- start is a no-op at zero (countdown)
- adjust clamps at zero and pauses
- loadout pauses then sets
- count-up starts from zero and never finishes; pauses and resumes; freezes at the cap
  but keeps running; set to 0 rebases without pausing
- switching direction pauses and keeps the value

Manual check before a release: run 10 minutes against a stopwatch, drift < 1 s.
