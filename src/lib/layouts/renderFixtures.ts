import type { LayoutElement } from "../../bindings/LayoutElement";
import type { LayoutRoot } from "../../bindings/LayoutRoot";
import type { LayoutFont } from "../../bindings/LayoutFont";
import {
	blank,
	box,
	container,
	fixtureId,
	frame,
	nestedFlow,
	rectangle,
	starter,
	textStyle,
	value,
} from "./testFixtures";

function label(
	index: number,
	text: string,
	x: number,
	y: number,
	width = 420,
	height = 48,
): Extract<LayoutElement, { kind: "text" }> {
	return {
		kind: "text",
		id: fixtureId(index),
		hidden: false,
		frame: frame(width, height, x, y),
		box: box(),
		text,
		textStyle: textStyle({ fontSize: 24 }),
	};
}

function styles(): LayoutRoot {
	const fonts: LayoutFont[] = [
		{ family: "anton", weight: 400 },
		...[400, 500, 600, 700, 800, 900].map((weight): LayoutFont => ({ family: "poppins", weight })),
	];
	const children: LayoutElement[] = fonts.map((font, index) => {
		const text = label(index + 1, "Hg0123456789  AV fi label", 16, 16 + index * 60);
		text.textStyle.font = font;
		return text;
	});
	for (const [index, alpha] of [0, 0.5, 1].entries()) {
		const text = label(10 + index, "Overflow\n\nlast line\n", 500 + index * 90, 40, 60, 80);
		text.box = box({
			background: { kind: "team", team: "home", alpha },
			borderColor: { kind: "team", team: "away", alpha },
			borderWidth: index === 1 ? 1 : 3,
			radius: index === 0 ? 0 : 12,
		});
		text.textStyle.color = { kind: "team", team: "away", alpha };
		children.push(text);
	}
	children.push(
		value(20, "home-score", {
			animation: "rolling",
			frame: frame(50, 35, 510, 300),
			textStyle: textStyle({ font: { family: "anton", weight: 400 }, fontSize: 48 }),
		}),
		value(21, "away-score", {
			animation: "none",
			frame: frame(50, 35, 640, 300),
			textStyle: textStyle({ font: { family: "anton", weight: 400 }, fontSize: 48 }),
		}),
		{
			kind: "separator",
			id: fixtureId(22),
			hidden: false,
			frame: frame(220, 3, 500, 240),
			orientation: "horizontal",
			color: { kind: "team", team: "home", alpha: 0.5 },
		},
		{
			kind: "separator",
			id: fixtureId(23),
			hidden: false,
			frame: frame(3, 140, 750, 200),
			orientation: "vertical",
			color: { kind: "team", team: "away", alpha: 1 },
		},
		label(24, "ROOT EDGE CLIPPING", -60, 440, 240, 40),
		label(25, "ROOT EDGE CLIPPING", 720, 485, 240, 40),
	);
	return blank(children, 800, 520);
}

function overflow(): LayoutRoot {
	return blank(
		[
			container(1, {
				frame: frame(100, 40, 20, 10),
				mode: "row",
				gap: 10,
				mainAlign: "center",
				box: box({ background: { kind: "literal", hex: "#111827", alpha: 0.5 }, borderWidth: 1, radius: 12 }),
				children: [
					label(2, "Long overflowing label", 0, 0, 80, 20),
					label(3, "Trailing\nlines\n", 0, 0, 60, 20),
				],
			}),
		],
		200,
		80,
	);
}

function paintedFlow(hidden = false): LayoutRoot {
	const root = nestedFlow(hidden);
	function paint(node: LayoutElement): void {
		if ("box" in node) {
			node.box.background = { kind: "team", team: node.kind === "container" ? "home" : "away", alpha: 0.5 };
		}
		if (node.kind === "container") node.children.forEach(paint);
	}
	root.children.forEach(paint);
	return root;
}

function rootEdges(): LayoutRoot {
	const children = [rectangle(1, 100, 40, -20, -10), rectangle(2, 80, 60, 180, 50)];
	for (const child of children) child.box.background = { kind: "team", team: "home", alpha: 0.5 };
	return blank(children, 200, 80);
}

function alignments(): LayoutRoot {
	const children: LayoutElement[] = [];
	for (const [row, verticalAlign] of (["start", "center", "end"] as const).entries()) {
		for (const [column, horizontalAlign] of (["start", "center", "end"] as const).entries()) {
			const text = label(
				1 + row * 3 + column,
				"  Long overflowing text  \n\nlast line\n",
				80 + column * 240,
				40 + row * 160,
				120,
				70,
			);
			text.textStyle.horizontalAlign = horizontalAlign;
			text.textStyle.verticalAlign = verticalAlign;
			text.box = box({ borderWidth: 3, radius: 12, background: { kind: "team", team: "home", alpha: 0.5 } });
			children.push(text);
		}
	}
	return blank(children, 800, 600);
}

function rollingBoth(): LayoutRoot {
	const root = starter();
	for (const group of root.children) {
		if (group.kind === "container") {
			for (const child of group.children) {
				if (child.kind === "value" && (child.binding === "home-score" || child.binding === "away-score"))
					child.animation = "rolling";
			}
		}
	}
	return root;
}

export const rendererFixtures: readonly Readonly<{ name: string; root: LayoutRoot }>[] = [
	{ name: "blank", root: blank() },
	{ name: "starter", root: starter() },
	{ name: "nested-flow", root: paintedFlow() },
	{ name: "hidden-flow", root: paintedFlow(true) },
	{ name: "overflow", root: overflow() },
	{
		name: "degenerate",
		root: blank([
			container(1, {
				frame: frame(20, 16, 10, 10),
				mode: "row",
				box: box({ borderWidth: 4, radius: 12 }),
				padding: { top: 12, right: 12, bottom: 12, left: 12 },
				children: [
					value(2, "timer", { frame: { x: 0, y: 0, width: { kind: "fill" }, height: { kind: "fill" } } }),
				],
			}),
		]),
	},
	...[
		{ name: "full-frame", width: 1920, height: 1080, y: 900 },
		{ name: "portrait", width: 1080, height: 1920, y: 1700 },
	].map(({ name, width, height, y }) => ({
		name,
		root: blank(
			[container(13, { frame: frame(622, 80, 100, y), children: starter().children })],
			width,
			height,
		),
	})),
	{ name: "styles", root: styles() },
	{
		name: "root-edges",
		root: rootEdges(),
	},
	{ name: "alignments", root: alignments() },
	{ name: "rolling-both", root: rollingBoth() },
];
