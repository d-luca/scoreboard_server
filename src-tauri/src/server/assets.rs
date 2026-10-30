//! Static assets embedded with `rust-embed`.
//!
//! The whole Vite `dist/` is compiled into the binary in release; in debug
//! builds (`debug-embed` feature) files are read from disk, so
//! `cargo build` needs `dist/` to exist — a placeholder is committed.
//!
//! Page routes inject a small bootstrap script with the page's runtime
//! config (`window.__SCOREBOARD__`), so the same bundle works on any
//! host/port without a rebuild.

use axum::extract::{Path, RawQuery, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse};
use rust_embed::RustEmbed;

use super::{auth, routes};
use crate::layouts::PublishedLayoutSnapshot;
use crate::state::Shared;

#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/../dist"]
pub(crate) struct Assets;

/// `GET /scoreboard` — the OBS browser-source page.
pub async fn scoreboard_page(
    State(shared): State<Shared>,
    headers: HeaderMap,
) -> impl IntoResponse {
    serve_page(
        &shared,
        &headers,
        "pages/scoreboard.html",
        "scoreboard",
        None,
    )
    .await
}

/// `GET /control?t=<token>` exchanges a valid URL token for an HttpOnly
/// cookie, then redirects so the secret leaves the address bar. Subsequent
/// cookie-authenticated requests serve the remote page.
pub async fn control_page(
    State(shared): State<Shared>,
    headers: HeaderMap,
    RawQuery(raw_query): RawQuery,
) -> impl IntoResponse {
    if let Some(query_token) = auth::query_token(raw_query.as_deref()) {
        if auth::check(&shared, &headers, Some(query_token))
            .await
            .is_none()
        {
            return unauthorized_control_page();
        }
        let mut response = axum::response::Redirect::to("/control").into_response();
        response
            .headers_mut()
            .insert(header::SET_COOKIE, auth::control_cookie(&shared));
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-store"),
        );
        return response;
    }

    if auth::check(&shared, &headers, None).await.is_none() {
        return unauthorized_control_page();
    }
    serve_page(&shared, &headers, "pages/control.html", "control", None).await
}

fn unauthorized_control_page() -> axum::response::Response {
    (
        StatusCode::UNAUTHORIZED,
        [(header::CACHE_CONTROL, "no-store")],
        Html(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Remote control access required</title></head><body><main><h1>Remote control access required</h1><p>Ask the operator for the current control link.</p></main></body></html>",
        ),
    )
        .into_response()
}

/// `GET /value/{property}` — transparent single-value page.
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
    serve_page(
        &shared,
        &headers,
        "pages/value.html",
        "value",
        Some(&property),
    )
    .await
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
async fn serve_page(
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
    // The score-roll presentation flag is injected for the pages that render
    // digits (`/scoreboard`, `/value/*`); it lets the board start
    // static when the setting is off, before the first WS frame arrives.
    let score_animation = if matches!(mode, "scoreboard" | "value") {
        Some(shared.settings_snapshot().await.score_animation_enabled)
    } else {
        None
    };
    // Only the layout-rendering page needs the publication; `/value/*` and
    // `/control` stay independent of layout selection.
    let published = (mode == "scoreboard").then(|| shared.layouts.published());
    let bootstrap = bootstrap_script(
        &format!("ws://{host}/ws"),
        mode,
        property,
        score_animation,
        published.as_ref(),
    );
    let html = if html.contains("</head>") {
        html.replacen("</head>", &format!("{bootstrap}</head>"), 1)
    } else {
        format!("{bootstrap}{html}")
    };
    Html(html).into_response()
}

/// Builds the inline `window.__SCOREBOARD__` script.
fn bootstrap_script(
    ws_url: &str,
    mode: &str,
    property: Option<&str>,
    score_animation: Option<bool>,
    published: Option<&PublishedLayoutSnapshot>,
) -> String {
    let mut config = serde_json::json!({ "wsUrl": ws_url, "token": null, "mode": mode });
    if let Some(property) = property {
        config["property"] = property.into();
    }
    if let Some(enabled) = score_animation {
        config["scoreAnimationEnabled"] = enabled.into();
    }
    if let Some(published) = published {
        config["publishedLayout"] = serde_json::to_value(published).unwrap_or_default();
    }
    format!(
        "<script>window.__SCOREBOARD__ = {};</script>",
        script_safe_json(&config)
    )
}

/// JSON safe to inline in a `<script>` element: user-authored layout text
/// cannot close the element or open an HTML comment, and U+2028/U+2029 are
/// escaped for older JavaScript parsers.
fn script_safe_json(value: &serde_json::Value) -> String {
    let json = value.to_string();
    let mut escaped = String::with_capacity(json.len());
    for character in json.chars() {
        match character {
            '<' => escaped.push_str("\\u003c"),
            '>' => escaped.push_str("\\u003e"),
            '&' => escaped.push_str("\\u0026"),
            '\u{2028}' => escaped.push_str("\\u2028"),
            '\u{2029}' => escaped.push_str("\\u2029"),
            other => escaped.push(other),
        }
    }
    escaped
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layouts::PublishedLayoutSelection;

    fn config(script: &str) -> serde_json::Value {
        let json = script
            .strip_prefix("<script>window.__SCOREBOARD__ = ")
            .and_then(|rest| rest.strip_suffix(";</script>"))
            .expect("bootstrap script shape");
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn scoreboard_bootstrap_carries_the_full_publication() {
        let published = PublishedLayoutSnapshot {
            session_id: "session-a".into(),
            revision: 3,
            selection: PublishedLayoutSelection::Classic {},
        };
        let script = bootstrap_script(
            "ws://host:3001/ws",
            "scoreboard",
            None,
            Some(false),
            Some(&published),
        );
        let config = config(&script);
        assert_eq!(config["wsUrl"], "ws://host:3001/ws");
        assert_eq!(config["mode"], "scoreboard");
        assert_eq!(config["token"], serde_json::Value::Null);
        assert_eq!(config["scoreAnimationEnabled"], false);
        assert_eq!(
            config["publishedLayout"],
            serde_json::to_value(&published).unwrap()
        );
    }

    #[test]
    fn value_and_control_bootstraps_omit_layout_state() {
        let value = config(&bootstrap_script(
            "ws://h/ws",
            "value",
            Some("timer"),
            Some(true),
            None,
        ));
        assert_eq!(value["property"], "timer");
        assert!(value.get("publishedLayout").is_none());
        let control = config(&bootstrap_script("ws://h/ws", "control", None, None, None));
        assert!(control.get("publishedLayout").is_none());
        assert!(control.get("scoreAnimationEnabled").is_none());
    }

    #[test]
    fn bootstrap_escapes_markup_in_user_authored_strings() {
        let value = serde_json::json!({ "name": "</script><!--x\u{2028}&" });
        let escaped = script_safe_json(&value);
        assert!(!escaped.contains('<') && !escaped.contains('>') && !escaped.contains('&'));
        assert!(!escaped.contains('\u{2028}'));
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&escaped).unwrap(),
            value
        );
    }
}
