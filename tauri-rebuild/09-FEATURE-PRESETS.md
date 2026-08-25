# 09 — Feature: Presets (Teams & Matches) `[NEW]`

Prepare every fixture of a match day or tournament **before** the event, then load a
fixture into the scoreboard slots with two clicks from the native menu.

Not optional: this ships as core behaviour. It has no Cargo feature gate.

## 1. What it does

Two entity types, stored separately:

- **Team preset** — a reusable team identity: `name` + `color`. Entered once, reused by
  any number of fixtures. For an 8-team tournament you type 8 teams instead of 28 fixture
  pairs.
- **Match preset** — a fixture: a reference to a home team and an away team, plus an
  optional label.

A dedicated **Presets window** manages both. The **`Presets` menu** on the main window
lists every saved match preset; clicking one loads it.

Scores, half and timer are never part of a preset. Loading a preset changes team identity
only.

### 1.1 Locked decisions

| Decision                         | Choice                                                                |
| -------------------------------- | --------------------------------------------------------------------- |
| Model                            | Team library **+** match presets referencing teams by id              |
| Preset fields                    | Team names, team colours. **No** half prefix, loadouts, logo or scores |
| Load target                      | Writes into `Settings` (persists, survives restart and `Reset`)       |
| Main-window entry point          | Native menu only — no select/button in the control surface            |
| Menu contents                    | Match presets only; teams are never loaded individually               |
| Menu placement                   | New top-level `Presets` menu, between `View` and `Tools`              |
| Window layout                    | Master/detail with `Teams` \| `Matches` tabs                          |
| Team deletion while referenced   | Blocked; the error names the match presets that use it                |
| Storage                          | Separate `presets.json` in the app config dir                         |
| Load side effects                | Identity only — score, half and timer are never touched               |

### 1.2 Explicitly out of scope for v1

Deferred by decision, listed so nobody re-litigates them mid-implementation: "save current
scoreboard as preset", duplicate, JSON import/export, loading presets from the `/control`
phone remote, manual reordering, search/filter, per-preset half prefix, per-preset timer
loadouts, event logos.

The data model below leaves room for all of them (stable ids, a versioned file, a
list-returning command) without a schema break.

## 2. Data model

New module: `src-tauri/src/presets.rs`. Exported to TypeScript by ts-rs like every other
contract (`src/bindings/`), so the window and the store share one source of truth.

```rust
/// A reusable team identity. Referenced by `MatchPreset`, never inlined,
/// so renaming a team updates every fixture that uses it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct TeamPreset {
    pub id: PresetId,
    pub name: String,   // validated: trimmed, non-empty, <= MAX_NAME_LEN (32)
    pub color: String,  // validated: #rrggbb, lowercased
}

/// A fixture: two team references. Carries no match values.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct MatchPreset {
    pub id: PresetId,
    /// Optional user label. When absent the UI and the menu show
    /// `"{home} vs {away}"`, so the common case needs no typing.
    #[ts(optional, type = "string | null")]
    pub label: Option<String>,
    pub home_team_id: PresetId,
    pub away_team_id: PresetId,
}
```

`PresetId` is a `String` holding 12 lowercase hex characters, generated with the `rand`
crate (already a dependency — no new crate). A random id rather than a counter because
menu item ids are derived from it: a counter that resets after a corrupt-file recovery
would make a stale menu item load the wrong fixture, and random ids also merge cleanly if
import/export is added later.

Patch types follow the `ScoreboardPatch` discipline — `deny_unknown_fields`, `None` means
"leave unchanged":

```rust
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
#[ts(export_to = "../../src/bindings/")]
pub struct TeamPresetPatch {
    #[ts(optional)] pub name: Option<String>,
    #[ts(optional)] pub color: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
#[ts(export_to = "../../src/bindings/")]
pub struct MatchPresetPatch {
    /// Nullable vs absent: `None` = leave, `Some(None)` = clear the label.
    #[ts(optional, type = "string | null")] pub label: Option<Option<String>>,
    #[ts(optional)] pub home_team_id: Option<PresetId>,
    #[ts(optional)] pub away_team_id: Option<PresetId>,
}
```

One aggregate the frontend reads in a single round trip:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export_to = "../../src/bindings/")]
pub struct PresetLibrary {
    pub schema_version: u32,     // PRESETS_SCHEMA_VERSION, starts at 1
    pub teams: Vec<TeamPreset>,
    pub matches: Vec<MatchPreset>,
}
```

### 2.1 Validation

Reuse the existing rules rather than writing new ones — a preset must never be able to
hold a value that `settings_set` would later reject:

- `name` → same rule as `state::validate_name`: trimmed, non-empty, truncated to
  `MAX_NAME_LEN` (32).
- `color` → same rule as `state::validate_color`: `#rrggbb`, lowercased.
- `label` → trimmed; empty becomes `None`.

`validate_name` / `validate_color` are currently private to `state.rs`. Make them
`pub(crate)` and call them from `presets.rs`. Do **not** duplicate them. `[RISK]` A
divergent copy would let a preset save a value that fails on load, which surfaces as a
menu click that does nothing.

Additional rules unique to presets:

- A match preset's `home_team_id` and `away_team_id` must both resolve to existing teams.
- `home_team_id == away_team_id` is rejected ("a fixture needs two different teams").
- Team names are **not** required to be unique — two clubs can share a name; the id
  disambiguates. The window shows a soft warning on duplicate names, not an error.

## 3. Storage

`app_config_dir()/presets.json`, alongside `settings.json`.

```json
{
	"schemaVersion": 1,
	"teams": [
		{ "id": "a3f19c0b2e77", "name": "LIONS", "color": "#c81e1e" },
		{ "id": "5d2b81ff40a1", "name": "TIGERS", "color": "#1e5fc8" }
	],
	"matches": [
		{
			"id": "9e04c7aa1b36",
			"label": null,
			"homeTeamId": "a3f19c0b2e77",
			"awayTeamId": "5d2b81ff40a1"
		}
	]
}
```

Load / save mirror `settings.rs` exactly:

- **Load never fails.** Missing file → empty library. Corrupt file → renamed to
  `presets.corrupt-<unix_ts>.json`, warning logged, empty library used.
- **Save is atomic**: write `presets.json.tmp`, `sync_all`, rename over the real file.
- **Save is debounced** (500 ms) through the same pattern as `schedule_settings_save`.

**Referential integrity is enforced on load, not trusted.** A hand-edited file can contain
a match preset pointing at a deleted team. On load, drop such matches and log a warning
rather than surfacing a broken entry in the native menu. `[RISK]`

The library lives in `AppState` behind an `RwLock`, like `settings`:

```rust
presets: RwLock<PresetLibrary>,
presets_save_serial: AtomicU64,
```

## 4. Commands & events

| Command                | Args                                | Returns          | Notes                                     |
| ---------------------- | ----------------------------------- | ---------------- | ----------------------------------------- |
| `presets_get`          | —                                   | `PresetLibrary`  | Full snapshot                             |
| `team_preset_create`   | `name: String, color: String`       | `TeamPreset`     | Validates, appends, persists              |
| `team_preset_update`   | `id: PresetId, patch`               | `TeamPreset`     | Rename propagates to every fixture        |
| `team_preset_delete`   | `id: PresetId`                      | `()`             | **Errors** if referenced (see §4.1)       |
| `match_preset_create`  | `label, homeTeamId, awayTeamId`     | `MatchPreset`    | Validates both refs exist and differ      |
| `match_preset_update`  | `id: PresetId, patch`               | `MatchPreset`    |                                           |
| `match_preset_delete`  | `id: PresetId`                      | `()`             | Always allowed                            |
| `preset_load`          | `id: PresetId`                      | `Settings`       | Applies the fixture (see §5)              |

| Event              | Payload         | Target |
| ------------------ | --------------- | ------ |
| `presets:changed`  | `PresetLibrary` | all    |

Add `ServerEvent::Presets(PresetLibrary)` to the enum in `state.rs` and emit
`presets:changed` from `publish`, matching `ServerEvent::Settings`. Loading a preset also
emits the existing `settings:changed` and `state:changed`, so every open window and every
LAN client updates with no extra plumbing.

### 4.1 Delete-while-referenced

`team_preset_delete` returns `Err(DomainError::Validation)` with a message naming the
blocking fixtures, e.g.:

```
cannot delete "LIONS": used by 3 match presets (Lions vs Tigers, Lions vs Bears, Cup Final)
```

The window catches the error and renders it inline next to the Delete button with the
listed fixtures as clickable links that jump to the Matches tab. Cap the listed names at 5
followed by `…and N more` so a 30-fixture tournament does not produce an unreadable
string.

## 5. Load semantics

`preset_load(id)` resolves the fixture, then delegates to the existing path:

```rust
state.settings_set(SettingsPatch {
    team_home_name:  Some(home.name.clone()),
    team_home_color: Some(home.color.clone()),
    team_away_name:  Some(away.name.clone()),
    team_away_color: Some(away.color.clone()),
    ..Default::default()
}).await
```

That single call already does everything required, which is why decision A is cheap:

1. `identity_changed` is true → `settings::apply_to_scoreboard` mirrors the four fields
   into the live `ScoreboardState`, bumps `revision`, publishes `State`.
2. Settings are persisted atomically (debounced) → the fixture survives a restart.
3. `settings:changed` reaches the Settings window if it is open, so its fields update
   live instead of showing stale values. `[RISK]` Without this the Settings window would
   silently overwrite the loaded preset on the next keystroke.
4. `Reset` already preserves identity, so a mid-match reset keeps the loaded fixture.

**Scores, half and timer are untouched** — loading a preset never clears the match. The
operator presses `Reset` separately when starting the next fixture. This is predictable and
costs one extra click; the alternative (load implies reset) would silently destroy a score
when a fixture is loaded by mistake mid-match.

Loading a preset is a plain settings write, so it works while the timer is running and
while LAN clients are connected — no special casing.

## 6. Native menu

```
Presets
├── Manage Presets…            Ctrl+P
├── ──────────────────
├── Lions vs Tigers
├── Eagles vs Bears
└── Cup Final
```

- Placement: third submenu, between `View` and `Tools`, per decision.
- `Manage Presets…` → id `open:presets`, accelerator `CmdOrCtrl+P`.
- Each fixture → id `preset:load:<PresetId>`, label = `label` or `"{home} vs {away}"`.
- Empty library → a single **disabled** item `No presets saved`, so the menu is never an
  empty box the user cannot interpret.
- Cap the inline list at 20 fixtures; beyond that show the 20 most recently updated and
  rely on the window for the rest. A native menu longer than the screen is unusable on
  Windows.

`on_menu_event` gains:

```rust
"open:presets" => { let _ = windows::open(app, AppWindow::Presets); }
id if id.starts_with("preset:load:") => {
    let preset_id = id.trim_start_matches("preset:load:").to_string();
    let shared = app.state::<Shared>().inner().clone();
    tauri::async_runtime::spawn(async move { /* preset_load, log failures */ });
}
```

### 6.1 Rebuilding the menu `[RISK]`

Tauri menu items are not reactive. Every mutation that changes the fixture list — create,
update, delete, and a team rename that changes a derived label — must rebuild the whole
menu and re-attach it:

```rust
let menu = menu::build(app)?;                 // reads the current library
main_window.set_menu(menu)?;                  // NEVER app.set_menu — doc 03 §7ter
```

Three constraints, all of which have bitten this codebase before:

1. **Main-thread only.** `set_menu` must run on the event loop. Route it through
   `app.run_on_main_thread(...)`, the same reason `window_open` uses `dispatch_window_op`
   in `lib.rs`. Rebuilding from the command's tokio thread will hang or crash.
2. **Never `app.set_menu`.** It would attach a menu bar to the frameless overlay windows.
3. **Escape `&` in labels.** On Windows `&` in a menu label is a mnemonic marker, so a
   team named `Rangers & Co` renders as `Rangers _Co`. Replace `&` with `&&` when building
   item labels. This does not affect the stored name.

Rebuild is triggered from one place — a `ServerEvent::Presets` subscriber — not from each
command, so no mutation path can forget it. Coalesce rebuilds behind the same 500 ms
debounce as the save, otherwise typing in the label field flickers the menu bar on every
keystroke.

## 7. Presets window

### 7.1 Registration

| Concern             | Change                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| `windows.rs`        | `AppWindow::Presets` → label `presets`, url `/pages/presets.html`, title `Presets` |
| Size                | 820 × 620, min 700 × 520 (master/detail needs the width)                      |
| `from_label`        | `"presets" => Some(Self::Presets)`                                            |
| `list_open`         | Add `AppWindow::Presets` to the array                                         |
| `capabilities/default.json` | Add `"presets"` to the `windows` array — **easy to miss**; without it every `invoke` from the window fails |
| `vite.config.ts`    | Add `presets: pages/presets.html` to `rollupOptions.input`                     |
| `pages/presets.html`| New shell pointing at `../src/entries/Presets/index.tsx`                       |

Singleton behaviour, saved geometry and zoom restore come free from `windows::open`.

### 7.2 Layout

```
┌──────────────────────────────────────────────────────────┐
│ Presets                        [ Teams ] [ Matches ]     │  header + tabs
├───────────────────────┬──────────────────────────────────┤
│ ▸ LIONS        ██     │  Name   [ LIONS            ]      │
│ ▸ TIGERS       ██     │  Colour [ ██ ] #c81e1e            │
│ ▸ EAGLES       ██     │                                   │
│                       │                                   │
│ [ + New team ]        │        [ Delete ]  [ Save ]       │
└───────────────────────┴──────────────────────────────────┘
```

- Header and tab bar copy `SettingsWindow.tsx` exactly (same `aria-current` treatment,
  same classes) so the two windows read as one app.
- **Teams tab** — list shows name + a colour swatch. Detail form: name, colour picker
  (reuse `components/ui/ColorPicker`).
- **Matches tab** — list shows the display name and both team colours as two swatches.
  Detail form: optional label (placeholder = the derived `"{home} vs {away}"`), home team
  `Select`, away team `Select`. Both selects list the team library; the value already
  chosen for the other slot is disabled, which enforces the "two different teams" rule in
  the UI instead of via an error toast.
- Selecting nothing shows an empty state: `Select a preset, or create a new one.`

### 7.3 Save behaviour — explicit, unlike Settings

The Settings window persists on every keystroke and has no Save button. The Presets window
**does** have Save/Discard, deliberately:

- Creating a record with immediate persistence would put a half-typed team in the list —
  and in the native menu, which would flicker on every character.
- A new record has no valid state to persist until both fields are filled, so
  immediate-save would need a placeholder record, which is worse.

The detail pane therefore edits a local draft. Save is disabled while the draft is invalid
or unchanged. Switching list selection with a dirty draft prompts
`Discard unsaved changes?`.

`useEscapeToClose` still applies, with one adjustment: when a draft is dirty, the first
`Esc` discards the draft and the second closes the window. Closing the window with a dirty
draft via the title bar prompts.

### 7.4 Frontend files

```
pages/presets.html
src/entries/Presets/index.tsx
src/entries/Presets/PresetsWindow.tsx
src/entries/Presets/Tabs/TeamsTab.tsx
src/entries/Presets/Tabs/MatchesTab.tsx
src/entries/Presets/PresetList.tsx        // shared master column
src/lib/stores/presetsStore.ts
```

`presetsStore.ts` mirrors `settingsStore.ts`: a `library` field, a `refresh()` that
subscribes once to `presets:changed` and invokes `presets_get`, and one method per command.
Persistence lives in Rust; the store never uses the `persist` middleware.

The main window does **not** import this store — the menu is the only entry point, so the
main window's bundle is unchanged.

## 8. Edge cases

| Case                                                    | Behaviour                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Rename a team                                            | Every fixture's derived label updates; menu rebuilds             |
| Rename a team **after** loading its fixture              | The scoreboard is **not** retroactively updated — load is a copy |
| Delete a referenced team                                 | Blocked with the fixture list (§4.1)                             |
| Delete the currently loaded fixture                      | Allowed; the scoreboard keeps its values                         |
| Empty library                                            | Menu shows a disabled `No presets saved`                         |
| `presets.json` corrupt                                   | Renamed aside, empty library, warning logged                     |
| Match preset referencing a missing team (hand-edited)    | Dropped on load with a warning                                   |
| Preset name containing `&`                               | Stored verbatim, escaped to `&&` in the menu label only          |
| Team name longer than 32 chars                           | Truncated on save, same as `validate_name`                       |
| Load while the timer is running                          | Allowed; timer untouched                                         |

## 9. Testing

Rust unit tests in `presets.rs`, following the `state.rs` test style:

- `create_validates_name_and_colour`
- `delete_team_blocked_when_referenced` — asserts the error names the fixtures
- `delete_team_allowed_after_last_reference_removed`
- `match_preset_rejects_identical_teams`
- `match_preset_rejects_unknown_team_id`
- `load_drops_matches_with_dangling_refs`
- `corrupt_file_yields_empty_library_and_renames_backup`
- `preset_load_applies_identity_to_settings_and_scoreboard`
- `preset_load_leaves_score_half_and_timer_untouched`
- `menu_label_escapes_ampersand`

Bindings: `pnpm bindings` must emit `TeamPreset.ts`, `MatchPreset.ts`, `TeamPresetPatch.ts`,
`MatchPresetPatch.ts`, `PresetLibrary.ts` and stay hash-stable. `pnpm check` must pass
ESLint, the Vite build, strict Clippy and the Rust tests.

Manual: create two teams and a fixture, confirm the menu updates without restarting;
rename a team and confirm the menu label follows; load a fixture and confirm the Settings
window (kept open) shows the new values; restart and confirm the fixture is still loaded.

## 10. Implementation checklist

**Backend**

1. `presets.rs`: types, `PresetId` generation, load/save/migrate, validation, integrity
   check on load.
2. `state.rs`: `pub(crate)` on `validate_name`/`validate_color`; `presets` field;
   `schedule_presets_save`; `ServerEvent::Presets` + emit in `publish`.
3. `lib.rs`: the 8 commands, registered in the invoke handler; load `presets.json` in
   `setup`.
4. `windows.rs`: `AppWindow::Presets` across `label`/`url`/`title`/`size`/`min_size`/
   `from_label`/`list_open`.
5. `menu.rs`: `Presets` submenu built from the library; `open:presets` and
   `preset:load:*` handlers; `&` escaping; main-thread debounced rebuild subscriber.

**Frontend**

6. `pages/presets.html` + `vite.config.ts` input + `capabilities/default.json` window.
7. `presetsStore.ts`.
8. `PresetsWindow.tsx` shell with tabs, `PresetList.tsx`, `TeamsTab.tsx`, `MatchesTab.tsx`,
   draft/save handling, `useEscapeToClose` adjustment.

**Verify**

9. `pnpm bindings` (hash-stable) then `pnpm check`.
