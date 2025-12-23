import { create } from "zustand";

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

		// Get current team names from scoreboard
		// Import dynamically to avoid circular dependency
		const { useScoreboardStore } = await import("./scoreboardStore");
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

				// Snapshots are now captured by the main process - no renderer interval needed
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

// Subscribe to recording status changes from main process
window.api.onRecordingStatusChange((status) => {
	useRecordingStore.setState({
		isRecording: status.isRecording,
		filePath: status.filePath || null,
		snapshotCount: status.snapshotCount,
		duration: status.duration,
	});
});
