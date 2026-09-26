# Pitfalls

Known traps, and the reasons behind code that looks odd. Add an entry when you hit a new
one.

## Rust / Tauri

- **Never hold a lock across `publish()` / `app.emit()`.** Clone the snapshot, drop the
  guard, then emit. A listener that re-enters a command deadlocks the app.
- **Lock order is scoreboard → timer engine.** The tick task must release the engine lock
  before publishing (see [timer.md](timer.md)).
- **`timer` in a patch goes through `TimerSet`**, and `timerDirection` in a settings patch
  through `TimerSetDirection`; writing either directly desyncs the engine.
- **Handle `RecvError::Lagged`** on the broadcast channel by sending a full state, not by
  dropping the client.
- **Menu: `main_window.set_menu`, never `app.set_menu`.** On Windows/Linux menus are
  per-window; an app-wide menu would give every window (including future frameless
  overlays) a menu bar.
- **Menu rebuilds must run on the main thread** (`run_on_main_thread`), and are debounced.
- **Menu labels: escape `&` as `&&`**, or it becomes a mnemonic and disappears.
- **`Ctrl+R` shadows reload** in dev webviews, so the Recording accelerator is only set in
  release builds.
- **No native accelerators for `Ctrl+1/2/3`**: a native accelerator would bypass the
  webview's "ignore while typing in a field" guard.
- **Every window that calls `invoke` must be in `capabilities/default.json`.** A missing
  label makes every command fail silently from that window.
- **`rust-embed` needs `dist/`** to exist even for `cargo build` / `cargo test`;
  `dist/.gitkeep` is committed for that.
- **HiDPI geometry**: Tauri reports physical pixels. Geometry is saved with the scale
  factor and restored as a logical size, and positions are clamped to a visible monitor.
- **Validation is shared, never copied.** Presets call `state::validate_name` /
  `validate_color`; a divergent copy could store values that later fail to load.
- **Presets file integrity is checked on load**: dangling team references are dropped.

## Server / LAN

- **Display IPv4 URLs.** `localhost` may resolve to IPv6 on some systems while the server
  listens on `0.0.0.0`.
- **Permissive CORS is only safe because writes need the token.** Do not add
  unauthenticated write endpoints.
- **Never log the control token.** Code passes an authorization _generation_ around
  instead.
- **Rate-limit close frames need a flush**: the WS handler sleeps briefly after sending
  the close frame, or the peer sees an abnormal 1006 close.
- **The Outputs preview iframe connects with `?internal=1`**, so it is not counted as a
  LAN client. New in-app embeds must do the same (`WsTransport` handles iframes).

## Frontend

- **LAN bundles must not import `@tauri-apps/*`** — they throw in OBS and phone browsers.
  ESLint and a CI grep enforce it.
- **Fonts must be embedded and preloaded**, or OBS renders fallback fonts on machines
  without Anton/Poppins, and the first video frames use the wrong face.
- **iOS Safari blocks audio until a user gesture**: the remote must arm the buzzer on the
  first tap.
- **Remote inputs must not be overwritten while focused**, or typing on the phone fights
  incoming state frames.
- **The canvas renderer duplicates the scoreboard spec.** Change
  `scoreboardGeometry.ts`, the components and `renderScoreboardToCanvas.ts` together.
- **Pass binary data as the sole `invoke` argument.** A `Uint8Array` nested inside an
  args object is serialized as a JSON number array.

## Video

- **VP9 alpha needs `-pix_fmt yuva420p` and `-auto-alt-ref 0`.** Drop either and the
  output is silently opaque.
- **VP9 needs even dimensions.** Frame sizes are rounded to even numbers.
- **Drain ffmpeg's stdout continuously** (`-progress pipe:1`) or the encoder deadlocks.
- **Never block on `wait()` while holding the child mutex**; cancel must always be able to
  kill ffmpeg.
- **First snapshot is at +1 s with `t = 0`.** Changing this shifts every generated video.

## Platform

- **Windows firewall** prompts on the first `0.0.0.0` bind; "Private networks" must be
  allowed or LAN clients cannot connect.
- **Windows `STATUS_ENTRYPOINT_NOT_FOUND` when running Rust tests** — see the
  [development troubleshooting](#development-troubleshooting) below.
- **Transparent windows on Linux need a compositor**; otherwise they render black.
- **Wayland blocks global shortcuts** (relevant for the planned overlay).
- **VS Code installed as a Snap** leaks GTK/`LD_LIBRARY_PATH` variables into its terminal,
  and WebKitGTK then crashes with `undefined symbol: __libc_pthread_init`. `pnpm dev`
  (`scripts/dev.mjs`) restores the original environment; `pnpm dev:raw` does not.
- **Linux bundles are not portable to older distros**; build on the oldest supported one
  (Ubuntu 22.04 in CI).

## Development troubleshooting

### Blank window / WebKit error in Snap VS Code

If a development build opens a window that only shows _"WebKit encountered an
internal error"_ and the backend console logs a `symbol lookup error` in
`/snap/core20/.../libpthread.so.0` from `WebKitNetworkProcess`, the window was
launched from a terminal inside the **Snap build of VS Code**. The Snap wrapper
injects its bundled GTK libraries (`GTK_PATH`, `GTK_EXE_PREFIX`,
`LD_LIBRARY_PATH`, …) into the terminal environment, and WebKit's helper
processes crash loading them.

`pnpm dev` runs [scripts/dev.mjs](../scripts/dev.mjs), which restores the original
environment (VS Code keeps it in `*_VSCODE_SNAP_ORIG` variables) before starting
Tauri, so this should not happen from the integrated terminal. If you launch the
app some other way from a Snap terminal, use `pnpm dev:raw` only outside Snap
terminals, or run from a regular terminal emulator.

### Windows Rust tests fail with STATUS_ENTRYPOINT_NOT_FOUND

The app links `tauri-plugin-dialog` → `rfd`, which imports `TaskDialogIndirect`
from `comctl32.dll`, a function that only exists in Common Controls **v6**. That
version is only activated when the binary embeds the app manifest. `tauri-build`
embeds that manifest into the app binary, but Cargo offers no way to pass
extra link arguments to the **library unit-test** binary, so `cargo test`
(all targets) crashes at process load with exit code `0xc0000139`.

The `export_bindings` test therefore lives in an integration test
([src-tauri/tests/export_bindings.rs](../src-tauri/tests/export_bindings.rs)),
which _does_ receive the manifest (linked by `build.rs` via
`embed-resource`), and `pnpm bindings` runs it with `--test export_bindings`.
If you add unit tests that must run on Windows, put them in `src-tauri/tests/`
rather than `#[cfg(test)]` modules inside `src/`, or run specific targets
with `cargo test --test <name>` / `cargo test --bin scoreboard_server`.
