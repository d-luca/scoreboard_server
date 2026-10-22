use scoreboard_server_lib::layouts::*;
use serde_json::{json, Value};
use ts_rs::TS;

fn id(number: usize) -> String {
    format!("00000000-0000-4000-8000-{number:012x}")
}

fn color() -> Value {
    json!({"kind": "literal", "hex": "#aAbBcC", "alpha": 0.0})
}

fn box_style() -> Value {
    json!({"background": color(), "borderColor": color(), "borderWidth": 0, "radius": 0})
}

fn frame() -> Value {
    json!({"x": 0, "y": 0, "width": {"kind": "fixed", "pixels": 80}, "height": {"kind": "fixed", "pixels": 40}})
}

fn text_style() -> Value {
    json!({
        "font": {"family": "anton", "weight": 400}, "fontSize": 32,
        "color": {"kind": "team", "team": "home", "alpha": 1},
        "horizontalAlign": "center", "verticalAlign": "end"
    })
}

fn value(number: usize, binding: &str) -> Value {
    json!({
        "kind": "value", "id": id(number), "hidden": false, "frame": frame(),
        "box": box_style(), "binding": binding, "textStyle": text_style(), "animation": "none"
    })
}

fn text(number: usize, content: &str) -> Value {
    json!({
        "kind": "text", "id": id(number), "hidden": false, "frame": frame(),
        "box": box_style(), "text": content, "textStyle": text_style()
    })
}

fn container(number: usize, mode: &str, children: Vec<Value>) -> Value {
    json!({
        "kind": "container", "id": id(number), "hidden": false, "frame": frame(),
        "box": box_style(), "padding": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        "mode": mode, "gap": 0, "mainAlign": "start", "crossAlign": "end", "children": children
    })
}

fn definition(children: Vec<Value>) -> Value {
    fn layers(node: &Value, result: &mut Vec<Value>) {
        result.push(json!({"nodeId": node["id"], "label": "Layer", "locked": false}));
        if let Some(children) = node["children"].as_array() {
            for child in children {
                layers(child, result);
            }
        }
    }
    let root = json!({"kind": "root", "id": id(0), "width": 622, "height": 80, "background": color(), "children": children});
    let mut metadata = Vec::new();
    layers(&root, &mut metadata);
    json!({"root": root, "editor": {"layers": metadata}})
}

fn decode(value: &Value) -> Result<LayoutDefinition, LayoutCommandError> {
    decode_definition(&serde_json::to_vec(value).unwrap())
}

fn rejects(value: &Value, code: LayoutDiagnosticCode) -> LayoutCommandError {
    let error = decode(value).unwrap_err();
    assert!(
        error.diagnostics.iter().any(|item| item.code == code),
        "{error:?}"
    );
    error
}

#[test]
fn blank_and_all_element_variants_round_trip() {
    let mut children = vec![container(
        1,
        "row",
        vec![value(2, "timer"), text(3, "First\nSecond")],
    )];
    children.push(json!({"kind": "rectangle", "id": id(4), "hidden": true, "frame": frame(), "box": box_style()}));
    children.push(json!({"kind": "separator", "id": id(5), "hidden": false, "frame": frame(), "orientation": "vertical", "color": color()}));
    for input in [definition(vec![]), definition(children)] {
        let parsed = decode(&input).unwrap();
        assert_eq!(
            decode_definition(&serde_json::to_vec(&parsed).unwrap()).unwrap(),
            parsed
        );
    }
}

#[test]
fn duplicate_bindings_include_hidden_subtrees() {
    for binding in [
        "timer",
        "period-prefix",
        "period-number",
        "home-name",
        "home-score",
        "away-name",
        "away-score",
    ] {
        let mut hidden = container(2, "free", vec![value(3, binding)]);
        hidden["hidden"] = json!(true);
        let input = definition(vec![value(1, binding), hidden]);
        let error = rejects(&input, LayoutDiagnosticCode::DuplicateBinding);
        assert!(error
            .diagnostics
            .iter()
            .any(|item| item.node_id.as_deref() == Some(id(3).as_str())
                && item.property == "/root/children/1/children/0/binding"));
    }
}

#[test]
fn ids_are_unique_canonical_v4_including_root() {
    rejects(
        &definition(vec![value(0, "timer")]),
        LayoutDiagnosticCode::DuplicateId,
    );
    for invalid in [
        "invalid",
        "00000000-0000-1000-8000-000000000001",
        "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        "00000000-0000-4000-0000-000000000001",
    ] {
        let mut input = definition(vec![]);
        input["root"]["id"] = json!(invalid);
        rejects(&input, LayoutDiagnosticCode::InvalidId);
    }
}

#[test]
fn strict_decoding_rejects_unknown_missing_and_nested_root_fields() {
    for (pointer, replacement) in [
        ("/root/children/0/children", json!([])),
        ("/root/children/0/kind", json!("root")),
        ("/root/children/0/textStyle/css", json!("font-weight: bold")),
        ("/root/children/0/frame/width/weight", json!(2)),
        ("/root/padding", json!({})),
    ] {
        let mut input = definition(vec![value(1, "timer")]);
        let (parent, key) = pointer.rsplit_once('/').unwrap();
        input.pointer_mut(parent).unwrap()[key] = replacement;
        assert!(decode(&input).is_err(), "accepted {pointer}");
    }
    let mut input = definition(vec![value(1, "timer")]);
    input["root"]["children"][0]
        .as_object_mut()
        .unwrap()
        .remove("animation");
    rejects(&input, LayoutDiagnosticCode::InvalidField);
}

#[test]
fn free_and_flow_sizing_rules_are_parent_specific() {
    let mut child = value(2, "timer");
    child["frame"]["width"] = json!({"kind": "fill"});
    child["frame"]["height"] = json!({"kind": "fill"});
    rejects(
        &definition(vec![child.clone()]),
        LayoutDiagnosticCode::InvalidNesting,
    );
    for mode in ["row", "column"] {
        decode(&definition(vec![container(1, mode, vec![child.clone()])])).unwrap();
        let mut moved = child.clone();
        moved["frame"]["x"] = json!(0.5);
        rejects(
            &definition(vec![container(1, mode, vec![moved])]),
            LayoutDiagnosticCode::InvalidNesting,
        );
    }
}

#[test]
fn root_dimension_boundaries_are_inclusive() {
    for (width, height, valid) in [
        (1, 1, true),
        (3840, 2160, true),
        (2160, 3840, true),
        (3840, 2161, false),
        (2161, 3840, false),
        (3840, 3840, false),
        (0, 80, false),
        (622, 0, false),
    ] {
        let mut input = definition(vec![]);
        input["root"]["width"] = json!(width);
        input["root"]["height"] = json!(height);
        assert_eq!(decode(&input).is_ok(), valid, "{width} x {height}");
    }
    let mut input = definition(vec![]);
    input["root"]["width"] = json!(1.5);
    assert!(decode(&input).is_err());
}

#[test]
fn geometry_style_and_alpha_ranges_are_checked() {
    let input = definition(vec![container(1, "free", vec![value(2, "timer")])]);
    for (pointer, min, max) in [
        ("/root/children/0/frame/x", -16384.0, 16384.0),
        ("/root/children/0/frame/y", -16384.0, 16384.0),
        ("/root/children/0/frame/width/pixels", 1.0, 8192.0),
        ("/root/children/0/frame/height/pixels", 1.0, 8192.0),
        ("/root/children/0/box/borderWidth", 0.0, 256.0),
        ("/root/children/0/box/radius", 0.0, 4096.0),
        ("/root/children/0/gap", 0.0, 4096.0),
        ("/root/children/0/padding/top", 0.0, 4096.0),
        ("/root/children/0/padding/right", 0.0, 4096.0),
        ("/root/children/0/padding/bottom", 0.0, 4096.0),
        ("/root/children/0/padding/left", 0.0, 4096.0),
        ("/root/children/0/children/0/textStyle/fontSize", 1.0, 512.0),
        (
            "/root/children/0/children/0/textStyle/color/alpha",
            0.0,
            1.0,
        ),
        ("/root/background/alpha", 0.0, 1.0),
    ] {
        for (number, valid) in [
            (min, true),
            (max, true),
            (min - 0.5, false),
            (max + 0.5, false),
        ] {
            let mut candidate = input.clone();
            *candidate.pointer_mut(pointer).unwrap() = json!(number);
            assert_eq!(decode(&candidate).is_ok(), valid, "{pointer} = {number}");
        }
    }
}

#[test]
fn programmatic_non_finite_geometry_is_rejected() {
    for number in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut input = decode(&definition(vec![value(1, "timer")])).unwrap();
        if let LayoutElement::Value {
            frame, text_style, ..
        } = &mut input.root.children[0]
        {
            frame.x = number;
            text_style.font_size = number;
        }
        assert!(validate_definition(&input).is_err());
    }
}

#[test]
fn font_animation_and_colour_choices_are_constrained() {
    for binding in [
        "timer",
        "period-prefix",
        "period-number",
        "home-name",
        "home-score",
        "away-name",
        "away-score",
    ] {
        let mut child = value(1, binding);
        child["animation"] = json!("rolling");
        assert_eq!(
            decode(&definition(vec![child])).is_ok(),
            binding.ends_with("score")
        );
    }
    for (family, weight, valid) in [
        ("anton", 400, true),
        ("anton", 700, false),
        ("poppins", 400, true),
        ("poppins", 500, true),
        ("poppins", 600, true),
        ("poppins", 700, true),
        ("poppins", 800, true),
        ("poppins", 900, true),
        ("poppins", 450, false),
        ("arial", 400, false),
    ] {
        let mut child = value(1, "timer");
        child["textStyle"]["font"] = json!({"family": family, "weight": weight});
        assert_eq!(
            decode(&definition(vec![child])).is_ok(),
            valid,
            "{family} {weight}"
        );
    }
    for invalid in ["red", "#FFF", "#FF000080", "#GG0000"] {
        let mut input = definition(vec![]);
        input["root"]["background"]["hex"] = json!(invalid);
        rejects(&input, LayoutDiagnosticCode::InvalidField);
    }
}

#[test]
fn metadata_must_match_depth_first_order_and_cannot_lock_root() {
    let input = definition(vec![container(1, "free", vec![value(2, "timer")])]);
    for (pointer, replacement) in [
        ("/editor/layers/0/locked", json!(true)),
        ("/editor/layers/1/nodeId", json!(id(2))),
        ("/editor/layers/2/nodeId", json!(id(100))),
    ] {
        let mut candidate = input.clone();
        *candidate.pointer_mut(pointer).unwrap() = replacement;
        rejects(&candidate, LayoutDiagnosticCode::InvalidMetadata);
    }
    let mut candidate = input;
    candidate["editor"]["layers"].as_array_mut().unwrap().pop();
    rejects(&candidate, LayoutDiagnosticCode::InvalidMetadata);
}

#[test]
fn node_and_depth_limits_include_root_and_hidden_nodes() {
    decode(&definition(
        (1..256).map(|number| text(number, "")).collect(),
    ))
    .unwrap();
    rejects(
        &definition((1..257).map(|number| text(number, "")).collect()),
        LayoutDiagnosticCode::LimitExceeded,
    );
    for (levels, valid) in [(16, true), (17, false)] {
        let mut child = text(levels - 1, "");
        for number in (1..levels - 1).rev() {
            child = container(number, "free", vec![child]);
            child["hidden"] = json!(true);
        }
        assert_eq!(decode(&definition(vec![child])).is_ok(), valid);
    }
}

#[test]
fn text_and_label_limits_count_unicode_scalars_and_preserve_line_breaks() {
    let unicode = char::from_u32(0x1f600).unwrap().to_string();
    decode(&definition(vec![text(1, &unicode.repeat(2048))])).unwrap();
    rejects(
        &definition(vec![text(1, &unicode.repeat(2049))]),
        LayoutDiagnosticCode::LimitExceeded,
    );
    let mut input = definition(vec![text(1, "a\nb\n")]);
    input["editor"]["layers"][1]["label"] = json!(unicode.repeat(128));
    decode(&input).unwrap();
    input["editor"]["layers"][1]["label"] = json!(unicode.repeat(129));
    rejects(&input, LayoutDiagnosticCode::LimitExceeded);
    for label in ["", "   ", " label "] {
        input["editor"]["layers"][1]["label"] = json!(label);
        rejects(&input, LayoutDiagnosticCode::InvalidField);
    }
    rejects(
        &definition(vec![text(1, "a\r\nb")]),
        LayoutDiagnosticCode::InvalidField,
    );
}

#[test]
fn compact_definition_budget_and_parser_depth_are_enforced() {
    let unicode = char::from_u32(0x1f600).unwrap().to_string().repeat(2048);
    let input = definition((1..200).map(|number| text(number, &unicode)).collect());
    rejects(&input, LayoutDiagnosticCode::LimitExceeded);
    let deep = format!("{}0{}", "[".repeat(65), "]".repeat(65));
    let error = decode_definition(deep.as_bytes()).unwrap_err();
    assert_eq!(error.code, LayoutCommandErrorCode::LimitExceeded);
    decode(&definition(vec![text(
        1,
        &format!("{}\\\"{}", "[".repeat(100), "]".repeat(100)),
    )]))
    .unwrap();
    let oversized = vec![b' '; MAX_LAYOUT_STORAGE_BYTES + 1];
    assert_eq!(
        decode_storage_document(&oversized).unwrap_err().code,
        LayoutCommandErrorCode::LimitExceeded
    );
}

fn storage(entries: usize) -> Value {
    json!({
        "schemaVersion": 1, "storageRevision": 0,
        "entries": (1..=entries).map(|number| json!({
            "id": id(number), "name": "Custom", "revision": 1, "definition": definition(vec![])
        })).collect::<Vec<_>>(),
        "published": {"revision": 0, "selection": {"kind": "classic"}}
    })
}

fn decode_storage(input: &Value) -> Result<LayoutStorageDocument, LayoutCommandError> {
    decode_storage_document(&serde_json::to_vec(input).unwrap())
}

#[test]
fn saved_and_frozen_revisions_and_roots_remain_independent() {
    let mut input = storage(1);
    input["storageRevision"] = json!(3);
    input["entries"][0]["revision"] = json!(2);
    input["entries"][0]["definition"]["root"]["width"] = json!(1920);
    input["published"] = json!({"revision": 1, "selection": {
        "kind": "custom", "sourceId": id(1), "sourceRevision": 1,
        "sourceName": "Name at Apply", "root": definition(vec![])["root"]
    }});
    let parsed = decode_storage(&input).unwrap();
    assert_eq!(
        decode_storage_document(&serde_json::to_vec(&parsed).unwrap()).unwrap(),
        parsed
    );
    let PublishedLayoutSelection::Custom {
        root,
        source_revision,
        source_name,
        ..
    } = &parsed.published.selection
    else {
        panic!("custom publication was lost");
    };
    assert_eq!(root.width, 622);
    assert_eq!(*source_revision, 1);
    assert_eq!(source_name, "Name at Apply");
    for (pointer, replacement) in [
        ("/published/revision", json!(0)),
        ("/published/selection/sourceRevision", json!(0)),
        ("/published/selection/sourceRevision", json!(3)),
        ("/published/selection/sourceId", json!(id(2))),
        ("/published/selection/root/width", json!(0)),
    ] {
        let mut candidate = input.clone();
        *candidate.pointer_mut(pointer).unwrap() = replacement;
        assert!(decode_storage(&candidate).is_err(), "accepted {pointer}");
    }
}

#[test]
fn storage_schema_entry_ids_names_and_entry_count_are_validated() {
    decode_storage(&storage(0)).unwrap();
    decode_storage(&storage(100)).unwrap();
    assert_eq!(
        decode_storage(&storage(101)).unwrap_err().code,
        LayoutCommandErrorCode::LimitExceeded
    );
    let input = storage(2);
    for (pointer, replacement) in [
        ("/schemaVersion", json!(0)),
        ("/schemaVersion", json!(2)),
        ("/entries/0/id", json!("classic")),
        ("/entries/1/id", json!(id(1))),
        ("/entries/0/name", json!("")),
        ("/entries/0/name", json!(" not trimmed ")),
        ("/entries/0/name", json!("x".repeat(129))),
        ("/entries/0/revision", json!(0)),
    ] {
        let mut candidate = input.clone();
        *candidate.pointer_mut(pointer).unwrap() = replacement;
        assert!(decode_storage(&candidate).is_err(), "accepted {pointer}");
    }
    let mut candidate = input;
    candidate["entries"][0]["definition"]["root"]["width"] = json!(0);
    assert_eq!(
        decode_storage(&candidate).unwrap_err().layout_id,
        Some(id(1))
    );
}

#[test]
fn revisions_are_exact_javascript_integers_and_increments_are_checked() {
    let mut input = storage(1);
    for pointer in [
        "/storageRevision",
        "/entries/0/revision",
        "/published/revision",
    ] {
        *input.pointer_mut(pointer).unwrap() = json!(MAX_LAYOUT_REVISION);
        decode_storage(&input).unwrap();
        *input.pointer_mut(pointer).unwrap() = json!(MAX_LAYOUT_REVISION + 1);
        assert!(decode_storage(&input).is_err());
        *input.pointer_mut(pointer).unwrap() = json!(1);
    }
    assert_eq!(checked_next_revision(0).unwrap(), 1);
    assert_eq!(
        checked_next_revision(MAX_LAYOUT_REVISION - 1).unwrap(),
        MAX_LAYOUT_REVISION
    );
    for revision in [MAX_LAYOUT_REVISION, MAX_LAYOUT_REVISION + 1, u64::MAX] {
        assert_eq!(
            checked_next_revision(revision).unwrap_err().code,
            LayoutCommandErrorCode::LimitExceeded
        );
    }
    validate_saved_selection(&SavedLayoutSelection::Classic {}).unwrap();
    for revision in [1, MAX_LAYOUT_REVISION] {
        validate_saved_selection(&SavedLayoutSelection::Custom {
            id: id(1),
            expected_revision: revision,
        })
        .unwrap();
    }
    for revision in [0, MAX_LAYOUT_REVISION + 1] {
        assert!(validate_saved_selection(&SavedLayoutSelection::Custom {
            id: id(1),
            expected_revision: revision
        })
        .is_err());
    }
}

#[test]
fn compact_definition_size_limit_is_inclusive_to_the_byte() {
    let mut input = decode(&definition(
        (1..256).map(|number| text(number, "")).collect(),
    ))
    .unwrap();
    let mut remaining = MAX_LAYOUT_DEFINITION_BYTES - serde_json::to_vec(&input).unwrap().len();
    for child in &mut input.root.children {
        let LayoutElement::Text { text, .. } = child else {
            unreachable!()
        };
        let escaped_count = (remaining / 6).min(MAX_LAYOUT_TEXT_CHARS);
        *text = "\0".repeat(escaped_count);
        remaining -= escaped_count * 6;
        if remaining < 6 && escaped_count + remaining <= MAX_LAYOUT_TEXT_CHARS {
            text.push_str(&"a".repeat(remaining));
            remaining = 0;
        }
    }
    assert_eq!(remaining, 0);
    assert_eq!(
        serde_json::to_vec(&input).unwrap().len(),
        MAX_LAYOUT_DEFINITION_BYTES
    );
    validate_definition(&input).unwrap();
    if let LayoutElement::Text { text, .. } = input.root.children.last_mut().unwrap() {
        text.push('a');
    }
    assert_eq!(
        validate_definition(&input).unwrap_err().code,
        LayoutCommandErrorCode::LimitExceeded
    );
    validate_root(&input.root).unwrap();
}

#[test]
fn complete_storage_budget_applies_even_when_each_entry_is_valid() {
    let unicode = char::from_u32(0x1f600).unwrap().to_string().repeat(2048);
    let entry = decode(&definition(
        (1..100).map(|number| text(number, &unicode)).collect(),
    ))
    .unwrap();
    let mut document = decode_storage(&storage(20)).unwrap();
    for saved in &mut document.entries {
        saved.definition = entry.clone();
    }
    assert!(serde_json::to_vec(&document).unwrap().len() > MAX_LAYOUT_STORAGE_BYTES);
    assert_eq!(
        validate_storage_document(&document).unwrap_err().code,
        LayoutCommandErrorCode::LimitExceeded
    );
    let mut bytes = serde_json::to_vec(&storage(0)).unwrap();
    bytes.resize(MAX_LAYOUT_STORAGE_BYTES, b' ');
    decode_storage_document(&bytes).unwrap();
}

#[test]
fn malformed_unknown_and_non_finite_json_is_rejected() {
    for bytes in [
        b"{} trailing".as_slice(),
        b"{",
        b"{\"root\":NaN}",
        b"{\"root\":Infinity}",
        b"{\"root\":1e999}",
    ] {
        assert!(decode_definition(bytes).is_err());
    }
    let mut input = storage(0);
    input["published"]["selection"]["root"] = definition(vec![])["root"].clone();
    assert!(decode_storage(&input).is_err());
    assert!(serde_json::from_value::<SavedLayoutSelection>(
        json!({"kind": "classic", "id": id(1)})
    )
    .is_err());
    assert!(serde_json::from_value::<LayoutSize>(json!({"kind": "fill", "pixels": 1})).is_err());
    let at_limit = format!("{}0{}", "[".repeat(64), "]".repeat(64));
    assert_ne!(
        decode_definition(at_limit.as_bytes()).unwrap_err().code,
        LayoutCommandErrorCode::LimitExceeded
    );
}

#[test]
fn nullable_response_fields_are_serialized_as_null_not_omitted() {
    let error = decode_definition(b"{}").unwrap_err();
    let json = serde_json::to_value(error).unwrap();
    for field in ["layoutId", "expectedRevision", "actualRevision"] {
        assert!(json.get(field).unwrap().is_null());
    }
    assert!(json["diagnostics"][0].get("nodeId").unwrap().is_null());
}

#[test]
fn typescript_bindings_preserve_json_tags_field_names_and_number_revisions() {
    assert_eq!(
        serde_json::to_value(LayoutAlignment::Center).unwrap(),
        json!("center")
    );
    assert!(LayoutAlignment::inline().contains("\"center\""));
    let elements = LayoutElement::inline();
    assert!(elements.contains("\"kind\": \"container\""), "{elements}");
    assert!(elements.contains("mainAlign:"), "{elements}");
    assert!(elements.contains("textStyle:"), "{elements}");
    for (declaration, expected) in [
        (LayoutSize::inline(), "\"kind\": \"fill\""),
        (LayoutColor::inline(), "\"kind\": \"team\""),
        (SavedLayoutSelection::inline(), "expectedRevision: number"),
        (PublishedLayoutSelection::inline(), "sourceRevision: number"),
        (LayoutStorageDocument::inline(), "storageRevision: number"),
        (
            LayoutCommandError::inline(),
            "actualRevision: number | null",
        ),
    ] {
        assert!(declaration.contains(expected), "{declaration}");
        assert!(!declaration.contains("bigint"), "{declaration}");
    }
}
