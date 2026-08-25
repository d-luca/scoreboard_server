//! Manual smoke-test server: `cargo run --example serve` starts the real
//! axum stack on the default port so the REST/WS/pages can be exercised
//! with curl and a browser without launching the Tauri shell.

use scoreboard_server_lib::presets::PresetLibrary;
use scoreboard_server_lib::{AppPrefs, AppState, Settings};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let shared = AppState::with_prefs(
        AppPrefs::default(),
        Settings::default(),
        PresetLibrary::empty(),
    );
    let (port, _handle) = scoreboard_server_lib::start_server(
        shared.clone(),
        scoreboard_server_lib::Settings::default().server_port,
    )
    .await
    .expect("server failed to start");
    shared.set_server_port(port).await;
    println!("listening on http://localhost:{port}");

    // Keep the process alive; Ctrl+C to stop.
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
    }
}
