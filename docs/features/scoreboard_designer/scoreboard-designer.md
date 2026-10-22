# Scoreboard Designer - planned, not implemented

> **Status:** planning only. No designer, layout-library commands, custom-layout
> renderer or publishing protocol described here has been implemented.
>
> The product decisions below, including the P0 defaults approved on 2026-10-20,
> define the planned feature. P0 is complete; no application implementation is
> claimed. Future technical contracts are recorded separately.

This document defines the feature's scope, saved-definition lifecycle and external
behaviour. Companion documents cover:

- [Editor UI and interactions](scoreboard-designer-editor.md).
- [Approved P0 technical contracts](scoreboard-designer-contracts.md).
- [Proposed architecture and implementation plan](scoreboard-designer-implementation.md).

## Goal and boundary

Let users design, save and select their own scoreboard appearance. A definition is
declarative layout data interpreted at runtime, not generated application code.
Applying it must not require rebuilding or restarting the app.

**Definitions affect the published appearance, never the match model or controls.**
The desktop main window and phone remote retain their existing functionality.
Omitting or hiding a value does not remove the underlying field, disable its
controls, stop its updates or exclude it from match recordings.

For example, an operator must still be able to change the away score when the
published layout contains no away-score element.

| Surface                          | First-release behaviour                                 |
| -------------------------------- | ------------------------------------------------------- |
| OBS `/scoreboard`                | Render the explicitly published layout                  |
| Outputs & Sharing preview        | Render the same published layout                        |
| Designer workspace               | Preview an unpublished draft using sample or live data  |
| Video Generator                  | Render a selected saved layout with recorded match data |
| Desktop and phone match controls | Unchanged; operate on every existing match field        |
| Match recording                  | Continue storing layout-independent match data          |
| `/value/*` outputs               | Keep their existing independent presentation            |

Only one layout is published at a time. A library of saved definitions does not
introduce multiple simultaneous matches or independently controlled scoreboards.

## Agreed definition model

Each custom definition has one required **rendering area**, which is the root of
an element tree. It determines the output dimensions and overall background,
including transparency.

| Element kind   | Multiplicity and role                                        |
| -------------- | ------------------------------------------------------------ |
| Rendering area | Exactly one root; defines output bounds                      |
| Container/area | Repeatable, generic and nestable; groups and styles children |
| Bound value    | Each named match value may appear at most once               |
| Static text    | Repeatable user-defined labels                               |
| Rectangle      | Repeatable decoration, including team-colour bars            |
| Separator      | Repeatable horizontal or vertical decoration                 |

The unique bound values are timer, period prefix, period number, home name, home
score, away name and away score. Prefix and period number are separate elements,
not one inseparable formatted label. Existing match-value formatting remains the
baseline; configurable timer-format variants are not part of this initial scope.

Areas are not special semantic parents. A user may name a generic container
"Timer area" or "Scoreboard area", but the timer can be placed in another
container or directly under the rendering root. Original area/value slot names
are useful naming conventions, not a required hierarchy.

Not adding an element means it is not rendered. Hiding an existing element
preserves its configuration while omitting its output. Neither operation changes
match state.

See the [layout rules](scoreboard-designer-editor.md#layout-rules) for Free,
Row and Column containers, sizing and overflow.

## Initial appearance capabilities

Custom layouts support basic box and text styling:

- Pixel positioning and dimensions, with fill-remaining-space sizing in
  rows/columns.
- Solid backgrounds with transparency, borders and rounded corners.
- Container padding, gaps and alignment.
- Bundled fonts, font size, text colour and text alignment.
- Fixed colours or bindings to the current home/away team colour for backgrounds,
  borders and text.
- An independent **None / Rolling** animation selection on each score value.

Team-colour bindings follow the match data. Changing settings or loading a team
fixture can therefore change bound colours without modifying the layout.
Definitions do not store a replacement team identity.

The animation choice should be represented by an extensible identifier rather
than a new boolean concept, so additional effects can be offered later. Only
None and the existing Rolling effect are in scope now.

**Text overflow is intentional.** Text is not automatically shrunk, truncated,
ellipsized or fitted to its box. It may extend beyond element and container
bounds, but anything outside the rendering area is cut off. Rolling animation
retains its internal transition mask; that must not become general value-box
clipping.

## Classic compatibility

The current skewed scoreboard remains available unchanged as a protected
**Classic** built-in. It is selectable for live output and video export, but
cannot be edited, deleted or duplicated into a custom layout: skew is outside
the initial custom-designer capabilities.

Custom layouts use their own per-score animation selections. The existing
global score-animation setting continues to control Classic and individual
`/value/*` score outputs, not custom layouts. UI wording must explain that scope.
New score elements and both starter scores default to **None**.

New custom layouts offer **Blank** and a **basic editable scoreboard starter**.
The starter uses supported rectangular styling and the standard bound values;
it is not an editable copy of Classic. Users can also duplicate their own saved
custom layouts.

## Rendering dimensions and OBS

Users can choose a tight frame around the board or a complete video-sized frame
with the board positioned inside it. The root has user-defined dimensions within
the supported bounds.

The first release includes output up to **3840 x 2160**, or the portrait
equivalent **2160 x 3840**. Export limits also apply after scaling. Unsupported
sizes must produce an explicit error rather than silently reducing resolution.
Custom root dimensions are positive integer pixels. A square larger than
2160 x 2160 is therefore not supported, even if neither axis exceeds 3840.

The `/scoreboard` URL remains stable when layouts change. Applying a definition
updates the page contents, not its address.

The app cannot automatically resize an existing OBS Browser Source. Outputs &
Sharing must display the published dimensions, and Apply confirmation must warn
when source dimensions need changing. Preview dimensions must not remain
hardcoded to Classic.

Editor zoom, changing a container's bounds, and scaling a video export are
different operations; see the [editor document](scoreboard-designer-editor.md).

## Draft, saved and published states

These are deliberately separate:

| State              | Meaning                                                     |
| ------------------ | ----------------------------------------------------------- |
| Draft              | Temporary, unpublished editing state                        |
| Saved definition   | A reusable definition in the local library                  |
| Published snapshot | The exact definition currently used by external live output |

**Save never publishes**, even when editing the layout that is currently on air.
The saved source can be newer than its published snapshot. The UI must
distinguish unsaved work from saved changes that have not been applied.

Apply publishes a saved snapshot. Confirm every Apply that changes the published
appearance, including changes that do not alter dimensions. Cancelling leaves
the output unchanged.
Apply is disabled while the draft is dirty; Save must complete first. There is
no implicit Save-and-Apply action. Recheck the selected saved revision and current
publication after confirmation; a conflict requires a fresh review rather than
silently applying a different revision.

Applying must not pause, reset or otherwise mutate the timer, scores or period.
It remains possible during a running match or recording. Connected outputs must
receive the new layout without an app restart or manual page refresh.

The exact published snapshot survives app restarts, even if a newer saved
definition was never applied. Match values continue following their existing
persistence rules; persisting the layout does not start persisting match progress.

## Library and unsaved-work lifecycle

The first release provides local **New, Rename, Duplicate and Delete** operations.
Custom definitions are stored in the app configuration directory. Import/export
between installations is deferred.

A published source layout cannot be deleted until another layout is applied.
Classic remains protected independently of whether it is published.
New and Duplicate open private drafts; the library entry is created on first
successful Save. Rename operates on a saved entry after guarding dirty work.
Layer names and locks are saved; selection, sample data and viewport are not.

Use explicit Save and **Save / Discard / Cancel** prompts when switching layouts
or closing a dirty designer. Unsaved crash recovery is not included initially.
Normal application shutdown must be considered when implementing the close guard;
handling only an in-window navigation button would be incomplete.

Errors must be visible. A failed Save or Apply must not report success, discard
the draft or unexpectedly replace the published appearance.

If layout storage is unreadable, corrupt, oversized or from an unsupported
schema, preserve the original file and show an actionable warning. Use temporary
Classic output and block layout writes until explicit recovery. **Back up and
reset layout library** requires confirmation and a successful backup before
replacement; cancelling leaves the original untouched. Do not silently overwrite
a newer schema or report an empty library as a successful load. See the
[recovery contract](scoreboard-designer-contracts.md#persistence-recovery-and-transaction-completion).

### Approved first-release resource restrictions

These constraints are visible validation rules, not silent truncation:

- At most 100 saved custom layouts, 256 nodes per definition (including the
  root), and tree depth 16 (including the root). Hidden nodes count.
- Static labels contain at most 2,048 Unicode characters; layout/layer names
  contain 1..128 characters after trimming.
- Child positions range from -16,384 to 16,384 logical pixels; fixed child
  dimensions from 1 to 8,192. Fill may resolve to zero with a warning.
- Font sizes are 1..512 pixels; padding, gap and radius 0..4,096; border width
  0..256. All geometry must be finite.
- A definition is at most 1 MiB serialized; the entire layout file, including
  the published copy, is at most 16 MiB.

These limits constrain designs/libraries, not match data or control availability.
The [validation contract](scoreboard-designer-contracts.md#validation-limits-and-diagnostics)
defines exact counting, diagnostics and boundary checks.

## Recording and video behaviour

Recordings continue to represent match data, not broadcast appearance. No layout
snapshot or layout-change timeline is added to recordings for this feature.

Video Generator lets the user select a saved custom layout or Classic. The
selected definition is frozen at generation start and used for the entire job.
Later saves, deletes or live Apply operations cannot change that job.

The selected layout binds to each recorded snapshot, including its recorded
team names, colours and period prefix, not the current live match settings.
The same recording can be exported again with a different layout.

Video initially matches layout and values with **static score changes**. It does
not reproduce live rolling animations or attempt to reconstruct the appearance
that was on air during the original match.

Custom export scales uniformly and adds transparent right/bottom padding to
reach even output dimensions; it never stretches the design. Show the exact
resulting dimensions and reject oversized final frames. Classic retains its
existing dimension rounding. Raw frame batches are limited to 32 MiB and
30 frames, with one awaited batch in flight; a valid 4K frame fits once.

## Deferred capabilities

- Imported images/logos and fonts, gradients, shadows, rotation and skew in
  custom layouts.
- Additional score-animation effects and animated transitions in exported video.
- Multi-selection, bulk alignment/distribution and element copy/paste.
- Definition-file import/export and crash-recovered drafts.
- Percentage sizing, responsive breakpoints, weighted fill and content-sized
  containers.
- Arbitrary HTML, JavaScript, CSS or scripting supplied by definitions.

## Behavioural examples

| Scenario                              | Required result                                         |
| ------------------------------------- | ------------------------------------------------------- |
| Away score omitted                    | Controls and recordings still update that match field   |
| Save an edited published source       | Library changes; live output does not                   |
| Restart after that Save without Apply | Restore the older published snapshot                    |
| Cancel Apply                          | Keep the previous published layout and all match values |
| Apply while timer runs                | Appearance changes; timer keeps running                 |
| Hide a Row child                      | Its layout space is removed; match field remains intact |
| Long text extends beyond a container  | Keep overflow visible until the rendering-root edge     |
| Choose a different export layout      | Use it without changing the live published layout       |
| Save or Apply during video generation | The export keeps its frozen selected definition         |
| Request oversized scaled video        | Show an error; do not silently downscale                |
