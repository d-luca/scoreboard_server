//! REST handlers (tauri-rebuild doc 03 §4.4, doc 02 §5).

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use super::auth;
use crate::state::{Action, ScoreboardPatch, ScoreboardState, Shared};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    status: &'static str,
    version: &'static str,
    port: u16,
}

pub async fn health(State(shared): State<Shared>) -> Json<Health> {
    Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        port: shared.server_status().port,
    })
}

/// `GET /api/scoreboard` — full state as JSON.
pub async fn get_state(State(shared): State<Shared>) -> Json<ScoreboardState> {
    Json(shared.current().await)
}

/// `GET /api/scoreboard/{property}` — `text/plain` scalar; `timer` is
/// formatted `MM:SS`; unknown property → 404 [PARITY].
pub async fn get_property(
    State(shared): State<Shared>,
    Path(property): Path<String>,
) -> impl IntoResponse {
    match property_value(&shared.current().await, &property) {
        Some(value) => (StatusCode::OK, value).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": format!("unknown property `{property}`") })),
        )
            .into_response(),
    }
}

/// `POST /api/scoreboard` — merge a `ScoreboardPatch`. Unknown fields are
/// rejected with 400 naming the offender (the Electron server silently
/// swallowed typos).
pub async fn post_patch(
    State(shared): State<Shared>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let Some(authorization) = auth::check(&shared, &headers, None).await else {
        return unauthorized();
    };
    match serde_json::from_slice::<ScoreboardPatch>(&body) {
        Ok(patch) => match shared
            .dispatch_authorized(authorization, Action::Patch(patch))
            .await
        {
            Ok(Some(state)) => {
                Json(serde_json::json!({ "success": true, "data": state })).into_response()
            }
            Ok(None) => unauthorized(),
            Err(error) => bad_request(error.to_string()),
        },
        Err(error) => bad_request(serde_error_message(&error)),
    }
}

/// `POST /api/action` — dispatch any `Action`, return the new state.
pub async fn post_action(
    State(shared): State<Shared>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    let Some(authorization) = auth::check(&shared, &headers, None).await else {
        return unauthorized();
    };
    match serde_json::from_slice::<Action>(&body) {
        Ok(action) => match shared.dispatch_authorized(authorization, action).await {
            Ok(Some(state)) => {
                Json(serde_json::json!({ "success": true, "data": state })).into_response()
            }
            Ok(None) => unauthorized(),
            Err(error) => bad_request(error.to_string()),
        },
        Err(error) => bad_request(serde_error_message(&error)),
    }
}

/// Bundled default buzzer, compiled into the binary so the LAN route and
/// the desktop fallback work on a clean install without any web assets.
const DEFAULT_BUZZER: &[u8] = include_bytes!("../../assets/buzzer.mp3");

/// `GET /buzzer.mp3` — the user-selected buzzer track if one is configured
/// and still readable, otherwise the bundled default (doc 02 §5).
/// Unauthenticated: the remote page needs the audio before the operator has
/// typed anything.
pub async fn buzzer_audio(State(shared): State<Shared>) -> impl IntoResponse {
    let track = shared.settings.read().await.buzzer_track_path.clone();
    if let Some(path) = track {
        match tokio::fs::read(&path).await {
            Ok(bytes) => {
                let mime = mime_guess::from_path(&path).first_or_octet_stream();
                return (
                    StatusCode::OK,
                    [
                        (axum::http::header::CONTENT_TYPE, mime.as_ref().to_string()),
                        (axum::http::header::CACHE_CONTROL, "no-store".to_string()),
                    ],
                    bytes,
                )
                    .into_response();
            }
            Err(error) => {
                tracing::warn!(
                    ?error,
                    path,
                    "custom buzzer track unreadable; serving default"
                );
            }
        }
    }
    (
        StatusCode::OK,
        [
            (axum::http::header::CONTENT_TYPE, "audio/mpeg"),
            (axum::http::header::CACHE_CONTROL, "public, max-age=3600"),
        ],
        DEFAULT_BUZZER,
    )
        .into_response()
}

fn unauthorized() -> axum::response::Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({ "error": "unauthorized" })),
    )
        .into_response()
}

fn bad_request(message: String) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

/// Turn serde's `unknown field `teamHomeScre`, expected ... at line 1
/// column 15` into just the useful part.
fn serde_error_message(error: &serde_json::Error) -> String {
    let message = error.to_string();
    message
        .find(" at line ")
        .map(|cut| message[..cut].to_string())
        .unwrap_or(message)
}

/// Scalar rendering shared by `GET /api/scoreboard/{property}` and the
/// `/value/{property}` page. `eventLogo` and `revision` are excluded
/// (doc 02 §5.1).
pub fn property_value(state: &ScoreboardState, property: &str) -> Option<String> {
    match property {
        "teamHomeName" => Some(state.team_home_name.clone()),
        "teamAwayName" => Some(state.team_away_name.clone()),
        "teamHomeScore" => Some(state.team_home_score.to_string()),
        "teamAwayScore" => Some(state.team_away_score.to_string()),
        "teamHomeColor" => Some(state.team_home_color.clone()),
        "teamAwayColor" => Some(state.team_away_color.clone()),
        "timer" => Some(format_timer(state.timer)),
        "half" => Some(state.half.to_string()),
        "halfPrefix" => Some(state.half_prefix.clone()),
        "isTimerRunning" => Some(state.is_timer_running.to_string()),
        "timerLoadout1" => Some(state.timer_loadout1.to_string()),
        "timerLoadout2" => Some(state.timer_loadout2.to_string()),
        "timerLoadout3" => Some(state.timer_loadout3.to_string()),
        _ => None,
    }
}

/// `MM:SS` (doc 02 §5.1).
fn format_timer(seconds: u32) -> String {
    format!("{:02}:{:02}", seconds / 60, seconds % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timer_property_is_mm_ss() {
        let state = ScoreboardState {
            timer: 605,
            ..ScoreboardState::default()
        };
        assert_eq!(property_value(&state, "timer"), Some("10:05".into()));
    }

    #[test]
    fn unknown_and_internal_properties_are_none() {
        let state = ScoreboardState::default();
        assert_eq!(property_value(&state, "teamHomeScre"), None);
        assert_eq!(property_value(&state, "revision"), None);
        assert_eq!(property_value(&state, "eventLogo"), None);
    }

    #[test]
    fn serde_error_strips_position_suffix() {
        let error = serde_json::from_str::<ScoreboardPatch>(r#"{"teamHomeScre":3}"#).unwrap_err();
        let message = serde_error_message(&error);
        assert!(
            message.contains("unknown field `teamHomeScre`"),
            "{message}"
        );
        assert!(!message.contains("at line"), "{message}");
    }
}
