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
the user confirmed the Windows tests/checks passed on 2026-10-25, closing
the previously outstanding replacement/failure platform gate.

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

**Platform gate closed by user confirmation on 2026-10-25:** Windows checks and
Linux WebKitGTK verification passed. This is user-reported native evidence,
separate from the agent-run Chromium checks above. Engine versions and display
scale were not supplied. Re-run native checks when changing renderer behaviour;
Chromium alone does not prove native-webview parity.

### Designer workflows (P5)

```bash
pnpm test:unit src/features/scoreboardDesigner src/lib/stores/layoutsStore.test.ts
cargo test --manifest-path src-tauri/Cargo.toml --lib windows::tests
```

The [draft tests](../src/features/scoreboardDesigner/draft.test.ts) cover private
new/duplicate ids, saved baselines, tree mutations/locks, hidden binding uniqueness,
limits, Free/flow conversions, actual Fill-to-Fixed sizes, zero-size rejection,
reparenting and appearance-only comparison.
The [store tests](../src/lib/stores/layoutsStore.test.ts) cover subscribe-before-read,
concurrent snapshot ordering, notifications, conflicts, durable results and failures.

For browser UI proof with an existing Playwright `page` and Vite running:

```js
const { checkDesignerWorkflow } = await import("./scripts/designer-smoke.mjs");
await checkDesignerWorkflow(page, "http://localhost:1420/pages/scoreboard-designer.html");
```

The [helper](../scripts/designer-smoke.mjs) installs a revisioned **IPC double**
before navigation; it is not a production fallback or proof of native persistence.
It uses isolated browser storage key `__scoreboard_designer_p5_smoke__`.
It checks pending/invalid inputs, guards, durable-response Save/reopen,
private duplication with fresh ids, Rename/Delete, Sample/Live isolation,
failed Save/retry, stale revisions/explicit Reload and tree reparent/hide/lock/add/remove.
Its command log spans reloads and rejects match dispatch or Apply.
Actual file transaction/recovery semantics are covered by the P2 Rust tests.

Evidence on 2026-10-25: the browser workflow helper passed against the production
Vite build, including exact
numeric/style/text persistence in the double, modal focus/Escape, guarded Save/Discard/Cancel and
no match/publication mutation. Both CSS sidebar handles resized independently
by 60 pixels. Validation passed with 143 TypeScript tests and all enabled Rust
tests; the existing graphical geometry test is opt-in. Binding export was
separately executed successfully. This does not replace native P5 interaction checks.

Native P5 manual checks (distinct from the already confirmed P2/P4 gates):

- Open **Broadcast → Scoreboard Designer…** twice: one window should focus;
  resize it and both sidebars, close/reopen after saving, and check geometry.
- Create Blank/starter, edit numeric geometry/styles/colours, Save and reopen;
  Duplicate is private until Save and Classic stays protected.
- Invalid pending input survives Cancel; Escape restores its committed value.
  Test Save/Discard/Cancel, failed Save and modal keyboard focus isolation.
- Run the real timer while changing Sample values and switching to Live:
  the match, live output and publication must stay unchanged.
- Check recovery warnings against an isolated test configuration, not a live
  operator's library. No automatic retry/overwrite is permitted after conflicts.
- Apply stays disabled. P6 interaction and native lifecycle checks follow.

### Designer interactions and lifecycle (P6)

```bash
pnpm test:unit src/features/scoreboardDesigner src/lib/stores/layoutsStore.test.ts
cargo test --manifest-path src-tauri/Cargo.toml --lib designer_lifecycle::tests
cargo test --manifest-path src-tauri/Cargo.toml --lib close_barrier
```

[Workspace tests](../src/features/scoreboardDesigner/workspace.test.ts) measure
exact logical coordinates at 25/50/100/200/400% zoom, anchored zoom/Fit,
nested content origins, all eight resize directions, positive minimum sizes,
the inclusive `6 / zoom` snap threshold, active resize edges, edge/grid/tree
ties, hidden/subtree exclusions, locks and flow-subtree insertion.
[History tests](../src/features/scoreboardDesigner/history.test.ts) cover
one-entry edits, no-ops, redo invalidation, Save baseline preservation and
undo/redo dirtiness. [Lifecycle tests](../src/features/scoreboardDesigner/lifecycle.test.ts)
verify listener-before-ready ordering and cleanup on handshake failure.
Rust tests cover request coalescing/upgrades, timeout/acknowledgement, stale
ids, one-shot authorization and an ordered queue barrier that leaves storage usable.

With an existing Playwright `page` and a production Vite preview running:

```js
const { checkDesignerInteractions } = await import("./scripts/designer-interactions.mjs");
await checkDesignerInteractions(page, "http://127.0.0.1:1423/pages/scoreboard-designer.html");
```

The [interaction helper](../scripts/designer-interactions.mjs) first runs the
entire P5 workflow. It then checks actual pointer capture/drag/resize and
Escape cancellation, one-step gesture Undo/Redo after Save, exact 50%/200%
movement, 60 × 40 CSS-pixel middle-button pan, grid/viewport isolation, snapping
guides, locks, whole flow-subtree reorder, exact nudges and native input undo.
It also exercises clean close, repeat/upgraded requests, invalid pending input,
failed close Save, Cancel, successful Save, Discard and timeout/error handling.
Native close resolutions are an **IPC double**: the helper deliberately keeps
the browser open. It does not prove OS close interception or actual Save storage.
The helper passed against the production build on 2026-10-25; full checks passed
with 172 TypeScript tests and all enabled Rust suites.

The opt-in Linux native test uses **real Tauri windows and production event
hooks**, with no browser mock. Run it separately from other graphical tests:

```bash
xvfb-run -a env -u GSETTINGS_SCHEMA_DIR GDK_BACKEND=x11 \
  XDG_CURRENT_DESKTOP=XFCE GDK_SCALE=2 \
  cargo test --manifest-path src-tauri/Cargo.toml --lib \
  designer_lifecycle::tests::native_close_and_quit_wait_for_permission \
  -- --ignored --test-threads=1
```

It passed on 2026-10-25: initialization blocks until ready; designer/main/Quit
requests upgrade one id; Cancel preserves both windows and skips shutdown;
authorized designer close destroys only that window, resets readiness and
keeps storage usable; reopening then authorizing Quit exits and stops storage.
The isolated X11 desktop environment avoids inherited desktop schema mismatch.
This test calls the Rust response commands directly, not the real WebView UI.

Remaining **interactive native checks on Windows and Linux**, distinct from the
already user-confirmed P2/P4 renderer/storage gates:

- Repeat drag/resize, flow reorder, snaps, cancellation and Undo/Redo at
  multiple OS display scales and 25/50/100/200% workspace zoom. Verify overlays
  do not appear in output and fields retain native selection/undo.
- With dirty or invalid pending input, test designer title-bar close, main
  close and normal Quit. Repeating/upgrading the request must keep one prompt.
  Cancel preserves raw input and a running timer/recording; failed Save keeps
  the window open; successful Save and Discard close only as requested.
- Delay frontend readiness or leave the designer unresponsive: after 10 seconds,
  close is cancelled with a native error. An acknowledged prompt may remain
  open longer without automatic close.
- Verify accepted Save/library writes complete before authorized shutdown,
  and an active recording receives its final flush only after permission.
  Crash, force-kill and power-loss draft recovery are not promised.

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
