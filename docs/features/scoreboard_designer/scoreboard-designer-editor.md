# Scoreboard Designer - editor design

> **Status:** planned, not implemented. This document describes the agreed
> interaction scope and proposed UI arrangement. It does not describe a currently
> available application window.

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

This is an information-layout proposal, not a final pixel design or a commitment
to particular window/sidebar dimensions.

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
- Toggleable grid and edge/centre snapping.
- Hide and lock.

Multi-selection, bulk alignment/distribution and element copy/paste are deferred.
Duplicating an entire saved custom layout remains available in the library.

### History and keyboard behaviour

Recommended implementation details:

- Treat one drag/resize as one undo operation, not one per pointer event.
- Group numeric/text property edits into coherent commits.
- Track dirtiness against the saved definition, not the number of history entries.
- Keep designer shortcuts window-scoped and preserve native text-field editing.
- Do not include match updates, preview data or viewport movement in definition
  undo/redo history.

These details support the agreed interaction scope, but exact key bindings and
commit boundaries still need specification before implementation.

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

**Recommendation requiring final detail review:** disable Apply while the draft
is dirty, requiring Save first. Do not silently combine Save and Apply or
accidentally apply an older saved revision while displaying a newer draft.

Use Save / Discard / Cancel on dirty layout selection changes and close.
A save error leaves the draft open and dirty. Cancel leaves the current selection
and work intact. Include ordinary application shutdown in the close-guard design.

## Details to finalize before implementation

The main product choices above are agreed. Remaining UI details are not silently
approved by this document. Proposed defaults and the approval gate are tracked
in the implementation plan's
[decision register](scoreboard-designer-implementation.md#decision-register-and-stop-conditions):

- Exact shortcuts, snap threshold, grid spacing and numeric edit commit rules.
- Sidebar/window dimensions and resizing affordances.
- Starter geometry, property defaults and default animation selections.
- Exact axis controls for fill/alignment and warning behaviour when no fill space
  remains.
- How tree reparenting preserves Free coordinates or converts layout sizing.
- The recommended Save-before-Apply rule and confirmation presentation.
- Which editor-only state, such as viewport or locking metadata, is saved.
