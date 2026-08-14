# 00 — Product Overview & Scope

## 1. What the product is

Scoreboard Server is a desktop application for live sports streaming. It maintains a
single authoritative **match state** (team names, colours, scores, countdown timer,
period) and publishes it simultaneously to:

1. A **desktop control UI** where the operator drives the match.
2. An **HTTP/WebSocket server on the LAN**, so OBS Studio can render the scoreboard as a
   Browser Source and so a phone/tablet can act as a remote control.
3. Optional **floating overlay windows** for multi-monitor operation.
4. Optional **match recordings** that can later be turned into a video with an alpha
   channel, for post-production.

The defining constraint: **the timer must never drift and never be throttled**, no matter
which window has focus or whether the machine is under load.

## 2. Feature inventory

### 2.1 Core (must ship in v1)

| Feature                  | Description                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Score control            | Increment/decrement/set home and away scores; never below 0                             |
| Countdown timer          | Start / pause / stop; ±1s, ±1m adjustments; set to explicit value                       |
| Timer loadouts           | Three configurable presets (defaults 15:00, 45:00, 20:00)                               |
| Period tracking          | Increment/decrement half/period, never below 1; configurable prefix (default `PERIODO`) |
| Team identity            | Editable names and colours, with a preset palette                                       |
| Reset                    | Reset scores, half and timer to defaults in one action                                  |
| Local keyboard shortcuts | Full hotkey map usable while the main window is focused                                 |
| HTTP + WebSocket server  | Port 3001 by default, bound to `0.0.0.0`, CORS open for OBS                             |
| OBS scoreboard page      | `GET /scoreboard` — transparent, self-updating scoreboard render                        |
| Single-value pages       | `GET /value/:property` — one property rendered large, self-updating                     |
| REST API                 | `GET /api/scoreboard`, `GET /api/scoreboard/:property`, `POST /api/scoreboard`          |
| LAN remote control       | `GET /control` — mobile-first remote for the whole match state                          |
| Buzzer                   | Plays a sound at 00:00; manual trigger; auto-play toggle; custom audio file             |
| LAN discovery UI         | Lists the machine's LAN URLs, hidden behind a show/hide toggle (Outputs window)         |
| Native menu bar          | Sole entry point to Settings, Outputs, Overlay, Recording, Video, Zoom, About `[NEW]`   |
| Status bar               | Server / clients / overlay / recording status reported in the main window `[NEW]`       |
| Settings persistence     | Survives restarts                                                                       |

### 2.2 Optional — Overlay (doc 05)

| Feature                | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| Overlay preview window | 600×80 frameless transparent always-on-top scoreboard preview     |
| Overlay control window | 500×250 frameless transparent always-on-top compact control panel |
| Global hotkeys         | System-wide shortcuts, active only while overlay mode is on       |
| Timer control handoff  | Timer ownership passes cleanly between main window and overlay    |

### 2.3 Optional — Recording & Video (doc 06)

| Feature             | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| Match recording     | One snapshot of the full state per second, written to disk    |
| Recording status    | Live duration + snapshot counter in the UI                    |
| Output directory    | User-selectable, persisted                                    |
| Video generator     | Recording file → transparent WebM/VP9 video of the scoreboard |
| Generation progress | Per-step progress with frame counts, cancellable              |

## 3. Decisions taken for the rebuild

| #   | Decision                                                                    | Rationale                                                                                                                                       |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Tauri v2**, not v1                                                        | v2 is the supported line; multi-window, plugin and capability model are all cleaner                                                             |
| D2  | **Pure Rust backend** (axum), no Node sidecar                               | ~10 MB bundle vs ~150 MB, one process, no IPC bridge to a second runtime                                                                        |
| D3  | **React + Vite**, not Next.js                                               | See §4                                                                                                                                          |
| D4  | **No SSR** for the OBS page                                                 | Replaced by a self-contained client-rendered bundle embedded in the binary. Removes the entire `vite.scoreboard.config.ts` + `ssr.ts` machinery |
| D5  | **Rust owns all state**, the UI is a view                                   | Kills an entire class of desync bugs the Electron app works around with handoff protocols                                                       |
| D6  | **Types generated from Rust** via `ts-rs`                                   | `ScoreboardState` cannot drift between backend and frontend                                                                                     |
| D7  | **`/control` becomes a real React app**, not a 900-line HTML string in Rust | Maintainable, shares components and styling with the desktop UI                                                                                 |
| D8  | **Token-protected `/control`**                                              | The Electron version lets anyone on the network change the score                                                                                |
| D9  | **Configurable port** with automatic fallback                               | 3001 collides more often than you'd think                                                                                                       |
| D10 | **ffmpeg via sidecar binary**, frames produced by an offscreen canvas       | No Node, no headless browser, no `capturePage`                                                                                                  |
| D11 | **The main window is a control surface, not a dashboard**                   | Only scoreboard values, the buttons that change them, and a status bar. Settings, preview, sharing and recording move out                       |
| D12 | **Every other feature gets a dedicated window opened from a native menu**   | Keeps the operating surface small and glanceable during a live match; secondary windows can be parked on another monitor or closed entirely     |

### 3.1 UI shape `[NEW]`

```
┌─ main window (720×560) ───────────────────────────┐
│ File   View   Tools   Help          ← native menu │
├───────────────────────────────────────────┤
│  HOME   3    |  PERIODO 2  |    1   AWAY      │
│  [+1][-1]    |  [+1][-1]   |  [+1][-1]        │
│                                                 │
│            14:59   [Start][Reset]               │
│     [+1s][-1s][+1m][-1m][Buzzer]                │
│     [L1 15:00][L2 45:00][L3 20:00]              │
│            [Reset Scoreboard]                   │
├───────────────────────────────────────────┤
│ ● :3001  ● 2 clients  ○ overlay  ● REC 12:04    │  ← status bar
└───────────────────────────────────────────┘
```

"Status of the exposed scoreboard elements" means: is the server up and on which port, how
many clients are consuming it, is overlay mode on, is a recording running. It does **not**
mean a rendered preview — that lives in the Outputs window. Full spec in doc 04 §7.

## 4. Why not Next.js

Tauri loads the frontend as a **static asset bundle** from the `tauri://localhost`
protocol. There is no Node process serving the frontend at runtime.

Everything Next.js is good at requires that Node process:

| Next.js feature                       | Works in Tauri?              |
| ------------------------------------- | ---------------------------- |
| Server Components / RSC               | No                           |
| Route Handlers / API routes           | No — the API is Rust         |
| `getServerSideProps`, middleware, ISR | No                           |
| `next/image` optimization             | No (needs the loader server) |
| App Router client-side navigation     | Yes, but so does any router  |

You would be forced into `output: 'export'`, which strips it down to "a React SPA with a
file-system router" — while still paying for a much heavier toolchain, slower HMR, and a
build pipeline that fights Tauri's multi-entry HTML requirement (this app needs nine
separate HTML entry points, which is trivial in Vite and awkward in Next).

There is also a positive reason to choose Vite: the current app **already uses Vite**, so
every `.tsx` component, the Tailwind 4 setup, and the Zustand stores port over with
essentially no changes.

**Conclusion: React 19 + Vite 7. Next.js has no upside here.**

## 5. Non-goals

- Cloud sync, accounts, multi-match management, tournament brackets.
- Multiple simultaneous independent scoreboards in one app instance.
- Mobile/desktop-app parity beyond the `/control` web page.
- macOS support (can be added later; nothing in the design blocks it).

## 6. Glossary

| Term              | Meaning                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| **Match state**   | The single authoritative `ScoreboardState` struct owned by Rust              |
| **Loadout**       | A preset timer duration, in seconds                                          |
| **Half / period** | Integer ≥ 1, displayed after `halfPrefix`                                    |
| **Overlay mode**  | Optional mode with two frameless always-on-top windows + global hotkeys      || **Feature window**| A singleton secondary window (Settings, Outputs, Recording, Video Generator)  |
| **Status bar**    | The strip at the bottom of the main window reporting server/client/feature state || **Snapshot**      | One per-second capture of the match state during a recording                 |
| **Sidecar**       | An external binary bundled with the app and launched by Rust (here: ffmpeg)  |
| **Capability**    | Tauri v2's permission manifest granting a window access to specific commands |
| **Control token** | Random secret required by the LAN `/control` page                            |
