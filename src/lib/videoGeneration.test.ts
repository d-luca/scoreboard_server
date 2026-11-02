import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStarted } from "../bindings/GenerationStarted";
import type { Snapshot } from "../bindings/Snapshot";
import { blank } from "./layouts/templates";
import { calculateVideoDimensions, VIDEO_FRAME_BUDGET_BYTES } from "./videoDimensions";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./layouts/fonts", () => ({ loadLayoutFonts: vi.fn(async () => undefined) }));
vi.mock("./layouts/renderLayoutToCanvas", () => ({ renderLayoutToCanvas: vi.fn() }));
vi.mock("./renderScoreboardToCanvas", () => ({ renderScoreboardToCanvas: vi.fn() }));

const { runRenderLoop } = await import("./videoGeneration");

function snapshot(t: number): Snapshot {
	return {
		t,
		hs: t,
		as: 0,
		tm: 900 - t,
		hf: 1,
		hn: "HOME",
		an: "AWAY",
		hc: "#00ff00",
		ac: "#ff0000",
		hp: "P",
	};
}

function started(width: number, height: number, totalFrames: number): GenerationStarted {
	const geometry = calculateVideoDimensions({ kind: "custom", width, height }, 1)!;
	return {
		totalFrames,
		layout: {
			kind: "custom",
			sourceId: "layout",
			sourceRevision: 1,
			sourceName: "Board",
			root: blank([], width, height),
		},
		scale: 1,
		contentWidth: geometry.contentWidth,
		contentHeight: geometry.contentHeight,
		width: geometry.width,
		height: geometry.height,
		batchFrames: geometry.batchFrames,
	};
}

type Push = { buffer: ArrayBufferLike; byteLength: number; start: number; count: number };

type Backend = { pushes: Push[]; calls: string[]; maxInFlight: () => number };

function installBackend(onPush?: (push: Push) => void): Backend {
	const pushes: Push[] = [];
	const calls: string[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	invoke.mockImplementation(async (command: string, args: unknown) => {
		calls.push(command);
		if (command === "video_frames") {
			const { start, count } = args as { start: number; count: number };
			return Array.from({ length: count }, (_, index) => snapshot(start + index));
		}
		if (command === "video_push_frames") {
			const payload = args as Uint8Array;
			const header = new DataView(payload.buffer, payload.byteOffset, 8);
			const push = {
				buffer: payload.buffer,
				byteLength: payload.byteLength,
				start: header.getUint32(0, true),
				count: header.getUint32(4, true),
			};
			pushes.push(push);
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight--;
			onPush?.(push);
			return null;
		}
		throw new Error(`unexpected command ${command}`);
	});
	return { pushes, calls, maxInFlight: () => maxInFlight };
}

beforeEach(() => {
	vi.stubGlobal("document", {
		createElement: () => ({
			width: 0,
			height: 0,
			getContext: () => ({
				getImageData: (_x: number, _y: number, width: number, height: number) => ({
					data: new Uint8ClampedArray(width * height * 4),
				}),
			}),
		}),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	invoke.mockReset();
});

describe("runRenderLoop bounded batches", () => {
	it.each([
		[1920, 1080, 10, [4, 4, 2]],
		[3840, 2160, 3, [1, 1, 1]],
		[2160, 3840, 2, [1, 1]],
	] as const)("%dx%d reuses one batch buffer with one awaited push", async (width, height, total, counts) => {
		const backend = installBackend();
		const job = started(width, height, total);
		await runRenderLoop(job, () => false);

		const frameBytes = width * height * 4;
		expect(backend.pushes.map(({ count }) => count)).toEqual(counts);
		expect(backend.pushes.map(({ start }) => start)).toEqual(
			counts.map((_, index) => counts.slice(0, index).reduce((sum, count) => sum + count, 0)),
		);
		expect(backend.pushes.map(({ byteLength }) => byteLength)).toEqual(
			counts.map((count) => 8 + count * frameBytes),
		);
		const [first] = backend.pushes;
		expect(backend.pushes.every(({ buffer }) => buffer === first.buffer)).toBe(true);
		expect(first.buffer.byteLength).toBe(8 + job.batchFrames * frameBytes);
		expect(first.buffer.byteLength - 8).toBeLessThanOrEqual(VIDEO_FRAME_BUDGET_BYTES);
		expect(backend.maxInFlight()).toBe(1);
		// Each batch is fetched only after the previous push has completed.
		expect(backend.calls).toEqual(counts.flatMap(() => ["video_frames", "video_push_frames"]));
	});

	it("stops requesting frames once cancelled", async () => {
		let cancelled = false;
		const backend = installBackend(() => {
			cancelled = true;
		});
		await runRenderLoop(started(1920, 1080, 10), () => cancelled);
		expect(backend.calls).toEqual(["video_frames", "video_push_frames"]);
	});

	it("rejects a short snapshot batch before pushing", async () => {
		invoke.mockResolvedValueOnce([snapshot(0)]);
		await expect(runRenderLoop(started(1920, 1080, 10), () => false)).rejects.toThrow("expected 4");
		expect(invoke).toHaveBeenCalledTimes(1);
	});
});
