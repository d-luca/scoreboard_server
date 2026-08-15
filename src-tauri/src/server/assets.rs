//! Static assets embedded with `rust-embed` (tauri-rebuild doc 03 §4.3).
//!
//! The whole Vite `dist/` is compiled into the binary in release; in debug
//! builds (`debug-embed` feature) files are read from disk, so
//! `cargo build` needs `dist/` to exist — a placeholder is committed.
//!
//! Page routes inject a small bootstrap script with the page's runtime
//! config (`window.__SCOREBOARD__`), so the same bundle works on any
//! host/port without a rebuild.

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse};
use rust_embed::RustEmbed;

use super::routes;
use crate::state::Shared;

#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/../dist"]
struct Assets;

/// `GET /scoreboard` — the OBS browser-source page.
pub async fn scoreboard_page(
    State(shared): State<Shared>,
    headers: HeaderMap,
) -> impl IntoResponse {
    serve_page(&shared, &headers, "scoreboard.html", "scoreboard", None)
}

/// `GET /control` — the phone remote. The full page (with token
/// validation) lands in Phase 4; for now it serves the placeholder bundle
/// in `control` mode.
pub async fn control_page(State(shared): State<Shared>, headers: HeaderMap) -> impl IntoResponse {
    serve_page(&shared, &headers, "control.html", "control", None)
}

/// `GET /value/{property}` — transparent single-value page (doc 02 §5.1).
/// Unknown property → 404.
pub async fn value_page(
    State(shared): State<Shared>,
    headers: HeaderMap,
    Path(property): Path<String>,
) -> impl IntoResponse {
    let state = shared.current().await;
    if routes::property_value(&state, &property).is_none() {
        return (
            StatusCode::NOT_FOUND,
            Html(format!("unknown property `{property}`")),
        )
            .into_response();
    }
    serve_page(&shared, &headers, "value.html", "value", Some(&property))
}

/// Everything else: look the path up in the embedded bundle, guess the
/// MIME type, 404 on a miss. `/` redirects to `/scoreboard`.
pub async fn static_handler(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    if path.is_empty() {
        return axum::response::Redirect::to("/scoreboard").into_response();
    }
    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], content.data).into_response()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

/// Serve an embedded HTML page with the bootstrap config injected before
/// `</head>`. The websocket URL is derived from the request's `Host`
/// header so the page works over LAN, localhost and port fallbacks alike.
fn serve_page(
    shared: &Shared,
    headers: &HeaderMap,
    file: &str,
    mode: &str,
    property: Option<&str>,
) -> axum::response::Response {
    let Some(content) = Assets::get(file) else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            format!("{file} is not in the embedded bundle — run `pnpm vite:build`"),
        )
            .into_response();
    };
    let html = String::from_utf8_lossy(&content.data).into_owned();
    let host = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("localhost:{}", shared.server_status().port));
    let property = match property {
        Some(property) => format!(
            ", property: {}",
            serde_json::to_string(property).unwrap_or_default()
        ),
        None => String::new(),
    };
    let bootstrap = format!(
        "<script>window.__SCOREBOARD__ = {{ wsUrl: {}, token: null, mode: {}{} }};</script>",
        serde_json::to_string(&format!("ws://{host}/ws")).unwrap_or_default(),
        serde_json::to_string(mode).unwrap_or_default(),
        property,
    );
    let html = if html.contains("</head>") {
        html.replacen("</head>", &format!("{bootstrap}</head>"), 1)
    } else {
        format!("{bootstrap}{html}")
    };
    Html(html).into_response()
}
