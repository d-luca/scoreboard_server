# 03 — Backend (Rust)

Target: **Rust 2021, edition 2021, Tauri v2**. This document specifies modules, crate
choices, algorithms and invariants. It gives signatures and the tricky bodies; routine
bodies are left to implementation.

## 1. Dependencies

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-dialog = "2"
tauri-plugin-opener = "2"
tauri-plugin-single-instance = "2"

# async / server
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time", "process", "io-util"] }
axum = { version = "0.8", features = ["ws", "macros"] }
tower-http = { version = "0.6", features = ["cors"] }
rust-embed = { version = "8", features = ["interpolate-folder-path"] }
mime_guess = "2"

# data
serde = { version = "1", features = ["derive"] }
serde_json = "1"
ts-rs = { version = "10", features = ["serde-compat"] }

# utilities
anyhow = "1"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
if-addrs = "0.13"
rand = "0.8"
subtle = "2"
qrcode = { version = "0.14", default-features = false, features = ["svg"] }

# [OPTIONAL] overlay
tauri-plugin-global-shortcut = "2"

# [OPTIONAL] recording + video
tauri-plugin-shell = "2"
uuid = { version = "1", features = ["v4"] }
time = { version = "0.3", features = ["formatting", "macros"] }
```

Notes:

- axum's built-in `ws` extractor is enough; you do **not** need `tokio-tungstenite`
  directly (axum depends on it internally).
- `tauri-plugin-shell` is only pulled in for the ffmpeg sidecar. Skip it in v1.
- `tauri-plugin-fs` is not required: all filesystem work happens in Rust, not in JS.

## 2. `state.rs` — the single source of truth

### 2.1 Shape

```rust
pub struct AppState {
    scoreboard: RwLock<ScoreboardState>,
    settings: RwLock<Settings>,
    timer: Mutex<TimerEngine>,
    events: broadcast::Sender<ServerEvent>,
    control_token: RwLock<String>,
    app: OnceLock<AppHandle>,      // set once during setup
}
pub type Shared = Arc<AppState>;

#[derive(Clone, Debug)]
pub enum ServerEvent {
    State(ScoreboardState),
    TimerFinished,
    Buzzer,
    ServerInfo(ServerInfo),
}
```

### 2.2 The one mutation path

Every mutation in the entire program goes through this function. Commands, the WS
handler, the REST handler, the hotkey handler and the timer engine all call it.

```rust
impl AppState {
    pub async fn dispatch(&self, action: Action) -> Result<ScoreboardState, DomainError> {
        let snapshot = {
            let mut sb = self.scoreboard.write().await;
            match action {
                Action::ScoreHomeInc => sb.team_home_score = sb.team_home_score.saturating_add(1),
                Action::ScoreHomeDec => sb.team_home_score = sb.team_home_score.saturating_sub(1),
                // ...
                Action::Patch(p)     => apply_patch(&mut sb, p)?,
                Action::TimerStart | Action::TimerPause | Action::TimerStop
                | Action::TimerSet { .. } | Action::TimerAdjust { .. }
                | Action::TimerLoadout { .. } => {
                    // delegated to the timer engine, which writes `timer`
                    // and `is_timer_running` through this same lock guard
                    self.apply_timer_action(&mut sb, action).await?;
                }
                Action::BuzzerPlay   => { /* no state change */ }
                Action::Reset        => reset_match(&mut sb),
            }
            sb.revision += 1;
            sb.clone()
        }; // <-- guard dropped HERE, before any emit

        self.publish(ServerEvent::State(snapshot.clone()));
        Ok(snapshot)
    }

    pub fn publish(&self, ev: ServerEvent) {
        let _ = self.events.send(ev.clone());               // LAN clients
        if let Some(app) = self.app.get() {
            match ev {
                ServerEvent::State(s)     => { let _ = app.emit("state:changed", s); }
                ServerEvent::TimerFinished=> { let _ = app.emit("timer:finished", ()); }
                ServerEvent::Buzzer       => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.emit("buzzer:play", ());
                    }
                }
                ServerEvent::ServerInfo(i)=> { let _ = app.emit("server:info", i); }
            }
        }
    }
}
```

**Invariants**

- `[RISK]` The write guard must be dropped before `publish`. The explicit block above is
  not stylistic — a listener that calls back into a command while the guard is held
  deadlocks the whole app.
- `broadcast::Sender::send` returns `Err` when there are no receivers. That is normal (no
  LAN clients connected). Always `let _ =`.
- `revision` is bumped even for no-op actions so clients can detect liveness.

### 2.3 Validation

```rust
fn apply_patch(sb: &mut ScoreboardState, p: ScoreboardPatch) -> Result<(), DomainError> { ... }
```

- Names: `trim()`, reject empty, truncate at 32 chars (grapheme-safe is overkill; use
  `chars().take(32)`).
- Colours: regex-free check — must be 7 bytes, start with `#`, rest `is_ascii_hexdigit()`.
  Normalize to lowercase.
- `half`: clamp to ≥ 1.
- Loadouts: clamp to `0..=359_999` (99:59:59 worth of seconds is plenty).
- `timer` in a patch is routed to `Action::TimerSet`, never written directly — otherwise
  a patch would silently desync the running engine. `[RISK]` This is exactly the bug the
  Electron `applyExternalScoreboardData` works around by splitting `timer` out of the
  payload; make it structural instead.

## 3. `timer.rs` — the timer engine

### 3.1 Requirements

- No drift over a 45-minute half.
- Unaffected by webview focus, throttling, or UI load.
- Sub-second responsiveness on start/pause.
- Survives system clock changes (NTP steps, DST) → **monotonic clock only**.

### 3.2 Design

```rust
pub struct TimerEngine {
    running: bool,
    /// Remaining time when paused.
    remaining: Duration,
    /// Instant at which the timer reaches zero, while running.
    deadline: Option<Instant>,
    task: Option<JoinHandle<()>>,
}
```

`Instant` is monotonic in Rust's std — a wall-clock jump cannot corrupt it. The Electron
implementation uses `Date.now()` and _is_ vulnerable to that.

**Displayed value** (ceiling, so the UI shows `15:00` for the whole first second, matching
broadcast convention and the Electron behaviour at t=0):

```rust
fn displayed(&self) -> u32 {
    let remaining = match (self.running, self.deadline) {
        (true, Some(d)) => d.saturating_duration_since(Instant::now()),
        _ => self.remaining,
    };
    remaining.as_secs() as u32 + u32::from(remaining.subsec_nanos() > 0)
}
```

### 3.3 The tick task

```rust
// spawned on start, aborted on pause/stop
let mut ticker = tokio::time::interval(Duration::from_millis(100));
ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
loop {
    ticker.tick().await;
    let now_displayed = engine.displayed();
    if now_displayed != last_published {
        last_published = now_displayed;
        state.set_timer_and_publish(now_displayed).await;
    }
    if now_displayed == 0 {
        state.timer_reached_zero().await;   // pause + emit timer:finished + buzzer
        break;
    }
}
```

`[NEW]` 100 ms polling with change-detection instead of a 1000 ms interval:

- The second boundary is published within 100 ms of the true boundary instead of drifting
  by up to a full second relative to when Start was pressed.
- Pausing at `12.4 s` and resuming preserves the fraction, so a match paused 50 times
  still ends at exactly 00:00.
- Cost is negligible (10 wakeups/s doing an integer comparison).

### 3.4 Action handling

| Action                  | Behaviour                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TimerStart`            | No-op if `remaining == 0` or already running. Sets `deadline = Instant::now() + remaining`, spawns the tick task, sets `is_timer_running = true` |
| `TimerPause`            | No-op if not running. `remaining = deadline - now`, aborts the task, clears `is_timer_running`                                                   |
| `TimerStop`             | Pause, then `remaining = 0`, publishes `timer = 0`                                                                                               |
| `TimerSet { seconds }`  | `remaining = seconds`. If running: recompute `deadline = now + remaining` (task keeps running). If `seconds == 0`: pause first                   |
| `TimerAdjust { delta }` | `seconds = displayed().saturating_add_signed(delta).max(0)` then `TimerSet`                                                                      |
| `TimerLoadout { slot }` | Pause, then `TimerSet(loadout[slot])`                                                                                                            |

At zero: pause, set `timer = 0`, `is_timer_running = false`, publish state, then publish
`TimerFinished`. The buzzer is _not_ played by Rust — the `main` webview decides based on
the `buzzerAutoPlay` setting, and LAN clients decide based on their own toggle.
`[PARITY]`

### 3.5 Tests

Unit-test the engine with `tokio::time::pause()` + `advance()`:

- start at 10 s, advance 10 s → exactly one `timer-finished`, `timer == 0`
- start, advance 3.5 s, pause, advance 60 s, resume, advance 6.5 s → finishes at exactly
  10 s of running time
- `TimerSet` while running does not stop the task
- 100 pause/resume cycles accumulate < 1 s error

## 4. `server/` — axum

### 4.1 Startup

```rust
pub async fn start(shared: Shared, preferred_port: u16) -> anyhow::Result<u16> {
    let app = Router::new()
        .route("/health", get(routes::health))
        .route("/api/scoreboard", get(routes::get_state).post(routes::post_patch))
        .route("/api/scoreboard/{property}", get(routes::get_property))
        .route("/api/action", post(routes::post_action))
        .route("/ws", get(ws::handler))
        .route("/scoreboard", get(assets::scoreboard_page))
        .route("/control", get(assets::control_page))
        .route("/value/{property}", get(assets::value_page))
        .route("/buzzer.mp3", get(routes::buzzer_audio))
        .fallback(assets::static_handler)
        .layer(CorsLayer::new().allow_origin(Any)
                              .allow_methods([Method::GET, Method::POST])
                              .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]))
        .with_state(shared.clone());

    let listener = bind_with_fallback(preferred_port).await?;   // [NEW]
    let port = listener.local_addr()?.port();
    tauri::async_runtime::spawn(async move {
        axum::serve(listener, app).await.ok();
    });
    Ok(port)
}
```

`[NEW]` `bind_with_fallback` tries `preferred_port`, then `preferred_port+1..+10`, then
`0` (ephemeral). The chosen port is reported through `ServerInfo` and shown in the UI.
The Electron app crashes on `EADDRINUSE`.

`[RISK]` Binding `0.0.0.0` triggers the Windows Firewall prompt on first run. Add a
first-run note in the UI explaining that "Allow on private networks" is required, and do
**not** request public-network access.

### 4.2 WebSocket handler

```rust
async fn handler(ws: WebSocketUpgrade,
                 State(shared): State<Shared>,
                 headers: HeaderMap,
                 Query(q): Query<WsQuery>) -> impl IntoResponse {
    let authorized = auth::check(&shared, &headers, q.t.as_deref()).await;
    ws.on_upgrade(move |socket| client_loop(socket, shared, authorized))
}
```

`client_loop`:

1. Increment `shared.ws_clients` (and `authorized_clients` when applicable), publish
   `ServerStatus`. Use a guard struct whose `Drop` decrements and republishes, so a
   panicking or abruptly closed connection cannot leak the count. `[NEW]`
2. Send the current state frame.
3. `tokio::select!` over
   - `rx.recv()` from the broadcast channel → serialize and send.
     On `RecvError::Lagged(_)`, re-send a fresh full state and continue.
     On `RecvError::Closed`, break.
   - `socket.recv()` → parse, rate-limit, then `shared.dispatch(action)` if `authorized`,
     else send `{"type":"error","code":"unauthorized"}`.
   - a 30 s interval → send `Message::Ping`.
4. On any error, break; the socket drops, the receiver unsubscribes and the guard fires.

Rate limiting: a simple token bucket (30 tokens, refill 30/s) per connection.

The client counters feed the main window's status bar (doc 02 §7.1.1). Coalesce
`server:status` emissions to 2 Hz so a reconnect storm cannot flood the webviews.

### 4.3 Static assets

```rust
#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/../dist"]
struct Assets;
```

The whole Vite `dist/` is compiled into the binary. `static_handler` looks up the path,
guesses the MIME type with `mime_guess`, and returns `404` on a miss. Page routes read the
corresponding `.html` and inject a small bootstrap script:

```html
<script>
	window.__SCOREBOARD__ = { wsUrl: "ws://HOST:PORT/ws", token: "..." | null, mode: "scoreboard" | "control" };
</script>
```

Token injection happens **only** for `/control`, and only after the token was validated.

`[RISK]` `rust-embed` in debug mode reads from disk at runtime; in release it embeds.
That means `cargo build` requires `dist/` to exist. Make `pnpm tauri build` depend on the
Vite build (it does by default via `beforeBuildCommand`), and create an empty `dist/`
placeholder so a bare `cargo check` doesn't fail.

### 4.4 REST handlers

- `GET /api/scoreboard` → `Json(state)`.
- `GET /api/scoreboard/{property}` → plain text; `timer` formatted `MM:SS`;
  unknown → `404`.
- `POST /api/scoreboard` → parse `ScoreboardPatch`; on a serde error return `400` with
  `{"error":"unknown field `teamHomeScre`"}`; otherwise `dispatch(Action::Patch(..))`.
- `POST /api/action` → parse `Action`, dispatch, return the new state.
- Both POSTs require auth when `require_control_token` is on.

## 5. `auth.rs`

```rust
pub async fn check(shared: &Shared, headers: &HeaderMap, query: Option<&str>) -> bool {
    let settings = shared.settings.read().await;
    if !settings.require_control_token { return true; }
    drop(settings);
    let expected = shared.control_token.read().await.clone();
    let presented = query
        .map(str::to_owned)
        .or_else(|| bearer(headers))
        .or_else(|| cookie(headers, "sb_token"));
    matches!(presented, Some(t) if t.as_bytes().ct_eq(expected.as_bytes()).into())
}
```

- Token: `rand::rngs::OsRng` → 16 bytes → hex.
- `ct_eq` requires equal lengths; short-circuit on length mismatch _after_ the comparison,
  or just compare fixed-size arrays.
- `GET /control?t=<valid>` responds with
  `Set-Cookie: sb_token=<token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
  and serves the page. Invalid/absent token → `401` with a small "ask the operator for the
  link" page.
- Never write the token to `tracing` output.

## 6. `settings.rs`

```rust
pub fn path(app: &AppHandle) -> PathBuf   // app_config_dir()/settings.json
pub fn load(app: &AppHandle) -> Settings  // never fails; falls back to Default
pub fn save(app: &AppHandle, s: &Settings) -> anyhow::Result<()>
```

- `load`: read → `serde_json::from_str`. On parse error, rename the file to
  `settings.corrupt-<unix_ts>.json`, log a warning, return `Settings::default()`.
- `save`: **atomic** — write to `settings.json.tmp`, `fsync`, then `rename`. `[NEW]`
  The Electron version truncates the real file and can leave it empty on a crash.
- Debounce: coalesce saves triggered by rapid UI edits (e.g. typing a team name) with a
  500 ms timer.
- On startup, seed `ScoreboardState` from persisted settings (team names/colours/prefix/
  loadouts) `[NEW]`.

## 7. `net.rs`

```rust
pub fn lan_addresses() -> Vec<LanAddress>
```

`if_addrs::get_if_addrs()`, keep IPv4, drop loopback and link-local (`169.254.0.0/16`),
sort so `192.168.*` and `10.*` come first. Return `{ name, address }`.

`[RISK]` Note from the existing repo memory: `localhost:3001` may resolve to a separate
IPv6 listener on the dev machine. Bind `0.0.0.0` and always display/test the explicit IPv4
URLs. Optionally also bind `[::]` — but keep the displayed URLs IPv4.

## 7bis. `windows.rs` — window manager `[NEW]`

Every secondary window is a singleton created on demand. See doc 01 §9.2 for the `open()`
reference implementation and doc 01 ©7 for the size table.

```rust
pub enum AppWindow { Settings, Outputs, Recording, VideoGenerator, About }

impl AppWindow {
    pub fn label(self) -> &'static str;   // "settings", "outputs", ...
    pub fn url(self) -> &'static str;     // "settings.html", ...
    pub fn title(self) -> &'static str;   // "Settings", "Outputs & Sharing", ...
    pub fn size(self) -> (f64, f64);
    pub fn min_size(self) -> (f64, f64);
}

pub fn open(app: &AppHandle, which: AppWindow) -> tauri::Result<()>;
pub fn close(app: &AppHandle, which: AppWindow) -> tauri::Result<()>;
pub fn list_open(app: &AppHandle) -> Vec<AppWindow>;
```

Responsibilities:

- Focus-if-open, otherwise build. Never allow two instances of a label.
- Restore `settings.window_geometry[label]` when present; clamp to a visible monitor with
  `app.available_monitors()` before applying, otherwise a window saved on a now-absent
  second screen is unreachable. `[RISK]`
- Register a `WindowEvent::Moved | Resized` handler that debounces 500 ms and persists
  geometry.
- On `WindowEvent::CloseRequested` for a feature window, emit `window:closed`.
- On `main` closing, close everything and exit.

## 7ter. `menu.rs` — native menu bar `[NEW]`

```rust
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let file = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("open:settings", "Settings…")
            .accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .quit()
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("open:outputs", "Outputs & Sharing…")
            .accelerator("CmdOrCtrl+O").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("view:zoom-in", "Zoom In")
            .accelerator("CmdOrCtrl+Plus").build(app)?)
        .item(&MenuItemBuilder::with_id("view:zoom-out", "Zoom Out")
            .accelerator("CmdOrCtrl+-").build(app)?)
        .item(&MenuItemBuilder::with_id("view:zoom-reset", "Reset Zoom")
            .accelerator("CmdOrCtrl+0").build(app)?)
        .build()?;

    // Tools is assembled conditionally — see below
    let tools = build_tools_menu(app)?;
    let help  = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("help:docs", "Documentation").build(app)?)
        .item(&MenuItemBuilder::with_id("open:about", "About").build(app)?)
        .build()?;

    MenuBuilder::new(app).items(&[&file, &view, &tools, &help]).build()
}
```

Attach it to the main window only:

```rust
let menu = menu::build(app.handle())?;
app.get_webview_window("main").unwrap().set_menu(menu)?;
```

`[RISK]` Do **not** call `app.set_menu(...)`. On Windows and Linux that applies the menu
to windows created afterwards, which would put a menu bar on the frameless overlay
windows.

### Event routing

```rust
app.on_menu_event(|app, event| match event.id().as_ref() {
    "open:settings"   => { let _ = windows::open(app, AppWindow::Settings); }
    "open:outputs"    => { let _ = windows::open(app, AppWindow::Outputs); }
    "open:recording"  => { let _ = windows::open(app, AppWindow::Recording); }
    "open:video"      => { let _ = windows::open(app, AppWindow::VideoGenerator); }
    "open:about"      => { let _ = windows::open(app, AppWindow::About); }
    "tools:overlay"   => { let _ = overlay::toggle(app); }
    "view:zoom-in"    => zoom(app, 0.1),
    "view:zoom-out"   => zoom(app, -0.1),
    "view:zoom-reset" => set_zoom(app, 1.0),
    "help:docs"       => { let _ = app.opener().open_url(DOCS_URL, None::<&str>); }
    _ => {}
});
```

- Zoom applies to the focused window via `WebviewWindow::set_zoom`, clamped to
  `0.5..=2.0`, and the level is persisted per window label. Requires the
  `core:webview:allow-set-webview-zoom` permission in the capability.
- `tools:overlay` is a `CheckMenuItem`. Keep its check state in sync by updating it from
  the `overlay:opened` / `overlay:closed` handlers — the overlay can also be closed by
  clicking the window's X, and a stale check mark is a bug report waiting to happen.
- Menu items for features compiled out are never added:

```rust
fn build_tools_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    let mut b = SubmenuBuilder::new(app, "Tools");
    #[cfg(feature = "overlay")]
    { b = b.item(&CheckMenuItemBuilder::with_id("tools:overlay", "Overlay Mode")
            .accelerator("F9").build(app)?).separator(); }
    #[cfg(feature = "recording")]
    { b = b.item(&MenuItemBuilder::with_id("open:recording", "Recording…")
            .accelerator("CmdOrCtrl+R").build(app)?); }
    #[cfg(feature = "video")]
    { b = b.item(&MenuItemBuilder::with_id("open:video", "Video Generator…").build(app)?); }
    b.build()
}
```

`[RISK]` `Ctrl+R` as a menu accelerator will shadow the webview's reload in dev builds.
That is fine in release; in debug, register it only when `cfg!(not(debug_assertions))`, or
you will lose reload while developing.

## 8. `lib.rs` — wiring

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") { let _ = w.set_focus(); }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            tracing_subscriber::fmt().with_env_filter("info").init();

            let settings = settings::load(app.handle());
            let shared = Arc::new(AppState::new(settings, app.handle().clone()));
            app.manage(shared.clone());

            let port = settings.server_port;
            tauri::async_runtime::spawn(async move {
                match server::start(shared.clone(), port).await {
                    Ok(p)  => shared.set_server_port(p).await,
                    Err(e) => tracing::error!(?e, "server failed to start"),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::sb_get_state,
            commands::sb_dispatch,
            commands::server_get_info,
            commands::server_get_status,
            commands::server_regenerate_token,
            commands::settings_get,
            commands::settings_set,
            commands::buzzer_get_track,
            commands::buzzer_select_track,
            commands::buzzer_clear_track,
            commands::window_open,
            commands::window_close,
            commands::window_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`main.rs` is three lines: `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] fn main() { app_lib::run() }`.

## 9. Capabilities

`src-tauri/capabilities/main.json`:

```json
{
	"$schema": "../gen/schemas/desktop-schema.json",
	"identifier": "main-capability",
	"windows": ["main", "settings", "outputs", "recording", "video-generator", "about"],
	"permissions": [
		"core:default",
		"core:window:allow-start-dragging",
		"core:window:allow-close",
		"core:webview:allow-set-webview-zoom",
		"dialog:allow-open",
		"opener:allow-open-url"
	]
}
```

The overlay windows get a **narrower** capability (doc 05). Do not grant `fs:*` — the
frontend never touches the filesystem directly.

## 10. Error handling

```rust
#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("invalid color: {0}")] InvalidColor(String),
    #[error("invalid field {field}: {reason}")] InvalidField { field: &'static str, reason: String },
    #[error("io: {0}")] Io(#[from] std::io::Error),
    #[error("{0}")] Other(String),
}
```

Commands return `Result<T, String>` (`.map_err(|e| e.to_string())`) because Tauri
serializes the error to JS. Log the full error with `tracing` and return a
user-presentable message.

## 11. Logging

`tracing` + `tracing_subscriber` with an env filter, writing to stderr in dev and to
`app_log_dir()/scoreboard.log` (rolling, keep 5 files) in release. Log: server start/port,
WS connect/disconnect with peer IP, auth failures, settings load/save errors, timer
start/stop. `[NEW]` — the Electron app only has `console.log`.

## 12. Backend test checklist

- `dispatch` on each `Action` variant, asserting the resulting state and `revision` bump.
- Patch validation rejects bad colours/empty names/unknown fields.
- Timer engine tests from §3.5.
- axum integration tests with `tower::ServiceExt::oneshot` for every route, both with and
  without a token.
- WS test: connect, receive initial state, send a command, receive the update.
- Settings round-trip, corrupt-file recovery, atomic write.
