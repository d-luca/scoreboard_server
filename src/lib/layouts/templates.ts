import type { LayoutBinding } from "../../bindings/LayoutBinding";
import type { LayoutBoxStyle } from "../../bindings/LayoutBoxStyle";
import type { LayoutElement } from "../../bindings/LayoutElement";
import type { LayoutFrame } from "../../bindings/LayoutFrame";
import type { LayoutRoot } from "../../bindings/LayoutRoot";
import type { LayoutSize } from "../../bindings/LayoutSize";
import type { LayoutTextStyle } from "../../bindings/LayoutTextStyle";

type Container = Extract<LayoutElement, { kind: "container" }>;
type Value = Extract<LayoutElement, { kind: "value" }>;
type Rectangle = Extract<LayoutElement, { kind: "rectangle" }>;

export const templateId = (index: number): string =>
	`00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

export const fill: LayoutSize = { kind: "fill" };

export function frame(width: number | LayoutSize, height: number | LayoutSize, x = 0, y = 0): LayoutFrame {
	return {
		x,
		y,
		width: typeof width === "number" ? { kind: "fixed", pixels: width } : width,
		height: typeof height === "number" ? { kind: "fixed", pixels: height } : height,
	};
}

export function box(overrides: Partial<LayoutBoxStyle> = {}): LayoutBoxStyle {
	return {
		background: { kind: "literal", hex: "#000000", alpha: 0 },
		borderColor: { kind: "literal", hex: "#FFFFFF", alpha: 1 },
		borderWidth: 0,
		radius: 0,
		...overrides,
	};
}

export function textStyle(overrides: Partial<LayoutTextStyle> = {}): LayoutTextStyle {
	return {
		font: { family: "poppins", weight: 400 },
		fontSize: 14,
		color: { kind: "literal", hex: "#FFFFFF", alpha: 1 },
		horizontalAlign: "center",
		verticalAlign: "center",
		...overrides,
	};
}

export function blank(children: LayoutElement[] = [], width = 622, height = 80): LayoutRoot {
	return {
		kind: "root",
		id: templateId(0),
		width,
		height,
		background: { kind: "literal", hex: "#000000", alpha: 0 },
		children,
	};
}

export function container(index: number, overrides: Partial<Container> = {}): Container {
	return {
		kind: "container",
		id: templateId(index),
		hidden: false,
		frame: frame(160, 80),
		box: box(),
		padding: { top: 0, right: 0, bottom: 0, left: 0 },
		mode: "free",
		gap: 0,
		mainAlign: "start",
		crossAlign: "start",
		children: [],
		...overrides,
	};
}

export function rectangle(
	index: number,
	width: number | LayoutSize,
	height: number | LayoutSize,
	x = 0,
	y = 0,
): Rectangle {
	return {
		kind: "rectangle",
		id: templateId(index),
		hidden: false,
		frame: frame(width, height, x, y),
		box: box(),
	};
}

export function value(index: number, binding: LayoutBinding, overrides: Partial<Value> = {}): Value {
	return {
		kind: "value",
		id: templateId(index),
		hidden: false,
		frame: frame(120, 48),
		box: box(),
		binding,
		textStyle: textStyle(),
		animation: "none",
		...overrides,
	};
}

export function starter(): LayoutRoot {
	const groupBox = (): LayoutBoxStyle => box({ background: { kind: "literal", hex: "#111827", alpha: 0.9 } });
	const clock = container(1, {
		frame: frame(120, 80, 11),
		box: groupBox(),
		children: [
			value(2, "timer", {
				frame: frame(104, 44, 8, 4),
				textStyle: textStyle({ font: { family: "anton", weight: 400 }, fontSize: 36 }),
			}),
			value(3, "period-prefix", { frame: frame(72, 22, 8, 50) }),
			value(4, "period-number", { frame: frame(28, 22, 84, 50) }),
		],
	});
	const teams = (["home", "away"] as const).map((team, index) => {
		const id = index === 0 ? 5 : 9;
		const bar = rectangle(id + 3, 240, 4, 0, 76);
		bar.box = box({ background: { kind: "team", team, alpha: 1 } });
		return container(id, {
			frame: frame(240, 80, index === 0 ? 131 : 371),
			box: groupBox(),
			children: [
				value(id + 1, team === "home" ? "home-name" : "away-name", {
					frame: frame(224, 24, 8, 4),
					textStyle: textStyle({ font: { family: "poppins", weight: 600 }, fontSize: 18 }),
				}),
				value(id + 2, team === "home" ? "home-score" : "away-score", {
					frame: frame(224, 48, 8, 28),
					textStyle: textStyle({ font: { family: "anton", weight: 400 }, fontSize: 40 }),
				}),
				bar,
			],
		});
	});
	return blank([clock, ...teams]);
}
