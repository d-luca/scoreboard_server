mod bindings;
mod menu;
mod net;
mod server;
mod state;
mod timer;
mod windows;

pub use state::{AppPrefs, AppState, Shared};

use state::{Action, ScoreboardState, ServerInfo, ServerStatus};
use tauri::Manager;
use windows::AppWindow;

/// Preferred HTTP port until the Settings schema lands in Phase 5
/// (doc 02 §9: `server_port` default 3001).
pub const DEFAULT_SERVER_PORT: u16 = 3001;

/// Start the embedded LAN server (doc 03 §4). Exposed for the
/// `examples/serve.rs` smoke-test binary; the app calls it from `setup`.
pub async fn start_server(shared: Shared, preferred_port: u16) -> anyhow::Result<u16> {
    server::start(shared, preferred_port).await
}

#[tauri::command]
async fn sb_get_state(state: tauri::State<'_, Shared>) -> Result<ScoreboardState, String> {
    Ok(state.current().await)
}

#[tauri::command]
async fn sb_dispatch(
    action: Action,
    state: tauri::State<'_, Shared>,
) -> Result<ScoreboardState, String> {
    state
        .dispatch(action)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn window_open(which: AppWindow, app: tauri::AppHandle) -> Result<(), String> {
    windows::open(&app, which).map_err(|error| error.to_string())
}

#[tauri::command]
fn window_close(which: AppWindow, app: tauri::AppHandle) -> Result<(), String> {
    windows::close(&app, which).map_err(|error| error.to_string())
}

#[tauri::command]
fn window_list(app: tauri::AppHandle) -> Vec<AppWindow> {
    windows::list_open(&app)
}

#[tauri::command]
async fn server_get_info(state: tauri::State<'_, Shared>) -> Result<ServerInfo, String> {
    Ok(state.server_info())
}

#[tauri::command]
async fn server_get_status(state: tauri::State<'_, Shared>) -> Result<ServerStatus, String> {
    Ok(state.server_status())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let prefs = AppPrefs::load(app.handle());
            let shared = AppState::with_prefs(prefs);
            shared.attach_app(app.handle().clone());
            app.manage(shared);

            // Native menu bar on the main window only — never `app.set_menu`,
            // or the frameless overlay windows grow a menu bar [RISK].
            let menu = menu::build(app.handle())?;
            if let Some(main_window) = app.get_webview_window("main") {
                main_window.set_menu(menu)?;

                // Restore the main window's saved geometry (clamped to a
                // visible monitor) and persist changes, same as feature
                // windows.
                windows::wire_main_window(app.handle(), &main_window);

                main_window.show()?;
            }

            // Embedded LAN server (doc 03 §4). The bound port is published
            // as `server:status` / `server:info` once known.
            let shared_for_server = app.state::<Shared>().inner().clone();
            tauri::async_runtime::spawn(async move {
                match server::start(shared_for_server.clone(), DEFAULT_SERVER_PORT).await {
                    Ok(port) => shared_for_server.set_server_port(port).await,
                    Err(error) => tracing::error!(?error, "HTTP server failed to start"),
                }
            });
            Ok(())
        })
        .on_menu_event(menu::on_menu_event)
        .on_window_event(|window, event| {
            // Closing `main` closes everything and exits (doc 03 §7bis).
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    windows::close_all(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            sb_get_state,
            sb_dispatch,
            window_open,
            window_close,
            window_list,
            server_get_info,
            server_get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
