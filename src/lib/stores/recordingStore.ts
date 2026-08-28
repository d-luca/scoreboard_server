import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RecentRecording } from "../../bindings/RecentRecording";
import type { RecordingStatus } from "../../bindings/RecordingStatus";
import type { RecordingStopped } from "../../bindings/RecordingStopped";

/**
 * Mirror of the Rust recorder (doc 06 §A4). Fed by the `recording:status`
 * event (start, stop and every snapshot) and seeded from `recording_status`
 * on first use. The output directory lives in settings; `selectOutputDir`
 * opens the native folder picker and persists the choice.
 */
interface RecordingStore {
	status: RecordingStatus | null;
	outputDir: string | null;
	recents: RecentRecording[];
	refresh(): Promise<void>;
	start(): Promise<void>;
	stop(): Promise<RecordingStopped>;
	selectOutputDir(): Promise<void>;
	refreshRecents(): Promise<void>;
}

let subscribed = false;

export const useRecordingStore = create<RecordingStore>((set, get) => ({
	status: null,
	outputDir: null,
	recents: [],
	refresh: async () => {
		if (!subscribed) {
			subscribed = true;
			void listen<RecordingStatus>("recording:status", ({ payload }) => set({ status: payload }));
		}
		const [status, outputDir] = await Promise.all([
			invoke<RecordingStatus>("recording_status"),
			invoke<string>("recording_get_output_dir"),
		]);
		set({ status, outputDir });
		await get().refreshRecents();
	},
	start: async () => {
		const status = await invoke<RecordingStatus>("recording_start");
		set({ status });
	},
	stop: async () => {
		const stopped = await invoke<RecordingStopped>("recording_stop");
		// The `recording:status` event also lands; set eagerly so the button
		// leaves the busy state on a stopped UI even if the event races.
		set({
			status: {
				isRecording: false,
				recordingId: null,
				filePath: null,
				snapshotCount: 0,
				durationSecs: 0,
			},
		});
		await get().refreshRecents();
		return stopped;
	},
	selectOutputDir: async () => {
		const dir = await invoke<string | null>("recording_select_output_dir");
		if (dir !== null) {
			set({ outputDir: dir });
		}
	},
	refreshRecents: async () => {
		const recents = await invoke<RecentRecording[]>("recording_list_recent");
		set({ recents });
	},
}));
