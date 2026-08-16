//! Singleton window manager (tauri-rebuild doc 03 §7bis, doc 01 §9.2).
//!
//! Only `main` is declared in `tauri.conf.json`; every feature window is
//! created on demand, is a singleton keyed by its label, restores its saved
//! geometry (clamped to a visible monitor), and persists geometry changes
//! debounced. Closing `main` exits the app.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use ts_rs::TS;

use crate::state::{ServerEvent, Shared, WindowGeometry};

/// How long after the last move/resize before geometry is written to disk.
const GEOMETRY_SAVE_DEBOUNCE: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum AppWindow {
    Settings,
    Outputs,
    Recording,
    VideoGenerator,
    About,
}

impl AppWindow {
    pub fn label(self) -> &'static str {
        match self {
            Self::Settings => "settings",
            Self::Outputs => "outputs",
            Self::Recording => "recording",
            Self::VideoGenerator => "video-generator",
            Self::About => "about",
        }
    }

    pub fn url(self) -> &'static str {
        match self {
            Self::Settings => "settings.html",
            Self::Outputs => "outputs.html",
            Self::Recording => "recording.html",
            Self::VideoGenerator => "video-generator.html",
            Self::About => "about.html",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Self::Settings => "Settings",
            Self::Outputs => "Outputs & Sharing",
            Self::Recording => "Recording",
            Self::VideoGenerator => "Video Generator",
            Self::About => "About Scoreboard Server",
        }
    }

    /// Default inner size (doc 01 §7 table).
    pub fn size(self) -> (f64, f64) {
        match self {
            Self::Settings => (760.0, 620.0),
            Self::Outputs => (820.0, 640.0),
            Self::Recording => (560.0, 420.0),
            Self::VideoGenerator => (900.0, 700.0),
            Self::About => (420.0, 320.0),
        }
    }

    pub fn min_size(self) -> (f64, f64) {
        match self {
            Self::Settings => (640.0, 520.0),
            Self::Outputs => (700.0, 520.0),
            other => other.size(),
        }
    }

    /// `Esc` closes `settings`, `outputs` and `about` (doc 01 §9.2) —
    /// handled in the frontend via `useEscapeToClose`, not here.
    #[allow(dead_code)]
    pub fn from_label(label: &str) -> Option<Self> {
        match label {
            "settings" => Some(Self::Settings),
            "outputs" => Some(Self::Outputs),
            "recording" => Some(Self::Recording),
            "video-generator" => Some(Self::VideoGenerator),
            "about" => Some(Self::About),
            _ => None,
        }
    }
}

/// Open a feature window, or focus it if it is already open. Never allows
/// two instances of a label.
pub fn open(app: &AppHandle, which: AppWindow) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(which.label()) {
        window.unminimize().ok();
        window.set_focus()?;
        return Ok(());
    }

    let (width, height) = which.size();
    let (min_width, min_height) = which.min_size();
    let mut builder =
        WebviewWindowBuilder::new(app, which.label(), WebviewUrl::App(which.url().into()))
            .title(which.title())
            .inner_size(width, height)
            .min_inner_size(min_width, min_height)
            .resizable(true);

    // Restore saved geometry, clamped to a visible monitor. A window saved
    // on a now-absent second screen must not come back unreachable [RISK].
    let saved = app.try_state::<Shared>().and_then(|state| {
        tauri::async_runtime::block_on(async { state.geometry_for(which.label()).await })
    });
    match saved {
        Some(geometry) if is_visible(app, geometry) => {
            builder = builder.position(geometry.x as f64, geometry.y as f64);
            // Keep the saved size; the default was only a fallback.
            builder = builder.inner_size(geometry.width as f64, geometry.height as f64);
        }
        _ => {
            builder = builder.center();
        }
    }

    let window = builder.build()?;
    wire_window_events(app, &window, which);

    // Restore the persisted zoom level for this label.
    if let Some(state) = app.try_state::<Shared>() {
        let zoom = tauri::async_runtime::block_on(async { state.zoom_for(which.label()).await });
        if (zoom - 1.0).abs() > f64::EPSILON {
            let _ = window.set_zoom(zoom);
        }
        state.publish(ServerEvent::Window(which, true));
    }
    Ok(())
}

pub fn close(app: &AppHandle, which: AppWindow) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(which.label()) {
        window.close()?;
    }
    Ok(())
}

pub fn list_open(app: &AppHandle) -> Vec<AppWindow> {
    [
        AppWindow::Settings,
        AppWindow::Outputs,
        AppWindow::Recording,
        AppWindow::VideoGenerator,
        AppWindow::About,
    ]
    .into_iter()
    .filter(|which| app.get_webview_window(which.label()).is_some())
    .collect()
}

/// True when the geometry's centre lands on any currently attached monitor.
/// All values are physical pixels (both `outer_position`/`inner_size` and
/// `Monitor::position`/`size` are physical), so no scale conversion is needed.
fn is_visible(app: &AppHandle, geometry: WindowGeometry) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        return false;
    };
    let centre_x = geometry.x + geometry.width as i32 / 2;
    let centre_y = geometry.y + geometry.height as i32 / 2;
    monitors.iter().any(|monitor| {
        let pos = monitor.position();
        let size = monitor.size();
        let (mx, my) = (pos.x, pos.y);
        let (mw, mh) = (size.width as i32, size.height as i32);
        centre_x >= mx && centre_x < mx + mw && centre_y >= my && centre_y < my + mh
    })
}

/// Persist geometry (debounced) and emit `window:closed` on close.
fn wire_window_events(app: &AppHandle, window: &WebviewWindow, which: AppWindow) {
    let label = which.label().to_string();
    let app_for_events = app.clone();
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                let Some(window) = app_for_events.get_webview_window(&label) else {
                    return;
                };
                let Ok(position) = window.outer_position() else {
                    return;
                };
                let Ok(size) = window.inner_size() else {
                    return;
                };
                let geometry = WindowGeometry {
                    x: position.x,
                    y: position.y,
                    width: size.width,
                    height: size.height,
                };
                let Some(state) = app_for_events.try_state::<Shared>() else {
                    return;
                };
                let state = (*state).clone();
                let label = label.clone();
                // Debounce: remember immediately, persist 500 ms after the
                // last event for this window.
                tauri::async_runtime::spawn(async move {
                    state.remember_geometry(&label, geometry).await;
                    tokio::time::sleep(GEOMETRY_SAVE_DEBOUNCE).await;
                    // Only persist if this geometry is still the latest.
                    let current = state.geometry_for(&label).await;
                    if current == Some(geometry) {
                        state.persist_prefs().await;
                    }
                });
            }
            tauri::WindowEvent::CloseRequested { .. } => {
                if let Some(state) = app_for_events.try_state::<Shared>() {
                    state.publish(ServerEvent::Window(which, false));
                }
            }
            _ => {}
        }
    });
}

/// Adjust the zoom of the currently focused window (doc 03 §7ter).
pub fn zoom_by(app: &AppHandle, delta: f64) {
    if let Some(window) = focused_window(app) {
        let label = window.label().to_string();
        if let Some(state) = app.try_state::<Shared>() {
            let state = (*state).clone();
            tauri::async_runtime::spawn(async move {
                let zoom = state.zoom_for(&label).await + delta;
                let zoom = state.set_zoom(&label, zoom).await;
                if let Some(window) = state.app.get().and_then(|a| a.get_webview_window(&label)) {
                    let _ = window.set_zoom(zoom);
                }
                state.persist_prefs().await;
            });
        }
    }
}

pub fn zoom_reset(app: &AppHandle) {
    if let Some(window) = focused_window(app) {
        let label = window.label().to_string();
        if let Some(state) = app.try_state::<Shared>() {
            let state = (*state).clone();
            tauri::async_runtime::spawn(async move {
                let zoom = state.set_zoom(&label, 1.0).await;
                if let Some(window) = state.app.get().and_then(|a| a.get_webview_window(&label)) {
                    let _ = window.set_zoom(zoom);
                }
                state.persist_prefs().await;
            });
        }
    }
}

fn focused_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| app.get_webview_window("main"))
}

/// Emit `window:closed` for every feature window still open (used when
/// `main` closes, so listeners see a consistent shutdown).
pub fn close_all(app: &AppHandle) {
    for which in list_open(app) {
        let _ = close(app, which);
    }
}

/// Wire geometry persistence for the `main` window and restore its saved
/// geometry. `main` is declared in `tauri.conf.json`, so it is not built by
/// [`open`] — but its position should still survive a restart (doc 01 §7).
pub fn wire_main_window(app: &AppHandle, window: &WebviewWindow) {
    // Restore saved geometry, clamped to a visible monitor.
    if let Some(state) = app.try_state::<Shared>() {
        let saved = tauri::async_runtime::block_on(async { state.geometry_for("main").await });
        if let Some(geometry) = saved {
            if is_visible(app, geometry) {
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: geometry.x,
                    y: geometry.y,
                }));
                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: geometry.width,
                    height: geometry.height,
                }));
            }
        }
        let zoom = tauri::async_runtime::block_on(async { state.zoom_for("main").await });
        if (zoom - 1.0).abs() > f64::EPSILON {
            let _ = window.set_zoom(zoom);
        }
    }

    // Persist geometry changes (debounced), same as feature windows.
    let app_for_events = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
        ) {
            let Some(window) = app_for_events.get_webview_window("main") else {
                return;
            };
            let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) else {
                return;
            };
            let geometry = WindowGeometry {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            };
            let Some(state) = app_for_events.try_state::<Shared>() else {
                return;
            };
            let state = (*state).clone();
            tauri::async_runtime::spawn(async move {
                state.remember_geometry("main", geometry).await;
                tokio::time::sleep(GEOMETRY_SAVE_DEBOUNCE).await;
                if state.geometry_for("main").await == Some(geometry) {
                    state.persist_prefs().await;
                }
            });
        }
    });
}
