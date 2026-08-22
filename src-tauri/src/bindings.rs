//! ts-rs export surface.
//!
//! `cargo test --manifest-path src-tauri/Cargo.toml export_bindings`
//! (wired as `pnpm bindings`) regenerates `src/bindings/*.ts` from the
//! authoritative Rust types (tauri-rebuild doc 02 §1). The generated files
//! are committed; CI fails if they drift.

#[cfg(test)]
mod tests {
    use crate::net::LanAddress;
    use crate::settings::{Settings, SettingsPatch};
    use crate::state::{Action, ScoreboardPatch, ScoreboardState, ServerInfo, ServerStatus};
    use crate::windows::AppWindow;
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
    }
}
