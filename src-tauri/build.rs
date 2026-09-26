fn main() {
    // Workaround for https://github.com/tauri-apps/tauri/issues/13419:
    // `tauri-build` embeds the Windows app manifest (Common-Controls v6, which
    // exports `TaskDialogIndirect`, imported via tauri-plugin-dialog) with
    // `cargo:rustc-link-arg-bins`, so only the app binary gets it. Every test
    // executable then fails at process load with STATUS_ENTRYPOINT_NOT_FOUND
    // (0xc0000139) before any test runs. On Windows MSVC targets we embed the
    // manifest ourselves instead: tauri-build's copy is disabled and the same
    // XML is passed to the linker via the target-unspecific
    // `cargo:rustc-link-arg`, which reaches bins, tests, examples, and benches
    // alike (the `-bins`/`-tests` scoped variants never cover the lib's own
    // unit-test binary). windows-app-manifest.xml is a byte-for-byte copy of
    // tauri-build's default manifest, so the shipped binary is unchanged.
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    let mut attributes = tauri_build::Attributes::new();
    if is_windows_msvc {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    }
    tauri_build::try_build(attributes).expect("failed to run tauri-build");

    if is_windows_msvc {
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }

    // The video generator resolves its bundled ffmpeg sidecar as
    // `binaries/ffmpeg-<target-triple>[.exe]` under the resource dir;
    // make the triple available to the crate.
    println!(
        "cargo:rustc-env=TARGET_TRIPLE={}",
        std::env::var("TARGET").expect("TARGET not set")
    );
}
