import type { LayoutAlignment } from "../../bindings/LayoutAlignment";
import type { LayoutDiagnostic } from "../../bindings/LayoutDiagnostic";
import type { LayoutElement } from "../../bindings/LayoutElement";
import type { LayoutRoot } from "../../bindings/LayoutRoot";
import type { LayoutSize } from "../../bindings/LayoutSize";

export type LayoutRect = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

export type ResolvedLayoutNode = Readonly<{
	id: string;
	parentId: string | null;
	paintOrder: number;
	source: LayoutRoot | LayoutElement;
	bounds: LayoutRect;
	contentBounds: LayoutRect;
	borderWidth: number;
	radius: number;
	innerRadius: number;
}>;

export type ResolvedLayoutScene = Readonly<{
	width: number;
	height: number;
	/** The only clip in the scene; container borders never clip descendants. */
	clip: LayoutRect;
	/** Visible nodes in depth-first painting order, including the root. */
	nodes: readonly ResolvedLayoutNode[];
	diagnostics: readonly LayoutDiagnostic[];
}>;

const alignment: Record<LayoutAlignment, number> = { start: 0, center: 0.5, end: 1 };

function fixedSize(size: LayoutSize, nodeId: string): number {
	if (size.kind !== "fixed") {
		throw new Error(`Node ${nodeId}: Fill sizing is not permitted in a Free parent.`);
	}
	return size.pixels;
}

/** Resolve a validated rendering root. Match values and editor metadata are not inputs. */
export function resolveLayout(root: LayoutRoot): ResolvedLayoutScene {
	const nodes: ResolvedLayoutNode[] = [];
	const diagnostics: LayoutDiagnostic[] = [];
	const clip: LayoutRect = { x: 0, y: 0, width: root.width, height: root.height };

	function warn(code: LayoutDiagnostic["code"], nodeId: string, property: string, message: string): void {
		diagnostics.push({ severity: "warning", code, nodeId, property, message });
	}

	function visit(
		source: LayoutRoot | LayoutElement,
		parentId: string | null,
		bounds: LayoutRect,
		path: string,
	): void {
		const box = "box" in source ? source.box : null;
		const borderWidth = Math.min(box?.borderWidth ?? 0, bounds.width / 2, bounds.height / 2);
		const radius = Math.min(box?.radius ?? 0, bounds.width / 2, bounds.height / 2);
		const padding = source.kind === "container" ? source.padding : null;
		const horizontalInset = 2 * borderWidth + (padding?.left ?? 0) + (padding?.right ?? 0);
		const verticalInset = 2 * borderWidth + (padding?.top ?? 0) + (padding?.bottom ?? 0);
		const contentBounds: LayoutRect = {
			x: bounds.x + borderWidth + (padding?.left ?? 0),
			y: bounds.y + borderWidth + (padding?.top ?? 0),
			width: Math.max(0, bounds.width - horizontalInset),
			height: Math.max(0, bounds.height - verticalInset),
		};
		const node: ResolvedLayoutNode = {
			id: source.id,
			parentId,
			paintOrder: nodes.length,
			source,
			bounds,
			contentBounds,
			borderWidth,
			radius,
			innerRadius: Math.max(0, radius - borderWidth),
		};
		nodes.push(node);

		if (
			(horizontalInset > 0 && contentBounds.width === 0) ||
			(verticalInset > 0 && contentBounds.height === 0)
		) {
			warn("empty-content-box", source.id, path, "Border and padding consume at least one content axis.");
		}
		if (
			bounds.x < 0 ||
			bounds.y < 0 ||
			bounds.x + bounds.width > root.width ||
			bounds.y + bounds.height > root.height
		) {
			warn("root-overflow", source.id, `${path}/frame`, "The box extends beyond the root clip.");
		}
		if (source.kind !== "root") {
			for (const axis of ["width", "height"] as const) {
				if (source.frame[axis].kind === "fill" && bounds[axis] === 0) {
					warn("zero-fill", source.id, `${path}/frame/${axis}`, "No space remains for Fill.");
				}
			}
		}
		if (source.kind !== "container" && source.kind !== "root") return;

		// Preserve original indices in diagnostic pointers after filtering hidden children.
		const children = source.children
			.map((child, index) => ({ child, path: `${path}/children/${index}` }))
			.filter(({ child }) => !child.hidden);
		if (source.kind === "root" || source.mode === "free") {
			for (const { child, path: childPath } of children) {
				visit(
					child,
					source.id,
					{
						x: contentBounds.x + child.frame.x,
						y: contentBounds.y + child.frame.y,
						width: fixedSize(child.frame.width, child.id),
						height: fixedSize(child.frame.height, child.id),
					},
					childPath,
				);
			}
			return;
		}

		const row = source.mode === "row";
		const mainAxis = row ? "width" : "height";
		const crossAxis = row ? "height" : "width";
		const totalGap = Math.max(0, children.length - 1) * source.gap;
		let fixedMain = 0;
		let fillCount = 0;
		for (const { child } of children) {
			const size = child.frame[mainAxis];
			if (size.kind === "fill") fillCount++;
			else fixedMain += size.pixels;
		}
		const freeSpace = contentBounds[mainAxis] - fixedMain - totalGap;
		if (freeSpace < 0) {
			warn(
				"negative-free-space",
				source.id,
				`${path}/children`,
				"Fixed sizes and gaps exceed the available main-axis space.",
			);
		}
		const fillSize = fillCount > 0 ? Math.max(0, freeSpace) / fillCount : 0;
		const sizes = children.map(({ child }) => {
			const main = child.frame[mainAxis];
			const cross = child.frame[crossAxis];
			return {
				main: main.kind === "fixed" ? main.pixels : fillSize,
				cross: cross.kind === "fixed" ? cross.pixels : contentBounds[crossAxis],
			};
		});
		const used = sizes.reduce((sum, size) => sum + size.main, totalGap);
		let mainOffset = alignment[source.mainAlign] * (contentBounds[mainAxis] - used);
		children.forEach(({ child, path: childPath }, index) => {
			const { main, cross } = sizes[index];
			const crossOffset = alignment[source.crossAlign] * (contentBounds[crossAxis] - cross);
			visit(
				child,
				source.id,
				{
					x: contentBounds.x + (row ? mainOffset : crossOffset),
					y: contentBounds.y + (row ? crossOffset : mainOffset),
					width: row ? main : cross,
					height: row ? cross : main,
				},
				childPath,
			);
			mainOffset += main + source.gap;
		});
	}

	visit(root, null, clip, "/root");
	return { width: root.width, height: root.height, clip, nodes, diagnostics };
}
