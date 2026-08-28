fn main() {
    tauri_build::build();

    // The video generator resolves its bundled ffmpeg sidecar as
    // `binaries/ffmpeg-<target-triple>[.exe]` under the resource dir
    // (doc 06 §B3); make the triple available to the crate.
    println!(
        "cargo:rustc-env=TARGET_TRIPLE={}",
        std::env::var("TARGET").expect("TARGET not set")
    );

    // `tauri-build` embeds the Windows manifest (Common-Controls v6, …) only
    // into bin targets. Test binaries then fail at process load with
    // STATUS_ENTRYPOINT_NOT_FOUND (0xc0000139) because they import
    // `TaskDialogIndirect` (via tauri-plugin-dialog), which only exists in
    // comctl32 v6. Link the same generated resource into test binaries too.
    //
    // Caveat: Cargo applies `cargo:rustc-link-arg-tests` (and the plain
    // `cargo:rustc-link-arg`) to integration tests but not to the library's
    // own unit-test target, so the `--lib` test binary still lacks the
    // manifest on Windows. To run the lib unit tests locally, embed the
    // manifest post-link, e.g.:
    //   cargo test --lib --no-run
    //   mt.exe -manifest comctl32-v6.manifest -outputresource:<test-exe>;1
    //   <test-exe>
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let rc = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set"))
            .join("resource.rc");
        if rc.exists() {
            let _ = embed_resource::compile_for_tests(&rc, embed_resource::NONE);
        }
    }
}
