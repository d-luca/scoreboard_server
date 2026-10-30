import type { SavedLayoutSelection } from "../bindings/SavedLayoutSelection";
import type { GenerationStarted } from "../bindings/GenerationStarted";
import type { LayoutLibrarySnapshot } from "../bindings/LayoutLibrarySnapshot";

export const VIDEO_FRAME_BUDGET_BYTES = 32 * 1024 * 1024;
export const VIDEO_MAX_BATCH_FRAMES = 30;

export type VideoLayoutDimensions =
	Readonly<{ kind: "classic" }> | Readonly<{ kind: "custom"; width: number; height: number }>;

export type VideoDimensions = Readonly<{
	contentWidth: number;
	contentHeight: number;
	width: number;
	height: number;
	frameBytes: number;
	batchFrames: number;
}>;

function classicEvenRounded(value: number): number {
	const rounded = Math.max(2, Math.round(value));
	return rounded % 2 === 0 ? rounded : rounded + 1;
}

function customEvenCeil(value: number): number {
	return Math.ceil(value / 2) * 2;
}

export function calculateVideoDimensions(
	layout: VideoLayoutDimensions,
	scale: number,
): VideoDimensions | null {
	if (!Number.isFinite(scale) || scale < 0.5 || scale > 3) return null;

	let contentWidth: number;
	let contentHeight: number;
	let width: number;
	let height: number;
	if (layout.kind === "classic") {
		width = classicEvenRounded(622 * scale);
		height = classicEvenRounded(80 * scale);
		contentWidth = width;
		contentHeight = height;
	} else {
		if (
			!Number.isInteger(layout.width) ||
			!Number.isInteger(layout.height) ||
			layout.width < 1 ||
			layout.height < 1
		)
			return null;
		contentWidth = layout.width * scale;
		contentHeight = layout.height * scale;
		width = customEvenCeil(contentWidth);
		height = customEvenCeil(contentHeight);
	}

	if (
		!Number.isSafeInteger(width) ||
		!Number.isSafeInteger(height) ||
		!((width <= 3840 && height <= 2160) || (width <= 2160 && height <= 3840))
	)
		return null;
	const frameBytes = width * height * 4;
	if (!Number.isSafeInteger(frameBytes) || frameBytes <= 0) return null;
	const batchFrames = Math.min(VIDEO_MAX_BATCH_FRAMES, Math.floor(VIDEO_FRAME_BUDGET_BYTES / frameBytes));
	if (batchFrames < 1) return null;
	return { contentWidth, contentHeight, width, height, frameBytes, batchFrames };
}

export function layoutDimensions(
	selection: SavedLayoutSelection,
	root?: Readonly<{ width: number; height: number }>,
): VideoLayoutDimensions | null {
	if (selection.kind === "classic") return { kind: "classic" };
	return root ? { kind: "custom", width: root.width, height: root.height } : null;
}

export function defaultVideoLayoutSelection(library: LayoutLibrarySnapshot | null): SavedLayoutSelection {
	if (!library || library.storageStatus.state !== "ready" || library.published.selection.kind !== "custom")
		return { kind: "classic" };
	const { sourceId, sourceRevision } = library.published.selection;
	return library.entries.some((entry) => entry.id === sourceId && entry.revision === sourceRevision)
		? { kind: "custom", id: sourceId, expectedRevision: sourceRevision }
		: { kind: "classic" };
}

export function validateGenerationStarted(started: GenerationStarted): VideoDimensions {
	if (!Number.isSafeInteger(started.totalFrames) || started.totalFrames < 1)
		throw new Error("The video job returned an invalid frame count.");
	if (
		!Number.isFinite(started.scale) ||
		!Number.isFinite(started.contentWidth) ||
		!Number.isFinite(started.contentHeight) ||
		!Number.isInteger(started.width) ||
		!Number.isInteger(started.height) ||
		!Number.isInteger(started.batchFrames)
	)
		throw new Error("The video job returned invalid dimensions.");

	let layout: VideoLayoutDimensions;
	if (started.layout?.kind === "classic") {
		layout = { kind: "classic" };
	} else if (
		started.layout?.kind === "custom" &&
		Number.isInteger(started.layout.root?.width) &&
		Number.isInteger(started.layout.root?.height)
	) {
		layout = {
			kind: "custom",
			width: started.layout.root.width,
			height: started.layout.root.height,
		};
	} else {
		throw new Error("The video job returned an invalid frozen layout.");
	}
	const expected = calculateVideoDimensions(layout, started.scale);
	if (
		!expected ||
		expected.width !== started.width ||
		expected.height !== started.height ||
		expected.batchFrames !== started.batchFrames ||
		expected.contentWidth !== started.contentWidth ||
		expected.contentHeight !== started.contentHeight
	)
		throw new Error("The video job dimensions do not match the selected layout and scale.");
	return expected;
}
