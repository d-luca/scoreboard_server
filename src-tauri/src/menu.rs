//! Native menu bar, attached to the `main` window only (doc 03 §7ter).
//!
//! `[RISK]` Never call `app.set_menu(...)`: on Windows/Linux that applies the
//! menu to windows created afterwards, which would put a menu bar on the
//! frameless overlay windows. Attach with `main_window.set_menu(menu)`.
//!
//! The `Presets` submenu is rebuilt whenever the library changes (doc 09
//! §6.1): Tauri menu items are not reactive, so a `ServerEvent::Presets`
//! subscriber re-attaches a fresh menu — debounced, and always on the
//! event-loop thread via `run_on_main_thread`.

use std::time::Duration;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::presets::{self, PresetLibrary};
use crate::state::{ServerEvent, Shared};
use crate::windows::{self, AppWindow};

pub const DOCS_URL: &str = "https://github.com/d-luca/scoreboard_server#readme";

/// Menu rebuilds coalesce behind the same 500 ms debounce as the preset save,
/// otherwise typing in the label field flickers the menu bar on every
/// keystroke (doc 09 §6.1).
const PRESETS_MENU_REBUILD_DEBOUNCE: Duration = Duration::from_millis(500);

/// Read the current library from state; empty when state is not managed yet
/// (the menu is built once before `manage` in some tests / early shutdown).
fn current_library(app: &AppHandle) -> PresetLibrary {
    app.try_state::<Shared>()
        .map(|state| tauri::async_runtime::block_on(async { state.presets_snapshot().await }))
        .unwrap_or_default()
}

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let file = SubmenuBuilder::new(app, "File")
        .item(
            &MenuItemBuilder::with_id("open:settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .quit()
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("open:outputs", "Outputs & Sharing…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("view:zoom-in", "Zoom In")
                .accelerator("CmdOrCtrl+Plus")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view:zoom-out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view:zoom-reset", "Reset Zoom")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .build()?;

    let presets_menu = build_presets_menu(app, &current_library(app))?;

    let tools = build_tools_menu(app)?;

    let help = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("help:docs", "Documentation").build(app)?)
        .item(&MenuItemBuilder::with_id("open:about", "About").build(app)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file, &view, &presets_menu, &tools, &help])
        .build()
}

/// `Presets` submenu (doc 09 §6): `Manage Presets…`, then every fixture —
/// never bare teams. Empty library → a single disabled item so the menu is
/// never an uninterpretable box. Capped at [`presets::MAX_MENU_FIXTURES`]
/// most recently appended fixtures; the window lists the rest.
fn build_presets_menu(app: &AppHandle, library: &PresetLibrary) -> tauri::Result<Submenu<Wry>> {
    let mut builder = SubmenuBuilder::new(app, "Presets").item(
        &MenuItemBuilder::with_id("open:presets", "Manage Presets…")
            .accelerator("CmdOrCtrl+P")
            .build(app)?,
    );
    if library.matches.is_empty() {
        return builder
            .separator()
            .item(
                &MenuItemBuilder::with_id("presets:empty", "No presets saved")
                    .enabled(false)
                    .build(app)?,
            )
            .build();
    }
    builder = builder.separator();
    let start = library.matches.len().saturating_sub(presets::MAX_MENU_FIXTURES);
    for fixture in &library.matches[start..] {
        let label = presets::escape_menu_label(&presets::display_name(library, fixture));
        builder = builder.item(
            &MenuItemBuilder::with_id(format!("preset:load:{}", fixture.id), label).build(app)?,
        );
    }
    builder.build()
}

/// Rebuild the whole menu and re-attach it to the `main` window whenever the
/// preset library changes (create/update/delete, and team renames that
/// change a derived label). Triggered from this one subscriber — never from
/// the commands — so no mutation path can forget it (doc 09 §6.1).
///
/// `[RISK]` `set_menu` must run on the event loop; rebuilding from a command's
/// tokio thread hangs or crashes. Never `app.set_menu` — that would attach a
/// menu bar to the frameless overlay windows.
pub fn spawn_presets_menu_rebuilder(app: &AppHandle, shared: Shared) {
    let mut rx = shared.events.subscribe();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(ServerEvent::Presets(_)) => {}
                Ok(_) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
            // Coalesce bursts: wait out the debounce, then drain whatever
            // queued during it and rebuild once.
            tokio::time::sleep(PRESETS_MENU_REBUILD_DEBOUNCE).await;
            while rx.try_recv().is_ok() {}
            let app_for_thread = app.clone();
            let posted = app.run_on_main_thread(move || {
                let Ok(menu) = build(&app_for_thread) else {
                    return;
                };
                if let Some(main_window) = app_for_thread.get_webview_window("main") {
                    let _ = main_window.set_menu(menu);
                }
            });
            if posted.is_err() {
                break; // event loop gone (shutdown)
            }
        }
    });
}

/// Tools is assembled conditionally: items for features compiled out are
/// never added (doc 03 §7ter). The overlay/recording/video features land in
/// later phases; the menu entries appear with their Cargo features.
fn build_tools_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    let builder = SubmenuBuilder::new(app, "Tools");
    #[cfg(feature = "overlay")]
    let builder = {
        builder
            .item(
                &tauri::menu::CheckMenuItemBuilder::with_id("tools:overlay", "Overlay Mode")
                    .accelerator("F9")
                    .build(app)?,
            )
            .separator()
    };
    #[cfg(feature = "recording")]
    let builder = {
        // `Ctrl+R` shadows the webview reload in dev builds; only register
        // the accelerator in release (doc 03 §7ter).
        let item = MenuItemBuilder::with_id("open:recording", "Recording…");
        #[cfg(not(debug_assertions))]
        let item = item.accelerator("CmdOrCtrl+R");
        builder.item(&item.build(app)?)
    };
    #[cfg(feature = "video")]
    let builder =
        { builder.item(&MenuItemBuilder::with_id("open:video", "Video Generator…").build(app)?) };
    builder.build()
}

/// Route a menu event to its effect (doc 03 §7ter).
pub fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    use tauri_plugin_opener::OpenerExt;
    match event.id().as_ref() {
        "open:settings" => {
            let _ = windows::open(app, AppWindow::Settings);
        }
        "open:outputs" => {
            let _ = windows::open(app, AppWindow::Outputs);
        }
        "open:recording" => {
            let _ = windows::open(app, AppWindow::Recording);
        }
        "open:video" => {
            let _ = windows::open(app, AppWindow::VideoGenerator);
        }
        "open:about" => {
            let _ = windows::open(app, AppWindow::About);
        }
        "open:presets" => {
            let _ = windows::open(app, AppWindow::Presets);
        }
        id if id.starts_with("preset:load:") => {
            let preset_id = id.trim_start_matches("preset:load:").to_string();
            if let Some(state) = app.try_state::<Shared>() {
                let shared = state.inner().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = shared.preset_load(&preset_id).await {
                        tracing::warn!(?error, preset_id, "failed to load match preset");
                    }
                });
            }
        }
        "view:zoom-in" => windows::zoom_by(app, 0.1),
        "view:zoom-out" => windows::zoom_by(app, -0.1),
        "view:zoom-reset" => windows::zoom_reset(app),
        "help:docs" => {
            let _ = app.opener().open_url(DOCS_URL, None::<&str>);
        }
        _ => {}
    }
}
