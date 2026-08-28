//! Settings persistence (tauri-rebuild doc 03 §6, doc 02 §9).
//!
//! `Settings` is the single place everything the app must remember lives:
//! team identity, loadouts, server port, control-token policy, buzzer
//! choice. Loaded once at startup (never fails — a corrupt file is renamed
//! aside and defaults are used), saved atomically (tmp + fsync + rename),
//! debounced by the callers that mutate it rapidly.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use ts_rs::TS;

use crate::state::ScoreboardState;

/// Current on-disk schema. Bump when the shape changes; `migrate` upgrades.
pub const SCHEMA_VERSION: u32 = 1;

/// Default HTTP port for the LAN server (doc 02 §9).
pub const DEFAULT_SERVER_PORT: u16 = 3001;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export_to = "../../src/bindings/")]
pub struct Settings {
    pub schema_version: u32,
    pub server_port: u16,
    pub require_control_token: bool,
    /// [NEW] Optionally pin the control token so a bookmarked phone link
    /// survives restarts. `None` (default) regenerates every launch.
    pub pinned_control_token: Option<String>,
    /// Custom buzzer track selected by the user; `None` = built-in default.
    pub buzzer_track_path: Option<String>,
    pub buzzer_auto_play: bool,
    /// [OPTIONAL] Match-recording output directory (doc 06 §A3); `None` =
    /// `document_dir()/ScoreboardRecordings`.
    pub recording_output_dir: Option<String>,
    /// [NEW] Windows first-run firewall explainer (doc 07 §4.1). Once the
    /// dialog has been acknowledged it is never shown again.
    pub firewall_notice_shown: bool,
    pub half_prefix: String,
    pub team_home_name: String,
    pub team_away_name: String,
    pub team_home_color: String,
    pub team_away_color: String,
    pub timer_loadouts: [u32; 3],
}

impl Default for Settings {
    fn default() -> Self {
        let scoreboard = ScoreboardState::default();
        Self {
            schema_version: SCHEMA_VERSION,
            server_port: DEFAULT_SERVER_PORT,
            require_control_token: true,
            pinned_control_token: None,
            buzzer_track_path: None,
            buzzer_auto_play: true,
            recording_output_dir: None,
            firewall_notice_shown: false,
            half_prefix: scoreboard.half_prefix,
            team_home_name: scoreboard.team_home_name,
            team_away_name: scoreboard.team_away_name,
            team_home_color: scoreboard.team_home_color,
            team_away_color: scoreboard.team_away_color,
            timer_loadouts: [
                scoreboard.timer_loadout1,
                scoreboard.timer_loadout2,
                scoreboard.timer_loadout3,
            ],
        }
    }
}

/// Partial update over [`Settings`]; `None` leaves the field unchanged.
///
/// `deny_unknown_fields` matches the `ScoreboardPatch` discipline: a typo in
/// the Settings window surfaces as an error instead of being dropped.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
#[ts(export_to = "../../src/bindings/")]
pub struct SettingsPatch {
    #[ts(optional)]
    pub server_port: Option<u16>,
    #[ts(optional)]
    pub require_control_token: Option<bool>,
    /// Nullable vs absent: `None` = leave, `Some(None)` = clear, `Some(Some(p))` = set.
    #[ts(optional, type = "string | null")]
    pub buzzer_track_path: Option<Option<String>>,
    #[ts(optional)]
    pub buzzer_auto_play: Option<bool>,
    /// Nullable vs absent: `None` = leave, `Some(None)` = reset to the
    /// default directory, `Some(Some(d))` = set.
    #[ts(optional, type = "string | null")]
    pub recording_output_dir: Option<Option<String>>,
    #[ts(optional)]
    pub firewall_notice_shown: Option<bool>,
    #[ts(optional)]
    pub half_prefix: Option<String>,
    #[ts(optional)]
    pub team_home_name: Option<String>,
    #[ts(optional)]
    pub team_away_name: Option<String>,
    #[ts(optional)]
    pub team_home_color: Option<String>,
    #[ts(optional)]
    pub team_away_color: Option<String>,
    #[ts(optional)]
    pub timer_loadouts: Option<[u32; 3]>,
}

/// `app_config_dir()/settings.json`.
pub fn path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("settings.json")
}

/// Load from disk; never fails. A missing file yields defaults. A corrupt
/// file is renamed to `settings.corrupt-<unix_ts>.json`, a warning is
/// logged, and defaults are used.
pub fn load(app: &AppHandle) -> Settings {
    let path = path(app);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Settings::default();
    };
    match serde_json::from_str::<Settings>(&raw) {
        Ok(mut settings) => {
            migrate(&mut settings);
            settings
        }
        Err(error) => {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_file_name(format!("settings.corrupt-{timestamp}.json"));
            tracing::warn!(
                ?error,
                backup = %backup.display(),
                "settings.json is corrupt; resetting to defaults"
            );
            if let Err(rename_error) = std::fs::rename(&path, &backup) {
                tracing::warn!(?rename_error, "failed to rename corrupt settings.json");
            }
            Settings::default()
        }
    }
}

/// Atomic save: write `settings.json.tmp`, fsync, then rename over the real
/// file. The Electron version truncated the live file and could leave it
/// empty on a crash.
pub fn save(app: &AppHandle, settings: &Settings) -> anyhow::Result<()> {
    let path = path(app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(&tmp, json)?;
    // fsync before the rename so the rename cannot point at unflushed data.
    // The handle needs write access: `FlushFileBuffers` fails with EACCESS
    // on a read-only handle on Windows.
    let file = std::fs::OpenOptions::new().write(true).open(&tmp)?;
    file.sync_all()?;
    drop(file);
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Apply a patch, validating the same way `ScoreboardPatch` does.
pub fn apply_patch(settings: &mut Settings, patch: SettingsPatch) -> Result<(), String> {
    if let Some(port) = patch.server_port {
        settings.server_port = port;
    }
    if let Some(require) = patch.require_control_token {
        settings.require_control_token = require;
    }
    if let Some(track) = patch.buzzer_track_path {
        settings.buzzer_track_path = track.filter(|path| !path.trim().is_empty());
    }
    if let Some(auto_play) = patch.buzzer_auto_play {
        settings.buzzer_auto_play = auto_play;
    }
    if let Some(dir) = patch.recording_output_dir {
        settings.recording_output_dir = dir.filter(|path| !path.trim().is_empty());
    }
    if let Some(shown) = patch.firewall_notice_shown {
        settings.firewall_notice_shown = shown;
    }
    if let Some(prefix) = patch.half_prefix {
        settings.half_prefix = prefix
            .trim()
            .chars()
            .take(crate::state::MAX_PREFIX_LEN)
            .collect();
    }
    if let Some(name) = patch.team_home_name {
        settings.team_home_name = validate_name(&name)?;
    }
    if let Some(name) = patch.team_away_name {
        settings.team_away_name = validate_name(&name)?;
    }
    if let Some(color) = patch.team_home_color {
        settings.team_home_color = validate_color(&color)?;
    }
    if let Some(color) = patch.team_away_color {
        settings.team_away_color = validate_color(&color)?;
    }
    if let Some(loadouts) = patch.timer_loadouts {
        settings.timer_loadouts =
            loadouts.map(|loadout| loadout.min(crate::state::MAX_LOADOUT_SECS));
    }
    Ok(())
}

/// Seed a `ScoreboardState` from persisted settings at startup (doc 03 §6).
pub fn seed_scoreboard(settings: &Settings) -> ScoreboardState {
    let default = ScoreboardState::default();
    ScoreboardState {
        team_home_name: if settings.team_home_name.is_empty() {
            default.team_home_name
        } else {
            settings.team_home_name.clone()
        },
        team_away_name: if settings.team_away_name.is_empty() {
            default.team_away_name
        } else {
            settings.team_away_name.clone()
        },
        team_home_color: if settings.team_home_color.is_empty() {
            default.team_home_color
        } else {
            settings.team_home_color.clone()
        },
        team_away_color: if settings.team_away_color.is_empty() {
            default.team_away_color
        } else {
            settings.team_away_color.clone()
        },
        half_prefix: if settings.half_prefix.is_empty() {
            default.half_prefix
        } else {
            settings.half_prefix.clone()
        },
        timer_loadout1: settings.timer_loadouts[0],
        timer_loadout2: settings.timer_loadouts[1],
        timer_loadout3: settings.timer_loadouts[2],
        ..default
    }
}

/// Project settings into the live scoreboard without touching
/// match-progress fields (scores, half, timer, running state). Used when
/// Settings edits must be reflected on the board immediately.
pub fn apply_to_scoreboard(settings: &Settings, sb: &mut ScoreboardState) {
    sb.team_home_name = settings.team_home_name.clone();
    sb.team_away_name = settings.team_away_name.clone();
    sb.team_home_color = settings.team_home_color.clone();
    sb.team_away_color = settings.team_away_color.clone();
    sb.half_prefix = settings.half_prefix.clone();
    sb.timer_loadout1 = settings.timer_loadouts[0];
    sb.timer_loadout2 = settings.timer_loadouts[1];
    sb.timer_loadout3 = settings.timer_loadouts[2];
}

/// Extract the persisted identity fields from the live scoreboard (e.g. a
/// LAN client renamed a team via `Action::Patch`).
pub fn sync_from_scoreboard(settings: &mut Settings, sb: &ScoreboardState) {
    settings.team_home_name = sb.team_home_name.clone();
    settings.team_away_name = sb.team_away_name.clone();
    settings.team_home_color = sb.team_home_color.clone();
    settings.team_away_color = sb.team_away_color.clone();
    settings.half_prefix = sb.half_prefix.clone();
    settings.timer_loadouts = [sb.timer_loadout1, sb.timer_loadout2, sb.timer_loadout3];
}

fn migrate(settings: &mut Settings) {
    // v1 is the first schema; nothing to upgrade yet. Future migrations
    // match on `schema_version` here and bump it at the end.
    settings.schema_version = SCHEMA_VERSION;
}

fn validate_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("team name must not be empty".into());
    }
    Ok(trimmed.chars().take(crate::state::MAX_NAME_LEN).collect())
}

fn validate_color(raw: &str) -> Result<String, String> {
    let bytes = raw.as_bytes();
    let valid =
        bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit);
    if !valid {
        return Err(format!("invalid colour {raw:?}: must match #RRGGBB"));
    }
    Ok(raw.to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_applies_and_validates() {
        let mut settings = Settings::default();
        apply_patch(
            &mut settings,
            SettingsPatch {
                team_home_name: Some("  LIONS  ".into()),
                team_away_color: Some("#FF0000".into()),
                timer_loadouts: Some([1, 2, u32::MAX]),
                require_control_token: Some(false),
                buzzer_track_path: Some(Some("/tmp/buzzer.wav".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(settings.team_home_name, "LIONS");
        assert_eq!(settings.team_away_color, "#ff0000");
        assert_eq!(settings.timer_loadouts[2], crate::state::MAX_LOADOUT_SECS);
        assert!(!settings.require_control_token);
        assert_eq!(
            settings.buzzer_track_path.as_deref(),
            Some("/tmp/buzzer.wav")
        );

        // Clearing the track: Some(None) clears, None leaves unchanged.
        apply_patch(
            &mut settings,
            SettingsPatch {
                buzzer_track_path: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(settings.buzzer_track_path, None);

        let err = apply_patch(
            &mut settings,
            SettingsPatch {
                team_home_name: Some("   ".into()),
                ..Default::default()
            },
        )
        .unwrap_err();
        assert!(err.contains("empty"), "{err}");
        // The failed patch did not clobber the good name.
        assert_eq!(settings.team_home_name, "LIONS");
    }

    #[test]
    fn seed_scoreboard_uses_settings_identity() {
        let settings = Settings {
            team_home_name: "LIONS".into(),
            team_away_name: "TIGERS".into(),
            team_home_color: "#123abc".into(),
            timer_loadouts: [60, 120, 180],
            ..Default::default()
        };
        let sb = seed_scoreboard(&settings);
        assert_eq!(sb.team_home_name, "LIONS");
        assert_eq!(sb.team_away_name, "TIGERS");
        assert_eq!(sb.team_home_color, "#123abc");
        assert_eq!(sb.timer_loadout1, 60);
        assert_eq!(sb.timer_loadout3, 180);
        // Match-progress fields stay at defaults.
        assert_eq!(sb.team_home_score, 0);
        assert_eq!(sb.half, 1);
    }

    #[test]
    fn apply_to_scoreboard_preserves_match_progress() {
        let settings = Settings {
            team_home_name: "LIONS".into(),
            timer_loadouts: [60, 120, 180],
            ..Default::default()
        };
        let mut sb = ScoreboardState {
            team_home_score: 7,
            half: 3,
            timer: 42,
            is_timer_running: true,
            ..ScoreboardState::default()
        };
        apply_to_scoreboard(&settings, &mut sb);
        assert_eq!(sb.team_home_name, "LIONS");
        assert_eq!(sb.timer_loadout1, 60);
        assert_eq!(sb.team_home_score, 7);
        assert_eq!(sb.half, 3);
        assert_eq!(sb.timer, 42);
        assert!(sb.is_timer_running);
    }

    #[test]
    fn sync_from_scoreboard_captures_identity() {
        let mut settings = Settings::default();
        let sb = ScoreboardState {
            team_home_name: "LIONS".into(),
            half_prefix: "TEMPO".into(),
            timer_loadout2: 999,
            ..ScoreboardState::default()
        };
        sync_from_scoreboard(&mut settings, &sb);
        assert_eq!(settings.team_home_name, "LIONS");
        assert_eq!(settings.half_prefix, "TEMPO");
        assert_eq!(settings.timer_loadouts, [900, 999, 1200]);
    }
}
