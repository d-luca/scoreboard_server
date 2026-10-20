# Scoreboard Designer - proposed implementation plan

> **Status:** planned, not implemented. This is an architecture and delivery
> proposal, not a description of existing types, commands or events. Agreed
> product behaviour is defined in the [feature contract](scoreboard-designer.md)
> and [editor design](scoreboard-designer-editor.md).

This plan defines reviewable implementation work packages, their actual
prerequisites, concrete change locations and completion criteria. **Every work
package is currently not started.** Writing this plan does not authorize
application implementation.

Implementation must not treat proposed details as approved requirements.
Complete P0 and close its decision gate before beginning P1.

## Roadmap and dependencies

| Package | Deliverable                                                         | Prerequisites |
| ------- | ------------------------------------------------------------------- | ------------- |
| P0      | Approved detailed behaviour and technical contracts                 | None          |
| P1      | Typed definition model, limits and validation                       | P0            |
| P2      | Durable library operations and published snapshots                  | P1            |
| P3      | Deterministic layout and binding engine                             | P1            |
| P4      | Custom live/canvas renderers with representative parity proof       | P3            |
| P5      | Designer window, library, draft editing and inspector               | P2, P4        |
| P6      | Direct manipulation, history and guarded lifecycle                  | P5            |
| P7      | Live publication, reconnect synchronization and Outputs integration | P2, P4, P5    |
| P8      | Frozen-layout video export with bounded memory                      | P2, P4        |
| P9      | Integrated completion and release readiness                         | P6, P7, P8    |

```text
P0 -> P1 -> P2 --------------------+-------------------+
         |                        |                   |
         +-> P3 -> P4 ------------+-> P5 -> P6 -------+-> P9
                    |                 |
                    |                 +-> P7 ---------+
                    +-> P8 (also P2) ------------------+
```

The table is authoritative: package order is not an additional dependency.
Storage and the pure layout engine can progress independently after P1.
Video integration does not depend on drag handles or snapping. Live publication
does not depend on completing all direct-manipulation features.

Keep Classic as the default throughout development. Each package should be a
small series of reviewable changes, not one feature-sized commit. Do not ship
custom-layout activation until both live and video paths are complete.

## Current constraints

The existing application already separates authoritative match state from
presentation, which makes runtime layout changes possible without a restart.

Relevant current surfaces:

| Area                               | Existing source                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live visual scoreboard             | [`Scoreboard.tsx`](../../../src/components/Scoreboard/Scoreboard.tsx), [`scoreboard.tsx`](../../../src/entries/scoreboard.tsx)                              |
| Classic geometry                   | [`scoreboardGeometry.ts`](../../../src/lib/scoreboardGeometry.ts)                                                                                           |
| Canvas video drawing               | [`renderScoreboardToCanvas.ts`](../../../src/lib/renderScoreboardToCanvas.ts)                                                                               |
| Video render loop                  | [`videoGeneration.ts`](../../../src/lib/videoGeneration.ts)                                                                                                 |
| Rust export session and dimensions | [`video.rs`](../../../src-tauri/src/video.rs)                                                                                                               |
| Recording snapshots                | [`recording.rs`](../../../src-tauri/src/recording.rs)                                                                                                       |
| Authoritative state and publishing | [`state.rs`](../../../src-tauri/src/state.rs)                                                                                                               |
| LAN bootstrap and WebSocket        | [`assets.rs`](../../../src-tauri/src/server/assets.rs), [`ws.rs`](../../../src-tauri/src/server/ws.rs), [`wsTransport.ts`](../../../src/lib/wsTransport.ts) |
| Output preview and instructions    | [`OutputsWindow.tsx`](../../../src/entries/Outputs/OutputsWindow.tsx)                                                                                       |
| Window/menu registration           | [`windows.rs`](../../../src-tauri/src/windows.rs), [`menu.rs`](../../../src-tauri/src/menu.rs)                                                              |

Live output is React/HTML, whereas video re-draws the board using Canvas2D.
The current Classic board is 600 x 80 within a 622 x 80 output frame that
accommodates its skew. Multiple surfaces assume this fixed geometry.

Custom layouts must address both rendering paths and every dimension consumer,
not just the designer workspace.

## State ownership and contracts

Follow the existing architecture:

- Rust owns the saved layout library and published selection/snapshot.
- React owns temporary editor drafts, selection, preview samples and interaction
  history. These are not authoritative match or published state.
- Definitions use constrained, validated element/style choices, not arbitrary
  HTML, CSS or JavaScript.
- Define persistent and IPC contracts in Rust and generate TypeScript bindings
  with the existing ts-rs workflow. Do not hand-maintain duplicate types.

A definition needs stable identity, a display name, versioning and an element
tree. Nodes need stable identity so selection, history and reordering do not
depend on array indices. Exact types and field names remain to be designed; this
document intentionally does not invent generated binding declarations.

Distinguish three kinds of versioning:

| Version/revision          | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| Storage schema version    | Migrate or reject incompatible persisted data           |
| Saved definition revision | Identify which saved content a draft/export refers to   |
| Published revision        | Order activation updates and reject stale live messages |

Presentation revisions must not reuse or mutate the match state's revision.

## Persistence and publication

Recommended storage is a versioned `layouts.json` under `app_config_dir()`,
holding the local custom library and the published selection/snapshot. A single
document permits an atomic write of related layout state.

The published selection must distinguish Classic from a custom snapshot. For a
custom layout, retain enough source identity/revision metadata to show the
relationship to its saved definition, alongside the actual frozen definition.
Persisting only the source id is insufficient:

```text
Saved A, revision 1 -> Apply -> Published A, revision 1
Edit A -> Save revision 2  -> Published A stays at revision 1
Restart                  -> Published A must still be revision 1
```

Recommended mutation flow:

1. Validate the proposed library or activation change.
2. Persist the complete next state atomically.
3. Commit the authoritative in-memory layout state.
4. Publish the appropriate library/activation event.

Serialize concurrent mutations appropriately so disk and in-memory state cannot
be reordered. Do not hold state locks while emitting events. Save/Apply success
must mean the requested durable state exists; this explicit-save feature should
not simply acknowledge a scheduled debounced write.

Reuse existing persistence practices: temporary file, flush/sync and atomic
replacement. Preserve corrupt data for recovery and surface a useful warning.
Exact recovery behaviour needs specification, especially for unsupported newer
schemas; do not silently overwrite an incompatible library.

Proposed desktop operations cover loading the library/published snapshot,
creating, saving, renaming, duplicating and deleting custom definitions, and
applying a saved definition or Classic. Exact command/event names are not yet
defined.

Layout editing and publication are desktop features. LAN consumers need the
published snapshot, not write access to the private library or editor drafts.

## Shared layout and rendering

Recommended architecture:

```text
Definition
    |
Shared layout resolver
    |
Positioned scene + styling/binding instructions
    |                                  |
Live match data                  Recorded snapshot
    |                                  |
React/HTML renderer              Canvas2D renderer
```

The shared resolver calculates parent-relative geometry, nested Free/Row/Column
placement, padding, gaps, equal fill allocation, visibility and painting order.
Use one set of rules, rather than browser flex layout on one path and a
separately reimplemented layout algorithm for video.

For custom live output, render the resolved geometry with React/HTML. For export,
draw the same resolved geometry with Canvas2D. Share style/binding resolution and
text-placement helpers wherever possible. Match values and bound colours remain
dynamic; they do not become constants in the saved scene.

Preserve Classic as its existing live/canvas compatibility paths rather than
forcing its skew into the first custom-layout schema.

Renderer invariants:

- Clip at the rendering root, not every container/value rectangle.
- Rounded backgrounds and borders must not imply clipping of descendants.
- Keep editor overlays entirely outside output rendering.
- Resolve bundled fonts before text measurement/rendering; avoid fallback-font
  frames or disagreement between live and video placement.
- Use consistent text alignment, line metrics, border geometry and alpha.
- Bind period prefix and number separately.
- Reuse the existing Rolling effect where suitable, with independent per-score
  selection and only its required internal transition mask.
- Keep LAN renderer dependencies free of Tauri imports.

A small proof of the shared scene model should precede rich editing interaction.
It must cover nested layouts, overflowing text, team-bound colours and both
renderers before the editor is built around the geometry.

## Live synchronization and app wiring

Published layout changes are separate from match actions. Applying one must not
call reset, rebuild the timer, restart the HTTP server or recreate the app.

Provide a complete published snapshot on initial page/socket synchronization,
on activation, and when a lagging or reconnecting consumer resynchronizes.
Receiving only future change events is insufficient: a reconnect could otherwise
keep an old layout until another Apply.

A consumer should swap the complete published definition, not expose a series
of partially rebuilt element updates. Use publication ordering independently
of match-state ordering.

Integration includes:

- A singleton designer window following the existing window-manager pattern.
- A native-menu entry, HTML/React entry, Vite input, window permissions and
  generated window bindings.
- Library and published-layout stores with a Tauri-facing persistence boundary.
- Dirty-work navigation/close handling, including normal application exit.
- Runtime layout selection in the `/scoreboard` page.
- Bootstrap/WebSocket support and transport handling for published state.
- Dynamic root/page styling, output preview sizing and OBS size instructions.
- Clear animation-setting wording: custom selections versus Classic and
  single-value outputs.

Do not connect layout visibility to desktop/remote control availability. Do not
add a second match-mutation path or change recording contents based on the
visible element tree.

## Video integration and memory limits

Add a saved-layout selector to Video Generator, including Classic. Resolve and
freeze the chosen definition at generation start. The backend session and
frontend render loop must agree on that exact snapshot and output dimensions,
not independently fetch the current library later.

Keep recording formats and their existing timing semantics unchanged. Convert
each recorded snapshot into the rendering inputs, using recorded identity,
colours and prefix. Score updates are static in exported video initially.

Replace fixed Classic frame-size assumptions with selected-layout dimensions.
Continue handling the codec's even-dimension requirement, displaying the exact
resulting video dimensions. Decide the padding/rounding policy explicitly rather
than unintentionally stretching a custom design.

The current render loop batches 30 raw RGBA frames. Approximate payloads before
additional browser/IPC/Rust copies are:

| Frame               | One frame | 30 frames |
| ------------------- | --------- | --------- |
| Classic 622 x 80    | 0.20 MB   | 5.97 MB   |
| Full HD 1920 x 1080 | 8.29 MB   | 248.83 MB |
| 4K 3840 x 2160      | 33.18 MB  | 995.33 MB |

Values above use decimal MB. The first release therefore requires byte-budgeted
batches, possibly one frame per batch at large resolutions. Keep a bounded
number of buffers and preserve the existing awaited encoder backpressure and
cancellation behaviour.

Validate dimensions and arithmetic on both sides of the boundary before
allocation. Check the final scaled output against landscape/portrait 4K bounds.
An oversized request must fail visibly, not silently reduce scale or resolution.
The existing export-scale options need dynamic availability/error handling when
combined with larger roots.

## Proposed code organization

These paths identify implementation responsibilities; files marked new do not
exist yet. Do not create placeholder modules before their package needs them.
Split further only if the implementation actually becomes unwieldy.

| Location                                                                                                              | Responsibility                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src-tauri/src/layouts.rs` (new)                                                                                      | Rust contracts, validation, library service, atomic storage and publication operations |
| `src-tauri/src/state.rs`, `lib.rs`                                                                                    | Own/initialize the layout service; register commands and published events              |
| `src-tauri/src/bindings.rs`, `tests/export_bindings.rs`                                                               | Export the new Rust contracts                                                          |
| `src/lib/layouts/` (new)                                                                                              | Tauri-free resolver, binding adapter, shared drawing/text helpers and canvas renderer  |
| `src/components/ScoreboardLayout/` (new)                                                                              | Custom React/HTML renderer using resolved scene geometry                               |
| `src/features/scoreboardDesigner/` (new)                                                                              | Draft state, tree operations, history, selection and editor interaction                |
| `src/entries/ScoreboardDesigner/` and `pages/scoreboard-designer.html` (new)                                          | Designer window shell, layers, inspector and workspace composition                     |
| `src/lib/stores/layoutsStore.ts` (new)                                                                                | Desktop library/published-state IPC and errors; not imported by LAN entries            |
| `src/lib/transport.ts`, `tauriTransport.ts`, `wsTransport.ts`                                                         | Published-layout synchronization without exposing library writes over LAN              |
| `src-tauri/src/server/`, `src/entries/scoreboard.tsx`, `src/scoreboard.css`, `pages/scoreboard.html`                  | Bootstrap, live events, renderer selection and dynamic output bounds                   |
| `src/entries/Outputs/`                                                                                                | Published layout dimensions, iframe preview and OBS instructions                       |
| `src-tauri/src/video.rs`, `src/lib/videoGeneration.ts`, `src/lib/stores/videoStore.ts`, `src/entries/VideoGenerator/` | Frozen export selection, custom rendering, dimensions and bounded batches              |
| `src-tauri/src/windows.rs`, `menu.rs`, `capabilities/default.json`, `vite.config.ts`                                  | Singleton window registration, menu, permissions and build input                       |

Retain `Scoreboard.tsx`, `scoreboardGeometry.ts` and the existing Classic canvas
path as compatibility implementations. Do not turn match controls or recording
into designer modules.

## Work packages

### P0 - close the detailed-design gate

**Prerequisites:** none. **Application changes:** none.

Deliverables:

- Close the user-visible choices in the
  [decision register](#decision-register-and-stop-conditions), including
  Save-before-Apply, fill-axis behaviour, reparenting and defaults.
- Write down the exact border/padding box model, alignment math, overflow
  diagnostics and mode-conversion rules before coding the resolver.
- Specify the Rust contracts, operation names, revision conflict responses,
  storage recovery policy and published-wire ordering.
- Set concrete bounds for node count, nesting, text length, geometry and file
  size. Explain any user-visible restriction before approving it.
- Choose the smallest automated setup for the new pure TypeScript logic. The
  repository has Rust tests and smoke scripts but no frontend unit-test runner;
  a small dev-only Vitest setup is the proposal, not an existing dependency.
- Define representative fixtures for Blank, the editable starter, nested flow
  layouts, overflow, hidden children and full-frame/portrait output.

**Exit gate:** product-affecting defaults are approved and technical contracts
are recorded. No unresolved choice is hidden behind an implementation constant.

### P1 - implement definition contracts and validation

**Prerequisites:** P0.

Tasks:

- Add the Rust element variants, sizing/layout/style choices, bindings and
  animation identifiers. Model Classic selection separately from custom trees.
- Add saved metadata, stable node/layout identity, saved revisions and published
  revisions without modifying `ScoreboardState` or `Action`.
- Validate one root, unique ids, unique bound values, permitted nesting,
  supported style/font/animation choices, finite geometry and all approved
  resource limits.
- Define validation diagnostics with an element/property reference so the
  inspector can show actionable errors.
- Export contracts using the existing ts-rs path and regenerate bindings.
- Add focused Rust cases for duplicate values/ids, invalid nesting/sizes,
  unsupported choices and boundary dimensions.

**Primary files:** new `layouts.rs`; binding export surfaces; generated bindings.

**Exit gate:** a valid definition round-trips and an invalid one is rejected
before storage, publication or allocation. Hidden instances still count toward
unique-value constraints.

### P2 - implement the persistent library and publication service

**Prerequisites:** P1.

Tasks:

- Load `layouts.json` during startup, using Classic when no layout file exists.
  Update `AppState` construction, test helpers and the standalone server example.
- Implement serialized create/save, rename, duplicate, delete and Apply
  operations with explicit durable completion.
- Keep an independent published snapshot, not a reference that follows saved
  edits. Protect Classic and the currently published source from deletion.
- Require an expected saved revision on conflicting mutations and custom Apply;
  report conflicts rather than silently overwriting a newer definition.
- Preserve the transaction sequence: validate, persist, commit memory, emit.
  Complete the transaction consistently even if its initiating UI disappears.
- Expose desktop library-change notifications separately from the public
  published-layout event. Never broadcast private draft/library content as live
  layout state.
- Surface load/recovery/write failures. Preserve newer unsupported schemas
  without destructive rewrites.
- Cover write failure, revision conflict, protected deletion, concurrent
  mutations and exact published-snapshot restoration in Rust tests.

**Proposed operation responsibilities:** read library/published state; create
on first Save; update with expected revision; delete with expected revision;
Apply Classic or a saved id/revision. Duplication can reuse the create path.
Finalize exact command names in P0 rather than maintaining speculative APIs here.

**Primary files:** `layouts.rs`, `state.rs`, `lib.rs`, `examples/serve.rs`,
relevant constructor call sites and binding exports.

**Exit gate:** save revision 2 after publishing revision 1, restart, and still
read published revision 1. Failed writes leave the previous authoritative state
and appearance intact.

### P3 - implement the pure layout and binding engine

**Prerequisites:** P1. Does not depend on persistent storage or an editor window.

Tasks:

- Resolve the rendering root and nested containers into a positioned scene with
  stable node ids, parent relationships, painting order and diagnostics.
- Implement parent-relative Free positioning and deterministic Row/Column
  layout using the approved border, padding, gap, alignment and equal-fill rules.
- Remove hidden subtrees from painting and hidden children from flow/gap
  calculations. Keep fixed-size overflow visible and report space constraints.
- Keep geometry resolution separate from dynamic match values and colour
  bindings, so a timer tick need not rebuild unrelated layout geometry.
- Provide adapters from live state and recorded snapshots to one rendering-input
  shape. Preserve existing timer/value semantics and separate prefix/period.
- Define explicit root clipping and no implicit descendant clipping.
- Add table-driven pure TypeScript cases for nested positioning, fill, gaps,
  hidden children, paint order, bindings and insufficient-space diagnostics.

**Primary files:** new `src/lib/layouts/` and its focused tests.

**Exit gate:** the agreed fixtures resolve identically regardless of whether
their values came from the live match, sample preview or a recording.

### P4 - implement both renderers and prove the scene model

**Prerequisites:** P3.

Tasks:

- Add the custom React renderer using resolved positions rather than an
  independently calculated browser flex layout.
- Add canvas drawing for the same rectangles, borders, rounded backgrounds,
  separators, text and team-bound colours.
- Establish bundled-font loading and shared text/border placement rules before
  building inspector controls around them.
- Reuse/adapt Rolling without coupling the two score choices or clipping
  ordinary overflowing text. Keep canvas score changes static.
- Separate editor selection/guides from the renderer API.
- Add Blank and starter fixtures plus full-frame and portrait compositions.
- Compare representative live/canvas results on supported browser/webview
  engines, including transparency and root-edge clipping.

**Primary files:** new `src/components/ScoreboardLayout/`,
`src/lib/layouts/`; existing Rolling/font resources where integration requires.

**Exit gate:** nested geometry, alignment, alpha, bound colours and overflowing
text agree in both paths. Classic still follows its original paths.

**Stop condition:** if reliable text or border parity cannot be achieved with
the proposed renderer split, resolve that architecture before building the
interactive workspace. Do not compensate with unrelated renderer-specific
layout constants.

### P5 - implement the designer shell, library and numeric editing

**Prerequisites:** P2, P4.

Tasks:

- Register the singleton designer window, page, Vite entry, native-menu item,
  permissions and generated window binding.
- Add the proposed three-region workspace using existing UI primitives.
- Add library selection, New from Blank/starter, Rename, Duplicate and Delete.
  Keep new/duplicated work private until the agreed Save point.
- Build draft tree operations: add, remove, rename, reorder, reparent, hide and
  lock. Enforce constraints before presenting invalid persistent operations.
- Implement the selection-specific inspector with numeric geometry, container
  mode/sizing, supported styling, colour bindings and score animation choices.
- Add editable sample data and read-only live preview using the shared renderer.
- Show dirty, saved, published and unapplied-appearance status separately.
- Connect durable Save and inline error reporting. Keep Apply unavailable until
  P7 supplies its complete workflow.
- Establish Save/Discard/Cancel navigation guards and reducer coverage for the
  new draft operations.

**Primary files:** new designer feature/entry/page, desktop layouts store,
window/menu/capability/build registration and generated bindings.

**Exit gate:** a user can create, numerically edit, save, reopen and duplicate a
custom layout without changing live output or the real match via sample data.

### P6 - implement direct manipulation and guarded lifecycle

**Prerequisites:** P5.

Tasks:

- Add selection overlays and pointer-capture move/resize in Free mode. Convert
  pointer positions through the viewport transform into logical coordinates.
- Add Row/Column insertion/reorder affordances and tree reparenting, with cycle
  prevention and the approved geometry/sizing conversions.
- Add one-history-entry gestures, coherent numeric/text commits, undo/redo and
  correct dirty-state comparison after Save, Undo and Redo.
- Add keyboard nudging, zoom/pan/Fit, grid, edge/centre snapping and toggle
  controls. Preserve ordinary text editing and window-local shortcut scope.
- Enforce effective ancestor hide/lock rules while keeping tree selection and
  unlocking possible. Confirm non-empty subtree deletion.
- Intercept native designer close, main close and normal Quit before destroying
  the draft window. Coordinate one asynchronous Save/Discard/Cancel flow.
- Preserve existing recording flush and process shutdown ordering after the
  guard permits exit. A failed Save must not let shutdown continue.

**Primary files:** designer interaction/history modules, entry lifecycle hooks,
`windows.rs`, `lib.rs` and menu exit handling only where required.

**Exit gate:** interaction is predictable at different zoom/display scales;
one drag is one undo step; all normal dirty-close paths can be cancelled without
losing the draft or changing the running match.

### P7 - wire publication into live output and Outputs

**Prerequisites:** P2, P4, P5.

Tasks:

- Implement the approved Save-before-Apply rule and appearance-change
  confirmation. Disable duplicate in-flight requests and revalidate the saved
  revision after confirmation before publishing it.
- Publish the complete frozen layout with its own ordering metadata; exclude
  editor-only changes from the appearance comparison.
- Deliver current publication on cold load, socket connect, reconnect and lag
  recovery. Subscribe/read in an order that cannot miss a concurrent Apply.
- Handle a backend restart explicitly: either scope ordering by a server
  session id or reset the client's layout revision baseline on reconnect.
  A previous process's higher revision must not suppress the new snapshot.
- Select Classic/custom rendering in `/scoreboard` and replace all relevant
  hardcoded page/root dimensions without introducing Tauri imports.
- Update Outputs iframe dimensions, scaled wrapper bounds, published-layout
  identification and OBS size instructions.
- Keep `/value/*` and the phone remote independent of layout selection.
  Clarify the existing animation setting's Classic/single-value scope.
- Extend the existing standalone-server/smoke approach to cover publication
  fan-out and cold/reconnected clients.

**Primary files:** `state.rs`, server bootstrap/WS, transports/stores,
`scoreboard.tsx`, scoreboard page/CSS, Outputs and animation-setting wording.

**Exit gate:** applying a saved layout updates connected and newly connected
outputs without refreshing or restarting; a running timer and omitted fields
continue operating normally. Failed/cancelled Apply changes nothing.

### P8 - integrate video selection, dimensions and bounded batches

**Prerequisites:** P2, P4. Does not depend on interactive editor completion.

Tasks:

- Add the saved-layout/Classic selector and resulting output-size display to
  Video Generator.
- Resolve the selected saved revision in Rust at generation start and retain
  the immutable definition in the job. Return the same definition and dimensions
  to the frontend loop; do not re-read the library for each frame.
- Route custom snapshots through the shared renderer inputs and canvas path.
  Use recorded names, colours and prefix; keep all existing recording formats
  and timing semantics unchanged.
- Replace Classic-only dimension calculations with the approved scale and
  even-dimension policy. Validate the final padded/scaled landscape or portrait
  frame before allocating or starting ffmpeg.
- Use a proposed raw-payload ceiling of 32 MiB with a maximum of 30 frames:
  batch count is the smaller of 30 and the number of whole frames fitting the
  budget. A valid 4K frame fits once. The budget is not a claim about total
  process memory, which also includes copies and renderer/encoder buffers.
- Preserve one awaited batch in flight, raw binary IPC, cancellation,
  encoder-error propagation and partial-file cleanup.
- Keep a generation job unchanged by later library saves/deletes or live Apply.
- Extend existing video integration cases for custom geometry, recorded colour
  bindings, portrait/4K boundaries, stable job selection and cancellation.

**Primary files:** `video.rs`, generated video config/start bindings,
`videoGeneration.ts`, `videoStore.ts` and Video Generator UI.

**Exit gate:** the same recording exports with Classic or a selected custom
layout, preserving alpha and duration. 4K uses bounded batches rather than
30-frame allocations, and requests beyond the supported final bounds fail
explicitly.

### P9 - complete cross-surface conformance and release readiness

**Prerequisites:** P6, P7, P8.

Tasks:

- Exercise the feature-contract scenarios across editor, live output, restart
  and video, rather than considering a working workspace sufficient.
- Cover Save versus Apply, stale revisions, persistence failure, reconnect,
  library corruption/recovery and shutdown cancellation.
- Confirm Classic and `/value/*` behaviour, both timer directions, remote score
  controls and recording remain unchanged when custom elements are omitted.
- Check portrait/full-frame output, long text, hidden flow children and
  independent animation choices on Windows and Linux, including HiDPI.
- Measure export memory at Full HD and 4K to verify bounded buffering across
  recording lengths, not just the batch-count calculation.
- Run the repository's existing completion gates, including generated-binding
  consistency and LAN-bundle isolation. Update feature-specific manual cases
  in `docs/testing.md` when the implementation exists.
- Change planning-status documentation only as capabilities actually become
  available; keep incomplete/deferred items explicitly marked.

**Exit gate:** all three output surfaces are complete, regression expectations
hold, and no planned capability is presented as implemented prematurely.

## Review and verification strategy

Use the smallest checks covering each package while implementing it:

| Work  | Focused evidence                                                                  |
| ----- | --------------------------------------------------------------------------------- |
| P1/P2 | Rust model/service/persistence tests and regenerated bindings                     |
| P3    | Pure geometry/binding fixtures with no browser or Tauri dependency                |
| P4    | Shared fixtures rendered live and to canvas, including root clipping              |
| P5/P6 | Draft/tree/history cases plus actual pointer, keyboard and native-close behaviour |
| P7    | Standalone-server/WS publication cases and actual Outputs/OBS rendering           |
| P8    | Existing video integration path extended with custom selected layouts             |
| P9    | Full repository gates and Windows/Linux cross-surface regression                  |

Use existing commands (`pnpm bindings`, `pnpm lint`, `pnpm vite:build`,
`pnpm rust:clippy`, `pnpm rust:test`, and final `pnpm check`) rather than adding
another build pipeline. Any new frontend test command is introduced only with
the selected test runner and its first focused cases, not in this planning task.

## Behavioural completion criteria

The feature is not complete if only the designer preview supports custom layouts.
The [feature scenarios](scoreboard-designer.md#behavioural-examples) must hold
across live output, app restart, preview and export.

In particular, preserve current Classic appearance and control behaviour; keep
Save separate from Apply; restore the exact published snapshot; maintain match
updates for omitted fields; and use the same layout geometry, overflow and
recorded-data bindings in video.

## Decision register and stop conditions

The main feature scope is agreed. The following defaults are **proposed, not
approved**, and must be resolved in P0. Record the approved choice in the
relevant feature/editor section rather than leaving conflicting defaults here.

| Topic                    | Proposed default or required decision                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applying a dirty draft   | Disable Apply until Save succeeds; no implicit Save-and-Apply                                                                                       |
| New and duplicate        | Open a private draft; create the persistent entry on first Save                                                                                     |
| Box model                | Width/height include border and padding; layout uses the remaining content box                                                                      |
| Fill axes                | Row/Column allow fixed or Fill on each axis; Free children use fixed dimensions; main-axis Fill is shared equally                                   |
| Insufficient space       | Fixed children keep sizes; main-axis Fill can resolve to zero; show a warning; never hide, wrap or shrink automatically                             |
| Alignment                | Start/centre/end; define exact overflow offsets before implementation                                                                               |
| Reparenting into Free    | Preserve computed global bounds by converting into the new parent's coordinates                                                                     |
| Reparenting into flow    | Keep computed pixel size initially and use the chosen insertion order; Fill can be selected afterward                                               |
| Editable starter         | 622 x 80 transparent root, rectangular groups, all standard values; approve the exact fixture before implementation                                 |
| Score animation defaults | Manually added score values start at None; the starter's initial selection needs approval                                                           |
| Preview default          | Sample mode; Live remains read-only                                                                                                                 |
| Keyboard                 | Ctrl+S Save, Ctrl+Z Undo, Ctrl+Shift+Z/Ctrl+Y Redo, arrows 1 px, Shift+arrows 10 px; text fields retain native editing                              |
| Grid and snapping        | Start with an 8 logical-pixel grid and a 6 screen-pixel snap threshold converted through zoom; both toggleable                                      |
| Saved editor state       | Save layer names/lock metadata; exclude selection, sample values and viewport from the published appearance                                         |
| Video even dimensions    | Uniformly scale the custom layout and add transparent right/bottom padding to reach even dimensions; do not stretch; preserve Classic compatibility |

Engineering decisions to close in the same gate:

- Exact contracts, commands/events, saved-revision conflict handling and
  publication/session ordering.
- Serialized atomic persistence, cancellation-safe transaction completion and
  non-destructive corrupt/newer-schema recovery.
- Concrete node/depth/text/geometry/file limits and the complete fill/alignment
  math, including degenerate content boxes.
- Font metrics and border placement across supported webviews and Canvas2D.
- Frontend test setup and byte-budget enforcement boundaries.
- Native close/Quit coordination with draft prompts and existing recording
  flush/exit behaviour.

**Stop before P1** if the behavioural/default approvals are missing. **Stop
after P4** if the shared render model cannot meet the agreed overflow and visual
requirements. **Do not release after P7 alone:** custom layouts also require P8.
If any further user-visible ambiguity emerges, clarify it before implementing
that behaviour rather than silently expanding scope.
