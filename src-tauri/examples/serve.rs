//! Manual smoke-test server: `cargo run --example serve` starts the real
//! axum stack on the default port so the REST/WS/pages can be exercised
//! with curl and a browser without launching the Tauri shell.

use scoreboard_server_lib::layouts::{LayoutService, SavedLayoutSelection};
use scoreboard_server_lib::presets::PresetLibrary;
use scoreboard_server_lib::{AppPrefs, AppState, Settings, Shared};
use serde_json::json;
use std::io::BufRead;
use tokio::runtime::Handle;

const SMOKE_LAYOUT_NAME: &str = "P7 Smoke Fixture";

async fn apply_from_stdin(shared: &Shared, command: &str) -> Result<String, String> {
    let selection = match command {
        "classic" => SavedLayoutSelection::Classic {},
        "smoke" => {
            let mut snapshot = shared.layouts.snapshot();
            let saved = if let Some(saved) = snapshot
                .entries
                .iter()
                .find(|entry| entry.name == SMOKE_LAYOUT_NAME)
            {
                saved.clone()
            } else {
                let root_id = uuid::Uuid::new_v4().to_string();
                let text_id = uuid::Uuid::new_v4().to_string();
                let definition = serde_json::from_value(json!({
                    "root": {
                        "kind": "root",
                        "id": root_id,
                        "width": 320,
                        "height": 120,
                        "background": { "kind": "literal", "hex": "#000000", "alpha": 0.0 },
                        "children": [{
                            "kind": "text",
                            "id": text_id,
                            "hidden": false,
                            "frame": {
                                "x": 12,
                                "y": 12,
                                "width": { "kind": "fixed", "pixels": 296 },
                                "height": { "kind": "fixed", "pixels": 96 }
                            },
                            "box": {
                                "background": { "kind": "literal", "hex": "#172554", "alpha": 1.0 },
                                "borderColor": { "kind": "literal", "hex": "#38BDF8", "alpha": 1.0 },
                                "borderWidth": 2,
                                "radius": 8
                            },
                            "text": "P7 LIVE LAYOUT",
                            "textStyle": {
                                "font": { "family": "poppins", "weight": 700 },
                                "fontSize": 24,
                                "color": { "kind": "literal", "hex": "#FFFFFF", "alpha": 1.0 },
                                "horizontalAlign": "center",
                                "verticalAlign": "center"
                            }
                        }]
                    },
                    "editor": {
                        "layers": [
                            { "nodeId": root_id, "label": "Root", "locked": false },
                            { "nodeId": text_id, "label": "P7 smoke text", "locked": false }
                        ]
                    }
                }))
                .map_err(|error| format!("could not create smoke definition: {error}"))?;
                let created = shared
                    .layouts
                    .create(SMOKE_LAYOUT_NAME.into(), definition)
                    .await
                    .map_err(|error| error.message)?;
                snapshot = created.library;
                snapshot
                    .entries
                    .iter()
                    .find(|entry| entry.name == SMOKE_LAYOUT_NAME)
                    .cloned()
                    .ok_or_else(|| "smoke layout was not returned after creation".to_owned())?
            };
            SavedLayoutSelection::Custom {
                id: saved.id,
                expected_revision: saved.revision,
            }
        }
        other if other.starts_with("id ") => {
            let id = other[3..].trim();
            let snapshot = shared.layouts.snapshot();
            let saved = snapshot
                .entries
                .iter()
                .find(|entry| entry.id == id)
                .ok_or_else(|| format!("no saved layout has id {id}"))?;
            SavedLayoutSelection::Custom {
                id: saved.id.clone(),
                expected_revision: saved.revision,
            }
        }
        _ => {
            return Err(
                "use `apply smoke`, `apply classic`, `apply id <saved-id>`, or `quit`".into(),
            )
        }
    };

    let snapshot = shared.layouts.snapshot();
    let result = shared
        .layouts
        .apply(selection, snapshot.published.revision)
        .await
        .map_err(|error| error.message)?;
    Ok(format!(
        "applied publication: session={} revision={}",
        result.library.published.session_id, result.library.published.revision
    ))
}

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
        LayoutService::load_from(
            std::env::var_os("SB_LAYOUTS_PATH")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| {
                    std::env::temp_dir()
                        .join("scoreboard-server-smoke")
                        .join("layouts.json")
                }),
        ),
    );
    let (port, _handle) = scoreboard_server_lib::start_server(
        shared.clone(),
        scoreboard_server_lib::Settings::default().server_port,
    )
    .await
    .expect("server failed to start");
    shared.set_server_port(port).await;
    println!("listening on http://localhost:{port}");
    // Token-bearing URL for the smoke scripts (`scripts/ws-*.mjs`) and phones.
    println!("control: {}", shared.server_info().await.control_url);
    println!("stdin: `apply smoke`, `apply classic`, `apply id <saved-id>`, or `quit`");

    let runtime = Handle::current();
    let (shutdown, mut shutdown_rx) = tokio::sync::watch::channel(false);
    // Keep the channel open if stdin reaches EOF; only the explicit `quit`
    // command stops the standalone server.
    let _shutdown_guard = shutdown.clone();
    let stdin_shared = shared.clone();
    tokio::task::spawn_blocking(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else {
                break;
            };
            let command = line.trim();
            if command == "quit" {
                let _ = shutdown.send(true);
                break;
            }
            let command = command.strip_prefix("apply ").unwrap_or(command);
            match runtime.block_on(apply_from_stdin(&stdin_shared, command)) {
                Ok(result) => println!("{result}"),
                Err(error) => eprintln!("Apply command failed: {error}"),
            }
        }
    });

    while shutdown_rx.changed().await.is_ok() {
        if *shutdown_rx.borrow() {
            break;
        }
    }
    shared.layouts.shutdown();
}
