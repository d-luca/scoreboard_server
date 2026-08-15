//! Native menu bar, attached to the `main` window only (doc 03 §7ter).
//!
//! `[RISK]` Never call `app.set_menu(...)`: on Windows/Linux that applies the
//! menu to windows created afterwards, which would put a menu bar on the
//! frameless overlay windows. Attach with `main_window.set_menu(menu)`.

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Wry};

use crate::windows::{self, AppWindow};

pub const DOCS_URL: &str = "https://github.com/d-luca/scoreboard_server#readme";

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

    let tools = build_tools_menu(app)?;

    let help = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("help:docs", "Documentation").build(app)?)
        .item(&MenuItemBuilder::with_id("open:about", "About").build(app)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file, &view, &tools, &help])
        .build()
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
        "view:zoom-in" => windows::zoom_by(app, 0.1),
        "view:zoom-out" => windows::zoom_by(app, -0.1),
        "view:zoom-reset" => windows::zoom_reset(app),
        "help:docs" => {
            let _ = app.opener().open_url(DOCS_URL, None::<&str>);
        }
        _ => {}
    }
}
