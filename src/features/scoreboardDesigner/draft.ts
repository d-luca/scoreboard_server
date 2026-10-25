import type { LayoutBinding } from "../../bindings/LayoutBinding";
import type { LayoutDefinition } from "../../bindings/LayoutDefinition";
import type { LayoutElement } from "../../bindings/LayoutElement";
import type { LayoutRoot } from "../../bindings/LayoutRoot";
import type { LayoutMode } from "../../bindings/LayoutMode";
import type { SavedLayout } from "../../bindings/SavedLayout";
import type { PublishedLayoutSelection } from "../../bindings/PublishedLayoutSelection";
import { resolveLayout, type ResolvedLayoutScene } from "../../lib/layouts/resolveLayout";
import {
	blank,
	box,
	container,
	frame,
	rectangle,
	starter,
	textStyle,
	value,
} from "../../lib/layouts/templates";

export type LayoutNode = LayoutRoot | LayoutElement;
export type AddKind = LayoutBinding | "container" | "text" | "rectangle" | "separator";
export const elementChoices: readonly AddKind[] = [
	"container",
	"timer",
	"period-prefix",
	"period-number",
	"home-name",
	"home-score",
	"away-name",
	"away-score",
	"text",
	"rectangle",
	"separator",
];
export const displayName = (kind: string): string =>
	kind
		.split("-")
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(" ");

export type Draft = {
	key: string;
	saved: SavedLayout | null;
	name: string;
	definition: LayoutDefinition;
	selectedId: string;
};

export function flatten(root: LayoutNode): LayoutNode[] {
	return [root, ...("children" in root ? root.children.flatMap(flatten) : [])];
}

export function findNode(root: LayoutRoot, id: string): LayoutNode {
	const node = flatten(root).find((node) => node.id === id);
	if (!node) throw new Error("The selected element no longer exists.");
	return node;
}

export function parentOf(
	root: LayoutRoot,
	id: string,
): LayoutRoot | Extract<LayoutElement, { kind: "container" }> | null {
	for (const node of flatten(root)) {
		if ("children" in node && node.children.some((child) => child.id === id)) return node;
	}
	return null;
}

function layerLabel(node: LayoutNode): string {
	return node.kind === "root"
		? "Rendering area"
		: displayName(node.kind === "value" ? node.binding : node.kind);
}

/** Templates contain deterministic placeholder ids; only freshly instantiated trees become drafts. */
export function instantiateDefinition(
	root: LayoutRoot,
	id = (): string => crypto.randomUUID(),
): LayoutDefinition {
	const copy = structuredClone(root);
	for (const node of flatten(copy)) node.id = id();
	return {
		root: copy,
		editor: {
			layers: flatten(copy).map((node) => ({ nodeId: node.id, label: layerLabel(node), locked: false })),
		},
	};
}

export function newDraft(kind: "blank" | "starter"): Draft {
	const definition = instantiateDefinition(kind === "blank" ? blank() : starter());
	return {
		key: crypto.randomUUID(),
		saved: null,
		name: "Untitled layout",
		definition,
		selectedId: definition.root.id,
	};
}

export function openDraft(saved: SavedLayout): Draft {
	return {
		key: crypto.randomUUID(),
		saved: structuredClone(saved),
		name: saved.name,
		definition: structuredClone(saved.definition),
		selectedId: saved.definition.root.id,
	};
}

export function duplicateDraft(saved: SavedLayout): Draft {
	const definition = instantiateDefinition(saved.definition.root);
	definition.editor.layers.forEach((layer, index) => {
		layer.label = saved.definition.editor.layers[index].label;
		layer.locked = saved.definition.editor.layers[index].locked;
	});
	return {
		key: crypto.randomUUID(),
		saved: null,
		name: `${Array.from(saved.name).slice(0, 123).join("")} copy`,
		definition,
		selectedId: definition.root.id,
	};
}

export function isDirty(draft: Draft): boolean {
	return (
		!draft.saved ||
		draft.name !== draft.saved.name ||
		JSON.stringify(draft.definition) !== JSON.stringify(draft.saved.definition)
	);
}

export function appearance(root: LayoutRoot): string {
	function visible(node: LayoutNode): object {
		const properties: Partial<LayoutNode> = { ...node };
		delete properties.id;
		if ("children" in node)
			return { ...properties, children: node.children.filter((child) => !child.hidden).map(visible) };
		return properties;
	}
	return JSON.stringify(visible(root));
}

export function hasUnappliedAppearance(saved: SavedLayout, published: PublishedLayoutSelection): boolean {
	return published.kind === "classic" || appearance(saved.definition.root) !== appearance(published.root);
}

export function assertName(name: string): string {
	const normalized = name.trim();
	if (!normalized || Array.from(normalized).length > 128)
		throw new Error("Use a non-empty name of at most 128 characters.");
	return normalized;
}

function number(value: number, min: number, max: number, name: string): void {
	if (!Number.isFinite(value) || value < min || value > max)
		throw new Error(`${name} must be between ${min} and ${max}.`);
}

/** UI preflight, not a substitute for authoritative Rust validation on every durable write. */
export function validateDraft(definition: LayoutDefinition): void {
	const nodes = flatten(definition.root);
	if (nodes.length > 256)
		throw new Error("A layout can contain at most 256 nodes, including the rendering area.");
	const ids = new Set<string>();
	const bindings = new Set<LayoutBinding>();
	function visit(node: LayoutNode, depth: number, parentMode: LayoutMode): void {
		if (depth > 16) throw new Error("The tree can be at most 16 levels deep, including the rendering area.");
		if (ids.has(node.id)) throw new Error("Element ids must be unique.");
		ids.add(node.id);
		if (node.kind === "root") {
			if (
				!Number.isInteger(node.width) ||
				!Number.isInteger(node.height) ||
				node.width < 1 ||
				node.height < 1 ||
				!((node.width <= 3840 && node.height <= 2160) || (node.width <= 2160 && node.height <= 3840))
			) {
				throw new Error("Output dimensions must be positive integers within 3840 × 2160 or 2160 × 3840.");
			}
		} else {
			number(node.frame.x, -16384, 16384, "X");
			number(node.frame.y, -16384, 16384, "Y");
			if (parentMode !== "free" && (node.frame.x !== 0 || node.frame.y !== 0))
				throw new Error("Flow children must use zero stored coordinates.");
			for (const axis of ["width", "height"] as const) {
				const size = node.frame[axis];
				if (size.kind === "fixed") number(size.pixels, 1, 8192, displayName(axis));
				else if (parentMode === "free") throw new Error("Free children require fixed dimensions.");
			}
		}
		if (node.kind === "value") {
			if (bindings.has(node.binding))
				throw new Error(`${displayName(node.binding)} is already present, possibly in a hidden layer.`);
			bindings.add(node.binding);
			if (node.animation !== "none" && node.binding !== "home-score" && node.binding !== "away-score")
				throw new Error("Only scores support Rolling.");
		}
		if (node.kind === "text" && (Array.from(node.text).length > 2048 || node.text.includes("\r")))
			throw new Error("Static text permits at most 2048 characters; use LF line breaks.");
		if ("textStyle" in node) {
			number(node.textStyle.fontSize, 1, 512, "Font size");
			const { family, weight } = node.textStyle.font;
			if (!(family === "anton" ? weight === 400 : [400, 500, 600, 700, 800, 900].includes(weight)))
				throw new Error("Choose a bundled font weight.");
		}
		if ("box" in node) {
			number(node.box.borderWidth, 0, 256, "Border width");
			number(node.box.radius, 0, 4096, "Radius");
		}
		for (const color of [
			...(node.kind === "root" ? [node.background] : []),
			...("box" in node ? [node.box.background, node.box.borderColor] : []),
			...("textStyle" in node ? [node.textStyle.color] : []),
			...(node.kind === "separator" ? [node.color] : []),
		]) {
			number(color.alpha, 0, 1, "Alpha");
			if (color.kind === "literal" && !/^#[0-9a-f]{6}$/i.test(color.hex))
				throw new Error("Use a colour in #RRGGBB format.");
		}
		if (node.kind === "container") {
			number(node.gap, 0, 4096, "Gap");
			for (const padding of Object.values(node.padding)) number(padding, 0, 4096, "Padding");
		}
		if ("children" in node)
			node.children.forEach((child) => visit(child, depth + 1, node.kind === "root" ? "free" : node.mode));
	}
	visit(definition.root, 1, "free");
	if (definition.editor.layers.length !== nodes.length) throw new Error("Each element needs layer metadata.");
	definition.editor.layers.forEach((layer, index) => {
		if (layer.nodeId !== nodes[index].id || layer.label !== assertName(layer.label))
			throw new Error("Layer metadata must match tree order and use trimmed labels.");
		if (index === 0 && layer.locked) throw new Error("The rendering area cannot be locked.");
	});
	if (new TextEncoder().encode(JSON.stringify(definition)).length > 1024 * 1024)
		throw new Error("A definition cannot exceed 1 MiB.");
}

function synchronize(definition: LayoutDefinition): void {
	const layers = new Map(definition.editor.layers.map((layer) => [layer.nodeId, layer]));
	definition.editor.layers = flatten(definition.root).map(
		(node) => layers.get(node.id) ?? { nodeId: node.id, label: layerLabel(node), locked: false },
	);
}

export function isLocked(definition: LayoutDefinition, id: string): boolean {
	const parent = parentOf(definition.root, id);
	return (
		Boolean(definition.editor.layers.find((layer) => layer.nodeId === id)?.locked) ||
		(parent !== null && isLocked(definition, parent.id))
	);
}

function editable(definition: LayoutDefinition, id: string): LayoutNode {
	if (isLocked(definition, id)) throw new Error("Unlock this layer and its ancestors before editing.");
	return findNode(definition.root, id);
}

export type DraftAction =
	| { type: "select"; id: string }
	| { type: "name"; name: string }
	| { type: "update"; id: string; update: (node: LayoutNode) => void }
	| { type: "label"; id: string; label: string }
	| { type: "lock"; id: string; locked: boolean }
	| { type: "hide"; id: string; hidden: boolean }
	| { type: "sizing"; id: string; axis: "width" | "height"; kind: "fixed" | "fill" }
	| { type: "add"; kind: AddKind }
	| { type: "remove"; id: string }
	| { type: "reorder"; id: string; delta: -1 | 1 }
	| { type: "place"; id: string; index: number }
	| { type: "reparent"; id: string; parentId: string }
	| { type: "mode"; id: string; mode: LayoutMode };

function projection(root: LayoutRoot): ResolvedLayoutScene {
	const visible = structuredClone(root);
	for (const node of flatten(visible)) if (node.kind !== "root") node.hidden = false;
	return resolveLayout(visible);
}

function createElement(kind: AddKind): LayoutElement {
	let node: LayoutElement;
	switch (kind) {
		case "container":
			node = container(0);
			break;
		case "rectangle":
			node = rectangle(0, 100, 24);
			node.box.background = { kind: "literal", hex: "#FFFFFF", alpha: 1 };
			break;
		case "separator":
			node = {
				kind,
				id: "",
				hidden: false,
				frame: frame(100, 2),
				orientation: "horizontal",
				color: { kind: "literal", hex: "#FFFFFF", alpha: 1 },
			};
			break;
		case "text":
			node = {
				kind,
				id: "",
				hidden: false,
				frame: frame(160, 32),
				box: box(),
				text: "Label",
				textStyle: textStyle({ fontSize: 24 }),
			};
			break;
		default: {
			const score = kind === "home-score" || kind === "away-score";
			const teamName = kind === "home-name" || kind === "away-name";
			node = value(0, kind, {
				frame:
					kind === "timer"
						? frame(120, 48)
						: score
							? frame(80, 48)
							: teamName
								? frame(200, 32)
								: frame(kind === "period-prefix" ? 100 : 40, 24),
				textStyle: textStyle({
					font: { family: kind === "timer" || score ? "anton" : "poppins", weight: teamName ? 600 : 400 },
					fontSize: kind === "timer" ? 36 : score ? 40 : teamName ? 18 : 14,
				}),
			});
		}
	}
	node.id = crypto.randomUUID();
	return node;
}

export function draftReducer(current: Draft, action: DraftAction): Draft {
	if (action.type === "select") {
		findNode(current.definition.root, action.id);
		return { ...current, selectedId: action.id };
	}
	if (action.type === "name") return { ...current, name: assertName(action.name) };
	const next = { ...current, definition: structuredClone(current.definition) };
	const { definition } = next;
	const root = definition.root;
	if (action.type === "add") {
		const selected = findNode(root, current.selectedId);
		const parent = "children" in selected ? selected : parentOf(root, selected.id);
		if (!parent) throw new Error("Select a container to add an element.");
		editable(definition, parent.id);
		const node = createElement(action.kind);
		parent.children.push(node);
		next.selectedId = node.id;
	} else if (action.type === "lock") {
		if (action.id === root.id) throw new Error("The rendering area cannot be locked.");
		const parent = parentOf(root, action.id);
		if (parent && isLocked(definition, parent.id)) throw new Error("Unlock the ancestor first.");
		const layer = definition.editor.layers.find((layer) => layer.nodeId === action.id);
		if (!layer) throw new Error("Layer metadata is missing.");
		layer.locked = action.locked;
	} else {
		const node = editable(definition, action.id);
		if (action.type === "update") action.update(node);
		if (action.type === "sizing") {
			if (node.kind === "root") throw new Error("The rendering area always uses fixed dimensions.");
			if (action.kind === "fill") node.frame[action.axis] = { kind: "fill" };
			else {
				const resolved =
					resolveLayout(root).nodes.find((item) => item.id === node.id) ??
					projection(root).nodes.find((item) => item.id === node.id);
				if (!resolved) throw new Error("Could not resolve the fixed size.");
				node.frame[action.axis] = { kind: "fixed", pixels: resolved.bounds[action.axis] };
			}
		}
		if (action.type === "label") {
			const layer = definition.editor.layers.find((layer) => layer.nodeId === action.id);
			if (!layer) throw new Error("Layer metadata is missing.");
			layer.label = assertName(action.label);
		}
		if (action.type === "hide") {
			if (node.kind === "root") throw new Error("The rendering area cannot be hidden.");
			node.hidden = action.hidden;
		}
		if (
			action.type === "remove" ||
			action.type === "reorder" ||
			action.type === "place" ||
			action.type === "reparent"
		) {
			const parent = parentOf(root, node.id);
			if (!parent || node.kind === "root") throw new Error("The rendering area cannot be moved or removed.");
			editable(definition, parent.id);
			const index = parent.children.findIndex((child) => child.id === node.id);
			if (action.type === "remove") {
				parent.children.splice(index, 1);
				next.selectedId = parent.id;
			} else if (action.type === "reorder" || action.type === "place") {
				const target = action.type === "place" ? action.index : index + action.delta;
				if (action.type === "reorder" && (target < 0 || target >= parent.children.length)) return current;
				if (!Number.isInteger(target) || target < 0 || target >= parent.children.length)
					throw new Error("Choose an insertion position within this container.");
				if (target === index) return current;
				parent.children.splice(index, 1);
				parent.children.splice(target, 0, node);
			} else {
				const target = editable(definition, action.parentId);
				if (!("children" in target)) throw new Error("Move elements into the rendering area or a container.");
				if (flatten(node).some((child) => child.id === target.id))
					throw new Error("A container cannot be moved inside its own subtree.");
				if (target === parent) return current;
				const visibleScene = resolveLayout(root);
				const all = projection(root);
				const bounds = (
					visibleScene.nodes.find((item) => item.id === node.id) ??
					all.nodes.find((item) => item.id === node.id)
				)?.bounds;
				const content = (
					visibleScene.nodes.find((item) => item.id === target.id) ??
					all.nodes.find((item) => item.id === target.id)
				)?.contentBounds;
				if (!bounds || !content) throw new Error("Could not resolve the element geometry.");
				node.frame = frame(
					bounds.width,
					bounds.height,
					target.kind === "root" || target.mode === "free" ? bounds.x - content.x : 0,
					target.kind === "root" || target.mode === "free" ? bounds.y - content.y : 0,
				);
				parent.children.splice(index, 1);
				target.children.push(node);
			}
		}
		if (action.type === "mode") {
			if (node.kind !== "container") throw new Error("Only containers have a layout mode.");
			if (node.mode !== action.mode && (node.mode === "free" || action.mode === "free")) {
				const visibleScene = resolveLayout(root);
				const all = projection(root);
				const parent =
					visibleScene.nodes.find((item) => item.id === node.id) ??
					all.nodes.find((item) => item.id === node.id);
				if (!parent) throw new Error("Could not resolve the container geometry.");
				for (const child of node.children) {
					if (isLocked(definition, child.id))
						throw new Error("Unlock all direct children before converting their geometry.");
					const resolved =
						visibleScene.nodes.find((item) => item.id === child.id) ??
						all.nodes.find((item) => item.id === child.id);
					if (!resolved) throw new Error("Could not resolve child geometry.");
					child.frame = frame(
						resolved.bounds.width,
						resolved.bounds.height,
						action.mode === "free" ? resolved.bounds.x - parent.contentBounds.x : 0,
						action.mode === "free" ? resolved.bounds.y - parent.contentBounds.y : 0,
					);
				}
			}
			node.mode = action.mode;
		}
	}
	synchronize(definition);
	validateDraft(definition);
	return next;
}
