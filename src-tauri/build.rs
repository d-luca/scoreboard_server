fn main() {
    tauri_build::build();

    // `tauri-build` embeds the Windows manifest (Common-Controls v6, …) only
    // into bin targets. Test binaries then fail at process load with
    // STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) because they import
    // `TaskDialogIndirect` (via tauri-plugin-dialog), which only exists in
    // comctl32 v6. Link the same generated resource into test binaries too.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let rc = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set"))
            .join("resource.rc");
        if rc.exists() {
            let _ = embed_resource::compile_for_tests(&rc, embed_resource::NONE);
        }
    }
}
