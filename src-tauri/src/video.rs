//! Video generation (tauri-rebuild doc 06 Part B, Phase 9).
//!
//! Pipeline: the video-generator webview re-draws each recording snapshot on
//! a Canvas2D (the scoreboard is a skewed DOM composition with no rasterize
//! API, doc 06 §B1.1) and pushes raw RGBA frames to Rust; Rust pipes them
//! into an ffmpeg sidecar encoding WebM/VP9 with alpha (`yuva420p` +
//! `-auto-alt-ref 0` — dropping either silently kills transparency).
//!
//! **ffmpeg distribution** (doc 08 open question 4, resolved): a bundled
//! sidecar is tried first (`binaries/ffmpeg-<target-triple>[.exe]` under the
//! resource dir, fetched at release time by `scripts/fetch-ffmpeg.mjs` and
//! wired through `bundle.externalBin`), falling back to `ffmpeg` on `PATH`.
//! The binary is never committed to git. ffmpeg is spawned with
//! `std::process::Command` — doc 06 §B3's sanctioned simpler option: the
//! shell plugin's only value here would be path resolution, which we do
//! ourselves, and high-volume binary stdin is plain `write_all`.
//!
//! **Frame transport**: the webview passes one `Uint8Array` per batch as the
//! *sole* invoke argument, which Tauri v2 sends as a raw
//! `application/octet-stream` body (a typed array nested inside a JSON args
//! object is expanded into a JSON number array — several times larger and
//! slower). Buffer layout: `[u32 LE start][u32 LE frame_count][frames…]`,
//! each frame `width × height × 4` bytes. `push_frames` awaits the write
//! into ffmpeg's stdin, so the webview throttles itself (backpressure,
//! doc 06 §B4): one batch in flight, no frame accumulation — memory stays
//! flat regardless of recording length.
//!
//! stdin closes after the last frame; ffmpeg then drains and exits. A
//! watcher task reads `-progress pipe:1` from stdout (which must be drained
//! continuously — a full, unread pipe would deadlock the encoder), keeps a
//! bounded stderr tail for diagnostics, reaps the child via `try_wait`
//! polling (never a blocking `wait` while holding the child mutex, so
//! `cancel` can always `kill`), and emits the terminal progress event.
//!
//! Cancellation (doc 06 §B6): an `AtomicBool` checked before every batch;
//! `cancel` also kills the child. The watcher deletes the partial output
//! and emits `{ step: "error", error: "Generation cancelled" }`.

use std::io::{BufRead, BufReader, Write};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use ts_rs::TS;

use crate::recording::{self, ParsedRecording, Snapshot};
use crate::state::{AppState, Shared};

/// Base frame geometry. The scoreboard *board* is 600×80, but its −15° skew
/// widens the bounding box by 80·tan(15°) ≈ 21.4 px, and the OBS page
/// therefore renders it as 600×80 centered in a 622×80 frame with 11 px of
/// horizontal padding (see `pages/scoreboard.html`). Video frames use the
/// same 622×80 so the skewed corners are not clipped and the video matches
/// the OBS source pixel-for-pixel. (Doc 06 §B2's `round(600 × scale)` reads
/// the board width as the frame width; the extra 22 px is the skew margin.)
pub const FRAME_BASE_WIDTH: u32 = 622;
pub const FRAME_BASE_HEIGHT: u32 = 80;

/// `video:progress` is throttled to ~10 Hz (doc 06 §B5); step transitions
/// always emit immediately.
const PROGRESS_THROTTLE: Duration = Duration::from_millis(100);

/// How many snapshot lines the metadata preview returns (doc 06 §B7).
const METADATA_PREVIEW_SNAPSHOTS: usize = 3;

/// Bounded stderr tail kept for ffmpeg error messages.
const STDERR_TAIL_BYTES: usize = 8 * 1024;

/// Child reap poll interval after stdout closes / while waiting for exit.
const REAP_POLL: Duration = Duration::from_millis(100);

/// Target triple of this build, used to find the bundled sidecar
/// (`ffmpeg-<triple>[.exe]`). Emitted by build.rs.
const TARGET_TRIPLE: &str = env!("TARGET_TRIPLE");

#[cfg(windows)]
const EXE_SUFFIX: &str = ".exe";
#[cfg(not(windows))]
const EXE_SUFFIX: &str = "";

/// Build an ffmpeg `Command`. On Windows, `CREATE_NO_WINDOW` stops the
/// console-subsystem child from flashing a cmd window when spawned from the
/// GUI app (the installer build is `#![windows_subsystem = "windows"]`).
fn ffmpeg_command(program: &Path) -> Command {
    // `mut` is only needed by the Windows `creation_flags` call below.
    #[allow(unused_mut)]
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    command
}

/// Generation configuration (doc 06 §B2).
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct VideoGenerationConfig {
    pub recording_path: String,
    /// Must end in `.webm` (doc 06 §B2).
    pub output_path: String,
    /// 1..=60, default 30.
    pub frame_rate: u32,
    /// 0.5..=3.0, default 1.0.
    pub scoreboard_scale: f32,
}

/// Pipeline step (doc 06 §B5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export_to = "../../src/bindings/")]
pub enum GenerationStep {
    Idle,
    Parsing,
    Rendering,
    Encoding,
    Cleanup,
    Complete,
    Error,
}

/// Progress model (doc 06 §B5) emitted as `video:progress`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct GenerationProgress {
    pub step: GenerationStep,
    /// 0..100 within the current step.
    pub step_progress: u8,
    /// 0..100 overall (bands: parsing 0–5, rendering 10–60, encoding 60–95,
    /// cleanup 95, complete 100 [PARITY]).
    pub overall_progress: u8,
    #[ts(type = "number | null")]
    pub current_frame: Option<u64>,
    #[ts(type = "number | null")]
    pub total_frames: Option<u64>,
    pub message: String,
    pub error: Option<String>,
}

impl GenerationProgress {
    pub fn idle() -> Self {
        Self {
            step: GenerationStep::Idle,
            step_progress: 0,
            overall_progress: 0,
            current_frame: None,
            total_frames: None,
            message: "Idle".into(),
            error: None,
        }
    }

    fn new(step: GenerationStep, step_progress: u8, overall_progress: u8, message: String) -> Self {
        Self {
            step,
            step_progress,
            overall_progress,
            current_frame: None,
            total_frames: None,
            message,
            error: None,
        }
    }

    fn failed(error: String) -> Self {
        Self {
            step: GenerationStep::Error,
            step_progress: 0,
            overall_progress: 0,
            current_frame: None,
            total_frames: None,
            message: error.clone(),
            error: Some(error),
        }
    }
}

/// Returned by `video_generate`: frame count and output dimensions the
/// webview needs to size its canvas and drive the render loop.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct GenerationStarted {
    #[ts(type = "number")]
    pub total_frames: u64,
    pub width: u32,
    pub height: u32,
}

/// Parsed recording header + first snapshots, for the generator window's
/// Recording File card (doc 06 §B7).
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct RecordingMetadata {
    pub recording_id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub home_name: String,
    pub away_name: String,
    #[ts(type = "number")]
    pub snapshot_count: u64,
    #[ts(type = "number")]
    pub duration_secs: u64,
    pub first_snapshots: Vec<Snapshot>,
}

/// An active generation run. Lives in `AppState.video` behind a std mutex
/// that is never held across an `.await` (same discipline as `recording`).
pub struct VideoSession {
    cancel: Arc<AtomicBool>,
    /// Set when the last frame has been written and stdin is closed; the
    /// watcher then maps ffmpeg's `out_time` onto the encoding band.
    stdin_closed: Arc<AtomicBool>,
    snapshots: Vec<Snapshot>,
    pushed: u64,
    width: u32,
    height: u32,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Child>>,
    last_emit: Instant,
}

fn lock_video(state: &AppState) -> MutexGuard<'_, Option<VideoSession>> {
    state.video.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Output dimensions: `round(base × scale)`, each rounded to the nearest
/// even number (VP9 wants even dimensions, doc 06 §B2).
pub fn frame_dimensions(scale: f32) -> (u32, u32) {
    (
        even_rounded(FRAME_BASE_WIDTH as f32 * scale),
        even_rounded(FRAME_BASE_HEIGHT as f32 * scale),
    )
}

fn even_rounded(value: f32) -> u32 {
    let rounded = value.round().max(2.0) as u32;
    if rounded.is_multiple_of(2) {
        rounded
    } else {
        rounded + 1
    }
}

/// Validate the config and parse the recording (doc 06 §B2/B7). The whole
/// parse fits in memory — ~650 KB of lines for a 90-minute match, a few MB
/// parsed; flat memory is about not accumulating *frames*.
fn validate(config: &VideoGenerationConfig) -> Result<(ParsedRecording, u32, u32), String> {
    if !(1..=60).contains(&config.frame_rate) {
        return Err(format!(
            "frame rate must be 1..=60, got {}",
            config.frame_rate
        ));
    }
    if !(0.5..=3.0).contains(&config.scoreboard_scale) {
        return Err(format!(
            "scoreboard scale must be 0.5..=3.0, got {}",
            config.scoreboard_scale
        ));
    }
    let output = config.output_path.trim();
    if !output.to_lowercase().ends_with(".webm") {
        return Err("output path must end in .webm".to_string());
    }
    let parsed = recording::read_recording(Path::new(&config.recording_path))?;
    if parsed.snapshots.is_empty() {
        return Err("recording has no snapshots".to_string());
    }
    let (width, height) = frame_dimensions(config.scoreboard_scale);
    Ok((parsed, width, height))
}

/// ffmpeg CLI (doc 06 §B3): raw RGBA in at 1 fps (one frame per recording
/// second), duplicated to `frame_rate` on output, VP9 with alpha,
/// machine-readable progress on stdout.
fn ffmpeg_args(width: u32, height: u32, frame_rate: u32, output: &Path) -> Vec<String> {
    vec![
        "-y".into(),
        "-f".into(),
        "rawvideo".into(),
        "-pix_fmt".into(),
        "rgba".into(),
        "-s".into(),
        format!("{width}x{height}"),
        "-r".into(),
        "1".into(),
        "-i".into(),
        "pipe:0".into(),
        "-r".into(),
        frame_rate.to_string(),
        "-c:v".into(),
        "libvpx-vp9".into(),
        "-pix_fmt".into(),
        "yuva420p".into(),
        // Mandatory for VP9 alpha; dropped, transparency silently dies.
        "-auto-alt-ref".into(),
        "0".into(),
        "-b:v".into(),
        "2M".into(),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        output.to_string_lossy().into_owned(),
    ]
}

/// Resolve the ffmpeg executable: bundled sidecar first, then `PATH`
/// (doc 08 open question 4 resolution). `app` is `None` in tests, where
/// only the `PATH` fallback applies.
pub fn resolve_ffmpeg(app: Option<&AppHandle>) -> Option<PathBuf> {
    if let Some(app) = app {
        if let Ok(dir) = app.path().resource_dir() {
            for name in [
                format!("binaries/ffmpeg-{TARGET_TRIPLE}{EXE_SUFFIX}"),
                format!("binaries/ffmpeg{EXE_SUFFIX}"),
            ] {
                let candidate = dir.join(&name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    probe_ffmpeg(Path::new(&format!("ffmpeg{EXE_SUFFIX}")))
}

/// Run `ffmpeg -version`; success means the executable works.
fn probe_ffmpeg(path: &Path) -> Option<PathBuf> {
    ffmpeg_command(path)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .ok()
        .filter(|status| status.success())
        .map(|_| path.to_path_buf())
}

/// Read a recording and build the metadata preview (doc 06 §B7).
pub fn load_metadata(path: &Path) -> Result<RecordingMetadata, String> {
    let parsed = recording::read_recording(path)?;
    Ok(RecordingMetadata {
        recording_id: parsed.recording_id,
        started_at: parsed.started_at,
        ended_at: parsed.ended_at,
        home_name: parsed.home_name,
        away_name: parsed.away_name,
        snapshot_count: parsed.snapshots.len() as u64,
        // One snapshot per second (doc 06 §A2); the first lands one second
        // after start with t = 0, so the count is the duration.
        duration_secs: parsed.snapshots.len() as u64,
        first_snapshots: parsed
            .snapshots
            .iter()
            .take(METADATA_PREVIEW_SNAPSHOTS)
            .cloned()
            .collect(),
    })
}

/// Start a generation run (doc 06 §B1–B4): validate, parse, resolve ffmpeg,
/// spawn the encoder and its watcher, stash the session. The webview then
/// pulls snapshots with [`frames`] and pushes rendered batches with
/// [`push_frames`].
pub fn generate(
    shared: &Shared,
    app: Option<&AppHandle>,
    config: VideoGenerationConfig,
) -> Result<GenerationStarted, String> {
    {
        if lock_video(shared).is_some() {
            return Err("Generation already in progress".into());
        }
    }

    shared.emit_video_progress(GenerationProgress::new(
        GenerationStep::Parsing,
        0,
        0,
        "Parsing recording…".into(),
    ));
    let (parsed, width, height) = match validate(&config) {
        Ok(ok) => ok,
        Err(error) => {
            shared.emit_video_progress(GenerationProgress::failed(error.clone()));
            return Err(error);
        }
    };
    let total_frames = parsed.snapshots.len() as u64;
    shared.emit_video_progress(GenerationProgress {
        current_frame: Some(0),
        total_frames: Some(total_frames),
        ..GenerationProgress::new(GenerationStep::Parsing, 100, 5, "Recording parsed".into())
    });

    let ffmpeg = resolve_ffmpeg(app).ok_or_else(|| {
        let error = "ffmpeg not found — it is bundled with the installer; for development, \
                     install ffmpeg and make sure it is on PATH"
            .to_string();
        shared.emit_video_progress(GenerationProgress::failed(error.clone()));
        error
    })?;

    let output_path = PathBuf::from(config.output_path.trim());
    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
    }

    let args = ffmpeg_args(width, height, config.frame_rate, &output_path);
    let mut child = ffmpeg_command(&ffmpeg)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            let message = format!("failed to start {}: {error}", ffmpeg.display());
            shared.emit_video_progress(GenerationProgress::failed(message.clone()));
            message
        })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to open ffmpeg stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to open ffmpeg stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to open ffmpeg stderr".to_string())?;

    let session = VideoSession {
        cancel: Arc::new(AtomicBool::new(false)),
        stdin_closed: Arc::new(AtomicBool::new(false)),
        snapshots: parsed.snapshots,
        pushed: 0,
        width,
        height,
        stdin: Arc::new(Mutex::new(Some(stdin))),
        child: Arc::new(Mutex::new(child)),
        last_emit: Instant::now(),
    };
    let cancel = Arc::clone(&session.cancel);
    let stdin_closed = Arc::clone(&session.stdin_closed);
    let child = Arc::clone(&session.child);
    let stdin = Arc::clone(&session.stdin);
    *lock_video(shared) = Some(session);

    spawn_watcher(
        shared,
        WatcherParams {
            child,
            stdin,
            stdout,
            stderr,
            output_path,
            total_frames,
            cancel,
            stdin_closed,
        },
    );

    shared.emit_video_progress(GenerationProgress {
        current_frame: Some(0),
        total_frames: Some(total_frames),
        ..GenerationProgress::new(GenerationStep::Rendering, 0, 10, "Rendering frames…".into())
    });
    Ok(GenerationStarted {
        total_frames,
        width,
        height,
    })
}

/// Snapshots `[start, start + count)` for the webview's next batch.
pub fn frames(shared: &Shared, start: u64, count: u32) -> Result<Vec<Snapshot>, String> {
    let guard = lock_video(shared);
    let session = guard.as_ref().ok_or("No active generation")?;
    Ok(session
        .snapshots
        .iter()
        .skip(start as usize)
        .take(count as usize)
        .cloned()
        .collect())
}

/// Write one rendered batch into ffmpeg's stdin. `bytes` is
/// `[u32 LE start][u32 LE frame_count][frame_count × width × height × 4]`.
/// Batches must arrive in order (the webview awaits each push, so this is
/// the natural flow); the awaited pipe write is the backpressure.
pub async fn push_frames(shared: &Shared, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 8 {
        return Err("malformed frame batch".into());
    }
    let start = u32::from_le_bytes(bytes[0..4].try_into().unwrap()) as u64;
    let frame_count = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as u64;

    let (stdin, cancel, stdin_closed, expected) = {
        let guard = lock_video(shared);
        let session = guard.as_ref().ok_or("No active generation")?;
        if session.cancel.load(Ordering::SeqCst) {
            return Err("Generation cancelled".into());
        }
        if start != session.pushed {
            return Err(format!(
                "out-of-order batch: expected frame {}, got {start}",
                session.pushed
            ));
        }
        let frame_bytes = session.width as usize * session.height as usize * 4;
        let total = session.snapshots.len() as u64;
        if frame_count == 0 || start + frame_count > total {
            return Err(format!(
                "batch of {frame_count} frames at {start} exceeds {total} total frames"
            ));
        }
        if bytes.len() - 8 != frame_count as usize * frame_bytes {
            return Err(format!(
                "frame batch size mismatch: expected {} bytes, got {}",
                frame_count as usize * frame_bytes,
                bytes.len() - 8
            ));
        }
        (
            Arc::clone(&session.stdin),
            Arc::clone(&session.cancel),
            Arc::clone(&session.stdin_closed),
            session.pushed + frame_count,
        )
    };

    // The std guard is never held across this await; the write itself runs
    // on a blocking thread because a full pipe would stall a tokio worker.
    let payload = bytes[8..].to_vec();
    let cancelled = Arc::clone(&cancel);
    let write = tokio::task::spawn_blocking(move || {
        let mut guard = stdin.lock().unwrap_or_else(PoisonError::into_inner);
        match guard.as_mut() {
            Some(stdin) => stdin
                .write_all(&payload)
                .map_err(|error| format!("failed to write frames to ffmpeg: {error}")),
            None => Err("encoder stdin is closed".into()),
        }
    })
    .await
    .map_err(|error| format!("frame writer task failed: {error}"))?;
    if let Err(error) = write {
        // A dead encoder (cancel/kill/crash) surfaces as a broken pipe; the
        // watcher emits the terminal progress event with the real reason.
        if cancelled.load(Ordering::SeqCst) {
            return Err("Generation cancelled".into());
        }
        return Err(error);
    }

    let mut finished = None;
    {
        let mut guard = lock_video(shared);
        let Some(session) = guard.as_mut() else {
            return Err("No active generation".into());
        };
        session.pushed = expected;
        let total = session.snapshots.len() as u64;
        let fraction = session.pushed as f32 / total as f32;
        let progress = GenerationProgress {
            current_frame: Some(session.pushed),
            total_frames: Some(total),
            ..GenerationProgress::new(
                GenerationStep::Rendering,
                (fraction * 100.0) as u8,
                10 + (fraction * 50.0) as u8,
                "Rendering frames…".into(),
            )
        };
        if session.pushed == total {
            // Closing stdin ends the encode (doc 06 §B3); the watcher maps
            // ffmpeg's drain onto the encoding band from here.
            session.stdin_closed.store(true, Ordering::SeqCst);
            stdin_closed.store(true, Ordering::SeqCst);
            drop(
                session
                    .stdin
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .take(),
            );
            finished = Some(progress);
        } else if session.last_emit.elapsed() >= PROGRESS_THROTTLE {
            session.last_emit = Instant::now();
            shared.emit_video_progress(progress);
        }
    }
    if let Some(progress) = finished {
        shared.emit_video_progress(progress);
        shared.emit_video_progress(GenerationProgress::new(
            GenerationStep::Encoding,
            0,
            60,
            "Encoding video…".into(),
        ));
    }
    Ok(())
}

/// Cancel the active run (doc 06 §B6): stop accepting frames, kill ffmpeg;
/// the watcher deletes the partial file and emits the terminal event.
pub fn cancel(shared: &Shared) -> Result<(), String> {
    let (cancel, child) = {
        let guard = lock_video(shared);
        let session = guard.as_ref().ok_or("No active generation")?;
        (Arc::clone(&session.cancel), Arc::clone(&session.child))
    };
    cancel.store(true, Ordering::SeqCst);
    let mut guard = child.lock().unwrap_or_else(PoisonError::into_inner);
    // Already-exited child: kill is a no-op error; ignore it.
    let _ = guard.kill();
    Ok(())
}

/// The last emitted progress — seeds a freshly opened generator window.
pub fn progress(shared: &Shared) -> GenerationProgress {
    shared
        .video_progress
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone()
}

/// Everything the watcher owns between spawn and terminal state.
struct WatcherParams {
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    stdout: ChildStdout,
    stderr: std::process::ChildStderr,
    output_path: PathBuf,
    total_frames: u64,
    cancel: Arc<AtomicBool>,
    stdin_closed: Arc<AtomicBool>,
}

/// Drain `-progress pipe:1` from stdout, reap the child, emit the terminal
/// progress event and clear the session (doc 06 §B5/B6).
fn spawn_watcher(shared: &Shared, params: WatcherParams) {
    let WatcherParams {
        child,
        stdin,
        stdout,
        stderr,
        output_path,
        total_frames,
        cancel,
        stdin_closed,
    } = params;
    let shared = Arc::clone(shared);

    // Bounded stderr tail for diagnostics; drained continuously so a
    // chatty ffmpeg can never deadlock on a full pipe.
    let stderr_tail = Arc::new(Mutex::new(String::new()));
    {
        let stderr_tail = Arc::clone(&stderr_tail);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stderr);
            let mut buf = Vec::new();
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        let mut tail = stderr_tail.lock().unwrap_or_else(PoisonError::into_inner);
                        tail.push_str(&String::from_utf8_lossy(&buf));
                        let overflow = tail.len().saturating_sub(STDERR_TAIL_BYTES);
                        if overflow > 0 {
                            tail.drain(..overflow);
                        }
                    }
                }
            }
        });
    }

    tokio::task::spawn_blocking(move || {
        let mut out_time_us = 0u64;
        let mut last_emit = Instant::now();
        {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break, // EOF: ffmpeg closed stdout on exit
                    Ok(_) => {
                        if let Some(value) = line.trim().strip_prefix("out_time_us=") {
                            out_time_us = value.parse().unwrap_or(out_time_us);
                        } else if let Some(value) = line.trim().strip_prefix("out_time_ms=") {
                            // ffmpeg's `out_time_ms` is microseconds too.
                            out_time_us = value.parse().unwrap_or(out_time_us);
                        }
                        // Encoding band only after stdin closed: while
                        // streaming, rendering and encoding overlap and the
                        // push path reports the combined phase as
                        // `rendering` (doc 06 §B5).
                        if stdin_closed.load(Ordering::SeqCst)
                            && !cancel.load(Ordering::SeqCst)
                            && last_emit.elapsed() >= PROGRESS_THROTTLE
                        {
                            last_emit = Instant::now();
                            let fraction =
                                (out_time_us as f32 / 1_000_000.0 / total_frames as f32).min(1.0);
                            shared.emit_video_progress(GenerationProgress {
                                current_frame: Some(total_frames),
                                total_frames: Some(total_frames),
                                ..GenerationProgress::new(
                                    GenerationStep::Encoding,
                                    (fraction * 100.0) as u8,
                                    60 + (fraction * 35.0) as u8,
                                    "Encoding video…".into(),
                                )
                            });
                        }
                    }
                    Err(_) => break,
                }
            }
        }

        // Reap. Never `wait()` while holding the mutex — `cancel` must be
        // able to `kill()` concurrently.
        let status = loop {
            let done = {
                let mut guard = child.lock().unwrap_or_else(PoisonError::into_inner);
                match guard.try_wait() {
                    Ok(Some(status)) => Some(status),
                    Ok(None) => None,
                    Err(_) => None,
                }
            };
            match done {
                Some(status) => break Some(status),
                None => std::thread::sleep(REAP_POLL),
            }
        };

        // Make sure a killed/lingering encoder releases the pipe for good.
        drop(stdin.lock().unwrap_or_else(PoisonError::into_inner).take());

        let cancelled = cancel.load(Ordering::SeqCst);
        let final_progress = if cancelled {
            let _ = std::fs::remove_file(&output_path);
            GenerationProgress::failed("Generation cancelled".into())
        } else {
            match status {
                Some(status) if status.success() => {
                    shared.emit_video_progress(GenerationProgress::new(
                        GenerationStep::Cleanup,
                        100,
                        95,
                        "Finalizing…".into(),
                    ));
                    GenerationProgress {
                        current_frame: Some(total_frames),
                        total_frames: Some(total_frames),
                        ..GenerationProgress::new(
                            GenerationStep::Complete,
                            100,
                            100,
                            format!("Video saved to {}", output_path.display()),
                        )
                    }
                }
                Some(status) => {
                    let _ = std::fs::remove_file(&output_path);
                    let tail = stderr_tail
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner)
                        .trim()
                        .lines()
                        .last()
                        .unwrap_or("")
                        .to_string();
                    GenerationProgress::failed(format!("ffmpeg exited with {status}: {tail}"))
                }
                None => {
                    let _ = std::fs::remove_file(&output_path);
                    GenerationProgress::failed("ffmpeg status unknown (reap failed)".into())
                }
            }
        };
        shared.emit_video_progress(final_progress);
        *lock_video(&shared) = None;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(recording: &str, output: &str) -> VideoGenerationConfig {
        VideoGenerationConfig {
            recording_path: recording.into(),
            output_path: output.into(),
            frame_rate: 30,
            scoreboard_scale: 1.0,
        }
    }

    fn write_sbrec(dir: &Path, snapshots: usize) -> PathBuf {
        let path = dir.join("HOME-AWAY-2026-08-28T12-00-00.sbrec");
        let mut content = String::from(
            "{\"version\":2,\"recordingId\":\"id-1\",\"startedAt\":\"2026-08-28T12:00:00Z\",\"homeName\":\"HOME\",\"awayName\":\"AWAY\"}\n",
        );
        for t in 0..snapshots {
            content.push_str(&format!(
                "{{\"t\":{t},\"hs\":1,\"as\":2,\"tm\":900,\"hf\":1,\"hn\":\"HOME\",\"an\":\"AWAY\",\"hc\":\"#00ff00\",\"ac\":\"#ff0000\",\"hp\":\"PERIODO\"}}\n"
            ));
        }
        content.push_str("{\"endedAt\":\"2026-08-28T12:05:00Z\",\"totalSnapshots\":300}\n");
        std::fs::write(&path, content).unwrap();
        path
    }

    #[test]
    fn frame_dimensions_round_to_even() {
        assert_eq!(frame_dimensions(1.0), (622, 80));
        assert_eq!(frame_dimensions(0.5), (312, 40));
        assert_eq!(frame_dimensions(1.5), (934, 120));
        assert_eq!(frame_dimensions(2.0), (1244, 160));
        assert_eq!(frame_dimensions(3.0), (1866, 240));
    }

    #[test]
    fn validate_rejects_bad_config() {
        let dir = std::env::temp_dir().join(format!("sb-video-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let recording = write_sbrec(&dir, 3);
        let recording = recording.to_string_lossy().into_owned();
        let output = dir.join("out.webm").to_string_lossy().into_owned();

        let mut cfg = config(&recording, &output);
        cfg.output_path = "out.mp4".into();
        assert!(validate(&cfg).unwrap_err().contains(".webm"));

        let mut cfg = config(&recording, &output);
        cfg.frame_rate = 0;
        assert!(validate(&cfg).is_err());
        let mut cfg = config(&recording, &output);
        cfg.frame_rate = 61;
        assert!(validate(&cfg).is_err());

        let mut cfg = config(&recording, &output);
        cfg.scoreboard_scale = 0.4;
        assert!(validate(&cfg).is_err());
        let mut cfg = config(&recording, &output);
        cfg.scoreboard_scale = 3.1;
        assert!(validate(&cfg).is_err());

        cfg = config(&recording, &output);
        let (parsed, w, h) = validate(&cfg).unwrap();
        assert_eq!(parsed.snapshots.len(), 3);
        assert_eq!((w, h), (622, 80));

        let empty = write_sbrec(&dir, 0);
        let cfg = config(&empty.to_string_lossy(), &output);
        assert!(validate(&cfg).unwrap_err().contains("no snapshots"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ffmpeg_args_match_doc_b3() {
        let args = ffmpeg_args(622, 80, 30, Path::new("/tmp/out.webm"));
        let joined = args.join(" ");
        assert!(joined.contains("-f rawvideo -pix_fmt rgba -s 622x80 -r 1 -i pipe:0"));
        assert!(joined.contains("-r 30"));
        assert!(joined.contains("-c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 2M"));
        assert!(joined.contains("-progress pipe:1 -nostats"));
        assert!(joined.ends_with("/tmp/out.webm"));
    }

    #[test]
    fn ffmpeg_command_spawns_without_console_window() {
        // `ffmpeg -version` must succeed through the shared command builder,
        // which on Windows applies CREATE_NO_WINDOW so the installed GUI app
        // doesn't flash a cmd window (regression: the bundled build opened a
        // console on every generation).
        let Some(ffmpeg) = resolve_ffmpeg(None) else {
            eprintln!("skipping: ffmpeg not found on PATH");
            return;
        };
        let status = ffmpeg_command(&ffmpeg)
            .arg("-version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("failed to spawn ffmpeg");
        assert!(status.success());
    }

    #[test]
    fn load_metadata_summarizes_recording() {
        let dir = std::env::temp_dir().join(format!("sb-video-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = write_sbrec(&dir, 5);
        let meta = load_metadata(&path).unwrap();
        assert_eq!(meta.recording_id, "id-1");
        assert_eq!(meta.home_name, "HOME");
        assert_eq!(meta.away_name, "AWAY");
        assert_eq!(meta.snapshot_count, 5);
        assert_eq!(meta.duration_secs, 5);
        assert_eq!(meta.ended_at.as_deref(), Some("2026-08-28T12:05:00Z"));
        assert_eq!(meta.first_snapshots.len(), 3);
        assert_eq!(meta.first_snapshots[0].t, 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn push_frames_validates_batches() {
        let shared = crate::state::AppState::new();
        // No session → error.
        assert_eq!(
            push_frames(&shared, &[0u8; 12]).await.unwrap_err(),
            "No active generation"
        );
        assert!(frames(&shared, 0, 30).is_err());
        assert!(cancel(&shared).is_err());
    }
}
