//! P9 cross-surface conformance for the Scoreboard Designer.
//!
//! Drives the real LAN server, layout service, timer engine and recorder
//! together, so the feature-contract scenarios are proven across surfaces
//! rather than per module: Apply while the timer runs (both directions),
//! fields omitted from the published layout still updating through the
//! controls, `/api/scoreboard/*` and recordings, and Classic restoration.

use std::path::PathBuf;
use std::time::Duration;

use futures::{SinkExt, StreamExt};
use scoreboard_server_lib::layouts::{LayoutDefinition, LayoutService, SavedLayoutSelection};
use scoreboard_server_lib::presets::PresetLibrary;
use scoreboard_server_lib::recording;
use scoreboard_server_lib::settings::Settings;
use scoreboard_server_lib::state::{Action, AppPrefs, AppState, Shared, TimerDirection};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite::Message;

type Socket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

struct Harness {
    shared: Shared,
    port: u16,
    token: String,
    directory: PathBuf,
}

impl Harness {
    async fn start(tag: &str) -> Self {
        let directory =
            std::env::temp_dir().join(format!("sb-conformance-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let shared = AppState::with_prefs(
            AppPrefs::default(),
            Settings::default(),
            PresetLibrary::empty(),
            LayoutService::load_from(directory.join("layouts.json")),
        );
        // Port 0 binds an ephemeral port, so a running app is never disturbed.
        let (port, _handle) = scoreboard_server_lib::start_server(shared.clone(), 0)
            .await
            .unwrap();
        shared.set_server_port(port).await;
        let control_url = shared.server_info().await.control_url;
        let token = control_url
            .split_once("t=")
            .map(|(_, token)| token.to_owned())
            .expect("control URL carries a token");
        Self {
            shared,
            port,
            token,
            directory,
        }
    }

    async fn connect(&self, authorized: bool) -> Socket {
        let url = if authorized {
            format!("ws://127.0.0.1:{}/ws?t={}", self.port, self.token)
        } else {
            format!("ws://127.0.0.1:{}/ws", self.port)
        };
        let (mut socket, _) = tokio_tungstenite::connect_async(url).await.unwrap();
        assert_eq!(next_frame(&mut socket).await["type"], "state");
        assert_eq!(
            next_frame(&mut socket).await["authorized"],
            Value::Bool(authorized)
        );
        assert_eq!(next_frame(&mut socket).await["type"], "layout");
        socket
    }

    /// `GET /api/scoreboard/{property}` — the `/value/*` data source.
    async fn property(&self, property: &str) -> String {
        let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", self.port))
            .await
            .unwrap();
        stream
            .write_all(
                format!(
                    "GET /api/scoreboard/{property} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).await.unwrap();
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        response
            .split_once("\r\n\r\n")
            .map(|(_, body)| body.to_owned())
            .unwrap()
    }

    /// Saves `definition` and publishes it, returning the publication revision.
    async fn save_and_apply(&self, name: &str, definition: LayoutDefinition) -> u64 {
        let created = self
            .shared
            .layouts
            .create(name.into(), definition)
            .await
            .unwrap();
        let entry = created
            .library
            .entries
            .iter()
            .find(|entry| entry.name == name)
            .unwrap();
        let published = self.shared.layouts.snapshot().published.revision;
        self.shared
            .layouts
            .apply(
                SavedLayoutSelection::Custom {
                    id: entry.id.clone(),
                    expected_revision: entry.revision,
                },
                published,
            )
            .await
            .unwrap()
            .library
            .published
            .revision
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        self.shared.layouts.shutdown();
        std::fs::remove_dir_all(&self.directory).ok();
    }
}

async fn next_frame(socket: &mut Socket) -> Value {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("timed out waiting for a WebSocket frame")
            .unwrap()
            .unwrap();
        if let Message::Text(text) = message {
            return serde_json::from_str(&text).unwrap();
        }
    }
}

async fn wait_for_frame(socket: &mut Socket, predicate: impl Fn(&Value) -> bool) -> Value {
    loop {
        let frame = next_frame(socket).await;
        if predicate(&frame) {
            return frame;
        }
    }
}

async fn command(socket: &mut Socket, action: Value) {
    let mut frame = json!({ "type": "command" });
    frame
        .as_object_mut()
        .unwrap()
        .extend(action.as_object().unwrap().clone());
    socket
        .send(Message::Text(frame.to_string().into()))
        .await
        .unwrap();
}

fn uuid_v4() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn literal(hex: &str, alpha: f64) -> Value {
    json!({ "kind": "literal", "hex": hex, "alpha": alpha })
}

fn value_node(binding: &str, x: i32) -> Value {
    json!({
        "kind": "value",
        "id": uuid_v4(),
        "hidden": false,
        "frame": {
            "x": x, "y": 8,
            "width": { "kind": "fixed", "pixels": 120 },
            "height": { "kind": "fixed", "pixels": 48 }
        },
        "box": {
            "background": literal("#111827", 1.0),
            "borderColor": literal("#000000", 0.0),
            "borderWidth": 0,
            "radius": 0
        },
        "binding": binding,
        "textStyle": {
            "font": { "family": "anton", "weight": 400 },
            "fontSize": 32,
            "color": { "kind": "team", "team": "home", "alpha": 1.0 },
            "horizontalAlign": "center",
            "verticalAlign": "center"
        },
        "animation": "none"
    })
}

/// Only the timer and the home score: every away/period field is omitted.
fn partial_definition() -> LayoutDefinition {
    let root_id = uuid_v4();
    let children = vec![value_node("timer", 8), value_node("home-score", 136)];
    let mut layers = vec![json!({ "nodeId": root_id, "label": "Root", "locked": false })];
    for (index, child) in children.iter().enumerate() {
        layers.push(
            json!({ "nodeId": child["id"], "label": format!("Value {index}"), "locked": false }),
        );
    }
    serde_json::from_value(json!({
        "root": {
            "kind": "root",
            "id": root_id,
            "width": 264,
            "height": 64,
            "background": literal("#000000", 0.0),
            "children": children
        },
        "editor": { "layers": layers }
    }))
    .unwrap()
}

async fn apply_while_timer_runs(direction: TimerDirection) {
    let harness = Harness::start("timer").await;
    let mut control = harness.connect(true).await;
    let mut output = harness.connect(false).await;
    let shared = &harness.shared;

    shared
        .dispatch(Action::TimerSetDirection { direction })
        .await
        .unwrap();
    let start = match direction {
        TimerDirection::Down => 600,
        TimerDirection::Up => 30,
    };
    shared
        .dispatch(Action::TimerSet { seconds: start })
        .await
        .unwrap();
    shared.dispatch(Action::ScoreHomeInc).await.unwrap();
    shared.dispatch(Action::TimerStart).await.unwrap();
    let before = shared.current().await;
    assert!(before.is_timer_running);

    let revision = harness
        .save_and_apply("Partial", partial_definition())
        .await;
    let layout = wait_for_frame(&mut output, |frame| frame["type"] == "layout").await;
    assert_eq!(layout["data"]["revision"], revision);
    assert_eq!(layout["data"]["selection"]["kind"], "custom");

    // Appearance changed; the running timer, direction and scores did not.
    let after_apply = shared.current().await;
    assert!(after_apply.is_timer_running);
    assert_eq!(after_apply.timer_direction, direction);
    assert_eq!(after_apply.team_home_score, 1);
    assert_eq!(after_apply.half, before.half);

    // The timer keeps ticking in its direction and reaches LAN outputs.
    let ticked = wait_for_frame(&mut output, |frame| {
        frame["type"] == "state" && frame["data"]["timer"] != json!(after_apply.timer)
    })
    .await;
    let seconds = ticked["data"]["timer"].as_u64().unwrap() as u32;
    match direction {
        TimerDirection::Down => assert!(seconds < after_apply.timer, "{seconds}"),
        TimerDirection::Up => assert!(seconds > after_apply.timer, "{seconds}"),
    }
    assert_eq!(ticked["data"]["isTimerRunning"], true);
    assert_eq!(
        harness.property("isTimerRunning").await,
        "true",
        "/value/* stays independent of the published layout"
    );

    // Omitted away fields still work through the phone remote and `/value/*`.
    command(&mut control, json!({ "action": "score-away-inc" })).await;
    let updated = wait_for_frame(&mut output, |frame| {
        frame["type"] == "state" && frame["data"]["teamAwayScore"] == 1
    })
    .await;
    assert_eq!(updated["data"]["teamHomeScore"], 1);
    assert_eq!(harness.property("teamAwayScore").await, "1");
    command(
        &mut control,
        json!({ "action": "patch", "data": { "teamAwayName": "VISITORS" } }),
    )
    .await;
    wait_for_frame(&mut output, |frame| {
        frame["type"] == "state" && frame["data"]["teamAwayName"] == "VISITORS"
    })
    .await;
    assert_eq!(harness.property("teamAwayName").await, "VISITORS");

    shared.dispatch(Action::TimerPause).await.unwrap();
}

#[tokio::test]
async fn apply_while_countdown_runs_keeps_timer_and_omitted_fields_live() {
    apply_while_timer_runs(TimerDirection::Down).await;
}

#[tokio::test]
async fn apply_while_count_up_runs_keeps_timer_and_omitted_fields_live() {
    apply_while_timer_runs(TimerDirection::Up).await;
}

#[tokio::test]
async fn recording_captures_omitted_fields_and_ignores_layout_changes() {
    let harness = Harness::start("recording").await;
    let shared = &harness.shared;
    let output_dir = harness.directory.join("recordings");
    recording::start(shared, output_dir).await.unwrap();

    harness
        .save_and_apply("Partial", partial_definition())
        .await;
    shared.dispatch(Action::ScoreAwayInc).await.unwrap();
    shared.dispatch(Action::ScoreAwayInc).await.unwrap();
    shared.dispatch(Action::HalfInc).await.unwrap();
    // Classic again mid-recording: still no layout data in the file.
    let published = shared.layouts.snapshot().published.revision;
    shared
        .layouts
        .apply(SavedLayoutSelection::Classic {}, published)
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(1300)).await;
    assert!(recording::status(shared).is_recording);
    let stopped = recording::stop(shared).await.unwrap();
    assert!(stopped.total_snapshots >= 1);

    let parsed = recording::read_recording(std::path::Path::new(&stopped.file_path)).unwrap();
    let last = parsed.snapshots.last().unwrap();
    assert_eq!((last.aw, last.hf), (2, 2));
    let raw = std::fs::read_to_string(&stopped.file_path).unwrap();
    assert!(
        !raw.contains("layout") && !raw.contains("Partial"),
        "recordings must not carry layout data"
    );
}
