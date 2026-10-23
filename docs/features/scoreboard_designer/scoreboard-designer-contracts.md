# Scoreboard Designer - approved P0 technical contracts

> **Status:** P0 approved on 2026-10-20; P1 contracts and validation implemented
> on 2026-10-22 with generated ts-rs bindings. P2 persistence, desktop commands
> and backend publication events implemented on 2026-10-23 (Linux verified;
> Windows replacement verification pending). P3's pure layout/binding engine is
> implemented on 2026-10-23. Editor, rendering and public wire synchronization
> remain planned for subsequent packages. Rust remains the authoritative type
> source; do not create hand-maintained TypeScript copies.

The [feature contract](scoreboard-designer.md) defines product behaviour.
The [editor design](scoreboard-designer-editor.md#approved-p0-editor-contract)
defines geometry, interactions and fixtures. The
[implementation plan](scoreboard-designer-implementation.md) defines delivery
dependencies. All three remain subject to the P4 renderer-parity stop gate.

## Contract conventions

- Rust owns persistent/IPC types. JSON fields are camelCase; tagged enum
  discriminants and diagnostic/error codes are kebab-case. Reject unknown
  fields, variants and non-finite numbers rather than ignoring them.
- Layout and node ids are canonical lowercase UUID v4 strings. Layout ids are
  unique in the library; node ids are unique within a definition. Rust assigns a
  layout id on create; the draft assigns node ids when nodes are added.
- Revisions are integers in `0..=9_007_199_254_740_991`, represented exactly by
  JavaScript numbers. Saved entries start at 1. Storage/publication start at 0
  for an absent file. Check increment overflow and reject before writing.
- Optional response fields described below are present with `null` when absent.
  Arrays preserve order. Required definition/style fields have explicit values;
  omitted fields are not silently filled on load.
- Definition format is governed by the storage schema, initially 1. Saved
  revision, publication revision and storage revision are independent of
  `ScoreboardState.revision` and never cause a match action.

## Definition and saved state

These tables specify field responsibilities, not duplicate Rust declarations.

| Rust contract              | Required JSON fields and rules                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LayoutDefinition`         | `root: LayoutRoot`, `editor: LayoutEditorMetadata`                                                                                                                                                                                                            |
| `LayoutRoot`               | `kind: "root"`, `id`, integer `width`, integer `height`, `background: LayoutColor`, `children: LayoutElement[]`. Origin is `(0,0)`; direct children use Free placement. No root border, padding, hiding or nesting.                                           |
| `LayoutElement`            | Tagged union of `container`, `value`, `text`, `rectangle`, `separator`; common fields `id`, `hidden`, `frame`. Only a container has `children`.                                                                                                               |
| `LayoutFrame`              | `x`, `y`, `width: LayoutSize`, `height: LayoutSize`. Free children require fixed sizes. Flow children require `x = y = 0`; placement comes from their parent.                                                                                                 |
| `LayoutSize`               | `{kind: "fixed", pixels}` or `{kind: "fill"}`. No weights, percentages, auto/content sizing or per-child alignment override.                                                                                                                                  |
| Container fields           | `box: LayoutBoxStyle`, `padding: LayoutInsets`, `mode: "free" \| "row" \| "column"`, `gap`, `mainAlign`, `crossAlign`, `children`. Alignments are `start`, `center`, `end`. Gap/alignment remain stored but inactive in Free mode.                            |
| Value fields               | `box`, `binding`, `textStyle`, `animation: "none" \| "rolling"`. Bindings are `timer`, `period-prefix`, `period-number`, `home-name`, `home-score`, `away-name`, `away-score`. Only the two score bindings permit `rolling`; others require `none`.           |
| Static-text fields         | `box`, `text`, `textStyle`. Explicit LF line breaks are supported; no automatic wrapping. Normalize CRLF/CR to LF when committing an edit, not silently during load.                                                                                          |
| Rectangle fields           | `box`. No children or text.                                                                                                                                                                                                                                   |
| Separator fields           | `orientation: "horizontal" \| "vertical"`, `color`. Its frame supplies length/thickness: width/height for horizontal, height/width for vertical. Paint a solid rectangle; no additional stroke, padding or children.                                          |
| `LayoutBoxStyle`           | `background`, `borderColor`, `borderWidth`, `radius`. Uniform solid border and uniform corner radius; no independent corner/edge styles.                                                                                                                      |
| `LayoutInsets`             | Non-negative `top`, `right`, `bottom`, `left`. Only containers have padding.                                                                                                                                                                                  |
| `LayoutColor`              | `{kind: "literal", hex: "#RRGGBB", alpha}` or `{kind: "team", team: "home" \| "away", alpha}`. Hex is case-insensitive on input and canonical uppercase on Save; alpha is `0..=1`. Team colours are resolved from the rendering inputs, not captured at Save. |
| `LayoutTextStyle`          | `font: LayoutFont`, `fontSize`, `color`, `horizontalAlign`, `verticalAlign`. Both alignments use `start`, `center`, `end`; fixed line height is `1.25 * fontSize`, not a configurable field.                                                                  |
| `LayoutFont`               | `family: "anton" \| "poppins"`, `weight`. Anton permits 400 only; Poppins permits 400, 500, 600, 700, 800, 900. Upright bundled fonts only; never synthesize a missing weight/style.                                                                          |
| `LayoutEditorMetadata`     | `layers: LayoutLayerMetadata[]`, exactly one entry per node, in depth-first tree order. Each has `nodeId`, `label`, `locked`. Root metadata has `locked: false`. No selection, sample data, grid/snap state or viewport.                                      |
| `SavedLayout`              | `id`, `name`, `revision`, `definition`. Names are trimmed, non-empty and need not be unique. Node labels are trimmed and non-empty.                                                                                                                           |
| `SavedLayoutSelection`     | `{kind: "classic"}` or `{kind: "custom", id, expectedRevision}`. Classic is not a saved entry or a custom tree.                                                                                                                                               |
| `PublishedLayoutSelection` | `{kind: "classic"}` or `{kind: "custom", sourceId, sourceRevision, sourceName, root}`. Root is a frozen copy, excluding editor metadata. Source name/revision describe the moment of Apply, not subsequent renames/saves.                                     |
| `LayoutStorageDocument`    | `schemaVersion: 1`, `storageRevision`, `entries: SavedLayout[]`, `published: {revision, selection: PublishedLayoutSelection}`. Entries retain creation order.                                                                                                 |
| `PublishedLayoutSnapshot`  | `sessionId`, `revision`, `selection: PublishedLayoutSelection`. The session id is runtime-only and never stored in the file.                                                                                                                                  |
| `LayoutLibrarySnapshot`    | `sessionId`, `storageRevision`, `entries`, `published: PublishedLayoutSnapshot`, `storageStatus: LayoutStorageStatus`. Desktop-only.                                                                                                                          |
| `LayoutMutationResult`     | `library: LayoutLibrarySnapshot`, `affectedId: string \| null`. Create/save/rename/delete return the affected id; Classic Apply/recovery return null; custom Apply returns its source id.                                                                     |

Published source ids must reference an existing saved entry. Its saved revision
may be newer than `sourceRevision`; published root need not equal that entry's
current root. Validate the frozen root independently, never replace it from the
saved entry on load. Classic output continues through its existing render paths.
Custom publication requires revision at least 1, and
`1 <= sourceRevision <= savedEntry.revision`; revision 0 is the initial Classic
publication only.

Duplicate creates a private copy of a saved custom definition, with a new draft
identity and new ids for every node/metadata reference. It starts with name
`<source name> copy` (trim the source portion to fit the name limit). It does not
copy unsaved edits: guard dirty work before duplicating the selected saved entry.
Classic cannot be duplicated. New and Duplicate call create only on first Save.

## Validation, limits and diagnostics

Limits are inclusive and apply to hidden as well as visible content.
`KiB`/`MiB` mean powers of 1024. Strings are counted in Unicode scalar values,
not UTF-16 code units or bytes.

| Resource                         | Approved limit                                                           |
| -------------------------------- | ------------------------------------------------------------------------ |
| Saved custom entries             | 100; Classic and the published snapshot do not count as entries          |
| Nodes per definition/frozen root | 256 including the root                                                   |
| Tree depth                       | 16 including the root                                                    |
| Static text                      | 2,048 characters per element, including line breaks; empty text allowed  |
| Layout names / node labels       | 1..128 characters after trimming                                         |
| Root dimensions                  | Positive integers satisfying `(width <= 3840 && height <= 2160)          |     | (width <= 2160 && height <= 3840)` |
| Child `x`, `y`                   | Finite logical pixels in `-16384..=16384`                                |
| Fixed child width/height         | Finite logical pixels in `1..=8192`; resolved Fill may be zero           |
| Font size                        | Finite `1..=512` logical pixels                                          |
| Padding, gap, radius             | Finite `0..=4096` logical pixels                                         |
| Border width                     | Finite `0..=256` logical pixels                                          |
| Alpha                            | Finite `0..=1`                                                           |
| One definition                   | At most 1 MiB of compact UTF-8 JSON, including editor metadata           |
| Complete storage document        | At most 16 MiB, including entries, frozen publication and metadata       |
| JSON parser nesting              | At most 64 object/array levels, checked before recursive decoding        |
| Export                           | Final padded dimensions satisfy the same landscape/portrait 4K predicate |

Fractional child geometry is allowed; do not round resolver positions to integer
pixels. The root's integer dimensions are distinct from child dimensions.
Dynamic match strings retain existing match validation; static-text limits do
not truncate live or recorded names/prefixes.

Check file length before reading/allocating the whole document, and enforce the
16 MiB read ceiling even if the file grows during reading. Check parser nesting
before decoding a recursive tree. After parsing, validate versions, field/type
choices, ids, counts/depth, parent-specific sizing, unique bindings, metadata
references, geometry and compact serialized sizes. Validate the complete proposed
storage document before every mutation; an individually valid entry can still
exceed the library budget. A frozen root is subject to the definition-size budget
without editor metadata. Do not drop invalid nodes or dangling references.

`LayoutDiagnostic` has `severity: "error" | "warning" | "info"`, `code`,
`nodeId: string | null`, `property` (a JSON Pointer relative to the definition),
and `message`. Use an empty property pointer for document-wide problems.

- Validation errors include `invalid-field`, `invalid-id`, `duplicate-id`,
  `duplicate-binding`, `invalid-nesting`, `invalid-size`, `unsupported-choice`,
  `invalid-metadata` and `limit-exceeded`. They block Save/Apply/export.
- Resolver warnings are `negative-free-space`, `zero-fill`,
  `empty-content-box` and `root-overflow`. They identify the responsible parent
  or child/property, but do not block Save. Report intentional `text-overflow`
  as information, not an invalid definition. Never change geometry to silence it.
- Hidden nodes still undergo structural validation. Their ordinary layout
  warnings are suppressed until visible; conversion preflight can report them.

`LayoutCommandError` has `code`, `message`, nullable `layoutId`,
`expectedRevision`, `actualRevision`, and `diagnostics: LayoutDiagnostic[]`.
Codes are `invalid-request`, `invalid-definition`, `limit-exceeded`,
`not-found`, `revision-conflict`, `protected-layout`, `storage-blocked`,
`storage-io`, `recovery-conflict`. Surface errors inline and retain the draft;
log storage failures through `tracing`. Do not turn them into empty libraries or
successful responses. Revision conflicts require explicit reload/reconciliation,
not automatic retries that overwrite another revision.

## Desktop operations and event boundary

The P2 Tauri commands below return `Result<..., LayoutCommandError>`.
Only `layouts_get` returns `LayoutLibrarySnapshot`; the mutations return
`LayoutMutationResult`. No library mutation is added to `Action`, HTTP or WS.

| Command           | Arguments                                                      | Required behaviour                                                                                                     |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `layouts_get`     | None                                                           | Read one coherent library/publication/storage-status snapshot.                                                         |
| `layouts_create`  | `name`, `definition`                                           | Validate and allocate a new saved id/revision 1; no publication.                                                       |
| `layouts_save`    | `id`, `expectedRevision`, `name`, `definition`                 | Replace only that exact saved revision; increment it once.                                                             |
| `layouts_rename`  | `id`, `expectedRevision`, `name`                               | Persist a name-only change and increment saved revision; never rename the frozen published source.                     |
| `layouts_delete`  | `id`, `expectedRevision`                                       | Reject Classic or the current published source; delete only the expected saved revision.                               |
| `layouts_apply`   | `selection: SavedLayoutSelection`, `expectedPublishedRevision` | Revalidate saved and published revisions after confirmation, freeze the root, persist, then publish. No implicit Save. |
| `layouts_recover` | `expectedRecoveryToken`                                        | Explicit confirmed backup-and-reset flow only; see recovery below.                                                     |

Rename is a saved-library operation: guard dirty work first, then rename; typing
the name of a new draft stays private until Save. A save whose normalized content
is identical is a no-op and returns the current revision. Rename to the same
name is likewise a no-op. Reject stale revisions even for a would-be no-op.
Deleting an absent id is `not-found`, not success.

Desktop events (implemented in P2; public wire forwarding remains P7):

- `layouts:library-changed`: `{sessionId, storageRevision}` after any committed
  layout-storage change, including Apply/recovery. Receivers subscribe before
  `layouts_get`; use storage ordering to reject stale read results.
- `layouts:published`: the full `PublishedLayoutSnapshot`, only after a committed
  publication change. Also forwarded through the public server event channel;
  P7 will serialize it to WebSocket clients.
- `layouts:storage-warning`: the current `LayoutStorageStatus`, desktop-only;
  `layouts_get` also carries it so a late-opening designer cannot miss a warning.

Appearance comparison omits ids, source/name/revision information and editor
metadata, and removes hidden subtrees before comparing the ordered render tree.
Retain every visible rendering property and binding identifier, not just current
sample pixels. Parent flow and remaining child order still matter.

The UI disables Apply for a dirty draft and confirms every appearance-changing
Apply, including Classic/custom transitions. The dialog identifies old/new
source names and dimensions, warns about changed OBS source size, and captures
both saved and publication revisions. On a conflict, keep output unchanged and
require a fresh comparison/confirmation. An exactly identical selection is a
no-op. A newer saved revision with identical appearance can update the frozen
source metadata without an appearance dialog, but is still a durable publication
change with a new published revision.

## Persistence, recovery and transaction completion

Use `app_config_dir()/layouts.json`; inability to resolve that directory is a
visible storage error, not permission to write in the working directory.

One service serializes every mutation and owns the in-memory document:

1. Under the mutation queue, check expected revisions and storage readiness.
2. Construct and validate the complete next document and checked revisions.
3. Write the same-directory `layouts.json.tmp`, flush and sync its writable
   handle, close it, then atomically replace the target, following the existing
   [preset persistence](../../../src-tauri/src/presets.rs) discipline.
4. Install the already-validated document in memory; release state locks.
5. Emit notifications and complete the command with the committed snapshot.

`storageRevision` increments on every actual commit; saved revision increments
only on changes to that entry; published revision increments only on publication
changes. Rename/Save never update the published selection. Apply never changes a
saved entry. No debounced writes are used for these explicit operations.

Use an owned service task for an accepted transaction so dropping a command
future/window does not cancel it between disk replacement and memory/event
commit. Normal shutdown drains accepted mutations. Failure before atomic
replacement leaves the previous file, memory and publication intact, with no
change notification. After replacement, installation/notification must not
depend on the initiating window; missed notifications are repaired by full reads.
Do not report an event-listener failure as if an already-committed Save rolled
back. Durable completion means flushed/synced file plus completed atomic
replacement, not a scheduled write; it is not a guarantee against hardware
failure. Verify replacement of an existing file on both Windows and Linux.

`LayoutStorageStatus` contains `state: "ready" | "blocked"`,
`code: null | "unreadable" | "corrupt" | "unsupported-schema" | "oversized"`,
`message: string | null`, `recoveryToken: string | null`,
`backupPath: string | null`. Paths/status never go to LAN consumers.

- **Absent file:** empty library and Classic publication revision 0, ready.
  No write is needed until the first mutation.
- **Valid schema 1:** validate everything and restore the exact frozen
  publication/revisions, not the latest saved root.
- **Malformed/invalid, oversized, unreadable or unsupported schema:** preserve
  the original path/bytes, log and show a persistent actionable warning. Use
  temporary Classic revision 0 and an empty read-only library. Block all layout
  mutations except recovery. Other match/control/recording functions continue.
  Never coerce a newer schema version to 1 or partially salvage entries.
- **Recovery:** offer **Back up and reset layout library**, explicitly naming
  the loss of access to the saved library and temporary Classic selection.
  A user can instead leave it blocked, restore a compatible file while the app
  is closed, or use a compatible app version. No general import/export is added.
  Bind the recovery token to the failed file identity; recheck it under the
  mutation queue. If the file changed, return `recovery-conflict` and reload
  status instead of overwriting the replacement.
- Before reset, copy the original bytes to an exclusively created
  `layouts.recovery-<uuid>.json` in the same directory, flush/sync it, then
  install a valid empty document atomically. Do not first rename away the only
  original. If reading/backing up/writing fails, remain blocked and preserve
  the original. An unreadable file requires correcting access before recovery
  can succeed. On success show the backup path, clear the block and emit the
  normal full notifications. Recovery advances the runtime storage/publication
  baselines rather than reusing revision 0 within that session.

Temporary files are never authoritative on startup; do not silently promote
them. Clean only the service's known temporary path. Tests must inject write,
sync and replacement failures, cancellation of the requester, concurrent saves,
unsupported schemas and backup failure.

## Public synchronization and ordering

Create one new runtime `sessionId` per `AppState` lifetime. A server restart
within that state retains it; a process restart creates a new one. Pair it with
published revision, not match revision.

- Page bootstrap adds `window.__SCOREBOARD__.publishedLayout`, containing the
  full `PublishedLayoutSnapshot`.
- WS adds `{type: "layout", data: PublishedLayoutSnapshot}`. Send it on every
  socket connection, Apply/recovery and lag resynchronization, even when the
  selected layout is Classic. Existing state/auth/event frames keep their
  meanings; do not make match changes wait for a layout change.
- Subscribe to the broadcast channel before reading current publication.
  Send the snapshot and discard queued duplicates by revision, so a concurrent
  Apply cannot be lost between initial read and subscription. Resync on lag
  uses the same full-read approach.
- Extend both transports with `getPublishedLayout()` and
  `subscribePublishedLayout(callback)`; the Tauri implementation listens before
  reading and WS retains the current full snapshot. These are required methods,
  not optional callbacks that can quietly omit cold/reconnect synchronization.
- A client compares revisions only within the same session. Its current socket
  connection's initial snapshot establishes the session; discard callbacks from
  retired sockets. A new session replaces the previous baseline even if its
  revision is lower. Ignore duplicates/older revisions within one session.
- Swap a complete validated render root atomically. A disconnected page may
  keep its last valid output while reconnecting; cold load uses bootstrap, not a
  fabricated Classic fallback. Invalid wire data is reported as a protocol
  error, retaining an existing valid scene or showing an explicit unavailable
  state if none exists.

Do not transmit the library, editor metadata, draft samples or recovery paths.
Published changes do not restart the timer/server or mutate recording state.
LAN renderer/transport dependencies must remain free of Tauri imports.

## Shared rendering inputs

The Tauri-free adapter produces one `LayoutRenderInputs` shape for live state,
sample preview and recorded snapshots. This is an internal TypeScript value
object, not a new persistence/IPC contract or a second match model.

| Rendering input           | Live `ScoreboardState` field      | Recorded `Snapshot` field |
| ------------------------- | --------------------------------- | ------------------------- |
| `timerSeconds`            | `timer`                           | `tm`                      |
| `periodPrefix`            | `halfPrefix`                      | `hp`                      |
| `periodNumber`            | `half`                            | `hf`                      |
| `homeName` / `awayName`   | `teamHomeName` / `teamAwayName`   | `hn` / `an`               |
| `homeScore` / `awayScore` | `teamHomeScore` / `teamAwayScore` | `hs` / `as`               |
| `homeColor` / `awayColor` | `teamHomeColor` / `teamAwayColor` | `hc` / `ac`               |

Sample data uses these same fields, locally only. Bind period prefix/number
separately; reuse existing continuous `MM:SS` timer formatting for `timerSeconds`
(`3600` seconds is `60:00`, not an hours format). Do not derive timer values from recording timestamp
`t`, wall-clock time or current live direction. Preserve recorded identity on
every frame, including changes during a recording.

Resolve static tree geometry only when the definition changes. Resolve dynamic
strings/colours against the current inputs without rebuilding unrelated boxes.
Nothing here dispatches an `Action`, changes settings or filters recording fields.

## Font, text and border rendering contract

Load the exact bundled font face/weight before measuring or exposing a custom
scene in preview, LAN output or export. Use the existing Anton/Poppins assets;
font-load failure is visible and blocks the new render/job, not a fallback-font
frame. Cache measurements by font/weight/size and text, not by live match state.

Use the [editor box math](scoreboard-designer-editor.md#approved-p0-editor-contract)
in both renderers. Border is an inside ring, not a centered Canvas stroke.
For a resolved box `(w,h)`, effective border is
`min(borderWidth, w/2, h/2)` and effective outer radius is
`min(radius, w/2, h/2)`. The inner radius is
`max(0, effectiveRadius - effectiveBorder)`. Fill the outer rounded background,
then the border ring; neither shape clips descendants/text.

Text uses the inner border box (no value/text padding). For line height `L`,
font ascent/descent `A,D`, and `k` explicit lines, block height is `k*L`.
Use `a = 0, 0.5, 1` for start/center/end:

- First line-box top is `contentY + aY * (contentHeight - k*L)`.
- Baseline for line `i` is
  `lineBoxTop + i*L + (L - A - D)/2 + A`.
- Horizontal anchor is `contentX + aX*contentWidth`, with matching
  left/center/right text anchor. Use advance width for horizontal text extent,
  not glyph ink bounds. Negative free space is not clamped.

Measure `A,D` from the same reference string `Hg0123456789` for that font face
and size using Canvas text metrics; use the same baseline contract in the live
text primitive. A static label's empty/trailing lines still occupy line height.
Bound values are single-line and retain existing timer/score/period formatting.
Only score Rolling may use its internal transition mask; canvas scores are
static. Root clipping applies equally to both renderers.

P4 must demonstrate the baseline/border contract on supported Windows/Linux
webviews and a LAN browser before P5. Geometry/colours must agree exactly;
allow at most one device pixel of text/rounded-edge rasterization difference at
100% output scale, not shifted boxes, different line breaks, fallback fonts or
different clipping. If this cannot be achieved, stop and revise the rendering
architecture; do not add per-renderer layout offsets.

## Video session and byte budget

Extend `VideoGenerationConfig` with `layout: SavedLayoutSelection`, defaulting to
Classic only for existing callers that omit the new field. Keep the existing
frame-rate `1..=60` and finite scale `0.5..=3.0` bounds. Invalid selections/revisions
fail before starting ffmpeg.

Resolve and clone the chosen saved root under the layout service at job start.
Return that same frozen `PublishedLayoutSelection` shape as
`GenerationStarted.layout` (source metadata does not mean it is live-published),
plus validated `scale`, `contentWidth`, `contentHeight`, output `width`, `height`
and `batchFrames`, alongside the existing total frame count. Classic has no
custom root. The frontend uses this response, not a later library lookup.

For custom roots, `contentWidth = root.width * scale` and
`contentHeight = root.height * scale`. Output dimensions are
`2 * ceil(contentWidth / 2)` and `2 * ceil(contentHeight / 2)`.
Render at the exact uniform scale at the top-left; any fractional/even-dimension
remainder is transparent right/bottom padding. Never resize/stretch the scene to
fill that padding. Display exact resulting dimensions before generation.
Classic retains the current `frame_dimensions` rounding and canvas behaviour.

Validate padded dimensions against the approved landscape/portrait predicate on
both sides, before frame allocation/ffmpeg startup. Disable incompatible scale
options with an explanation; backend validation still rejects forged requests.
Use checked multiplication for `frameBytes = width * height * 4`.

```text
budgetBytes = 32 * 1024 * 1024
batchFrames = min(30, floor(budgetBytes / frameBytes))
```

Reject zero or out-of-range dimensions and `batchFrames < 1`; do not silently
override scale. Enforce the same calculated byte ceiling in the Rust raw-binary
push path, checking whole-frame length, count and remaining job frames before
accepting data. One awaited batch in flight; release/reuse the previous buffers
before allocating another. This is a raw-payload ceiling, not a total-process
memory claim. Preserve cancellation, encoder backpressure/error propagation and
partial-file cleanup. Later saves/deletes/Apply cannot change the job's clone.

## Native close and Quit coordination

Use one Rust close coordinator for designer close, main close and normal Quit.
The existing main-close `close_all` and `ExitRequested` recording flush in
[lib.rs](../../../src-tauri/src/lib.rs) must run only after this guard permits it.

1. A mounted designer registers its listener, then invokes `designer_ready`.
   Reset readiness when that window is destroyed. If no designer exists,
   proceed through existing shutdown behaviour.
2. Intercept/prevent the native close/exit before destroying windows. Send
   `designer:close-requested` with `{requestId, reason}`, where reason is
   `close-designer`, `close-main` or `quit`.
3. The designer checks its current draft, including pending property/name edits.
   Clean work allows immediately; dirty work presents one Save / Discard / Cancel
   prompt. Save commits valid pending edits and awaits durable Save, then allows;
   invalid input/failure keeps the prompt/draft open. Discard allows; Cancel
   cancels the entire pending close, including application exit.
4. The UI invokes `designer_resolve_close` with `requestId` and
   `decision: "allow" | "cancel"`. Ignore stale request ids with an explicit
   invalid-request response. Repeated closes share one pending prompt; a main
   close/Quit can upgrade a designer-only request to application shutdown.
5. An initializing/unresponsive designer must not authorize data loss. Cancel
   the pending close with a visible error after 10 seconds without a ready
   listener/acknowledgement; an active user prompt has no timeout. A
   `designer_close_prompt_opened {requestId}` acknowledgement distinguishes a
   displayed prompt from an unresponsive listener.
6. On allow, drain accepted layout mutations and authorize only the matching
   close intent once, avoiding recursive prompting. Then close the designer or
   execute the existing full shutdown/recording flush, as appropriate. Cancel
   does not flush/stop a still-running recording or close unrelated windows.

The three coordinator commands (`designer_ready`, `designer_resolve_close`,
`designer_close_prompt_opened`) return `Result<(), LayoutCommandError>` and are
desktop-only. Readiness has no arguments; request ids are UUIDs. For an upgraded
intent, resend the same request id with the new reason and update the existing
prompt, not a second dialog.

This guard does not promise draft recovery after crashes, OS force-kill or
power loss. Verify native menu Quit, main close, designer close and API-triggered
window close on Windows and Linux, including Save failure and duplicate requests.

## Automated setup and acceptance evidence

P0 changed documentation only: no dependency, runner, binding or placeholder
application module was added then. P3 introduced dev-only Vitest with its first
pure resolver tests, a `test:unit` script using `vitest run`, and inclusion in
`pnpm check`. Tests use the Node environment, with no DOM emulation/browser test
dependency. The config is separate from the app's Vite/Tauri plugins and covered
by the existing Node TypeScript configuration.

Use the [approved fixtures](scoreboard-designer-editor.md#approved-fixtures)
for table-driven numerical geometry/binding tests and P4 live/canvas parity.
P1/P2 use existing Rust tests for contracts, boundaries, persistence and
conflicts. P7 extends the standalone-server/WS smoke approach. P8 extends the
existing video integration path and checks exact payload counts.

Acceptance includes every inclusive limit and the next invalid value, hidden
duplicate bindings, zero-content boxes, signed alignment during overflow,
conversion rejection, both timer directions, independent score choices and
recorded/live/sample binding equivalence. Byte-budget cases include:

| Final frame | RGBA bytes | Required batch count |
| ----------- | ---------- | -------------------- |
| 622 x 80    | 199,040    | 30                   |
| 1920 x 1080 | 8,294,400  | 4                    |
| 3840 x 2160 | 33,177,600 | 1                    |
| 2160 x 3840 | 33,177,600 | 1                    |

Odd-size fixture `621 x 79` at scale 1 produces `622 x 80` with transparent
right/bottom padding; at scale 1.5 it has content `931.5 x 118.5` inside
`932 x 120`. Root `3840 x 2160` at scale 1.01 must fail, never downscale.
Measure process memory in P9 as well as checking this arithmetic.
