# Scoreboard Designer - editor design

> **Status:** P5 shell/library/numeric editing and P6 direct manipulation,
> history, viewport controls and native close guards implemented on 2026-10-25.
> Open **Broadcast → Scoreboard Designer…** for private drafts, tree/numeric
> editing and explicit durable Save. Apply remains disabled until P7.
> Native designer close, main close and Quit use Save/Discard/Cancel.
> The scope below also describes future Apply/publication capabilities.

See the [feature contract](scoreboard-designer.md) for scope and publishing, and
the [implementation plan](scoreboard-designer-implementation.md) for architecture.

## Window and workspace

Use a dedicated, resizable **Scoreboard Designer** window, following the existing
pattern of separate feature windows rather than adding panels to the main
match-control window.

The proposed arrangement is:

```text
 Layout selector   [Saved / Modified / Published status]
 New / Rename / Duplicate / Delete     Undo / Redo   Save   Apply
 --------------------------------------------------------------
 Elements / Layers    | Workspace             | Properties
                      |                       |
 + Add                | Checkerboard          | Selection-specific
 Rendering area       | Scoreboard preview    | settings
   Container          | Selection outlines    |
     Timer            | Handles and guides    |
     Period prefix    |                       |
     Period number    |                       |
   ...                |                       |
 --------------------------------------------------------------
 Sample / Live preview       Grid / Snap       Zoom / Fit
```

This is an information-layout sketch, not a final pixel design. Initial
window/sidebar dimensions are specified in the approved workspace defaults below.

### Header and library access

The header identifies the selected saved layout and whether the draft is dirty,
whether it is the published source, and whether saved appearance changes are
still unapplied.

Provide local New, Rename, Duplicate and Delete actions without requiring users
to leave the designer for routine library management. New offers Blank and the
basic supported scoreboard starter. Classic is selectable but protected from
editing, deletion and duplication.

Keep Save and Apply visibly distinct. A Save button must not have a hidden
publishing side effect.

### Elements and layers

Use a tree to expose grouping and nesting. It must support:

- Adding values, containers and repeatable decorations.
- Selecting elements that are small, hidden, covered or difficult to click.
- Reordering siblings and moving elements between containers.
- Hiding and locking elements.
- Naming generic containers so users can identify their purpose.

A named value already present in the definition cannot be added again, including
when its existing instance is hidden. Hide preserves the instance; deletion
makes the value available to add again.

Tree order determines Row/Column arrangement and painting order. Locking affects
editor manipulation only, never match-data updates. Hiding a container also hides
its descendants from output without deleting their configuration.

### Workspace

Show transparency with a checkerboard. Keep selection outlines, handles, grid,
guides and editor warnings separate from the actual rendering composition.
None may appear in OBS or video export.

Provide single selection, zoom, pan and Fit. Users must be able to inspect
overflowing or overlapping content and select the responsible element through
the tree.

Zoom changes only the editor view. Pointer coordinates must be converted into
logical layout coordinates so moving/resizing at different zoom levels produces
the same saved result.

### Properties

Only show controls relevant to the selected element and its parent's layout.

| Selection       | Properties                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| Rendering root  | Output width/height, background and transparency                           |
| Container       | Size, Free/Row/Column mode, padding, gap, alignment, basic box styling     |
| Bound value     | Size, applicable position, bundled font, font size, colour, text alignment |
| Home/away score | Bound-value properties plus independent None/Rolling selection             |
| Static text     | Label content and basic text styling                                       |
| Rectangle       | Size, applicable position and basic box styling                            |
| Separator       | Horizontal/vertical orientation, size/thickness and colour                 |

Background, border and text colours can be literal or bound to the home/away
team colour. Do not bake a live team's colour into a definition when the user
selected a binding.

Free children expose coordinates. Row/Column children expose order and layout
sizing rather than suggesting that dragging to arbitrary coordinates is
supported there.

## Layout rules

### Tree and coordinate system

The rendering root defines the output bounds. Container children may be other
containers, bound values or decorations.

For example:

```text
Rendering area (1920 x 1080, transparent, Free)
  Scoreboard area (positioned freely, Row)
    Clock area (Column)
      Timer
      Period area (Row)
        Period prefix
        Period number
    Home area (Column)
      Home name
      Home score
    Away area (Column)
      Away name
      Away score
```

Names in this example have no special semantics. The timer could instead stand
alone, and a user need not include every standard value.

Positions are parent-relative logical pixels. Editor zoom and operating-system
display scaling do not change the stored geometry.

### Container modes

Every container chooses one mode for all direct children:

| Mode   | Child placement                                | Direct manipulation                  |
| ------ | ---------------------------------------------- | ------------------------------------ |
| Free   | Explicit positions and sizes; overlaps allowed | Drag to move; handles to resize      |
| Row    | Horizontal arrangement in tree order           | Reorder; edit size/layout properties |
| Column | Vertical arrangement in tree order             | Reorder; edit size/layout properties |

Use nested containers to combine modes. Freely positioned exceptions inside a
Row/Column container are not included initially.

Rows/columns use pixel sizes plus fill-remaining-space sizing. Fill children share
remaining space equally. Fixed children never implicitly shrink or wrap.
Padding and gaps participate in the available-space calculation. If the layout
does not fit, show an editor warning rather than silently changing fixed sizes.

Hidden children consume no Row/Column space, including no extra gap for their
missing entry. Hiding/deleting a Free child does not move its siblings.

### Resizing and changing modes

Resizing an area changes its bounds, not the scale of its descendants:

- Free children keep their own positions and sizes.
- Row/Column children are resolved again using the parent's layout rules.
- Resizing the rendering root does not automatically scale the scoreboard.

Switching a container to Free preserves the currently computed positions and
sizes of its children. Switching to Row/Column arranges children in tree order.
The mode change is undoable.

Editor zoom, resize and export scale must have distinct names and behaviour.
There is no separate proportional-descendant scale operation in the initial
editor.

### Overflow and clipping

The rendering root is the final output clip boundary. Containers and value boxes
must not automatically clip overflowing text, including when they have rounded
backgrounds or borders.

Do not automatically shrink, truncate, ellipsize or enlarge an element to fit
text. Rows/columns arrange declared boxes, not the painted extent of their text.
Overlapping text is therefore possible and intentional.

The rolling score effect keeps the mask needed for its own transition. That
internal mask must not change the general overflow rule for score values.

### Deletion

Deleting a non-empty container asks for confirmation before deleting the
subtree. It does not silently promote children into the parent. The removal must
be undoable.

The rendering root cannot be removed as an ordinary child element.

## Interaction scope

The first release includes:

- Single selection through workspace or tree.
- Free-mode dragging and resize handles.
- Row/Column reordering and tree-based reparenting.
- Numeric property editing.
- Undo/redo and keyboard nudging.
- Zoom/pan and Fit.
- Toggleable grid and edge/center snapping.
- Hide and lock.

Multi-selection, bulk alignment/distribution and element copy/paste are deferred.
Duplicating an entire saved custom layout remains available in the library.

### History and keyboard behaviour

Approved commit boundaries:

- Treat one drag/resize as one undo operation, not one per pointer event.
- Group numeric/text property edits into coherent commits.
- Track dirtiness against the saved definition, not the number of history entries.
- Keep designer shortcuts window-scoped and preserve native text-field editing.
- Do not include match updates, preview data or viewport movement in definition
  undo/redo history.

Commit numeric/text edits on Enter or blur; Escape restores the pre-edit value.
Invalid/incomplete input stays local and visibly invalid, never replacing valid
draft geometry. A dropdown, hide/lock toggle, reorder, reparent or mode change
is one history entry. Save updates the comparison baseline without clearing
history; Undo/Redo recompute dirtiness against that baseline.

Pending definition/name edits count as unsaved work before their commit.
Save first commits valid pending input and reads that resulting draft; invalid
input blocks Save and stays visible. Navigation/native-close guards include
pending edits, not only the last valid definition. Discard can explicitly abandon
them; Cancel preserves them. A new/duplicated draft is unsaved until first Save,
even if the user has not changed its initial content.

Use Ctrl+S Save, Ctrl+Z Undo, Ctrl+Shift+Z or Ctrl+Y Redo, arrows for 1 logical
pixel nudges and Shift+arrows for 10. Nudging applies only to an unlocked Free
child. Inputs/contenteditable retain native editing, selection and undo; shortcuts
do not leak to other windows. Delete removes the selected non-root subtree with
the existing non-empty-container confirmation. Escape cancels an active gesture
or edit before any window-close handling.

## Preview data

Provide two modes:

| Mode   | Behaviour                                                                 |
| ------ | ------------------------------------------------------------------------- |
| Sample | Editable names, colours, scores, timer, prefix and period for design work |
| Live   | Read-only view of the current authoritative match                         |

Sample changes must never dispatch match actions or modify settings. A score
change in sample mode can demonstrate the selected animation without changing
the real score.

Use sample data to inspect long names, multi-digit scores, timer values and
overlaps. Changing preview data does not save those values into the published
definition.

The workspace always previews the draft. Switching to Live data does not publish
the draft or turn it into the Outputs & Sharing preview.

## Save, Apply and close behaviour

Save persists the definition only. Apply publishes a saved snapshot and confirms
an appearance change. The confirmation should identify the old/new layout and
dimensions, with an OBS-size warning when appropriate.

Disable Apply while the draft is dirty, requiring Save first. Do not silently
combine Save and Apply or accidentally apply an older saved revision while
displaying a newer draft.

Use Save / Discard / Cancel on dirty layout selection changes and close.
A save error leaves the draft open and dirty. Cancel leaves the current selection
and work intact. Include ordinary application shutdown in the close-guard design.

## Approved P0 editor contract

P0 defaults were approved on 2026-10-20. The companion
[technical contracts](scoreboard-designer-contracts.md) define the future Rust
model, diagnostics and renderer requirements. No implementation is implied.

### Box model and flow math

The rendering root is always Free at `(0,0)`, with no border/padding. Every child
width/height is a border-box size. Child positions are relative to the parent's
**content origin**, not its outer border edge.

For parent outer position `(X,Y)`, dimensions `(W,H)`, requested border `b`,
and padding `(pt,pr,pb,pl)`, use:

```text
B = min(b, W/2, H/2)
contentX = X + B + pl
contentY = Y + B + pt
contentW = max(0, W - 2*B - pl - pr)
contentH = max(0, H - 2*B - pt - pb)
```

Non-container leaves have no padding. A zero content box is permitted at
resolution time; show an `empty-content-box` warning when border/padding consume
an axis. Keep the declared padding and content origin, even when the resulting
content length is zero. Do not move or scale descendants to compensate.

For Row use width as the main axis; Column transposes the calculation:

1. Remove hidden children/subtrees. With `n` remaining children, total gap is
   `max(0,n-1) * gap`.
2. Let `M` be the content main length, `F` the sum of fixed main sizes and `q`
   the number of main-axis Fill children. Each Fill is
   `max(0, M - F - totalGap) / q` when `q > 0`.
3. Let `used` be the sum of resolved main sizes plus total gap. The initial
   main offset is `a * (M - used)`, where `a` is 0, 0.5 or 1 for
   start/center/end. This offset may be negative during overflow.
4. A cross-axis Fill occupies the full content cross length. A fixed cross size
   is unchanged. Cross offset is `aCross * (contentCross - childCross)`, again
   signed rather than clamped.
5. Place children in tree order, adding each main size and gap. Do not round
   intermediate fractional positions or give a rounding remainder to one child.

Emit `negative-free-space` for overcommitted fixed sizes/gaps and `zero-fill`
for exhausted Fill. Fixed boxes never shrink, wrap or disappear. Flow has no
stretch/space-between mode or per-child alignment override. In Free mode,
positions/sizes are explicit and Fill is not permitted.

Painting is depth-first in tree order: parent background/border first, then its
children; later sibling subtrees paint over earlier ones. Only the rendering
root clips. Hidden subtrees do not paint or hit-test. Locked ancestors prevent
workspace manipulation of descendants; tree selection remains available so
users can unhide/unlock an ancestor. Locking never affects output or match data.

### Mode conversion and reparenting

Preflight the whole operation and commit it as one undo entry, or reject it with
an actionable error and leave the draft unchanged:

- Flow to Free freezes each child's computed size and position relative to the
  unchanged content origin.
- Free to Row/Column freezes computed sizes as fixed, sets stored `x/y` to zero,
  and arranges children in tree order. Row to Column (or reverse) retains each
  axis's Fixed/Fill choice, then resolves with the new main/cross axes.
- Reparenting into Free preserves computed global bounds by subtracting the new
  parent's content origin. Reparenting into flow freezes computed width/height
  as fixed, resets `x/y` to zero, and uses the requested insertion index.
  Changing to Fill is a separate explicit edit.
- Visible nodes use their current computed bounds. For hidden nodes with no
  scene bounds, calculate a temporary all-visible projection solely for
  conversion; never unhide them or move visible siblings as a side effect.
- Reject cycles, non-container targets, protected/locked changes and converted
  coordinates/sizes outside the approved limits. In particular, a zero-size
  Fill cannot silently become a 1px fixed box: reject that conversion and ask
  the user to give it nonzero space first. No partial subtree conversion.

### Workspace defaults

Default window is 1280 x 800, minimum 1000 x 640, with resizable Layers and
Properties sidebars initially 240 and 300 pixels. They share the remaining
workspace without affecting logical output dimensions. Default preview is
**Sample**. Start with Fit; preserve viewport only for the current window session.

Grid spacing is 8 logical pixels, initially off. Snapping is initially on.
Consider visible sibling/parent edges and centers, plus grid lines when the grid
is enabled; exclude the moving node/subtree and hidden nodes. Choose the nearest
candidate within `6 / zoom` logical pixels on each axis; edge/center wins a tie
with the grid, then tree order breaks remaining ties. Resize snaps only the
active edges. Nudging uses the exact 1/10px increments without snapping.
Show guides only in the editor.

Save node labels/lock metadata. Do not save sample values, selection, zoom/pan,
grid/snap toggles or sidebar widths into a definition. Compare full saved
definition plus name for dirtiness, but exclude editor metadata from published
appearance comparison. Grid/viewport/sample changes are not undo entries.

### New-element defaults

All new nodes are visible and unlocked. Add to the selected root/container, or
the selected leaf's parent, at the end of its children. Free insertion starts at
`(0,0)`; flow uses insertion order. Borders/radius/padding/gap are zero,
background is transparent, text is white with center/center alignment unless
specified below. Containers default to Free, start/start flow alignment.

| New element            | Fixed size         | Initial content/style                         |
| ---------------------- | ------------------ | --------------------------------------------- |
| Container              | 160 x 80           | Empty children                                |
| Timer                  | 120 x 48           | Anton 400, 36px                               |
| Period prefix / number | 100 x 24 / 40 x 24 | Poppins 400, 14px                             |
| Home/away name         | 200 x 32           | Poppins 600, 18px                             |
| Home/away score        | 80 x 48            | Anton 400, 40px; animation None independently |
| Static text            | 160 x 32           | `Label`, Poppins 400, 24px                    |
| Rectangle              | 100 x 24           | Solid white background                        |
| Separator              | 100 x 2            | Horizontal, solid white                       |

The default library name is `Untitled layout`. Names are editable and not
unique. Leaf labels use their element/value name; a container starts as
`Container`. New bound values must still satisfy the unique-binding constraint.

Static labels permit explicit line breaks, with no automatic wrapping.
Line height is 1.25 times font size. Align the complete line block vertically;
each line uses the selected horizontal alignment. Long/multi-line text overflows
without changing its box until clipped at the rendering root.

## Approved fixtures

Use these definitions across Rust validation, pure geometry tests and live/canvas
parity checks. Use stable deterministic UUIDs in fixtures, new UUIDs for real
New/Duplicate operations. All unspecified properties use the defaults above.

### Blank and editable starter

**Blank:** transparent 622 x 80 Free root, no children.

**Starter:** the same root with these three Free containers in order. All have
literal `#111827` background at alpha 0.9, no border/radius/padding. All text is
opaque white and center/center aligned. Coordinates below the groups are local:

| Element     | x   | y   | Width | Height | Content/style                        |
| ----------- | --- | --- | ----- | ------ | ------------------------------------ |
| Clock group | 11  | 0   | 120   | 80     | Free container                       |
| Timer       | 8   | 4   | 104   | 44     | Timer, Anton 400, 36px               |
| Prefix      | 8   | 50  | 72    | 22     | Period prefix, Poppins 400, 14px     |
| Period      | 84  | 50  | 28    | 22     | Period number, Poppins 400, 14px     |
| Home group  | 131 | 0   | 240   | 80     | Free container                       |
| Home name   | 8   | 4   | 224   | 24     | Poppins 600, 18px                    |
| Home score  | 8   | 28  | 224   | 48     | Anton 400, 40px, None                |
| Home bar    | 0   | 76  | 240   | 4      | Rectangle, home-team colour, alpha 1 |
| Away group  | 371 | 0   | 240   | 80     | Free container                       |
| Away name   | 8   | 4   | 224   | 24     | Poppins 600, 18px                    |
| Away score  | 8   | 28  | 224   | 48     | Anton 400, 40px, None                |
| Away bar    | 0   | 76  | 240   | 4      | Rectangle, away-team colour, alpha 1 |

There are 13 nodes including root, all seven unique values, and 11px transparent
margins. It is rectangular, not an editable Classic clone.

Sample inputs start with `HOME` / `AWAY`, colours `#00FF00` / `#FF0000`, scores
0/0, timer 900 seconds, period prefix `PERIODO`, period number 1. Test alternate
inputs with long names, prefix `OVERTIME`, timer 3600 seconds and scores 12/105.

### Numerical and parity fixtures

| Fixture              | Definition and exact assertions                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nested flow          | Root 400 x 200. Row at `(10,20)`, 300 x 120, border 2, padding top/bottom 6 and left/right 10, gap 8, main center/cross end. Children A fixed 60 x 20, B Fill/Fill, C Fill/fixed 40. Content is `(22,28,276,104)`; A is `(22,112,60,20)`, B `(90,28,100,104)`, C `(198,92,100,40)`. B is a Column with padding 4, gap 4, cross center: D fixed 20 x 20 is `(130,32,20,20)`; E Fill/Fill is `(94,56,92,72)`. |
| Hidden flow          | Hide B in that fixture. B/D/E do not paint or consume gaps; C becomes `(90,92,208,40)` and A is unchanged. A hidden duplicate bound value still fails validation.                                                                                                                                                                                                                                           |
| Overflow/alignment   | Root 200 x 80; Row at `(20,10)`, 100 x 40, gap 10, main center/cross start, children fixed 80 x 20 and 60 x 20. Main free space is -50; child x positions are -5 and 85 globally. Long text extends through ancestor edges, with only the root clipping at x=0/200. End alignment instead yields -30 and 60.                                                                                                |
| Degenerate box       | Container `(10,10,20,16)`, border 4, padding 12 each side, Row with a Fill/Fill child. Content origin is `(26,26)`, size `(0,0)`; Fill resolves to zero with warnings. No NaN, implicit shrink or container clip. Conversion to Free is rejected atomically.                                                                                                                                                |
| Full-frame           | Transparent 1920 x 1080 root with a Free 622 x 80 wrapper at `(100,900)` containing the starter groups/values, not a nested rendering root.                                                                                                                                                                                                                                                                 |
| Portrait             | Transparent 1080 x 1920 root with the same wrapper at `(100,1700)`. Root clipping and export dimensions use portrait bounds.                                                                                                                                                                                                                                                                                |
| Binding/style parity | Use independent None/Rolling scores, live/recorded/sample team-colour bindings on background/border/text, 0/0.5/1 alpha, border 1/3 with radius 0/12, Anton and every supported Poppins weight, explicit line breaks and oversized labels. Geometry does not depend on match data. Export scores remain static.                                                                                             |
| Boundaries           | Accept 3840 x 2160 and 2160 x 3840; reject 3840 x 2161 and 2161 x 3840. Check node/depth/string/file thresholds at the maximum and one above, including hidden subtrees. Odd-dimension export cases and exact batch counts are in the technical contract.                                                                                                                                                   |

Pure tests assert numerical geometry and diagnostics, not screenshots alone.
P4 additionally renders these fixtures in live and canvas paths on supported
engines. P9 verifies that editor overlays never appear in Outputs/OBS/video.
