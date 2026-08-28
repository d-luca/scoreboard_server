import { invoke } from "@tauri-apps/api/core";
import type { GenerationStarted } from "../bindings/GenerationStarted";
import type { Snapshot } from "../bindings/Snapshot";
import { renderScoreboardToCanvas } from "./renderScoreboardToCanvas";

/**
 * Frames per IPC batch (doc 06 §B4): 30 frames ≈ 5.6 MB at scale 1 — one
 * batch in flight (each push awaits the write into ffmpeg's stdin, which is
 * the backpressure), so memory stays flat regardless of recording length.
 */
const BATCH_SIZE = 30;

/**
 * The render loop (doc 06 §B1/B4): pull a batch of snapshots, re-draw each
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
	const { width, height, totalFrames } = started;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("failed to create a 2D canvas context");
	}

	// Fonts must be loaded before the first draw or the first frames come
	// out in a fallback font (doc 06 §B1.1).
	const fontScale = height / 80;
	await Promise.all([
		document.fonts.load(`${Math.round(36 * fontScale)}px Anton`),
		document.fonts.load(`700 ${Math.round(14 * fontScale)}px Poppins`),
	]);
	await document.fonts.ready;

	const frameBytes = width * height * 4;
	for (let start = 0; start < totalFrames; start += BATCH_SIZE) {
		if (isCancelled()) {
			return;
		}
		const snapshots = await invoke<Snapshot[]>("video_frames", { start, count: BATCH_SIZE });
		if (snapshots.length === 0) {
			return;
		}
		const buffer = new ArrayBuffer(8 + snapshots.length * frameBytes);
		const header = new DataView(buffer);
		header.setUint32(0, start, true);
		header.setUint32(4, snapshots.length, true);
		const body = new Uint8Array(buffer, 8);
		for (const [i, snapshot] of snapshots.entries()) {
			renderScoreboardToCanvas(ctx, snapshot);
			const image = ctx.getImageData(0, 0, width, height);
			body.set(new Uint8Array(image.data.buffer), i * frameBytes);
		}
		await invoke("video_push_frames", new Uint8Array(buffer));
	}
}
