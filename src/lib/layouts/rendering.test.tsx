import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	blank,
	box,
	container,
	fixtureId,
	frame,
	rectangle,
	sampleInputs,
	starter,
	textStyle,
	value,
} from "./testFixtures";
import { resolveLayout } from "./resolveLayout";
import { layoutBorderPath, roundedLayoutPath } from "./paths";
import { rendererFixtures } from "./renderFixtures";

const ctx = {
	canvas: { width: 622, height: 80 },
	font: "",
	save: vi.fn(),
	restore: vi.fn(),
	setTransform: vi.fn(),
	clearRect: vi.fn(),
	beginPath: vi.fn(),
	rect: vi.fn(),
	clip: vi.fn(),
	fill: vi.fn(),
	fillText: vi.fn(),
	measureText: vi.fn((text: string) => ({
		width: text.length * 10,
		actualBoundingBoxAscent: 8,
		actualBoundingBoxDescent: 2,
	})),
};
const load = vi.fn();

function browser(): { fonts: Set<FontFace>; ctx: typeof ctx; load: typeof load } {
	const fonts = new Set<FontFace>();
	ctx.canvas.width = 622;
	ctx.canvas.height = 80;
	class Face {
		status = "unloaded";
		constructor(
			readonly family: string,
			readonly source: string,
			readonly descriptors: FontFaceDescriptors,
		) {}
		async load(): Promise<this> {
			await load();
			this.status = "loaded";
			return this;
		}
	}
	vi.stubGlobal("FontFace", Face);
	vi.stubGlobal(
		"Path2D",
		class {
			constructor(readonly path: string) {}
		},
	);
	vi.stubGlobal("document", { fonts, createElement: () => ({ getContext: () => ctx }) });
	return { fonts, ctx, load };
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	load.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("bundled font gate and shared frames", () => {
	it("loads only visible exact faces once, including concurrent requests", async () => {
		const { fonts, load } = browser();
		const { loadLayoutFonts } = await import("./fonts");
		const scene = resolveLayout(starter());
		await Promise.all([loadLayoutFonts(scene), loadLayoutFonts(scene)]);
		expect(load).toHaveBeenCalledTimes(3);
		expect(fonts.size).toBe(3);
		const hidden = value(1, "timer", {
			hidden: true,
			textStyle: textStyle({ font: { family: "poppins", weight: 900 } }),
		});
		await loadLayoutFonts(resolveLayout(blank([hidden])));
		expect(load).toHaveBeenCalledTimes(3);
	});

	it("blocks measurement before font readiness and surfaces failures with an explicit retry", async () => {
		const { load } = browser();
		const { loadLayoutFonts } = await import("./fonts");
		const { createLayoutFrame } = await import("./renderFrame");
		const scene = resolveLayout(blank([value(1, "timer")]));
		expect(() => createLayoutFrame(scene, sampleInputs)).toThrow("Await loadLayoutFonts first");
		load.mockRejectedValueOnce(new Error("font request failed"));
		await expect(loadLayoutFonts(scene)).rejects.toThrow("font request failed");
		expect(() => createLayoutFrame(scene, sampleInputs)).toThrow("not loaded");
		await loadLayoutFonts(scene);
		expect(createLayoutFrame(scene, sampleInputs).nodes[1].text).toBe("15:00");
	});

	it("also allows retry after a synchronous FontFace construction failure", async () => {
		browser();
		const fontFace = globalThis.FontFace;
		vi.stubGlobal(
			"FontFace",
			class {
				constructor() {
					throw new Error("unsupported font API");
				}
			},
		);
		const { loadLayoutFonts } = await import("./fonts");
		const scene = resolveLayout(starter());
		await expect(loadLayoutFonts(scene)).rejects.toThrow("unsupported font API");
		vi.stubGlobal("FontFace", fontFace);
		await expect(loadLayoutFonts(scene)).resolves.toBeUndefined();
	});

	it("rejects unavailable weights instead of exposing a fallback font", async () => {
		browser();
		const { loadLayoutFonts } = await import("./fonts");
		await expect(
			loadLayoutFonts(
				resolveLayout(
					blank([
						value(1, "timer", {
							textStyle: textStyle({ font: { family: "anton", weight: 700 } }),
						}),
					]),
				),
			),
		).rejects.toThrow("Unsupported layout font: anton/700");
	});

	it("caches text by font/weight/size and string while retaining all geometry references", async () => {
		const { ctx } = browser();
		const { loadLayoutFonts } = await import("./fonts");
		const { createLayoutFrame } = await import("./renderFrame");
		const scene = resolveLayout(starter());
		await loadLayoutFonts(scene);
		const first = createLayoutFrame(scene, sampleInputs);
		ctx.measureText.mockClear();
		const second = createLayoutFrame(scene, sampleInputs);
		expect(ctx.measureText).not.toHaveBeenCalled();
		second.nodes.forEach((node, index) => expect(node.geometry).toBe(first.nodes[index].geometry));
		createLayoutFrame(scene, { ...sampleInputs, homeScore: 123 });
		expect(ctx.measureText).toHaveBeenCalledWith("123");
	});

	it("reports informational text overflow at the original hidden-aware JSON pointer", async () => {
		browser();
		const { loadLayoutFonts } = await import("./fonts");
		const { createLayoutFrame } = await import("./renderFrame");
		const scene = resolveLayout(
			blank([
				container(1, {
					children: [value(2, "timer", { hidden: true }), value(3, "home-name", { frame: frame(1, 1) })],
				}),
			]),
		);
		await loadLayoutFonts(scene);
		expect(createLayoutFrame(scene, sampleInputs).diagnostics).toContainEqual({
			severity: "info",
			code: "text-overflow",
			nodeId: fixtureId(3),
			property: "/root/children/0/children/1/textStyle",
			message: expect.stringContaining("only the rendering root clips"),
		});
	});
});

describe("shared border paths", () => {
	it("uses a filled inside ring, including a fully consumed inner box", () => {
		const leaf = rectangle(1, 20, 10, 4, 6);
		leaf.box = box({ borderWidth: 3, radius: 12 });
		const node = resolveLayout(blank([leaf])).nodes[1];
		expect(layoutBorderPath(node)).toBe(
			roundedLayoutPath(node.bounds, 5) + roundedLayoutPath({ x: 7, y: 9, width: 14, height: 4 }, 2),
		);
		leaf.box.borderWidth = 100;
		const consumed = resolveLayout(blank([leaf])).nodes[1];
		expect(layoutBorderPath(consumed)).toBe(roundedLayoutPath(consumed.bounds, 5));
		expect(roundedLayoutPath({ x: 0, y: 0, width: 0, height: 10 }, 4)).toBe("");
	});
});

describe("live/canvas presentation", () => {
	it.each(rendererFixtures)(
		"draws the $name fixture without changing geometry or inputs",
		async ({ root }) => {
			browser();
			const { loadLayoutFonts } = await import("./fonts");
			const { createLayoutFrame } = await import("./renderFrame");
			const { renderLayoutToCanvas } = await import("./renderLayoutToCanvas");
			const { ScoreboardLayout } = await import("../../components/ScoreboardLayout/ScoreboardLayout");
			const scene = resolveLayout(root);
			const original = structuredClone(root);
			await loadLayoutFonts(scene);
			ctx.canvas.width = scene.width;
			ctx.canvas.height = scene.height;
			const context = document.createElement("canvas").getContext("2d");
			if (!context) throw new Error("Missing test canvas");
			const rendered = createLayoutFrame(scene, sampleInputs);
			renderLayoutToCanvas(context, rendered);
			expect(renderToStaticMarkup(<ScoreboardLayout frame={rendered} />)).toContain('role="img"');
			rendered.nodes.forEach((node, index) => expect(node.geometry).toBe(scene.nodes[index]));
			expect(root).toEqual(original);
		},
	);

	it("renders Blank with only one root clip and no editor or descendant masks", async () => {
		const { createLayoutFrame } = await import("./renderFrame");
		const { ScoreboardLayout } = await import("../../components/ScoreboardLayout/ScoreboardLayout");
		const markup = renderToStaticMarkup(
			<ScoreboardLayout frame={createLayoutFrame(resolveLayout(blank()), sampleInputs)} />,
		);
		expect(markup.match(/<clipPath/g)).toHaveLength(1);
		expect(markup).not.toContain("<path");
		expect(markup).not.toContain("<text");
		expect(markup).not.toContain("selection");
	});

	it("uses shared global paths and baselines, and keeps Rolling static and unmasked at rest", async () => {
		const { ctx } = browser();
		const { loadLayoutFonts } = await import("./fonts");
		const { createLayoutFrame } = await import("./renderFrame");
		const { renderLayoutToCanvas } = await import("./renderLayoutToCanvas");
		const { ScoreboardLayout } = await import("../../components/ScoreboardLayout/ScoreboardLayout");
		const scene = resolveLayout(
			blank([
				value(1, "home-score", { animation: "rolling" }),
				value(2, "away-score", { animation: "none", frame: frame(120, 48, 150) }),
			]),
		);
		await loadLayoutFonts(scene);
		const rendered = createLayoutFrame(scene, { ...sampleInputs, homeScore: 12, awayScore: 105 });
		const markup = renderToStaticMarkup(<ScoreboardLayout frame={rendered} />);
		expect(markup.match(/<clipPath/g)).toHaveLength(1);
		expect(markup).toContain('xml:space="preserve"');
		expect(markup).toContain("white-space:pre");
		expect(markup).not.toContain("data-layout-rolling");
		const context = document.createElement("canvas").getContext("2d");
		if (!context) throw new Error("Missing test canvas");
		renderLayoutToCanvas(context, rendered);
		expect(ctx.clip).toHaveBeenCalledTimes(1);
		expect(ctx.fillText.mock.calls).toEqual(
			rendered.nodes.flatMap(({ textLayout }) =>
				textLayout ? textLayout.lines.map(({ text, x, baseline }) => [text, x, baseline]) : [],
			),
		);
		for (const node of rendered.nodes) {
			for (const line of node.textLayout?.lines ?? []) {
				expect(markup).toContain(`x="${line.x}" y="${line.baseline}"`);
			}
		}
		expect(ctx.restore).toHaveBeenCalledOnce();
	});

	it("clears transparent padding, uniformly scales, validates bounds and restores context on errors", async () => {
		const { ctx } = browser();
		ctx.canvas.width = 932;
		ctx.canvas.height = 120;
		const { createLayoutFrame } = await import("./renderFrame");
		const { renderLayoutToCanvas } = await import("./renderLayoutToCanvas");
		const rendered = createLayoutFrame(resolveLayout(blank([], 621, 79)), sampleInputs);
		const context = document.createElement("canvas").getContext("2d");
		if (!context) throw new Error("Missing test canvas");
		renderLayoutToCanvas(context, rendered, 1.5);
		expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 932, 120);
		expect(ctx.setTransform).toHaveBeenLastCalledWith(1.5, 0, 0, 1.5, 0, 0);
		expect(() => renderLayoutToCanvas(context, rendered, 2)).toThrow("complete uniformly scaled root");
		expect(() => renderLayoutToCanvas(context, rendered, NaN)).toThrow("complete uniformly scaled root");
		ctx.clip.mockImplementationOnce(() => {
			throw new Error("drawing failed");
		});
		expect(() => renderLayoutToCanvas(context, rendered)).toThrow("drawing failed");
		expect(ctx.restore).toHaveBeenCalledTimes(2);
	});
});
