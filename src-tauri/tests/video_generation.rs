//! Integration tests for video generation.
//!
//! Lives in `tests/` (not a lib unit test) so the Windows comctl32 v6
//! manifest from build.rs is linked in — see tests/export_bindings.rs.
//!
//! The end-to-end test needs a working ffmpeg (bundled sidecar in a release
//! install, or `PATH` in development). It auto-skips with a printed notice
//! when none is found, so CI stays green without ffmpeg.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use scoreboard_server_lib::layouts::{
    LayoutDefinition, PublishedLayoutSelection, SavedLayoutSelection,
};
use scoreboard_server_lib::presets::PresetLibrary;
use scoreboard_server_lib::settings::Settings;
use scoreboard_server_lib::state::{AppPrefs, AppState, Shared};
use scoreboard_server_lib::video::{self, GenerationStep, VideoGenerationConfig};

fn shared() -> Shared {
    AppState::with_prefs(
        AppPrefs::default(),
        Settings::default(),
        PresetLibrary::empty(),
        scoreboard_server_lib::layouts::LayoutService::load_from(
            std::env::temp_dir().join(format!("sb-video-layouts-{}.json", uuid::Uuid::new_v4())),
        ),
    )
}

fn temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("sb-video-it-{tag}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A minimal valid v2 `.sbrec` with `count` snapshots.
fn write_fixture(dir: &Path, count: usize) -> PathBuf {
    let path = dir.join("HOME-AWAY-2026-08-28T12-00-00.sbrec");
    let mut content = String::from(
        "{\"version\":2,\"recordingId\":\"it-1\",\"startedAt\":\"2026-08-28T12:00:00Z\",\"homeName\":\"HOME\",\"awayName\":\"AWAY\"}\n",
    );
    for t in 0..count {
        content.push_str(&format!(
            "{{\"t\":{t},\"hs\":{t},\"as\":2,\"tm\":{},\"hf\":1,\"hn\":\"HOME\",\"an\":\"AWAY\",\"hc\":\"#00ff00\",\"ac\":\"#ff0000\",\"hp\":\"PERIODO\"}}\n",
            900 - t
        ));
    }
    content.push_str("{\"endedAt\":\"2026-08-28T12:00:05Z\",\"totalSnapshots\":5}\n");
    std::fs::write(&path, content).unwrap();
    path
}

/// Solid RGBA frames with per-frame alpha < 255, so the alpha channel is
/// genuinely exercised (a flat 255 alpha could survive a broken pipeline).
fn frame(width: u32, height: u32, index: u64) -> Vec<u8> {
    let mut frame = vec![0u8; width as usize * height as usize * 4];
    for px in frame.chunks_exact_mut(4) {
        px[0] = (index * 40) as u8; // r
        px[1] = 80; // g
        px[2] = 200; // b
        px[3] = 128; // a — semi-transparent on purpose
    }
    frame
}

fn batch(start: u64, frames: &[Vec<u8>]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(8 + frames.len() * frames[0].len());
    bytes.extend_from_slice(&(start as u32).to_le_bytes());
    bytes.extend_from_slice(&(frames.len() as u32).to_le_bytes());
    for frame in frames {
        bytes.extend_from_slice(frame);
    }
    bytes
}

/// Wait until the watcher clears the session (terminal state reached).
fn wait_until_idle(shared: &Shared, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    loop {
        if shared.video.lock().unwrap().is_none() {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "generation did not finish in time"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn ffprobe_summary(ffprobe: &Path, file: &Path) -> Option<serde_json::Value> {
    let output = std::process::Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
        ])
        .arg(file)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

/// Decode to raw RGBA and return the mean alpha. VP9-in-WebM alpha rides in
/// BlockAdditional side-data; ffmpeg's *native* vp9 decoder silently drops
/// it, so decode with libvpx explicitly (OBS/Chromium handle it either way).
fn mean_alpha(ffmpeg: &Path, file: &Path) -> Option<f64> {
    let decoded = file.with_extension("decoded.rgba");
    let status = std::process::Command::new(ffmpeg)
        .args(["-y", "-v", "error", "-c:v", "libvpx-vp9", "-i"])
        .arg(file)
        .args(["-f", "rawvideo", "-pix_fmt", "rgba"])
        .arg(&decoded)
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    let data = std::fs::read(&decoded).ok()?;
    let (sum, count) = data
        .iter()
        .skip(3)
        .step_by(4)
        .fold((0u64, 0u64), |(sum, count), &a| (sum + a as u64, count + 1));
    (count > 0).then(|| sum as f64 / count as f64)
}

#[tokio::test]
async fn generates_webm_with_alpha_end_to_end() {
    let Some(ffmpeg) = video::resolve_ffmpeg(None) else {
        eprintln!("skipping video e2e: ffmpeg not found on PATH");
        return;
    };
    eprintln!("using ffmpeg at {}", ffmpeg.display());

    let dir = temp_dir("encode");
    let recording = write_fixture(&dir, 3);
    let output = dir.join("out.webm");
    let shared = shared();

    let started = video::generate(
        &shared,
        None,
        VideoGenerationConfig {
            recording_path: recording.to_string_lossy().into_owned(),
            output_path: output.to_string_lossy().into_owned(),
            frame_rate: 30,
            scoreboard_scale: 1.0,
            layout: None,
        },
    )
    .expect("generate failed");
    assert_eq!(started.total_frames, 3);
    assert_eq!((started.width, started.height), (622, 80));

    // Pull snapshots like the webview would, then push the rendered frames
    // in two batches to exercise batching.
    let snapshots = video::frames(&shared, 0, 30).unwrap();
    assert_eq!(snapshots.len(), 3);
    video::push_frames(&shared, &batch(0, &[frame(622, 80, 0), frame(622, 80, 1)]))
        .await
        .unwrap();
    video::push_frames(&shared, &batch(2, &[frame(622, 80, 2)]))
        .await
        .unwrap();

    wait_until_idle(&shared, Duration::from_secs(60));

    let progress = video::progress(&shared);
    assert_eq!(progress.step, GenerationStep::Complete, "{progress:?}");
    assert_eq!(progress.overall_progress, 100);

    let bytes = std::fs::metadata(&output).unwrap().len();
    assert!(bytes > 0, "output file is empty");

    // ffprobe ships with ffmpeg; when present, verify geometry and duration
    // (one input frame per recording second), then decode with libvpx and
    // check the alpha channel survived (input frames use alpha 128).
    let ffprobe = if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
    let ffprobe_available = std::process::Command::new(ffprobe)
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if ffprobe_available {
        let summary = ffprobe_summary(Path::new(ffprobe), &output).expect("ffprobe failed");
        let stream = &summary["streams"][0];
        assert_eq!(stream["width"], 622);
        assert_eq!(stream["height"], 80);
        let duration: f64 = summary["format"]["duration"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();
        assert!(
            (duration - 3.0).abs() < 0.2,
            "expected ~3 s duration, got {duration}"
        );

        let alpha = mean_alpha(&ffmpeg, &output).expect("alpha decode failed");
        assert!(
            (alpha - 128.0).abs() < 4.0,
            "alpha channel lost: expected ~128, got {alpha}"
        );
    }

    // Generating twice in a row must work.
    let started = video::generate(
        &shared,
        None,
        VideoGenerationConfig {
            recording_path: recording.to_string_lossy().into_owned(),
            output_path: output.to_string_lossy().into_owned(),
            frame_rate: 30,
            scoreboard_scale: 1.0,
            layout: None,
        },
    )
    .expect("second generate failed");
    assert_eq!(started.total_frames, 3);
    video::push_frames(
        &shared,
        &batch(
            0,
            &[frame(622, 80, 0), frame(622, 80, 1), frame(622, 80, 2)],
        ),
    )
    .await
    .unwrap();
    wait_until_idle(&shared, Duration::from_secs(60));
    assert_eq!(video::progress(&shared).step, GenerationStep::Complete);

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn cancel_kills_ffmpeg_and_removes_partial_output() {
    let Some(_) = video::resolve_ffmpeg(None) else {
        eprintln!("skipping video cancel test: ffmpeg not found on PATH");
        return;
    };

    let dir = temp_dir("cancel");
    // Plenty of frames so the encode is still in flight when we cancel.
    let recording = write_fixture(&dir, 600);
    let output = dir.join("cancelled.webm");
    let shared = shared();

    video::generate(
        &shared,
        None,
        VideoGenerationConfig {
            recording_path: recording.to_string_lossy().into_owned(),
            output_path: output.to_string_lossy().into_owned(),
            frame_rate: 30,
            scoreboard_scale: 1.0,
            layout: None,
        },
    )
    .unwrap();

    video::push_frames(&shared, &batch(0, &[frame(622, 80, 0)]))
        .await
        .unwrap();
    video::cancel(&shared).unwrap();
    // Further pushes are rejected.
    let rejected = video::push_frames(&shared, &batch(1, &[frame(622, 80, 1)])).await;
    assert!(rejected.is_err());

    wait_until_idle(&shared, Duration::from_secs(30));

    let progress = video::progress(&shared);
    assert_eq!(progress.step, GenerationStep::Error, "{progress:?}");
    assert_eq!(progress.error.as_deref(), Some("Generation cancelled"));
    assert!(!output.exists(), "partial output must be deleted on cancel");

    std::fs::remove_dir_all(&dir).ok();
}

fn custom_definition(width: u32, height: u32) -> LayoutDefinition {
    let root_id = uuid::Uuid::new_v4().to_string();
    serde_json::from_value(serde_json::json!({
        "root": {
            "kind": "root",
            "id": root_id,
            "width": width,
            "height": height,
            "background": { "kind": "literal", "hex": "#000000", "alpha": 0.0 },
            "children": []
        },
        "editor": {
            "layers": [{ "nodeId": root_id, "label": "Root", "locked": false }]
        }
    }))
    .unwrap()
}

/// Saves a layout and returns `(id, revision)`.
async fn save_layout(shared: &Shared, name: &str, width: u32, height: u32) -> (String, u64) {
    let created = shared
        .layouts
        .create(name.into(), custom_definition(width, height))
        .await
        .unwrap();
    let entry = created
        .library
        .entries
        .iter()
        .find(|entry| entry.name == name)
        .unwrap();
    (entry.id.clone(), entry.revision)
}

fn custom_config(
    recording: &Path,
    output: &Path,
    scale: f64,
    id: &str,
    revision: u64,
) -> VideoGenerationConfig {
    VideoGenerationConfig {
        recording_path: recording.to_string_lossy().into_owned(),
        output_path: output.to_string_lossy().into_owned(),
        frame_rate: 30,
        scoreboard_scale: scale,
        layout: Some(SavedLayoutSelection::Custom {
            id: id.into(),
            expected_revision: revision,
        }),
    }
}

fn ffprobe_available() -> Option<&'static Path> {
    let ffprobe = if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
    std::process::Command::new(ffprobe)
        .arg("-version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|_| Path::new(ffprobe))
}

#[tokio::test]
async fn custom_layout_exports_padded_frozen_frames_end_to_end() {
    let Some(ffmpeg) = video::resolve_ffmpeg(None) else {
        eprintln!("skipping custom video e2e: ffmpeg not found on PATH");
        return;
    };

    let dir = temp_dir("custom");
    let recording = write_fixture(&dir, 3);
    let output = dir.join("custom.webm");
    let shared = shared();
    let (id, revision) = save_layout(&shared, "Odd fixture", 621, 79).await;
    // Live output uses a different layout; exporting must not change it.
    let (live_id, live_revision) = save_layout(&shared, "Live fixture", 320, 120).await;
    let live = shared
        .layouts
        .apply(
            SavedLayoutSelection::Custom {
                id: live_id.clone(),
                expected_revision: live_revision,
            },
            0,
        )
        .await
        .unwrap()
        .library
        .published;

    let started = video::generate(
        &shared,
        None,
        custom_config(&recording, &output, 1.0, &id, revision),
    )
    .expect("custom generate failed");
    assert_eq!((started.width, started.height), (622, 80));
    assert_eq!(
        (started.content_width, started.content_height),
        (621.0, 79.0)
    );
    assert_eq!(started.batch_frames, 30);
    let PublishedLayoutSelection::Custom {
        source_id,
        source_revision,
        root,
        ..
    } = &started.layout
    else {
        panic!("expected custom layout, got {:?}", started.layout);
    };
    assert_eq!(
        (source_id.as_str(), *source_revision),
        (id.as_str(), revision)
    );
    assert_eq!((root.width, root.height), (621, 79));
    assert_eq!(
        shared.layouts.published(),
        live,
        "export changed live output"
    );

    // Saving a new revision mid-job must not affect the running export.
    let snapshot = shared.layouts.snapshot();
    let entry = snapshot
        .entries
        .iter()
        .find(|e| e.id == id)
        .unwrap()
        .clone();
    let mut edited = entry.definition.clone();
    edited.root.width = 700;
    let saved = shared
        .layouts
        .save(id.clone(), revision, entry.name.clone(), edited)
        .await
        .unwrap();
    // …and neither may a live Apply of that newer revision.
    let new_revision = saved
        .library
        .entries
        .iter()
        .find(|e| e.id == id)
        .unwrap()
        .revision;
    shared
        .layouts
        .apply(
            SavedLayoutSelection::Custom {
                id: id.clone(),
                expected_revision: new_revision,
            },
            live.revision,
        )
        .await
        .unwrap();

    assert!(
        video::frames(&shared, 0, 31).is_err(),
        "count above batchFrames"
    );
    assert_eq!(video::frames(&shared, 0, 3).unwrap().len(), 3);
    video::push_frames(
        &shared,
        &batch(
            0,
            &[frame(622, 80, 0), frame(622, 80, 1), frame(622, 80, 2)],
        ),
    )
    .await
    .unwrap();
    wait_until_idle(&shared, Duration::from_secs(60));
    let progress = video::progress(&shared);
    assert_eq!(progress.step, GenerationStep::Complete, "{progress:?}");

    if let Some(ffprobe) = ffprobe_available() {
        let summary = ffprobe_summary(ffprobe, &output).expect("ffprobe failed");
        assert_eq!(summary["streams"][0]["width"], 622);
        assert_eq!(summary["streams"][0]["height"], 80);
        let duration: f64 = summary["format"]["duration"]
            .as_str()
            .unwrap()
            .parse()
            .unwrap();
        assert!((duration - 3.0).abs() < 0.2, "duration {duration}");
        let alpha = mean_alpha(&ffmpeg, &output).expect("alpha decode failed");
        assert!((alpha - 128.0).abs() < 4.0, "alpha {alpha}");
    }

    // The old revision is now stale and must be rejected.
    let stale = dir.join("stale.webm");
    let err = video::generate(
        &shared,
        None,
        custom_config(&recording, &stale, 1.0, &id, revision),
    )
    .unwrap_err();
    assert!(err.contains("changed since selection"), "{err}");
    assert!(!stale.exists());

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn custom_layout_rejections_happen_before_ffmpeg() {
    let dir = temp_dir("custom-reject");
    let recording = write_fixture(&dir, 3);
    let output = dir.join("rejected.webm");
    let shared = shared();
    let (id, revision) = save_layout(&shared, "4K fixture", 3840, 2160).await;

    let err = video::generate(
        &shared,
        None,
        custom_config(&recording, &output, 1.5, &id, revision),
    )
    .unwrap_err();
    assert!(!err.is_empty());
    let err = video::generate(
        &shared,
        None,
        custom_config(&recording, &output, 1.0, "missing-layout", 1),
    )
    .unwrap_err();
    assert!(!err.is_empty());
    let err = video::generate(
        &shared,
        None,
        custom_config(&recording, &output, 1.0, &id, revision + 1),
    )
    .unwrap_err();
    assert!(!err.is_empty());

    assert!(
        shared.video.lock().unwrap().is_none(),
        "no session may start"
    );
    assert!(!output.exists(), "no output may be created");
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn custom_4k_layout_uses_single_frame_batches_end_to_end() {
    let Some(_) = video::resolve_ffmpeg(None) else {
        eprintln!("skipping 4K video e2e: ffmpeg not found on PATH");
        return;
    };

    let dir = temp_dir("custom-4k");
    let recording = write_fixture(&dir, 2);
    let output = dir.join("4k.webm");
    let shared = shared();
    let (id, revision) = save_layout(&shared, "4K fixture", 3840, 2160).await;

    let started = video::generate(
        &shared,
        None,
        custom_config(&recording, &output, 1.0, &id, revision),
    )
    .expect("4K generate failed");
    assert_eq!((started.width, started.height), (3840, 2160));
    assert_eq!(started.batch_frames, 1);
    assert!(video::frames(&shared, 0, 2).is_err());

    let first = frame(3840, 2160, 0);
    let second = frame(3840, 2160, 1);
    assert!(
        video::push_frames(&shared, &batch(0, &[first.clone(), second.clone()]))
            .await
            .is_err(),
        "two 4K frames exceed batchFrames"
    );
    video::push_frames(&shared, &batch(0, &[first]))
        .await
        .unwrap();
    video::push_frames(&shared, &batch(1, &[second]))
        .await
        .unwrap();
    wait_until_idle(&shared, Duration::from_secs(120));
    let progress = video::progress(&shared);
    assert_eq!(progress.step, GenerationStep::Complete, "{progress:?}");

    if let Some(ffprobe) = ffprobe_available() {
        let summary = ffprobe_summary(ffprobe, &output).expect("ffprobe failed");
        assert_eq!(summary["streams"][0]["width"], 3840);
        assert_eq!(summary["streams"][0]["height"], 2160);
    }

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn custom_layout_cancel_removes_partial_output() {
    let Some(_) = video::resolve_ffmpeg(None) else {
        eprintln!("skipping custom cancel test: ffmpeg not found on PATH");
        return;
    };

    let dir = temp_dir("custom-cancel");
    let recording = write_fixture(&dir, 600);
    let output = dir.join("cancelled.webm");
    let shared = shared();
    let (id, revision) = save_layout(&shared, "Cancel fixture", 621, 79).await;

    video::generate(
        &shared,
        None,
        custom_config(&recording, &output, 1.0, &id, revision),
    )
    .unwrap();
    video::push_frames(&shared, &batch(0, &[frame(622, 80, 0)]))
        .await
        .unwrap();
    video::cancel(&shared).unwrap();
    wait_until_idle(&shared, Duration::from_secs(30));

    let progress = video::progress(&shared);
    assert_eq!(progress.step, GenerationStep::Error, "{progress:?}");
    assert!(!output.exists(), "partial output must be deleted on cancel");
    std::fs::remove_dir_all(&dir).ok();
}
