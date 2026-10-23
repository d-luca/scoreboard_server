import { describe, expect, it } from "vitest";
import type { LayoutAlignment } from "../../bindings/LayoutAlignment";
import { resolveLayout } from "./resolveLayout";
import {
	blank,
	box,
	container,
	fill,
	fixtureId,
	frame,
	nestedFlow,
	rectangle,
	starter,
	value,
} from "./testFixtures";

describe("approved geometry fixtures", () => {
	it("resolves Blank as a transparent Free root with one root clip", () => {
		const root = blank();
		const scene = resolveLayout(root);
		expect(scene).toMatchObject({
			width: 622,
			height: 80,
			clip: { x: 0, y: 0, width: 622, height: 80 },
			diagnostics: [],
		});
		expect(scene.nodes).toHaveLength(1);
		expect(scene.nodes[0]).toMatchObject({
			id: root.id,
			parentId: null,
			paintOrder: 0,
			bounds: scene.clip,
			contentBounds: scene.clip,
			borderWidth: 0,
			radius: 0,
		});
	});

	it("positions all 13 starter nodes in depth-first painting order", () => {
		const root = starter();
		const scene = resolveLayout(root);
		expect(scene.diagnostics).toEqual([]);
		expect(scene.nodes.map(({ id, paintOrder }) => [id, paintOrder])).toEqual(
			Array.from({ length: 13 }, (_, index) => [fixtureId(index), index]),
		);
		expect(scene.nodes.map(({ bounds }) => bounds)).toEqual(
			[
				[0, 0, 622, 80],
				[11, 0, 120, 80],
				[19, 4, 104, 44],
				[19, 50, 72, 22],
				[95, 50, 28, 22],
				[131, 0, 240, 80],
				[139, 4, 224, 24],
				[139, 28, 224, 48],
				[131, 76, 240, 4],
				[371, 0, 240, 80],
				[379, 4, 224, 24],
				[379, 28, 224, 48],
				[371, 76, 240, 4],
			].map(([x, y, width, height]) => ({ x, y, width, height })),
		);
		expect(scene.nodes.map(({ parentId }) => parentId)).toEqual(
			[null, 0, 1, 1, 1, 0, 5, 5, 5, 0, 9, 9, 9].map((id) => (id === null ? null : fixtureId(id))),
		);
	});

	it.each([
		[false, [0, 1, 2, 3, 4, 5, 6], { x: 198, y: 92, width: 100, height: 40 }],
		[true, [0, 1, 2, 6], { x: 90, y: 92, width: 208, height: 40 }],
	] as const)("resolves nested Row/Column with B hidden=%s", (hidden, ids, cBounds) => {
		const scene = resolveLayout(nestedFlow(hidden));
		const byId = new Map(scene.nodes.map((node) => [node.id, node]));
		expect(scene.diagnostics).toEqual([]);
		expect(scene.nodes.map(({ id }) => id)).toEqual(ids.map(fixtureId));
		expect(byId.get(fixtureId(1))?.contentBounds).toEqual({
			x: 22,
			y: 28,
			width: 276,
			height: 104,
		});
		expect(byId.get(fixtureId(2))?.bounds).toEqual({ x: 22, y: 112, width: 60, height: 20 });
		expect(byId.get(fixtureId(6))?.bounds).toEqual(cBounds);
		if (!hidden) {
			expect(byId.get(fixtureId(3))?.bounds).toEqual({ x: 90, y: 28, width: 100, height: 104 });
			expect(byId.get(fixtureId(4))?.bounds).toEqual({ x: 130, y: 32, width: 20, height: 20 });
			expect(byId.get(fixtureId(5))?.bounds).toEqual({ x: 94, y: 56, width: 92, height: 72 });
		}
	});

	it.each([
		[1920, 1080, 900],
		[1080, 1920, 1700],
	])("uses %s x %s root bounds without scaling the starter wrapper", (width, height, y) => {
		const wrapper = container(13, {
			frame: frame(622, 80, 100, y),
			children: starter().children,
		});
		const scene = resolveLayout(blank([wrapper], width, height));
		expect(scene.clip).toEqual({ x: 0, y: 0, width, height });
		expect(scene.nodes).toHaveLength(14);
		expect(scene.nodes[3].bounds).toEqual({ x: 119, y: y + 4, width: 104, height: 44 });
		expect(scene.nodes[3].parentId).toBe(fixtureId(1));
		expect(scene.diagnostics).toEqual([]);
	});

	it.each([
		[3840, 2160],
		[2160, 3840],
	])("retains approved maximum root dimensions %s x %s", (width, height) => {
		expect(resolveLayout(blank([], width, height)).clip).toEqual({ x: 0, y: 0, width, height });
	});
});

describe("box model and flow rules", () => {
	it("positions Free children relative to border and asymmetric padding without rounding", () => {
		const parent = container(1, {
			frame: frame(100, 60, 10.5, 15.25),
			box: box({ borderWidth: 3, radius: 12 }),
			padding: { top: 5, right: 7, bottom: 9, left: 11 },
			children: [rectangle(2, 20.25, 10.75, -8, 2.5)],
		});
		const scene = resolveLayout(blank([parent]));
		expect(scene.nodes[1]).toMatchObject({
			contentBounds: { x: 24.5, y: 23.25, width: 76, height: 40 },
			borderWidth: 3,
			radius: 12,
			innerRadius: 9,
		});
		expect(scene.nodes[2].bounds).toEqual({ x: 16.5, y: 25.75, width: 20.25, height: 10.75 });
		expect(scene.diagnostics).toEqual([]);
	});

	const alignments: LayoutAlignment[] = ["start", "center", "end"];
	const cases = (["row", "column"] as const).flatMap((mode) =>
		alignments.flatMap((mainAlign, main) =>
			alignments.map((crossAlign, cross) => ({ mode, mainAlign, crossAlign, main, cross })),
		),
	);
	it.each(cases)(
		"aligns $mode $mainAlign/$crossAlign with signed free space",
		({ mode, mainAlign, crossAlign, main, cross }) => {
			const row = mode === "row";
			const parent = container(1, {
				mode,
				mainAlign,
				crossAlign,
				frame: frame(row ? 100 : 40, row ? 40 : 100, 10, 20),
				// Flow ignores the stored Free coordinates.
				children: [rectangle(2, row ? 20 : 60, row ? 60 : 20, 999, -999)],
			});
			const scene = resolveLayout(blank([parent], 400, 200));
			const mainOffset = main * 40;
			const crossOffset = cross * -10;
			expect(scene.nodes[2].bounds).toEqual({
				x: 10 + (row ? mainOffset : crossOffset),
				y: 20 + (row ? crossOffset : mainOffset),
				width: row ? 20 : 60,
				height: row ? 60 : 20,
			});
		},
	);

	it("allocates equal fractional Fill shares, with no rounding remainder", () => {
		const parent = container(1, {
			mode: "row",
			frame: frame(100, 40),
			children: [rectangle(2, fill, fill), rectangle(3, fill, fill), rectangle(4, fill, fill)],
		});
		const scene = resolveLayout(blank([parent]));
		expect(scene.nodes.slice(2).map(({ bounds }) => bounds)).toEqual(
			[0, 1, 2].map((index) => ({ x: (100 / 3) * index, y: 0, width: 100 / 3, height: 40 })),
		);
		expect(scene.diagnostics).toEqual([]);
	});

	it.each(["center", "end"] as const)("keeps overflowing fixed sizes with %s alignment", (mainAlign) => {
		const parent = container(1, {
			frame: frame(100, 40, 20, 10),
			mode: "row",
			gap: 10,
			mainAlign,
			children: [rectangle(2, 80, 20), rectangle(3, 60, 20)],
		});
		const scene = resolveLayout(blank([parent], 200, 80));
		expect(scene.nodes.slice(2).map(({ bounds }) => [bounds.x, bounds.width])).toEqual(
			mainAlign === "center"
				? [
						[-5, 80],
						[85, 60],
					]
				: [
						[-30, 80],
						[60, 60],
					],
		);
		expect(scene.diagnostics).toEqual([
			expect.objectContaining({
				code: "negative-free-space",
				nodeId: fixtureId(1),
				property: "/root/children/0/children",
			}),
			expect.objectContaining({
				code: "root-overflow",
				nodeId: fixtureId(2),
				property: "/root/children/0/children/0/frame",
			}),
		]);
		expect(scene.clip).toEqual({ x: 0, y: 0, width: 200, height: 80 });
	});

	it("clamps the degenerate content length but preserves its declared origin and padding", () => {
		const parent = container(1, {
			frame: frame(20, 16, 10, 10),
			box: box({ borderWidth: 4, radius: 12 }),
			padding: { top: 12, right: 12, bottom: 12, left: 12 },
			mode: "row",
			children: [rectangle(2, fill, fill)],
		});
		const original = structuredClone(parent);
		const scene = resolveLayout(blank([parent]));
		expect(scene.nodes[1]).toMatchObject({
			contentBounds: { x: 26, y: 26, width: 0, height: 0 },
			borderWidth: 4,
			radius: 8,
			innerRadius: 4,
		});
		expect(scene.nodes[2].bounds).toEqual({ x: 26, y: 26, width: 0, height: 0 });
		expect(scene.diagnostics.map(({ code, property }) => [code, property])).toEqual([
			["empty-content-box", "/root/children/0"],
			["zero-fill", "/root/children/0/children/0/frame/width"],
			["zero-fill", "/root/children/0/children/0/frame/height"],
		]);
		expect(parent).toEqual(original);
	});

	it("clamps border and radii to half the smaller box axis; leaves have no padding", () => {
		const leaf = value(1, "timer", {
			frame: frame(20, 10),
			box: box({ borderWidth: 20, radius: 30 }),
		});
		expect(resolveLayout(blank([leaf])).nodes[1]).toMatchObject({
			borderWidth: 5,
			radius: 5,
			innerRadius: 0,
			contentBounds: { x: 5, y: 5, width: 10, height: 0 },
		});
	});

	it("does not shrink fixed children when Fill runs out of main-axis space", () => {
		const parent = container(1, {
			frame: frame(60, 40),
			mode: "row",
			gap: 10,
			children: [rectangle(2, 80, 20), rectangle(3, fill, fill), rectangle(4, fill, 20)],
		});
		const scene = resolveLayout(blank([parent]));
		expect(scene.nodes.slice(2).map(({ bounds }) => [bounds.x, bounds.width, bounds.height])).toEqual([
			[0, 80, 20],
			[90, 0, 40],
			[100, 0, 20],
		]);
		expect(scene.diagnostics.map(({ code }) => code)).toEqual([
			"negative-free-space",
			"zero-fill",
			"zero-fill",
		]);
	});

	it("reports gap-only overcommit and zero Fill without NaN", () => {
		const parent = container(1, {
			frame: frame(10, 40),
			mode: "row",
			gap: 8,
			children: [rectangle(2, fill, 10), rectangle(3, fill, 10), rectangle(4, fill, 10)],
		});
		const scene = resolveLayout(blank([parent]));
		expect(scene.nodes.slice(2).map(({ bounds }) => bounds.x)).toEqual([0, 8, 16]);
		expect(scene.nodes.slice(2).every(({ bounds }) => bounds.width === 0)).toBe(true);
		expect(scene.diagnostics.map(({ code }) => code)).toEqual([
			"negative-free-space",
			"zero-fill",
			"zero-fill",
			"zero-fill",
		]);
	});

	it("rejects an unvalidated Free/Fill combination explicitly instead of inventing a size", () => {
		expect(() => resolveLayout(blank([rectangle(1, fill, 20)]))).toThrow(
			"Fill sizing is not permitted in a Free parent",
		);
	});
});

describe("visibility, paint order and root-only clipping", () => {
	it("suppresses hidden subtree warnings and preserves original indices in diagnostic pointers", () => {
		const hidden = container(2, {
			hidden: true,
			frame: frame(10, 10, -100),
			box: box({ borderWidth: 10 }),
			children: [rectangle(3, 20, 20, -100)],
		});
		const parent = container(1, {
			mode: "row",
			frame: frame(10, 40),
			gap: 4096,
			children: [hidden, rectangle(4, fill, 10), { ...rectangle(5, 100, 10), hidden: true }],
		});
		const scene = resolveLayout(blank([parent]));
		expect(scene.nodes.map(({ id }) => id)).toEqual([0, 1, 4].map(fixtureId));
		expect(scene.nodes[2].bounds.width).toBe(10);
		expect(scene.diagnostics).toEqual([]);
		parent.frame = frame(10, 10);
		parent.padding = { top: 10, right: 10, bottom: 10, left: 10 };
		expect(resolveLayout(blank([parent])).diagnostics).toContainEqual(
			expect.objectContaining({
				code: "zero-fill",
				nodeId: fixtureId(4),
				property: "/root/children/0/children/1/frame/width",
			}),
		);
	});

	it.each([0, 1])("uses no gaps for %s visible children", (visibleCount) => {
		const parent = container(1, {
			mode: "column",
			gap: 4096,
			children: [container(2, { hidden: visibleCount === 0, frame: frame(10, 10) })],
		});
		expect(resolveLayout(blank([parent])).diagnostics).toEqual([]);
	});

	it("paints whole sibling subtrees in order, without clipping to any ancestor box", () => {
		const root = blank(
			[
				container(1, {
					frame: frame(10, 10, 30, 30),
					box: box({ radius: 12, borderWidth: 1 }),
					children: [
						rectangle(2, 60, 60, -20, -20),
						container(3, { frame: frame(10, 10), children: [rectangle(4, 10, 10)] }),
					],
				}),
				rectangle(5, 20, 20),
				rectangle(6, 20, 20, 195, 95),
			],
			200,
			100,
		);
		const scene = resolveLayout(root);
		expect(scene.nodes.map(({ id, paintOrder }) => [id, paintOrder])).toEqual(
			[0, 1, 2, 3, 4, 5, 6].map((index) => [fixtureId(index), index]),
		);
		expect(scene.nodes[2].bounds).toEqual({ x: 11, y: 11, width: 60, height: 60 });
		expect(scene.nodes[6].bounds).toEqual({ x: 195, y: 95, width: 20, height: 20 });
		expect(scene.diagnostics.map(({ code, nodeId }) => [code, nodeId])).toEqual([
			["root-overflow", fixtureId(6)],
		]);
	});
});
