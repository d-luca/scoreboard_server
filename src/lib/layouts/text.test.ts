import { describe, expect, it } from "vitest";
import { placeLayoutText, type LayoutTextMeasure } from "./text";
import { textStyle } from "./testFixtures";

const measure: LayoutTextMeasure = (_style, text) => ({ width: text.length * 10, ascent: 8, descent: 2 });
const content = { x: 20, y: 30, width: 100, height: 50 };

describe("shared text placement", () => {
	it.each(["start", "center", "end"] as const)(
		"uses signed %s horizontal and vertical alignment",
		(alignment) => {
			const a = alignment === "start" ? 0 : alignment === "center" ? 0.5 : 1;
			const layout = placeLayoutText(
				"123456789012",
				textStyle({ fontSize: 20, horizontalAlign: alignment, verticalAlign: alignment }),
				{ ...content, height: 10 },
				false,
				measure,
			);
			expect(layout.top).toBe(30 + a * (10 - 25));
			expect(layout.lines).toEqual([
				{
					text: "123456789012",
					x: 20 + a * 100,
					baseline: layout.top + (25 - 8 - 2) / 2 + 8,
					left: 20 + a * (100 - 120),
					width: 120,
				},
			]);
			expect(layout.overflow).toBe(true);
		},
	);

	it("keeps empty and trailing explicit lines, without wrapping or shrinking", () => {
		const layout = placeLayoutText("A\r\n\rB\n", textStyle({ fontSize: 20 }), content, true, measure);
		expect(layout.lines.map(({ text }) => text)).toEqual(["A", "", "B", ""]);
		expect(layout.lines.map(({ baseline }) => baseline)).toEqual([20.5, 45.5, 70.5, 95.5]);
		expect(layout.top).toBe(5);
		expect(layout.overflow).toBe(true);
	});

	it("retains a line box for an empty label and keeps bound values single-line", () => {
		expect(placeLayoutText("", textStyle(), content, true, measure).lines).toHaveLength(1);
		expect(placeLayoutText("HOME\r\nTEAM\nNAME", textStyle(), content, false, measure).lines[0].text).toBe(
			"HOME TEAM NAME",
		);
	});

	it("preserves repeated spaces and normalizes tabs identically to Canvas text preparation", () => {
		expect(placeLayoutText("  A\tB  ", textStyle(), content, true, measure).lines[0]).toMatchObject({
			text: "  A B  ",
			width: 70,
		});
	});

	it("uses advance width, not glyph ink, and does not clamp zero content", () => {
		const layout = placeLayoutText(
			"large",
			textStyle({ fontSize: 40 }),
			{ x: 10, y: 20, width: 0, height: 0 },
			false,
			measure,
		);
		expect(layout.lines[0]).toMatchObject({ x: 10, left: -15, baseline: 23 });
		expect(layout.overflow).toBe(true);
	});
});
