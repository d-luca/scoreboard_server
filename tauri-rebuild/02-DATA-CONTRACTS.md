# 02 — Data Contracts

Everything in this document is a contract between Rust, the desktop UI, and LAN clients.
Rust structs are authoritative; TypeScript types are **generated** from them.

## 1. Type generation with `ts-rs`

```toml
# src-tauri/Cargo.toml
[dependencies]
ts-rs = { version = "10", features = ["serde-compat", "no-serde-warnings"] }
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct ScoreboardState { /* ... */ }
```

`cargo test --manifest-path src-tauri/Cargo.toml export_bindings` regenerates
`src/bindings/*.ts`. Wire it into `pnpm dev` as a pre-step and add a CI check that fails
if `git diff --exit-code src/bindings` is dirty.

> `[NEW]` The Electron app hand-maintains `src/types/scoreboard.ts` and
> `src/preload/index.d.ts`. Those drift. Generated bindings cannot.

## 2. `ScoreboardState`

`serde(rename_all = "camelCase")` on the wire; snake_case in Rust.

| JSON field       | Rust type        | Default     | Constraints                                    |
| ---------------- | ---------------- | ----------- | ---------------------------------------------- |
| `teamHomeName`   | `String`         | `"HOME"`    | trimmed, max 32 chars `[NEW]`                  |
| `teamAwayName`   | `String`         | `"AWAY"`    | trimmed, max 32 chars `[NEW]`                  |
| `teamHomeScore`  | `u32`            | `0`         | ≥ 0 (type-enforced)                            |
| `teamAwayScore`  | `u32`            | `0`         | ≥ 0                                            |
| `teamHomeColor`  | `String`         | `"#00ff00"` | must match `^#[0-9a-fA-F]{6}$` `[NEW]`         |
| `teamAwayColor`  | `String`         | `"#ff0000"` | same                                           |
| `timer`          | `u32`            | `0`         | seconds remaining                              |
| `half`           | `u32`            | `1`         | ≥ 1                                            |
| `halfPrefix`     | `String`         | `"PERIODO"` | max 24 chars                                   |
| `eventLogo`      | `Option<String>` | `None`      | reserved; unimplemented in Electron too        |
| `isTimerRunning` | `bool`           | `false`     | read-only for clients; only the engine sets it |
| `timerLoadout1`  | `u32`            | `900`       | 15:00                                          |
| `timerLoadout2`  | `u32`            | `2700`      | 45:00                                          |
| `timerLoadout3`  | `u32`            | `1200`      | 20:00                                          |
| `revision`       | `u64`            | `0`         | `[NEW]` monotonic, bumped on every mutation    |

`revision` lets a reconnecting client detect missed updates and lets the UI drop
out-of-order events. Never expose it in the UI.

### 2.1 Rust definition

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ScoreboardState {
    pub team_home_name: String,
    pub team_away_name: String,
    pub team_home_score: u32,
    pub team_away_score: u32,
    pub team_home_color: String,
    pub team_away_color: String,
    pub timer: u32,
    pub half: u32,
    pub half_prefix: String,
    pub event_logo: Option<String>,
    pub is_timer_running: bool,
    pub timer_loadout1: u32,
    pub timer_loadout2: u32,
    pub timer_loadout3: u32,
    pub revision: u64,
}
```

### 2.2 Partial updates

```rust
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreboardPatch {
    pub team_home_name: Option<String>,
    // ... every field except `is_timer_running` and `revision`
    pub timer: Option<u32>,
}
```

`deny_unknown_fields` is deliberate: the Electron server silently swallowed typos in
`POST /api/scoreboard`. `[NEW]` Return `400` with the offending field instead.

`isTimerRunning` is **not** patchable. Clients change it only through timer actions.

## 3. Actions

One enum drives local commands, hotkeys and WS commands. Adding a feature means adding a
variant, and the compiler finds every place that must handle it.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "action", content = "data", rename_all = "kebab-case")]
#[ts(export, export_to = "../../src/bindings/")]
pub enum Action {
    Patch(ScoreboardPatch),          // "patch"
    ScoreHomeInc, ScoreHomeDec,      // "score-home-inc" ...
    ScoreAwayInc, ScoreAwayDec,
    HalfInc, HalfDec,
    TimerStart, TimerPause, TimerStop,
    TimerSet { seconds: u32 },
    TimerAdjust { delta: i32 },      // replaces inc/dec second/minute
    TimerLoadout { slot: u8 },       // 1 | 2 | 3
    BuzzerPlay,
    Reset,
}
```

> `[NEW]` `TimerAdjust { delta }` collapses the four Electron commands
> `timer:inc:second`, `timer:dec:second`, `timer:inc:minute`, `timer:dec:minute` into one.
> `[NEW]` `TimerLoadout { slot }` moves loadout resolution server-side; today the phone
> and the desktop each read the loadout value and send an absolute `timer:set`, so they
> can disagree.

### 3.1 Semantics

| Action                          | Effect                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Patch`                         | Merge validated fields; reject invalid ones                                                                    |
| `ScoreHomeInc` / `ScoreAwayInc` | `+1`, saturating at `u32::MAX`                                                                                 |
| `ScoreHomeDec` / `ScoreAwayDec` | `-1`, saturating at `0`                                                                                        |
| `HalfInc`                       | `+1`                                                                                                           |
| `HalfDec`                       | `-1`, floor `1`                                                                                                |
| `TimerStart`                    | No-op if `timer == 0` or already running                                                                       |
| `TimerPause`                    | Freeze, keep value                                                                                             |
| `TimerStop`                     | Freeze **and** set `timer = 0`                                                                                 |
| `TimerSet`                      | Set absolute value; if `0` while running → pause; keeps running otherwise                                      |
| `TimerAdjust`                   | `timer = clamp(timer + delta, 0, ..)`; hitting 0 while running → pause                                         |
| `TimerLoadout`                  | `TimerSet(loadout[slot])`; pauses first if running `[NEW]`                                                     |
| `BuzzerPlay`                    | Emits `buzzer:play` to the main window only; does not touch state                                              |
| `Reset`                         | Stop timer, then scores `0`, half `1`, timer `0`. Names, colours, prefix and loadouts are preserved `[PARITY]` |

## 4. WebSocket protocol

`ws://<host>:<port>/ws` `[NEW]` — a dedicated path instead of upgrading on `/`, so the
HTTP routes and the socket can evolve independently.

### 4.1 Envelope

All frames are JSON text. Every frame has a `type`.

**Server → client**

```jsonc
// on connect, and after any mutation
{ "type": "state", "data": { /* ScoreboardState */ } }

// discrete notifications
{ "type": "event", "event": "timer-finished" }
{ "type": "event", "event": "buzzer" }

// protocol / auth failures, sent right before close
{ "type": "error", "code": "unauthorized" | "bad-request" | "rate-limited", "message": "..." }
```

**Client → server**

```jsonc
// Action, flattened
{ "type": "command", "action": "score-home-inc" }
{ "type": "command", "action": "timer-set", "data": { "seconds": 900 } }
{ "type": "command", "action": "patch", "data": { "teamHomeName": "LIONS" } }

// keepalive; server replies with the same type
{ "type": "ping" }
```

### 4.2 Rules

- Server sends a full `state` frame immediately after a successful upgrade.
- Server sends a full `state` frame after every mutation, from any source. No deltas —
  the payload is under 400 bytes and this removes an entire class of bugs.
- Read-only clients (OBS, `/scoreboard`) need no token. **Write commands require a valid
  token** (§6).
- Any unparseable frame → `error` + close with code `1003`.
- Rate limit: max 30 commands/second per connection; excess → `error` `rate-limited`,
  close `1008`. `[NEW]`
- Server-side heartbeat: ping every 30 s, drop a connection that misses two pongs.

### 4.3 Client reconnection

`/scoreboard` and `/control` share one `lib/ws-client.ts` with exponential backoff
(250 ms → 5 s, jittered), automatic full-state resync on open, and an `onStatus` callback
driving the connection indicator.

## 5. HTTP API

| Method | Path                        | Auth           | Response                                            |
| ------ | --------------------------- | -------------- | --------------------------------------------------- |
| `GET`  | `/health`                   | none           | `{ "status":"ok", "version":"x.y.z", "port":3001 }` |
| `GET`  | `/scoreboard`               | none           | Embedded `scoreboard.html`                          |
| `GET`  | `/value/:property`          | none           | Embedded single-value page                          |
| `GET`  | `/control`                  | token in query | Embedded `control.html`                             |
| `GET`  | `/api/scoreboard`           | none           | Full `ScoreboardState` as JSON                      |
| `GET`  | `/api/scoreboard/:property` | none           | `text/plain` scalar                                 |
| `POST` | `/api/scoreboard`           | token          | `{ "success":true, "data": ScoreboardState }`       |
| `POST` | `/api/action`               | token          | `[NEW]` accepts an `Action`, returns the new state  |
| `GET`  | `/assets/*`                 | none           | Embedded JS/CSS/fonts                               |
| `GET`  | `/buzzer.mp3`               | none           | Bundled or user-selected buzzer audio               |

Removed: `POST /test/update-scores` `[NEW]` — a debug endpoint that let anyone randomize
a live match.

### 5.1 `/value/:property`

Valid properties: every `ScoreboardState` field except `eventLogo` and `revision`.
Unknown property → `404`. `timer` is formatted `MM:SS`; everything else is stringified.
The page is transparent, white, `48px`, bold, centred, and updates over WebSocket.
`[PARITY]`

### 5.2 CORS

`tower_http::cors::CorsLayer` — `allow_origin(Any)`, methods `GET, POST`, headers
`Content-Type, Authorization`. OBS Browser Source needs this. `[PARITY]`
Note that permissive CORS is acceptable **only** because writes require a token.

## 6. Control token `[NEW]`

**Threat:** the current `/control` page is unauthenticated on `0.0.0.0`. Anyone on the
venue Wi-Fi can rewrite the score mid-broadcast.

**Design:**

- On startup, generate 128 bits of randomness (`rand::rngs::OsRng`) and hex-encode →
  32 chars. Regenerated on every app start by default; optionally pinned in settings so
  the phone bookmark survives restarts.
- The desktop UI displays the control URL and a QR code; the raw token is masked behind
  the existing show/hide eye toggle.
- Accepted as `?t=<token>` on `GET /control`, then set as an `HttpOnly`, `SameSite=Strict`
  cookie so the token stops appearing in the address bar.
- The WS handler accepts the cookie or a `t` query param; connections without a valid
  token are **read-only**, not rejected — that keeps `/scoreboard` and third-party
  dashboards working with zero configuration.
- `POST /api/scoreboard` and `POST /api/action` require `Authorization: Bearer <token>`
  or the cookie.
- Compare with `subtle::ConstantTimeEq`. Never log the token.
- Settings toggle `requireControlToken` (default **on**) can disable it for trusted LANs.

## 7. Tauri commands (desktop IPC)

Naming: `<domain>_<verb>`. All return `Result<T, String>`; the frontend wrapper maps `Err`
to a thrown `Error`.

### 7.1 Core

| Command                   | Args                   | Returns           |
| ------------------------- | ---------------------- | ----------------- |
| `sb_get_state`            | —                      | `ScoreboardState` |
| `sb_dispatch`             | `action: Action`       | `ScoreboardState` |
| `server_get_info`         | —                      | `ServerInfo`      |
| `server_regenerate_token` | —                      | `ServerInfo`      |
| `settings_get`            | —                      | `Settings`        |
| `settings_set`            | `patch: SettingsPatch` | `Settings`        |

`sb_dispatch` is the **only** mutation command. `[NEW]` The Electron app has ~25 separate
mutation IPC channels plus a preload wrapper for each; one dispatch endpoint plus a typed
`Action` union replaces all of it.

```rust
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub running: bool,
    pub port: u16,
    pub addresses: Vec<LanAddress>,      // { name, address }
    pub scoreboard_url: String,          // http://<lan-ip>:<port>/scoreboard
    pub control_url: String,             // http://<lan-ip>:<port>/control?t=...
    pub control_qr_svg: String,          // inline SVG of control_url
    pub token_required: bool,
}
```

### 7.1.1 Live status `[NEW]`

The main window's status bar needs cheap, frequently-changing counters that do not belong
in `ServerInfo` (which contains a QR SVG and is expensive to re-emit).

| Command             | Args | Returns        |
| ------------------- | ---- | -------------- |
| `server_get_status` | —    | `ServerStatus` |

```rust
#[derive(Serialize, Clone, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub ws_clients: u32,          // currently connected WebSocket clients
    pub authorized_clients: u32,  // of which may send commands
    pub overlay_active: bool,     // [OPTIONAL]
    pub recording_active: bool,   // [OPTIONAL]
    pub recording_seconds: u64,   // [OPTIONAL]
}
```

Emitted as `server:status` whenever it changes, coalesced to at most 2 Hz. The WS handler
increments/decrements an `AtomicU32` on connect/disconnect.

### 7.1.2 Window management `[NEW]`

| Command        | Args               | Returns             | Notes                                    |
| -------------- | ------------------ | ------------------- | ---------------------------------------- |
| `window_open`  | `which: AppWindow` | `()`                | Creates or focuses the singleton window  |
| `window_close` | `which: AppWindow` | `()`                | Closes it if open; no-op otherwise       |
| `window_list`  | —                  | `Vec<AppWindow>`    | Currently open feature windows           |

```rust
#[derive(Serialize, Deserialize, Clone, Copy, TS)]
#[serde(rename_all = "kebab-case")]
pub enum AppWindow { Settings, Outputs, Recording, VideoGenerator, About }
```

The native menu calls the same functions, so a menu item and an in-app button cannot
diverge. See doc 01 §9.

### 7.2 Buzzer

| Command               | Args | Returns                                              |
| --------------------- | ---- | ---------------------------------------------------- |
| `buzzer_get_track`    | —    | `{ path: Option<String>, fileName: Option<String> }` |
| `buzzer_select_track` | —    | same, after a file dialog                            |
| `buzzer_clear_track`  | —    | `()`                                                 |

`[NEW]` Audio bytes are **not** shipped over IPC any more. The Electron version returns a
`Uint8Array` for every load. Instead, expose the file through Tauri's asset protocol:
`convertFileSrc(path)` → `<audio src=...>`. Add the audio file's parent directory to the
`assetProtocol` scope when the user selects it.

### 7.3 Optional command groups

Overlay (doc 05) and Recording/Video (doc 06) add `overlay_*`, `hotkeys_*`, `recording_*`
and `video_*`. They are listed in their own documents so v1 can ignore them.

## 8. Tauri events (Rust → webviews)

| Event                               | Payload              | Target                              |
| ----------------------------------- | -------------------- | ----------------------------------- |
| `state:changed`                     | `ScoreboardState`    | all windows                         |
| `timer:finished`                    | —                    | all windows                         |
| `buzzer:play`                       | —                    | `main` only                         |
| `server:info`                       | `ServerInfo`         | all windows                         |
| `server:status`                     | `ServerStatus`       | all windows `[NEW]`                 |
| `settings:changed`                  | `Settings`           | all windows                         |
| `window:opened` / `window:closed`   | `AppWindow`          | all windows `[NEW]`                 |
| `overlay:opened` / `overlay:closed` | —                    | `main` `[OPTIONAL]`                 |
| `hotkey:action`                     | `Action`             | focused control window `[OPTIONAL]` |
| `recording:status`                  | `RecordingStatus`    | all windows `[OPTIONAL]`            |
| `video:progress`                    | `GenerationProgress` | `video-generator` `[OPTIONAL]`      |

Removed vs Electron: `reset-overlay-state`, `surrender-timer-control`,
`receive-timer-control`, `request-hotkeys`, `hotkey-update`, `hotkey-enabled-update`,
`overlay-windows-opened/closed` collapse into `overlay:opened`/`overlay:closed`.

## 9. Settings schema

Persisted as JSON at `app_config_dir()/settings.json`.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub schema_version: u32,             // 1
    pub server_port: u16,                // 3001
    pub require_control_token: bool,     // true
    pub pinned_control_token: Option<String>,
    pub buzzer_track_path: Option<String>,
    pub buzzer_auto_play: bool,          // true
    pub half_prefix: String,             // "PERIODO"
    pub team_home_name: String,          // "HOME"
    pub team_away_name: String,
    pub team_home_color: String,
    pub team_away_color: String,
    pub timer_loadouts: [u32; 3],        // [900, 2700, 1200]
    pub window_geometry: BTreeMap<String, WindowGeometry>,  // keyed by window label
    pub hotkeys: HotkeyMap,              // [OPTIONAL]
    pub hotkeys_enabled: bool,           // [OPTIONAL]
    pub recording_output_dir: Option<String>,  // [OPTIONAL]
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry { pub x: i32, pub y: i32, pub width: u32, pub height: u32 }
```

`[NEW]` Three changes worth noting:

1. **Team/colour/prefix/loadout settings are persisted.** The Electron app forgets them
   on restart, so the operator retypes them before every match.
2. **Window geometry is persisted per label**, saved on `WindowEvent::Moved`/`Resized`
   (debounced) and restored on open. With several feature windows the operator now has a
   layout worth preserving. Clamp restored positions to a visible monitor, or a window
   from a disconnected second screen becomes unreachable.
3. **Hotkeys move from `localStorage` to `settings.json`.** In the Electron app they live
   in the renderer's persisted Zustand store and are pushed to the main process on every
   change via `notifyHotkeyUpdate`; on cold start the main process has no hotkeys until a
   renderer tells it. Storing them in Rust removes that startup race.

`schema_version` + a `migrate()` function: unknown/missing fields fall back to defaults
(`#[serde(default)]`), and a corrupt file is renamed to `settings.corrupt-<ts>.json`
rather than silently discarded. `[NEW]`

## 10. Optional-feature types

`ScoreboardSnapshot`, `RecordingManifest`, `RecordingStatus`, `VideoGenerationConfig`,
`GenerationProgress` are specified in doc 06.
