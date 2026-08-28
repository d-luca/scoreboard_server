//! Regenerates `src/bindings/*.ts` from the authoritative Rust types.
//!
//! Run explicitly via `pnpm bindings`
//! (`cargo test --manifest-path src-tauri/Cargo.toml export_bindings -- --ignored`).
//!
//! This is an integration test (not a lib unit test) on purpose: on Windows
//! the comctl32 v6 manifest emitted by build.rs via `rustc-link-arg-tests`
//! is only linked into explicit `[[test]]` targets. A lib unit test binary
//! lacks the manifest and fails at process load with
//! STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) because the linked
//! tauri-plugin-dialog imports `TaskDialogIndirect`, which only exists in
//! comctl32 v6. This file also keeps the "package has a test target"
//! validation for the build.rs directive satisfied.

use scoreboard_server_lib::net::LanAddress;
use scoreboard_server_lib::presets::{
    MatchPreset, MatchPresetPatch, PresetLibrary, TeamPreset, TeamPresetPatch,
};
use scoreboard_server_lib::recording::{RecentRecording, RecordingStatus, RecordingStopped};
use scoreboard_server_lib::settings::{Settings, SettingsPatch};
use scoreboard_server_lib::state::{
    Action, ScoreboardPatch, ScoreboardState, ServerInfo, ServerStatus,
};
use scoreboard_server_lib::windows::AppWindow;
use ts_rs::TS;

#[test]
#[ignore = "run explicitly via `pnpm bindings`"]
fn export_bindings() {
    ScoreboardState::export().expect("failed to export ScoreboardState");
    ScoreboardPatch::export().expect("failed to export ScoreboardPatch");
    Action::export().expect("failed to export Action");
    AppWindow::export().expect("failed to export AppWindow");
    LanAddress::export().expect("failed to export LanAddress");
    ServerInfo::export().expect("failed to export ServerInfo");
    ServerStatus::export().expect("failed to export ServerStatus");
    Settings::export().expect("failed to export Settings");
    SettingsPatch::export().expect("failed to export SettingsPatch");
    TeamPreset::export().expect("failed to export TeamPreset");
    MatchPreset::export().expect("failed to export MatchPreset");
    TeamPresetPatch::export().expect("failed to export TeamPresetPatch");
    MatchPresetPatch::export().expect("failed to export MatchPresetPatch");
    PresetLibrary::export().expect("failed to export PresetLibrary");
    RecordingStatus::export().expect("failed to export RecordingStatus");
    RecordingStopped::export().expect("failed to export RecordingStopped");
    RecentRecording::export().expect("failed to export RecentRecording");
}
