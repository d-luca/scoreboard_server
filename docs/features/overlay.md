# Overlay mode and global hotkeys — planned, not implemented

> **Status:** not implemented. `pages/overlay-*.html` and
> [`overlayControl.tsx`](../../src/entries/overlayControl.tsx) /
> [`overlayPreview.tsx`](../../src/entries/overlayPreview.tsx) are placeholders, the
> `overlay` Cargo feature only adds the `Broadcast › Overlay Mode` (F9) menu item, and
> `ServerStatus.overlayActive` is always `false`. This page is the design to build from.

## Goal

Let the operator drive the match while OBS or a game has focus:

- **overlay-preview** — live 600×80 scoreboard, frameless, transparent, always on top.
- **overlay-control** — compact 500×250 control panel, same flags.
- **Global hotkeys**, registered only while overlay mode is on.

The timer lives in Rust, so opening or closing the overlay never touches it — no
"timer ownership handoff" of any kind.

## Windows

| Property | overlay-preview                                                                                                                      | overlay-control                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Size     | 600 × 80                                                                                                                             | 500 × 250                               |
| Position | (50, 50)                                                                                                                             | work area bottom-right minus (550, 250) |
| Flags    | `decorations:false`, `transparent:true`, `always_on_top:true`, `skip_taskbar:true`, `shadow:false`, resizable, not focused on create | same                                    |

- Monitor sizes are physical pixels: divide by the scale factor before positioning, or the
  window lands off-screen on a 150 % display.
- The control panel gets an `h-8` drag strip with `data-tauri-drag-region`.
- Overlay windows must have **no menu bar** — which is why the menu is attached with
  `main_window.set_menu`, never `app.set_menu`.
- Closing either overlay closes both; closing `main` closes them.
- Transparent windows on Linux need a compositor; otherwise the background is black.
  Fallback: a solid dark control panel, and the OBS browser source instead of the preview.
- Give them their own, narrower capability (`core:default`,
  `allow-start-dragging`, `allow-close`; no dialog, opener or shell).

Control panel layout: five columns — Home (+1, −1, L1), Away (+1, −1, L2), Half (+1, −1,
L3), Timer (start/pause, stop, −1m), Value (+1s, −1s, +1m) — plus an optional compact
recording strip. Every button dispatches an `Action`; no local timer state.

## Commands and events (proposed)

`overlay_enable`, `overlay_disable`, `overlay_toggle`, `overlay_is_open`, `hotkeys_get`,
`hotkeys_set`, `hotkeys_set_enabled`, `hotkeys_reset`; events `overlay:opened`,
`overlay:closed`, `hotkeys:changed`.

Toggle entry points — the checkable menu item (F9), a status bar badge, a Settings switch —
are all reflections of backend state. Update the menu check mark from the
`overlay:opened` / `overlay:closed` handlers, never optimistically (window creation can
fail).

## Global hotkeys

- Default map: the same as the local hotkeys in [`hotkeys.ts`](../../src/lib/hotkeys.ts).
- Store the map and an enabled flag in `settings.json` (not `localStorage`), so Rust has
  it at startup.
- Use `tauri-plugin-global-shortcut`. It works with **physical key codes** (`KeyQ`,
  `Digit1`, `BracketLeft`), not characters: write one tested conversion function and
  reject keys without a mapping.
- The plugin fires on press **and** release — filter on `ShortcutState::Pressed` or every
  hotkey acts twice.
- Register on enable; unregister-all then re-register on change; unregister on disable
  and on exit. Collect registration failures (combination owned by another app) and show
  them in the UI.
- **Wayland** generally does not allow global shortcuts. Detect `XDG_SESSION_TYPE=wayland`
  and explain it in the UI. Bare `Space` as a global hotkey hijacks the space bar
  system-wide while overlay mode is on; say so.

Hotkey settings UI (a Keyboard Shortcuts tab in Settings): enable toggle, reset to
defaults, grouped rows with a Change button. The recorder listens in the capture phase,
ignores bare modifiers, detects duplicates (key + all modifiers) and shows a conflict
dialog, and disables global hotkeys while recording so the pressed combo does not also
fire.

## Acceptance criteria

- Both windows open at the right positions on 100 % and 150 % displays.
- A running timer keeps running across enable → disable → enable.
- Every default hotkey works with another app focused (Windows, X11).
- A duplicate binding shows the conflict UI and is not saved.
- Closing either overlay closes both and clears the menu check mark and badge.
- Menu, badge and Settings toggles stay in sync.
- Overlay windows have no menu bar; quitting leaves no registered shortcuts.
