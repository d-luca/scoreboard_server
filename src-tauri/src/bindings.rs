//! ts-rs export surface.
//!
//! `cargo test --manifest-path src-tauri/Cargo.toml export_bindings`
//! (wired as `pnpm bindings`) regenerates `src/bindings/*.ts` from the
//! authoritative Rust types (tauri-rebuild doc 02 §1). The generated files
//! are committed; CI fails if they drift.

#[cfg(test)]
mod tests {
    use crate::state::{Action, ScoreboardPatch, ScoreboardState};
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        ScoreboardState::export().expect("failed to export ScoreboardState");
        ScoreboardPatch::export().expect("failed to export ScoreboardPatch");
        Action::export().expect("failed to export Action");
    }
}
