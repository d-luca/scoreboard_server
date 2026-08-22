//! Control-token generation and HTTP authentication.
//!
//! The token is deliberately kept out of all tracing fields. Callers receive
//! only an authorization generation, which lets WebSockets be revoked when the
//! token is regenerated without retaining another copy of the secret.

use axum::http::{header, HeaderMap, HeaderValue};
use qrcode::render::svg;
use qrcode::QrCode;
use rand::rngs::OsRng;
use rand::RngCore;
use subtle::ConstantTimeEq;

use crate::state::Shared;

pub const TOKEN_HEX_LEN: usize = 32;
const TOKEN_BYTES: usize = 16;
const COOKIE_NAME: &str = "sb_token";

#[derive(Clone, Copy)]
pub struct Authorization {
    generation: u64,
}

impl Authorization {
    pub(crate) fn generation(self) -> u64 {
        self.generation
    }
}

/// Generate a 128-bit token using the operating system CSPRNG and encode it as
/// exactly 32 lowercase hexadecimal characters.
pub fn generate_token() -> String {
    let mut bytes = [0_u8; TOKEN_BYTES];
    OsRng.fill_bytes(&mut bytes);

    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut token = String::with_capacity(TOKEN_HEX_LEN);
    for byte in bytes {
        token.push(char::from(HEX[usize::from(byte >> 4)]));
        token.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    token
}

pub fn query_token(raw_query: Option<&str>) -> Option<&str> {
    raw_query?
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find_map(|(name, value)| (name == "t").then_some(value))
}

/// Authenticate a query token, bearer token, or control cookie, in that
/// order. When `require_control_token` is off (trusted LANs, doc 02 §6),
/// every request is authorized — read-only pages like `/scoreboard` and the
/// remote behave identically, writes are simply open.
pub async fn check(
    shared: &Shared,
    headers: &HeaderMap,
    query: Option<&str>,
) -> Option<Authorization> {
    if !shared.settings.read().await.require_control_token {
        let (_, generation) = shared.control_token_snapshot();
        return Some(Authorization { generation });
    }
    let presented = query
        .or_else(|| bearer(headers))
        .or_else(|| cookie(headers, COOKIE_NAME))?;
    let (expected, generation) = shared.control_token_snapshot();
    token_matches(presented, &expected).then_some(Authorization { generation })
}

/// Render a control URL as an inline SVG without exposing it to a third party.
pub fn qr_svg(value: &str) -> String {
    match QrCode::new(value.as_bytes()) {
        Ok(code) => code.render::<svg::Color>().min_dimensions(240, 240).build(),
        Err(_) => {
            tracing::error!("failed to generate control QR code");
            String::new()
        }
    }
}

/// Build the cookie issued after `/control?t=...` succeeds.
pub fn control_cookie(shared: &Shared) -> HeaderValue {
    let (token, _) = shared.control_token_snapshot();
    HeaderValue::from_str(&format!(
        "{COOKIE_NAME}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400"
    ))
    .expect("generated control token must be a valid cookie value")
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    (scheme.eq_ignore_ascii_case("bearer") && !token.is_empty()).then_some(token)
}

fn cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(cookie_name, value)| (cookie_name == name).then_some(value))
}

/// Always performs a fixed-size constant-time comparison, even when the
/// presented token has the wrong length.
fn token_matches(presented: &str, expected: &str) -> bool {
    let presented = presented.as_bytes();
    let mut candidate = [0_u8; TOKEN_HEX_LEN];
    let copied = presented.len().min(TOKEN_HEX_LEN);
    candidate[..copied].copy_from_slice(&presented[..copied]);

    let bytes_match: bool = candidate.ct_eq(expected.as_bytes()).into();
    bytes_match & (presented.len() == TOKEN_HEX_LEN)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn generated_tokens_are_128_bit_lowercase_hex() {
        let first = generate_token();
        let second = generate_token();
        assert_eq!(first.len(), TOKEN_HEX_LEN);
        assert!(first
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()));
        assert_ne!(first, second);
    }

    #[test]
    fn constant_time_match_rejects_wrong_values_and_lengths() {
        let expected = "0123456789abcdef0123456789abcdef";
        assert!(token_matches(expected, expected));
        assert!(!token_matches("0123456789abcdef0123456789abcdee", expected));
        assert!(!token_matches("short", expected));
        assert!(!token_matches(
            "0123456789abcdef0123456789abcdef00",
            expected
        ));
    }

    #[test]
    fn bearer_and_cookie_parsing_are_strict() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("bEaReR abc123"),
        );
        assert_eq!(bearer(&headers), Some("abc123"));

        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("theme=dark; sb_token=token; other=value"),
        );
        assert_eq!(cookie(&headers, COOKIE_NAME), Some("token"));
        assert_eq!(cookie(&headers, "missing"), None);
    }
}
