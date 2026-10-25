use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex, OnceLock, RwLock};
use std::thread::{self, JoinHandle};

use tokio::sync::oneshot;

use super::storage::{empty_document, ready_status, storage_error, LoadedStorage, Storage};
use super::*;

#[derive(Debug, Clone)]
pub enum LayoutServiceEvent {
    LibraryChanged(LayoutLibraryChanged),
    Published(PublishedLayoutSnapshot),
    StorageWarning(LayoutStorageStatus),
}

type Notifier = OnceLock<Box<dyn Fn(LayoutServiceEvent) + Send + Sync>>;
type Reply = oneshot::Sender<Result<LayoutMutationResult, LayoutCommandError>>;

enum Mutation {
    Create {
        name: String,
        definition: LayoutDefinition,
    },
    Save {
        id: String,
        revision: u64,
        name: String,
        definition: LayoutDefinition,
    },
    Rename {
        id: String,
        revision: u64,
        name: String,
    },
    Delete {
        id: String,
        revision: u64,
    },
    Apply {
        selection: SavedLayoutSelection,
        revision: u64,
    },
    Recover {
        token: String,
    },
}

enum Request {
    Mutation { mutation: Mutation, reply: Reply },
    Drain(oneshot::Sender<()>),
}

/// A single owned worker finishes accepted transactions even if the requester disappears.
pub struct LayoutService {
    sender: Mutex<Option<mpsc::Sender<Request>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
    snapshot: Arc<RwLock<LayoutLibrarySnapshot>>,
    notifier: Arc<Notifier>,
    #[cfg(test)]
    storage: Arc<Storage>,
}

impl LayoutService {
    pub fn load(app: &tauri::AppHandle) -> Self {
        use tauri::Manager;
        let path = match app.path().app_config_dir() {
            Ok(directory) => Some(directory.join("layouts.json")),
            Err(error) => {
                tracing::error!(?error, "cannot resolve layout configuration directory");
                None
            }
        };
        Self::start(Storage::new(path))
    }

    pub fn load_from(path: PathBuf) -> Self {
        Self::start(Storage::new(Some(path)))
    }

    fn start(storage: Storage) -> Self {
        let loaded = storage.load();
        let session_id = uuid::Uuid::new_v4().to_string();
        let snapshot = Arc::new(RwLock::new(snapshot(&loaded, &session_id)));
        let notifier = Arc::new(OnceLock::new());
        let storage = Arc::new(storage);
        let (sender, receiver) = mpsc::channel::<Request>();
        let worker_snapshot = snapshot.clone();
        let worker_notifier = notifier.clone();
        let worker_storage = storage.clone();
        let worker = thread::Builder::new()
            .name("layout-storage".into())
            .spawn(move || {
                let mut loaded = loaded;
                for request in receiver {
                    let Request::Mutation { mutation, reply } = request else {
                        if let Request::Drain(reply) = request {
                            let _ = reply.send(());
                        }
                        continue;
                    };
                    let result = transact(
                        &worker_storage,
                        &mut loaded,
                        &session_id,
                        mutation,
                        &worker_snapshot,
                        &worker_notifier,
                    );
                    // A closed receiver does not cancel or roll back a committed transaction.
                    let _ = reply.send(result);
                }
            })
            .expect("cannot start layout storage worker");
        Self {
            sender: Mutex::new(Some(sender)),
            worker: Mutex::new(Some(worker)),
            snapshot,
            notifier,
            #[cfg(test)]
            storage,
        }
    }

    pub fn snapshot(&self) -> LayoutLibrarySnapshot {
        self.snapshot
            .read()
            .expect("layout snapshot lock poisoned")
            .clone()
    }

    pub fn published(&self) -> PublishedLayoutSnapshot {
        self.snapshot
            .read()
            .expect("layout snapshot lock poisoned")
            .published
            .clone()
    }

    pub fn set_notifier(&self, notify: impl Fn(LayoutServiceEvent) + Send + Sync + 'static) {
        assert!(
            self.notifier.set(Box::new(notify)).is_ok(),
            "layout notifier already attached"
        );
    }

    pub async fn create(
        &self,
        name: String,
        definition: LayoutDefinition,
    ) -> Result<LayoutMutationResult, LayoutCommandError> {
        self.submit(Mutation::Create { name, definition }).await
    }

    pub async fn save(
        &self,
        id: String,
        expected_revision: u64,
        name: String,
        definition: LayoutDefinition,
    ) -> Result<LayoutMutationResult, LayoutCommandError> {
        self.submit(Mutation::Save {
            id,
            revision: expected_revision,
            name,
            definition,
        })
        .await
    }

    pub async fn rename(
        &self,
        id: String,
        expected_revision: u64,
        name: String,
    ) -> Result<LayoutMutationResult, LayoutCommandError> {
        self.submit(Mutation::Rename {
            id,
            revision: expected_revision,
            name,
        })
        .await
    }

    pub async fn delete(
        &self,
        id: String,
        expected_revision: u64,
    ) -> Result<LayoutMutationResult, LayoutCommandError> {
        self.submit(Mutation::Delete {
            id,
            revision: expected_revision,
        })
        .await
    }

    pub async fn apply(
        &self,
        selection: SavedLayoutSelection,
        expected_published_revision: u64,
    ) -> Result<LayoutMutationResult, LayoutCommandError> {
        self.submit(Mutation::Apply {
            selection,
            revision: expected_published_revision,
        })
        .await
    }

    pub async fn recover(
        &self,
        expected_recovery_token: String,
    ) -> Result<LayoutMutationResult, LayoutCommandError> {
        self.submit(Mutation::Recover {
            token: expected_recovery_token,
        })
        .await
    }

    async fn submit(&self, mutation: Mutation) -> Result<LayoutMutationResult, LayoutCommandError> {
        let (reply, response) = oneshot::channel();
        self.sender
            .lock()
            .expect("layout queue lock poisoned")
            .as_ref()
            .ok_or_else(|| storage_error("Layout service is shutting down."))?
            .send(Request::Mutation { mutation, reply })
            .map_err(|_| storage_error("Layout storage worker is unavailable."))?;
        response.await.map_err(|_| {
            storage_error("Layout storage worker stopped before completing the request.")
        })?
    }

    /// Await previously accepted writes without shutting down the shared service.
    pub async fn drain(&self) -> Result<(), LayoutCommandError> {
        let (reply, response) = oneshot::channel();
        self.sender
            .lock()
            .expect("layout queue lock poisoned")
            .as_ref()
            .ok_or_else(|| storage_error("Layout service is shutting down."))?
            .send(Request::Drain(reply))
            .map_err(|_| storage_error("Layout storage worker is unavailable."))?;
        response
            .await
            .map_err(|_| storage_error("Layout storage drain was interrupted."))
    }

    /// Stop accepting work, drain every accepted request, then join the worker.
    pub fn shutdown(&self) {
        self.sender
            .lock()
            .expect("layout queue lock poisoned")
            .take();
        if let Some(worker) = self
            .worker
            .lock()
            .expect("layout worker lock poisoned")
            .take()
        {
            // The last AppState reference can be released by its event callback.
            if worker.thread().id() != thread::current().id() && worker.join().is_err() {
                tracing::error!("layout storage worker panicked during shutdown");
            }
        }
    }
}

impl Drop for LayoutService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn snapshot(loaded: &LoadedStorage, session_id: &str) -> LayoutLibrarySnapshot {
    LayoutLibrarySnapshot {
        session_id: session_id.to_owned(),
        storage_revision: loaded.document.storage_revision,
        entries: loaded.document.entries.clone(),
        published: PublishedLayoutSnapshot {
            session_id: session_id.to_owned(),
            revision: loaded.document.published.revision,
            selection: loaded.document.published.selection.clone(),
        },
        storage_status: loaded.status.clone(),
    }
}

fn notify(notifier: &Notifier, event: LayoutServiceEvent) {
    if let Some(notify) = notifier.get() {
        notify(event);
    }
}

fn install(
    loaded: &LoadedStorage,
    session_id: &str,
    shared: &RwLock<LayoutLibrarySnapshot>,
    notifier: &Notifier,
    publication_changed: bool,
) -> LayoutLibrarySnapshot {
    let current = snapshot(loaded, session_id);
    *shared.write().expect("layout snapshot lock poisoned") = current.clone();
    notify(
        notifier,
        LayoutServiceEvent::LibraryChanged(LayoutLibraryChanged {
            session_id: session_id.to_owned(),
            storage_revision: current.storage_revision,
        }),
    );
    if publication_changed {
        notify(
            notifier,
            LayoutServiceEvent::Published(current.published.clone()),
        );
    }
    current
}

fn transact(
    storage: &Storage,
    loaded: &mut LoadedStorage,
    session_id: &str,
    mutation: Mutation,
    shared: &RwLock<LayoutLibrarySnapshot>,
    notifier: &Notifier,
) -> Result<LayoutMutationResult, LayoutCommandError> {
    if let Mutation::Recover { token } = mutation {
        return recover(storage, loaded, session_id, token, shared, notifier);
    }
    if loaded.status.state == LayoutStorageState::Blocked {
        return Err(command_error(LayoutCommandErrorCode::StorageBlocked, "Layout storage is blocked. Back up and reset it, or restore a compatible file while the app is closed."));
    }
    let mut next = loaded.document.clone();
    let affected_id = match mutation {
        Mutation::Create { name, definition } => {
            let definition = normalize_definition(definition)?;
            let id = uuid::Uuid::new_v4().to_string();
            next.entries.push(SavedLayout {
                id: id.clone(),
                name: name.trim().to_owned(),
                revision: 1,
                definition,
            });
            Some(id)
        }
        Mutation::Save {
            id,
            revision,
            name,
            definition,
        } => {
            let entry = expected_entry(&mut next, &id, revision)?;
            let definition = normalize_definition(definition)?;
            let name = name.trim().to_owned();
            if name != entry.name || definition != normalize_definition(entry.definition.clone())? {
                entry.revision = checked_next_revision(entry.revision)?;
                entry.name = name;
                entry.definition = definition;
            }
            Some(id)
        }
        Mutation::Rename { id, revision, name } => {
            let entry = expected_entry(&mut next, &id, revision)?;
            let name = name.trim().to_owned();
            if name != entry.name {
                entry.revision = checked_next_revision(entry.revision)?;
                entry.name = name;
            }
            Some(id)
        }
        Mutation::Delete { id, revision } => {
            if id == "classic" {
                return Err(command_error(
                    LayoutCommandErrorCode::ProtectedLayout,
                    "Classic cannot be deleted.",
                ));
            }
            expected_entry(&mut next, &id, revision)?;
            if matches!(&next.published.selection, PublishedLayoutSelection::Custom { source_id, .. } if source_id == &id)
            {
                return Err(command_error(
                    LayoutCommandErrorCode::ProtectedLayout,
                    "Apply another layout before deleting the published source.",
                ));
            }
            next.entries.retain(|entry| entry.id != id);
            Some(id)
        }
        Mutation::Apply {
            selection,
            revision,
        } => {
            validate_saved_selection(&selection)?;
            check_revision(None, revision, next.published.revision)?;
            let (selection, id) = match selection {
                SavedLayoutSelection::Classic {} => (PublishedLayoutSelection::Classic {}, None),
                SavedLayoutSelection::Custom {
                    id,
                    expected_revision,
                } => {
                    let entry = expected_entry(&mut next, &id, expected_revision)?;
                    (
                        PublishedLayoutSelection::Custom {
                            source_id: id.clone(),
                            source_revision: entry.revision,
                            source_name: entry.name.clone(),
                            root: entry.definition.root.clone(),
                        },
                        Some(id),
                    )
                }
            };
            if selection != next.published.selection {
                next.published = StoredPublishedLayout {
                    revision: checked_next_revision(next.published.revision)?,
                    selection,
                };
            }
            id
        }
        Mutation::Recover { .. } => unreachable!(),
    };
    validate_storage_document(&next)?;
    if next == loaded.document {
        return Ok(LayoutMutationResult {
            library: snapshot(loaded, session_id),
            affected_id,
        });
    }
    next.storage_revision = checked_next_revision(next.storage_revision)?;
    validate_storage_document(&next)?;
    storage.write(&next)?;
    let publication_changed = next.published != loaded.document.published;
    loaded.document = next;
    let library = install(loaded, session_id, shared, notifier, publication_changed);
    Ok(LayoutMutationResult {
        library,
        affected_id,
    })
}

fn recover(
    storage: &Storage,
    loaded: &mut LoadedStorage,
    session_id: &str,
    token: String,
    shared: &RwLock<LayoutLibrarySnapshot>,
    notifier: &Notifier,
) -> Result<LayoutMutationResult, LayoutCommandError> {
    if loaded.status.state != LayoutStorageState::Blocked
        || loaded.status.recovery_token.as_deref() != Some(&token)
    {
        return Err(command_error(
            LayoutCommandErrorCode::RecoveryConflict,
            "The recovery warning changed. Reload it before confirming recovery.",
        ));
    }
    let current = storage.load();
    if current.identity != loaded.identity {
        *loaded = current;
        install(loaded, session_id, shared, notifier, true);
        notify(
            notifier,
            LayoutServiceEvent::StorageWarning(loaded.status.clone()),
        );
        return Err(command_error(LayoutCommandErrorCode::RecoveryConflict, "The layout file changed. The current storage status has been reloaded; review it before continuing."));
    }
    let mut next = empty_document();
    next.storage_revision = checked_next_revision(loaded.document.storage_revision)?;
    next.published.revision = checked_next_revision(loaded.document.published.revision)?;
    validate_storage_document(&next)?;
    let backup = storage.backup()?;
    // Recheck after copying, before replacing the only authoritative original.
    let current = storage.load();
    if current.identity != loaded.identity {
        *loaded = current;
        loaded.status.backup_path = Some(backup.to_string_lossy().into_owned());
        install(loaded, session_id, shared, notifier, true);
        notify(
            notifier,
            LayoutServiceEvent::StorageWarning(loaded.status.clone()),
        );
        return Err(command_error(
            LayoutCommandErrorCode::RecoveryConflict,
            "The layout file changed during backup. It has not been reset.",
        ));
    }
    storage.write(&next)?;
    loaded.document = next;
    loaded.status = ready_status(Some(backup.to_string_lossy().into_owned()));
    let library = install(loaded, session_id, shared, notifier, true);
    notify(
        notifier,
        LayoutServiceEvent::StorageWarning(loaded.status.clone()),
    );
    Ok(LayoutMutationResult {
        library,
        affected_id: None,
    })
}

fn expected_entry<'a>(
    document: &'a mut LayoutStorageDocument,
    id: &str,
    revision: u64,
) -> Result<&'a mut SavedLayout, LayoutCommandError> {
    validate_saved_selection(&SavedLayoutSelection::Custom {
        id: id.to_owned(),
        expected_revision: revision,
    })?;
    let entry = document
        .entries
        .iter_mut()
        .find(|entry| entry.id == id)
        .ok_or_else(|| {
            command_error(
                LayoutCommandErrorCode::NotFound,
                "The saved layout does not exist.",
            )
        })?;
    check_revision(Some(id), revision, entry.revision)?;
    Ok(entry)
}

fn check_revision(id: Option<&str>, expected: u64, actual: u64) -> Result<(), LayoutCommandError> {
    if expected > MAX_LAYOUT_REVISION {
        return Err(command_error(
            LayoutCommandErrorCode::InvalidRequest,
            "The expected revision is outside JavaScript's exact integer range.",
        ));
    }
    if expected != actual {
        let mut error = command_error(
            LayoutCommandErrorCode::RevisionConflict,
            "The layout changed. Reload and reconcile before retrying.",
        );
        error.layout_id = id.map(str::to_owned);
        error.expected_revision = Some(expected);
        error.actual_revision = Some(actual);
        return Err(error);
    }
    Ok(())
}

pub(super) fn command_error(
    code: LayoutCommandErrorCode,
    message: impl Into<String>,
) -> LayoutCommandError {
    LayoutCommandError {
        code,
        message: message.into(),
        layout_id: None,
        expected_revision: None,
        actual_revision: None,
        diagnostics: Vec::new(),
    }
}

fn normalize_definition(
    mut definition: LayoutDefinition,
) -> Result<LayoutDefinition, LayoutCommandError> {
    for layer in &mut definition.editor.layers {
        layer.label = layer.label.trim().to_owned();
    }
    validate_definition(&definition)?;
    normalize_color(&mut definition.root.background);
    normalize_elements(&mut definition.root.children);
    Ok(definition)
}

fn normalize_color(color: &mut LayoutColor) {
    if let LayoutColor::Literal { hex, .. } = color {
        hex.make_ascii_uppercase();
    }
}

fn normalize_elements(elements: &mut [LayoutElement]) {
    for element in elements {
        match element {
            LayoutElement::Container {
                r#box, children, ..
            } => {
                normalize_box(r#box);
                normalize_elements(children);
            }
            LayoutElement::Value {
                r#box, text_style, ..
            }
            | LayoutElement::Text {
                r#box, text_style, ..
            } => {
                normalize_box(r#box);
                normalize_color(&mut text_style.color);
            }
            LayoutElement::Rectangle { r#box, .. } => normalize_box(r#box),
            LayoutElement::Separator { color, .. } => normalize_color(color),
        }
    }
}

fn normalize_box(style: &mut LayoutBoxStyle) {
    normalize_color(&mut style.background);
    normalize_color(&mut style.border_color);
}

/// Duplicate remains a private draft until the caller explicitly saves it with create.
pub fn duplicate_layout_draft(
    source: &SavedLayout,
) -> Result<(String, LayoutDefinition), LayoutCommandError> {
    validate_definition(&source.definition)?;
    let mut definition = source.definition.clone();
    let mut ids = std::collections::HashMap::new();
    ids.insert(definition.root.id.clone(), uuid::Uuid::new_v4().to_string());
    fn replace(
        elements: &mut [LayoutElement],
        ids: &mut std::collections::HashMap<String, String>,
    ) {
        for element in elements {
            let id = match element {
                LayoutElement::Container { id, children, .. } => {
                    replace(children, ids);
                    id
                }
                LayoutElement::Value { id, .. }
                | LayoutElement::Text { id, .. }
                | LayoutElement::Rectangle { id, .. }
                | LayoutElement::Separator { id, .. } => id,
            };
            let next = uuid::Uuid::new_v4().to_string();
            ids.insert(id.clone(), next.clone());
            *id = next;
        }
    }
    replace(&mut definition.root.children, &mut ids);
    definition.root.id = ids[&definition.root.id].clone();
    for layer in &mut definition.editor.layers {
        layer.node_id = ids[&layer.node_id].clone();
    }
    let name: String = source
        .name
        .chars()
        .take(MAX_LAYOUT_NAME_CHARS - " copy".len())
        .collect();
    Ok((format!("{} copy", name.trim_end()), definition))
}

#[cfg(test)]
#[path = "service_tests.rs"]
pub(super) mod tests;
