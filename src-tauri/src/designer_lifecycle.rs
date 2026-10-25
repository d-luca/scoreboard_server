use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use ts_rs::TS;

use crate::layouts::{LayoutCommandError, LayoutCommandErrorCode};
use crate::{windows, Shared};

const DESIGNER: &str = "scoreboard-designer";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum DesignerCloseReason {
    CloseDesigner,
    CloseMain,
    Quit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct DesignerCloseRequest {
    pub request_id: String,
    pub reason: DesignerCloseReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum DesignerCloseDecision {
    Allow,
    Cancel,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../../src/bindings/")]
pub struct DesignerCloseError {
    pub request_id: String,
    pub message: String,
}

struct Pending {
    request: DesignerCloseRequest,
    acknowledged: bool,
    resolving: bool,
}

#[derive(Default)]
struct CloseState {
    ready: bool,
    pending: Option<Pending>,
    designer_authorized: bool,
    shutdown_authorized: bool,
    flushed: bool,
}

#[derive(Default)]
pub struct DesignerCloseCoordinator(Mutex<CloseState>);

fn invalid(message: impl Into<String>) -> LayoutCommandError {
    LayoutCommandError {
        code: LayoutCommandErrorCode::InvalidRequest,
        message: message.into(),
        layout_id: None,
        expected_revision: None,
        actual_revision: None,
        diagnostics: vec![],
    }
}

impl CloseState {
    fn request(
        &mut self,
        reason: DesignerCloseReason,
        designer_exists: bool,
    ) -> (bool, Option<DesignerCloseRequest>, bool) {
        if self.shutdown_authorized {
            return (false, None, false);
        }
        if reason == DesignerCloseReason::CloseDesigner && self.designer_authorized {
            self.designer_authorized = false;
            return (false, None, false);
        }
        if !designer_exists {
            return (false, None, false);
        }
        let fresh = self.pending.is_none();
        let pending = self.pending.get_or_insert_with(|| Pending {
            request: DesignerCloseRequest {
                request_id: uuid::Uuid::new_v4().to_string(),
                reason,
            },
            acknowledged: false,
            resolving: false,
        });
        let upgraded = reason > pending.request.reason;
        if upgraded {
            pending.request.reason = reason;
        }
        let notification = (self.ready && (fresh || upgraded)).then(|| pending.request.clone());
        (true, notification, fresh)
    }

    fn pending(&mut self, id: &str) -> Result<&mut Pending, LayoutCommandError> {
        self.pending
            .as_mut()
            .filter(|pending| pending.request.request_id == id)
            .ok_or_else(|| invalid("This close request is no longer active."))
    }

    fn expire(&mut self, id: &str) -> bool {
        if self.pending.as_ref().is_some_and(|pending| {
            pending.request.request_id == id && !pending.acknowledged && !pending.resolving
        }) {
            self.pending = None;
            true
        } else {
            false
        }
    }

    fn finish(&mut self, id: &str) -> Result<DesignerCloseReason, LayoutCommandError> {
        let reason = self.pending(id)?.request.reason;
        self.pending = None;
        if reason == DesignerCloseReason::CloseDesigner {
            self.designer_authorized = true;
        } else {
            self.shutdown_authorized = true;
        }
        Ok(reason)
    }
}

fn visible_error(app: &tauri::AppHandle, request_id: String, message: String) {
    use tauri_plugin_dialog::DialogExt;
    tracing::error!(%message, "designer close cancelled");
    if let Err(error) = app.emit(
        "designer:close-error",
        DesignerCloseError {
            request_id,
            message: message.clone(),
        },
    ) {
        tracing::error!(?error, "failed to notify close cancellation");
    }
    app.dialog()
        .message(message)
        .title("Scoreboard Designer - close cancelled")
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .show(|_| {});
}

fn send(app: &tauri::AppHandle, request: DesignerCloseRequest) {
    let result = app
        .get_webview_window(DESIGNER)
        .ok_or_else(|| "The designer window is unavailable.".to_owned())
        .and_then(|window| {
            window
                .emit("designer:close-requested", &request)
                .map_err(|error| error.to_string())?;
            window.unminimize().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())
        });
    if let Err(error) = result {
        app.state::<DesignerCloseCoordinator>()
            .0
            .lock()
            .expect("designer close lock poisoned")
            .pending = None;
        visible_error(app, request.request_id, error);
    }
}

/// Returns true only when the caller must prevent this native close/exit.
pub fn intercept(app: &tauri::AppHandle, reason: DesignerCloseReason) -> bool {
    let coordinator = app.state::<DesignerCloseCoordinator>();
    let (prevent, notification, deadline) = {
        let mut state = coordinator.0.lock().expect("designer close lock poisoned");
        let result = state.request(reason, app.get_webview_window(DESIGNER).is_some());
        let deadline = result.2.then(|| {
            state
                .pending
                .as_ref()
                .expect("new close request")
                .request
                .request_id
                .clone()
        });
        (result.0, result.1, deadline)
    };
    if let Some(request) = notification {
        send(app, request);
    }
    if let Some(id) = deadline {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(10)).await;
            let expired = app
                .state::<DesignerCloseCoordinator>()
                .0
                .lock()
                .expect("designer close lock poisoned")
                .expire(&id);
            if expired {
                visible_error(
                    &app,
                    id,
                    "The designer did not acknowledge the close request within 10 seconds. Nothing was closed. Wait for it to finish loading, then try again.".into(),
                );
            }
        });
    }
    prevent
}

pub fn destroyed(app: &tauri::AppHandle) {
    let abandoned = {
        let coordinator = app.state::<DesignerCloseCoordinator>();
        let mut state = coordinator.0.lock().expect("designer close lock poisoned");
        state.ready = false;
        state.designer_authorized = false;
        state
            .pending
            .take()
            .map(|pending| pending.request.request_id)
    };
    if let Some(id) = abandoned {
        visible_error(app, id, "The designer disappeared before authorizing this close. Application shutdown was cancelled.".into());
    }
}

pub fn flush_once(app: &tauri::AppHandle) -> bool {
    let coordinator = app.state::<DesignerCloseCoordinator>();
    let mut state = coordinator.0.lock().expect("designer close lock poisoned");
    if state.flushed {
        false
    } else {
        state.flushed = true;
        true
    }
}

pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let reason = match window.label() {
            "main" => Some(DesignerCloseReason::CloseMain),
            DESIGNER => Some(DesignerCloseReason::CloseDesigner),
            _ => None,
        };
        if let Some(reason) = reason {
            if intercept(window.app_handle(), reason) {
                api.prevent_close();
            } else if window.label() == "main" {
                windows::close_all(window.app_handle());
            }
        }
    } else if window.label() == DESIGNER && matches!(event, tauri::WindowEvent::Destroyed) {
        destroyed(window.app_handle());
    }
}

pub fn on_run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    if let tauri::RunEvent::ExitRequested { api, .. } = event {
        if intercept(app, DesignerCloseReason::Quit) {
            api.prevent_exit();
        } else if flush_once(app) {
            app.state::<Shared>().layouts.shutdown();
            crate::recording::flush_on_exit(app.state::<Shared>().inner());
        }
    }
}

fn check_window(window: &tauri::WebviewWindow) -> Result<(), LayoutCommandError> {
    if window.label() == DESIGNER {
        Ok(())
    } else {
        Err(invalid(
            "Only the designer window can answer its close guard.",
        ))
    }
}

#[tauri::command]
pub fn designer_ready(window: tauri::WebviewWindow) -> Result<(), LayoutCommandError> {
    check_window(&window)?;
    let app = window.app_handle();
    let request = {
        let coordinator = app.state::<DesignerCloseCoordinator>();
        let mut state = coordinator.0.lock().expect("designer close lock poisoned");
        state.ready = true;
        state
            .pending
            .as_ref()
            .map(|pending| pending.request.clone())
    };
    if let Some(request) = request {
        send(app, request);
    }
    Ok(())
}

#[tauri::command]
pub fn designer_close_prompt_opened(
    window: tauri::WebviewWindow,
    request_id: String,
) -> Result<(), LayoutCommandError> {
    check_window(&window)?;
    window
        .state::<DesignerCloseCoordinator>()
        .0
        .lock()
        .expect("designer close lock poisoned")
        .pending(&request_id)?
        .acknowledged = true;
    Ok(())
}

#[tauri::command]
pub async fn designer_resolve_close(
    window: tauri::WebviewWindow,
    request_id: String,
    decision: DesignerCloseDecision,
) -> Result<(), LayoutCommandError> {
    check_window(&window)?;
    let app = window.app_handle().clone();
    {
        let coordinator = app.state::<DesignerCloseCoordinator>();
        let mut state = coordinator.0.lock().expect("designer close lock poisoned");
        let pending = state.pending(&request_id)?;
        if pending.resolving {
            return Err(invalid("This close request is already being resolved."));
        }
        if decision == DesignerCloseDecision::Cancel {
            state.pending = None;
            return Ok(());
        }
        pending.resolving = true;
    }
    if let Err(error) = app.state::<Shared>().layouts.drain().await {
        if let Ok(pending) = app
            .state::<DesignerCloseCoordinator>()
            .0
            .lock()
            .expect("designer close lock poisoned")
            .pending(&request_id)
        {
            pending.resolving = false;
        }
        return Err(error);
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    let closing_id = request_id.clone();
    let scheduling = app.run_on_main_thread(move || {
        let reason = handle
            .state::<DesignerCloseCoordinator>()
            .0
            .lock()
            .expect("designer close lock poisoned")
            .finish(&closing_id);
        let result = reason.and_then(|reason| {
            if reason == DesignerCloseReason::CloseDesigner {
                windows::close(&handle, windows::AppWindow::ScoreboardDesigner).map_err(|error| {
                    handle
                        .state::<DesignerCloseCoordinator>()
                        .0
                        .lock()
                        .expect("designer close lock poisoned")
                        .designer_authorized = false;
                    let message = format!("Could not close the designer: {error}");
                    visible_error(&handle, closing_id.clone(), message.clone());
                    invalid(message)
                })
            } else {
                windows::close_all(&handle);
                handle.exit(0);
                Ok(())
            }
        });
        let _ = sender.send(result);
    });
    if let Err(error) = scheduling {
        if let Ok(pending) = app
            .state::<DesignerCloseCoordinator>()
            .0
            .lock()
            .expect("designer close lock poisoned")
            .pending(&request_id)
        {
            pending.resolving = false;
        }
        return Err(invalid(format!(
            "Could not schedule guarded close: {error}"
        )));
    }
    receiver
        .await
        .map_err(|_| invalid("The guarded close was not executed."))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_designer_preserves_normal_close() {
        let mut state = CloseState::default();
        assert!(!state.request(DesignerCloseReason::Quit, false).0);
        assert!(state.pending.is_none());
    }

    #[test]
    fn initializing_designer_waits_and_times_out_without_authorizing() {
        let mut state = CloseState::default();
        let (prevent, notification, deadline) = state.request(DesignerCloseReason::CloseMain, true);
        assert!(prevent && deadline && notification.is_none());
        let id = state.pending.as_ref().unwrap().request.request_id.clone();
        assert!(state.expire(&id));
        assert!(!state.shutdown_authorized);
        assert!(state.pending(&id).is_err());
    }

    #[test]
    fn repeated_and_upgraded_requests_share_one_prompt_and_final_intent() {
        let mut state = CloseState {
            ready: true,
            ..Default::default()
        };
        let (_, request, deadline) = state.request(DesignerCloseReason::CloseDesigner, true);
        let request = request.unwrap();
        assert!(deadline);
        let repeated = state.request(DesignerCloseReason::CloseDesigner, true);
        assert!(repeated.0 && repeated.1.is_none() && !repeated.2);
        state.pending(&request.request_id).unwrap().acknowledged = true;
        let upgraded = state.request(DesignerCloseReason::Quit, true).1.unwrap();
        assert_eq!(upgraded.request_id, request.request_id);
        assert_eq!(upgraded.reason, DesignerCloseReason::Quit);
        assert!(!state.expire(&request.request_id));
        assert_eq!(
            state.finish(&request.request_id).unwrap(),
            DesignerCloseReason::Quit
        );
        assert!(!state.request(DesignerCloseReason::CloseDesigner, true).0);
        assert!(!state.request(DesignerCloseReason::Quit, true).0);
        assert!(state.finish(&request.request_id).is_err());
    }

    #[test]
    fn active_prompt_has_no_timeout_and_cancel_authorizes_nothing() {
        let mut state = CloseState::default();
        state.request(DesignerCloseReason::CloseMain, true);
        let id = state.pending.as_ref().unwrap().request.request_id.clone();
        state.pending(&id).unwrap().acknowledged = true;
        assert!(!state.expire(&id));
        state.pending = None;
        assert!(!state.shutdown_authorized && !state.designer_authorized);
        assert!(state.pending(&id).is_err());
    }

    #[test]
    fn designer_authorization_is_consumed_once_and_stale_deadlines_do_not_cancel_new_work() {
        let mut state = CloseState::default();
        state.request(DesignerCloseReason::CloseDesigner, true);
        let old = state.pending.as_ref().unwrap().request.request_id.clone();
        state.finish(&old).unwrap();
        assert!(!state.request(DesignerCloseReason::CloseDesigner, true).0);
        assert!(state.request(DesignerCloseReason::CloseDesigner, true).0);
        assert!(!state.expire(&old));
        assert!(state.pending.is_some());
    }

    #[cfg(target_os = "linux")]
    #[test]
    #[ignore = "requires a graphical session; run under Xvfb"]
    fn native_close_and_quit_wait_for_permission() {
        use std::sync::mpsc;
        use std::time::Instant;
        use tauri::Listener;

        fn wait_until(condition: impl Fn() -> bool) {
            let deadline = Instant::now() + Duration::from_secs(5);
            while !condition() {
                assert!(Instant::now() < deadline, "native lifecycle did not settle");
                std::thread::sleep(Duration::from_millis(10));
            }
        }

        let state = crate::state::AppState::new();
        let mut context = tauri::generate_context!();
        context.config_mut().app.windows.clear();
        context.config_mut().build.dev_url = None;
        let app = tauri::Builder::default()
            .any_thread()
            .manage(state.clone())
            .manage(DesignerCloseCoordinator::default())
            .on_window_event(on_window_event)
            .build(context)
            .unwrap();
        let handle = app.handle().clone();
        let (sender, receiver) = mpsc::channel();
        handle.listen("designer:close-requested", move |event| {
            sender
                .send(serde_json::from_str::<DesignerCloseRequest>(event.payload()).unwrap())
                .unwrap();
        });
        let worker_state = state.clone();
        let worker = std::thread::spawn(move || {
            let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                for label in ["main", DESIGNER] {
                    tauri::WebviewWindowBuilder::new(
                        &handle,
                        label,
                        tauri::WebviewUrl::External("about:blank".parse().unwrap()),
                    )
                    .build()
                    .unwrap();
                }
                let main = handle.get_webview_window("main").unwrap();
                let designer = handle.get_webview_window(DESIGNER).unwrap();
                let next_request = || receiver.recv_timeout(Duration::from_secs(5)).unwrap();
                let answer =
                    |window: &tauri::WebviewWindow, request: &DesignerCloseRequest, decision| {
                        designer_close_prompt_opened(window.clone(), request.request_id.clone())
                            .unwrap();
                        tauri::async_runtime::block_on(designer_resolve_close(
                            window.clone(),
                            request.request_id.clone(),
                            decision,
                        ))
                        .unwrap();
                    };

                // A close during initialization waits for readiness before notifying the UI.
                main.close().unwrap();
                wait_until(|| {
                    handle
                        .state::<DesignerCloseCoordinator>()
                        .0
                        .lock()
                        .unwrap()
                        .pending
                        .is_some()
                });
                assert!(receiver.try_recv().is_err());
                designer_ready(designer.clone()).unwrap();
                let request = next_request();
                assert_eq!(request.reason, DesignerCloseReason::CloseMain);
                answer(&designer, &request, DesignerCloseDecision::Cancel);
                assert!(handle.get_webview_window("main").is_some());
                assert!(handle.get_webview_window(DESIGNER).is_some());

                // Native close, main close and Quit upgrade a single request without exiting.
                designer.close().unwrap();
                let request = next_request();
                assert_eq!(request.reason, DesignerCloseReason::CloseDesigner);
                main.close().unwrap();
                let upgraded = next_request();
                assert_eq!(upgraded.request_id, request.request_id);
                assert_eq!(upgraded.reason, DesignerCloseReason::CloseMain);
                handle.exit(0);
                let upgraded = next_request();
                assert_eq!(upgraded.request_id, request.request_id);
                assert_eq!(upgraded.reason, DesignerCloseReason::Quit);
                answer(&designer, &upgraded, DesignerCloseDecision::Cancel);
                assert!(
                    !handle
                        .state::<DesignerCloseCoordinator>()
                        .0
                        .lock()
                        .unwrap()
                        .flushed
                );
                tauri::async_runtime::block_on(worker_state.layouts.drain()).unwrap();
                assert!(handle.get_webview_window("main").is_some());
                assert!(handle.get_webview_window(DESIGNER).is_some());

                designer.close().unwrap();
                let request = next_request();
                answer(&designer, &request, DesignerCloseDecision::Allow);
                wait_until(|| handle.get_webview_window(DESIGNER).is_none());
                assert!(handle.get_webview_window("main").is_some());
                assert!(
                    !handle
                        .state::<DesignerCloseCoordinator>()
                        .0
                        .lock()
                        .unwrap()
                        .ready
                );
                tauri::async_runtime::block_on(worker_state.layouts.drain()).unwrap();

                let designer = tauri::WebviewWindowBuilder::new(
                    &handle,
                    DESIGNER,
                    tauri::WebviewUrl::External("about:blank".parse().unwrap()),
                )
                .build()
                .unwrap();
                designer_ready(designer.clone()).unwrap();
                handle.exit(0);
                let request = next_request();
                assert_eq!(request.reason, DesignerCloseReason::Quit);
                answer(&designer, &request, DesignerCloseDecision::Allow);
            }));
            if outcome.is_err() {
                handle
                    .state::<DesignerCloseCoordinator>()
                    .0
                    .lock()
                    .unwrap()
                    .shutdown_authorized = true;
                handle.exit(1);
            }
            outcome
        });
        assert_eq!(app.run_return(on_run_event), 0);
        if let Err(payload) = worker.join().unwrap() {
            std::panic::resume_unwind(payload);
        }
        assert!(tauri::async_runtime::block_on(state.layouts.drain()).is_err());
    }
}
