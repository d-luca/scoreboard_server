# Testing

## Automated

| Command          | What it runs                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm check`     | ESLint, Vitest, `tsc --noEmit` + Vite build, clippy with `-D warnings`, `cargo test`. Run it before every commit. |
| `pnpm test:unit` | Pure TypeScript tests in Node (Vitest); no browser or Tauri runtime.                                              |
| `pnpm rust:test` | Rust unit and integration tests only.                                                                             |
| `pnpm bindings`  | Regenerates `src/bindings/` via the ignored `export_bindings` test, then formats them.                            |

CI (`.github/workflows/build.yml`) additionally fails when:

- `src/bindings/` differs after `pnpm bindings` (generated types must be committed);
- the scoreboard or control bundles contain `__TAURI__` (LAN bundles must not import
  Tauri).

### Rust test coverage

| Area                                                          | Location                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| Validation, clamping, patches, reset                          | `src/state.rs`                                              |
| Timer engine (both directions, finish, set, adjust)           | `src/timer.rs`                                              |
| Presets CRUD, apply, file integrity                           | `src/presets.rs`                                            |
| Layout definition contracts and limits                        | `tests/layouts.rs`                                          |
| Layout persistence, publication, recovery and queue lifecycle | `src/layouts/service_tests.rs`, `src/layouts/storage.rs`    |
| Recording timeline and files                                  | `src/recording.rs`                                          |
| Video job state                                               | `src/video.rs`                                              |
| Settings load/save                                            | `src/settings.rs`                                           |
| Window geometry                                               | `src/windows.rs`                                            |
| LAN address detection                                         | `src/net.rs`                                                |
| HTTP routes, `/value`, CORS, auth                             | `src/server/mod.rs`, `routes.rs`, `auth.rs`                 |
| WS auth, revocation, rate limit                               | `src/server/ws.rs`                                          |
| Binding export                                                | `tests/export_bindings.rs`                                  |
| Video generation end to end                                   | `tests/video_generation.rs` (skips when no ffmpeg is found) |

The integration tests live in `tests/` so that the Windows manifest from `build.rs` is
linked in; see [pitfalls.md](pitfalls.md#platform).

Focused layout checks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib layouts
cargo test --manifest-path src-tauri/Cargo.toml --test layouts
```

P2 tests inject write, sync, replacement and backup failures, cancel a requester
after disk replacement, drain queued work at shutdown, and verify that publishing
revision 1 survives saving revision 2 and restarting. They also cover blocked
storage/recovery identity checks, bounded file reads and separation from match
state/public library exposure. Linux replacement of an existing file is covered;
Windows execution of the replacement/failure cases remains a platform check.

### Pure TypeScript layout coverage

The [layout resolver](../src/lib/layouts/resolveLayout.test.ts) and
[binding adapter](../src/lib/layouts/bindings.test.ts) tests share the approved
[fixtures](../src/lib/layouts/testFixtures.ts). They cover exact starter/nested
geometry, Row/Column alignment, equal fractional Fill, visibility/gaps, overflow
diagnostics, degenerate boxes, root-only clipping instructions, paint order,
full-frame/portrait dimensions, independent value/colour bindings and
live/sample/recorded equivalence. Timer cases retain the existing `MM:SS`
semantics through and beyond 3600 seconds. Dynamic rebinding preserves geometry
object identity; no DOM, font loading or IPC is involved.

```bash
pnpm test:unit src/lib/layouts/resolveLayout.test.ts src/lib/layouts/bindings.test.ts
pnpm exec tsc --project tsconfig.node.json --noEmit
```

The separate [Vitest configuration](../vitest.config.ts) avoids loading the app's
Vite/Tauri plugins and is included in the Node TypeScript project. Actual
live/canvas drawing, font/text measurements and pixel parity use the P4 checks
below rather than Node-only geometry tests.

### Custom layout renderer proof (P4)

The isolated [proof page](../scripts/layout-parity.html) uses the actual
[React renderer](../src/components/ScoreboardLayout/ScoreboardLayout.tsx) and
[Canvas2D renderer](../src/lib/layouts/renderLayoutToCanvas.ts) with the same
resolved/bound frame. It has no Tauri, match-state or editor dependencies and is
not a production Vite entry. Classic remains the production default.

```bash
pnpm test:unit src/lib/layouts
pnpm vite:dev
# Open http://localhost:1420/scripts/layout-parity.html
```

The [renderer fixtures](../src/lib/layouts/renderFixtures.ts) cover Blank,
starter, nested/hidden flow, overflow, degenerate content, full-frame/portrait,
every supported font weight, repeated spaces, empty/trailing static lines,
all nine alignment combinations, team-bound background/border/text colours,
alpha 0/0.5/1, both separator orientations, root-edge clipping and independent
score animations. Toggle sample/alternate values to include long names,
`OVERTIME`, `60:00` and scores 12/105.

Using a Playwright `page` supplied by browser automation, at DPR 1 / 100% zoom:

```js
const { checkLayoutParity } = await import("./scripts/layout-parity-check.mjs");
await page.goto("http://localhost:1420/scripts/layout-parity.html");
const report = await checkLayoutParity(page);
```

The helper captures the **actual live DOM** and canvas independently with
transparent backgrounds; it does not use Canvas2D to simulate the live renderer.
It returns all 24 fixture/input results and throws if dimensions differ or any
pixel lies outside the [one-pixel common-edge criterion](../src/lib/layouts/pixelParity.ts).
Comparison uses premultiplied RGBA (one channel unit for quantization); visible
differences must be within one device pixel of a transition in **both** images.
Interior colour/alpha differences and two-pixel shifts fail its
[focused tests](../src/lib/layouts/pixelParity.test.ts). Shared numerical
geometry/path/baseline tests remain mandatory: the raster tolerance is not
permission to move boxes or change bindings.

Also exercise:

- **Styles:** repeatedly increment home during a roll, then decrement.
  Home Rolling must retarget from the previous target; away None updates
  immediately without a transition. Ordinary oversized text stays visible.
- **Rolling-both:** update each score separately and together. Independent
  transition masks disappear when settled; only one root clip remains.
  Canvas updates immediately to the new static score during a live transition.
- Reload with `prefers-reduced-motion: reduce`: both Classic and custom scores
  remain static. Classic keeps its original markup/CSS when motion is enabled.
- Block a required font request (for example `Poppins-Black.ttf`) and reload:
  initialization shows an error and exposes no custom scene. Unblock/reload
  to recover; a fallback font is not an acceptable first frame.

Evidence on 2026-10-23: Linux Chromium 150 / Electron 43, HTTP proof page,
DPR 1, all 24 screenshot comparisons passed. Eighteen were pixel-identical;
degenerate, style and alignment fixtures had only permitted glyph-edge
rasterization differences. Rapid/directional/independent Rolling, reduced
motion, immediate static canvas changes and blocked font initialization also
passed.

**Outstanding platform gate:** repeat these checks in Windows WebView2 and
Linux WebKitGTK, and record engine versions/display scale. Chromium evidence
does not prove native-webview parity. P4 is implemented but that exit gate
must close before proceeding with P5.

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

The standalone server initializes layout persistence from `SB_LAYOUTS_PATH`, or
`scoreboard-server-smoke/layouts.json` under the system temporary directory by
default. It does not read the desktop app's private layout library implicitly.

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
- [ ] Reset clears scores, half and timer but keeps team names, colors, prefix and
      loadouts.
- [ ] In countdown, a timer at 0 disables Start and Reset.
- [ ] Defaults: loadouts 900 / 2700 / 1200 s, half prefix `PERIODO`, colors `#00ff00` /
      `#ff0000`.
- [ ] Hotkeys are ignored while typing in a field.
- [ ] A shortcut changed in Settings → Key Bindings works at once in the main window,
      updates its button badge, and survives an app restart.

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
- [ ] Loading a fixture sets both team names and colors, leaves score, half and timer
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
