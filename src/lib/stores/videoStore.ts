import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GenerationProgress } from "../../bindings/GenerationProgress";
import type { GenerationStarted } from "../../bindings/GenerationStarted";
import type { RecordingMetadata } from "../../bindings/RecordingMetadata";
import { runRenderLoop } from "../videoGeneration";

/**
 * Backing store for the video-generator window (doc 06 §B7). Fed by the
 * `video:progress` event (throttled ~10 Hz by Rust) and seeded from
 * `video_progress` on mount, so a window opened mid-generation shows the
 * current state. The recording pre-fill arrives via
 * `video_take_pending_recording` (set by the recording window).
 */
interface VideoStore {
	recordingPath: string | null;
	outputPath: string | null;
	metadata: RecordingMetadata | null;
	loadError: string | null;
	frameRate: number;
	scale: number;
	progress: GenerationProgress;
	/** A run is in flight (between `video_generate` and the terminal event). */
	generating: boolean;
	init(): Promise<void>;
	loadRecording(path: string): Promise<void>;
	browseRecording(): Promise<void>;
	browseOutput(): Promise<void>;
	setFrameRate(frameRate: number): void;
	setScale(scale: number): void;
	generate(): Promise<void>;
	cancel(): Promise<void>;
	reset(): void;
}

const IDLE: GenerationProgress = {
	step: "idle",
	stepProgress: 0,
	overallProgress: 0,
	currentFrame: null,
	totalFrames: null,
	message: "Idle",
	error: null,
};

let subscribed = false;
let cancelRequested = false;

export const useVideoStore = create<VideoStore>((set, get) => ({
	recordingPath: null,
	outputPath: null,
	metadata: null,
	loadError: null,
	frameRate: 30,
	scale: 1,
	progress: IDLE,
	generating: false,

	init: async () => {
		if (!subscribed) {
			subscribed = true;
			void listen<GenerationProgress>("video:progress", ({ payload }) => {
				set({
					progress: payload,
					generating: payload.step !== "complete" && payload.step !== "error" && payload.step !== "idle",
				});
			});
		}
		const progress = await invoke<GenerationProgress>("video_progress");
		set({
			progress,
			generating: progress.step !== "complete" && progress.step !== "error" && progress.step !== "idle",
		});
		// Pre-fill from the recording window (doc 06 §B7), if any.
		const pending = await invoke<string | null>("video_take_pending_recording");
		if (pending !== null && !get().generating) {
			await get().loadRecording(pending);
		}
	},

	loadRecording: async (path) => {
		try {
			const metadata = await invoke<RecordingMetadata>("video_load_recording", { path });
			set({ recordingPath: path, metadata, loadError: null });
			// Suggest a default output next to the recording.
			if (!get().outputPath) {
				set({ outputPath: path.replace(/\.[^.\\/]+$/, ".webm") });
			}
		} catch (error) {
			set({
				recordingPath: path,
				metadata: null,
				loadError: error instanceof Error ? error.message : String(error),
			});
		}
	},

	browseRecording: async () => {
		const path = await invoke<string | null>("video_select_recording");
		if (path !== null) {
			await get().loadRecording(path);
		}
	},

	browseOutput: async () => {
		const stem =
			get()
				.recordingPath?.replace(/^.*[\\/]/, "")
				.replace(/\.[^.]+$/, "") ?? "scoreboard";
		const path = await invoke<string | null>("video_select_output", {
			defaultFileName: `${stem}.webm`,
		});
		if (path !== null) {
			set({ outputPath: path });
		}
	},

	setFrameRate: (frameRate) => set({ frameRate: Math.min(60, Math.max(1, Math.round(frameRate))) }),
	setScale: (scale) => set({ scale }),

	generate: async () => {
		const { recordingPath, outputPath, frameRate, scale, generating } = get();
		if (generating || !recordingPath || !outputPath) {
			return;
		}
		set({ generating: true });
		cancelRequested = false;
		try {
			const started = await invoke<GenerationStarted>("video_generate", {
				config: { recordingPath, outputPath, frameRate, scoreboardScale: scale },
			});
			await runRenderLoop(started, () => cancelRequested);
			// The terminal state (complete/error) arrives as a video:progress
			// event from the ffmpeg watcher and flips `generating` off.
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!cancelRequested && !message.includes("cancelled")) {
				set({
					generating: false,
					progress: {
						...IDLE,
						step: "error",
						message,
						error: message,
					},
				});
			} else {
				set({ generating: false });
			}
		}
	},

	cancel: async () => {
		cancelRequested = true;
		try {
			await invoke("video_cancel");
		} catch {
			// Already finished between the click and the call — harmless.
		}
	},

	reset: () => {
		if (get().generating) {
			return;
		}
		set({
			recordingPath: null,
			outputPath: null,
			metadata: null,
			loadError: null,
			progress: IDLE,
		});
	},
}));
