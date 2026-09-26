# Presets (teams and matches)

Prepare every fixture of a match day before the event, then load one into the scoreboard
from the native `Presets` menu. Core feature, no Cargo gate.

Sources: [`presets.rs`](../../src-tauri/src/presets.rs), commands in
[`lib.rs`](../../src-tauri/src/lib.rs), menu in [`menu.rs`](../../src-tauri/src/menu.rs),
window in [`src/entries/Presets/`](../../src/entries/Presets/), store
[`presetsStore.ts`](../../src/lib/stores/presetsStore.ts).

## Model

- **Team preset** ([`TeamPreset`](../../src/bindings/TeamPreset.ts)) — a reusable identity:
  `name` + `color`. An 8-team tournament needs 8 teams, not 28 fixture pairs.
- **Match preset** ([`MatchPreset`](../../src/bindings/MatchPreset.ts)) — a fixture: home
  and away team **ids** plus an optional `label`. Without a label the UI and menu show
  `"{home} vs {away}"`. Referencing by id means renaming a team updates every fixture.
- [`PresetLibrary`](../../src/bindings/PresetLibrary.ts) — `schemaVersion`, `teams`,
  `matches`; read in one round trip.

A preset holds **team identity only** — no scores, half, timer, prefix, loadouts or logo.

Ids are 12 random lowercase hex chars, not a counter: menu item ids are derived from them,
and a counter reset after a corrupt-file recovery would make a stale menu item load the
wrong fixture.

### Validation

Reuses `state::validate_name` / `validate_color` (never a copy — a preset must not be able
to hold a value that `settings_set` would reject):

- name: trimmed, non-empty, truncated to 32 chars; colour: `#rrggbb`, lowercased;
  label: trimmed, empty → none.
- A fixture's teams must both exist and must differ.
- Team names need not be unique (the window shows a soft warning).

## Storage

`app_config_dir()/presets.json`, same rules as `settings.json`: load never fails (corrupt →
renamed to `presets.corrupt-<ts>.json`, empty library), atomic save, 500 ms debounce.
**Referential integrity is checked on load**: a hand-edited fixture pointing at a missing
team is dropped with a warning instead of appearing as a broken menu entry.

## Commands and events

| Command               | Notes                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `presets_get`         | Full `PresetLibrary`                                                                         |
| `team_preset_create`  | `name`, `color`                                                                              |
| `team_preset_update`  | `id`, [`TeamPresetPatch`](../../src/bindings/TeamPresetPatch.ts)                             |
| `team_preset_delete`  | **Fails while referenced**; the message names up to 5 fixtures, then `…and N more`           |
| `match_preset_create` | `label`, `homeTeamId`, `awayTeamId`                                                          |
| `match_preset_update` | `id`, [`MatchPresetPatch`](../../src/bindings/MatchPresetPatch.ts) (`label: null` clears it) |
| `match_preset_delete` | Always allowed                                                                               |
| `preset_load`         | Applies a fixture, returns `Settings`                                                        |

Every change publishes `ServerEvent::Presets` → `presets:changed`, which also triggers the
menu rebuild.

## Loading a fixture

`preset_load(id)` resolves both teams and calls the ordinary `settings_set` with the four
identity fields. That single path:

1. mirrors them into the live `ScoreboardState` (revision bump, `state:changed`, LAN
   update);
2. persists them, so the fixture survives a restart and a `Reset`;
3. emits `settings:changed`, so an open Settings window shows the new values instead of
   overwriting them on the next keystroke.

**Score, half and timer are never touched.** Loading a fixture by mistake mid-match must
not destroy the score; the operator presses Reset separately. Loading works while the
timer runs. A load is a copy: renaming a team later does not retroactively change the
scoreboard.

## Menu

Top-level `Presets` menu between `View` and `Broadcast`:

```
Presets
  Manage Presets…        Ctrl+P
  ─────────
  LIONS vs TIGERS        preset:load:<id>     (at most 20; or disabled "No presets saved")
  …
  ─────────
  Timer 1 (15:00)        timer:loadout:1
  Timer 2 (45:00)        timer:loadout:2
  Timer 3 (20:00)        timer:loadout:3
```

- Only match presets appear; teams are never loaded individually.
- `&` in names is escaped to `&&` in the menu label only.
- Rebuilt on `presets:changed` or when a loadout changes, debounced 500 ms, on the main
  thread, with `main_window.set_menu` (see [pitfalls](../pitfalls.md)).

## Presets window

820×620 (min 700×520), master/detail with **Teams** | **Matches** tabs, header styled like
Settings.

- Teams: list with swatches; detail edits name and colour (`ColorPicker`).
- Matches: list with both team swatches; detail edits the optional label (placeholder =
  derived name) and two team selects. The team chosen in one slot is disabled in the
  other.
- **Explicit Save / Discard**, unlike Settings: immediate persistence would put half-typed
  teams in the menu. Save is disabled while the draft is invalid or unchanged. Switching
  selection with a dirty draft asks `Discard unsaved changes?`. The first <kbd>Esc</kbd>
  discards a dirty draft; the next closes the window.
- A blocked team delete shows the error inline with the blocking fixtures.

The main window does not import the presets store — the menu is its only entry point.

## Edge cases

| Case                             | Behaviour                                 |
| -------------------------------- | ----------------------------------------- |
| Rename a team                    | Derived fixture names and the menu update |
| Rename after loading its fixture | Scoreboard unchanged (load is a copy)     |
| Delete a referenced team         | Blocked, fixtures listed                  |
| Delete the loaded fixture        | Allowed; scoreboard keeps its values      |
| Empty library                    | Disabled `No presets saved` menu item     |
| Name longer than 32 chars        | Truncated on save                         |

## Out of scope (for now)

"Save current scoreboard as preset", duplicate, JSON import/export, loading presets from
`/control`, manual reordering, search, per-preset prefix / loadouts / logos. Stable ids, a
versioned file and list-returning commands leave room for these without a schema break.
