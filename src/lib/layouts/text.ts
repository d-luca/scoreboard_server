import type { LayoutTextStyle } from "../../bindings/LayoutTextStyle";
import { assertLayoutFontLoaded, layoutFontCss, layoutFontFamily } from "./fonts";
import type { LayoutRect } from "./resolveLayout";

export type LayoutTextMetrics = Readonly<{ width: number; ascent: number; descent: number }>;
export type LayoutTextMeasure = (style: LayoutTextStyle, text: string) => LayoutTextMetrics;
export type LayoutTextLine = Readonly<{
	text: string;
	x: number;
	baseline: number;
	left: number;
	width: number;
}>;
export type LayoutText = Readonly<{
	font: string;
	family: string;
	weight: number;
	fontSize: number;
	anchor: "start" | "middle" | "end";
	canvasAlign: CanvasTextAlign;
	top: number;
	lineHeight: number;
	lines: readonly LayoutTextLine[];
	overflow: boolean;
}>;

const align = { start: 0, center: 0.5, end: 1 };
const cache = new Map<string, LayoutTextMetrics>();
const CACHE_LIMIT = 1024;
let context: CanvasRenderingContext2D | null = null;

export const measureLayoutText: LayoutTextMeasure = (style, text) => {
	assertLayoutFontLoaded(style.font);
	const font = layoutFontCss(style);
	const key = JSON.stringify([font, text]);
	const cached = cache.get(key);
	if (cached) {
		cache.delete(key);
		cache.set(key, cached);
		return cached;
	}
	if (!context) context = document.createElement("canvas").getContext("2d");
	if (!context) throw new Error("Canvas2D is required to measure custom layout text.");
	context.font = font;
	context.textBaseline = "alphabetic";
	context.direction = "ltr";
	context.fontKerning = "normal";
	context.letterSpacing = "0px";
	context.wordSpacing = "0px";
	const reference = context.measureText("Hg0123456789");
	const metrics = {
		width: context.measureText(text).width,
		ascent: reference.actualBoundingBoxAscent,
		descent: reference.actualBoundingBoxDescent,
	};
	if (!Object.values(metrics).every(Number.isFinite)) {
		throw new Error(`The browser could not measure bundled layout font ${font}.`);
	}
	cache.set(key, metrics);
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	return metrics;
};

export function placeLayoutText(
	text: string,
	style: LayoutTextStyle,
	content: LayoutRect,
	multiline: boolean,
	measure: LayoutTextMeasure = measureLayoutText,
): LayoutText {
	const normalized = text.replace(/[\t\f\v]/g, " ");
	const lines = multiline ? normalized.split(/\r\n|\r|\n/) : [normalized.replace(/\r\n|\r|\n/g, " ")];
	const lineHeight = style.fontSize * 1.25;
	const top = content.y + align[style.verticalAlign] * (content.height - lines.length * lineHeight);
	const x = content.x + align[style.horizontalAlign] * content.width;
	const measured = lines.map((line, index) => {
		const { width, ascent, descent } = measure(style, line);
		return {
			text: line,
			x,
			baseline: top + index * lineHeight + (lineHeight - ascent - descent) / 2 + ascent,
			left: x - align[style.horizontalAlign] * width,
			width,
		};
	});
	return {
		font: layoutFontCss(style),
		family: layoutFontFamily(style.font),
		weight: style.font.weight,
		fontSize: style.fontSize,
		anchor: style.horizontalAlign === "center" ? "middle" : style.horizontalAlign,
		canvasAlign:
			style.horizontalAlign === "start" ? "left" : style.horizontalAlign === "end" ? "right" : "center",
		top,
		lineHeight,
		lines: measured,
		overflow:
			lines.length * lineHeight > content.height || measured.some(({ width }) => width > content.width),
	};
}
