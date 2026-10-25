import { describe, expect, it } from "vitest";
import { draftReducer, isDirty, newDraft, type Draft } from "./draft";
import { emptyHistory, remember, travel } from "./history";

function width(draft: Draft, value: number): Draft {
	return draftReducer(draft, {
		type: "update",
		id: draft.definition.root.id,
		update: (node) => {
			if (node.kind === "root") node.width = value;
		},
	});
}

describe("definition history", () => {
	it("keeps new drafts unsaved when undo returns to their initial content", () => {
		const before = newDraft("blank");
		const after = width(before, 700);
		const undone = travel(remember(emptyHistory(), before, after), after, "undo");
		expect(undone.draft.definition).toEqual(before.definition);
		expect(isDirty(undone.draft)).toBe(true);
		expect(undone.draft.saved).toBeNull();
	});

	it("retains history on Save and compares undo/redo with the new saved baseline", () => {
		const before = newDraft("starter");
		const changed = width(before, 800);
		const history = remember(emptyHistory(), before, changed);
		const saved = {
			id: crypto.randomUUID(),
			revision: 1,
			name: changed.name,
			definition: structuredClone(changed.definition),
		};
		const current = { ...changed, saved };
		expect(isDirty(current)).toBe(false);
		const undone = travel(history, current, "undo");
		expect(undone.draft.saved).toBe(saved);
		expect(undone.draft.key).toBe(before.key);
		expect(isDirty(undone.draft)).toBe(true);
		const redone = travel(undone.history, undone.draft, "redo");
		expect(redone.draft.definition.root.width).toBe(800);
		expect(isDirty(redone.draft)).toBe(false);
		expect(redone.history.past).toHaveLength(1);
	});

	it("records a complete gesture as one edit and ignores selection/no-op changes", () => {
		const initial = newDraft("starter");
		const selected = draftReducer(initial, { type: "select", id: initial.definition.root.children[1].id });
		const empty = emptyHistory();
		expect(remember(empty, initial, selected)).toBe(empty);
		let moved = selected;
		for (let x = 0; x < 40; x++)
			moved = draftReducer(moved, {
				type: "update",
				id: selected.selectedId,
				update: (node) => {
					if (node.kind !== "root") node.frame.x = x;
				},
			});
		const history = remember(empty, selected, moved);
		expect(history.past).toHaveLength(1);
		expect(travel(history, moved, "undo").draft).toEqual(selected);
		expect(remember(empty, selected, selected)).toBe(empty);
	});

	it("restores a removed subtree, selection and layer metadata together", () => {
		const before = newDraft("starter");
		const id = before.definition.root.children[1].id;
		const selected = draftReducer(before, { type: "select", id });
		const after = draftReducer(selected, { type: "remove", id });
		const undo = travel(remember(emptyHistory(), selected, after), after, "undo");
		expect(undo.draft).toEqual(selected);
		expect(travel(undo.history, undo.draft, "redo").draft).toEqual(after);
	});

	it("supports names/lock metadata and clears redo only after a real new edit", () => {
		const before = newDraft("starter");
		const named = draftReducer(before, { type: "name", name: "New name" });
		const undo = travel(remember(emptyHistory(), before, named), named, "undo");
		const selection = draftReducer(undo.draft, { type: "select", id: before.definition.root.children[0].id });
		expect(remember(undo.history, undo.draft, selection).future).toHaveLength(1);
		const locked = draftReducer(selection, { type: "lock", id: selection.selectedId, locked: true });
		const history = remember(undo.history, selection, locked);
		expect(history.future).toHaveLength(0);
		expect(travel(history, locked, "undo").draft.definition).toEqual(before.definition);
		expect(travel(emptyHistory(), before, "undo").draft).toBe(before);
	});
});
