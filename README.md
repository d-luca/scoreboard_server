# Scoreboard Server

A desktop scoreboard for sports streams. One app runs the show: it serves a
transparent scoreboard page that OBS (or any browser source) renders, and a
protected remote-control page that any phone on the same network can use.

Built with Tauri 2 (Rust + React/TypeScript). No cloud, no account — everything
stays on your local network.

## Features

- Match operation from the main window: scores, halves, timer with loadouts,
  buzzer at 00:00.
- **OBS overlay**: transparent 600×80 page at `http://<your-ip>:3001/scoreboard`,
  updates in ~50 ms, reconnects automatically.
- **Phone remote**: scan the QR code in the app, or open
  `http://<your-ip>:3001/control?t=<token>`. Token-protected; token can be
  regenerated at any time.
- **Value endpoint**: `http://<your-ip>:3001/value/timer` (or any other field)
  for ticker-style widgets, formatted `MM:SS`.
- HTTP API and WebSocket for integrations (see below).
- **Match recording**: one `.sbrec` snapshot per second, crash-safe,
  append-only.
- **Video generation**: turn a recording into a transparent WebM (VP9 with
  alpha) for OBS stingers, highlights or analysis.
- Settings (team names, colours, prefix, loadouts, port, buzzer) persist across
  restarts.

## Install

### Windows

Download `Scoreboard Server_x.y.z_x64-setup.exe` (NSIS) or the `.msi` from the
[latest release](../../releases/latest) and run it.

- **SmartScreen**: the installer is not code-signed, so Windows may warn
  _"Windows protected your PC"_. Click **More info → Run anyway**.
- **Firewall**: on first launch, Windows Firewall asks for network access.
  Choose **Private networks** and allow it — the app explains this in a first-run
  dialog. Without it, OBS and phones on your LAN cannot connect.

### Linux

Download the `.AppImage` (portable, mark executable and run) or install the
`.deb`:

```bash
sudo apt install ./scoreboard-server_x.y.z_amd64.deb
```

The AppImage needs the system `libwebkit2gtk-4.1` package (present by default
on Ubuntu 22.04+).

## Quick start

1. Launch **Scoreboard Server**. The status bar at the bottom shows the server
   badge go green with the bound port (default `3001`).
2. Operate the match from the main window: `+`/`-` on scores, half control,
   timer start/pause/stop, loadouts, reset.
3. Open **Tools → Outputs & Sharing** for the OBS URL, LAN addresses, the
   remote QR code and the access token.

## OBS setup

1. In OBS, add a **Browser Source**.
2. URL: `http://<scoreboard-pc-ip>:3001/scoreboard` (the exact URL is shown in
   the Outputs window).
3. Width **600**, height **80**. The page background is transparent.
4. Leave _Shutdown source when not visible_ **off** and _Refresh browser when
   scene becomes active_ on if you like — the page reconnects by itself.

### Ticker / single-value sources

`http://<scoreboard-pc-ip>:3001/value/timer` returns plain text
(`MM:SS` for the timer). Any field of the scoreboard state works:
`teamHomeScore`, `teamAwayScore`, `half`, `teamHomeName`, …

## Phone remote

1. Connect the phone to the same network as the scoreboard PC.
2. In the app, open **Tools → Outputs & Sharing** and scan the QR code, or copy
   the control link.
3. The remote mirrors the desktop controls; multiple phones and OBS stay in
   sync. The token can be regenerated from the same window (this invalidates
   old links), or the token requirement can be relaxed in
   **Settings → Server** for trusted networks.

## Match recording & video

**Tools → Recording…** starts a match recording: the full scoreboard state is
appended to a `.sbrec` file once per second (append-only, so a crash loses at
most the last second). Closing the recording window never stops the recording —
the REC badge in the main status bar keeps counting. Recordings land in
`Documents/ScoreboardRecordings` (configurable in the recording window), and
legacy `.json` recordings from the Electron app still open.

**Tools → Video Generator…** (or the recording window's
_Generate Video from Recording…_) replays a recording into a WebM video:
each second is re-drawn on an offscreen canvas and encoded as VP9 with a
preserved alpha channel, so the result composites in OBS exactly like the live
scoreboard page. Frame rate (1–60) and scoreboard scale (0.5×–3×) are
adjustable. The encoder is a bundled ffmpeg; for development builds, install
ffmpeg and make sure it is on `PATH`.

## HTTP API

Base URL `http://<scoreboard-pc-ip>:3001`. CORS is open for GET/POST.

| Route                       | Method | Description                                     |
| --------------------------- | ------ | ----------------------------------------------- |
| `/health`                   | GET    | Liveness probe.                                 |
| `/api/scoreboard`           | GET    | Full scoreboard state (JSON).                   |
| `/api/scoreboard`           | POST   | Patch fields, e.g. `{"teamHomeScore": 3}`.      |
| `/api/scoreboard/:property` | GET    | One field.                                      |
| `/api/action`               | POST   | Named action, e.g. `{"action": "timerStart"}`.  |
| `/ws`                       | WS     | Live updates: initial state, then every change. |

`POST` routes and WS write commands require the access token
(`?t=<token>` or cookie) while the token policy is on.

## Settings & data

Settings (team identity, loadouts, port, buzzer, token policy) live in the
platform config directory (`%APPDATA%/dev.dluca.scoreboard-server` on Windows,
`~/.config/dev.dluca.scoreboard-server` on Linux). Deleting `settings.json`
restores defaults; a corrupt file is backed up aside and replaced with
defaults.

## Development

Prerequisites: Node ≥ 20, pnpm ≥ 9, Rust stable. On Debian/Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Common tasks:

| Command         | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `pnpm dev`      | Run the app (Vite dev server + Tauri).                          |
| `pnpm check`    | Full gate: ESLint, `tsc` + Vite build, clippy, Rust tests.      |
| `pnpm bindings` | Regenerate `src/bindings/` from the Rust types.                 |
| `pnpm build`    | Produce installer bundles (`src-tauri/target/release/bundle/`). |

### Releasing

Bump `version` in `src-tauri/tauri.conf.json`, `package.json` and
`src-tauri/Cargo.toml`, tag `vX.Y.Z`, push the tag. CI downloads the ffmpeg
sidecar (`scripts/fetch-ffmpeg.mjs`), builds the NSIS/MSI and AppImage/deb
bundles and attaches them to a draft GitHub Release. The manual release
checklist lives in `tauri-rebuild/07-BUILD-RELEASE.md` §9.

To make a local release build with the bundled ffmpeg:

```bash
node scripts/fetch-ffmpeg.mjs
# Windows:  $env:TAURI_CONFIG = '{"bundle":{"externalBin":["binaries/ffmpeg"]}}'
# Linux:    export TAURI_CONFIG='{"bundle":{"externalBin":["binaries/ffmpeg"]}}'
pnpm build
```

## Troubleshooting

**OBS or the phone cannot connect.** Check the Windows Firewall prompt (allow
_Private networks_), that both devices are on the same network, and that the
port in the status bar matches the URL you typed.

**The port is not 3001.** If 3001 is occupied, the server binds the next free
port and the UI shows the real one — always copy the URL from the Outputs
window.

**Blank window: "WebKit encountered an internal error" (Linux, Snap VS Code).**
If `pnpm dev` opens a window that only shows _"WebKit encountered an internal
error"_ and the backend console logs a `symbol lookup error` in
`/snap/core20/.../libpthread.so.0` from `WebKitNetworkProcess`, the window was
launched from a terminal inside the **Snap build of VS Code**. The Snap wrapper
injects its bundled GTK libraries (`GTK_PATH`, `GTK_EXE_PREFIX`,
`LD_LIBRARY_PATH`, …) into the terminal environment, and WebKit's helper
processes crash loading them.

`pnpm dev` runs [scripts/dev.mjs](scripts/dev.mjs), which restores the original
environment (VS Code keeps it in `*_VSCODE_SNAP_ORIG` variables) before starting
Tauri, so this should not happen from the integrated terminal. If you launch the
app some other way from a Snap terminal, use `pnpm dev:raw` only outside Snap
terminals, or run from a regular terminal emulator.

**`cargo test` fails with `STATUS_ENTRYPOINT_NOT_FOUND` (Windows).** The app
links `tauri-plugin-dialog` → `rfd`, which imports `TaskDialogIndirect` from
`comctl32.dll` — a function that only exists in Common Controls **v6**, and v6
is only activated when the binary embeds the app manifest. `tauri-build`
embeds that manifest into the app binary, but Cargo offers no way to pass
extra link arguments to the **library unit-test** binary, so `cargo test`
(all targets) crashes at process load with exit code `0xc0000139`. The
`export_bindings` test therefore lives in an integration test
([src-tauri/tests/export_bindings.rs](src-tauri/tests/export_bindings.rs)),
which _does_ receive the manifest (linked by `build.rs` via
`embed-resource`), and `pnpm bindings` runs it with `--test export_bindings`.
If you add unit tests that must run on Windows, put them in `src-tauri/tests/`
rather than `#[cfg(test)]` modules inside `src/`, or run specific targets
with `cargo test --test <name>` / `cargo test --bin scoreboard_server`.
