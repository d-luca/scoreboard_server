use serde::{Deserialize, Serialize};
use ts_rs::TS;

mod service;
mod storage;
mod validation;

pub use service::{duplicate_layout_draft, LayoutService, LayoutServiceEvent};

pub use validation::{
    checked_next_revision, decode_definition, decode_storage_document, validate_definition,
    validate_root, validate_saved_selection, validate_storage_document,
};

pub const LAYOUT_SCHEMA_VERSION: u32 = 1;
pub const MAX_LAYOUT_REVISION: u64 = 9_007_199_254_740_991;
pub const MAX_LAYOUT_ENTRIES: usize = 100;
pub const MAX_LAYOUT_NODES: usize = 256;
pub const MAX_LAYOUT_DEPTH: usize = 16;
pub const MAX_LAYOUT_TEXT_CHARS: usize = 2048;
pub const MAX_LAYOUT_NAME_CHARS: usize = 128;
pub const MAX_LAYOUT_DEFINITION_BYTES: usize = 1024 * 1024;
pub const MAX_LAYOUT_STORAGE_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_LAYOUT_JSON_DEPTH: usize = 64;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutDefinition {
    pub root: LayoutRoot,
    pub editor: LayoutEditorMetadata,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutRoot {
    pub kind: LayoutRootKind,
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub background: LayoutColor,
    pub children: Vec<LayoutElement>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutRootKind {
    Root,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[ts(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    export_to = "../../src/bindings/"
)]
pub enum LayoutElement {
    Container {
        id: String,
        hidden: bool,
        frame: LayoutFrame,
        r#box: LayoutBoxStyle,
        padding: LayoutInsets,
        mode: LayoutMode,
        gap: f64,
        main_align: LayoutAlignment,
        cross_align: LayoutAlignment,
        children: Vec<LayoutElement>,
    },
    Value {
        id: String,
        hidden: bool,
        frame: LayoutFrame,
        r#box: LayoutBoxStyle,
        binding: LayoutBinding,
        text_style: LayoutTextStyle,
        animation: LayoutAnimation,
    },
    Text {
        id: String,
        hidden: bool,
        frame: LayoutFrame,
        r#box: LayoutBoxStyle,
        text: String,
        text_style: LayoutTextStyle,
    },
    Rectangle {
        id: String,
        hidden: bool,
        frame: LayoutFrame,
        r#box: LayoutBoxStyle,
    },
    Separator {
        id: String,
        hidden: bool,
        frame: LayoutFrame,
        orientation: LayoutOrientation,
        color: LayoutColor,
    },
}

impl LayoutElement {
    pub fn id(&self) -> &str {
        match self {
            Self::Container { id, .. }
            | Self::Value { id, .. }
            | Self::Text { id, .. }
            | Self::Rectangle { id, .. }
            | Self::Separator { id, .. } => id,
        }
    }

    pub fn frame(&self) -> &LayoutFrame {
        match self {
            Self::Container { frame, .. }
            | Self::Value { frame, .. }
            | Self::Text { frame, .. }
            | Self::Rectangle { frame, .. }
            | Self::Separator { frame, .. } => frame,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutFrame {
    pub x: f64,
    pub y: f64,
    pub width: LayoutSize,
    pub height: LayoutSize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
#[ts(
    tag = "kind",
    rename_all = "kebab-case",
    export_to = "../../src/bindings/"
)]
pub enum LayoutSize {
    Fixed { pixels: f64 },
    Fill {},
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutMode {
    Free,
    Row,
    Column,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutAlignment {
    Start,
    Center,
    End,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutBinding {
    Timer,
    PeriodPrefix,
    PeriodNumber,
    HomeName,
    HomeScore,
    AwayName,
    AwayScore,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutAnimation {
    None,
    Rolling,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutOrientation {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutBoxStyle {
    pub background: LayoutColor,
    pub border_color: LayoutColor,
    pub border_width: f64,
    pub radius: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutInsets {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
#[ts(
    tag = "kind",
    rename_all = "kebab-case",
    export_to = "../../src/bindings/"
)]
pub enum LayoutColor {
    Literal { hex: String, alpha: f64 },
    Team { team: LayoutTeam, alpha: f64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutTeam {
    Home,
    Away,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutTextStyle {
    pub font: LayoutFont,
    pub font_size: f64,
    pub color: LayoutColor,
    pub horizontal_align: LayoutAlignment,
    pub vertical_align: LayoutAlignment,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutFont {
    pub family: LayoutFontFamily,
    pub weight: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutFontFamily {
    Anton,
    Poppins,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutEditorMetadata {
    pub layers: Vec<LayoutLayerMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutLayerMetadata {
    pub node_id: String,
    pub label: String,
    pub locked: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct SavedLayout {
    pub id: String,
    pub name: String,
    #[ts(type = "number")]
    pub revision: u64,
    pub definition: LayoutDefinition,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[ts(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    export_to = "../../src/bindings/"
)]
pub enum SavedLayoutSelection {
    Classic {},
    Custom {
        id: String,
        #[ts(type = "number")]
        expected_revision: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
#[ts(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    export_to = "../../src/bindings/"
)]
pub enum PublishedLayoutSelection {
    Classic {},
    Custom {
        source_id: String,
        #[ts(type = "number")]
        source_revision: u64,
        source_name: String,
        root: LayoutRoot,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutStorageDocument {
    pub schema_version: u32,
    #[ts(type = "number")]
    pub storage_revision: u64,
    pub entries: Vec<SavedLayout>,
    pub published: StoredPublishedLayout,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct StoredPublishedLayout {
    #[ts(type = "number")]
    pub revision: u64,
    pub selection: PublishedLayoutSelection,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct PublishedLayoutSnapshot {
    pub session_id: String,
    #[ts(type = "number")]
    pub revision: u64,
    pub selection: PublishedLayoutSelection,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutLibrarySnapshot {
    pub session_id: String,
    #[ts(type = "number")]
    pub storage_revision: u64,
    pub entries: Vec<SavedLayout>,
    pub published: PublishedLayoutSnapshot,
    pub storage_status: LayoutStorageStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutLibraryChanged {
    pub session_id: String,
    #[ts(type = "number")]
    pub storage_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutMutationResult {
    pub library: LayoutLibrarySnapshot,
    pub affected_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutStorageStatus {
    pub state: LayoutStorageState,
    pub code: Option<LayoutStorageStatusCode>,
    pub message: Option<String>,
    pub recovery_token: Option<String>,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutStorageState {
    Ready,
    Blocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutStorageStatusCode {
    Unreadable,
    Corrupt,
    UnsupportedSchema,
    Oversized,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutDiagnostic {
    pub severity: LayoutDiagnosticSeverity,
    pub code: LayoutDiagnosticCode,
    pub node_id: Option<String>,
    pub property: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutDiagnosticSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutDiagnosticCode {
    InvalidField,
    InvalidId,
    DuplicateId,
    DuplicateBinding,
    InvalidNesting,
    InvalidSize,
    UnsupportedChoice,
    InvalidMetadata,
    LimitExceeded,
    NegativeFreeSpace,
    ZeroFill,
    EmptyContentBox,
    RootOverflow,
    TextOverflow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export_to = "../../src/bindings/")]
pub struct LayoutCommandError {
    pub code: LayoutCommandErrorCode,
    pub message: String,
    pub layout_id: Option<String>,
    #[ts(type = "number | null")]
    pub expected_revision: Option<u64>,
    #[ts(type = "number | null")]
    pub actual_revision: Option<u64>,
    pub diagnostics: Vec<LayoutDiagnostic>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export_to = "../../src/bindings/")]
pub enum LayoutCommandErrorCode {
    InvalidRequest,
    InvalidDefinition,
    LimitExceeded,
    NotFound,
    RevisionConflict,
    ProtectedLayout,
    StorageBlocked,
    StorageIo,
    RecoveryConflict,
}
