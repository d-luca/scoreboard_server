mod bindings;
mod menu;
mod net;
mod server;
mod settings;
mod state;
mod timer;
mod windows;

pub use settings::{Settings, SettingsPatch};
pub use state::{AppPrefs, AppState, Shared};

use settings::SettingsPatch as SettingsPatchInput;
use state::{Action, ScoreboardState, ServerInfo, ServerStatus};
use tauri::Manager;
use windows::AppWindow;

/// Start the embedded LAN server (doc 03 §4). Exposed for the
/// `examples/serve.rs` smoke-test binary; the app calls it from `setup`.
pub async fn start_server(
    shared: Shared,
    preferred_port: u16,
) -> anyhow::Result<(u16, tauri::async_runtime::JoinHandle<()>)> {
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
    Ok(state.server_info().await)
}

#[tauri::command]
async fn server_get_status(state: tauri::State<'_, Shared>) -> Result<ServerStatus, String> {
    Ok(state.server_status())
}

#[tauri::command]
async fn server_regenerate_token(state: tauri::State<'_, Shared>) -> Result<ServerInfo, String> {
    Ok(state.inner().regenerate_control_token().await)
}

#[tauri::command]
async fn settings_get(state: tauri::State<'_, Shared>) -> Result<Settings, String> {
    Ok(state.settings_snapshot().await)
}

#[tauri::command]
async fn settings_set(
    patch: SettingsPatchInput,
    state: tauri::State<'_, Shared>,
) -> Result<Settings, String> {
    state
        .inner()
        .settings_set(patch)
        .await
        .map_err(|error| error.to_string())
}

/// Currently configured buzzer track (doc 02 §7.2). `path` is `null` when
/// the built-in default is in use.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuzzerTrack {
    path: Option<String>,
    file_name: Option<String>,
}

#[tauri::command]
async fn buzzer_get_track(state: tauri::State<'_, Shared>) -> Result<BuzzerTrack, String> {
    let settings = state.settings_snapshot().await;
    Ok(BuzzerTrack {
        file_name: settings.buzzer_track_path.as_deref().map(track_file_name),
        path: settings.buzzer_track_path,
    })
}

/// Open a native file dialog and persist the selection. Audio bytes are
/// not shipped over IPC — the webview plays the file through the asset
/// protocol (`convertFileSrc`).
#[tauri::command]
async fn buzzer_select_track(
    app: tauri::AppHandle,
    state: tauri::State<'_, Shared>,
) -> Result<Option<BuzzerTrack>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .add_filter("Audio", &["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac"])
        .blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(None); // cancelled
    };
    let path = picked
        .into_path()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .into_owned();
    let settings = state
        .inner()
        .settings_set(SettingsPatchInput {
            buzzer_track_path: Some(Some(path.clone())),
            ..Default::default()
        })
        .await
        .map_err(|error| error.to_string())?;
    Ok(Some(BuzzerTrack {
        file_name: settings.buzzer_track_path.as_deref().map(track_file_name),
        path: settings.buzzer_track_path,
    }))
}

#[tauri::command]
async fn buzzer_clear_track(state: tauri::State<'_, Shared>) -> Result<(), String> {
    state
        .inner()
        .settings_set(SettingsPatchInput {
            buzzer_track_path: Some(None),
            ..Default::default()
        })
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn track_file_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let settings = settings::load(app.handle());
            let prefs = AppPrefs::load(app.handle());
            let server_port = settings.server_port;
            let shared = AppState::with_prefs(prefs, settings);
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
                match server::start(shared_for_server.clone(), server_port).await {
                    Ok((port, handle)) => {
                        shared_for_server.register_server_task(handle).await;
                        shared_for_server.set_server_port(port).await;
                    }
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
            server_regenerate_token,
            settings_get,
            settings_set,
            buzzer_get_track,
            buzzer_select_track,
            buzzer_clear_track,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
