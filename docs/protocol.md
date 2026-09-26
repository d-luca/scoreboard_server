# Protocol and API reference

Everything that crosses a process or network boundary. The types are generated from Rust
into [`src/bindings/`](../src/bindings/) — treat those files as the schema. Rust sources:
[state.rs](../src-tauri/src/state.rs), [server/](../src-tauri/src/server/),
[lib.rs](../src-tauri/src/lib.rs).

## Type generation

Contract types derive `ts_rs::TS` and are exported by the ignored integration test
[`tests/export_bindings.rs`](../src-tauri/tests/export_bindings.rs):

```bash
pnpm bindings   # cargo test ... --test export_bindings -- --ignored, then prettier
```

The output is committed. CI regenerates it and fails on `git diff --exit-code src/bindings`,
so a Rust type change without regenerated bindings cannot land.

## Match state

[`ScoreboardState`](../src/bindings/ScoreboardState.ts) is the whole match: team names,
scores, colours, `timer` (seconds), `half`, `halfPrefix`, `isTimerRunning`,
`timerDirection`, the three loadouts, `eventLogo` (reserved, unused) and `revision`.

Defaults: `HOME` / `AWAY`, `#00ff00` / `#ff0000`, prefix `PERIODO`, loadouts
900 / 2700 / 1200 s, direction `down`.

Partial updates use [`ScoreboardPatch`](../src/bindings/ScoreboardPatch.ts)
(`deny_unknown_fields` — a typo is a 400 naming the field, not a silent no-op).

## Actions

One [`Action`](../src/bindings/Action.ts) enum drives desktop buttons, hotkeys, menu
items, WebSocket commands and `POST /api/action`. Serialized as
`{ "action": "<kebab-case>", "data": ... }`.

| Action                                     | Effect                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `patch`                                    | Merge validated fields; `timer` in a patch is routed to `timer-set`                                |
| `score-home-inc/dec`, `score-away-inc/dec` | ±1; never below 0                                                                                  |
| `half-inc` / `half-dec`                    | ±1; never below 1                                                                                  |
| `timer-start`                              | Countdown: no-op at 0 or when running. Count-up: starts from any value                             |
| `timer-pause`                              | Freeze, keep the value                                                                             |
| `timer-stop`                               | Freeze **and** set the timer to 0                                                                  |
| `timer-set` `{seconds}`                    | Absolute value, capped at 99:59:59. Countdown: 0 while running pauses                              |
| `timer-adjust` `{delta}`                   | `timer + delta`, clamped at 0                                                                      |
| `timer-loadout` `{slot}`                   | Pause, then set to loadout 1/2/3 (resolved server-side)                                            |
| `timer-set-direction` `{direction}`        | Pause, keep the value, switch `down` ↔ `up`                                                        |
| `buzzer-play`                              | Emits `buzzer:play` to the main window; no state change                                            |
| `reset`                                    | Stop the timer; scores 0, half 1, timer 0. Names, colours, prefix, direction and loadouts are kept |

Timer details are in [timer.md](timer.md).

## WebSocket — `ws://<host>:<port>/ws`

All frames are JSON text with a `type` field. Implementation:
[server/ws.rs](../src-tauri/src/server/ws.rs).

**Server → client**

```jsonc
{ "type": "state", "data": { /* ScoreboardState */ } }        // on connect and after every mutation
{ "type": "authorization", "authorized": true }               // after the first state, and on token change
{ "type": "event", "event": "timer-finished" }
{ "type": "event", "event": "buzzer" }
{ "type": "event", "event": "score-animation", "enabled": false } // only when the setting flips
{ "type": "error", "code": "unauthorized" | "bad-request" | "rate-limited", "message": "..." }
```

**Client → server**

```jsonc
{ "type": "command", "action": "score-home-inc" }
{ "type": "command", "action": "timer-set", "data": { "seconds": 900 } }
{ "type": "ping" }
```

Rules:

- A full `state` frame is sent on connect and after every mutation from any source. No
  deltas — the payload is small and this removes a class of bugs.
- A lagging client is resynced with a fresh full state.
- Reading needs no token. **Commands need a valid token**; without one the client gets
  `error: unauthorized` and stays connected read-only. When the token is regenerated,
  already-authorized sockets are downgraded.
- `?internal=1` marks an in-app connection (the Outputs preview iframe; `WsTransport`
  sets it automatically inside an iframe). It is excluded from `ServerStatus.wsClients`.
- `score-animation` is not sent on connect; pages get the initial value from the page
  bootstrap (`window.__SCOREBOARD__.scoreAnimationEnabled`).
- Unparseable frame → `error: bad-request`, close `1003`.
- Rate limit: 30 commands/s per connection (token bucket). Excess → `error: rate-limited`,
  close `1008`.
- The server pings every 30 s; a failed send drops the connection.
- Clients ([`wsTransport.ts`](../src/lib/wsTransport.ts)) reconnect with jittered
  exponential backoff and resync from the first `state` frame.

## HTTP API

Router: [server/mod.rs](../src-tauri/src/server/mod.rs). Bound to `0.0.0.0`, default port
3001; if taken, the next ports are tried (up to 10 attempts).

| Method | Path                         | Auth         | Response                                                                |
| ------ | ---------------------------- | ------------ | ----------------------------------------------------------------------- |
| `GET`  | `/health`                    | —            | `{ "status": "ok", "version": "x.y.z", "port": 3001 }`                  |
| `GET`  | `/scoreboard`                | —            | OBS scoreboard page                                                     |
| `GET`  | `/value/{property}`          | —            | Single-value page                                                       |
| `GET`  | `/control`                   | `?t=<token>` | Phone remote; a valid `t` sets the cookie and redirects to `/control`   |
| `GET`  | `/api/scoreboard`            | —            | `ScoreboardState` JSON                                                  |
| `GET`  | `/api/scoreboard/{property}` | —            | `text/plain` scalar; `404` for unknown property                         |
| `POST` | `/api/scoreboard`            | token        | Body `ScoreboardPatch` → `{ "success": true, "data": ScoreboardState }` |
| `POST` | `/api/action`                | token        | Body `Action` → same response                                           |
| `GET`  | `/buzzer.mp3`                | —            | User-selected buzzer or the bundled default                             |
| `GET`  | anything else                | —            | Embedded `dist/` assets                                                 |

Errors: `401` without a valid token, `400` for invalid bodies (the message names the
offending field).

```bash
curl -X POST http://localhost:3001/api/action \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"action":"timer-start"}'
```

**`/value/{property}`** accepts every `ScoreboardState` field except `eventLogo` and
`revision`; unknown → `404`. `timer` is formatted `MM:SS`; everything else is stringified.
The page is transparent, white, 48 px, bold, centred, and live-updates over WebSocket.

**CORS** is open (`allow_origin(Any)`, `GET`/`POST`) for OBS and dashboards. That is
acceptable only because writes require the token.

**Page bootstrap.** Page routes inject `window.__SCOREBOARD__` (runtime config such as the
WS URL and `scoreAnimationEnabled`), so the same bundle works on any host and port
([server/assets.rs](../src-tauri/src/server/assets.rs)).

## Control token

Threat: the server listens on `0.0.0.0`; without protection anyone on the venue Wi-Fi
could change the score mid-broadcast. Implementation:
[server/auth.rs](../src-tauri/src/server/auth.rs).

- 128 bits from the OS RNG, hex-encoded (32 chars). Regenerated on every start unless
  `pinnedControlToken` is set, so a bookmarked phone link survives restarts.
- Presented as `?t=<token>`, `Authorization: Bearer <token>`, or the `sb_token` cookie
  (`HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`), checked in that order.
- Compared in constant time. Never logged — callers only see an authorization
  _generation_ number, used to revoke sockets after regeneration.
- The Outputs window shows the control URL and a QR code; the token is masked.
- `requireControlToken` (default on) can be turned off for trusted LANs; then every
  request is authorized.

## Tauri commands

All return `Result<T, String>`; the frontend `invoke` rejects with the message. Registered
in [lib.rs](../src-tauri/src/lib.rs).

| Group     | Commands                                                                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core      | `sb_get_state`, `sb_dispatch(action)` — the only scoreboard mutation command                                                                                                                                                  |
| Windows   | `window_open(which)`, `window_close(which)`, `window_list`, `startup_ready`                                                                                                                                                   |
| Server    | `server_get_info` → `ServerInfo`, `server_get_status` → `ServerStatus`, `server_regenerate_token`                                                                                                                             |
| Settings  | `settings_get`, `settings_set(patch: SettingsPatch)`                                                                                                                                                                          |
| Presets   | `presets_get`, `team_preset_create/update/delete`, `match_preset_create/update/delete`, `preset_load` — see [features/presets.md](features/presets.md)                                                                        |
| Buzzer    | `buzzer_get_track`, `buzzer_select_track` (file dialog), `buzzer_clear_track`                                                                                                                                                 |
| Recording | `recording_start`, `recording_stop`, `recording_status`, `recording_get_output_dir`, `recording_select_output_dir`, `recording_list_recent`                                                                                   |
| Video     | `video_load_recording`, `video_select_recording`, `video_select_output`, `video_generate`, `video_frames`, `video_push_frames`, `video_cancel`, `video_progress`, `video_open_with_recording`, `video_take_pending_recording` |

Recording and video commands are covered in
[features/recording-video.md](features/recording-video.md).

[`ServerInfo`](../src/bindings/ServerInfo.ts) carries LAN addresses, URLs and the QR SVG —
expensive, emitted rarely. [`ServerStatus`](../src/bindings/ServerStatus.ts) carries the
cheap live counters for the status bar (external and authorized WS clients, recording
state), coalesced to at most 2 Hz and emitted only on change.

Buzzer audio is never sent over IPC: the webview loads `convertFileSrc(path)` through the
asset protocol, whose scope is extended at runtime to the selected file.

## Tauri events

| Event                             | Payload              | Target            |
| --------------------------------- | -------------------- | ----------------- |
| `state:changed`                   | `ScoreboardState`    | all windows       |
| `timer:finished`                  | —                    | all windows       |
| `buzzer:play`                     | —                    | `main` only       |
| `server:info`                     | `ServerInfo`         | all windows       |
| `server:status`                   | `ServerStatus`       | all windows       |
| `settings:changed`                | `Settings`           | all windows       |
| `presets:changed`                 | `PresetLibrary`      | all windows       |
| `window:opened` / `window:closed` | `AppWindow`          | all windows       |
| `recording:status`                | `RecordingStatus`    | all windows       |
| `video:progress`                  | `GenerationProgress` | `video-generator` |

The main window decides buzzer playback: `buzzer:play` always plays; `timer:finished`
plays only when `buzzerAutoPlay` is on
([useBuzzerPlayback.ts](../src/lib/hooks/useBuzzerPlayback.ts)).

## Settings

[`Settings`](../src/bindings/Settings.ts), persisted in `settings.json` (see
[architecture.md](architecture.md#persistence)). Updated with
[`SettingsPatch`](../src/bindings/SettingsPatch.ts) through `settings_set`, which:

- validates with the same rules as `ScoreboardPatch`;
- mirrors identity, prefix and loadouts into the live scoreboard (bumping `revision`);
- routes `timerDirection` through `TimerSetDirection`;
- emits `settings:changed` so every open window updates;
- schedules a debounced save.

Window geometry and zoom are **not** in `Settings`; they live in `window-geometry.json`.
