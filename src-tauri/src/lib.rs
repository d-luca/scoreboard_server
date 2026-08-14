mod bindings;
mod state;
mod timer;

use state::{Action, AppState, ScoreboardState, Shared};
use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let shared = AppState::new();
            #[cfg(not(test))]
            shared.attach_app(app.handle().clone());
            app.manage(shared);

            if let Some(window) = app.get_webview_window("main") {
                window.show()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![sb_get_state, sb_dispatch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
