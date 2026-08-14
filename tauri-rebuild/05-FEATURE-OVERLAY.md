# 05 — Feature: Overlay Mode & Global Hotkeys `[OPTIONAL]`

Deferrable. The app must be fully usable without it. Ship it in a later phase.

## 1. What it does

Overlay mode opens two frameless, transparent, always-on-top windows so the operator can
drive the match while OBS or a game is focused:

- **Overlay preview** — a live 600×80 render of the scoreboard.
- **Overlay control** — a compact 500×250 control panel.

While overlay mode is active, **global hotkeys** are registered so the operator does not
need to focus any window at all.

## 2. Windows

| Property        | overlay-preview        | overlay-control                                 |
| --------------- | ---------------------- | ----------------------------------------------- |
| Label           | `overlay-preview`      | `overlay-control`                               |
| URL             | `overlay-preview.html` | `overlay-control.html`                          |
| Size            | 600 × 80               | 500 × 250                                       |
| Position        | `(50, 50)`             | `(workArea.width - 550, workArea.height - 250)` |
| `decorations`   | `false`                | `false`                                         |
| `transparent`   | `true`                 | `true`                                          |
| `always_on_top` | `true`                 | `true`                                          |
| `skip_taskbar`  | `true`                 | `true`                                          |
| `resizable`     | `true`                 | `true`                                          |
| `shadow`        | `false`                | `false`                                         |
| Focus on create | no                     | no                                              |

```rust
WebviewWindowBuilder::new(app, "overlay-control", WebviewUrl::App("overlay-control.html".into()))
    .inner_size(500.0, 250.0)
    .position(x, y)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .build()?;
```

Position: `app.primary_monitor()?` → `monitor.size()` and `monitor.scale_factor()`.
Tauri reports physical pixels; convert with the scale factor before positioning, or the
window lands off-screen on a 150 % display. `[RISK]` — this is the single most common
multi-monitor bug in this feature.

The Electron version uses `alwaysOnTopLevel: "screen-saver"` for the preview and
`"floating"` for the control. Tauri exposes only a boolean `always_on_top`; if the preview
must sit above full-screen apps, call the platform API through
`window.set_always_on_top(true)` and accept that on Windows it will not float above an
exclusive-fullscreen game (neither does Electron reliably).

Dragging: the overlay control has an `h-8` drag strip. Use
`data-tauri-drag-region` on that element and grant
`core:window:allow-start-dragging` in the overlay capability.

## 3. Commands & events

| Command               | Args             | Effect                                                       |
| --------------------- | ---------------- | ------------------------------------------------------------ |
| `overlay_enable`      | —                | Creates both windows if absent, registers hotkeys if enabled |
| `overlay_disable`     | —                | Closes both windows, unregisters hotkeys                     |
| `overlay_toggle`      | —                | The obvious                                                  |
| `overlay_is_open`     | —                | `bool`                                                       |
| `hotkeys_get`         | —                | `HotkeyMap`                                                  |
| `hotkeys_set`         | `map: HotkeyMap` | Persists to settings, re-registers if active                 |
| `hotkeys_set_enabled` | `enabled: bool`  | Persists, registers/unregisters                              |
| `hotkeys_reset`       | —                | Restores defaults                                            |

| Event             | Payload     | Target |
| ----------------- | ----------- | ------ |
| `overlay:opened`  | —           | all    |
| `overlay:closed`  | —           | all    |
| `hotkeys:changed` | `HotkeyMap` | all    |

If either overlay window is closed by the user, close the other one too and emit
`overlay:closed` so the main window's toggle returns to OFF. `[PARITY]`

Closing the main window closes the overlays. `[PARITY]`

## 4. Timer control handoff — deleted `[NEW]`

The Electron implementation has an elaborate protocol
(`surrenderTimerControl` → `timer-control-surrendered` → `pendingTimerHandoff` →
`overlay-ready` → `receive-timer-control`, plus a reverse path on close), and it forces
the timer to pause on every transition — the operator has to manually resume.

**None of this exists in the Tauri version.** The timer lives in Rust and is never owned
by a window. Opening or closing the overlay does not touch it. A running timer keeps
running.

Delete these Electron channels entirely: `surrender-timer-control`,
`timer-control-surrendered`, `overlay-ready`, `overlay-timer-surrender`,
`receive-timer-control`, `reset-overlay-state`.

## 5. Global hotkeys

### 5.1 Default map `[PARITY]`

| Action                | Default           |
| --------------------- | ----------------- |
| `increaseHomeScore`   | `Q`               |
| `decreaseHomeScore`   | `A`               |
| `increaseAwayScore`   | `E`               |
| `decreaseAwayScore`   | `D`               |
| `increaseHalf`        | `]`               |
| `decreaseHalf`        | `[`               |
| `startTimer`          | `Space`           |
| `pauseTimer`          | `P`               |
| `stopTimer`           | `S`               |
| `increaseTimerSecond` | `ArrowUp`         |
| `decreaseTimerSecond` | `ArrowDown`       |
| `increaseTimerMinute` | `Shift+ArrowUp`   |
| `decreaseTimerMinute` | `Shift+ArrowDown` |
| `timerLoadout1`       | `Ctrl+1`          |
| `timerLoadout2`       | `Ctrl+2`          |
| `timerLoadout3`       | `Ctrl+3`          |
| `resetScoreboard`     | `Ctrl+Shift+R`    |

### 5.2 Storage

```rust
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBinding {
    pub key: String,        // "Q", "Space", "ArrowUp", "]"
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub enabled: bool,
}
pub type HotkeyMap = BTreeMap<HotkeyAction, HotkeyBinding>;
```

`HotkeyAction` is an enum mapping 1:1 onto `Action`:

```rust
impl HotkeyAction {
    fn to_action(self) -> Action { /* increaseTimerMinute => Action::TimerAdjust { delta: 60 }, ... */ }
}
```

Stored in `settings.json`, **not** `localStorage` `[NEW]`. This removes the Electron
startup race where the main process has no hotkey map until a renderer sends one.

### 5.3 Registration

`tauri-plugin-global-shortcut`. Shortcut strings use the plugin's format:

| Binding         | Shortcut string            |
| --------------- | -------------------------- |
| `Q`             | `Q`                        |
| `Space`         | `Space`                    |
| `Shift+ArrowUp` | `Shift+ArrowUp`            |
| `Ctrl+Shift+R`  | `CommandOrControl+Shift+R` |
| `]`             | `BracketRight`             |
| `[`             | `BracketLeft`              |

`[RISK]` The plugin uses **physical key codes** (`KeyQ`, `Digit1`, `BracketLeft`), not
characters. Write one conversion function with unit tests covering every default binding,
and reject a recorded key that has no code mapping instead of registering something wrong.

Lifecycle:

- Register on `overlay_enable` when `hotkeys_enabled`.
- Re-register (unregister all, then register) on any `hotkeys_set`.
- Unregister all on `overlay_disable`, on `hotkeys_set_enabled(false)`, and on app exit.
- Registration can fail because another app owns the combination. Collect failures and
  report them to the UI as a list, marking those rows with a warning. `[NEW]` — Electron
  silently swallows this and the operator never learns why `Q` does nothing.

Handler:

```rust
app.global_shortcut().on_shortcut(shortcut, move |app, _sc, event| {
    if event.state() != ShortcutState::Pressed { return; }   // ignore key-up
    let shared = app.state::<Shared>();
    tauri::async_runtime::spawn(async move { let _ = shared.dispatch(action).await; });
})?;
```

`[RISK]` The plugin fires on both press and release. Without the `Pressed` filter every
hotkey acts twice.

### 5.4 Platform caveats

- **Windows:** works. Some combinations are reserved by the OS/other apps.
- **Linux/X11:** works.
- **Linux/Wayland:** global shortcuts generally **do not work** — the compositor does not
  grant global grabs to ordinary applications. Detect Wayland via `XDG_SESSION_TYPE` and
  show an explanatory notice in the Keyboard Shortcuts tab instead of silently failing.
  `[NEW]`
- Bare `Space` as a global shortcut hijacks the space bar system-wide while overlay mode
  is on. That is the intended Electron behaviour, but call it out in the UI.

## 6. Overlay control panel UI `[PARITY]`

```
h-8 drag strip (data-tauri-drag-region)
compact recording strip                        [OPTIONAL, doc 06]
panel: flex flex-col gap-2 rounded-lg border border-white/10 bg-gray-900 p-3 shadow-2xl backdrop-blur-md
  5-column grid:
    1. Home   : +1, -1, L1
    2. Away   : +1, -1, L2
    3. Half   : +1, -1, L3
    4. Timer  : ▶ / ⏸ toggle, ⏹ stop, -1m
    5. Value  : +1s, -1s, +1m
```

Every button dispatches through the same store as the main window. No local timer state.

## 7. Hotkey settings UI `[PARITY]`

- `Hotkeys Enabled` ON/OFF toggle.
- `Reset to Defaults` outlined button.
- Rows grouped: Score, Half, Timer, Loadouts, Other. Each row: label, formatted `<kbd>`,
  `Change` button. `Change` is disabled when the binding has `enabled: false`.
- **Recorder:** a capture overlay showing `Press any key...` and Cancel.
  - Listens on `window` in the **capture** phase, calls `preventDefault()` and
    `stopPropagation()`.
  - Ignores bare `Control`, `Alt`, `Shift`, `Meta`.
  - Stores key + ctrl/alt/shift flags. `Meta` is not persisted as a modifier.
  - **Duplicate detection:** compares key + all three modifier flags against every other
    action. On a duplicate, stops recording and shows `Hotkey Already In Use`, the
    conflicting action name, `Try Again`, and `Cancel`.
  - A unique binding is stored immediately; the overlay closes after 300 ms.
  - While recording, global hotkeys are disabled and the previous enabled state is
    restored on completion or cancel `[PARITY]` — otherwise pressing `Ctrl+1` to record it
    also fires it.
- `[NEW]` Show a warning icon on rows whose shortcut failed to register.

## 8. Capability

`src-tauri/capabilities/overlay.json` — deliberately narrower than the main window:

```json
{
	"identifier": "overlay-capability",
	"windows": ["overlay-control", "overlay-preview"],
	"permissions": ["core:default", "core:window:allow-start-dragging", "core:window:allow-close"]
}
```

No dialog, no opener, no shell.

## 9. Acceptance criteria

- Enabling overlay mode opens both windows at the specified positions on a 100 % and a
  150 % scaled display.
- A running timer keeps running across enable → disable → enable.
- Every default hotkey works while a different application is focused (Windows, X11).
- Recording a hotkey that duplicates another shows the conflict UI and does not save.
- Closing either overlay window closes both and flips the main toggle to OFF.
- Quitting the app leaves no registered global shortcuts behind.
