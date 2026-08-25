//! WebSocket endpoint at `/ws` (tauri-rebuild doc 03 §4.2, doc 02 §4).
//!
//! Every client gets a full `state` frame on connect and after every
//! mutation — no deltas. A lagging broadcast receiver is resynced with a
//! fresh full state. Commands are rate-limited per connection.

use std::time::{Duration, Instant};

use axum::extract::ws::{CloseCode, CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{RawQuery, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::broadcast::error::RecvError;

use super::auth::{self, Authorization};
use crate::state::{Action, ScoreboardState, ServerEvent, Shared};

/// Server-side heartbeat interval (doc 02 §4.2).
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
/// Rate limit: 30 commands per second per connection, token bucket.
const RATE_LIMIT_CAPACITY: u32 = 30;
const RATE_LIMIT_REFILL: Duration = Duration::from_secs(1);

/// `1008 Policy Violation` — rate-limited clients (doc 02 §4.2).
const CLOSE_RATE_LIMITED: CloseCode = 1008;
/// `1003 Unsupported Data` — unparseable frames (doc 02 §4.2).
const CLOSE_BAD_FRAME: CloseCode = 1003;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum ClientFrame {
    /// `Action` is internally tagged (`{"action": ..., "data": ...}`), so
    /// it cannot be flattened into this externally tagged envelope —
    /// capture it raw and deserialize in a second step.
    Command(serde_json::Value),
    Ping,
}

pub async fn handler(
    ws: WebSocketUpgrade,
    State(shared): State<Shared>,
    headers: HeaderMap,
    RawQuery(raw_query): RawQuery,
) -> impl IntoResponse {
    let query_token = auth::query_token(raw_query.as_deref()).map(str::to_owned);
    let authorization = auth::check(&shared, &headers, query_token.as_deref()).await;
    ws.on_upgrade(move |socket| client_loop(socket, shared, authorization))
}

/// Decrements the client gauge on drop, even if the loop panics — a
/// panicking or abruptly closed connection cannot leak the count [NEW].
struct ClientGuard {
    shared: Shared,
    authorization: Option<Authorization>,
}

impl ClientGuard {
    async fn downgrade(&mut self) {
        if let Some(authorization) = self.authorization.take() {
            self.shared.ws_client_deauthorized(authorization).await;
        }
    }
}

impl Drop for ClientGuard {
    fn drop(&mut self) {
        let shared = self.shared.clone();
        let authorization = self.authorization;
        // `Drop` is sync; spawn the counter update + status emission.
        tauri::async_runtime::spawn(async move {
            shared.ws_client_disconnected(authorization).await;
        });
    }
}

async fn client_loop(socket: WebSocket, shared: Shared, authorization: Option<Authorization>) {
    let (mut sink, mut stream) = socket.split();
    // Subscribe before validating the generation so regeneration cannot land
    // in the gap and leave an old authorization active.
    let mut events = shared.events.subscribe();
    let mut authorization = shared.ws_client_connected(authorization).await;
    let mut guard = ClientGuard {
        shared: shared.clone(),
        authorization,
    };
    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    let mut bucket = TokenBucket::new();

    // 1. Send the current state frame immediately after the upgrade.
    if send_state(&mut sink, &shared.current().await)
        .await
        .is_err()
    {
        return;
    }
    if send_authorization(&mut sink, authorization.is_some())
        .await
        .is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            // Broadcast fanout: every mutation reaches every client.
            event = events.recv() => {
                match event {
                    Ok(ServerEvent::State(state)) => {
                        if send_state(&mut sink, &state).await.is_err() { break; }
                    }
                    Ok(ServerEvent::TimerFinished) => {
                        if send_json(&mut sink, &serde_json::json!({
                            "type": "event", "event": "timer-finished"
                        })).await.is_err() { break; }
                    }
                    Ok(ServerEvent::Buzzer) => {
                        if send_json(&mut sink, &serde_json::json!({
                            "type": "event", "event": "buzzer"
                        })).await.is_err() { break; }
                    }
                    Ok(ServerEvent::ControlTokenRegenerated(generation)) => {
                        if authorization.is_some_and(|current| current.generation() != generation) {
                            authorization = None;
                            guard.downgrade().await;
                            if send_authorization(&mut sink, false).await.is_err() { break; }
                        }
                    }
                    // Desktop-only: LAN clients learn everything they need
                    // from the full-state frames (a preset load reaches them
                    // as `settings:changed` + a state frame).
                    Ok(ServerEvent::Window(..) | ServerEvent::Settings(_) | ServerEvent::Presets(_)) => {}
                    // A lagging client missed frames: resync with a fresh
                    // full state instead of replaying the backlog.
                    Err(RecvError::Lagged(skipped)) => {
                        tracing::debug!(skipped, "ws client lagged; resyncing");
                        if authorization.is_some_and(|current| !shared.authorization_is_current(current)) {
                            authorization = None;
                            guard.downgrade().await;
                        }
                        if send_state(&mut sink, &shared.current().await).await.is_err() { break; }
                    }
                    Err(RecvError::Closed) => break,
                }
            }
            // Incoming commands.
            frame = stream.next() => {
                match frame {
                    Some(Ok(Message::Text(text))) => {
                        if !bucket.take() {
                            let _ = send_error(&mut sink, "rate-limited", "too many commands").await;
                            close(&mut sink, CLOSE_RATE_LIMITED, "rate limited").await;
                            // Give tungstenite a moment to flush the close
                            // frame before the socket is dropped, or the
                            // peer sees an abnormal (1006) close.
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            break;
                        }
                        match serde_json::from_str::<ClientFrame>(&text) {
                            Ok(ClientFrame::Command(raw)) => {
                                if authorization.is_some_and(|current| !shared.authorization_is_current(current)) {
                                    authorization = None;
                                    guard.downgrade().await;
                                }
                                let Some(current_authorization) = authorization else {
                                    if send_error(&mut sink, "unauthorized", "control token required").await.is_err() {
                                        break;
                                    }
                                    continue;
                                };
                                match serde_json::from_value::<Action>(raw) {
                                    Ok(action) => {
                                        match shared.dispatch_authorized(current_authorization, action).await {
                                            Ok(Some(_)) => {}
                                            Ok(None) => {
                                                authorization = None;
                                                guard.downgrade().await;
                                                if send_error(&mut sink, "unauthorized", "control token required").await.is_err() {
                                                    break;
                                                }
                                            }
                                            Err(error) => {
                                                if send_error(&mut sink, "bad-request", &error.to_string()).await.is_err() {
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    Err(error) => {
                                        tracing::debug!(?error, "bad ws action; closing");
                                        let _ = send_error(&mut sink, "bad-request", "invalid action").await;
                                        close(&mut sink, CLOSE_BAD_FRAME, "bad action").await;
                                        tokio::time::sleep(Duration::from_millis(50)).await;
                                        break;
                                    }
                                }
                            },
                            Ok(ClientFrame::Ping) => {
                                if send_json(&mut sink, &serde_json::json!({ "type": "ping" })).await.is_err() {
                                    break;
                                }
                            }
                            Err(error) => {
                                tracing::debug!(?error, "unparseable ws frame; closing");
                                let _ = send_error(&mut sink, "bad-request", "unparseable frame").await;
                                close(&mut sink, CLOSE_BAD_FRAME, "bad frame").await;
                                tokio::time::sleep(Duration::from_millis(50)).await;
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {} // binary frames are not part of the protocol
                    Some(Err(error)) => {
                        tracing::debug!(?error, "ws receive error; closing");
                        break;
                    }
                }
            }
            // Heartbeat: axum/tungstenite answers pings automatically, and
            // a dead peer fails the next send, which breaks the loop.
            _ = heartbeat.tick() => {
                if sink.send(Message::Ping(Vec::new().into())).await.is_err() { break; }
            }
        }
    }
}

async fn send_state(
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    state: &ScoreboardState,
) -> Result<(), axum::Error> {
    send_json(sink, &serde_json::json!({ "type": "state", "data": state })).await
}

async fn send_authorization(
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    authorized: bool,
) -> Result<(), axum::Error> {
    send_json(
        sink,
        &serde_json::json!({ "type": "authorization", "authorized": authorized }),
    )
    .await
}

async fn send_error(
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    code: &str,
    message: &str,
) -> Result<(), axum::Error> {
    send_json(
        sink,
        &serde_json::json!({ "type": "error", "code": code, "message": message }),
    )
    .await
}

async fn send_json(
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    value: &serde_json::Value,
) -> Result<(), axum::Error> {
    sink.send(Message::Text(value.to_string().into())).await
}

async fn close(
    sink: &mut futures::stream::SplitSink<WebSocket, Message>,
    code: CloseCode,
    reason: &str,
) {
    let _ = sink
        .send(Message::Close(Some(CloseFrame {
            code,
            reason: reason.into(),
        })))
        .await;
    // Flush the close frame before the socket drops, or the peer sees an
    // abnormal (1006) close instead of the protocol code.
    let _ = sink.close().await;
}

/// Token bucket: 30 tokens, refilled to full once per second.
struct TokenBucket {
    tokens: u32,
    last_refill: Instant,
}

impl TokenBucket {
    fn new() -> Self {
        Self {
            tokens: RATE_LIMIT_CAPACITY,
            last_refill: Instant::now(),
        }
    }

    fn take(&mut self) -> bool {
        if self.last_refill.elapsed() >= RATE_LIMIT_REFILL {
            self.tokens = RATE_LIMIT_CAPACITY;
            self.last_refill = Instant::now();
        }
        if self.tokens == 0 {
            return false;
        }
        self.tokens -= 1;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_bucket_allows_burst_then_blocks() {
        let mut bucket = TokenBucket::new();
        for _ in 0..RATE_LIMIT_CAPACITY {
            assert!(bucket.take());
        }
        assert!(!bucket.take());
    }

    #[test]
    fn client_frame_parses_commands_and_ping() {
        let frame: ClientFrame =
            serde_json::from_str(r#"{"type":"command","action":"score-home-inc"}"#).unwrap();
        let ClientFrame::Command(raw) = frame else {
            panic!("expected command frame");
        };
        assert!(matches!(
            serde_json::from_value::<Action>(raw).unwrap(),
            Action::ScoreHomeInc
        ));

        let frame: ClientFrame = serde_json::from_str(
            r#"{"type":"command","action":"timer-set","data":{"seconds":90}}"#,
        )
        .unwrap();
        let ClientFrame::Command(raw) = frame else {
            panic!("expected command frame");
        };
        assert!(matches!(
            serde_json::from_value::<Action>(raw).unwrap(),
            Action::TimerSet { seconds: 90 }
        ));

        let frame: ClientFrame = serde_json::from_str(r#"{"type":"ping"}"#).unwrap();
        assert!(matches!(frame, ClientFrame::Ping));
        assert!(serde_json::from_str::<ClientFrame>(r#"{"type":"nope"}"#).is_err());

        // Well-formed envelope, malformed action.
        let frame: ClientFrame =
            serde_json::from_str(r#"{"type":"command","action":"fly-to-the-moon"}"#).unwrap();
        let ClientFrame::Command(raw) = frame else {
            panic!("expected command frame");
        };
        assert!(serde_json::from_value::<Action>(raw).is_err());
    }

    async fn receive_json(
        socket: &mut tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    ) -> serde_json::Value {
        loop {
            let message = socket.next().await.unwrap().unwrap();
            if let tokio_tungstenite::tungstenite::Message::Text(text) = message {
                return serde_json::from_str(&text).unwrap();
            }
        }
    }

    #[tokio::test]
    async fn sockets_are_read_only_without_auth_and_revoked_on_regeneration() {
        use tokio_tungstenite::connect_async;
        use tokio_tungstenite::tungstenite::client::IntoClientRequest;
        use tokio_tungstenite::tungstenite::Message as ClientMessage;

        let shared = crate::state::AppState::new();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let app = crate::server::router(shared.clone());
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let (mut read_only, _) = connect_async(format!("ws://{address}/ws")).await.unwrap();
        let initial = receive_json(&mut read_only).await;
        assert_eq!(initial["type"], "state");
        assert_eq!(initial["data"]["teamHomeScore"], 0);
        assert_eq!(receive_json(&mut read_only).await["authorized"], false);

        read_only
            .send(ClientMessage::Text(
                r#"{"type":"command","action":"score-home-inc"}"#.into(),
            ))
            .await
            .unwrap();
        let error = receive_json(&mut read_only).await;
        assert_eq!(error["code"], "unauthorized");
        assert_eq!(shared.current().await.team_home_score, 0);

        let token = shared.control_token_for_test();
        let (mut authorized, _) = connect_async(format!("ws://{address}/ws?t={token}"))
            .await
            .unwrap();
        assert_eq!(receive_json(&mut authorized).await["type"], "state");
        assert_eq!(receive_json(&mut authorized).await["authorized"], true);
        assert_eq!(shared.server_status().ws_clients, 2);
        assert_eq!(shared.server_status().authorized_clients, 1);

        authorized
            .send(ClientMessage::Text(
                r#"{"type":"command","action":"score-home-inc"}"#.into(),
            ))
            .await
            .unwrap();
        let update = receive_json(&mut authorized).await;
        assert_eq!(update["type"], "state");
        assert_eq!(update["data"]["teamHomeScore"], 1);
        assert_eq!(shared.current().await.team_home_score, 1);

        shared.regenerate_control_token().await;
        assert_eq!(shared.server_status().authorized_clients, 0);
        assert_eq!(receive_json(&mut authorized).await["authorized"], false);
        authorized
            .send(ClientMessage::Text(
                r#"{"type":"command","action":"score-home-inc"}"#.into(),
            ))
            .await
            .unwrap();
        let error = receive_json(&mut authorized).await;
        assert_eq!(error["code"], "unauthorized");
        assert_eq!(shared.current().await.team_home_score, 1);
        assert_eq!(shared.server_status().authorized_clients, 0);

        let new_token = shared.control_token_for_test();
        let mut cookie_request = format!("ws://{address}/ws").into_client_request().unwrap();
        cookie_request.headers_mut().insert(
            axum::http::header::COOKIE,
            axum::http::HeaderValue::from_str(&format!("sb_token={new_token}")).unwrap(),
        );
        let (mut cookie_authorized, _) = connect_async(cookie_request).await.unwrap();
        assert_eq!(receive_json(&mut cookie_authorized).await["type"], "state");
        assert_eq!(
            receive_json(&mut cookie_authorized).await["authorized"],
            true
        );
        assert_eq!(shared.server_status().authorized_clients, 1);

        cookie_authorized
            .send(ClientMessage::Text(
                r#"{"type":"command","action":"score-away-inc"}"#.into(),
            ))
            .await
            .unwrap();
        let update = receive_json(&mut cookie_authorized).await;
        assert_eq!(update["data"]["teamAwayScore"], 1);

        server.abort();
    }
}
