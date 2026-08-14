//! ts-rs export surface.
//!
//! Phase 0 ships only a probe type so the `pnpm bindings` pipeline
//! (`cargo test export_bindings`) can be verified end-to-end and
//! `src/bindings/` can be committed. Phase 1 replaces this with the real
//! domain types from tauri-rebuild doc 02 §1 (`ScoreboardState`,
//! `ScoreboardPatch`, `Action`, ...).

use ts_rs::TS;

#[derive(TS)]
#[ts(export, export_to = "../../src/bindings/")]
// Placeholder: only constructed in Phase 1 when the real domain types land.
#[allow(dead_code)]
pub struct PhaseZeroProbe {
    pub ready: bool,
}

#[cfg(test)]
mod tests {
    use super::PhaseZeroProbe;
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        PhaseZeroProbe::export().expect("failed to export TS bindings");
    }
}
