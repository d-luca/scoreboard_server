# 07 — Build, Packaging & Release

Targets: **Windows** (NSIS + MSI) and **Linux** (AppImage + deb).

## 1. Toolchain

| Tool      | Version                                           |
| --------- | ------------------------------------------------- |
| Rust      | stable, ≥ 1.77 (`rustup default stable`)          |
| Node      | ≥ 20                                              |
| pnpm      | ≥ 9                                               |
| Tauri CLI | `@tauri-apps/cli` v2 (dev dependency, not global) |

**Windows prerequisites**

- Microsoft C++ Build Tools (MSVC toolchain)
- WebView2 Runtime — present on Windows 11 and modern Windows 10; the installer can embed
  a bootstrapper (see §4.1)

**Linux prerequisites** (Debian/Ubuntu)

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Fedora/Arch equivalents are listed in the Tauri prerequisites page.

`[RISK]` Linux builds are **not portable across distro versions** — an AppImage built on
Ubuntu 24.04 (webkit2gtk-4.1) will not run on 20.04. Build on the oldest distro you intend
to support, in a container.

## 2. Scripts

```jsonc
// package.json
{
	"scripts": {
		"dev": "tauri dev",
		"build": "tauri build",
		"build:debug": "tauri build --debug",
		"vite:dev": "vite",
		"vite:build": "tsc --noEmit && vite build",
		"bindings": "cargo test --manifest-path src-tauri/Cargo.toml export_bindings",
		"lint": "eslint .",
		"format": "prettier --write .",
		"rust:fmt": "cargo fmt --manifest-path src-tauri/Cargo.toml",
		"rust:clippy": "cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings",
		"rust:test": "cargo test --manifest-path src-tauri/Cargo.toml",
		"check": "pnpm lint && pnpm vite:build && pnpm rust:clippy && pnpm rust:test",
	},
}
```

## 3. `tauri.conf.json`

```jsonc
{
	"$schema": "https://schema.tauri.app/config/2",
	"productName": "Scoreboard Server",
	"version": "1.0.0",
	"identifier": "dev.dluca.scoreboard-server",
	"build": {
		"beforeDevCommand": "pnpm bindings && pnpm vite:dev",
		"beforeBuildCommand": "pnpm bindings && pnpm vite:build",
		"devUrl": "http://localhost:5173",
		"frontendDist": "../dist",
	},
	"app": {
		"windows": [
			{
				"label": "main",
				"title": "Scoreboard Server",
				"width": 720,
				"height": 560,
				"minWidth": 640,
				"minHeight": 480,
				"resizable": true,
				"visible": false,
				"maximized": false,
			},
		],
		"security": {
			"csp": "default-src 'self'; img-src 'self' asset: http://asset.localhost data:; media-src 'self' asset: http://asset.localhost; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost ws://localhost:* http://localhost:*",
			"assetProtocol": { "enable": true, "scope": [] },
		},
	},
	"bundle": {
		"active": true,
		"targets": ["nsis", "msi", "appimage", "deb"],
		"icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico", "icons/icon.png"],
		"resources": ["resources/buzzer.mp3"],
		"externalBin": ["binaries/ffmpeg"],
		"windows": {
			"webviewInstallMode": { "type": "downloadBootstrapper" },
			"nsis": { "installMode": "perMachine" },
		},
		"linux": {
			"deb": { "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"] },
		},
	},
}
```

Notes:

- `visible: false` + show on ready avoids the white flash. Show it from the `setup` hook,
  after `main_window.set_menu(menu)` — so the menu bar is never seen popping in.
- `main` is the **only** window declared in the config. `settings`, `outputs`,
  `recording`, `video-generator`, `about` and the overlays are all created at runtime by
  `windows.rs` (doc 03 §7bis) because their existence depends on menu actions and on which
  Cargo features were compiled in.
- The main window is small on purpose: it holds the controls and the status bar only
  (doc 00 §3.1). Do not re-add `maximized: true`.
- Window geometry for `main` and for every feature window is persisted in `settings.json`
  (doc 02 §9) and restored on next open, so the config values are first-run defaults only.
- `assetProtocol.scope` starts empty; the buzzer directory is added at runtime when the
  user picks a file (`app.asset_protocol_scope().allow_file(path)`).
- `externalBin` is only needed with the video feature; drop it in v1.
- `[RISK]` The CSP above must permit the WebSocket the `/control` page uses — but that
  page runs in a browser, not in the webview, so it is unaffected by this CSP. The webview
  itself only needs `ipc:` and the localhost preview iframe.

## 4. Platform specifics

### 4.1 Windows

- **WebView2**: `downloadBootstrapper` keeps the installer small (~3 MB) but needs
  internet on first install. For offline venues use `embedBootstrapper` or
  `fixedRuntime` (adds ~120 MB). Given this app is used at sports venues with unreliable
  Wi-Fi, **`embedBootstrapper` is the safer default**.
- **Firewall**: the first `0.0.0.0` bind raises a prompt. Ship a first-run dialog
  explaining that "Private networks" must be allowed. Do not ship a script that adds a
  firewall rule silently.
- **Code signing**: unsigned installers trigger SmartScreen. Configure
  `bundle.windows.certificateThumbprint` + `signCommand` if you obtain a certificate;
  otherwise document the SmartScreen "More info → Run anyway" path in the README.
- Installer artifacts land in `src-tauri/target/release/bundle/nsis|msi`.

### 4.2 Linux

- AppImage is the portable option; deb for Debian/Ubuntu.
- Transparent overlay windows need a compositor (see doc 05 §2 / doc 01 §7).
- Global shortcuts do not work on Wayland (doc 05 §5.4).
- `[RISK]` AppImage does not bundle `libwebkit2gtk`. Users on very old distros will need
  the system package.

## 5. Sidecar binaries `[OPTIONAL]`

ffmpeg must be named with the exact target triple:

```
src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu
```

Get the triple with `rustc -vV | grep host`. Use LGPL builds (BtbN or johnvansickle) and
verify VP9 support: `ffmpeg -codecs | grep vp9`. Ship the licence text in the bundle and
credit ffmpeg in the About section.

`[RISK]` A full ffmpeg build is 70–100 MB and dominates the bundle size. Consider making
the video feature a separate optional download, or use a minimal build compiled with only
`libvpx`, `webm` muxer and `rawvideo` demuxer (~15 MB).

## 6. Versioning & release

- Single source of version: `tauri.conf.json`. Read it in CI; keep `package.json` and
  `Cargo.toml` in sync with a small script.
- Tag `vX.Y.Z` → CI builds Windows and Linux artifacts → GitHub Release.
- `[NEW]` Optional: `tauri-plugin-updater` with a signed `latest.json`. Requires a keypair
  (`tauri signer generate`) and the public key in `tauri.conf.json`. Only add this once
  releases are signed and stable — a broken updater is worse than no updater.

## 7. CI (GitHub Actions sketch)

```yaml
name: build
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
        with: { components: rustfmt, clippy }
      - uses: swatinem/rust-cache@v2
        with: { workspaces: "src-tauri -> target" }
      - run: sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev
      - run: pnpm install --frozen-lockfile
      - run: pnpm bindings
      - run: git diff --exit-code src/bindings # bindings must be committed and current
      - run: pnpm check

  bundle:
    needs: check
    strategy:
      matrix:
        include:
          - { os: windows-latest, args: "" }
          - { os: ubuntu-22.04, args: "" }
    runs-on: ${{ matrix.os }}
    steps:
      # ... same setup ...
      - uses: tauri-apps/tauri-action@v0
        env: { GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
        with:
          tagName: v__VERSION__
          releaseName: "Scoreboard Server v__VERSION__"
          releaseDraft: true
          args: ${{ matrix.args }}
```

Additional CI gates worth having:

- `grep -L "__TAURI__" dist/assets/scoreboard-*.js` — the OBS bundle must be Tauri-free.
- `cargo deny check` for licence/advisory hygiene, given the ffmpeg sidecar.

## 8. Expected artifact sizes

| Artifact       | Without video feature | With bundled ffmpeg |
| -------------- | --------------------- | ------------------- |
| Windows NSIS   | ~8–12 MB              | ~90–110 MB          |
| Linux AppImage | ~15–25 MB             | ~100–125 MB         |

Electron equivalent today: ~150 MB per platform.

## 9. Manual release checklist

1. `pnpm check` passes.
2. Version bumped in `tauri.conf.json`, `package.json`, `Cargo.toml`.
3. Fresh-install test on a clean Windows VM: server starts, firewall prompt appears,
   `/scoreboard` renders in OBS, `/control` works from a phone with the token.
4. Every menu entry opens its window once, focuses it on a second invocation, and every
   accelerator fires (`Ctrl+,`, `Ctrl+O`, `Ctrl+R`, `F9`, zoom).
5. Window geometry survives a quit/restart cycle; a window saved on a disconnected second
   monitor still opens on screen.
6. Timer accuracy: run 10 minutes against a stopwatch, drift < 1 s.
7. Overlay mode `[OPTIONAL]`: windows appear with no menu bar, global hotkeys fire, no
   leftovers on quit.
8. Recording + generation `[OPTIONAL]`: short match end-to-end, output has alpha.
9. Uninstall leaves no stray processes and no leftover firewall rules.
