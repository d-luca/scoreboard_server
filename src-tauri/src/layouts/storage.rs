use std::collections::hash_map::DefaultHasher;
use std::fs::{self, File, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use super::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct FileIdentity {
    metadata: Option<(u64, Option<SystemTime>, Option<SystemTime>)>,
    hash: Option<u64>,
    #[cfg(unix)]
    inode: Option<(u64, u64, i64, i64)>,
}

pub(super) struct LoadedStorage {
    pub document: LayoutStorageDocument,
    pub status: LayoutStorageStatus,
    pub identity: FileIdentity,
}

pub(super) struct Storage {
    pub path: Option<PathBuf>,
    #[cfg(test)]
    pub hooks: super::service::tests::StorageHooks,
}

impl Storage {
    pub fn new(path: Option<PathBuf>) -> Self {
        Self {
            path,
            #[cfg(test)]
            hooks: Default::default(),
        }
    }

    pub fn load(&self) -> LoadedStorage {
        let Some(path) = &self.path else {
            return blocked(
                LayoutStorageStatusCode::Unreadable,
                "Cannot resolve the application configuration directory. Layout writes are blocked.",
                identity(None, None),
            );
        };
        let metadata = match fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return LoadedStorage {
                    document: empty_document(),
                    status: ready_status(None),
                    identity: identity(None, None),
                };
            }
            Err(error) => {
                return blocked(
                    LayoutStorageStatusCode::Unreadable,
                    format!("Cannot inspect {}: {error}", path.display()),
                    identity(None, None),
                );
            }
        };
        let bytes = match read_bounded(path, metadata.len()) {
            Ok(bytes) => bytes,
            Err(error) => {
                return blocked(
                    if error.kind() == io::ErrorKind::FileTooLarge {
                        LayoutStorageStatusCode::Oversized
                    } else {
                        LayoutStorageStatusCode::Unreadable
                    },
                    format!("Cannot load {}: {error}", path.display()),
                    identity(Some(&metadata), None),
                );
            }
        };
        let identity = identity(Some(&metadata), Some(&bytes));
        match decode_storage_document(&bytes) {
            Ok(document) => LoadedStorage {
                document,
                status: ready_status(None),
                identity,
            },
            Err(error) => {
                // The bounded decoder checks JSON nesting before this schema probe.
                let unsupported = super::validation::decode::<serde_json::Value>(&bytes)
                    .ok()
                    .and_then(|value| value.get("schemaVersion")?.as_u64())
                    .is_some_and(|version| version != u64::from(LAYOUT_SCHEMA_VERSION));
                let detail = error
                    .diagnostics
                    .first()
                    .map_or(error.message.clone(), |diagnostic| {
                        format!("{}: {}", diagnostic.property, diagnostic.message)
                    });
                blocked(
                    if unsupported {
                        LayoutStorageStatusCode::UnsupportedSchema
                    } else {
                        LayoutStorageStatusCode::Corrupt
                    },
                    format!(
                        "Cannot use {}: {} Back up and reset the library, or restore a compatible file while the app is closed.",
                        path.display(),
                        detail
                    ),
                    identity,
                )
            }
        }
    }

    pub fn write(&self, document: &LayoutStorageDocument) -> Result<(), LayoutCommandError> {
        let path = self.path.as_ref().ok_or_else(|| {
            storage_error("Cannot resolve the application configuration directory.")
        })?;
        let bytes = serde_json::to_vec(document)
            .map_err(|error| storage_error(format!("Cannot serialize layouts: {error}")))?;
        let tmp = path.with_extension("json.tmp");
        let result = (|| -> io::Result<()> {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            #[cfg(test)]
            self.hooks.check(super::service::tests::Stage::Write)?;
            let mut file = File::create(&tmp)?;
            file.write_all(&bytes)?;
            file.flush()?;
            #[cfg(test)]
            self.hooks.check(super::service::tests::Stage::Sync)?;
            file.sync_all()?;
            drop(file);
            #[cfg(test)]
            self.hooks.check(super::service::tests::Stage::Replace)?;
            fs::rename(&tmp, path)?;
            #[cfg(test)]
            self.hooks.pause(super::service::tests::Stage::Committed);
            Ok(())
        })();
        if let Err(error) = result {
            if let Err(cleanup) = fs::remove_file(&tmp) {
                if cleanup.kind() != io::ErrorKind::NotFound {
                    tracing::warn!(?cleanup, path = %tmp.display(), "cannot clean layout temporary file");
                }
            }
            return Err(storage_error(format!(
                "Cannot persist {}: {error}",
                path.display()
            )));
        }
        Ok(())
    }

    pub fn backup(&self) -> Result<PathBuf, LayoutCommandError> {
        let path = self.path.as_ref().ok_or_else(|| {
            storage_error("Cannot resolve the application configuration directory.")
        })?;
        let backup = path.with_file_name(format!("layouts.recovery-{}.json", uuid::Uuid::new_v4()));
        #[cfg(test)]
        self.hooks
            .check(super::service::tests::Stage::Backup)
            .map_err(|error| storage_error(format!("Cannot back up layouts: {error}")))?;
        let mut original = File::open(path)
            .map_err(|error| storage_error(format!("Cannot read original layouts: {error}")))?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup)
            .map_err(|error| storage_error(format!("Cannot create layout backup: {error}")))?;
        let result = (|| -> io::Result<()> {
            io::copy(&mut original, &mut output)?;
            output.flush()?;
            output.sync_all()
        })();
        drop(output);
        if let Err(error) = result {
            if let Err(cleanup) = fs::remove_file(&backup) {
                tracing::warn!(?cleanup, "cannot clean incomplete layout backup");
            }
            return Err(storage_error(format!(
                "Cannot complete layout backup: {error}"
            )));
        }
        tracing::info!(path = %backup.display(), "layout recovery backup completed");
        Ok(backup)
    }
}

fn read_bounded(path: &Path, length: u64) -> io::Result<Vec<u8>> {
    if length > MAX_LAYOUT_STORAGE_BYTES as u64 {
        return Err(io::Error::new(
            io::ErrorKind::FileTooLarge,
            "Layout file exceeds 16 MiB.",
        ));
    }
    let mut bytes = Vec::new();
    let mut file = File::open(path)?;
    (&mut file)
        .take(MAX_LAYOUT_STORAGE_BYTES as u64)
        .read_to_end(&mut bytes)?;
    if file.read(&mut [0u8; 1])? != 0 {
        return Err(io::Error::new(
            io::ErrorKind::FileTooLarge,
            "Layout file grew beyond 16 MiB.",
        ));
    }
    Ok(bytes)
}

fn identity(metadata: Option<&fs::Metadata>, bytes: Option<&[u8]>) -> FileIdentity {
    FileIdentity {
        metadata: metadata.map(|metadata| {
            (
                metadata.len(),
                metadata.modified().ok(),
                metadata.created().ok(),
            )
        }),
        hash: bytes.map(|bytes| {
            let mut hasher = DefaultHasher::new();
            bytes.hash(&mut hasher);
            hasher.finish()
        }),
        #[cfg(unix)]
        inode: metadata.map(|metadata| {
            use std::os::unix::fs::MetadataExt;
            (
                metadata.dev(),
                metadata.ino(),
                metadata.ctime(),
                metadata.ctime_nsec(),
            )
        }),
    }
}

pub(super) fn empty_document() -> LayoutStorageDocument {
    LayoutStorageDocument {
        schema_version: LAYOUT_SCHEMA_VERSION,
        storage_revision: 0,
        entries: Vec::new(),
        published: StoredPublishedLayout {
            revision: 0,
            selection: PublishedLayoutSelection::Classic {},
        },
    }
}

pub(super) fn ready_status(backup_path: Option<String>) -> LayoutStorageStatus {
    LayoutStorageStatus {
        state: LayoutStorageState::Ready,
        code: None,
        message: None,
        recovery_token: None,
        backup_path,
    }
}

fn blocked(
    code: LayoutStorageStatusCode,
    message: impl Into<String>,
    identity: FileIdentity,
) -> LoadedStorage {
    let message = message.into();
    tracing::warn!(?code, %message, "layout storage blocked");
    LoadedStorage {
        document: empty_document(),
        status: LayoutStorageStatus {
            state: LayoutStorageState::Blocked,
            code: Some(code),
            message: Some(message),
            recovery_token: Some(uuid::Uuid::new_v4().to_string()),
            backup_path: None,
        },
        identity,
    }
}

pub(super) fn storage_error(message: impl Into<String>) -> LayoutCommandError {
    let message = message.into();
    tracing::error!(%message, "layout storage operation failed");
    super::service::command_error(LayoutCommandErrorCode::StorageIo, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_read_detects_growth_after_the_metadata_check() {
        let path =
            std::env::temp_dir().join(format!("sb-layout-read-{}.json", uuid::Uuid::new_v4()));
        let file = File::create(&path).unwrap();
        file.set_len(MAX_LAYOUT_STORAGE_BYTES as u64 + 1).unwrap();
        drop(file);
        let result = read_bounded(&path, 0);
        fs::remove_file(path).unwrap();
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::FileTooLarge);
    }
}
