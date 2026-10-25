import { describe, expect, it } from "vitest";
import type { SavedLayout } from "../../bindings/SavedLayout";
import { nestedFlow, blank, container, fill, frame, rectangle, value } from "../../lib/layouts/testFixtures";
import { resolveLayout } from "../../lib/layouts/resolveLayout";
import {
	appearance,
	draftReducer,
	duplicateDraft,
	elementChoices,
	findNode,
	flatten,
	hasUnappliedAppearance,
	instantiateDefinition,
	isDirty,
	newDraft,
	openDraft,
	validateDraft,
	type Draft,
} from "./draft";
import { parseNumber } from "./pendingEdits";

function saved(draft = newDraft("starter")): SavedLayout {
	return {
		id: crypto.randomUUID(),
		revision: 1,
		name: draft.name,
		definition: structuredClone(draft.definition),
	};
}

function withRoot(root = nestedFlow()): Draft {
	const definition = instantiateDefinition(root);
	return { key: crypto.randomUUID(), saved: null, name: "Test", definition, selectedId: definition.root.id };
}

describe("private templates and dirty baselines", () => {
	it.each(["blank", "starter"] as const)(
		"instantiates %s with fresh canonical UUIDs and matching metadata",
		(kind) => {
			const first = newDraft(kind);
			const second = newDraft(kind);
			validateDraft(first.definition);
			validateDraft(second.definition);
			const firstIds = new Set(flatten(first.definition.root).map((node) => node.id));
			expect(flatten(second.definition.root).every((node) => !firstIds.has(node.id))).toBe(true);
			expect(firstIds.size).toBe(kind === "blank" ? 1 : 13);
			firstIds.forEach((id) =>
				expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
			);
			expect(isDirty(first)).toBe(true);
		},
	);

	it("compares complete definition/name against a saved baseline rather than edit counts", () => {
		const baseline = saved();
		let draft = openDraft(baseline);
		expect(isDirty(draft)).toBe(false);
		draft = draftReducer(draft, { type: "label", id: draft.selectedId, label: "New root label" });
		expect(isDirty(draft)).toBe(true);
		draft = draftReducer(draft, {
			type: "label",
			id: draft.selectedId,
			label: baseline.definition.editor.layers[0].label,
		});
		expect(isDirty(draft)).toBe(false);
		draft = draftReducer(draft, { type: "name", name: "  Renamed  " });
		expect(isDirty(draft)).toBe(true);
		expect(baseline.name).toBe("Untitled layout");
	});

	it("keeps starter group styles independent before the first Save", () => {
		const draft = newDraft("starter");
		const next = draftReducer(draft, {
			type: "update",
			id: draft.definition.root.children[0].id,
			update: (node) => {
				if (node.kind === "container") {
					node.box.background = { kind: "literal", hex: "#FF0000", alpha: 1 };
					node.box.borderWidth = 4;
				}
			},
		});
		for (const node of next.definition.root.children.slice(1)) {
			expect(node.kind === "container" && node.box).toMatchObject({
				background: { kind: "literal", hex: "#111827", alpha: 0.9 },
				borderWidth: 0,
			});
		}
	});

	it("duplicates only the saved source with new ids, preserving metadata and limiting Unicode copy names", () => {
		const baseline = saved();
		baseline.name = "🏀".repeat(128);
		baseline.definition.editor.layers[1].locked = true;
		const duplicate = duplicateDraft(baseline);
		expect(duplicate.saved).toBeNull();
		expect(isDirty(duplicate)).toBe(true);
		expect(Array.from(duplicate.name)).toHaveLength(128);
		expect(duplicate.name.endsWith(" copy")).toBe(true);
		expect(duplicate.definition.editor.layers.map(({ label, locked }) => ({ label, locked }))).toEqual(
			baseline.definition.editor.layers.map(({ label, locked }) => ({ label, locked })),
		);
		expect(appearance(duplicate.definition.root)).toBe(appearance(baseline.definition.root));
		validateDraft(duplicate.definition);
	});
});

describe("tree reducer preflight", () => {
	it.each(elementChoices)("adds %s with approved defaults, stable metadata and no input mutation", (kind) => {
		const draft = newDraft("blank");
		const original = structuredClone(draft);
		const next = draftReducer(draft, { type: "add", kind });
		expect(next.definition.root.children).toHaveLength(1);
		expect(next.definition.editor.layers).toHaveLength(2);
		expect(next.selectedId).toBe(next.definition.root.children[0].id);
		expect(draft).toEqual(original);
		validateDraft(next.definition);
	});

	it("rejects duplicate bound values in hidden subtrees and makes them available after removal", () => {
		let draft = newDraft("blank");
		draft = draftReducer(draft, { type: "add", kind: "timer" });
		const timer = draft.selectedId;
		draft = draftReducer(draft, { type: "hide", id: timer, hidden: true });
		expect(() => draftReducer(draft, { type: "add", kind: "timer" })).toThrow("already present");
		draft = draftReducer(draft, { type: "remove", id: timer });
		draft = draftReducer(draft, { type: "add", kind: "timer" });
		expect(findNode(draft.definition.root, draft.selectedId).kind).toBe("value");
	});

	it("adds to the selected leaf's parent and rejects root deletion", () => {
		let draft = newDraft("blank");
		draft = draftReducer(draft, { type: "add", kind: "container" });
		draft = draftReducer(draft, { type: "add", kind: "text" });
		draft = draftReducer(draft, { type: "add", kind: "rectangle" });
		const group = draft.definition.root.children[0];
		expect(group.kind === "container" && group.children.length).toBe(2);
		expect(() => draftReducer(draft, { type: "remove", id: draft.definition.root.id })).toThrow(
			"rendering area",
		);
	});

	it("reorders whole subtrees and synchronizes metadata depth-first", () => {
		let draft = newDraft("starter");
		const homeId = draft.definition.root.children[1].id;
		draft = draftReducer(draft, { type: "reorder", id: homeId, delta: -1 });
		expect(draft.definition.root.children[0].id).toBe(homeId);
		expect(draft.definition.editor.layers.map((layer) => layer.nodeId)).toEqual(
			flatten(draft.definition.root).map((node) => node.id),
		);
		draft = draftReducer(draft, { type: "remove", id: homeId });
		expect(draft.definition.editor.layers).toHaveLength(9);
	});

	it("keeps tree selection available but prevents edits under locked ancestors", () => {
		let draft = newDraft("starter");
		const group = draft.definition.root.children[0];
		const childId = group.kind === "container" ? group.children[0].id : "";
		draft = draftReducer(draft, { type: "lock", id: group.id, locked: true });
		draft = draftReducer(draft, { type: "select", id: childId });
		expect(draft.selectedId).toBe(childId);
		expect(() => draftReducer(draft, { type: "hide", id: childId, hidden: true })).toThrow("Unlock");
		expect(() => draftReducer(draft, { type: "lock", id: childId, locked: false })).toThrow("ancestor");
		draft = draftReducer(draft, { type: "lock", id: group.id, locked: false });
		expect(() => draftReducer(draft, { type: "hide", id: childId, hidden: true })).not.toThrow();
	});

	it("rejects counts, nesting, dimensions and text outside approved boundaries atomically", () => {
		const draft = newDraft("blank");
		const original = structuredClone(draft);
		expect(() =>
			draftReducer(draft, {
				type: "update",
				id: draft.selectedId,
				update: (node) => {
					if (node.kind === "root") {
						node.width = 3840;
						node.height = 2161;
					}
				},
			}),
		).toThrow("Output dimensions");
		expect(draft).toEqual(original);
		const many = withRoot(blank(Array.from({ length: 256 }, (_, index) => rectangle(index + 1, 1, 1))));
		expect(() => validateDraft(many.definition)).toThrow("256");
		let nested = container(1);
		for (let depth = 2; depth <= 15; depth++) nested = container(depth, { children: [nested] });
		expect(() => validateDraft(withRoot(blank([nested])).definition)).not.toThrow();
		expect(() => validateDraft(withRoot(blank([container(16, { children: [nested] })])).definition)).toThrow(
			"16 levels",
		);
		let text = draftReducer(draft, { type: "add", kind: "text" });
		text = draftReducer(text, {
			type: "update",
			id: text.selectedId,
			update: (node) => {
				if (node.kind === "text") node.text = "🏀".repeat(2048);
			},
		});
		expect(() =>
			draftReducer(text, {
				type: "update",
				id: text.selectedId,
				update: (node) => {
					if (node.kind === "text") node.text += "a";
				},
			}),
		).toThrow("2048");
	});
});

describe("mode conversion and reparenting", () => {
	it.each([false, true])("freezes the actual Fill size when switching to Fixed (hidden=%s)", (hidden) => {
		let draft = withRoot(
			blank([
				container(1, {
					frame: frame(301, 51),
					mode: "row",
					gap: 1,
					children: [rectangle(2, fill, fill), { ...rectangle(3, fill, fill), hidden }],
				}),
			]),
		);
		const parent = draft.definition.root.children[0];
		if (parent.kind !== "container") throw new Error("Missing fixture container");
		const child = parent.children[1];
		draft = draftReducer(draft, { type: "sizing", id: child.id, axis: "width", kind: "fixed" });
		expect(findNode(draft.definition.root, child.id)).toMatchObject({
			frame: { width: { kind: "fixed", pixels: 150 }, height: fill },
		});
		draft = draftReducer(draft, { type: "sizing", id: child.id, axis: "height", kind: "fixed" });
		expect(findNode(draft.definition.root, child.id)).toMatchObject({
			frame: { width: { kind: "fixed", pixels: 150 }, height: { kind: "fixed", pixels: 51 } },
		});
		draft = draftReducer(draft, { type: "sizing", id: child.id, axis: "width", kind: "fill" });
		expect(findNode(draft.definition.root, child.id)).toMatchObject({ frame: { width: fill } });
	});

	it("rejects zero Fill-to-Fixed and Free-to-Fill sizing without changing the draft", () => {
		const draft = withRoot(
			blank([
				container(1, {
					frame: frame(10, 10),
					mode: "row",
					padding: { top: 12, right: 12, bottom: 12, left: 12 },
					children: [rectangle(2, fill, fill)],
				}),
			]),
		);
		const parent = draft.definition.root.children[0];
		if (parent.kind !== "container") throw new Error("Missing fixture container");
		const before = structuredClone(draft);
		expect(() =>
			draftReducer(draft, {
				type: "sizing",
				id: parent.children[0].id,
				axis: "width",
				kind: "fixed",
			}),
		).toThrow("Width");
		expect(() =>
			draftReducer(draft, {
				type: "sizing",
				id: parent.id,
				axis: "height",
				kind: "fill",
			}),
		).toThrow("Free children");
		expect(draft).toEqual(before);
	});

	it.each([false, true])("freezes flow positions without changing visibility (hidden=%s)", (hidden) => {
		let draft = withRoot(nestedFlow(hidden));
		const row = draft.definition.root.children[0];
		const before = resolveLayout(draft.definition.root);
		draft = draftReducer(draft, { type: "mode", id: row.id, mode: "free" });
		const after = resolveLayout(draft.definition.root);
		expect(after.nodes.map(({ bounds }) => bounds)).toEqual(before.nodes.map(({ bounds }) => bounds));
		expect(
			draft.definition.root.children[0].kind === "container" &&
				draft.definition.root.children[0].children[1].hidden,
		).toBe(hidden);
		validateDraft(draft.definition);
	});

	it("rejects zero-sized Fill conversion without partially changing the tree", () => {
		const draft = withRoot(
			blank([
				container(1, {
					frame: frame(20, 16, 10, 10),
					mode: "row",
					padding: { top: 12, right: 12, bottom: 12, left: 12 },
					children: [rectangle(2, fill, fill)],
				}),
			]),
		);
		const original = structuredClone(draft);
		expect(() =>
			draftReducer(draft, { type: "mode", id: draft.definition.root.children[0].id, mode: "free" }),
		).toThrow("Width");
		expect(draft).toEqual(original);
	});

	it("preserves global bounds into Free and freezes sizes into flow", () => {
		let draft = withRoot(
			blank([
				container(1, {
					frame: frame(200, 100, 50, 20),
					children: [value(2, "timer", { frame: frame(80, 20, 10, 5) })],
				}),
				container(3, { frame: frame(200, 100, 300, 20) }),
			]),
		);
		const [oldParent, newParent] = draft.definition.root.children;
		const child = oldParent.kind === "container" ? oldParent.children[0] : null;
		if (!child) throw new Error("Missing fixture child");
		const before = resolveLayout(draft.definition.root).nodes.find((node) => node.id === child.id)?.bounds;
		draft = draftReducer(draft, { type: "reparent", id: child.id, parentId: newParent.id });
		expect(resolveLayout(draft.definition.root).nodes.find((node) => node.id === child.id)?.bounds).toEqual(
			before,
		);
		draft = draftReducer(draft, { type: "mode", id: oldParent.id, mode: "row" });
		draft = draftReducer(draft, { type: "reparent", id: child.id, parentId: oldParent.id });
		expect(findNode(draft.definition.root, child.id)).toMatchObject({ frame: frame(80, 20) });
	});

	it("rejects cycles, leaf targets and locked destinations", () => {
		let draft = withRoot();
		const row = draft.definition.root.children[0];
		if (row.kind !== "container") throw new Error("Missing fixture row");
		expect(() => draftReducer(draft, { type: "reparent", id: row.id, parentId: row.children[1].id })).toThrow(
			"own subtree",
		);
		expect(() =>
			draftReducer(draft, { type: "reparent", id: row.children[1].id, parentId: row.children[0].id }),
		).toThrow("container");
		draft = draftReducer(draft, { type: "lock", id: row.children[1].id, locked: true });
		expect(() =>
			draftReducer(draft, { type: "reparent", id: row.children[0].id, parentId: row.children[1].id }),
		).toThrow("Unlock");
	});
});

describe("appearance and input semantics", () => {
	it("ignores ids, metadata and hidden subtrees but retains visible bindings and styling", () => {
		const source = saved();
		const copy = duplicateDraft(source);
		copy.definition.editor.layers[0].label = "Different label";
		expect(
			hasUnappliedAppearance(source, {
				kind: "custom",
				sourceId: source.id,
				sourceRevision: 1,
				sourceName: source.name,
				root: copy.definition.root,
			}),
		).toBe(false);
		copy.definition.root.children.push({ ...rectangle(99, 10, 10), hidden: true });
		expect(appearance(copy.definition.root)).toBe(appearance(source.definition.root));
		copy.definition.root.background.alpha = 1;
		expect(appearance(copy.definition.root)).not.toBe(appearance(source.definition.root));
	});

	it.each(["", "-", "NaN", "Infinity", "1.1", "-1", "3841"])(
		"rejects incomplete/invalid integer input %s",
		(raw) => {
			expect(() => parseNumber(raw, 1, 3840, true)).toThrow();
		},
	);

	it("accepts fractional geometry without rounding", () => {
		expect(parseNumber(" 12.125 ", -16384, 16384)).toBe(12.125);
	});
});
