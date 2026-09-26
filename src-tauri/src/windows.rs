//! Singleton window manager (see docs/architecture.md#windows).
//!
//! Only `main` is declared in `tauri.conf.json`; every feature window is
//! created on demand, is a singleton keyed by its label, restores its saved
//! geometry (clamped to a visible monitor), and persists geometry changes
//! debounced. Closing `main` exits the app.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::PageLoadEvent;
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
    Presets,
}

impl AppWindow {
    pub fn label(self) -> &'static str {
        match self {
            Self::Settings => "settings",
            Self::Outputs => "outputs",
            Self::Recording => "recording",
            Self::VideoGenerator => "video-generator",
            Self::About => "about",
            Self::Presets => "presets",
        }
    }

    pub fn url(self) -> &'static str {
        // Root-absolute so resolution is independent of the `devUrl` shape:
        // in dev `…/pages/x.html` hits the shells under pages/, and the
        // flatten plugin in vite.config.ts emits dist/pages/x.html to match.
        match self {
            Self::Settings => "/pages/settings.html",
            Self::Outputs => "/pages/outputs.html",
            Self::Recording => "/pages/recording.html",
            Self::VideoGenerator => "/pages/video-generator.html",
            Self::About => "/pages/about.html",
            Self::Presets => "/pages/presets.html",
        }
    }

    pub fn title(self) -> &'static str {
        match self {
            Self::Settings => "Settings",
            Self::Outputs => "Outputs & Sharing",
            Self::Recording => "Recording",
            Self::VideoGenerator => "Video Generator",
            Self::About => "About Scoreboard Server",
            Self::Presets => "Presets",
        }
    }

    /// Default inner size.
    pub fn size(self) -> (f64, f64) {
        match self {
            Self::Settings => (760.0, 620.0),
            Self::Outputs => (820.0, 640.0),
            Self::Recording => (560.0, 420.0),
            Self::VideoGenerator => (900.0, 700.0),
            Self::About => (420.0, 320.0),
            Self::Presets => (820.0, 620.0),
        }
    }

    pub fn min_size(self) -> (f64, f64) {
        match self {
            Self::Settings => (640.0, 520.0),
            Self::Outputs => (700.0, 520.0),
            // Master/detail needs the width.
            Self::Presets => (700.0, 520.0),
            other => other.size(),
        }
    }

    /// Whether the window's optional Cargo feature is compiled in; a disabled
    /// feature's window cannot be opened. Core windows are always enabled.
    pub fn enabled(self) -> bool {
        // With both features disabled every `cfg!` is `false` and the match
        // is constant-foldable, tripping clippy's `match_like_matches_macro`;
        // `matches!` would be wrong here (the arms are feature flags, not
        // boolean literals). Allow it only for that build.
        #[cfg_attr(
            all(not(feature = "recording"), not(feature = "video")),
            allow(clippy::match_like_matches_macro)
        )]
        match self {
            Self::Recording => cfg!(feature = "recording"),
            Self::VideoGenerator => cfg!(feature = "video"),
            _ => true,
        }
    }

    /// `Esc` closes `settings`, `outputs` and `about` —
    /// handled in the frontend via `useEscapeToClose`, not here.
    #[allow(dead_code)]
    pub fn from_label(label: &str) -> Option<Self> {
        match label {
            "settings" => Some(Self::Settings),
            "outputs" => Some(Self::Outputs),
            "recording" => Some(Self::Recording),
            "video-generator" => Some(Self::VideoGenerator),
            "about" => Some(Self::About),
            "presets" => Some(Self::Presets),
            _ => None,
        }
    }
}

/// Open a feature window, or focus it if it is already open. Never allows
/// two instances of a label.
pub fn open(app: &AppHandle, which: AppWindow) -> tauri::Result<()> {
    // An optional feature that was compiled out has no window.
    if !which.enabled() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            format!("{which:?} feature is not compiled in"),
        )
        .into());
    }
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
            .resizable(true)
            // Hidden until the page finishes loading, so the window never
            // shows a blank WebView between creation and first paint.
            .visible(false)
            .on_page_load(|window, payload| {
                if payload.event() == PageLoadEvent::Finished {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });

    // Restore saved geometry, clamped to a visible monitor. A window saved
    // on a now-absent second screen must not come back unreachable [RISK].
    let saved = app.try_state::<Shared>().and_then(|state| {
        tauri::async_runtime::block_on(async { state.geometry_for(which.label()).await })
    });
    if let Some(size) = saved.and_then(WindowGeometry::logical_size) {
        builder = builder.inner_size(size.width, size.height);
    }
    let saved_position = saved.filter(|geometry| is_visible(app, *geometry));
    if saved_position.is_none() {
        builder = builder.center();
    }

    let window = builder.build()?;
    if let Some(geometry) = saved_position {
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: geometry.x,
            y: geometry.y,
        }))?;
    }
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
        AppWindow::Presets,
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

fn capture_geometry(window: &WebviewWindow) -> tauri::Result<WindowGeometry> {
    let position = window.outer_position()?;
    let scale_factor = window.scale_factor()?;
    #[cfg(target_os = "linux")]
    let size = {
        use gtk::prelude::GtkWindowExt;
        let (width, height) = window.gtk_window()?.size();
        tauri::LogicalSize::new(width, height).to_physical::<u32>(scale_factor)
    };
    #[cfg(not(target_os = "linux"))]
    let size = window.inner_size()?;
    Ok(WindowGeometry {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        scale_factor,
    })
}

fn remember_window_geometry(app: &AppHandle, window: &WebviewWindow) {
    if !window.is_visible().unwrap_or(false) || window.is_minimized().unwrap_or(true) {
        return;
    }
    let Ok(geometry) = capture_geometry(window) else {
        return;
    };
    if geometry.logical_size().is_none() {
        return;
    }
    let Some(state) = app.try_state::<Shared>() else {
        return;
    };
    let state = (*state).clone();
    let label = window.label().to_string();
    tauri::async_runtime::block_on(state.remember_geometry(&label, geometry));
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(GEOMETRY_SAVE_DEBOUNCE).await;
        if state.geometry_for(&label).await == Some(geometry) {
            state.persist_prefs().await;
        }
    });
}

/// Persist geometry (debounced) and emit `window:closed` on close.
fn wire_window_events(app: &AppHandle, window: &WebviewWindow, which: AppWindow) {
    let label = which.label().to_string();
    let app_for_events = app.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
            let Some(window) = app_for_events.get_webview_window(&label) else {
                return;
            };
            remember_window_geometry(&app_for_events, &window);
        }
        tauri::WindowEvent::CloseRequested { .. } => {
            if let Some(window) = app_for_events.get_webview_window(&label) {
                remember_window_geometry(&app_for_events, &window);
            }
            if let Some(state) = app_for_events.try_state::<Shared>() {
                state.publish(ServerEvent::Window(which, false));
            }
        }
        _ => {}
    });
}

/// Adjust the zoom of the currently focused window.
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
/// [`open`] — but its position should still survive a restart.
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
            }
            if let Some(size) = geometry.logical_size() {
                let _ = window.set_size(tauri::Size::Logical(size));
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
            tauri::WindowEvent::Moved(_)
                | tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::CloseRequested { .. }
        ) {
            let Some(window) = app_for_events.get_webview_window("main") else {
                return;
            };
            remember_window_geometry(&app_for_events, &window);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_geometry_does_not_restore_unreliable_dimensions() {
        let geometry: WindowGeometry =
            serde_json::from_str(r#"{"x":0,"y":0,"width":3820,"height":3388}"#).unwrap();
        assert_eq!(geometry.logical_size(), None);
    }

    #[test]
    fn saved_physical_size_converts_using_its_original_scale() {
        let geometry = WindowGeometry {
            x: 0,
            y: 0,
            width: 1280,
            height: 960,
            scale_factor: 2.0,
        };
        assert_eq!(
            geometry.logical_size(),
            Some(tauri::LogicalSize::new(640.0, 480.0))
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    #[ignore = "requires a graphical session; run under Xvfb with GDK_SCALE=2"]
    fn saved_geometry_survives_repeated_open_and_close() {
        use std::sync::mpsc;
        use std::time::Instant;

        let state = crate::state::AppState::new();
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        context.config_mut().build.dev_url = None;
        let app = tauri::Builder::default()
            .any_thread()
            .manage(state.clone())
            .build(context)
            .unwrap();
        let handle = app.handle().clone();
        let worker = std::thread::spawn(move || {
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let monitor = handle.available_monitors().unwrap().remove(0);
                let size = tauri::LogicalSize::new(640.0, 480.0)
                    .to_physical::<u32>(monitor.scale_factor());
                let expected = WindowGeometry {
                    x: monitor.position().x + 100,
                    y: monitor.position().y + 100,
                    width: size.width,
                    height: size.height,
                    scale_factor: monitor.scale_factor(),
                };
                tauri::async_runtime::block_on(state.remember_geometry("about", expected));

                for iteration in 0..4 {
                    open(&handle, AppWindow::About).unwrap();
                    let window = handle.get_webview_window("about").unwrap();
                    let (sender, receiver) = mpsc::channel();
                    window.on_window_event(move |event| {
                        let _ = sender.send(matches!(event, tauri::WindowEvent::Destroyed));
                    });
                    window.show().unwrap();
                    let deadline = Instant::now() + Duration::from_secs(10);
                    while receiver.recv_timeout(Duration::from_millis(750)).is_ok() {
                        assert!(Instant::now() < deadline, "window did not settle");
                    }
                    assert_eq!(
                        window
                            .as_ref()
                            .size()
                            .unwrap()
                            .to_logical::<f64>(window.scale_factor().unwrap()),
                        expected.logical_size().unwrap(),
                        "incorrect restored size on opening {iteration}"
                    );
                    let saved = tauri::async_runtime::block_on(state.geometry_for("about"))
                        .expect("geometry was not saved");
                    assert_eq!(
                        saved.logical_size(),
                        expected.logical_size(),
                        "incorrect saved size on opening {iteration}"
                    );
                    close(&handle, AppWindow::About).unwrap();
                    loop {
                        if receiver.recv_timeout(Duration::from_secs(5)).unwrap() {
                            break;
                        }
                        assert!(Instant::now() < deadline, "window did not close");
                    }
                }
            }));
            handle.exit(0);
            outcome
        });
        app.run_return(|_, event| {
            if let tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                api.prevent_exit();
            }
        });
        if let Err(payload) = worker.join().unwrap() {
            std::panic::resume_unwind(payload);
        }
    }
}
