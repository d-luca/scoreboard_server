//! Native menu bar, attached to the `main` window only (doc 03 §7ter).
//!
//! `[RISK]` Never call `app.set_menu(...)`: on Windows/Linux that applies the
//! menu to windows created afterwards, which would put a menu bar on the
//! frameless overlay windows. Attach with `main_window.set_menu(menu)`.
//!
//! The menu is rebuilt whenever a menu-rendered value changes — the preset
//! library (doc 09 §6.1) or a timer loadout value: Tauri menu items are not
//! reactive, so a `ServerEvent` subscriber re-attaches a fresh menu,
//! debounced, and always on the event-loop thread via `run_on_main_thread`.

use std::time::Duration;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::presets::{self, PresetLibrary};
use crate::state::{Action, ScoreboardState, ServerEvent, Shared};
use crate::windows::{self, AppWindow};

pub const DOCS_URL: &str = "https://github.com/d-luca/scoreboard_server#readme";

/// Menu rebuilds coalesce behind the same 500 ms debounce as the preset save,
/// otherwise typing in the label field flickers the menu bar on every
/// keystroke (doc 09 §6.1).
const MENU_REBUILD_DEBOUNCE: Duration = Duration::from_millis(500);

/// Read the current library from state; empty when state is not managed yet
/// (the menu is built once before `manage` in some tests / early shutdown).
fn current_library(app: &AppHandle) -> PresetLibrary {
    app.try_state::<Shared>()
        .map(|state| tauri::async_runtime::block_on(async { state.presets_snapshot().await }))
        .unwrap_or_default()
}

/// Loadout triple out of a scoreboard snapshot.
fn loadout_triple(sb: &ScoreboardState) -> [u32; 3] {
    [sb.timer_loadout1, sb.timer_loadout2, sb.timer_loadout3]
}

/// Read the current loadout triple from state; zeroes when state is not
/// managed yet (same early-build caveat as [`current_library`]). Main-thread
/// only — `block_on` panics when called from inside the async runtime.
fn current_loadouts(app: &AppHandle) -> [u32; 3] {
    app.try_state::<Shared>()
        .map(|state| {
            tauri::async_runtime::block_on(async { loadout_triple(&state.current().await) })
        })
        .unwrap_or_default()
}

/// `MM:SS`, minutes unbounded — mirrors `formatTimer` in
/// `src/lib/format.ts` so the menu label matches the control surfaces.
fn format_loadout(seconds: u32) -> String {
    format!("{:02}:{:02}", seconds / 60, seconds % 60)
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

    let timer_menu = build_timer_menu(app, &current_loadouts(app))?;

    let tools = build_tools_menu(app)?;

    let help = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("help:docs", "Documentation").build(app)?)
        .item(&MenuItemBuilder::with_id("open:about", "About").build(app)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file, &view, &presets_menu, &timer_menu, &tools, &help])
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
    let start = library
        .matches
        .len()
        .saturating_sub(presets::MAX_MENU_FIXTURES);
    for fixture in &library.matches[start..] {
        let label = presets::escape_menu_label(&presets::display_name(library, fixture));
        builder = builder.item(
            &MenuItemBuilder::with_id(format!("preset:load:{}", fixture.id), label).build(app)?,
        );
    }
    builder.build()
}

/// `Timer` submenu: the three loadout shortcuts, moved here from the control
/// surface. The label shows the current value so the operator sees what
/// applying a slot will set; those labels go stale when a loadout changes,
/// so [`spawn_menu_rebuilder`] also watches `ServerEvent::State` for triple
/// changes.
///
/// No accelerators: `Ctrl+1/2/3` stay registered in the webview
/// (`useLocalHotkeys`), whose editable-target guard a native accelerator
/// would bypass (loadout applied while typing in an input).
fn build_timer_menu(app: &AppHandle, loadouts: &[u32; 3]) -> tauri::Result<Submenu<Wry>> {
    let mut builder = SubmenuBuilder::new(app, "Timer");
    for (index, seconds) in loadouts.iter().enumerate() {
        let slot = index + 1;
        builder = builder.item(
            &MenuItemBuilder::with_id(
                format!("timer:loadout:{slot}"),
                format!("Loadout {slot} ({})", format_loadout(*seconds)),
            )
            .build(app)?,
        );
    }
    builder.build()
}

/// Rebuild the whole menu and re-attach it to the `main` window whenever a
/// menu-rendered value changes: the preset library (create/update/delete,
/// and team renames that change a derived label) or a timer loadout value
/// (Settings window, remote patch — both publish `ServerEvent::State`).
/// Triggered from this one subscriber — never from the commands — so no
/// mutation path can forget it (doc 09 §6.1).
///
/// `[RISK]` `set_menu` must run on the event loop; rebuilding from a command's
/// tokio thread hangs or crashes. Never `app.set_menu` — that would attach a
/// menu bar to the frameless overlay windows.
pub fn spawn_menu_rebuilder(app: &AppHandle, shared: Shared) {
    let mut rx = shared.events.subscribe();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // Loadout triple as last rendered into the `Timer` submenu. `State`
        // fires on every timer tick, so rebuild only when the triple itself
        // changes. Read it with `await` here — `current_loadouts` blocks and
        // must stay on the main thread.
        let mut rendered_loadouts = loadout_triple(&shared.current().await);
        loop {
            let mut rebuild = match rx.recv().await {
                Ok(ServerEvent::Presets(_)) => true,
                Ok(ServerEvent::State(snapshot)) => {
                    let triple = loadout_triple(&snapshot);
                    let changed = triple != rendered_loadouts;
                    rendered_loadouts = triple;
                    changed
                }
                Ok(_) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            };
            // Coalesce bursts: wait out the debounce, then fold whatever
            // queued during it into the same rebuild decision.
            tokio::time::sleep(MENU_REBUILD_DEBOUNCE).await;
            while let Ok(event) = rx.try_recv() {
                match event {
                    ServerEvent::Presets(_) => rebuild = true,
                    ServerEvent::State(snapshot) => {
                        let triple = loadout_triple(&snapshot);
                        if triple != rendered_loadouts {
                            rendered_loadouts = triple;
                            rebuild = true;
                        }
                    }
                    _ => {}
                }
            }
            if !rebuild {
                continue;
            }
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
        id if id.starts_with("timer:loadout:") => {
            let Ok(slot) = id.trim_start_matches("timer:loadout:").parse::<u8>() else {
                tracing::warn!(id, "ignoring malformed timer loadout menu id");
                return;
            };
            if let Some(state) = app.try_state::<Shared>() {
                let shared = state.inner().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = shared.dispatch(Action::TimerLoadout { slot }).await {
                        tracing::warn!(?error, slot, "failed to apply timer loadout from menu");
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
