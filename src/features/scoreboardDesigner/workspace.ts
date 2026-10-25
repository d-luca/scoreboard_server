import type { LayoutFrame } from "../../bindings/LayoutFrame";
import type { ResolvedLayoutScene } from "../../lib/layouts/resolveLayout";
import { findNode, isLocked, parentOf, type Draft } from "./draft";

export type Point = { x: number; y: number };
export type Viewport = { zoom: number; x: number; y: number };
export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export const resizeHandles: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export type Guide = { axis: "x" | "y"; position: number };
type Target = { position: number; order: number };

export function fitViewport(width: number, height: number, viewport: Point): Viewport {
	const zoom = Math.max(0.01, Math.min((viewport.x - 64) / width, (viewport.y - 64) / height, 1));
	return { zoom, x: (viewport.x - width * zoom) / 2, y: (viewport.y - height * zoom) / 2 };
}

export function layoutPoint(point: Point, origin: Point, viewport: Viewport): Point {
	return {
		x: (point.x - origin.x - viewport.x) / viewport.zoom,
		y: (point.y - origin.y - viewport.y) / viewport.zoom,
	};
}

export function zoomAt(viewport: Viewport, point: Point, zoom: number): Viewport {
	return {
		zoom,
		x: point.x - ((point.x - viewport.x) * zoom) / viewport.zoom,
		y: point.y - ((point.y - viewport.y) * zoom) / viewport.zoom,
	};
}

export function hitTest(draft: Draft, scene: ResolvedLayoutScene, point: Point): string {
	return (
		[...scene.nodes]
			.reverse()
			.find(
				({ id, bounds }) =>
					!isLocked(draft.definition, id) &&
					point.x >= bounds.x &&
					point.x <= bounds.x + bounds.width &&
					point.y >= bounds.y &&
					point.y <= bounds.y + bounds.height,
			)?.id ?? draft.definition.root.id
	);
}

function targets(scene: ResolvedLayoutScene, id: string, axis: "x" | "y"): Target[] {
	const moving = scene.nodes.find((node) => node.id === id);
	if (!moving) throw new Error("The selected element is not visible.");
	const length = axis === "x" ? "width" : "height";
	return scene.nodes.flatMap((node) => {
		if (node.id === id || (node.id !== moving.parentId && node.parentId !== moving.parentId)) return [];
		const bounds = node.id === moving.parentId ? node.contentBounds : node.bounds;
		return [bounds[axis], bounds[axis] + bounds[length] / 2, bounds[axis] + bounds[length]].map(
			(position) => ({ position, order: node.paintOrder }),
		);
	});
}

export function snapAxis(
	probes: readonly number[],
	candidates: readonly Target[],
	zoom: number,
	grid: boolean,
): { delta: number; guide: number | null } {
	let best: { delta: number; position: number; grid: boolean; order: number } | null = null;
	for (const probe of probes) {
		for (const candidate of [
			...candidates.map((target) => ({ ...target, grid: false })),
			...(grid ? [{ position: Math.round(probe / 8) * 8, grid: true, order: 0 }] : []),
		]) {
			const delta = candidate.position - probe;
			if (Math.abs(delta) > 6 / zoom) continue;
			if (
				!best ||
				Math.abs(delta) < Math.abs(best.delta) ||
				(Math.abs(delta) === Math.abs(best.delta) &&
					(Number(candidate.grid) < Number(best.grid) ||
						(candidate.grid === best.grid && candidate.order < best.order)))
			) {
				best = { ...candidate, delta };
			}
		}
	}
	return best ? { delta: best.delta, guide: best.position } : { delta: 0, guide: null };
}

export function transformFrame({
	draft,
	scene,
	id,
	delta,
	handle,
	zoom,
	snap,
	grid,
}: {
	draft: Draft;
	scene: ResolvedLayoutScene;
	id: string;
	delta: Point;
	handle: ResizeHandle | null;
	zoom: number;
	snap: boolean;
	grid: boolean;
}): { frame: LayoutFrame; guides: Guide[] } {
	const node = findNode(draft.definition.root, id);
	const parent = parentOf(draft.definition.root, id);
	const resolved = scene.nodes.find((item) => item.id === id);
	if (node.kind === "root" || !parent || !resolved || isLocked(draft.definition, id))
		throw new Error("Select an unlocked visible child to manipulate.");
	if (parent.kind === "container" && parent.mode !== "free")
		throw new Error("Flow children are reordered, not freely moved or resized.");
	const bounds = resolved.bounds;
	const result = { ...bounds };
	const guides: Guide[] = [];
	for (const axis of ["x", "y"] as const) {
		const size = axis === "x" ? "width" : "height";
		const start = axis === "x" ? "w" : "n";
		const end = axis === "x" ? "e" : "s";
		if (!handle) {
			result[axis] += delta[axis];
			if (snap) {
				const snapped = snapAxis(
					[result[axis], result[axis] + result[size] / 2, result[axis] + result[size]],
					targets(scene, id, axis),
					zoom,
					grid,
				);
				result[axis] += snapped.delta;
				if (snapped.guide !== null) guides.push({ axis, position: snapped.guide });
			}
		} else if (handle.includes(start) || handle.includes(end)) {
			const leading = handle.includes(start);
			let edge = leading
				? Math.min(bounds[axis] + delta[axis], bounds[axis] + bounds[size] - 1)
				: Math.max(bounds[axis] + bounds[size] + delta[axis], bounds[axis] + 1);
			if (snap) {
				const snapped = snapAxis([edge], targets(scene, id, axis), zoom, grid);
				const candidate = edge + snapped.delta;
				if (
					(leading && candidate <= bounds[axis] + bounds[size] - 1) ||
					(!leading && candidate >= bounds[axis] + 1)
				) {
					edge = candidate;
					if (snapped.guide !== null) guides.push({ axis, position: snapped.guide });
				}
			}
			result[axis] = leading ? edge : bounds[axis];
			result[size] = leading ? bounds[axis] + bounds[size] - edge : edge - bounds[axis];
		}
	}
	return {
		frame: {
			x: node.frame.x + result.x - bounds.x,
			y: node.frame.y + result.y - bounds.y,
			width: { kind: "fixed", pixels: result.width },
			height: { kind: "fixed", pixels: result.height },
		},
		guides,
	};
}

export function flowInsertion(
	draft: Draft,
	scene: ResolvedLayoutScene,
	id: string,
	point: Point,
): { index: number; guide: Guide } {
	const parent = parentOf(draft.definition.root, id);
	if (!parent || parent.kind !== "container" || parent.mode === "free")
		throw new Error("Select a Row or Column child to reorder.");
	const axis = parent.mode === "row" ? "x" : "y";
	const size = axis === "x" ? "width" : "height";
	const remaining = parent.children.filter((child) => child.id !== id);
	const visible = remaining.flatMap((child) => {
		const resolved = scene.nodes.find((node) => node.id === child.id);
		return resolved ? [{ child, bounds: resolved.bounds }] : [];
	});
	const next = visible.find(({ bounds }) => point[axis] < bounds[axis] + bounds[size] / 2);
	const parentBounds = scene.nodes.find((node) => node.id === parent.id)?.contentBounds;
	if (!parentBounds) throw new Error("The flow container is not visible.");
	const last = visible[visible.length - 1];
	return {
		index: next ? remaining.findIndex((child) => child.id === next.child.id) : remaining.length,
		guide: {
			axis,
			position: next?.bounds[axis] ?? (last ? last.bounds[axis] + last.bounds[size] : parentBounds[axis]),
		},
	};
}
