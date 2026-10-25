import type { Draft } from "./draft";

type Edit = Pick<Draft, "name" | "definition" | "selectedId">;
export type DraftHistory = { past: readonly Edit[]; future: readonly Edit[] };
export const emptyHistory = (): DraftHistory => ({ past: [], future: [] });

export function sameEdit(first: Edit, second: Edit): boolean {
	return first.name === second.name && JSON.stringify(first.definition) === JSON.stringify(second.definition);
}

function edit(draft: Draft): Edit {
	return { name: draft.name, definition: draft.definition, selectedId: draft.selectedId };
}

export function remember(history: DraftHistory, before: Draft, after: Draft): DraftHistory {
	return sameEdit(before, after) ? history : { past: [...history.past, edit(before)], future: [] };
}

/** Saved identity/revision is a baseline, not an undoable edit. Save never clears history. */
export function travel(
	history: DraftHistory,
	draft: Draft,
	direction: "undo" | "redo",
): { history: DraftHistory; draft: Draft } {
	const source = direction === "undo" ? history.past : history.future;
	const target = source[source.length - 1];
	if (!target) return { history, draft };
	return {
		draft: { ...draft, ...target },
		history:
			direction === "undo"
				? { past: history.past.slice(0, -1), future: [...history.future, edit(draft)] }
				: { past: [...history.past, edit(draft)], future: history.future.slice(0, -1) },
	};
}
