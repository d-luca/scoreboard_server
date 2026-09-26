# Build, packaging and release

Targets: **Windows** (NSIS + MSI) and **Linux** (AppImage + deb).

## Toolchain

| Tool      | Version                                             |
| --------- | --------------------------------------------------- |
| Rust      | stable                                              |
| Node      | 20                                                  |
| pnpm      | 10 (`packageManager` in `package.json`)             |
| Tauri CLI | `@tauri-apps/cli` v2, a dev dependency (not global) |

**Windows:** Microsoft C++ Build Tools (MSVC) and the WebView2 runtime (bundled via
`embedBootstrapper`, see below).

**Linux (Debian/Ubuntu):**

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Linux builds are **not portable to older distros** (webkit2gtk versions): build on the
oldest distro you support. CI uses Ubuntu 22.04.

## Scripts

| Script                                        | What it does                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                    | `tauri dev` through [`scripts/dev.mjs`](../scripts/dev.mjs), which strips the Snap VS Code environment |
| `pnpm dev:raw`                                | Plain `tauri dev`                                                                                      |
| `pnpm build`                                  | Release bundles (`tauri build`); `build:debug` for a debug bundle                                      |
| `pnpm vite:dev` / `vite:build`                | Frontend only (`vite:build` runs `tsc --noEmit` first)                                                 |
| `pnpm bindings`                               | Regenerate `src/bindings/` from Rust (ts-rs), then prettier                                            |
| `pnpm lint`                                   | ESLint                                                                                                 |
| `pnpm rust:fmt` / `rust:clippy` / `rust:test` | cargo fmt / clippy `-D warnings` / cargo test                                                          |
| `pnpm check`                                  | `lint` + `vite:build` + `rust:clippy` + `rust:test` — the CI gate                                      |

`tauri.conf.json` runs `pnpm bindings` before `vite:dev` / `vite:build`, so dev and build
always use current types. The dev server is `http://localhost:1420/pages/`.

`rust-embed` compiles `dist/` into the binary (read from disk in debug builds), so
`cargo build` needs `dist/` to exist — `dist/.gitkeep` is committed.

WebSocket smoke tests against a running server: [`scripts/ws-smoke.mjs`](../scripts/ws-smoke.mjs),
[`scripts/ws-timer-smoke.mjs`](../scripts/ws-timer-smoke.mjs).

## Configuration notes

[`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json):

- `main` is the only declared window, `visible: false` until `startup_ready` (no white
  flash; the splash covers the gap). All other windows are created at runtime.
- Do not add `maximized: true` — the operator wants a small window next to OBS.
- The CSP allows `ipc:`, `asset:` and `localhost` HTTP/WS (the Outputs preview iframe).
  The LAN pages run in real browsers and are not affected by it.
- `assetProtocol.scope` starts empty; the buzzer file is allowed at runtime when selected.
- `bundle.windows.webviewInstallMode = embedBootstrapper` — works offline at venues with
  unreliable Wi-Fi; `downloadBootstrapper` would need internet on first install.
- `nsis.installMode = perMachine`; deb depends on `libwebkit2gtk-4.1-0`, `libgtk-3-0`.

## Platform specifics

**Windows**

- The first bind on `0.0.0.0` triggers a firewall prompt; the app shows a first-run
  notice (`firewallNoticeShown`) explaining that _Private networks_ must be allowed. Never
  add a firewall rule silently.
- Installers are unsigned, so SmartScreen warns ("More info → Run anyway"). To sign,
  configure `bundle.windows.certificateThumbprint` / `signCommand`.
- Artifacts: `src-tauri/target/release/bundle/{nsis,msi}`.

**Linux**

- AppImage is the portable option, deb for Debian/Ubuntu. AppImage does not bundle
  `libwebkit2gtk`; very old distros need the system package.

## ffmpeg sidecar

Needed only by the video generator. **Never committed** (`src-tauri/binaries/` is
git-ignored).

- [`scripts/fetch-ffmpeg.mjs`](../scripts/fetch-ffmpeg.mjs) `[target-triple]` downloads a
  static build with libvpx (Windows: gyan.dev essentials; Linux: johnvansickle amd64) to
  `src-tauri/binaries/ffmpeg-<target-triple>[.exe]`. Get the host triple with
  `rustc -vV | grep host`.
- The bundle job adds it with
  `TAURI_CONFIG='{"bundle":{"externalBin":["binaries/ffmpeg"]}}'`. It cannot live in the
  committed config because `externalBin` fails the build when the file is missing.
- At runtime `video.rs` looks for the bundled sidecar first, then `ffmpeg` on `PATH` — so
  dev builds just need a system ffmpeg.
- ffmpeg dominates the bundle size (tens of MB). Credit ffmpeg and ship its licence.

## CI

[`.github/workflows/build.yml`](../.github/workflows/build.yml), on every push, PR, `v*`
tag and manual dispatch.

**`check`** (Ubuntu and Windows):

1. `pnpm install --frozen-lockfile`
2. `pnpm bindings`, then `git diff --exit-code src/bindings` — bindings must be committed
   and current
3. `pnpm check`
4. Linux only: `! grep -l "__TAURI__" dist/assets/scoreboard-*.js dist/assets/control-*.js`
   — the OBS and phone bundles must be Tauri-free

**`bundle`** (after `check`, only on `v*` tags or manual dispatch; `windows-latest` and
`ubuntu-22.04`): fetch ffmpeg, then `tauri-apps/tauri-action` with the `TAURI_CONFIG` merge,
creating a **draft** GitHub Release named `Scoreboard Server <tag>`.

## Versioning and release

- Bump the version in **`src-tauri/tauri.conf.json`, `package.json` and
  `src-tauri/Cargo.toml`** together.
- Tag `vX.Y.Z` and push the tag → CI builds Windows and Linux bundles → draft release.
  Review and publish it manually.
- An auto-updater (`tauri-plugin-updater`) is intentionally not set up; it needs signed
  releases first.

## Release checklist

1. `pnpm check` passes; bindings are committed.
2. Version bumped in all three files.
3. Fresh install on a clean Windows VM: server starts, firewall prompt appears,
   `/scoreboard` renders in OBS, `/control` works from a phone with the token.
4. Every menu entry opens its window once and focuses it on a second invocation; every
   accelerator fires (`Ctrl+,`, `Ctrl+P`, `Ctrl+O`, `Ctrl+R`, zoom).
5. Window geometry survives a quit/restart; a window saved on a disconnected monitor
   still opens on screen.
6. Timer accuracy: 10 minutes against a stopwatch, drift < 1 s. Count-up too.
7. Presets: create, load from the menu, restart — the fixture is still loaded.
8. Recording + generation: a short match end-to-end; the WebM has alpha in OBS.
9. Run through the [manual regression checklist](testing.md#manual-regression-checklist).
