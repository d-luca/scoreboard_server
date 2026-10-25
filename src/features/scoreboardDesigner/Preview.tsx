import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from "react";
import { ScoreboardLayout } from "../../components/ScoreboardLayout/ScoreboardLayout";
import { Scoreboard } from "../../components/Scoreboard/Scoreboard";
import type { LayoutRenderInputs } from "../../lib/layouts/bindings";
import type { LayoutDiagnostic } from "../../bindings/LayoutDiagnostic";
import { loadLayoutFonts } from "../../lib/layouts/fonts";
import { resolveLayout, type ResolvedLayoutScene } from "../../lib/layouts/resolveLayout";
import { createLayoutFrame } from "../../lib/layouts/renderFrame";
import { layoutErrorMessage } from "../../lib/stores/layoutsStore";
import { findNode, isLocked, parentOf, type Draft, type DraftAction } from "./draft";
import {
	fitViewport,
	flowInsertion,
	hitTest,
	layoutPoint,
	resizeHandles,
	transformFrame,
	zoomAt,
	type Guide,
	type Point,
	type ResizeHandle,
	type Viewport,
} from "./workspace";

export type WorkspaceEditing = {
	begin(id: string): Draft;
	change(action: DraftAction): void;
	end(cancel: boolean): void;
	error(error: unknown): void;
};

type Gesture =
	| { kind: "pan"; pointer: number; start: Point; viewport: Viewport }
	| {
			kind: "edit";
			pointer: number;
			start: Point;
			viewport: Viewport;
			draft: Draft;
			scene: ResolvedLayoutScene;
			id: string;
			handle: ResizeHandle | null;
			flow: boolean;
	  };

function ReadyPreview({
	scene,
	inputs,
	diagnostics,
}: {
	scene: ResolvedLayoutScene;
	inputs: LayoutRenderInputs;
	diagnostics(value: readonly LayoutDiagnostic[]): void;
}): JSX.Element {
	const frame = useMemo(() => createLayoutFrame(scene, inputs), [scene, inputs]);
	useEffect(() => diagnostics(frame.diagnostics), [frame, diagnostics]);
	return <ScoreboardLayout frame={frame} />;
}

function CustomPreview({
	scene,
	inputs,
	diagnostics,
}: {
	scene: ResolvedLayoutScene;
	inputs: LayoutRenderInputs;
	diagnostics(value: readonly LayoutDiagnostic[]): void;
}): JSX.Element {
	const signature = [
		...new Set(
			scene.nodes.flatMap(({ source }) =>
				"textStyle" in source ? [`${source.textStyle.font.family}/${source.textStyle.font.weight}`] : [],
			),
		),
	]
		.sort()
		.join(",");
	const [ready, setReady] = useState<{ signature: string; error: string | null } | null>(null);
	useEffect(() => {
		let active = true;
		void loadLayoutFonts(scene).then(
			() => {
				if (active) setReady({ signature, error: null });
			},
			(error: unknown) => {
				if (active) setReady({ signature, error: layoutErrorMessage(error) });
			},
		);
		return () => {
			active = false;
		};
	}, [scene, signature]);
	if (ready?.signature !== signature) return <p>Loading bundled fonts...</p>;
	if (ready.error) return <p role="alert">{ready.error}</p>;
	return <ReadyPreview scene={scene} inputs={inputs} diagnostics={diagnostics} />;
}

export function Preview({
	draft,
	inputs,
	disabled,
	editing,
}: {
	draft: Draft | null;
	inputs: LayoutRenderInputs;
	disabled: boolean;
	editing: WorkspaceEditing;
}): JSX.Element {
	const root = draft?.definition.root ?? null;
	const scene = useMemo(() => (root ? resolveLayout(root) : null), [root]);
	const [element, setElement] = useState<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ x: 600, y: 400 });
	const [manual, setManual] = useState<Viewport>({ zoom: 1, x: 0, y: 0 });
	const [fit, setFit] = useState(true);
	const [grid, setGrid] = useState(false);
	const [snap, setSnap] = useState(true);
	const [pan, setPan] = useState(false);
	const [overlay, setOverlay] = useState<{ key: string | undefined; disabled: boolean; guides: Guide[] }>({
		key: draft?.key,
		disabled,
		guides: [],
	});
	if (overlay.key !== draft?.key || overlay.disabled !== disabled)
		setOverlay({ key: draft?.key, disabled, guides: [] });
	const guides = overlay.guides;
	const setGuides = useCallback(
		(guides: Guide[]): void => setOverlay({ key: draft?.key, disabled, guides }),
		[draft?.key, disabled],
	);
	const [diagnostics, setDiagnostics] = useState<readonly LayoutDiagnostic[]>([]);
	const active = useRef<Gesture | null>(null);
	const space = useRef(false);
	const pattern = useId();
	const width = root?.width ?? 622;
	const height = root?.height ?? 80;
	const viewport = fit ? fitViewport(width, height, size) : manual;
	const viewportRef = useRef(viewport);
	useEffect(() => {
		viewportRef.current = viewport;
	}, [viewport]);
	useEffect(() => {
		if (!element) return;
		const observer = new ResizeObserver(([entry]) =>
			setSize({ x: entry.contentRect.width, y: entry.contentRect.height }),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [element]);
	useEffect(() => {
		if (!element || disabled) return;
		const wheel = (event: WheelEvent): void => {
			if (active.current) return;
			event.preventDefault();
			const previous = viewportRef.current;
			const bounds = element.getBoundingClientRect();
			const next =
				event.ctrlKey || event.metaKey
					? zoomAt(
							previous,
							{ x: event.clientX - bounds.x, y: event.clientY - bounds.y },
							Math.max(0.01, Math.min(4, previous.zoom * Math.exp(-event.deltaY * 0.002))),
						)
					: { ...previous, x: previous.x - event.deltaX, y: previous.y - event.deltaY };
			viewportRef.current = next;
			setManual(next);
			setFit(false);
		};
		element.addEventListener("wheel", wheel, { passive: false });
		return () => element.removeEventListener("wheel", wheel);
	}, [element, disabled]);
	useEffect(() => {
		active.current = null;
	}, [disabled, draft?.key]);
	const finishGesture = editing.end;
	useEffect(() => {
		const key = (event: KeyboardEvent): void => {
			if (
				event.target instanceof HTMLElement &&
				event.target.closest("input, textarea, select, [contenteditable]")
			)
				return;
			if (event.code === "Space") {
				space.current = event.type === "keydown";
				if (event.target === element) event.preventDefault();
			}
		};
		const blur = (): void => {
			space.current = false;
			if (active.current?.kind === "edit") finishGesture(true);
			active.current = null;
			setGuides([]);
		};
		window.addEventListener("keydown", key);
		window.addEventListener("keyup", key);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("keydown", key);
			window.removeEventListener("keyup", key);
			window.removeEventListener("blur", blur);
		};
	}, [element, finishGesture, setGuides]);
	const selected = scene?.nodes.find((node) => node.id === draft?.selectedId);
	const parent = draft && selected ? parentOf(draft.definition.root, selected.id) : null;
	const resize =
		selected &&
		draft &&
		selected.source.kind !== "root" &&
		!isLocked(draft.definition, selected.id) &&
		(parent?.kind === "root" || parent?.mode === "free");
	const end = (cancel: boolean): void => {
		const gesture = active.current;
		if (!gesture) return;
		active.current = null;
		if (gesture.kind === "edit") editing.end(cancel);
		else if (cancel) setManual(gesture.viewport);
		setGuides([]);
		if (element?.hasPointerCapture(gesture.pointer)) element.releasePointerCapture(gesture.pointer);
	};
	return (
		<section className="designer-workspace" aria-label="Draft preview">
			<fieldset className="designer-viewport-tools" disabled={disabled}>
				<span>
					{width} × {height} logical pixels
				</span>
				<label>
					Zoom{" "}
					<select
						aria-label="Zoom"
						value={String(viewport.zoom)}
						onChange={(event) => {
							const zoom = Number(event.target.value);
							setManual(zoomAt(viewport, { x: size.x / 2, y: size.y / 2 }, zoom));
							setFit(false);
						}}
					>
						{[...new Set([viewport.zoom, 0.1, 0.25, 0.5, 1, 2, 4])]
							.sort((a, b) => a - b)
							.map((zoom) => (
								<option key={zoom} value={String(zoom)}>
									{Math.round(zoom * 100)}%
								</option>
							))}
					</select>
				</label>
				<button type="button" aria-pressed={fit} onClick={() => setFit(true)}>
					Fit
				</button>
				<button type="button" aria-pressed={pan} onClick={() => setPan(!pan)}>
					Pan
				</button>
				<label>
					<input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} /> Grid
					(8px)
				</label>
				<label>
					<input type="checkbox" checked={snap} onChange={(event) => setSnap(event.target.checked)} /> Snap
				</label>
			</fieldset>
			<div
				className="designer-stage"
				ref={setElement}
				tabIndex={0}
				aria-label="Layout workspace"
				style={{ cursor: pan ? "grab" : undefined }}
				onKeyDown={(event) => {
					if (
						active.current &&
						(event.key === "Escape" ||
							((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())))
					) {
						event.preventDefault();
						event.stopPropagation();
						end(true);
					} else if (active.current && (event.key === "Delete" || event.key.startsWith("Arrow"))) {
						event.preventDefault();
						event.stopPropagation();
					}
				}}
				onPointerDown={(event) => {
					if (
						disabled ||
						active.current ||
						!element ||
						!event.isPrimary ||
						(event.button !== 0 && event.button !== 1)
					)
						return;
					event.preventDefault();
					element.focus({ preventScroll: true });
					const start = { x: event.clientX, y: event.clientY };
					if (event.button === 1 || space.current || pan) {
						active.current = { kind: "pan", start, pointer: event.pointerId, viewport };
					} else if (draft && scene) {
						try {
							const bounds = element.getBoundingClientRect();
							const point = layoutPoint(start, bounds, viewport);
							const target = event.target;
							const handle =
								target instanceof Element
									? (resizeHandles.find((item) => item === target.getAttribute("data-resize")) ?? null)
									: null;
							const id = handle ? draft.selectedId : hitTest(draft, scene, point);
							const before = editing.begin(id);
							const selected = findNode(before.definition.root, id);
							const parent = parentOf(before.definition.root, id);
							if (selected.kind === "root" || isLocked(before.definition, id)) {
								editing.end(false);
								return;
							}
							active.current = {
								kind: "edit",
								start,
								pointer: event.pointerId,
								viewport,
								draft: before,
								scene: resolveLayout(before.definition.root),
								id,
								handle,
								flow: parent?.kind === "container" && parent.mode !== "free",
							};
						} catch (error) {
							editing.error(error);
							return;
						}
					} else return;
					setManual(viewport);
					setFit(false);
					element.setPointerCapture(event.pointerId);
				}}
				onPointerMove={(event) => {
					const gesture = active.current;
					if (!gesture || disabled || gesture.pointer !== event.pointerId || !element) return;
					const dx = event.clientX - gesture.start.x;
					const dy = event.clientY - gesture.start.y;
					if (gesture.kind === "pan") {
						setManual({ ...gesture.viewport, x: gesture.viewport.x + dx, y: gesture.viewport.y + dy });
						return;
					}
					if (Math.hypot(dx, dy) < 3) return;
					try {
						if (gesture.flow) {
							const insertion = flowInsertion(
								gesture.draft,
								gesture.scene,
								gesture.id,
								layoutPoint(
									{ x: event.clientX, y: event.clientY },
									element.getBoundingClientRect(),
									gesture.viewport,
								),
							);
							editing.change({ type: "place", id: gesture.id, index: insertion.index });
							setGuides([insertion.guide]);
						} else {
							const transformed = transformFrame({
								...gesture,
								delta: { x: dx / gesture.viewport.zoom, y: dy / gesture.viewport.zoom },
								zoom: gesture.viewport.zoom,
								snap: snap && !event.altKey,
								grid,
							});
							editing.change({
								type: "update",
								id: gesture.id,
								update: (node) => {
									if (node.kind !== "root") node.frame = transformed.frame;
								},
							});
							setGuides(transformed.guides);
						}
					} catch (error) {
						editing.error(error);
					}
				}}
				onPointerUp={(event) => {
					if (event.pointerId === active.current?.pointer) end(false);
				}}
				onPointerCancel={(event) => {
					if (event.pointerId === active.current?.pointer) end(true);
				}}
				onLostPointerCapture={() => end(true)}
			>
				<div
					className="designer-scene"
					style={{
						width,
						height,
						left: viewport.x,
						top: viewport.y,
						transform: `scale(${viewport.zoom})`,
						transformOrigin: "top left",
					}}
				>
					{scene ? (
						<CustomPreview scene={scene} inputs={inputs} diagnostics={setDiagnostics} />
					) : (
						<div style={{ width: 600, height: 80, marginLeft: 11 }}>
							<Scoreboard
								teamHomeName={inputs.homeName}
								teamAwayName={inputs.awayName}
								teamHomeScore={inputs.homeScore}
								teamAwayScore={inputs.awayScore}
								teamHomeColor={inputs.homeColor}
								teamAwayColor={inputs.awayColor}
								timer={inputs.timerSeconds}
								half={inputs.periodNumber}
								halfPrefix={inputs.periodPrefix}
								scoreAnimation={false}
							/>
						</div>
					)}
					<svg className="designer-overlay" width={width} height={height} aria-hidden="true">
						{grid && (
							<>
								<defs>
									<pattern id={pattern} width="8" height="8" patternUnits="userSpaceOnUse">
										<path
											d="M 8 0 L 0 0 0 8"
											fill="none"
											stroke="#94a3b8"
											strokeWidth={0.5 / viewport.zoom}
										/>
									</pattern>
								</defs>
								<rect width={width} height={height} fill={`url(#${pattern})`} opacity="0.55" />
							</>
						)}
						{selected && (
							<rect {...selected.bounds} fill="none" stroke="#60a5fa" strokeWidth={1.5 / viewport.zoom} />
						)}
						{selected &&
							resize &&
							resizeHandles.map((handle) => {
								const { x, y, width, height } = selected.bounds;
								const size = 8 / viewport.zoom;
								return (
									<rect
										key={handle}
										data-resize={handle}
										data-node-id={selected.id}
										x={
											(handle.includes("w") ? x : handle.includes("e") ? x + width : x + width / 2) - size / 2
										}
										y={
											(handle.includes("n") ? y : handle.includes("s") ? y + height : y + height / 2) -
											size / 2
										}
										width={size}
										height={size}
										fill="white"
										stroke="#2563eb"
										strokeWidth={1 / viewport.zoom}
										style={{ pointerEvents: disabled ? "none" : "all", cursor: `${handle}-resize` }}
									/>
								);
							})}
						{guides.map((guide) => (
							<line
								key={guide.axis}
								data-guide={guide.axis}
								x1={guide.axis === "x" ? guide.position : 0}
								x2={guide.axis === "x" ? guide.position : width}
								y1={guide.axis === "y" ? guide.position : 0}
								y2={guide.axis === "y" ? guide.position : height}
								stroke="#f472b6"
								strokeWidth={1 / viewport.zoom}
							/>
						))}
					</svg>
				</div>
			</div>
			<details className="designer-diagnostics">
				<summary>
					Layout diagnostics ({scene ? diagnostics.length : 0}) · Free: drag/resize · Flow: drag to reorder
				</summary>
				<ul>
					{scene &&
						diagnostics.map((diagnostic, index) => (
							<li key={index}>
								{diagnostic.severity}: {diagnostic.message} ({diagnostic.property})
							</li>
						))}
				</ul>
			</details>
		</section>
	);
}
