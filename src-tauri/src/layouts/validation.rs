use std::collections::HashSet;
use std::io::{self, Write};

use serde::de::DeserializeOwned;
use serde::Serialize;

use super::*;

#[derive(Default)]
struct Validation<'a> {
    diagnostics: Vec<LayoutDiagnostic>,
    ids: HashSet<&'a str>,
    order: Vec<&'a str>,
    bindings: HashSet<LayoutBinding>,
}

impl<'a> Validation<'a> {
    fn error(
        &mut self,
        code: LayoutDiagnosticCode,
        node: Option<&str>,
        property: &str,
        message: impl Into<String>,
    ) {
        self.diagnostics.push(LayoutDiagnostic {
            severity: LayoutDiagnosticSeverity::Error,
            code,
            node_id: node.map(str::to_owned),
            property: property.to_owned(),
            message: message.into(),
        });
    }

    fn number(&mut self, value: f64, min: f64, max: f64, node: &str, property: &str) {
        if !value.is_finite() || !(min..=max).contains(&value) {
            self.error(
                LayoutDiagnosticCode::InvalidSize,
                Some(node),
                property,
                format!("Expected a finite number in {min}..={max}."),
            );
        }
    }

    fn name(&mut self, value: &str, node: Option<&str>, property: &str) {
        if value != value.trim() || value.is_empty() {
            self.error(
                LayoutDiagnosticCode::InvalidField,
                node,
                property,
                "Names and labels must be trimmed and non-empty.",
            );
        }
        if value.chars().count() > MAX_LAYOUT_NAME_CHARS {
            self.error(
                LayoutDiagnosticCode::LimitExceeded,
                node,
                property,
                "Names and labels may contain at most 128 Unicode scalar values.",
            );
        }
    }

    fn id(&mut self, id: &str, property: &str) {
        if !canonical_id(id) {
            self.error(
                LayoutDiagnosticCode::InvalidId,
                Some(id),
                property,
                "Expected a canonical lowercase UUID v4.",
            );
        }
    }

    fn node(&mut self, id: &'a str, path: &str) {
        self.id(id, &format!("{path}/id"));
        if !self.ids.insert(id) {
            self.error(
                LayoutDiagnosticCode::DuplicateId,
                Some(id),
                &format!("{path}/id"),
                "Node ids must be unique within a definition.",
            );
        }
        self.order.push(id);
    }

    fn color(&mut self, color: &LayoutColor, node: &str, path: &str) {
        let alpha = match color {
            LayoutColor::Literal { hex, alpha } => {
                if hex.len() != 7
                    || !hex.starts_with('#')
                    || !hex.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
                {
                    self.error(
                        LayoutDiagnosticCode::InvalidField,
                        Some(node),
                        &format!("{path}/hex"),
                        "Literal colours must use #RRGGBB hex notation.",
                    );
                }
                *alpha
            }
            LayoutColor::Team { alpha, .. } => *alpha,
        };
        self.number(alpha, 0.0, 1.0, node, &format!("{path}/alpha"));
    }

    fn box_style(&mut self, style: &LayoutBoxStyle, node: &str, path: &str) {
        self.color(&style.background, node, &format!("{path}/background"));
        self.color(&style.border_color, node, &format!("{path}/borderColor"));
        self.number(
            style.border_width,
            0.0,
            256.0,
            node,
            &format!("{path}/borderWidth"),
        );
        self.number(style.radius, 0.0, 4096.0, node, &format!("{path}/radius"));
    }

    fn text_style(&mut self, style: &LayoutTextStyle, node: &str, path: &str) {
        let supported = match style.font.family {
            LayoutFontFamily::Anton => style.font.weight == 400,
            LayoutFontFamily::Poppins => {
                matches!(style.font.weight, 400 | 500 | 600 | 700 | 800 | 900)
            }
        };
        if !supported {
            self.error(
                LayoutDiagnosticCode::UnsupportedChoice,
                Some(node),
                &format!("{path}/font/weight"),
                "Choose a bundled weight: Anton 400 or Poppins 400, 500, 600, 700, 800, 900.",
            );
        }
        self.number(
            style.font_size,
            1.0,
            512.0,
            node,
            &format!("{path}/fontSize"),
        );
        self.color(&style.color, node, &format!("{path}/color"));
    }

    fn size(&mut self, size: &LayoutSize, parent: LayoutMode, node: &str, path: &str) {
        match size {
            LayoutSize::Fixed { pixels } => {
                self.number(*pixels, 1.0, 8192.0, node, &format!("{path}/pixels"));
            }
            LayoutSize::Fill {} if parent == LayoutMode::Free => self.error(
                LayoutDiagnosticCode::InvalidNesting,
                Some(node),
                path,
                "Free children require fixed dimensions on both axes.",
            ),
            LayoutSize::Fill {} => {}
        }
    }

    fn children(
        &mut self,
        children: &'a [LayoutElement],
        parent: LayoutMode,
        depth: usize,
        path: &str,
    ) {
        for (index, child) in children.iter().enumerate() {
            let path = format!("{path}/children/{index}");
            let id = child.id();
            if self.order.len() >= MAX_LAYOUT_NODES || depth > MAX_LAYOUT_DEPTH {
                self.error(
                    LayoutDiagnosticCode::LimitExceeded,
                    Some(id),
                    &path,
                    "A layout permits at most 256 nodes and 16 tree levels, including the root.",
                );
                break;
            }
            self.node(id, &path);
            let frame = child.frame();
            self.number(frame.x, -16384.0, 16384.0, id, &format!("{path}/frame/x"));
            self.number(frame.y, -16384.0, 16384.0, id, &format!("{path}/frame/y"));
            self.size(&frame.width, parent, id, &format!("{path}/frame/width"));
            self.size(&frame.height, parent, id, &format!("{path}/frame/height"));
            if parent != LayoutMode::Free && (frame.x != 0.0 || frame.y != 0.0) {
                self.error(
                    LayoutDiagnosticCode::InvalidNesting,
                    Some(id),
                    &format!("{path}/frame"),
                    "Row and Column children require x = y = 0.",
                );
            }
            match child {
                LayoutElement::Container {
                    r#box,
                    padding,
                    mode,
                    gap,
                    children,
                    ..
                } => {
                    self.box_style(r#box, id, &format!("{path}/box"));
                    for (edge, value) in [
                        ("top", padding.top),
                        ("right", padding.right),
                        ("bottom", padding.bottom),
                        ("left", padding.left),
                    ] {
                        self.number(value, 0.0, 4096.0, id, &format!("{path}/padding/{edge}"));
                    }
                    self.number(*gap, 0.0, 4096.0, id, &format!("{path}/gap"));
                    self.children(children, *mode, depth + 1, &path);
                }
                LayoutElement::Value {
                    r#box,
                    binding,
                    text_style,
                    animation,
                    ..
                } => {
                    self.box_style(r#box, id, &format!("{path}/box"));
                    self.text_style(text_style, id, &format!("{path}/textStyle"));
                    if !self.bindings.insert(*binding) {
                        self.error(
                            LayoutDiagnosticCode::DuplicateBinding,
                            Some(id),
                            &format!("{path}/binding"),
                            "Each bound value may occur only once, including hidden instances.",
                        );
                    }
                    if *animation == LayoutAnimation::Rolling
                        && !matches!(binding, LayoutBinding::HomeScore | LayoutBinding::AwayScore)
                    {
                        self.error(
                            LayoutDiagnosticCode::UnsupportedChoice,
                            Some(id),
                            &format!("{path}/animation"),
                            "Only home-score and away-score support Rolling.",
                        );
                    }
                }
                LayoutElement::Text {
                    r#box,
                    text,
                    text_style,
                    ..
                } => {
                    self.box_style(r#box, id, &format!("{path}/box"));
                    self.text_style(text_style, id, &format!("{path}/textStyle"));
                    if text.chars().count() > MAX_LAYOUT_TEXT_CHARS {
                        self.error(
                            LayoutDiagnosticCode::LimitExceeded,
                            Some(id),
                            &format!("{path}/text"),
                            "Static text permits at most 2048 Unicode scalar values.",
                        );
                    }
                    if text.contains('\r') {
                        self.error(
                            LayoutDiagnosticCode::InvalidField,
                            Some(id),
                            &format!("{path}/text"),
                            "Commit static-text line breaks as LF, not CR or CRLF.",
                        );
                    }
                }
                LayoutElement::Rectangle { r#box, .. } => {
                    self.box_style(r#box, id, &format!("{path}/box"));
                }
                LayoutElement::Separator { color, .. } => {
                    self.color(color, id, &format!("{path}/color"));
                }
            }
        }
    }

    fn root(&mut self, root: &'a LayoutRoot) {
        self.node(&root.id, "/root");
        if root.width == 0
            || root.height == 0
            || !((root.width <= 3840 && root.height <= 2160)
                || (root.width <= 2160 && root.height <= 3840))
        {
            self.error(
                LayoutDiagnosticCode::InvalidSize,
                Some(&root.id),
                "/root",
                "Root dimensions must be positive integers within landscape or portrait 4K bounds.",
            );
        }
        self.color(&root.background, &root.id, "/root/background");
        self.children(&root.children, LayoutMode::Free, 2, "/root");
    }

    fn metadata(&mut self, editor: &LayoutEditorMetadata) {
        if editor.layers.len() != self.order.len() {
            self.error(
                LayoutDiagnosticCode::InvalidMetadata,
                None,
                "/editor/layers",
                "Provide exactly one metadata entry per node in depth-first tree order.",
            );
        }
        for (index, layer) in editor.layers.iter().enumerate() {
            let path = format!("/editor/layers/{index}");
            if self.order.get(index).copied() != Some(layer.node_id.as_str()) {
                self.error(
                    LayoutDiagnosticCode::InvalidMetadata,
                    Some(&layer.node_id),
                    &format!("{path}/nodeId"),
                    "Metadata must reference each node exactly once in depth-first tree order.",
                );
            }
            if index == 0 && layer.locked {
                self.error(
                    LayoutDiagnosticCode::InvalidMetadata,
                    Some(&layer.node_id),
                    &format!("{path}/locked"),
                    "The rendering root cannot be locked.",
                );
            }
            self.name(&layer.label, Some(&layer.node_id), &format!("{path}/label"));
        }
    }

    fn revision(&mut self, value: u64, min: u64, property: &str) {
        if !(min..=MAX_LAYOUT_REVISION).contains(&value) {
            self.error(
                LayoutDiagnosticCode::InvalidField,
                None,
                property,
                format!("Revision must be an integer in {min}..={MAX_LAYOUT_REVISION}."),
            );
        }
    }

    fn compact_size(&mut self, value: &impl Serialize, max: usize) {
        if serde_json::to_writer(SizeBudget { remaining: max }, value).is_err() {
            self.error(
                LayoutDiagnosticCode::LimitExceeded,
                None,
                "",
                format!("Compact UTF-8 JSON exceeds the {max}-byte budget."),
            );
        }
    }

    fn finish(self) -> Result<(), LayoutCommandError> {
        if self.diagnostics.is_empty() {
            Ok(())
        } else {
            Err(LayoutCommandError {
                code: if self
                    .diagnostics
                    .iter()
                    .any(|item| item.code == LayoutDiagnosticCode::LimitExceeded)
                {
                    LayoutCommandErrorCode::LimitExceeded
                } else {
                    LayoutCommandErrorCode::InvalidDefinition
                },
                message: "Layout validation failed.".into(),
                layout_id: None,
                expected_revision: None,
                actual_revision: None,
                diagnostics: self.diagnostics,
            })
        }
    }
}

fn canonical_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok_and(|parsed| {
        parsed.get_version_num() == 4
            && parsed.get_variant() == uuid::Variant::RFC4122
            && parsed.hyphenated().to_string() == id
    })
}

struct SizeBudget {
    remaining: usize,
}

impl Write for SizeBudget {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.remaining = self
            .remaining
            .checked_sub(bytes.len())
            .ok_or_else(|| io::Error::other("Layout JSON exceeds its byte budget"))?;
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub fn validate_definition(definition: &LayoutDefinition) -> Result<(), LayoutCommandError> {
    let mut validation = Validation::default();
    validation.root(&definition.root);
    validation.metadata(&definition.editor);
    validation.finish()?;
    let mut validation = Validation::default();
    validation.compact_size(definition, MAX_LAYOUT_DEFINITION_BYTES);
    validation.finish()
}

pub fn validate_root(root: &LayoutRoot) -> Result<(), LayoutCommandError> {
    let mut validation = Validation::default();
    validation.root(root);
    validation.finish()?;
    let mut validation = Validation::default();
    validation.compact_size(root, MAX_LAYOUT_DEFINITION_BYTES);
    validation.finish()
}

pub fn checked_next_revision(revision: u64) -> Result<u64, LayoutCommandError> {
    let mut validation = Validation::default();
    validation.revision(revision, 0, "");
    if revision == MAX_LAYOUT_REVISION {
        validation.error(
            LayoutDiagnosticCode::LimitExceeded,
            None,
            "",
            "The layout revision cannot be incremented beyond JavaScript's exact integer range.",
        );
    }
    validation.finish().map_err(|mut error| {
        error.code = LayoutCommandErrorCode::LimitExceeded;
        error
    })?;
    Ok(revision + 1)
}

pub fn validate_saved_selection(
    selection: &SavedLayoutSelection,
) -> Result<(), LayoutCommandError> {
    let mut validation = Validation::default();
    if let SavedLayoutSelection::Custom {
        id,
        expected_revision,
    } = selection
    {
        validation.id(id, "/id");
        validation.revision(*expected_revision, 1, "/expectedRevision");
    }
    validation.finish().map_err(|mut error| {
        error.code = LayoutCommandErrorCode::InvalidRequest;
        error
    })
}

pub fn validate_storage_document(
    document: &LayoutStorageDocument,
) -> Result<(), LayoutCommandError> {
    let mut validation = Validation::default();
    if document.schema_version != LAYOUT_SCHEMA_VERSION {
        validation.error(
            LayoutDiagnosticCode::UnsupportedChoice,
            None,
            "/schemaVersion",
            "Only layout storage schema 1 is supported.",
        );
    }
    validation.revision(document.storage_revision, 0, "/storageRevision");
    validation.revision(document.published.revision, 0, "/published/revision");
    if document.entries.len() > MAX_LAYOUT_ENTRIES {
        validation.error(
            LayoutDiagnosticCode::LimitExceeded,
            None,
            "/entries",
            "At most 100 custom layouts may be saved.",
        );
    }
    validation.finish()?;

    let mut validation = Validation::default();
    let mut ids = HashSet::new();
    for (index, entry) in document.entries.iter().enumerate() {
        let path = format!("/entries/{index}");
        validation.id(&entry.id, &format!("{path}/id"));
        if !ids.insert(entry.id.as_str()) {
            validation.error(
                LayoutDiagnosticCode::DuplicateId,
                None,
                &format!("{path}/id"),
                "Saved layout ids must be unique.",
            );
        }
        validation.name(&entry.name, None, &format!("{path}/name"));
        validation.revision(entry.revision, 1, &format!("{path}/revision"));
        validate_definition(&entry.definition).map_err(|mut error| {
            error.layout_id = Some(entry.id.clone());
            error
        })?;
    }
    if let PublishedLayoutSelection::Custom {
        source_id,
        source_revision,
        source_name,
        root,
    } = &document.published.selection
    {
        validation.id(source_id, "/published/selection/sourceId");
        validation.name(source_name, None, "/published/selection/sourceName");
        validation.revision(document.published.revision, 1, "/published/revision");
        validation.revision(*source_revision, 1, "/published/selection/sourceRevision");
        match document.entries.iter().find(|entry| entry.id == *source_id) {
            Some(entry) if *source_revision <= entry.revision => {}
            _ => validation.error(
                LayoutDiagnosticCode::InvalidField,
                None,
                "/published/selection/sourceRevision",
                "Published source must reference an existing saved entry at the same or a newer saved revision.",
            ),
        }
        validate_root(root).map_err(|mut error| {
            error.layout_id = Some(source_id.clone());
            error
        })?;
    }
    validation.finish()?;
    let mut validation = Validation::default();
    validation.compact_size(document, MAX_LAYOUT_STORAGE_BYTES);
    validation.finish()
}

pub(super) fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, LayoutCommandError> {
    let mut validation = Validation::default();
    if bytes.len() > MAX_LAYOUT_STORAGE_BYTES {
        validation.error(
            LayoutDiagnosticCode::LimitExceeded,
            None,
            "",
            "Layout JSON exceeds 16 MiB.",
        );
        return Err(validation.finish().expect_err("size limit exceeded"));
    }
    let mut depth = 0usize;
    let mut quoted = false;
    let mut escaped = false;
    for byte in bytes {
        if quoted {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                quoted = false;
            }
        } else {
            match byte {
                b'"' => quoted = true,
                b'{' | b'[' => {
                    depth += 1;
                    if depth > MAX_LAYOUT_JSON_DEPTH {
                        validation.error(
                            LayoutDiagnosticCode::LimitExceeded,
                            None,
                            "",
                            "Layout JSON exceeds 64 object/array levels.",
                        );
                        return Err(validation.finish().expect_err("nesting limit exceeded"));
                    }
                }
                b'}' | b']' => depth = depth.saturating_sub(1),
                _ => {}
            }
        }
    }
    serde_json::from_slice(bytes).map_err(|error| {
        let message = error.to_string();
        validation.error(
            if message.contains("unknown variant") {
                LayoutDiagnosticCode::UnsupportedChoice
            } else {
                LayoutDiagnosticCode::InvalidField
            },
            None,
            "",
            message,
        );
        validation.finish().expect_err("decoding failed")
    })
}

pub fn decode_definition(bytes: &[u8]) -> Result<LayoutDefinition, LayoutCommandError> {
    let definition = decode(bytes)?;
    validate_definition(&definition)?;
    Ok(definition)
}

pub fn decode_storage_document(bytes: &[u8]) -> Result<LayoutStorageDocument, LayoutCommandError> {
    let document = decode(bytes)?;
    validate_storage_document(&document)?;
    Ok(document)
}
