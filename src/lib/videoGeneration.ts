import { invoke } from "@tauri-apps/api/core";
import type { GenerationStarted } from "../bindings/GenerationStarted";
import type { Snapshot } from "../bindings/Snapshot";
import { inputsFromSnapshot } from "./layouts/bindings";
import { loadLayoutFonts } from "./layouts/fonts";
import { createLayoutFrame } from "./layouts/renderFrame";
import { renderLayoutToCanvas } from "./layouts/renderLayoutToCanvas";
import { resolveLayout } from "./layouts/resolveLayout";
import { validateGenerationStarted } from "./videoDimensions";
import { renderScoreboardToCanvas } from "./renderScoreboardToCanvas";

/**
 * The render loop: pull a batch of snapshots, re-draw each
 * on a detached canvas, push the raw RGBA frames to Rust in one raw IPC
 * body — `[u32 LE start][u32 LE frame_count][frames…]`. Passing the
 * `Uint8Array` as the *sole* invoke argument makes Tauri transfer it as
 * `application/octet-stream`; nested in an args object it would be expanded
 * into a JSON number array.
 *
 * Resolves when the last batch has been pushed; the terminal
 * (`complete`/`error`) state arrives as a `video:progress` event. Throws
 * when the backend rejects a batch (cancelled, out-of-order, encoder dead).
 */
export async function runRenderLoop(started: GenerationStarted, isCancelled: () => boolean): Promise<void> {
	const geometry = validateGenerationStarted(started);
	const { width, height } = geometry;
	const scene = started.layout.kind === "custom" ? resolveLayout(started.layout.root) : null;
	if (scene) {
		await loadLayoutFonts(scene);
	} else {
		const fontScale = height / 80;
		await Promise.all([
			document.fonts.load(`${Math.round(36 * fontScale)}px Anton`),
			document.fonts.load(`700 ${Math.round(14 * fontScale)}px Poppins`),
		]);
		await document.fonts.ready;
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("failed to create a 2D canvas context");
	}

	const batchBuffer = new Uint8Array(8 + geometry.batchFrames * geometry.frameBytes);
	const header = new DataView(batchBuffer.buffer);
	for (let start = 0; start < started.totalFrames; start += geometry.batchFrames) {
		if (isCancelled()) {
			return;
		}
		const count = Math.min(geometry.batchFrames, started.totalFrames - start);
		const snapshots = await invoke<Snapshot[]>("video_frames", { start, count });
		if (snapshots.length !== count) {
			throw new Error(`The video job returned ${snapshots.length} snapshots; expected ${count}.`);
		}
		header.setUint32(0, start, true);
		header.setUint32(4, snapshots.length, true);
		const body = batchBuffer.subarray(8, 8 + snapshots.length * geometry.frameBytes);
		for (const [i, snapshot] of snapshots.entries()) {
			if (scene) {
				renderLayoutToCanvas(ctx, createLayoutFrame(scene, inputsFromSnapshot(snapshot)), started.scale);
			} else {
				renderScoreboardToCanvas(ctx, snapshot);
			}
			const image = ctx.getImageData(0, 0, width, height);
			body.set(
				new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
				i * geometry.frameBytes,
			);
		}
		await invoke("video_push_frames", batchBuffer.subarray(0, body.byteLength + 8));
	}
}
