import { create } from "zustand";
import { useScoreboardStore } from "./scoreboardStore";
import { ScoreboardSnapshot } from "../../../types/scoreboard";

interface RecordingState {
	isRecording: boolean;
	recordingId: string | null;
	filePath: string | null;
	snapshotCount: number;
	duration: number;
	outputDir: string;

	// Actions
	startRecording: () => Promise<void>;
	stopRecording: () => Promise<void>;
	updateStatus: () => Promise<void>;
	setOutputDir: (dir: string) => void;
	selectOutputDir: () => Promise<void>;
}

let recordingInterval: ReturnType<typeof setInterval> | null = null;

export const useRecordingStore = create<RecordingState>((set, get) => ({
	isRecording: false,
	recordingId: null,
	filePath: null,
	snapshotCount: 0,
	duration: 0,
	outputDir: "",

	startRecording: async () => {
		const state = get();
		if (state.isRecording) {
			console.warn("Recording already in progress");
			return;
		}

		// Get current team names
		const scoreboardState = useScoreboardStore.getState();
		const homeName = scoreboardState.teamHomeName || "HOME";
		const awayName = scoreboardState.teamAwayName || "AWAY";

		try {
			const result = await window.api.startRecording({ homeName, awayName });

			if (result.success) {
				set({
					isRecording: true,
					recordingId: result.recordingId,
					filePath: result.filePath,
					snapshotCount: 0,
					duration: 0,
				});

				// Start recording interval - capture snapshot every 1 second
				let relativeTime = 0;
				recordingInterval = setInterval(async () => {
					const currentState = useScoreboardStore.getState();

					const snapshot: ScoreboardSnapshot = {
						timestamp: Date.now(),
						relativeTime: relativeTime++,
						teamHomeName: currentState.teamHomeName || "HOME",
						teamAwayName: currentState.teamAwayName || "AWAY",
						teamHomeColor: currentState.teamHomeColor || "#00ff00",
						teamAwayColor: currentState.teamAwayColor || "#ff0000",
						teamHomeScore: currentState.teamHomeScore || 0,
						teamAwayScore: currentState.teamAwayScore || 0,
						timer: currentState.timer || 0,
						half: currentState.half || 1,
						halfPrefix: currentState.halfPrefix || "PERIODO",
					};

					const writeResult = await window.api.writeSnapshot(snapshot);

					if (writeResult.success) {
						// Update status
						await get().updateStatus();
					} else {
						console.error("Failed to write snapshot:", writeResult.error);
					}
				}, 1000);

				console.log("Recording started:", result.filePath);
			} else {
				console.error("Failed to start recording:", result.error);
				throw new Error(result.error || "Failed to start recording");
			}
		} catch (error) {
			console.error("Error starting recording:", error);
			throw error;
		}
	},

	stopRecording: async () => {
		const state = get();
		if (!state.isRecording) {
			console.warn("No recording in progress");
			return;
		}

		// Clear interval
		if (recordingInterval) {
			clearInterval(recordingInterval);
			recordingInterval = null;
		}

		try {
			const result = await window.api.stopRecording();

			if (result.success) {
				set({
					isRecording: false,
					recordingId: null,
					filePath: null,
					snapshotCount: 0,
					duration: 0,
				});

				console.log(`Recording stopped: ${result.filePath} (${result.totalSnapshots} snapshots)`);
			} else {
				console.error("Failed to stop recording:", result.error);
				throw new Error(result.error || "Failed to stop recording");
			}
		} catch (error) {
			console.error("Error stopping recording:", error);
			// Force cleanup even on error
			if (recordingInterval) {
				clearInterval(recordingInterval);
				recordingInterval = null;
			}
			set({
				isRecording: false,
				recordingId: null,
			});
			throw error;
		}
	},

	updateStatus: async () => {
		try {
			const status = await window.api.getRecordingStatus();
			set({
				isRecording: status.isRecording,
				filePath: status.filePath || null,
				snapshotCount: status.snapshotCount,
				duration: status.duration,
			});
		} catch (error) {
			console.error("Failed to update recording status:", error);
		}
	},

	setOutputDir: (dir: string) => {
		set({ outputDir: dir });
	},

	selectOutputDir: async () => {
		try {
			const result = await window.api.selectRecordingOutputDir();
			if (!result.canceled && result.path) {
				const setResult = await window.api.setRecordingOutputDir(result.path);
				if (setResult.success) {
					set({ outputDir: result.path });
				} else {
					console.error("Failed to set output directory:", setResult.error);
					throw new Error(setResult.error);
				}
			}
		} catch (error) {
			console.error("Error selecting output directory:", error);
			throw error;
		}
	},
}));

// Load initial output directory
window.api.getRecordingOutputDir().then((dir) => {
	useRecordingStore.setState({ outputDir: dir });
});
