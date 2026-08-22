//! ts-rs export surface.
//!
//! `cargo test --manifest-path src-tauri/Cargo.toml export_bindings`
//! (wired as `pnpm bindings`) regenerates `src/bindings/*.ts` from the
//! authoritative Rust types (tauri-rebuild doc 02 §1). The generated files
//! are committed; CI fails if they drift.
//!
//! The test lives in `tests/export_bindings.rs` (an integration test) so
//! that on Windows the comctl32 v6 manifest from build.rs is linked into
//! the test binary — lib unit tests don't receive `rustc-link-arg-tests`
//! and fail to load with STATUS_ENTRYPOINT_NOT_FOUND (TaskDialogIndirect).
