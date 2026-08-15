//! Single source of truth for the scoreboard domain (tauri-rebuild doc 03 §2).
//!
//! Every mutation in the entire program goes through [`AppState::dispatch`].
//! Commands, the WS handler, the REST handler, the hotkey handler and the
//! timer engine all call it.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{broadcast, Mutex, RwLock};
use ts_rs::TS;

use crate::net::{self, LanAddress};
use crate::timer::TimerEngine;
use crate::windows::AppWindow;

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_PREFIX_LEN: usize = 24;
pub const MAX_LOADOUT_SECS: u32 = 359_999; // 99:59:59

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("validation failed: {0}")]
    Validation(String),
}

/// Broadcast channel capacity for [`ServerEvent`]s.
const EVENT_CHANNEL_CAPACITY: usize = 64;

#[derive(Clone, Debug)]
pub enum ServerEvent {
    State(ScoreboardState),
    TimerFinished,
    Buzzer,
    /// A feature window was opened or closed (doc 03 §7bis). Payload is the
    /// window label; emitted to all windows as `window:opened` /
    /// `window:closed`.
    Window(AppWindow, bool),
}

/// Geometry of one window, persisted in `window-geometry.json` under the
/// window label (tauri-rebuild doc 03 §7bis).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Small persisted app preferences. Written atomically (tmp + rename) and
/// debounced by the callers that mutate it frequently (window moves).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppPrefs {
    pub window_geometry: std::collections::HashMap<String, WindowGeometry>,
    pub zoom_levels: std::collections::HashMap<String, f64>,
}

impl AppPrefs {
    /// Load from the app config dir; missing or corrupt file yields defaults
    /// (a corrupt file is renamed aside so it is not lost).
    pub fn load(app: &AppHandle) -> Self {
        let path = Self::path(app);
        let Ok(raw) = std::fs::read_to_string(&path) else {
            return Self::default();
        };
        match serde_json::from_str::<Self>(&raw) {
            Ok(prefs) => prefs,
            Err(error) => {
                let backup = path.with_extension("corrupt.json");
                tracing::warn!(
                    ?error,
                    ?backup,
                    "window-geometry.json is corrupt; resetting"
                );
                let _ = std::fs::rename(&path, backup);
                Self::default()
            }
        }
    }

    pub fn save(&self, app: &AppHandle) {
        let path = Self::path(app);
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let tmp = path.with_extension("tmp");
        match serde_json::to_string_pretty(self) {
            Ok(json) => {
                if std::fs::write(&tmp, json).is_ok() {
                    let _ = std::fs::rename(&tmp, &path);
                }
            }
            Err(error) => tracing::warn!(?error, "failed to serialize app prefs"),
        }
    }

    fn path(app: &AppHandle) -> std::path::PathBuf {
        app.path()
            .app_config_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("window-geometry.json")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ScoreboardState {
    pub team_home_name: String,
    pub team_away_name: String,
    pub team_home_score: u32,
    pub team_away_score: u32,
    pub team_home_color: String,
    pub team_away_color: String,
    /// Seconds remaining on the countdown.
    pub timer: u32,
    pub half: u32,
    pub half_prefix: String,
    /// Reserved; unimplemented (see doc 08 open question 3).
    pub event_logo: Option<String>,
    /// Read-only for clients; only the timer engine sets it.
    pub is_timer_running: bool,
    pub timer_loadout1: u32,
    pub timer_loadout2: u32,
    pub timer_loadout3: u32,
    /// Monotonic, bumped on every mutation. Never exposed in the UI.
    #[ts(type = "number")]
    pub revision: u64,
}

impl Default for ScoreboardState {
    fn default() -> Self {
        Self {
            team_home_name: "HOME".into(),
            team_away_name: "AWAY".into(),
            team_home_score: 0,
            team_away_score: 0,
            team_home_color: "#00ff00".into(),
            team_away_color: "#ff0000".into(),
            timer: 0,
            half: 1,
            half_prefix: "PERIODO".into(),
            event_logo: None,
            is_timer_running: false,
            timer_loadout1: 900,
            timer_loadout2: 2700,
            timer_loadout3: 1200,
            revision: 0,
        }
    }
}

/// Partial update. Every field except `is_timer_running` and `revision`.
///
/// `deny_unknown_fields` is deliberate: the Electron server silently swallowed
/// typos in `POST /api/scoreboard`. Return 400 with the offending field.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ScoreboardPatch {
    #[ts(optional)]
    pub team_home_name: Option<String>,
    #[ts(optional)]
    pub team_away_name: Option<String>,
    #[ts(optional)]
    pub team_home_score: Option<u32>,
    #[ts(optional)]
    pub team_away_score: Option<u32>,
    #[ts(optional)]
    pub team_home_color: Option<String>,
    #[ts(optional)]
    pub team_away_color: Option<String>,
    /// Routed to `Action::TimerSet`, never written directly — otherwise a
    /// patch would silently desync the running engine.
    #[ts(optional)]
    pub timer: Option<u32>,
    #[ts(optional)]
    pub half: Option<u32>,
    #[ts(optional)]
    pub half_prefix: Option<String>,
    #[ts(optional)]
    pub event_logo: Option<String>,
    #[ts(optional)]
    pub timer_loadout1: Option<u32>,
    #[ts(optional)]
    pub timer_loadout2: Option<u32>,
    #[ts(optional)]
    pub timer_loadout3: Option<u32>,
}

/// One enum drives local commands, hotkeys and WS commands. Adding a feature
/// means adding a variant, and the compiler finds every place that must
/// handle it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "action", content = "data", rename_all = "kebab-case")]
#[ts(export, export_to = "../../src/bindings/")]
pub enum Action {
    Patch(ScoreboardPatch),
    ScoreHomeInc,
    ScoreHomeDec,
    ScoreAwayInc,
    ScoreAwayDec,
    HalfInc,
    HalfDec,
    TimerStart,
    TimerPause,
    TimerStop,
    TimerSet {
        seconds: u32,
    },
    /// Replaces the four Electron inc/dec second/minute commands.
    TimerAdjust {
        delta: i32,
    },
    /// 1 | 2 | 3 — loadout resolution lives server-side.
    TimerLoadout {
        slot: u8,
    },
    BuzzerPlay,
    Reset,
}

/// Lightweight, frequently-changing server counters for the status bar
/// (doc 02 §7.1.1). Emitted as `server:status`, coalesced to 2 Hz.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    /// Currently connected WebSocket clients.
    pub ws_clients: u32,
    /// [OPTIONAL] Overlay mode (Phase 7).
    pub overlay_active: bool,
    /// [OPTIONAL] Match recording (Phase 8).
    pub recording_active: bool,
    /// [OPTIONAL] Elapsed recording seconds (Phase 8).
    #[ts(type = "number")]
    pub recording_seconds: u64,
}

/// Heavy server description for the Outputs window (doc 02 §7.1): carries
/// the LAN URLs and changes rarely. Emitted as `server:info`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ServerInfo {
    pub running: bool,
    pub port: u16,
    pub addresses: Vec<LanAddress>,
    /// `http://<lan-ip>:<port>/scoreboard` for the first LAN address.
    pub scoreboard_url: String,
    /// `http://localhost:<port>/scoreboard`.
    pub local_url: String,
}

pub struct AppState {
    pub scoreboard: RwLock<ScoreboardState>,
    pub timer: Mutex<TimerEngine>,
    pub events: broadcast::Sender<ServerEvent>,
    /// Persisted window geometry + zoom levels (doc 03 §7bis/§7ter).
    pub prefs: RwLock<AppPrefs>,
    /// Port the HTTP server actually bound (0 until it is up).
    pub server_port: AtomicU32,
    /// Currently connected WebSocket clients.
    pub ws_clients: AtomicU32,
    /// Last emitted `server:status`, to suppress redundant emissions.
    last_status: Mutex<Option<ServerStatus>>,
    /// Set once during setup. Tests never set it, so emits are no-ops there.
    pub app: OnceLock<AppHandle>,
}

pub type Shared = Arc<AppState>;

impl AppState {
    /// Used by tests; the app uses [`AppState::with_prefs`].
    #[cfg(test)]
    pub fn new() -> Shared {
        Self::with_prefs(AppPrefs::default())
    }

    pub fn with_prefs(prefs: AppPrefs) -> Shared {
        let (events, _rx) = broadcast::channel(EVENT_CHANNEL_CAPACITY);
        Arc::new(AppState {
            scoreboard: RwLock::new(ScoreboardState::default()),
            timer: Mutex::new(TimerEngine::new()),
            events,
            prefs: RwLock::new(prefs),
            server_port: AtomicU32::new(0),
            ws_clients: AtomicU32::new(0),
            last_status: Mutex::new(None),
            app: OnceLock::new(),
        })
    }

    pub fn attach_app(&self, app: AppHandle) {
        let _ = self.app.set(app);
    }

    pub async fn current(&self) -> ScoreboardState {
        self.scoreboard.read().await.clone()
    }

    /// Record a window's geometry; the caller debounces and persists.
    pub async fn remember_geometry(&self, label: &str, geometry: WindowGeometry) {
        self.prefs
            .write()
            .await
            .window_geometry
            .insert(label.to_string(), geometry);
    }

    pub async fn geometry_for(&self, label: &str) -> Option<WindowGeometry> {
        self.prefs.read().await.window_geometry.get(label).copied()
    }

    /// Persist a window's zoom level and return the clamped value applied.
    pub async fn set_zoom(&self, label: &str, zoom: f64) -> f64 {
        let zoom = zoom.clamp(0.5, 2.0);
        self.prefs
            .write()
            .await
            .zoom_levels
            .insert(label.to_string(), zoom);
        zoom
    }

    pub async fn zoom_for(&self, label: &str) -> f64 {
        self.prefs
            .read()
            .await
            .zoom_levels
            .get(label)
            .copied()
            .unwrap_or(1.0)
    }

    pub async fn persist_prefs(&self) {
        let prefs = self.prefs.read().await.clone();
        if let Some(app) = self.app.get() {
            prefs.save(app);
        }
    }

    #[cfg(test)]
    pub fn subscribe(&self) -> broadcast::Receiver<ServerEvent> {
        self.events.subscribe()
    }

    /// Snapshot of the live server counters (doc 02 §7.1.1).
    pub fn server_status(&self) -> ServerStatus {
        let port = self.server_port.load(Ordering::Relaxed);
        ServerStatus {
            running: port != 0,
            port: u16::try_from(port).unwrap_or(0),
            ws_clients: self.ws_clients.load(Ordering::Relaxed),
            overlay_active: false,
            recording_active: false,
            recording_seconds: 0,
        }
    }

    /// Record the bound port and announce it (`server:status` +
    /// `server:info`). Called once by the server task after binding.
    pub async fn set_server_port(self: &Arc<Self>, port: u16) {
        self.server_port.store(u32::from(port), Ordering::Relaxed);
        self.publish_server_status().await;
        self.publish_server_info().await;
    }

    /// Bump the connected-client gauge and republish `server:status`.
    pub async fn ws_client_connected(self: &Arc<Self>) {
        self.ws_clients.fetch_add(1, Ordering::Relaxed);
        self.publish_server_status().await;
    }

    pub async fn ws_client_disconnected(self: &Arc<Self>) {
        self.ws_clients
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |n| n.checked_sub(1))
            .ok();
        self.publish_server_status().await;
    }

    /// Emit `server:status` if it changed since the last emission. A
    /// debounce task coalesces bursts (connect storms) to 2 Hz.
    pub async fn publish_server_status(self: &Arc<Self>) {
        let status = self.server_status();
        let changed = {
            let mut last = self.last_status.lock().await;
            if last.as_ref() == Some(&status) {
                false
            } else {
                *last = Some(status.clone());
                true
            }
        };
        if changed {
            self.emit_app("server:status", status);
        }
        self.spawn_status_debounce();
    }

    /// After 500 ms of quiet, re-check whether the last emitted status is
    /// still current and emit if not. This bounds the emission rate of
    /// connect/disconnect storms without dropping the final state.
    fn spawn_status_debounce(self: &Arc<Self>) {
        if self.app.get().is_none() {
            return;
        }
        let shared = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let status = shared.server_status();
            let changed = {
                let mut last = shared.last_status.lock().await;
                if last.as_ref() == Some(&status) {
                    false
                } else {
                    *last = Some(status.clone());
                    true
                }
            };
            if changed {
                shared.emit_app("server:status", status);
            }
        });
    }

    /// Heavy server description for the Outputs window (doc 02 §7.1).
    pub fn server_info(&self) -> ServerInfo {
        let status = self.server_status();
        let addresses = net::lan_addresses();
        let host = addresses
            .first()
            .map(|entry| entry.address.as_str())
            .unwrap_or("127.0.0.1");
        ServerInfo {
            running: status.running,
            port: status.port,
            scoreboard_url: format!("http://{host}:{}/scoreboard", status.port),
            local_url: format!("http://localhost:{}/scoreboard", status.port),
            addresses,
        }
    }

    pub async fn publish_server_info(&self) {
        self.emit_app("server:info", self.server_info());
    }

    /// Emit to all webviews when an app handle is attached; no-op in tests.
    fn emit_app<T: Serialize + Clone>(&self, event: &str, payload: T) {
        if let Some(app) = self.app.get() {
            let _ = app.emit(event, payload);
        }
    }

    /// The one mutation path.
    pub async fn dispatch(
        self: &Arc<Self>,
        action: Action,
    ) -> Result<ScoreboardState, DomainError> {
        let mut emit_buzzer = false;
        let snapshot = {
            let mut sb = self.scoreboard.write().await;
            match action {
                Action::ScoreHomeInc => {
                    sb.team_home_score = sb.team_home_score.saturating_add(1);
                }
                Action::ScoreHomeDec => {
                    sb.team_home_score = sb.team_home_score.saturating_sub(1);
                }
                Action::ScoreAwayInc => {
                    sb.team_away_score = sb.team_away_score.saturating_add(1);
                }
                Action::ScoreAwayDec => {
                    sb.team_away_score = sb.team_away_score.saturating_sub(1);
                }
                Action::HalfInc => {
                    sb.half = sb.half.saturating_add(1);
                }
                Action::HalfDec => {
                    sb.half = sb.half.max(2).saturating_sub(1).max(1);
                }
                Action::Patch(p) => {
                    let mut p = p;
                    // `timer` in a patch is routed to `TimerSet`, never written
                    // directly — make the Electron desync bug structural.
                    let timer = p.timer.take();
                    let mut next = sb.clone();
                    apply_patch(&mut next, p)?;
                    *sb = next;
                    if let Some(seconds) = timer {
                        self.timer
                            .lock()
                            .await
                            .apply(self, &mut sb, &Action::TimerSet { seconds });
                    }
                }
                Action::TimerLoadout { slot } if !(1..=3).contains(&slot) => {
                    return Err(DomainError::Validation(format!(
                        "invalid timer loadout slot {slot}: expected 1, 2, or 3"
                    )));
                }
                ref timer_action @ (Action::TimerStart
                | Action::TimerPause
                | Action::TimerStop
                | Action::TimerSet { .. }
                | Action::TimerAdjust { .. }
                | Action::TimerLoadout { .. }) => {
                    self.timer.lock().await.apply(self, &mut sb, timer_action);
                }
                Action::BuzzerPlay => {
                    emit_buzzer = true;
                }
                Action::Reset => {
                    // Stop zeroes the timer; names, colours, prefix and
                    // loadouts are preserved [PARITY].
                    self.timer
                        .lock()
                        .await
                        .apply(self, &mut sb, &Action::TimerStop);
                    reset_match(&mut sb);
                }
            }
            // Bumped even for no-op actions so clients can detect liveness.
            sb.revision += 1;
            sb.clone()
        }; // [RISK] write guard dropped HERE, before any emit

        self.publish(ServerEvent::State(snapshot.clone()));
        if emit_buzzer {
            self.publish(ServerEvent::Buzzer);
        }
        Ok(snapshot)
    }

    /// Timer tick task writes a new displayed second through here.
    pub async fn set_timer_and_publish(&self, value: u32) {
        let snapshot = {
            let mut sb = self.scoreboard.write().await;
            sb.timer = value;
            sb.revision += 1;
            sb.clone()
        };
        self.publish(ServerEvent::State(snapshot));
    }

    /// At zero: pause, set `timer = 0`, publish state, then publish
    /// `TimerFinished`. The buzzer is not played by Rust — the `main` webview
    /// decides based on `buzzerAutoPlay` [PARITY].
    pub async fn timer_reached_zero(&self) {
        {
            let mut engine = self.timer.lock().await;
            engine.on_finished();
        }
        let snapshot = {
            let mut sb = self.scoreboard.write().await;
            sb.timer = 0;
            sb.is_timer_running = false;
            sb.revision += 1;
            sb.clone()
        };
        self.publish(ServerEvent::State(snapshot));
        self.publish(ServerEvent::TimerFinished);
    }

    pub fn publish(&self, ev: ServerEvent) {
        // `send` returns `Err` when there are no receivers — normal when no
        // LAN clients are connected.
        let _ = self.events.send(ev.clone());
        // In tests no app handle is attached, so emits are no-ops.
        if let Some(app) = self.app.get() {
            match ev {
                ServerEvent::State(s) => {
                    let _ = app.emit("state:changed", s);
                }
                ServerEvent::TimerFinished => {
                    let _ = app.emit("timer:finished", ());
                }
                ServerEvent::Buzzer => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("buzzer:play", ());
                    }
                }
                ServerEvent::Window(which, open) => {
                    let event = if open {
                        "window:opened"
                    } else {
                        "window:closed"
                    };
                    let _ = app.emit(event, which.label());
                }
            }
        }
    }
}

fn validate_name(raw: &str) -> Result<String, DomainError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(DomainError::Validation(
            "team name must not be empty".into(),
        ));
    }
    Ok(trimmed.chars().take(MAX_NAME_LEN).collect())
}

/// Regex-free check: 7 bytes, leading `#`, rest ASCII hex. Normalized to
/// lowercase.
fn validate_color(raw: &str) -> Result<String, DomainError> {
    let bytes = raw.as_bytes();
    let valid =
        bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit);
    if !valid {
        return Err(DomainError::Validation(format!(
            "invalid colour {raw:?}: must match #RRGGBB"
        )));
    }
    Ok(raw.to_ascii_lowercase())
}

fn apply_patch(sb: &mut ScoreboardState, p: ScoreboardPatch) -> Result<(), DomainError> {
    if let Some(name) = p.team_home_name {
        sb.team_home_name = validate_name(&name)?;
    }
    if let Some(name) = p.team_away_name {
        sb.team_away_name = validate_name(&name)?;
    }
    if let Some(score) = p.team_home_score {
        sb.team_home_score = score;
    }
    if let Some(score) = p.team_away_score {
        sb.team_away_score = score;
    }
    if let Some(color) = p.team_home_color {
        sb.team_home_color = validate_color(&color)?;
    }
    if let Some(color) = p.team_away_color {
        sb.team_away_color = validate_color(&color)?;
    }
    if let Some(half) = p.half {
        sb.half = half.max(1);
    }
    if let Some(prefix) = p.half_prefix {
        sb.half_prefix = prefix.trim().chars().take(MAX_PREFIX_LEN).collect();
    }
    if let Some(logo) = p.event_logo {
        sb.event_logo = Some(logo);
    }
    if let Some(loadout) = p.timer_loadout1 {
        sb.timer_loadout1 = loadout.min(MAX_LOADOUT_SECS);
    }
    if let Some(loadout) = p.timer_loadout2 {
        sb.timer_loadout2 = loadout.min(MAX_LOADOUT_SECS);
    }
    if let Some(loadout) = p.timer_loadout3 {
        sb.timer_loadout3 = loadout.min(MAX_LOADOUT_SECS);
    }
    Ok(())
}

/// `Reset` preserves names, colours, prefix and loadouts [PARITY].
fn reset_match(sb: &mut ScoreboardState) {
    sb.team_home_score = 0;
    sb.team_away_score = 0;
    sb.half = 1;
    sb.timer = 0;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn score_decrement_saturates_at_zero() {
        let state = AppState::new();
        state.dispatch(Action::ScoreHomeDec).await.unwrap();
        assert_eq!(state.current().await.team_home_score, 0);
        state.dispatch(Action::ScoreHomeInc).await.unwrap();
        state.dispatch(Action::ScoreHomeInc).await.unwrap();
        state.dispatch(Action::ScoreHomeDec).await.unwrap();
        assert_eq!(state.current().await.team_home_score, 1);
    }

    #[tokio::test]
    async fn away_score_actions_saturate_at_bounds() {
        let state = AppState::new();
        state.dispatch(Action::ScoreAwayDec).await.unwrap();
        assert_eq!(state.current().await.team_away_score, 0);

        state
            .dispatch(Action::Patch(ScoreboardPatch {
                team_away_score: Some(u32::MAX),
                ..Default::default()
            }))
            .await
            .unwrap();
        state.dispatch(Action::ScoreAwayInc).await.unwrap();
        assert_eq!(state.current().await.team_away_score, u32::MAX);
    }

    #[tokio::test]
    async fn half_never_goes_below_one() {
        let state = AppState::new();
        state.dispatch(Action::HalfDec).await.unwrap();
        assert_eq!(state.current().await.half, 1);
        state.dispatch(Action::HalfInc).await.unwrap();
        state.dispatch(Action::HalfDec).await.unwrap();
        assert_eq!(state.current().await.half, 1);
    }

    #[tokio::test]
    async fn reset_preserves_team_identity() {
        let state = AppState::new();
        state
            .dispatch(Action::Patch(ScoreboardPatch {
                team_home_name: Some("LIONS".into()),
                team_away_color: Some("#0000FF".into()),
                half_prefix: Some("TEMPO".into()),
                timer_loadout1: Some(600),
                ..Default::default()
            }))
            .await
            .unwrap();
        state.dispatch(Action::ScoreHomeInc).await.unwrap();
        state.dispatch(Action::HalfInc).await.unwrap();
        state
            .dispatch(Action::TimerSet { seconds: 300 })
            .await
            .unwrap();

        state.dispatch(Action::Reset).await.unwrap();
        let sb = state.current().await;
        assert_eq!(sb.team_home_score, 0);
        assert_eq!(sb.team_away_score, 0);
        assert_eq!(sb.half, 1);
        assert_eq!(sb.timer, 0);
        assert!(!sb.is_timer_running);
        // Identity preserved.
        assert_eq!(sb.team_home_name, "LIONS");
        assert_eq!(sb.team_away_color, "#0000ff"); // normalized to lowercase
        assert_eq!(sb.half_prefix, "TEMPO");
        assert_eq!(sb.timer_loadout1, 600);
    }

    #[tokio::test]
    async fn patch_trims_and_truncates_names() {
        let state = AppState::new();
        state
            .dispatch(Action::Patch(ScoreboardPatch {
                team_home_name: Some(format!("  {}  ", "X".repeat(50))),
                ..Default::default()
            }))
            .await
            .unwrap();
        assert_eq!(state.current().await.team_home_name.len(), MAX_NAME_LEN);
    }

    #[tokio::test]
    async fn patch_rejects_empty_name() {
        let state = AppState::new();
        let err = state
            .dispatch(Action::Patch(ScoreboardPatch {
                team_home_name: Some("   ".into()),
                ..Default::default()
            }))
            .await
            .unwrap_err();
        assert!(matches!(err, DomainError::Validation(_)));
        assert_eq!(state.current().await.team_home_name, "HOME");
    }

    #[tokio::test]
    async fn patch_validates_colours() {
        let state = AppState::new();
        for bad in ["00ff00", "#00ff0", "#00ff000", "#gggggg", ""] {
            let err = state
                .dispatch(Action::Patch(ScoreboardPatch {
                    team_home_color: Some(bad.into()),
                    ..Default::default()
                }))
                .await
                .unwrap_err();
            assert!(matches!(err, DomainError::Validation(_)), "input {bad:?}");
        }
    }

    #[tokio::test]
    async fn invalid_patch_is_atomic() {
        let state = AppState::new();
        let before = state.current().await;
        let result = state
            .dispatch(Action::Patch(ScoreboardPatch {
                team_home_name: Some("LIONS".into()),
                team_home_color: Some("not-a-colour".into()),
                ..Default::default()
            }))
            .await;

        assert!(matches!(result, Err(DomainError::Validation(_))));
        let after = state.current().await;
        assert_eq!(after.team_home_name, before.team_home_name);
        assert_eq!(after.team_home_color, before.team_home_color);
        assert_eq!(after.revision, before.revision);
    }

    #[tokio::test]
    async fn invalid_loadout_slot_is_rejected() {
        let state = AppState::new();
        let result = state.dispatch(Action::TimerLoadout { slot: 4 }).await;

        assert!(matches!(result, Err(DomainError::Validation(_))));
        assert_eq!(state.current().await.revision, 0);
    }

    #[tokio::test]
    async fn patch_clamps_half_and_loadouts() {
        let state = AppState::new();
        state
            .dispatch(Action::Patch(ScoreboardPatch {
                half: Some(0),
                timer_loadout2: Some(u32::MAX),
                ..Default::default()
            }))
            .await
            .unwrap();
        let sb = state.current().await;
        assert_eq!(sb.half, 1);
        assert_eq!(sb.timer_loadout2, MAX_LOADOUT_SECS);
    }

    #[tokio::test]
    async fn patch_timer_routes_through_engine() {
        let state = AppState::new();
        state
            .dispatch(Action::Patch(ScoreboardPatch {
                timer: Some(42),
                ..Default::default()
            }))
            .await
            .unwrap();
        assert_eq!(state.current().await.timer, 42);
        // Engine must agree with the state, otherwise Start would jump.
        assert_eq!(state.timer.lock().await.displayed(), 42);
    }

    #[test]
    fn patch_rejects_unknown_fields() {
        let err = serde_json::from_str::<ScoreboardPatch>(r#"{"teamHomeScre": 3}"#);
        assert!(err.is_err());
    }

    #[tokio::test]
    async fn revision_bumps_on_every_dispatch() {
        let state = AppState::new();
        let r0 = state.current().await.revision;
        state.dispatch(Action::ScoreHomeInc).await.unwrap();
        // Even a no-op action bumps, so clients can detect liveness.
        state.dispatch(Action::TimerStart).await.unwrap();
        assert_eq!(state.current().await.revision, r0 + 2);
    }

    #[tokio::test]
    async fn dispatch_publishes_state_event() {
        let state = AppState::new();
        let mut rx = state.subscribe();
        state.dispatch(Action::ScoreAwayInc).await.unwrap();
        match rx.recv().await {
            Ok(ServerEvent::State(sb)) => assert_eq!(sb.team_away_score, 1),
            other => panic!("expected state event, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn buzzer_play_emits_buzzer_event_and_keeps_state() {
        let state = AppState::new();
        let mut rx = state.subscribe();
        let before = state.current().await;
        state.dispatch(Action::BuzzerPlay).await.unwrap();
        assert!(matches!(rx.recv().await, Ok(ServerEvent::State(_))));
        assert!(matches!(rx.recv().await, Ok(ServerEvent::Buzzer)));
        let after = state.current().await;
        assert_eq!(after.team_home_name, before.team_home_name);
        assert_eq!(after.revision, before.revision + 1);
    }
}
