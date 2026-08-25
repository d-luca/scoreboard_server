//! Team & match presets (tauri-rebuild doc 09).
//!
//! A team preset is a reusable identity (`name` + `color`); a match preset is
//! a fixture referencing two teams by id, so renaming a team updates every
//! fixture that uses it. The library lives in `app_config_dir()/presets.json`
//! and mirrors `settings.rs` persistence: load never fails (a corrupt file is
//! renamed aside), save is atomic (tmp + fsync + rename) and debounced by the
//! callers in `state.rs`.
//!
//! Scores, half and timer are never part of a preset — loading one writes
//! team identity into `Settings` only.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use ts_rs::TS;

use crate::state::DomainError;

/// Current on-disk schema for `presets.json`.
pub const PRESETS_SCHEMA_VERSION: u32 = 1;

/// A preset id is 12 lowercase hex characters, generated randomly (doc 09
/// §2): a counter that resets after a corrupt-file recovery would make a
/// stale menu item load the wrong fixture, and random ids merge cleanly if
/// import/export is added later.
pub type PresetId = String;

/// How many fixtures are inlined in the native `Presets` menu at most; the
/// window lists the rest (a menu longer than the screen is unusable).
pub const MAX_MENU_FIXTURES: usize = 20;

/// Fixture names listed in a delete-blocked error before `…and N more`, so a
/// 30-fixture tournament does not produce an unreadable string (doc 09 §4.1).
const MAX_BLOCKING_NAMES: usize = 5;

/// A reusable team identity. Referenced by [`MatchPreset`], never inlined,
/// so renaming a team updates every fixture that uses it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct TeamPreset {
    /// 12 lowercase hex characters; see [`PresetId`].
    pub id: String,
    pub name: String,
    pub color: String,
}

/// A fixture: two team references. Carries no match values.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct MatchPreset {
    pub id: String,
    /// Optional user label. When absent the UI and the menu show
    /// `"{home} vs {away}"`, so the common case needs no typing.
    #[ts(optional, type = "string | null")]
    pub label: Option<String>,
    pub home_team_id: String,
    pub away_team_id: String,
}

/// Partial update over [`TeamPreset`]; `None` leaves the field unchanged.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
#[ts(export_to = "../../src/bindings/")]
pub struct TeamPresetPatch {
    #[ts(optional)]
    pub name: Option<String>,
    #[ts(optional)]
    pub color: Option<String>,
}

/// Partial update over [`MatchPreset`]; `None` leaves the field unchanged.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
#[ts(export_to = "../../src/bindings/")]
pub struct MatchPresetPatch {
    /// Nullable vs absent: `None` = leave, `Some(None)` = clear the label.
    /// From JSON, send `""` to clear — a nested `Option` cannot distinguish
    /// `null` from absent.
    #[ts(optional, type = "string | null")]
    pub label: Option<Option<String>>,
    #[ts(optional)]
    pub home_team_id: Option<String>,
    #[ts(optional)]
    pub away_team_id: Option<String>,
}

/// The whole preset library, read by the frontend in a single round trip.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export_to = "../../src/bindings/")]
pub struct PresetLibrary {
    pub schema_version: u32,
    pub teams: Vec<TeamPreset>,
    pub matches: Vec<MatchPreset>,
}

impl PresetLibrary {
    pub fn empty() -> Self {
        Self {
            schema_version: PRESETS_SCHEMA_VERSION,
            ..Default::default()
        }
    }
}

/// Generate a fresh id, unique across teams and matches in this library.
fn new_id(library: &PresetLibrary) -> PresetId {
    use rand::Rng;
    loop {
        let bytes: [u8; 6] = rand::thread_rng().gen();
        let id: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        let taken = library.teams.iter().any(|team| team.id == id)
            || library.matches.iter().any(|fixture| fixture.id == id);
        if !taken {
            return id;
        }
    }
}

/// `label` → trimmed; empty becomes `None` (doc 09 §2.1).
fn validate_label(raw: Option<String>) -> Option<String> {
    raw.and_then(|label| {
        let trimmed = label.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub fn find_team(library: &PresetLibrary, id: &str) -> Result<TeamPreset, DomainError> {
    library
        .teams
        .iter()
        .find(|team| team.id == id)
        .cloned()
        .ok_or_else(|| DomainError::Validation(format!("unknown team preset {id:?}")))
}

fn find_match<'a>(library: &'a PresetLibrary, id: &str) -> Result<&'a MatchPreset, DomainError> {
    library
        .matches
        .iter()
        .find(|fixture| fixture.id == id)
        .ok_or_else(|| DomainError::Validation(format!("unknown match preset {id:?}")))
}

/// A fixture's references must resolve to existing teams, and a fixture
/// needs two different teams (doc 09 §2.1).
fn validate_fixture_refs(
    library: &PresetLibrary,
    home: &str,
    away: &str,
) -> Result<(), DomainError> {
    find_team(library, home)?;
    find_team(library, away)?;
    if home == away {
        return Err(DomainError::Validation(
            "a fixture needs two different teams".into(),
        ));
    }
    Ok(())
}

/// Validation reuses `state::validate_name` / `state::validate_color` so a
/// preset can never hold a value `settings_set` would later reject (doc 09
/// §2.1 — a divergent copy would surface as a menu click that does nothing).
pub fn create_team(
    library: &mut PresetLibrary,
    name: &str,
    color: &str,
) -> Result<TeamPreset, DomainError> {
    let team = TeamPreset {
        id: new_id(library),
        name: crate::state::validate_name(name)?,
        color: crate::state::validate_color(color)?,
    };
    library.teams.push(team.clone());
    Ok(team)
}

pub fn update_team(
    library: &mut PresetLibrary,
    id: &str,
    patch: TeamPresetPatch,
) -> Result<TeamPreset, DomainError> {
    let index = library
        .teams
        .iter()
        .position(|team| team.id == id)
        .ok_or_else(|| DomainError::Validation(format!("unknown team preset {id:?}")))?;
    // Validate before mutating so a bad patch is atomic.
    let name = patch
        .name
        .as_deref()
        .map(crate::state::validate_name)
        .transpose()?;
    let color = patch
        .color
        .as_deref()
        .map(crate::state::validate_color)
        .transpose()?;
    let team = &mut library.teams[index];
    if let Some(name) = name {
        team.name = name;
    }
    if let Some(color) = color {
        team.color = color;
    }
    Ok(team.clone())
}

/// Deleting a team referenced by fixtures is blocked; the error names the
/// blocking fixtures (capped, doc 09 §4.1).
pub fn delete_team(library: &mut PresetLibrary, id: &str) -> Result<(), DomainError> {
    let team = find_team(library, id)?;
    let blocking: Vec<String> = library
        .matches
        .iter()
        .filter(|fixture| fixture.home_team_id == id || fixture.away_team_id == id)
        .map(|fixture| display_name(library, fixture))
        .collect();
    if !blocking.is_empty() {
        let listed = blocking
            .iter()
            .take(MAX_BLOCKING_NAMES)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        let overflow = blocking.len().saturating_sub(MAX_BLOCKING_NAMES);
        let suffix = if overflow > 0 {
            format!(", …and {overflow} more")
        } else {
            String::new()
        };
        let plural = if blocking.len() == 1 { "" } else { "s" };
        return Err(DomainError::Validation(format!(
            "cannot delete \"{}\": used by {} match preset{plural} ({listed}{suffix})",
            team.name,
            blocking.len(),
        )));
    }
    library.teams.retain(|team| team.id != id);
    Ok(())
}

pub fn create_match(
    library: &mut PresetLibrary,
    label: Option<String>,
    home_team_id: &str,
    away_team_id: &str,
) -> Result<MatchPreset, DomainError> {
    validate_fixture_refs(library, home_team_id, away_team_id)?;
    let fixture = MatchPreset {
        id: new_id(library),
        label: validate_label(label),
        home_team_id: home_team_id.to_string(),
        away_team_id: away_team_id.to_string(),
    };
    library.matches.push(fixture.clone());
    Ok(fixture)
}

pub fn update_match(
    library: &mut PresetLibrary,
    id: &str,
    patch: MatchPresetPatch,
) -> Result<MatchPreset, DomainError> {
    let index = library
        .matches
        .iter()
        .position(|fixture| fixture.id == id)
        .ok_or_else(|| DomainError::Validation(format!("unknown match preset {id:?}")))?;
    // Resolve the target refs and validate before mutating, so a bad patch
    // leaves the fixture untouched.
    let home = patch
        .home_team_id
        .clone()
        .unwrap_or_else(|| library.matches[index].home_team_id.clone());
    let away = patch
        .away_team_id
        .clone()
        .unwrap_or_else(|| library.matches[index].away_team_id.clone());
    validate_fixture_refs(library, &home, &away)?;
    let label = patch.label.map(validate_label);
    let fixture = &mut library.matches[index];
    fixture.home_team_id = home;
    fixture.away_team_id = away;
    if let Some(label) = label {
        fixture.label = label;
    }
    Ok(fixture.clone())
}

pub fn delete_match(library: &mut PresetLibrary, id: &str) -> Result<(), DomainError> {
    find_match(library, id)?;
    library.matches.retain(|fixture| fixture.id != id);
    Ok(())
}

/// What the menu and the window show: the label when set, otherwise the
/// derived `"{home} vs {away}"` (doc 09 §2).
pub fn display_name(library: &PresetLibrary, fixture: &MatchPreset) -> String {
    if let Some(label) = fixture
        .label
        .as_deref()
        .map(str::trim)
        .filter(|label| !label.is_empty())
    {
        return label.to_string();
    }
    let name_of = |id: &str| {
        library
            .teams
            .iter()
            .find(|team| team.id == id)
            .map(|team| team.name.as_str())
            .unwrap_or("?")
    };
    format!(
        "{} vs {}",
        name_of(&fixture.home_team_id),
        name_of(&fixture.away_team_id)
    )
}

/// On Windows `&` in a menu label is a mnemonic marker, so a team named
/// `Rangers & Co` would render as `Rangers _Co`. Double it — this affects
/// only the label, never the stored name (doc 09 §6.1).
pub fn escape_menu_label(label: &str) -> String {
    label.replace('&', "&&")
}

/// `app_config_dir()/presets.json`, alongside `settings.json`.
pub fn path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("presets.json")
}

/// Load from disk; never fails. A missing file yields an empty library. A
/// corrupt file is renamed to `presets.corrupt-<unix_ts>.json`, a warning is
/// logged, and an empty library is used (doc 09 §3).
pub fn load(app: &AppHandle) -> PresetLibrary {
    load_from(&path(app))
}

/// Split from [`load`] so tests can exercise the corrupt/dangling-ref paths
/// without an `AppHandle`.
pub fn load_from(path: &std::path::Path) -> PresetLibrary {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return PresetLibrary::empty();
    };
    match serde_json::from_str::<PresetLibrary>(&raw) {
        Ok(mut library) => {
            library.schema_version = PRESETS_SCHEMA_VERSION;
            enforce_integrity(&mut library);
            library
        }
        Err(error) => {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_file_name(format!("presets.corrupt-{timestamp}.json"));
            tracing::warn!(
                ?error,
                backup = %backup.display(),
                "presets.json is corrupt; resetting to an empty library"
            );
            if let Err(rename_error) = std::fs::rename(path, &backup) {
                tracing::warn!(?rename_error, "failed to rename corrupt presets.json");
            }
            PresetLibrary::empty()
        }
    }
}

/// Referential integrity is enforced on load, not trusted: a hand-edited
/// file can point a fixture at a deleted team. Drop such matches with a
/// warning rather than surfacing a broken entry in the native menu.
fn enforce_integrity(library: &mut PresetLibrary) {
    let PresetLibrary { teams, matches, .. } = library;
    let before = matches.len();
    matches.retain(|fixture| {
        teams.iter().any(|team| team.id == fixture.home_team_id)
            && teams.iter().any(|team| team.id == fixture.away_team_id)
    });
    let dropped = before - matches.len();
    if dropped > 0 {
        tracing::warn!(
            dropped,
            "dropped match presets with dangling team references"
        );
    }
}

/// Atomic save: write `presets.json.tmp`, fsync, then rename over the real
/// file (same discipline as `settings::save`).
pub fn save(app: &AppHandle, library: &PresetLibrary) -> anyhow::Result<()> {
    save_to(&path(app), library)
}

/// Split from [`save`] so tests can round-trip without an `AppHandle`.
pub fn save_to(path: &std::path::Path, library: &PresetLibrary) -> anyhow::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(library)?;
    std::fs::write(&tmp, json)?;
    // fsync before the rename so the rename cannot point at unflushed data.
    // The handle needs write access: `FlushFileBuffers` fails with EACCESS
    // on a read-only handle on Windows.
    let file = std::fs::OpenOptions::new().write(true).open(&tmp)?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Settings;
    use crate::state::{Action, AppState, ScoreboardPatch, MAX_NAME_LEN};

    fn library_with_two_teams() -> (PresetLibrary, TeamPreset, TeamPreset) {
        let mut library = PresetLibrary::empty();
        let home = create_team(&mut library, "LIONS", "#c81e1e").unwrap();
        let away = create_team(&mut library, "TIGERS", "#1e5fc8").unwrap();
        (library, home, away)
    }

    fn library_with_fixture() -> (PresetLibrary, MatchPreset) {
        let (mut library, home, away) = library_with_two_teams();
        let fixture = create_match(&mut library, None, &home.id, &away.id).unwrap();
        (library, fixture)
    }

    /// Unique temp file path for one test; caller cleans up the directory.
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "scoreboard-presets-test-{}-{tag}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn create_validates_name_and_colour() {
        let mut library = PresetLibrary::empty();
        let team = create_team(&mut library, "  bears  ", "#ABCDEF").unwrap();
        assert_eq!(team.name, "bears", "validate_name trims, never uppercases");
        assert_eq!(team.color, "#abcdef");
        assert_eq!(team.id.len(), 12);
        assert!(team.id.chars().all(|c| c.is_ascii_hexdigit()));

        assert!(create_team(&mut library, "   ", "#123456").is_err());
        assert!(create_team(&mut library, "OK", "red").is_err());
        assert_eq!(library.teams.len(), 1, "failed creates must not append");

        let long = "X".repeat(MAX_NAME_LEN + 10);
        let team = create_team(&mut library, &long, "#123456").unwrap();
        assert_eq!(
            team.name.len(),
            MAX_NAME_LEN,
            "names truncate like validate_name"
        );
    }

    #[test]
    fn delete_team_blocked_when_referenced() {
        let (mut library, fixture) = library_with_fixture();
        let error = delete_team(&mut library, &fixture.home_team_id).unwrap_err();
        let message = error.to_string();
        assert!(message.contains("\"LIONS\""), "{message}");
        assert!(message.contains("1 match preset ("), "{message}");
        assert!(message.contains("LIONS vs TIGERS"), "{message}");
        assert_eq!(library.teams.len(), 2, "blocked delete must not remove");
    }

    #[test]
    fn delete_error_caps_listed_fixtures() {
        let (mut library, home, away) = library_with_two_teams();
        for index in 1..=7 {
            create_match(
                &mut library,
                Some(format!("Game {index}")),
                &home.id,
                &away.id,
            )
            .unwrap();
        }
        let message = delete_team(&mut library, &home.id).unwrap_err().to_string();
        assert!(message.contains("used by 7 match presets"), "{message}");
        assert!(message.contains("Game 5"), "{message}");
        assert!(!message.contains("Game 6"), "{message}");
        assert!(message.contains("…and 2 more"), "{message}");
    }

    #[test]
    fn delete_team_allowed_after_last_reference_removed() {
        let (mut library, fixture) = library_with_fixture();
        delete_match(&mut library, &fixture.id).unwrap();
        delete_team(&mut library, &fixture.home_team_id).unwrap();
        assert_eq!(library.teams.len(), 1);
    }

    #[test]
    fn match_preset_rejects_identical_teams() {
        let (mut library, home, _away) = library_with_two_teams();
        let error = create_match(&mut library, None, &home.id, &home.id).unwrap_err();
        assert!(error.to_string().contains("two different teams"), "{error}");

        // Same rule on update: point away at the home team.
        let away_id = library.teams[1].id.clone();
        let fixture = create_match(&mut library, None, &home.id, &away_id).unwrap();
        let error = update_match(
            &mut library,
            &fixture.id,
            MatchPresetPatch {
                away_team_id: Some(home.id.clone()),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("two different teams"), "{error}");
    }

    #[test]
    fn match_preset_rejects_unknown_team_id() {
        let (mut library, home, away) = library_with_two_teams();
        assert!(create_match(&mut library, None, &home.id, "ffffffffffff").is_err());
        assert!(create_match(&mut library, None, "ffffffffffff", &away.id).is_err());
        assert!(library.matches.is_empty());
    }

    #[test]
    fn update_match_clears_label_on_empty_string() {
        let (mut library, fixture) = library_with_fixture();
        let updated = update_match(
            &mut library,
            &fixture.id,
            MatchPresetPatch {
                label: Some(Some("  Cup Final  ".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.label.as_deref(), Some("Cup Final"));
        let updated = update_match(
            &mut library,
            &fixture.id,
            MatchPresetPatch {
                label: Some(Some("   ".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            updated.label, None,
            "empty label clears to the derived name"
        );
    }

    #[test]
    fn rename_updates_derived_display_name() {
        let (mut library, fixture) = library_with_fixture();
        assert_eq!(display_name(&library, &fixture), "LIONS vs TIGERS");
        let home_id = fixture.home_team_id.clone();
        update_team(
            &mut library,
            &home_id,
            TeamPresetPatch {
                name: Some("BEARS".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let fixture = find_match(&library, &fixture.id).unwrap();
        assert_eq!(display_name(&library, fixture), "BEARS vs TIGERS");
    }

    #[test]
    fn load_drops_matches_with_dangling_refs() {
        let dir = temp_dir("dangling");
        let path = dir.join("presets.json");
        std::fs::write(
            &path,
            r##"{"schemaVersion":1,"teams":[{"id":"aaaaaaaaaaaa","name":"LIONS","color":"#c81e1e"}],"matches":[{"id":"bbbbbbbbbbbb","label":null,"homeTeamId":"aaaaaaaaaaaa","awayTeamId":"cccccccccccc"}]}"##,
        )
        .unwrap();
        let library = load_from(&path);
        assert_eq!(library.teams.len(), 1);
        assert!(library.matches.is_empty(), "dangling refs are dropped");
        assert_eq!(library.schema_version, PRESETS_SCHEMA_VERSION);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_file_yields_empty_library_and_renames_backup() {
        let dir = temp_dir("corrupt");
        let path = dir.join("presets.json");
        std::fs::write(&path, "{ not json").unwrap();
        let library = load_from(&path);
        assert!(library.teams.is_empty());
        assert!(library.matches.is_empty());
        assert!(!path.exists(), "corrupt file is renamed aside");
        let backups: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("presets.corrupt-")
            })
            .collect();
        assert_eq!(
            backups.len(),
            1,
            "corrupt file kept as a timestamped backup"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_file_yields_empty_library() {
        let dir = temp_dir("missing");
        let library = load_from(&dir.join("presets.json"));
        assert_eq!(library.schema_version, PRESETS_SCHEMA_VERSION);
        assert!(library.teams.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_load_round_trips() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("presets.json");
        let (library, _fixture) = library_with_fixture();
        save_to(&path, &library).unwrap();
        let loaded = load_from(&path);
        assert_eq!(loaded.teams.len(), 2);
        assert_eq!(loaded.matches.len(), 1);
        assert_eq!(
            loaded.matches[0].home_team_id,
            library.matches[0].home_team_id
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn preset_load_applies_identity_to_settings_and_scoreboard() {
        let (library, fixture) = library_with_fixture();
        let state = AppState::with_presets(library);

        let settings: Settings = state.preset_load(&fixture.id).await.unwrap();
        assert_eq!(settings.team_home_name, "LIONS");
        assert_eq!(settings.team_away_name, "TIGERS");
        assert_eq!(settings.team_home_color, "#c81e1e");
        assert_eq!(settings.team_away_color, "#1e5fc8");

        let sb = state.current().await;
        assert_eq!(sb.team_home_name, "LIONS");
        assert_eq!(sb.team_away_name, "TIGERS");

        assert!(state.preset_load("ffffffffffff").await.is_err());
    }

    #[tokio::test]
    async fn preset_load_leaves_score_half_and_timer_untouched() {
        let (library, fixture) = library_with_fixture();
        let state = AppState::with_presets(library);
        state.dispatch(Action::ScoreHomeInc).await.unwrap();
        state.dispatch(Action::HalfInc).await.unwrap();
        state
            .dispatch(Action::Patch(ScoreboardPatch {
                timer: Some(300),
                ..Default::default()
            }))
            .await
            .unwrap();

        state.preset_load(&fixture.id).await.unwrap();

        let sb = state.current().await;
        assert_eq!(sb.team_home_name, "LIONS", "identity loaded");
        assert_eq!(sb.team_home_score, 1, "score untouched");
        assert_eq!(sb.half, 2, "half untouched");
        assert_eq!(sb.timer, 300, "timer untouched");
    }

    #[test]
    fn menu_label_escapes_ampersand() {
        assert_eq!(escape_menu_label("Rangers & Co"), "Rangers && Co");
        assert_eq!(escape_menu_label("A & B & C"), "A && B && C");
        assert_eq!(escape_menu_label("Plain"), "Plain");
    }
}
