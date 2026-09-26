# Testing

## Automated

| Command          | What it runs                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm check`     | ESLint, `tsc --noEmit` + Vite build, clippy with `-D warnings`, `cargo test`. Run it before every commit. |
| `pnpm rust:test` | Rust unit and integration tests only.                                                                     |
| `pnpm bindings`  | Regenerates `src/bindings/` via the ignored `export_bindings` test, then formats them.                    |

CI (`.github/workflows/build.yml`) additionally fails when:

- `src/bindings/` differs after `pnpm bindings` (generated types must be committed);
- the scoreboard or control bundles contain `__TAURI__` (LAN bundles must not import
  Tauri).

### Rust test coverage

| Area                                                | Location                                                    |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Validation, clamping, patches, reset                | `src/state.rs`                                              |
| Timer engine (both directions, finish, set, adjust) | `src/timer.rs`                                              |
| Presets CRUD, apply, file integrity                 | `src/presets.rs`                                            |
| Recording timeline and files                        | `src/recording.rs`                                          |
| Video job state                                     | `src/video.rs`                                              |
| Settings load/save                                  | `src/settings.rs`                                           |
| Window geometry                                     | `src/windows.rs`                                            |
| LAN address detection                               | `src/net.rs`                                                |
| HTTP routes, `/value`, CORS, auth                   | `src/server/mod.rs`, `routes.rs`, `auth.rs`                 |
| WS auth, revocation, rate limit                     | `src/server/ws.rs`                                          |
| Binding export                                      | `tests/export_bindings.rs`                                  |
| Video generation end to end                         | `tests/video_generation.rs` (skips when no ffmpeg is found) |

The two integration tests live in `tests/` so that the Windows manifest from `build.rs` is
linked in; see [pitfalls.md](pitfalls.md#platform).

### Smoke scripts

Run the axum stack without the Tauri shell, then the scripts against it:

```bash
cargo run --manifest-path src-tauri/Cargo.toml --example serve
# prints: control: http://<lan-ip>:3001/control?t=<token>
node scripts/ws-smoke.mjs "<control URL>"        # auth, fan-out, ping, 1003, 1008
node scripts/ws-timer-smoke.mjs "<control URL>"  # 3 s countdown, ticks, timer-finished
```

The scripts accept the control URL or the bare token (also via `SB_TOKEN`); the port is
taken from the URL, else `SB_PORT`, else 3001. Both exit non-zero on failure. The token
changes on every `serve` start.

## Definition of done

- `pnpm check` passes (clippy clean, tests pass, tsc and ESLint clean).
- Bindings regenerated and committed if a Rust type changed.
- No `console.log`, `dbg!` or `println!` left behind; use `tracing` in Rust.
- New windows are listed in `capabilities/default.json`.
- Verified on Windows and Linux when touching windows, menus, paths or ffmpeg.
- Docs in `docs/` updated.

## Manual regression checklist

Run before a release (see [build-release.md](build-release.md#release-checklist)).

### Match state

- [ ] Scores never go below 0; half never below 1.
- [ ] Stop zeroes the timer; Pause keeps the value.
- [ ] Reset clears scores, half and timer but keeps team names, colours, prefix and
      loadouts.
- [ ] In countdown, a timer at 0 disables Start and Reset.
- [ ] Defaults: loadouts 900 / 2700 / 1200 s, half prefix `PERIODO`, colours `#00ff00` /
      `#ff0000`.
- [ ] Hotkeys are ignored while typing in a field.

### Outputs

- [ ] `/scoreboard` renders at 600×80 and updates live in OBS.
- [ ] `/value?property=timer` returns `MM:SS`; unknown properties return 404.
- [ ] CORS headers are present on `/value` and the API.
- [ ] LAN addresses are hidden by default.

### LAN remote

- [ ] `/control?t=…` sets the cookie and redirects to `/control`.
- [ ] Regenerating the token revokes connected remotes.
- [ ] A focused input is not overwritten by incoming state.
- [ ] Buttons are at least 48 px tall, inputs at least 44 px.
- [ ] The buzzer plays on iOS after the first tap.

### Presets

- [ ] Create, rename and delete team and match presets; deleting a referenced team fails.
- [ ] Loading a fixture sets both team names and colours, leaves score, half and timer
      untouched, and survives a restart and a Reset.
- [ ] The `Presets` menu updates after every change.

### Recording and video

- [ ] Recording starts at `t = 0` and writes a snapshot every second.
- [ ] Stopping lists the recording under recent recordings.
- [ ] Generated video is 622×80, keeps alpha in OBS, and matches the live scoreboard.
- [ ] Cancelling a generation kills ffmpeg and removes the partial file.

### Windows

- [ ] Every feature window is a singleton: opening it again focuses it.
- [ ] Window size, position and zoom are restored after a restart, including on HiDPI.
- [ ] Menu accelerators work; `Ctrl+R` opens Recording in release builds only.
