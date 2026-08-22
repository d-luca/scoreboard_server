//! Embedded LAN server (tauri-rebuild doc 03 §4, doc 02 §5).
//!
//! One axum router serves the REST API, the WebSocket at `/ws`, and the
//! Vite build embedded with `rust-embed`. OBS Browser Sources, phones and
//! third-party dashboards all talk to this — the Tauri webviews do not.

pub mod assets;
pub mod auth;
pub mod routes;
pub mod ws;

use std::net::{Ipv4Addr, SocketAddr};

use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::state::Shared;

/// How many ports past the preferred one to try before falling back to an
/// ephemeral port. The Electron app crashes on `EADDRINUSE`; we do not.
const PORT_FALLBACK_ATTEMPTS: u16 = 10;

/// Start the HTTP server on `preferred_port` (or the next free one).
/// Returns the port actually bound and the serve task, so the caller can
/// restart the server when the port setting changes (Phase 5).
pub async fn start(
    shared: Shared,
    preferred_port: u16,
) -> anyhow::Result<(u16, tauri::async_runtime::JoinHandle<()>)> {
    let app = router(shared);

    let listener = bind_with_fallback(preferred_port).await?;
    let port = listener.local_addr()?.port();
    tracing::info!(port, "HTTP server listening on 0.0.0.0:{port}");
    let handle = tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, app).await {
            tracing::error!(?error, "HTTP server stopped unexpectedly");
        }
    });
    Ok((port, handle))
}

/// The router, factored out of [`start`] so integration tests can drive it
/// with `tower::ServiceExt::oneshot` without binding a socket.
pub fn router(shared: Shared) -> Router {
    Router::new()
        .route("/health", get(routes::health))
        .route(
            "/api/scoreboard",
            get(routes::get_state).post(routes::post_patch),
        )
        .route("/api/scoreboard/{property}", get(routes::get_property))
        .route("/api/action", post(routes::post_action))
        .route("/ws", get(ws::handler))
        .route("/scoreboard", get(assets::scoreboard_page))
        .route("/control", get(assets::control_page))
        .route("/value/{property}", get(assets::value_page))
        .route("/buzzer.mp3", get(routes::buzzer_audio))
        .fallback(assets::static_handler)
        // Permissive CORS is safe because every write requires the control
        // token; OBS Browser Source needs public reads [PARITY].
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
                .allow_headers([
                    axum::http::header::CONTENT_TYPE,
                    axum::http::header::AUTHORIZATION,
                ]),
        )
        .with_state(shared)
}

/// Try `preferred_port`, then `preferred+1 ..= preferred+10`, then an
/// ephemeral port (`0`). All on `0.0.0.0` so LAN clients can reach the app.
///
/// `[RISK]` Binding `0.0.0.0` triggers the Windows Firewall prompt on first
/// run; "Allow on private networks" is required (doc 03 §4.1).
async fn bind_with_fallback(preferred: u16) -> anyhow::Result<tokio::net::TcpListener> {
    for offset in 0..=PORT_FALLBACK_ATTEMPTS {
        let Some(port) = preferred.checked_add(offset) else {
            break;
        };
        match tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, port))).await {
            Ok(listener) => {
                if port != preferred {
                    tracing::warn!(
                        preferred,
                        fallback = port,
                        "preferred port occupied; bound fallback port"
                    );
                }
                return Ok(listener);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => continue,
            Err(error) => return Err(error.into()),
        }
    }
    let listener =
        tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0))).await?;
    tracing::warn!(
        preferred,
        fallback = listener.local_addr()?.port(),
        "all fallback ports occupied; bound ephemeral port"
    );
    Ok(listener)
}

#[cfg(test)]
mod tests {
    use super::*;
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::state::AppState;

    async fn body_string(response: axum::response::Response) -> String {
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    fn get(uri: &str) -> axum::http::Request<axum::body::Body> {
        axum::http::Request::builder()
            .uri(uri)
            .body(axum::body::Body::empty())
            .unwrap()
    }

    fn post(uri: &str, body: &str) -> axum::http::Request<axum::body::Body> {
        axum::http::Request::builder()
            .method("POST")
            .uri(uri)
            .header("content-type", "application/json")
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    }

    fn authorized_post(
        shared: &Shared,
        uri: &str,
        body: &str,
    ) -> axum::http::Request<axum::body::Body> {
        let token = shared.control_token_for_test();
        axum::http::Request::builder()
            .method("POST")
            .uri(uri)
            .header("content-type", "application/json")
            .header("authorization", format!("Bearer {token}"))
            .body(axum::body::Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn health_reports_ok_and_version() {
        let app = router(AppState::new());
        let response = app.oneshot(get("/health")).await.unwrap();
        assert_eq!(response.status(), 200);
        let body = body_string(response).await;
        assert!(body.contains("\"status\":\"ok\""), "{body}");
        assert!(body.contains("\"version\""), "{body}");
    }

    #[tokio::test]
    async fn get_scoreboard_returns_full_state() {
        let app = router(AppState::new());
        let response = app.oneshot(get("/api/scoreboard")).await.unwrap();
        assert_eq!(response.status(), 200);
        let body = body_string(response).await;
        assert!(body.contains("\"teamHomeName\":\"HOME\""), "{body}");
        assert!(body.contains("\"timerLoadout1\":900"), "{body}");
    }

    #[tokio::test]
    async fn get_property_formats_timer_and_404s_on_unknown() {
        let app = router(AppState::new());
        let response = app
            .clone()
            .oneshot(get("/api/scoreboard/timer"))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(body_string(response).await, "00:00");

        let response = app
            .oneshot(get("/api/scoreboard/teamHomeScre"))
            .await
            .unwrap();
        assert_eq!(response.status(), 404);
    }

    #[tokio::test]
    async fn post_patch_updates_state() {
        let shared = AppState::new();
        let app = router(shared.clone());
        let response = app
            .oneshot(authorized_post(
                &shared,
                "/api/scoreboard",
                r#"{"teamHomeScore":3}"#,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let body = body_string(response).await;
        assert!(body.contains("\"success\":true"), "{body}");
        assert_eq!(shared.current().await.team_home_score, 3);
    }

    #[tokio::test]
    async fn post_patch_rejects_unknown_field_with_400() {
        let shared = AppState::new();
        let app = router(shared.clone());
        let response = app
            .oneshot(authorized_post(
                &shared,
                "/api/scoreboard",
                r#"{"teamHomeScre":3}"#,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
        let body = body_string(response).await;
        assert!(body.contains("unknown field `teamHomeScre`"), "{body}");
    }

    #[tokio::test]
    async fn post_patch_rejects_invalid_values_atomically() {
        let shared = AppState::new();
        let app = router(shared.clone());
        let response = app
            .oneshot(authorized_post(
                &shared,
                "/api/scoreboard",
                r#"{"teamHomeName":"LIONS","teamHomeColor":"red"}"#,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
        let state = shared.current().await;
        assert_eq!(state.team_home_name, "HOME");
        assert_eq!(state.team_home_color, "#00ff00");
    }

    #[tokio::test]
    async fn post_action_dispatches_and_returns_state() {
        let shared = AppState::new();
        let app = router(shared.clone());
        let response = app
            .clone()
            .oneshot(authorized_post(
                &shared,
                "/api/action",
                r#"{"action":"score-away-inc"}"#,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(shared.current().await.team_away_score, 1);

        let response = app
            .oneshot(authorized_post(
                &shared,
                "/api/action",
                r#"{"action":"timer-loadout","data":{"slot":9}}"#,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 400);
    }

    #[tokio::test]
    async fn post_routes_reject_missing_or_invalid_auth_without_mutation() {
        let shared = AppState::new();
        let app = router(shared.clone());

        let response = app
            .clone()
            .oneshot(post("/api/scoreboard", r#"{"teamHomeScore":99}"#))
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);

        let request = axum::http::Request::builder()
            .method("POST")
            .uri("/api/action")
            .header("content-type", "application/json")
            .header("authorization", "Bearer invalid")
            .body(axum::body::Body::from(r#"{"action":"score-away-inc"}"#))
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);

        let state = shared.current().await;
        assert_eq!(state.team_home_score, 0);
        assert_eq!(state.team_away_score, 0);
    }

    #[tokio::test]
    async fn post_action_accepts_control_cookie() {
        let shared = AppState::new();
        let token = shared.control_token_for_test();
        let request = axum::http::Request::builder()
            .method("POST")
            .uri("/api/action")
            .header("content-type", "application/json")
            .header("cookie", format!("sb_token={token}"))
            .body(axum::body::Body::from(r#"{"action":"score-home-inc"}"#))
            .unwrap();
        let response = router(shared.clone()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(shared.current().await.team_home_score, 1);
    }

    #[tokio::test]
    async fn control_query_sets_strict_cookie_and_redirects_to_token_free_url() {
        let shared = AppState::new();
        let token = shared.control_token_for_test();
        let app = router(shared);
        let response = app
            .clone()
            .oneshot(get(&format!("/control?t={token}")))
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::SEE_OTHER);
        assert_eq!(
            response
                .headers()
                .get(axum::http::header::LOCATION)
                .and_then(|value| value.to_str().ok()),
            Some("/control")
        );
        let set_cookie = response
            .headers()
            .get(axum::http::header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        assert_eq!(
            set_cookie,
            format!("sb_token={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400")
        );
        assert!(!response
            .headers()
            .get(axum::http::header::LOCATION)
            .unwrap()
            .to_str()
            .unwrap()
            .contains(&token));

        let cookie = set_cookie.split(';').next().unwrap();
        let request = axum::http::Request::builder()
            .uri("/control")
            .header("cookie", cookie)
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn control_without_valid_auth_shows_ask_operator_page() {
        let app = router(AppState::new());
        let response = app.clone().oneshot(get("/control")).await.unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);
        assert!(body_string(response).await.contains("Ask the operator"));

        let response = app
            .clone()
            .oneshot(get("/control?t=invalid"))
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);

        let response = app.oneshot(get("/control?t=%FF")).await.unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn regeneration_replaces_urls_qr_and_rest_credentials() {
        let shared = AppState::new();
        shared.set_server_port(3010).await;
        let old_token = shared.control_token_for_test();
        let old_info = shared.server_info().await;
        let new_info = shared.regenerate_control_token().await;
        let new_token = shared.control_token_for_test();

        assert_ne!(old_token, new_token);
        assert_ne!(old_info.control_url, new_info.control_url);
        assert!(new_info
            .control_url
            .ends_with(&format!("/control?t={new_token}")));
        assert!(new_info.control_qr_svg.contains("<svg"));
        assert!(new_info.token_required);

        let old_request = axum::http::Request::builder()
            .method("POST")
            .uri("/api/action")
            .header("content-type", "application/json")
            .header("authorization", format!("Bearer {old_token}"))
            .body(axum::body::Body::from(r#"{"action":"score-home-inc"}"#))
            .unwrap();
        let app = router(shared.clone());
        let response = app.clone().oneshot(old_request).await.unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::UNAUTHORIZED);

        let response = app
            .oneshot(authorized_post(
                &shared,
                "/api/action",
                r#"{"action":"score-home-inc"}"#,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(shared.current().await.team_home_score, 1);
    }

    #[tokio::test]
    async fn cors_allows_obs_browser_source() {
        let app = router(AppState::new());
        let request = axum::http::Request::builder()
            .method("OPTIONS")
            .uri("/api/scoreboard")
            .header("origin", "http://obs.local")
            .header("access-control-request-method", "POST")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = app.oneshot(request).await.unwrap();
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .and_then(|value| value.to_str().ok()),
            Some("*")
        );
    }

    #[tokio::test]
    async fn value_page_404s_on_unknown_property() {
        let app = router(AppState::new());
        let response = app.oneshot(get("/value/nope")).await.unwrap();
        assert_eq!(response.status(), 404);
    }

    #[tokio::test]
    async fn fallback_ports_are_tried_in_order() {
        // Occupy the preferred port, then the server must bind the next one.
        let blocker = tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0)))
            .await
            .unwrap();
        let preferred = blocker.local_addr().unwrap().port();
        let listener = bind_with_fallback(preferred).await.unwrap();
        assert_ne!(listener.local_addr().unwrap().port(), preferred);
    }

    /* ---- Phase 5: settings-driven behaviour ---- */

    #[tokio::test]
    async fn disabled_token_policy_opens_writes_without_credentials() {
        use crate::settings::{Settings, SettingsPatch};

        let shared = AppState::with_settings(Settings::default(), Default::default());
        // Turn the token requirement off through the same path the Settings
        // window uses.
        shared
            .settings_set(SettingsPatch {
                require_control_token: Some(false),
                ..Default::default()
            })
            .await
            .unwrap();

        let app = router(shared.clone());
        let response = app
            .oneshot(post("/api/scoreboard", r#"{"teamHomeScore":5}"#))
            .await
            .unwrap();
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(shared.current().await.team_home_score, 5);

        // `/control` is served without a token while the policy is off.
        let app = router(shared);
        let response = app.oneshot(get("/control")).await.unwrap();
        assert_ne!(response.status(), axum::http::StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn settings_identity_patch_updates_scoreboard_state() {
        use crate::settings::SettingsPatch;

        let shared = AppState::new();
        shared
            .settings_set(SettingsPatch {
                team_home_name: Some("LIONS".into()),
                team_away_color: Some("#0000FF".into()),
                half_prefix: Some("TEMPO".into()),
                timer_loadouts: Some([60, 120, 180]),
                ..Default::default()
            })
            .await
            .unwrap();

        let sb = shared.current().await;
        assert_eq!(sb.team_home_name, "LIONS");
        assert_eq!(sb.team_away_color, "#0000ff");
        assert_eq!(sb.half_prefix, "TEMPO");
        assert_eq!(sb.timer_loadout1, 60);
        assert_eq!(sb.timer_loadout3, 180);
        // Match-progress fields untouched.
        assert_eq!(sb.team_home_score, 0);
        assert_eq!(sb.half, 1);

        let settings = shared.settings_snapshot().await;
        assert_eq!(settings.team_home_name, "LIONS");
    }

    #[tokio::test]
    async fn remote_identity_patch_is_mirrored_into_settings() {
        let shared = AppState::new();
        let token = shared.control_token_for_test();
        let app = router(shared.clone());
        let response = app
            .oneshot(authorized_post(
                &shared,
                "/api/scoreboard",
                r#"{"teamHomeName":"REMOTE FC"}"#,
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        let _ = token; // silence unused while keeping the auth path obvious

        let settings = shared.settings_snapshot().await;
        assert_eq!(settings.team_home_name, "REMOTE FC");
    }

    #[tokio::test]
    async fn settings_event_is_broadcast_on_settings_set() {
        use crate::settings::SettingsPatch;
        use crate::state::ServerEvent;

        let shared = AppState::new();
        let mut rx = shared.subscribe();
        shared
            .settings_set(SettingsPatch {
                buzzer_auto_play: Some(false),
                ..Default::default()
            })
            .await
            .unwrap();

        // Find the Settings event among any state broadcasts.
        let mut saw_settings = false;
        while let Ok(event) = rx.try_recv() {
            if matches!(event, ServerEvent::Settings(_)) {
                saw_settings = true;
                break;
            }
        }
        assert!(saw_settings, "expected a Settings broadcast");
        assert!(!shared.settings_snapshot().await.buzzer_auto_play);
    }

    #[tokio::test]
    async fn buzzer_route_serves_default_asset_when_no_custom_track() {
        let app = router(AppState::new());
        let response = app.oneshot(get("/buzzer.mp3")).await.unwrap();
        // The default buzzer is compiled into the binary (`include_bytes`),
        // so it exists even without a Vite build.
        assert_eq!(response.status(), axum::http::StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("audio/mpeg")
        );
    }
}
