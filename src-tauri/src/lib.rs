mod bindings;
mod menu;
mod state;
mod timer;
mod windows;

use state::{Action, AppPrefs, AppState, ScoreboardState, Shared};
use tauri::Manager;
use windows::AppWindow;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
