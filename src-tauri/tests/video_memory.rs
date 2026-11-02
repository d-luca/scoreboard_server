//! P9 export-memory measurement (opt-in, Linux only).
//!
//! Exports custom layouts at Full HD, 4K landscape and 4K portrait for several
//! recording lengths through the real backend batch path and ffmpeg, sampling
//! the resident memory of this process and of the ffmpeg child. This process
//! plays the webview's part exactly like `runRenderLoop`: one reused batch
//! buffer of `batchFrames` frames and one awaited push in flight.
//!
//! ```bash
//! cargo test --manifest-path src-tauri/Cargo.toml --release --test video_memory \
//!   -- --ignored --nocapture --test-threads=1
//! ```
//!
//! `SB_MEMORY_SECONDS` overrides the recording lengths (default `10,60,300`)
//! `SB_MEMORY_SIZES` limits the sizes (`full-hd,4k-landscape,4k-portrait`)
//! and `SB_MEMORY_FPS` the output frame rate (default 1, to keep encoding time
//! down). The rate only changes how often ffmpeg repeats input frames, not the
//! raw-frame buffering in this process (input is one frame per recorded
//! second); it does change how quickly the encoder's look-ahead fills.

#![cfg(target_os = "linux")]

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use scoreboard_server_lib::layouts::{LayoutDefinition, LayoutService, SavedLayoutSelection};
use scoreboard_server_lib::presets::PresetLibrary;
use scoreboard_server_lib::settings::Settings;
use scoreboard_server_lib::state::{AppPrefs, AppState, Shared};
use scoreboard_server_lib::video::{self, GenerationStep, VideoGenerationConfig};

const MIB: u64 = 1024 * 1024;
const BUDGET: u64 = video::VIDEO_FRAME_BUDGET_BYTES as u64;

fn kib_field(status: &str, field: &str) -> Option<u64> {
    status
        .lines()
        .find(|line| line.starts_with(field))?
        .split_whitespace()
        .nth(1)?
        .parse::<u64>()
        .ok()
        .map(|kib| kib * 1024)
}

fn rss(pid: &str) -> Option<u64> {
    kib_field(
        &std::fs::read_to_string(format!("/proc/{pid}/status")).ok()?,
        "VmRSS:",
    )
}

/// ffmpeg children of this process (there is at most one per job).
fn ffmpeg_children() -> Vec<String> {
    let me = std::process::id().to_string();
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let pid = entry.file_name().into_string().ok()?;
            pid.chars().all(|c| c.is_ascii_digit()).then_some(())?;
            let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
            // `pid (comm) state ppid …` — comm may contain spaces.
            let (head, tail) = stat.rsplit_once(')')?;
            let comm = head.split_once('(')?.1;
            let ppid = tail.split_whitespace().nth(1)?;
            (comm.starts_with("ffmpeg") && ppid == me).then_some(pid)
        })
        .collect()
}

struct Sampler {
    stop: Arc<AtomicBool>,
    handle: std::thread::JoinHandle<(u64, u64)>,
}

impl Sampler {
    fn start() -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);
        let handle = std::thread::spawn(move || {
            let (mut own, mut encoder) = (0u64, 0u64);
            while !flag.load(Ordering::SeqCst) {
                own = own.max(rss("self").unwrap_or(0));
                for pid in ffmpeg_children() {
                    encoder = encoder.max(rss(&pid).unwrap_or(0));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            (own, encoder)
        });
        Self { stop, handle }
    }

    fn finish(self) -> (u64, u64) {
        self.stop.store(true, Ordering::SeqCst);
        self.handle.join().unwrap()
    }
}

fn write_recording(dir: &Path, seconds: usize) -> PathBuf {
    let path = dir.join(format!("memory-{seconds}.sbrec"));
    let mut content = String::from(
        "{\"version\":2,\"recordingId\":\"memory\",\"startedAt\":\"2026-10-30T12:00:00Z\",\"homeName\":\"HOME\",\"awayName\":\"AWAY\"}\n",
    );
    for t in 0..seconds {
        content.push_str(&format!(
            "{{\"t\":{t},\"hs\":{},\"as\":{},\"tm\":{},\"hf\":1,\"hn\":\"HOME\",\"an\":\"AWAY\",\"hc\":\"#00ff00\",\"ac\":\"#ff0000\",\"hp\":\"PERIODO\"}}\n",
            t / 7,
            t / 11,
            seconds - t
        ));
    }
    content.push_str(&format!(
        "{{\"endedAt\":\"2026-10-30T13:00:00Z\",\"totalSnapshots\":{seconds}}}\n"
    ));
    std::fs::write(&path, content).unwrap();
    path
}

fn definition(width: u32, height: u32) -> LayoutDefinition {
    let root = uuid::Uuid::new_v4().to_string();
    serde_json::from_value(serde_json::json!({
        "root": {
            "kind": "root", "id": root, "width": width, "height": height,
            "background": { "kind": "literal", "hex": "#000000", "alpha": 0.0 },
            "children": []
        },
        "editor": { "layers": [{ "nodeId": root, "label": "Root", "locked": false }] }
    }))
    .unwrap()
}

struct Measurement {
    label: &'static str,
    seconds: usize,
    batch_frames: u32,
    batch_bytes: u64,
    process_peak: u64,
    encoder_peak: u64,
    elapsed: Duration,
}

async fn export(
    dir: &Path,
    label: &'static str,
    width: u32,
    height: u32,
    seconds: usize,
    frame_rate: u32,
) -> Measurement {
    let shared: Shared = AppState::with_prefs(
        AppPrefs::default(),
        Settings::default(),
        PresetLibrary::empty(),
        LayoutService::load_from(dir.join(format!("layouts-{label}-{seconds}.json"))),
    );
    let created = shared
        .layouts
        .create(label.into(), definition(width, height))
        .await
        .unwrap();
    let entry = &created.library.entries[0];
    let recording = write_recording(dir, seconds);
    let output = dir.join(format!("{label}-{seconds}.webm"));

    let sampler = Sampler::start();
    let begun = Instant::now();
    let started = video::generate(
        &shared,
        None,
        VideoGenerationConfig {
            recording_path: recording.to_string_lossy().into_owned(),
            output_path: output.to_string_lossy().into_owned(),
            frame_rate,
            scoreboard_scale: 1.0,
            layout: Some(SavedLayoutSelection::Custom {
                id: entry.id.clone(),
                expected_revision: entry.revision,
            }),
        },
    )
    .expect("generation should start");
    assert_eq!((started.width, started.height), (width, height));

    let frame_bytes = width as usize * height as usize * 4;
    let batch_frames = started.batch_frames as usize;
    // One reused buffer, exactly as the webview loop allocates it.
    let mut buffer = vec![0u8; 8 + batch_frames * frame_bytes];
    for (index, pixel) in buffer[8..].as_chunks_mut::<4>().0.iter_mut().enumerate() {
        *pixel = [(index % 251) as u8, 80, 200, 128];
    }
    let mut start = 0u64;
    while start < started.total_frames {
        let count = (started.total_frames - start).min(batch_frames as u64) as u32;
        let snapshots = video::frames(&shared, start, count).unwrap();
        assert_eq!(snapshots.len(), count as usize);
        buffer[0..4].copy_from_slice(&(start as u32).to_le_bytes());
        buffer[4..8].copy_from_slice(&count.to_le_bytes());
        // Vary one byte per batch so frames are not all identical.
        buffer[8] = (start % 256) as u8;
        video::push_frames(&shared, &buffer[..8 + count as usize * frame_bytes])
            .await
            .unwrap();
        start += u64::from(count);
    }
    drop(buffer);

    let deadline = Instant::now() + Duration::from_secs(1800);
    while shared.video.lock().unwrap().is_some() {
        assert!(Instant::now() < deadline, "encoding did not finish");
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let (own_peak, encoder_peak) = sampler.finish();
    let progress = video::progress(&shared);
    assert_eq!(progress.step, GenerationStep::Complete, "{progress:?}");
    assert!(output.is_file());
    std::fs::remove_file(&output).ok();
    shared.layouts.shutdown();

    Measurement {
        label,
        seconds,
        batch_frames: started.batch_frames,
        batch_bytes: (batch_frames * frame_bytes) as u64,
        process_peak: own_peak,
        encoder_peak,
        elapsed: begun.elapsed(),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "measures real ffmpeg exports; run on request (see module docs)"]
async fn export_memory_is_bounded_across_recording_lengths() {
    if video::resolve_ffmpeg(None).is_none() {
        eprintln!("skipping export memory measurement: ffmpeg not found on PATH");
        return;
    }
    let lengths: Vec<usize> = std::env::var("SB_MEMORY_SECONDS")
        .unwrap_or_else(|_| "10,60,300".into())
        .split(',')
        .map(|value| value.trim().parse().expect("SB_MEMORY_SECONDS"))
        .collect();
    let frame_rate: u32 = std::env::var("SB_MEMORY_FPS")
        .map(|value| value.trim().parse().expect("SB_MEMORY_FPS"))
        .unwrap_or(1);
    assert!(!lengths.is_empty());
    let dir = std::env::temp_dir().join(format!("sb-video-memory-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();

    // Allocator retention makes per-case growth meaningless; compare every
    // case's absolute peak with the resident size before the first export.
    let initial = rss("self").unwrap();
    println!(
        "initial process RSS {:.1} MiB, output {frame_rate} fps",
        initial as f64 / MIB as f64
    );
    let sizes = std::env::var("SB_MEMORY_SIZES").ok();
    let selected = |label: &str| {
        sizes
            .as_deref()
            .is_none_or(|sizes| sizes.split(',').any(|size| size.trim() == label))
    };
    let mut results = Vec::new();
    for (label, width, height) in [
        ("full-hd", 1920, 1080),
        ("4k-landscape", 3840, 2160),
        ("4k-portrait", 2160, 3840),
    ] {
        if !selected(label) {
            continue;
        }
        for &seconds in &lengths {
            let m = export(&dir, label, width, height, seconds, frame_rate).await;
            println!(
                "{:<13} {:>4} s  batch {:>2} frames ({:>5.1} MiB)  process peak +{:>6.1} MiB  ffmpeg peak {:>7.1} MiB  {:>6.1} s",
                m.label,
                m.seconds,
                m.batch_frames,
                m.batch_bytes as f64 / MIB as f64,
                m.process_peak.saturating_sub(initial) as f64 / MIB as f64,
                m.encoder_peak as f64 / MIB as f64,
                m.elapsed.as_secs_f64(),
            );
            results.push(m);
        }
    }
    std::fs::remove_dir_all(&dir).ok();

    for m in &results {
        assert!(m.batch_bytes <= BUDGET);
        // The reused batch buffer plus the backend's single payload copy,
        // with slack for allocator and runtime overhead.
        assert!(
            m.process_peak <= initial + 2 * BUDGET + 48 * MIB,
            "{} {} s peaked {} MiB above the initial RSS",
            m.label,
            m.seconds,
            m.process_peak.saturating_sub(initial) / MIB
        );
    }
    // Peak memory must not scale with recording length. ffmpeg is compared
    // only once its encoder look-ahead (tens of frames) is full.
    for label in ["full-hd", "4k-landscape", "4k-portrait"] {
        let runs: Vec<_> = results.iter().filter(|m| m.label == label).collect();
        if runs.is_empty() {
            continue;
        }
        let lowest = runs.iter().map(|m| m.process_peak).min().unwrap();
        let highest = runs.iter().map(|m| m.process_peak).max().unwrap();
        // One extra retained batch-sized block is allocator arena placement
        // (tokio worker threads), not growth; length-proportional growth would
        // be orders of magnitude larger.
        assert!(
            highest - lowest <= BUDGET + 16 * MIB,
            "{label} process peak varies with length: +{} MiB",
            (highest - lowest) / MIB
        );
        let settled: Vec<u64> = runs
            .iter()
            .filter(|m| m.seconds as u64 * u64::from(frame_rate) >= 60)
            .map(|m| m.encoder_peak)
            .collect();
        if let (Some(&lowest), Some(&highest)) = (settled.iter().min(), settled.iter().max()) {
            assert!(
                highest <= lowest + lowest / 10 + 16 * MIB,
                "{label} ffmpeg peak varies with length: {} → {} MiB",
                lowest / MIB,
                highest / MIB
            );
        }
    }
}
