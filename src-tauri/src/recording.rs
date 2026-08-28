//! Match recording (tauri-rebuild doc 06 Part A).
//!
//! While recording, the full match state is appended to a `.sbrec` file once
//! per second: a JSON header line, then one JSON snapshot per line, flushed
//! every second. Append-only, crash-safe (at most the last second is lost),
//! constant memory (doc 06 §A2 — the Electron app rewrote the whole file
//! every 5 s, O(n²) I/O over a match). A trailer line is written on stop; a
//! missing trailer means the recording was interrupted, which the reader
//! tolerates.
//!
//! [`read_recording`] is the v1 importer: it also parses the Electron app's
//! pretty-printed `.json` recordings (`"version": "1.0"`) so existing files
//! still work (doc 06 §A2). Its consumer is the video generator (Phase 9).

use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, MutexGuard, PoisonError};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::task::JoinHandle;
use tokio::time::{Duration, MissedTickBehavior};
use ts_rs::TS;

use crate::state::{AppState, ScoreboardState, Shared};

/// Snapshot cadence (doc 06 §A1: once per second).
const TICK: Duration = Duration::from_secs(1);

/// Cap on the recent-recordings list shown in the recording window.
const MAX_RECENT: usize = 10;

/// Live recording status (doc 06 §A4). Emitted as `recording:status` on
/// start, stop and every snapshot.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub recording_id: Option<String>,
    pub file_path: Option<String>,
    #[ts(type = "number")]
    pub snapshot_count: u64,
    #[ts(type = "number")]
    pub duration_secs: u64,
}

/// Result of `recording_stop` (doc 06 §A4).
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct RecordingStopped {
    pub file_path: String,
    #[ts(type = "number")]
    pub total_snapshots: u64,
}

/// One entry of the recent-recordings list in the recording window
/// (doc 06 §A6).
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct RecentRecording {
    pub file_name: String,
    pub file_path: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
    #[ts(type = "number")]
    pub modified_unix_secs: u64,
}

/// One per-second capture of the match state (doc 06 §A2.1). Field names are
/// deliberately short — the line repeats ~5 400 times in a 90-minute match.
/// Names/colours/prefix repeat on every line so each line is independently
/// renderable. TS-exported for the video generator's render loop (Phase 9).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "../../src/bindings/")]
pub struct Snapshot {
    /// Relative seconds since start, starting at 0.
    #[ts(type = "number")]
    pub t: u64,
    /// Home score.
    pub hs: u32,
    /// Away score (`as` is a Rust keyword).
    #[serde(rename = "as")]
    pub aw: u32,
    /// Timer seconds remaining.
    pub tm: u32,
    /// Half.
    pub hf: u32,
    /// Home / away names.
    pub hn: String,
    pub an: String,
    /// Home / away colours.
    pub hc: String,
    pub ac: String,
    /// Half prefix.
    pub hp: String,
}

impl Snapshot {
    fn from_state(state: &ScoreboardState, t: u64) -> Self {
        Self {
            t,
            hs: state.team_home_score,
            aw: state.team_away_score,
            tm: state.timer,
            hf: state.half,
            hn: state.team_home_name.clone(),
            an: state.team_away_name.clone(),
            hc: state.team_home_color.clone(),
            ac: state.team_away_color.clone(),
            hp: state.half_prefix.clone(),
        }
    }
}

/// A recording in flight. Lives in `AppState.recording` behind a std mutex
/// that is never held across an `.await` (same discipline as
/// `control_token`): the tick task reads the scoreboard first, then locks
/// only for the synchronous line write.
pub struct RecordingSession {
    recording_id: String,
    file_path: PathBuf,
    /// tokio's monotonic `Instant` (not std) so paused-time tests measure
    /// elapsed seconds too.
    started: tokio::time::Instant,
    snapshot_count: u64,
    writer: BufWriter<File>,
    task: JoinHandle<()>,
}

impl RecordingSession {
    pub(crate) fn duration_secs(&self) -> u64 {
        self.started.elapsed().as_secs()
    }

    fn status(&self) -> RecordingStatus {
        RecordingStatus {
            is_recording: true,
            recording_id: Some(self.recording_id.clone()),
            file_path: Some(self.file_path.to_string_lossy().into_owned()),
            snapshot_count: self.snapshot_count,
            duration_secs: self.duration_secs(),
        }
    }
}

fn idle_status() -> RecordingStatus {
    RecordingStatus {
        is_recording: false,
        recording_id: None,
        file_path: None,
        snapshot_count: 0,
        duration_secs: 0,
    }
}

fn lock_recording(state: &AppState) -> MutexGuard<'_, Option<RecordingSession>> {
    state
        .recording
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

/// `settings.recording_output_dir`, falling back to
/// `document_dir()/ScoreboardRecordings` (doc 06 §A3 [PARITY]).
pub async fn configured_output_dir(app: &AppHandle, state: &AppState) -> PathBuf {
    let configured = state.settings.read().await.recording_output_dir.clone();
    configured
        .filter(|dir| !dir.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_output_dir(app))
}

/// Documents folder, with home/temp fallbacks for headless Linux sessions
/// where `document_dir()` fails.
pub fn default_output_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("ScoreboardRecordings")
}

/// Start recording (doc 06 §A5). Errors with `"Recording already in
/// progress"` when one is active [PARITY].
pub async fn start(shared: &Shared, output_dir: PathBuf) -> Result<RecordingStatus, String> {
    // Read the state BEFORE locking: the recording mutex is never held
    // across an `.await`. The block scopes the guard tightly — the command
    // future must be Send, and std MutexGuard is not.
    let scoreboard = shared.current().await;

    let status = {
        let mut guard = lock_recording(shared);
        if guard.is_some() {
            return Err("Recording already in progress".into());
        }

        std::fs::create_dir_all(&output_dir)
            .map_err(|error| format!("cannot create {}: {error}", output_dir.display()))?;

        let recording_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let started = tokio::time::Instant::now();
        let file_path = unique_path(output_dir.join(build_filename(
            &scoreboard.team_home_name,
            &scoreboard.team_away_name,
            now,
        )));
        let file = File::create(&file_path)
            .map_err(|error| format!("cannot create {}: {error}", file_path.display()))?;
        let mut writer = BufWriter::new(file);
        let header = serde_json::json!({
            "version": 2,
            "recordingId": recording_id,
            "startedAt": iso_utc(now),
            "homeName": scoreboard.team_home_name,
            "awayName": scoreboard.team_away_name,
        });
        write_line(&mut writer, &header)?;

        let session = RecordingSession {
            recording_id,
            file_path,
            started,
            snapshot_count: 0,
            writer,
            task: spawn_tick(shared, started),
        };
        let status = session.status();
        *guard = Some(session);
        status
    };

    shared.publish_server_status().await;
    shared.emit_recording_status(status.clone());
    Ok(status)
}

/// Stop recording. Errors with `"No active recording"` when idle — the
/// caller can tell apart a real failure from a double-stop [PARITY].
pub async fn stop(shared: &Shared) -> Result<RecordingStopped, String> {
    stop_internal(shared)
        .await
        .ok_or_else(|| "No active recording".to_string())
}

/// Shared by [`stop`] and the tick task's write-failure path: take the
/// session out, write the trailer, publish the idle status.
async fn stop_internal(shared: &Shared) -> Option<RecordingStopped> {
    // Scoped block: the std guard must not leak into the awaits below.
    let session = {
        let mut guard = lock_recording(shared);
        guard.take()
    };
    let mut session = session?;
    // The tick task may be mid-write; aborting is cancel-safe because the
    // write section between lock and unlock is synchronous.
    session.task.abort();
    let stopped = match finalize(&mut session) {
        Ok(stopped) => stopped,
        Err(error) => {
            tracing::warn!(?error, "failed to finalize recording");
            RecordingStopped {
                file_path: session.file_path.to_string_lossy().into_owned(),
                total_snapshots: session.snapshot_count,
            }
        }
    };
    drop(session);
    shared.publish_server_status().await;
    shared.emit_recording_status(idle_status());
    Some(stopped)
}

/// Current status for `recording_status` (idle when not recording).
pub fn status(state: &AppState) -> RecordingStatus {
    match lock_recording(state).as_ref() {
        Some(session) => session.status(),
        None => idle_status(),
    }
}

/// `RunEvent::ExitRequested` handler (doc 06 §A5): flush and write the
/// trailer so an in-flight recording survives app exit. Synchronous — the
/// tokio runtime is being torn down, so no async here.
pub fn flush_on_exit(state: &AppState) {
    let session = lock_recording(state).take();
    if let Some(mut session) = session {
        session.task.abort();
        if let Err(error) = finalize(&mut session) {
            tracing::warn!(?error, "failed to finalize recording on exit");
        }
    }
}

/// The newest `.sbrec` (and legacy Electron `.json`) files in the output
/// directory, for the recording window's recent list (doc 06 §A6). A
/// missing directory is not an error — it just means "no recordings yet".
pub fn list_recent(dir: &Path) -> Vec<RecentRecording> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut recordings: Vec<RecentRecording> = entries
        .filter_map(Result::ok)
        .filter(|entry| {
            matches!(
                entry.path().extension().and_then(|ext| ext.to_str()),
                Some("sbrec") | Some("json")
            )
        })
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            let modified = metadata.modified().ok()?;
            Some(RecentRecording {
                file_name: entry.file_name().to_string_lossy().into_owned(),
                file_path: entry.path().to_string_lossy().into_owned(),
                size_bytes: metadata.len(),
                modified_unix_secs: modified
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()?
                    .as_secs(),
            })
        })
        .collect();
    recordings.sort_by_key(|entry| std::cmp::Reverse(entry.modified_unix_secs));
    recordings.truncate(MAX_RECENT);
    recordings
}

/// One line per second (doc 06 §A5). The first snapshot is written one
/// second after start with `t = 0` [PARITY] — a plain `interval` fires
/// immediately, so the ticker is anchored at `started + 1 s`. The anchor is
/// captured by the caller at session creation: evaluated here it would be
/// the task's first poll, which may lag the actual start.
fn spawn_tick(shared: &Shared, started: tokio::time::Instant) -> JoinHandle<()> {
    let shared = Arc::clone(shared);
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval_at(started + TICK, TICK);
        // Missed ticks are real elapsed seconds in the recording timeline:
        // backfill them so the line count always equals the duration in
        // seconds (doc 08 P8 acceptance). `Delay` would silently drop them.
        ticker.set_missed_tick_behavior(MissedTickBehavior::Burst);
        loop {
            ticker.tick().await;
            let scoreboard = shared.current().await;
            let outcome = {
                let mut guard = lock_recording(&shared);
                match guard.as_mut() {
                    // Stopped between the tick and the lock.
                    None => break,
                    Some(session) => {
                        let t = session.snapshot_count;
                        let result =
                            write_line(&mut session.writer, &Snapshot::from_state(&scoreboard, t));
                        if result.is_ok() {
                            session.snapshot_count += 1;
                        }
                        result.map(|()| session.status())
                    }
                }
            };
            match outcome {
                Ok(status) => {
                    shared.publish_server_status().await;
                    shared.emit_recording_status(status);
                }
                Err(error) => {
                    // Disk full / unplugged drive: stop cleanly rather than
                    // lose the whole match silently.
                    tracing::error!(?error, "recording write failed; stopping");
                    stop_internal(&shared).await;
                    break;
                }
            }
        }
    })
}

fn write_line(writer: &mut BufWriter<File>, value: &impl Serialize) -> Result<(), String> {
    let line = serde_json::to_string(value).map_err(|error| error.to_string())?;
    writeln!(writer, "{line}").map_err(|error| error.to_string())?;
    // One ~120-byte flush per second; negligible (doc 06 §A5).
    writer.flush().map_err(|error| error.to_string())
}

/// Trailer line + flush + fsync (doc 06 §A2).
fn finalize(session: &mut RecordingSession) -> Result<RecordingStopped, String> {
    let trailer = serde_json::json!({
        "endedAt": iso_utc(chrono::Utc::now()),
        "totalSnapshots": session.snapshot_count,
    });
    write_line(&mut session.writer, &trailer)?;
    // Best-effort fsync: the file must be readable even if the process is
    // killed right after.
    let _ = session.writer.get_ref().sync_all();
    Ok(RecordingStopped {
        file_path: session.file_path.to_string_lossy().into_owned(),
        total_snapshots: session.snapshot_count,
    })
}

/// `2026-08-14T12:30:45Z` (no milliseconds).
fn iso_utc(at: chrono::DateTime<chrono::Utc>) -> String {
    at.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// `<sanitizedHome>-<sanitizedAway>-<ISO, ':' → '-', no ms>.sbrec`
/// (doc 06 §A3 [PARITY]).
fn build_filename(home: &str, away: &str, at: chrono::DateTime<chrono::Utc>) -> String {
    format!(
        "{}-{}-{}.sbrec",
        sanitize_filename(home),
        sanitize_filename(away),
        at.format("%Y-%m-%dT%H-%M-%S")
    )
}

/// Replace every char not in `[a-zA-Z0-9-_]` with `_`, collapse repeated
/// underscores, trim leading/trailing underscores (doc 06 §A3, same rules
/// as the Electron app). Empty result falls back to `team` [NEW] — the
/// Electron app would have produced a broken `--…` filename.
fn sanitize_filename(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut last_underscore = false;
    for ch in name.chars() {
        let valid = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_';
        let ch = if valid { ch } else { '_' };
        if ch == '_' {
            if last_underscore {
                continue;
            }
            last_underscore = true;
        } else {
            last_underscore = false;
        }
        out.push(ch);
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        "team".into()
    } else {
        trimmed.to_string()
    }
}

/// Never overwrite an existing recording: two matches with the same team
/// names stopped and started within the same second would otherwise
/// collide on the timestamped filename.
fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }
    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    for n in 2.. {
        let candidate = parent.join(format!("{stem}-{n}.sbrec"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

// ---------------------------------------------------------------------------
// Reader: v2 `.sbrec` line format + v1 Electron `.json` importer (doc 06 §A2)
// ---------------------------------------------------------------------------

/// A parsed recording, normalized across format versions. The video
/// generator (Phase 9) consumes this.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedRecording {
    pub recording_id: String,
    pub started_at: String,
    /// `None` when the trailer is missing (interrupted recording) or the v1
    /// metadata left `endedAt` empty.
    pub ended_at: Option<String>,
    pub home_name: String,
    pub away_name: String,
    pub snapshots: Vec<Snapshot>,
}

/// Read a recording file, auto-detecting the format: a leading JSON line
/// with `"version": 2` is a `.sbrec` line-delimited file; a leading `{`
/// introducing a single pretty-printed document with `"version": "1.0"` is
/// a legacy Electron recording (doc 06 §A2).
pub fn read_recording(path: &Path) -> Result<ParsedRecording, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
    let first = raw
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .ok_or_else(|| format!("{}: empty recording file", path.display()))?;
    if serde_json::from_str::<serde_json::Value>(first)
        .ok()
        .and_then(|value| value.get("version").and_then(|v| v.as_u64()))
        == Some(2)
    {
        return read_v2(&raw, path);
    }
    if first.starts_with('{') {
        return read_v1(&raw, path);
    }
    Err(format!("{}: unrecognized recording format", path.display()))
}

/// v2: header line, snapshot lines, optional trailer line. A missing
/// trailer means the recording was interrupted — tolerated, the count is
/// derived from the lines. A corrupt *final* line is a crash-truncated
/// write and is dropped; a corrupt line in the middle is a real error.
fn read_v2(raw: &str, path: &Path) -> Result<ParsedRecording, String> {
    #[derive(Deserialize)]
    struct Header {
        #[serde(rename = "recordingId")]
        recording_id: Option<String>,
        #[serde(rename = "startedAt")]
        started_at: Option<String>,
        #[serde(rename = "homeName")]
        home_name: Option<String>,
        #[serde(rename = "awayName")]
        away_name: Option<String>,
    }

    let lines: Vec<&str> = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let header: Header = serde_json::from_str(lines[0])
        .map_err(|error| format!("{}: invalid header line: {error}", path.display()))?;

    let mut snapshots = Vec::with_capacity(lines.len().saturating_sub(1));
    let mut ended_at = None;
    for (index, line) in lines[1..].iter().enumerate() {
        let line_number = index + 2; // 1-based, after the header
        let is_last = index + 2 == lines.len();
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(value) if value.get("t").is_some() => {
                let snapshot: Snapshot = serde_json::from_value(value).map_err(|error| {
                    format!(
                        "{}: invalid snapshot on line {line_number}: {error}",
                        path.display()
                    )
                })?;
                snapshots.push(snapshot);
            }
            Ok(value) if value.get("endedAt").is_some() => {
                ended_at = value
                    .get("endedAt")
                    .and_then(|v| v.as_str())
                    .map(str::to_owned);
            }
            Ok(_) => {
                return Err(format!(
                    "{}: unrecognized line {line_number}",
                    path.display()
                ));
            }
            Err(error) if is_last => {
                tracing::warn!(
                    ?error,
                    "{}: dropping crash-truncated final line",
                    path.display()
                );
                break;
            }
            Err(error) => {
                return Err(format!(
                    "{}: corrupt line {line_number}: {error}",
                    path.display()
                ));
            }
        }
    }

    Ok(ParsedRecording {
        recording_id: header.recording_id.unwrap_or_default(),
        started_at: header.started_at.unwrap_or_default(),
        ended_at,
        home_name: header.home_name.unwrap_or_else(|| "HOME".into()),
        away_name: header.away_name.unwrap_or_else(|| "AWAY".into()),
        snapshots,
    })
}

/// v1 importer: the Electron `ScoreboardRecording` shape — one
/// pretty-printed document `{ "version": "1.0", "metadata": …, "snapshots":
/// [...] }`. Missing fields get the same defaults the Electron recorder
/// applied at capture time (`HOME`/`AWAY`, `#00ff00`/`#ff0000`, `PERIODO`).
fn read_v1(raw: &str, path: &Path) -> Result<ParsedRecording, String> {
    #[derive(Deserialize)]
    struct V1Recording {
        version: String,
        metadata: V1Metadata,
        snapshots: Vec<V1Snapshot>,
    }
    #[derive(Deserialize)]
    struct V1Metadata {
        #[serde(rename = "recordingId")]
        recording_id: Option<String>,
        #[serde(rename = "startedAt")]
        started_at: Option<String>,
        #[serde(rename = "endedAt")]
        ended_at: Option<String>,
        #[serde(rename = "homeName")]
        home_name: Option<String>,
        #[serde(rename = "awayName")]
        away_name: Option<String>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct V1Snapshot {
        relative_time: Option<u64>,
        team_home_name: Option<String>,
        team_away_name: Option<String>,
        team_home_color: Option<String>,
        team_away_color: Option<String>,
        team_home_score: Option<u32>,
        team_away_score: Option<u32>,
        timer: Option<u32>,
        half: Option<u32>,
        half_prefix: Option<String>,
    }

    let legacy: V1Recording = serde_json::from_str(raw)
        .map_err(|error| format!("{}: invalid v1 recording: {error}", path.display()))?;
    if legacy.version != "1.0" {
        return Err(format!(
            "{}: unsupported recording version {:?}",
            path.display(),
            legacy.version
        ));
    }

    // `||` in the Electron capture treated 0/"" as missing; mirror that.
    fn or_default(value: Option<String>, default: &str) -> String {
        value
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| default.to_string())
    }

    let snapshots = legacy
        .snapshots
        .into_iter()
        .enumerate()
        .map(|(index, snapshot)| Snapshot {
            t: snapshot.relative_time.unwrap_or(index as u64),
            hs: snapshot.team_home_score.unwrap_or(0),
            aw: snapshot.team_away_score.unwrap_or(0),
            tm: snapshot.timer.unwrap_or(0),
            hf: snapshot.half.unwrap_or(0).max(1),
            hn: or_default(snapshot.team_home_name, "HOME"),
            an: or_default(snapshot.team_away_name, "AWAY"),
            hc: or_default(snapshot.team_home_color, "#00ff00"),
            ac: or_default(snapshot.team_away_color, "#ff0000"),
            hp: or_default(snapshot.half_prefix, "PERIODO"),
        })
        .collect();

    Ok(ParsedRecording {
        recording_id: legacy.metadata.recording_id.unwrap_or_default(),
        started_at: legacy.metadata.started_at.unwrap_or_default(),
        ended_at: legacy.metadata.ended_at.filter(|ended| !ended.is_empty()),
        home_name: legacy.metadata.home_name.unwrap_or_else(|| "HOME".into()),
        away_name: legacy.metadata.away_name.unwrap_or_else(|| "AWAY".into()),
        snapshots,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::advance;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sbrec-test-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Let the spawned tick task run until it goes idle again (same trick
    /// as the timer tests).
    async fn settle() {
        for _ in 0..20 {
            tokio::task::yield_now().await;
        }
    }

    #[test]
    fn sanitize_filename_matches_documented_rules() {
        assert_eq!(sanitize_filename("HOME"), "HOME");
        assert_eq!(sanitize_filename("My Team!"), "My_Team");
        assert_eq!(sanitize_filename("a  b__c"), "a_b_c");
        assert_eq!(sanitize_filename("_lead_"), "lead");
        assert_eq!(sanitize_filename("---"), "---");
        // All-invalid and empty inputs fall back instead of producing a
        // broken `--…` filename.
        assert_eq!(sanitize_filename("üñï"), "team");
        assert_eq!(sanitize_filename(""), "team");
    }

    #[test]
    fn filename_uses_iso_timestamp_without_colons_or_millis() {
        let at = chrono::DateTime::parse_from_rfc3339("2026-08-14T12:30:45Z")
            .unwrap()
            .to_utc();
        assert_eq!(
            build_filename("HOME", "AWAY", at),
            "HOME-AWAY-2026-08-14T12-30-45.sbrec"
        );
    }

    #[test]
    fn unique_path_never_overwrites() {
        let dir = temp_dir("unique");
        let first = unique_path(dir.join("HOME-AWAY-2026-08-14T12-30-45.sbrec"));
        std::fs::write(&first, b"{}").unwrap();
        let second = unique_path(first.clone());
        assert_ne!(first, second);
        assert!(second.to_string_lossy().ends_with("-2.sbrec"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test(start_paused = true)]
    async fn recording_writes_header_snapshots_and_trailer() {
        let state = AppState::new();
        let dir = temp_dir("lifecycle");

        let started = start(&state, dir.clone()).await.unwrap();
        assert!(started.is_recording);
        assert_eq!(started.snapshot_count, 0);
        assert!(started.recording_id.is_some());

        // No snapshot before the first second elapses [PARITY].
        advance(Duration::from_millis(500)).await;
        settle().await;
        assert_eq!(status(&state).snapshot_count, 0);

        advance(Duration::from_secs(1)).await; // t = 0 lands here
        settle().await;
        assert_eq!(status(&state).snapshot_count, 1);

        advance(Duration::from_secs(2)).await; // t = 1, 2
        settle().await;
        let running = status(&state);
        assert_eq!(running.snapshot_count, 3);
        assert_eq!(running.duration_secs, 3);

        let stopped = stop(&state).await.unwrap();
        assert_eq!(stopped.total_snapshots, 3);

        let contents = std::fs::read_to_string(&stopped.file_path).unwrap();
        let lines: Vec<&str> = contents.lines().collect();
        assert_eq!(lines.len(), 5, "header + 3 snapshots + trailer");

        let header: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(header["version"], 2);
        assert_eq!(header["homeName"], "HOME");
        assert_eq!(header["awayName"], "AWAY");
        assert!(header["recordingId"].is_string());
        assert!(header["startedAt"].is_string());

        let first: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(first["t"], 0);
        assert_eq!(first["hs"], 0);
        assert_eq!(first["as"], 0);
        assert_eq!(first["tm"], 0);
        assert_eq!(first["hf"], 1);
        assert_eq!(first["hp"], "PERIODO");

        let trailer: serde_json::Value = serde_json::from_str(lines[4]).unwrap();
        assert_eq!(trailer["totalSnapshots"], 3);
        assert!(trailer["endedAt"].is_string());

        // Stop is idempotent-safe and the status goes idle.
        assert!(matches!(stop(&state).await, Err(error) if error == "No active recording"));
        assert!(!status(&state).is_recording);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test(start_paused = true)]
    async fn snapshot_reflects_the_state_at_its_second() {
        let state = AppState::new();
        let dir = temp_dir("values");
        start(&state, dir.clone()).await.unwrap();
        state
            .dispatch(crate::state::Action::ScoreHomeInc)
            .await
            .unwrap();
        advance(Duration::from_secs(1)).await;
        settle().await;
        let stopped = stop(&state).await.unwrap();

        let contents = std::fs::read_to_string(&stopped.file_path).unwrap();
        let snapshot: serde_json::Value =
            serde_json::from_str(contents.lines().nth(1).unwrap()).unwrap();
        assert_eq!(snapshot["t"], 0);
        assert_eq!(snapshot["hs"], 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test(start_paused = true)]
    async fn start_while_recording_fails() {
        let state = AppState::new();
        let dir = temp_dir("busy");
        start(&state, dir.clone()).await.unwrap();
        let again = start(&state, dir.clone()).await;
        assert!(matches!(again, Err(error) if error == "Recording already in progress"));
        stop(&state).await.unwrap();
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn stop_without_recording_fails() {
        let state = AppState::new();
        assert!(matches!(stop(&state).await, Err(error) if error == "No active recording"));
    }

    #[tokio::test(start_paused = true)]
    async fn flush_on_exit_writes_the_trailer() {
        let state = AppState::new();
        let dir = temp_dir("exit");
        let started = start(&state, dir.clone()).await.unwrap();
        advance(Duration::from_secs(2)).await;
        settle().await;

        flush_on_exit(&state);

        let contents = std::fs::read_to_string(started.file_path.unwrap()).unwrap();
        let last = contents.lines().last().unwrap();
        let trailer: serde_json::Value = serde_json::from_str(last).unwrap();
        assert_eq!(trailer["totalSnapshots"], 2);
        assert!(!status(&state).is_recording);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test(start_paused = true)]
    async fn read_recording_roundtrips_v2() {
        let state = AppState::new();
        let dir = temp_dir("roundtrip");
        start(&state, dir.clone()).await.unwrap();
        advance(Duration::from_secs(2)).await;
        settle().await;
        let stopped = stop(&state).await.unwrap();

        let parsed = read_recording(Path::new(&stopped.file_path)).unwrap();
        assert!(!parsed.recording_id.is_empty());
        assert_eq!(parsed.home_name, "HOME");
        assert_eq!(parsed.away_name, "AWAY");
        assert!(parsed.ended_at.is_some());
        assert_eq!(parsed.snapshots.len(), 2);
        assert_eq!(parsed.snapshots[0].t, 0);
        assert_eq!(parsed.snapshots[1].t, 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_recording_tolerates_missing_trailer_and_truncated_tail() {
        let dir = temp_dir("tolerant");
        let path = dir.join("interrupted.sbrec");
        std::fs::write(
            &path,
            concat!(
                "{\"version\":2,\"recordingId\":\"id-1\",\"startedAt\":\"2026-08-14T12:30:45Z\",\"homeName\":\"H\",\"awayName\":\"A\"}\n",
                "{\"t\":0,\"hs\":0,\"as\":0,\"tm\":900,\"hf\":1,\"hn\":\"H\",\"an\":\"A\",\"hc\":\"#00ff00\",\"ac\":\"#ff0000\",\"hp\":\"PERIODO\"}\n",
                // crash mid-write: no trailer, half-written final line
                "{\"t\":1,\"hs\":"
            ),
        )
        .unwrap();
        let parsed = read_recording(&path).unwrap();
        assert_eq!(parsed.recording_id, "id-1");
        assert_eq!(parsed.snapshots.len(), 1);
        assert_eq!(parsed.ended_at, None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_recording_imports_v1_electron_files() {
        let dir = temp_dir("v1");
        let path = dir.join("LIONS-TIGERS-2026-08-14T12-30-45.json");
        std::fs::write(
            &path,
            r##"{
  "version": "1.0",
  "metadata": {
    "recordingId": "abc-123",
    "startedAt": "2026-08-14T12:30:45.000Z",
    "endedAt": "",
    "homeName": "LIONS",
    "awayName": "TIGERS",
    "totalSnapshots": 2
  },
  "snapshots": [
    {
      "timestamp": 1786716645000,
      "relativeTime": 0,
      "teamHomeName": "LIONS",
      "teamAwayName": "TIGERS",
      "teamHomeColor": "#00ff00",
      "teamAwayColor": "#ff0000",
      "teamHomeScore": 1,
      "teamAwayScore": 0,
      "timer": 900,
      "half": 1,
      "halfPrefix": "PERIODO"
    },
    {
      "timestamp": 1786716646000,
      "relativeTime": 1,
      "teamHomeName": "",
      "teamAwayName": "TIGERS",
      "teamHomeColor": "#00ff00",
      "teamAwayColor": "#ff0000",
      "teamHomeScore": 2,
      "teamAwayScore": 3,
      "timer": 899,
      "half": 2,
      "halfPrefix": "TEMPO"
    }
  ]
}"##,
        )
        .unwrap();

        let parsed = read_recording(&path).unwrap();
        assert_eq!(parsed.recording_id, "abc-123");
        assert_eq!(parsed.home_name, "LIONS");
        assert_eq!(parsed.ended_at, None, "empty v1 endedAt means unfinished");
        assert_eq!(parsed.snapshots.len(), 2);
        assert_eq!(
            parsed.snapshots[0],
            Snapshot {
                t: 0,
                hs: 1,
                aw: 0,
                tm: 900,
                hf: 1,
                hn: "LIONS".into(),
                an: "TIGERS".into(),
                hc: "#00ff00".into(),
                ac: "#ff0000".into(),
                hp: "PERIODO".into(),
            }
        );
        // Electron's `||` fallback: empty name becomes the default.
        assert_eq!(parsed.snapshots[1].hn, "HOME");
        assert_eq!(parsed.snapshots[1].hp, "TEMPO");
        assert_eq!(parsed.snapshots[1].aw, 3);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_recent_sorts_by_mtime_and_caps() {
        let dir = temp_dir("recent");
        for n in 0..12u32 {
            let path = dir.join(format!("match-{n:02}.sbrec"));
            std::fs::write(&path, b"{}").unwrap();
            // Distinct increasing mtimes so the sort is deterministic.
            let modified = std::time::SystemTime::UNIX_EPOCH
                + Duration::from_secs(1_700_000_000 + u64::from(n));
            let file = std::fs::File::options().write(true).open(&path).unwrap();
            file.set_modified(modified).unwrap();
        }
        std::fs::write(dir.join("notes.txt"), b"ignore me").unwrap();

        let recent = list_recent(&dir);
        assert_eq!(recent.len(), MAX_RECENT);
        assert_eq!(recent[0].file_name, "match-11.sbrec");
        assert!(recent
            .windows(2)
            .all(|pair| pair[0].modified_unix_secs >= pair[1].modified_unix_secs));
        assert!(recent
            .iter()
            .all(|entry| entry.file_name.ends_with(".sbrec")));
        // A missing directory is "no recordings", not an error.
        assert!(list_recent(&dir.join("does-not-exist")).is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }
}
