import { describe, expect, it } from "vitest";
import { blank, container, frame, rectangle } from "../../lib/layouts/templates";
import { resolveLayout } from "../../lib/layouts/resolveLayout";
import { draftReducer, instantiateDefinition, type Draft } from "./draft";
import {
	fitViewport,
	flowInsertion,
	hitTest,
	layoutPoint,
	resizeHandles,
	snapAxis,
	transformFrame,
	zoomAt,
} from "./workspace";

function draft(root = blank([rectangle(1, 100, 40, 20, 10)])): Draft {
	const definition = instantiateDefinition(root);
	return {
		key: crypto.randomUUID(),
		name: "Test",
		saved: null,
		definition,
		selectedId: definition.root.children[0].id,
	};
}

describe("viewport coordinates", () => {
	it.each([0.25, 0.5, 1, 2, 4])("moves exactly 10x20 logical pixels at zoom %s", (zoom) => {
		const current = draft(
			blank([
				container(1, {
					frame: frame(300, 100, 50, 20),
					padding: { top: 4, right: 0, bottom: 0, left: 10 },
					children: [rectangle(2, 100, 30, 5, 7)],
				}),
			]),
		);
		const parent = current.definition.root.children[0];
		if (parent.kind !== "container") throw new Error("Missing fixture");
		const id = parent.children[0].id;
		const origin = { x: 91, y: 63 };
		const viewport = { zoom, x: -15, y: 29 };
		const start = layoutPoint({ x: 160, y: 220 }, origin, viewport);
		const end = layoutPoint({ x: 160 + 10 * zoom, y: 220 + 20 * zoom }, origin, viewport);
		const result = transformFrame({
			draft: current,
			scene: resolveLayout(current.definition.root),
			id,
			delta: { x: end.x - start.x, y: end.y - start.y },
			handle: null,
			zoom,
			grid: false,
			snap: false,
		});
		expect(result.frame).toEqual(frame(100, 30, 15, 27));
	});

	it("fits with workspace margins and keeps the zoom anchor at the same logical point", () => {
		const viewport = fitViewport(622, 80, { x: 600, y: 400 });
		expect(viewport.zoom).toBeCloseTo(536 / 622);
		expect(viewport.x).toBeCloseTo(32);
		const anchor = { x: 150, y: 200 };
		const before = layoutPoint(anchor, { x: 0, y: 0 }, viewport);
		const after = layoutPoint(anchor, { x: 0, y: 0 }, zoomAt(viewport, anchor, 2));
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});
});

describe("snapping", () => {
	it("uses the inclusive 6 CSS-pixel threshold at every zoom", () => {
		expect(snapAxis([10], [{ position: 13, order: 0 }], 2, false)).toEqual({ delta: 3, guide: 13 });
		expect(snapAxis([10], [{ position: 13.001, order: 0 }], 2, false)).toEqual({ delta: 0, guide: null });
		expect(snapAxis([10], [{ position: 34, order: 0 }], 0.25, false)).toEqual({ delta: 24, guide: 34 });
	});

	it("prefers an edge over grid on ties, then depth-first tree order", () => {
		expect(snapAxis([13], [{ position: 10, order: 2 }], 1, true)).toEqual({ delta: -3, guide: 10 });
		expect(
			snapAxis(
				[13],
				[
					{ position: 10, order: 2 },
					{ position: 16, order: 1 },
				],
				1,
				false,
			),
		).toEqual({ delta: 3, guide: 16 });
		expect(snapAxis([13], [], 1, true)).toEqual({ delta: 3, guide: 16 });
	});

	it("uses parent/sibling edges, but excludes hidden nodes and the moving subtree", () => {
		const current = draft(
			blank([
				container(1, { frame: frame(100, 40, 20, 10), children: [rectangle(2, 10, 10, 7)] }),
				{ ...rectangle(3, 10, 10, 127, 10), hidden: true },
				rectangle(4, 50, 40, 180, 10),
			]),
		);
		const scene = resolveLayout(current.definition.root);
		const result = transformFrame({
			draft: current,
			scene,
			id: current.selectedId,
			delta: { x: 7, y: 0 },
			handle: null,
			zoom: 1,
			snap: true,
			grid: false,
		});
		expect(result.frame.x).toBe(27);
		const sibling = transformFrame({
			draft: current,
			scene,
			id: current.selectedId,
			delta: { x: 59, y: 0 },
			handle: null,
			zoom: 1,
			snap: true,
			grid: false,
		});
		expect(sibling.frame.x).toBe(80);
		expect(sibling.guides).toContainEqual({ axis: "x", position: 180 });
	});
});

describe("resize and selection", () => {
	it.each(resizeHandles)("resizes only the %s active edges and preserves child geometry", (handle) => {
		const current = draft();
		const result = transformFrame({
			draft: current,
			scene: resolveLayout(current.definition.root),
			id: current.selectedId,
			delta: { x: 10, y: 5 },
			handle,
			zoom: 1,
			snap: false,
			grid: false,
		});
		expect(result.frame).toEqual(
			frame(
				handle.includes("w") ? 90 : handle.includes("e") ? 110 : 100,
				handle.includes("n") ? 35 : handle.includes("s") ? 45 : 40,
				handle.includes("w") ? 30 : 20,
				handle.includes("n") ? 15 : 10,
			),
		);
	});

	it("snaps only the active resize edge and stops at a positive size", () => {
		const current = draft(blank([rectangle(1, 100, 40, 20, 10), rectangle(2, 30, 20, 142, 20)]));
		const scene = resolveLayout(current.definition.root);
		const result = transformFrame({
			draft: current,
			scene,
			id: current.selectedId,
			delta: { x: 20, y: 0 },
			handle: "e",
			zoom: 1,
			snap: true,
			grid: false,
		});
		expect(result.frame).toEqual(frame(122, 40, 20, 10));
		expect(result.guides).toEqual([{ axis: "x", position: 142 }]);
		expect(
			transformFrame({
				draft: current,
				scene,
				id: current.selectedId,
				delta: { x: 500, y: 500 },
				handle: "nw",
				zoom: 1,
				snap: false,
				grid: false,
			}).frame,
		).toEqual(frame(1, 1, 119, 49));
	});

	it("selects the topmost visible unlocked box, ignoring locked ancestors and hidden descendants", () => {
		let current = draft(blank([rectangle(1, 100, 40), container(2, { children: [rectangle(3, 100, 40)] })]));
		const top = current.definition.root.children[1];
		if (top.kind !== "container") throw new Error("Missing fixture");
		expect(hitTest(current, resolveLayout(current.definition.root), { x: 10, y: 10 })).toBe(
			top.children[0].id,
		);
		current = draftReducer(current, { type: "lock", id: top.id, locked: true });
		expect(hitTest(current, resolveLayout(current.definition.root), { x: 10, y: 10 })).toBe(
			current.definition.root.children[0].id,
		);
		current = draftReducer(current, { type: "lock", id: top.id, locked: false });
		current = draftReducer(current, { type: "hide", id: top.id, hidden: true });
		expect(hitTest(current, resolveLayout(current.definition.root), { x: 10, y: 10 })).toBe(
			current.definition.root.children[0].id,
		);
	});

	it("does not freely transform flow children, root or locked elements", () => {
		const current = draft(blank([container(1, { mode: "row", children: [rectangle(2, 20, 10)] })]));
		const parent = current.definition.root.children[0];
		if (parent.kind !== "container") throw new Error("Missing fixture");
		expect(() =>
			transformFrame({
				draft: current,
				scene: resolveLayout(current.definition.root),
				id: parent.children[0].id,
				delta: { x: 10, y: 10 },
				handle: null,
				zoom: 1,
				snap: false,
				grid: false,
			}),
		).toThrow("reordered");
	});
});

describe("flow insertion", () => {
	it.each(["row", "column"] as const)(
		"reorders %s subtrees while hidden siblings retain their order",
		(mode) => {
			let current = draft(
				blank([
					container(1, {
						mode,
						frame: frame(300, 300),
						gap: 10,
						children: [
							rectangle(2, 50, 50),
							{ ...rectangle(3, 50, 50), hidden: true },
							container(4, { frame: frame(50, 50), children: [rectangle(5, 10, 10)] }),
							rectangle(6, 50, 50),
						],
					}),
				]),
			);
			const parent = current.definition.root.children[0];
			if (parent.kind !== "container") throw new Error("Missing fixture");
			const id = parent.children[0].id;
			const scene = resolveLayout(current.definition.root);
			const before = flowInsertion(current, scene, id, { x: 0, y: 0 });
			expect(before.index).toBe(1);
			const after = flowInsertion(current, scene, id, { x: 300, y: 300 });
			expect(after.index).toBe(3);
			current = draftReducer(current, { type: "place", id, index: after.index });
			const changed = current.definition.root.children[0];
			expect(changed.kind === "container" && changed.children.map((child) => child.id)).toEqual([
				parent.children[1].id,
				parent.children[2].id,
				parent.children[3].id,
				id,
			]);
			expect(() => draftReducer(current, { type: "place", id, index: -1 })).toThrow("insertion");
		},
	);
});
