use std::fs;
use std::io;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::Duration;

use serde_json::json;

use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::layouts) enum Stage {
    Write,
    Sync,
    Replace,
    Backup,
    Committed,
}

type Pause = (Stage, Sender<()>, Receiver<()>);

#[derive(Default)]
pub(in crate::layouts) struct StorageHooks {
    fail: Mutex<Option<Stage>>,
    pause: Mutex<Option<Pause>>,
}

impl StorageHooks {
    pub fn check(&self, stage: Stage) -> io::Result<()> {
        self.pause(stage);
        let mut failure = self.fail.lock().unwrap();
        if *failure == Some(stage) {
            *failure = None;
            return Err(io::Error::other(format!("injected {stage:?} failure")));
        }
        Ok(())
    }

    pub fn pause(&self, stage: Stage) {
        let pause = {
            let mut pause = self.pause.lock().unwrap();
            if pause.as_ref().is_some_and(|(at, _, _)| *at == stage) {
                pause.take()
            } else {
                None
            }
        };
        if let Some((_, reached, resume)) = pause {
            reached.send(()).unwrap();
            resume.recv_timeout(Duration::from_secs(10)).unwrap();
        }
    }
}

struct Fixture {
    directory: PathBuf,
    path: PathBuf,
    service: Arc<LayoutService>,
    events: Receiver<LayoutServiceEvent>,
}

impl Fixture {
    fn new(bytes: Option<&[u8]>) -> Self {
        let directory =
            std::env::temp_dir().join(format!("sb-layout-service-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let path = directory.join("layouts.json");
        if let Some(bytes) = bytes {
            fs::write(&path, bytes).unwrap();
        }
        let service = Arc::new(LayoutService::load_from(path.clone()));
        let (sender, events) = mpsc::channel();
        service.set_notifier(move |event| sender.send(event).unwrap());
        Self {
            directory,
            path,
            service,
            events,
        }
    }

    fn fail(&self, stage: Stage) {
        *self.service.storage.hooks.fail.lock().unwrap() = Some(stage);
    }

    fn pause(&self, stage: Stage) -> (Receiver<()>, Sender<()>) {
        let (reached_tx, reached_rx) = mpsc::channel();
        let (resume_tx, resume_rx) = mpsc::channel();
        *self.service.storage.hooks.pause.lock().unwrap() = Some((stage, reached_tx, resume_rx));
        (reached_rx, resume_tx)
    }

    async fn create(&self) -> SavedLayout {
        self.service
            .create("Layout".into(), definition())
            .await
            .unwrap()
            .library
            .entries[0]
            .clone()
    }

    fn drain_events(&self) -> Vec<LayoutServiceEvent> {
        self.events.try_iter().collect()
    }

    fn disk(&self) -> LayoutStorageDocument {
        decode_storage_document(&fs::read(&self.path).unwrap()).unwrap()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.service.shutdown();
        fs::remove_dir_all(&self.directory).unwrap();
    }
}

fn id(number: u8) -> String {
    format!("00000000-0000-4000-8000-{number:012x}")
}

fn definition() -> LayoutDefinition {
    let color = json!({"kind": "literal", "hex": "#aabbcc", "alpha": 0.5});
    let style = json!({"background": color, "borderColor": color, "borderWidth": 1, "radius": 2});
    let frame = json!({"x": 0, "y": 0, "width": {"kind": "fixed", "pixels": 80}, "height": {"kind": "fixed", "pixels": 40}});
    serde_json::from_value(json!({
        "root": {
            "kind": "root", "id": id(0), "width": 622, "height": 80, "background": color,
            "children": [{
                "kind": "container", "id": id(1), "hidden": false, "frame": frame, "box": style,
                "padding": {"top": 0, "right": 0, "bottom": 0, "left": 0},
                "mode": "free", "gap": 0, "mainAlign": "start", "crossAlign": "start",
                "children": [{
                    "kind": "text", "id": id(2), "hidden": false, "frame": frame, "box": style, "text": "First\nSecond",
                    "textStyle": {"font": {"family": "anton", "weight": 400}, "fontSize": 32,
                        "color": color, "horizontalAlign": "center", "verticalAlign": "center"}
                }]
            }]
        },
        "editor": {"layers": [
            {"nodeId": id(0), "label": "Root", "locked": false},
            {"nodeId": id(1), "label": "Container", "locked": true},
            {"nodeId": id(2), "label": "Text", "locked": false}
        ]}
    })).unwrap()
}

fn custom(entry: &SavedLayout) -> SavedLayoutSelection {
    SavedLayoutSelection::Custom {
        id: entry.id.clone(),
        expected_revision: entry.revision,
    }
}

#[test]
fn absent_file_starts_ready_without_promoting_temporary_files() {
    let fixture = Fixture::new(None);
    let current = fixture.service.snapshot();
    assert!(current.entries.is_empty());
    assert_eq!(current.storage_revision, 0);
    assert_eq!(current.published.revision, 0);
    assert_eq!(current.storage_status.state, LayoutStorageState::Ready);
    assert!(matches!(
        current.published.selection,
        PublishedLayoutSelection::Classic {}
    ));
    assert!(!fixture.path.exists());
    fs::write(
        fixture.path.with_extension("json.tmp"),
        b"not authoritative",
    )
    .unwrap();
    let restarted = LayoutService::load_from(fixture.path.clone());
    assert_eq!(restarted.snapshot().storage_revision, 0);
    assert_ne!(current.session_id, restarted.snapshot().session_id);
}

#[tokio::test]
async fn published_revision_one_survives_saved_revision_two_and_restart() {
    let fixture = Fixture::new(None);
    let saved = fixture.create().await;
    let applied = fixture.service.apply(custom(&saved), 0).await.unwrap();
    assert_eq!(applied.affected_id, Some(saved.id.clone()));
    let mut changed = saved.definition.clone();
    changed.root.width = 1000;
    fixture
        .service
        .save(saved.id.clone(), 1, "Changed".into(), changed)
        .await
        .unwrap();
    let renamed = fixture
        .service
        .rename(saved.id.clone(), 2, "Renamed".into())
        .await
        .unwrap();
    assert_eq!(renamed.library.entries[0].revision, 3);
    assert_eq!(renamed.library.published, applied.library.published);
    let restarted = LayoutService::load_from(fixture.path.clone());
    let restored = restarted.snapshot();
    assert_eq!(
        restored.published.selection,
        applied.library.published.selection
    );
    assert_eq!(restored.published.revision, 1);
    assert_eq!(restored.entries[0].revision, 3);
    assert_eq!(restored.entries[0].definition.root.width, 1000);
    assert_eq!(restored.storage_revision, 4);
    assert_eq!(
        fixture.disk().published.selection,
        applied.library.published.selection
    );
}

#[tokio::test]
async fn saves_are_canonical_noops_are_durable_and_stale_noops_conflict() {
    let fixture = Fixture::new(None);
    let mut input = definition();
    input.editor.layers[0].label = "  Root  ".into();
    let created = fixture
        .service
        .create("  Layout  ".into(), input)
        .await
        .unwrap();
    let saved = created.library.entries[0].clone();
    assert_eq!(saved.name, "Layout");
    assert_eq!(saved.definition.editor.layers[0].label, "Root");
    let value = serde_json::to_string(&saved.definition).unwrap();
    assert!(value.contains("#AABBCC"));
    assert!(!value.contains("#aabbcc"));
    let before = fs::read(&fixture.path).unwrap();
    fixture.drain_events();
    let same = fixture
        .service
        .save(saved.id.clone(), 1, " Layout ".into(), definition())
        .await
        .unwrap();
    assert_eq!(same.library, created.library);
    fixture
        .service
        .rename(saved.id.clone(), 1, "Layout".into())
        .await
        .unwrap();
    assert_eq!(before, fs::read(&fixture.path).unwrap());
    assert!(fixture.drain_events().is_empty());
    fixture
        .service
        .rename(saved.id.clone(), 1, "New".into())
        .await
        .unwrap();
    let conflict = fixture
        .service
        .save(saved.id.clone(), 1, "New".into(), saved.definition)
        .await
        .unwrap_err();
    assert_eq!(conflict.code, LayoutCommandErrorCode::RevisionConflict);
    assert_eq!(conflict.expected_revision, Some(1));
    assert_eq!(conflict.actual_revision, Some(2));
    assert_eq!(conflict.layout_id, Some(saved.id));
}

#[tokio::test]
async fn apply_checks_both_revisions_and_metadata_changes_are_publications() {
    let fixture = Fixture::new(None);
    let saved = fixture.create().await;
    let applied = fixture.service.apply(custom(&saved), 0).await.unwrap();
    fixture.drain_events();
    let no_op = fixture.service.apply(custom(&saved), 1).await.unwrap();
    assert_eq!(no_op.library, applied.library);
    assert!(fixture.drain_events().is_empty());
    let renamed = fixture
        .service
        .rename(saved.id.clone(), 1, "New name".into())
        .await
        .unwrap()
        .library
        .entries[0]
        .clone();
    assert_eq!(
        fixture
            .service
            .apply(custom(&saved), 1)
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::RevisionConflict
    );
    assert_eq!(
        fixture
            .service
            .apply(custom(&renamed), 0)
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::RevisionConflict
    );
    assert_eq!(fixture.service.published(), applied.library.published);
    fixture.drain_events();
    let updated = fixture.service.apply(custom(&renamed), 1).await.unwrap();
    assert_eq!(updated.library.published.revision, 2);
    assert_eq!(updated.library.entries[0], renamed);
    assert_eq!(fixture.drain_events().len(), 2);
    let classic = fixture
        .service
        .apply(SavedLayoutSelection::Classic {}, 2)
        .await
        .unwrap();
    assert_eq!(classic.affected_id, None);
    assert_eq!(classic.library.published.revision, 3);
}

#[tokio::test]
async fn deletion_protects_classic_and_published_source_and_rejects_missing_ids() {
    let fixture = Fixture::new(None);
    assert_eq!(
        fixture
            .service
            .delete("classic".into(), 1)
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::ProtectedLayout
    );
    let saved = fixture.create().await;
    fixture.service.apply(custom(&saved), 0).await.unwrap();
    assert_eq!(
        fixture
            .service
            .delete(saved.id.clone(), 1)
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::ProtectedLayout
    );
    fixture
        .service
        .apply(SavedLayoutSelection::Classic {}, 1)
        .await
        .unwrap();
    assert_eq!(
        fixture
            .service
            .delete(saved.id.clone(), 2)
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::RevisionConflict
    );
    let deleted = fixture.service.delete(saved.id.clone(), 1).await.unwrap();
    assert_eq!(deleted.affected_id, Some(saved.id.clone()));
    assert!(deleted.library.entries.is_empty());
    assert_eq!(
        fixture.service.delete(saved.id, 1).await.unwrap_err().code,
        LayoutCommandErrorCode::NotFound
    );
}

#[tokio::test]
async fn duplicate_is_private_until_create_and_replaces_every_node_reference() {
    let fixture = Fixture::new(None);
    let mut saved = fixture.create().await;
    saved.name = "é".repeat(MAX_LAYOUT_NAME_CHARS);
    let before = fixture.service.snapshot();
    fixture.drain_events();
    let (name, draft) = duplicate_layout_draft(&saved).unwrap();
    assert_eq!(name.chars().count(), MAX_LAYOUT_NAME_CHARS);
    assert!(name.ends_with(" copy"));
    validate_definition(&draft).unwrap();
    for (old, new) in saved
        .definition
        .editor
        .layers
        .iter()
        .zip(&draft.editor.layers)
    {
        assert_ne!(old.node_id, new.node_id);
        assert_eq!(old.label, new.label);
        assert_eq!(old.locked, new.locked);
    }
    assert_eq!(fixture.service.snapshot(), before);
    assert!(fixture.drain_events().is_empty());
    let created = fixture.service.create(name, draft).await.unwrap();
    assert_eq!(created.library.entries.len(), 2);
    assert_eq!(created.library.entries[1].revision, 1);
    assert_ne!(created.library.entries[1].id, saved.id);
}

#[tokio::test]
async fn failed_write_sync_or_replace_preserves_file_memory_and_publication() {
    for stage in [Stage::Write, Stage::Sync, Stage::Replace] {
        let fixture = Fixture::new(None);
        let saved = fixture.create().await;
        let before = fixture.service.snapshot();
        let bytes = fs::read(&fixture.path).unwrap();
        fixture.drain_events();
        for operation in 0..3 {
            fixture.fail(stage);
            let result = match operation {
                0 => fixture.service.apply(custom(&saved), 0).await,
                1 => {
                    fixture
                        .service
                        .rename(saved.id.clone(), 1, "Changed".into())
                        .await
                }
                _ => fixture.service.create("Another".into(), definition()).await,
            };
            assert_eq!(result.unwrap_err().code, LayoutCommandErrorCode::StorageIo);
            assert_eq!(fixture.service.snapshot(), before);
            assert_eq!(fs::read(&fixture.path).unwrap(), bytes);
            assert!(!fixture.path.with_extension("json.tmp").exists());
            assert!(fixture.drain_events().is_empty());
        }
    }
}

#[tokio::test]
async fn concurrent_saves_serialize_and_report_one_conflict() {
    let fixture = Fixture::new(None);
    let saved = fixture.create().await;
    let (first, second) = tokio::join!(
        fixture.service.rename(saved.id.clone(), 1, "First".into()),
        fixture.service.rename(saved.id.clone(), 1, "Second".into())
    );
    assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
    assert_eq!(
        first.err().or(second.err()).unwrap().code,
        LayoutCommandErrorCode::RevisionConflict
    );
    assert_eq!(fixture.service.snapshot().entries[0].revision, 2);
    assert_eq!(fixture.disk().entries, fixture.service.snapshot().entries);
}

#[tokio::test]
async fn requester_cancellation_after_replacement_still_installs_and_notifies() {
    let fixture = Fixture::new(None);
    let (reached, resume) = fixture.pause(Stage::Committed);
    let service = fixture.service.clone();
    let requester = tokio::spawn(async move { service.create("Saved".into(), definition()).await });
    // Yield so the command is accepted before waiting on the owned worker.
    tokio::task::yield_now().await;
    reached.recv_timeout(Duration::from_secs(10)).unwrap();
    assert_eq!(fixture.disk().entries.len(), 1);
    assert!(fixture.service.snapshot().entries.is_empty());
    requester.abort();
    assert!(requester.await.unwrap_err().is_cancelled());
    resume.send(()).unwrap();
    fixture.service.shutdown();
    assert_eq!(fixture.service.snapshot().entries.len(), 1);
    assert_eq!(fixture.drain_events().len(), 1);
    assert_eq!(
        fixture.service.snapshot().storage_revision,
        fixture.disk().storage_revision
    );
}

#[test]
fn shutdown_drains_accepted_mutations_in_order() {
    let fixture = Fixture::new(None);
    let mut responses = Vec::new();
    for number in 0..10 {
        let (reply, response) = oneshot::channel();
        fixture
            .service
            .sender
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
            .send(Request {
                mutation: Mutation::Create {
                    name: format!("Layout {number}"),
                    definition: definition(),
                },
                reply,
            })
            .unwrap();
        responses.push(response);
    }
    fixture.service.shutdown();
    for (index, mut response) in responses.into_iter().enumerate() {
        assert_eq!(
            response
                .try_recv()
                .unwrap()
                .unwrap()
                .library
                .storage_revision,
            index as u64 + 1
        );
    }
    assert_eq!(fixture.disk().entries.len(), 10);
    assert_eq!(fixture.service.snapshot().entries, fixture.disk().entries);
    assert_eq!(fixture.drain_events().len(), 10);
}

#[tokio::test]
async fn corrupt_and_unsupported_files_are_preserved_and_writes_blocked() {
    for (bytes, code) in [
        (b"broken".as_slice(), LayoutStorageStatusCode::Corrupt),
        (
            br#"{"schemaVersion":2,"future":"preserve me"}"#.as_slice(),
            LayoutStorageStatusCode::UnsupportedSchema,
        ),
        (
            br#"{"schemaVersion":1}"#.as_slice(),
            LayoutStorageStatusCode::Corrupt,
        ),
    ] {
        let fixture = Fixture::new(Some(bytes));
        let current = fixture.service.snapshot();
        assert_eq!(current.storage_status.state, LayoutStorageState::Blocked);
        assert_eq!(current.storage_status.code, Some(code));
        assert!(current.storage_status.recovery_token.is_some());
        assert!(current.entries.is_empty());
        assert_eq!(current.published.revision, 0);
        assert_eq!(
            fixture
                .service
                .create("New".into(), definition())
                .await
                .unwrap_err()
                .code,
            LayoutCommandErrorCode::StorageBlocked
        );
        assert_eq!(fs::read(&fixture.path).unwrap(), bytes);
        assert!(fixture.drain_events().is_empty());
    }
}

#[test]
fn oversized_and_unreadable_paths_are_blocked_without_rewrites() {
    let fixture = Fixture::new(None);
    let file = fs::File::create(&fixture.path).unwrap();
    file.set_len(MAX_LAYOUT_STORAGE_BYTES as u64 + 1).unwrap();
    let oversized = LayoutService::load_from(fixture.path.clone());
    assert_eq!(
        oversized.snapshot().storage_status.code,
        Some(LayoutStorageStatusCode::Oversized)
    );
    assert_eq!(
        fs::metadata(&fixture.path).unwrap().len(),
        MAX_LAYOUT_STORAGE_BYTES as u64 + 1
    );
    drop(oversized);
    drop(file);
    fs::remove_file(&fixture.path).unwrap();
    fs::create_dir(&fixture.path).unwrap();
    let unreadable = LayoutService::load_from(fixture.path.clone());
    assert_eq!(
        unreadable.snapshot().storage_status.code,
        Some(LayoutStorageStatusCode::Unreadable)
    );
}

#[tokio::test]
async fn recovery_requires_current_token_and_preserves_exact_backup_bytes() {
    let original = b"{a corrupt original}\n";
    let fixture = Fixture::new(Some(original));
    assert_eq!(
        fixture
            .service
            .recover("stale".into())
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::RecoveryConflict
    );
    let token = fixture
        .service
        .snapshot()
        .storage_status
        .recovery_token
        .unwrap();
    let recovered = fixture.service.recover(token).await.unwrap();
    let status = recovered.library.storage_status;
    assert_eq!(status.state, LayoutStorageState::Ready);
    assert_eq!(status.code, None);
    assert_eq!(status.recovery_token, None);
    assert_eq!(fs::read(status.backup_path.unwrap()).unwrap(), original);
    assert_eq!(recovered.library.storage_revision, 1);
    assert_eq!(recovered.library.published.revision, 1);
    assert_eq!(fixture.disk().published.revision, 1);
    let events = fixture.drain_events();
    assert!(matches!(
        &events[..],
        [
            LayoutServiceEvent::LibraryChanged(_),
            LayoutServiceEvent::Published(_),
            LayoutServiceEvent::StorageWarning(_)
        ]
    ));
    fixture.create().await;
}

#[tokio::test]
async fn recovery_backup_or_reset_failure_leaves_original_and_blocked_state() {
    for stage in [Stage::Backup, Stage::Write, Stage::Sync, Stage::Replace] {
        let fixture = Fixture::new(Some(b"bad"));
        let before = fixture.service.snapshot();
        fixture.fail(stage);
        let token = before.storage_status.recovery_token.clone().unwrap();
        assert_eq!(
            fixture.service.recover(token).await.unwrap_err().code,
            LayoutCommandErrorCode::StorageIo
        );
        assert_eq!(fixture.service.snapshot(), before);
        assert_eq!(fs::read(&fixture.path).unwrap(), b"bad");
        assert!(fixture.drain_events().is_empty());
    }
}

#[tokio::test]
async fn recovery_file_change_conflicts_and_reloads_status_without_overwriting() {
    let fixture = Fixture::new(Some(b"old"));
    let token = fixture
        .service
        .snapshot()
        .storage_status
        .recovery_token
        .unwrap();
    let replacement = br#"{"schemaVersion":2}"#;
    fs::write(&fixture.path, replacement).unwrap();
    assert_eq!(
        fixture
            .service
            .recover(token.clone())
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::RecoveryConflict
    );
    let status = fixture.service.snapshot().storage_status;
    assert_eq!(
        status.code,
        Some(LayoutStorageStatusCode::UnsupportedSchema)
    );
    assert_ne!(status.recovery_token.as_deref(), Some(token.as_str()));
    assert_eq!(fs::read(&fixture.path).unwrap(), replacement);
    assert_eq!(fs::read_dir(&fixture.directory).unwrap().count(), 1);
}

#[tokio::test]
async fn valid_external_replacement_is_loaded_on_recovery_conflict() {
    let fixture = Fixture::new(Some(b"old"));
    let token = fixture
        .service
        .snapshot()
        .storage_status
        .recovery_token
        .unwrap();
    let bytes = serde_json::to_vec(&empty_document()).unwrap();
    fs::write(&fixture.path, &bytes).unwrap();
    assert_eq!(
        fixture.service.recover(token).await.unwrap_err().code,
        LayoutCommandErrorCode::RecoveryConflict
    );
    assert_eq!(
        fixture.service.snapshot().storage_status.state,
        LayoutStorageState::Ready
    );
    assert_eq!(fs::read(&fixture.path).unwrap(), bytes);
}

#[tokio::test]
async fn invalid_definitions_and_revision_overflow_never_write() {
    let fixture = Fixture::new(None);
    let mut invalid = definition();
    invalid.root.width = 0;
    assert_eq!(
        fixture
            .service
            .create("Bad".into(), invalid)
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::InvalidDefinition
    );
    assert!(!fixture.path.exists());
    let mut document = empty_document();
    document.storage_revision = MAX_LAYOUT_REVISION;
    fs::write(&fixture.path, serde_json::to_vec(&document).unwrap()).unwrap();
    let overflow = LayoutService::load_from(fixture.path.clone());
    assert_eq!(
        overflow
            .create("Good".into(), definition())
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::LimitExceeded
    );
    assert_eq!(fixture.disk(), document);
}

#[tokio::test]
async fn callbacks_run_after_memory_install_and_can_read_without_deadlock() {
    let fixture = Fixture::new(None);
    let service = Arc::new(LayoutService::load_from(
        fixture.directory.join("other.json"),
    ));
    let weak = Arc::downgrade(&service);
    service.set_notifier(move |event| {
        let current = weak.upgrade().unwrap().snapshot();
        if let LayoutServiceEvent::LibraryChanged(change) = event {
            assert_eq!(current.storage_revision, change.storage_revision);
            assert_eq!(current.session_id, change.session_id);
        }
    });
    service.create("Test".into(), definition()).await.unwrap();
    service.shutdown();
}

#[test]
fn complete_file_size_limit_is_inclusive() {
    let fixture = Fixture::new(None);
    let mut bytes = serde_json::to_vec(&empty_document()).unwrap();
    bytes.resize(MAX_LAYOUT_STORAGE_BYTES, b' ');
    fs::write(&fixture.path, bytes).unwrap();
    let service = LayoutService::load_from(fixture.path.clone());
    assert_eq!(
        service.snapshot().storage_status.state,
        LayoutStorageState::Ready
    );
}

#[tokio::test]
async fn p2_exit_gate_restores_published_one_while_saved_revision_is_exactly_two() {
    let fixture = Fixture::new(None);
    let saved = fixture.create().await;
    let published = fixture
        .service
        .apply(custom(&saved), 0)
        .await
        .unwrap()
        .library
        .published;
    let mut definition = saved.definition;
    definition.root.width = 1000;
    fixture
        .service
        .save(saved.id, 1, "Revision two".into(), definition)
        .await
        .unwrap();
    fixture.service.shutdown();
    let restarted = LayoutService::load_from(fixture.path.clone());
    let restored = restarted.snapshot();
    assert_eq!(restored.entries[0].revision, 2);
    assert_eq!(restored.entries[0].definition.root.width, 1000);
    assert_eq!(restored.published.revision, 1);
    assert_eq!(restored.published.selection, published.selection);
}

#[tokio::test]
async fn create_enforces_the_complete_library_entry_limit_before_writing() {
    let fixture = Fixture::new(None);
    let mut document = empty_document();
    for number in 0..MAX_LAYOUT_ENTRIES {
        document.entries.push(SavedLayout {
            id: uuid::Uuid::new_v4().to_string(),
            name: format!("Layout {number}"),
            revision: 1,
            definition: definition(),
        });
    }
    let bytes = serde_json::to_vec(&document).unwrap();
    fs::write(&fixture.path, &bytes).unwrap();
    let service = LayoutService::load_from(fixture.path.clone());
    assert_eq!(
        service
            .create("One too many".into(), definition())
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::LimitExceeded
    );
    assert_eq!(service.snapshot().entries.len(), MAX_LAYOUT_ENTRIES);
    assert_eq!(fs::read(&fixture.path).unwrap(), bytes);
}

#[tokio::test]
async fn saved_and_publication_revision_overflow_are_independently_rejected() {
    let fixture = Fixture::new(None);
    let mut document = empty_document();
    document.entries.push(SavedLayout {
        id: id(10),
        name: "Saved".into(),
        revision: MAX_LAYOUT_REVISION,
        definition: definition(),
    });
    document.published.revision = MAX_LAYOUT_REVISION;
    let bytes = serde_json::to_vec(&document).unwrap();
    fs::write(&fixture.path, &bytes).unwrap();
    let service = LayoutService::load_from(fixture.path.clone());
    assert_eq!(
        service
            .rename(id(10), MAX_LAYOUT_REVISION, "Changed".into())
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::LimitExceeded
    );
    assert_eq!(
        service
            .apply(custom(&document.entries[0]), MAX_LAYOUT_REVISION)
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::LimitExceeded
    );
    assert_eq!(fs::read(&fixture.path).unwrap(), bytes);
}

#[tokio::test]
async fn normalized_loaded_content_can_be_saved_as_a_noop() {
    let fixture = Fixture::new(None);
    let mut document = empty_document();
    document.entries.push(SavedLayout {
        id: id(10),
        name: "Saved".into(),
        revision: 1,
        definition: definition(),
    });
    let bytes = serde_json::to_vec(&document).unwrap();
    fs::write(&fixture.path, &bytes).unwrap();
    let service = LayoutService::load_from(fixture.path.clone());
    let normalized = normalize_definition(definition()).unwrap();
    let result = service
        .save(id(10), 1, "Saved".into(), normalized)
        .await
        .unwrap();
    assert_eq!(result.library.entries[0].revision, 1);
    assert_eq!(result.library.storage_revision, 0);
    assert_eq!(fs::read(&fixture.path).unwrap(), bytes);
}

#[tokio::test]
async fn recovery_rechecks_file_identity_after_backup() {
    let fixture = Fixture::new(Some(b"original"));
    let token = fixture
        .service
        .snapshot()
        .storage_status
        .recovery_token
        .unwrap();
    let (reached, resume) = fixture.pause(Stage::Backup);
    let service = fixture.service.clone();
    let requester = tokio::spawn(async move { service.recover(token).await });
    tokio::task::yield_now().await;
    reached.recv_timeout(Duration::from_secs(10)).unwrap();
    fs::write(&fixture.path, b"replacement").unwrap();
    resume.send(()).unwrap();
    assert_eq!(
        requester.await.unwrap().unwrap_err().code,
        LayoutCommandErrorCode::RecoveryConflict
    );
    assert_eq!(fs::read(&fixture.path).unwrap(), b"replacement");
    assert_eq!(
        fixture.service.snapshot().storage_status.state,
        LayoutStorageState::Blocked
    );
    let backup = fixture
        .service
        .snapshot()
        .storage_status
        .backup_path
        .unwrap();
    assert_eq!(fs::read(backup).unwrap(), b"replacement");
}

#[tokio::test]
async fn unreadable_original_cannot_be_recovered_without_correcting_access() {
    let fixture = Fixture::new(None);
    fs::create_dir(&fixture.path).unwrap();
    let service = LayoutService::load_from(fixture.path.clone());
    let token = service.snapshot().storage_status.recovery_token.unwrap();
    assert_eq!(
        service.recover(token).await.unwrap_err().code,
        LayoutCommandErrorCode::StorageIo
    );
    assert_eq!(
        service.snapshot().storage_status.state,
        LayoutStorageState::Blocked
    );
    assert!(fixture.path.is_dir());
    assert_eq!(fs::read_dir(&fixture.directory).unwrap().count(), 1);
}

#[tokio::test]
async fn unresolved_configuration_directory_never_falls_back_to_working_directory() {
    let service = LayoutService::start(Storage::new(None));
    let current = service.snapshot();
    assert_eq!(current.storage_status.state, LayoutStorageState::Blocked);
    assert_eq!(
        current.storage_status.code,
        Some(LayoutStorageStatusCode::Unreadable)
    );
    assert_eq!(
        service
            .create("Saved".into(), definition())
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::StorageBlocked
    );
    assert_eq!(
        service
            .recover(current.storage_status.recovery_token.unwrap())
            .await
            .unwrap_err()
            .code,
        LayoutCommandErrorCode::StorageIo
    );
}

#[tokio::test]
async fn publication_uses_only_the_public_event_and_never_mutates_match_state() {
    use crate::presets::PresetLibrary;
    use crate::state::{AppPrefs, AppState, ServerEvent};

    let fixture = Fixture::new(None);
    let shared = AppState::with_prefs(
        AppPrefs::default(),
        crate::Settings::default(),
        PresetLibrary::empty(),
        LayoutService::load_from(fixture.directory.join("app-state-layouts.json")),
    );
    let mut events = shared.subscribe();
    let match_state = shared.current().await;
    let settings = shared.settings_snapshot().await;
    let created = shared
        .layouts
        .create("Saved".into(), definition())
        .await
        .unwrap();
    assert!(matches!(
        events.try_recv(),
        Err(tokio::sync::broadcast::error::TryRecvError::Empty)
    ));
    let entry = &created.library.entries[0];
    let applied = shared.layouts.apply(custom(entry), 0).await.unwrap();
    let ServerEvent::PublishedLayout(published) = events.try_recv().unwrap() else {
        panic!("only the public frozen publication belongs on the server event channel");
    };
    assert_eq!(published, applied.library.published);
    let wire = serde_json::to_value(published).unwrap();
    assert!(wire["selection"].get("editor").is_none());
    assert!(wire.get("entries").is_none());
    assert!(wire.get("storageStatus").is_none());
    assert_eq!(
        serde_json::to_value(shared.current().await).unwrap(),
        serde_json::to_value(match_state).unwrap()
    );
    assert_eq!(
        serde_json::to_value(shared.settings_snapshot().await).unwrap(),
        serde_json::to_value(settings).unwrap()
    );
    shared
        .layouts
        .rename(entry.id.clone(), 1, "Private rename".into())
        .await
        .unwrap();
    assert!(matches!(
        events.try_recv(),
        Err(tokio::sync::broadcast::error::TryRecvError::Empty)
    ));
    assert_eq!(shared.layouts.published(), applied.library.published);
    shared.layouts.shutdown();
}
