import { create } from "zustand";
import {
	ScoreboardRecording,
	VideoGenerationConfig,
	GenerationProgress,
	GenerationStep,
} from "../../../types/scoreboard";

interface VideoGeneratorState {
	// File selection
	selectedFilePath: string | null;
	recording: ScoreboardRecording | null;
	loadError: string | null;

	// Video settings
	outputPath: string | null;
	frameRate: number;
	scoreboardScale: number;

	// Generation state
	isGenerating: boolean;
	progress: GenerationProgress | null;

	// Actions
	selectFile: () => Promise<void>;
	loadRecording: (filePath: string) => Promise<void>;
	selectOutputPath: () => Promise<void>;
	setFrameRate: (frameRate: number) => void;
	setScoreboardScale: (scale: number) => void;
	startGeneration: () => Promise<void>;
	cancelGeneration: () => Promise<void>;
	reset: () => void;
}

const initialProgress: GenerationProgress = {
	step: "idle" as GenerationStep,
	stepProgress: 0,
	overallProgress: 0,
	message: "",
};

export const useVideoGeneratorStore = create<VideoGeneratorState>((set, get) => ({
	// Initial state
	selectedFilePath: null,
	recording: null,
	loadError: null,
	outputPath: null,
	frameRate: 30,
	scoreboardScale: 1.0,
	isGenerating: false,
	progress: null,

	// Actions
	selectFile: async () => {
		try {
			const result = await window.api.selectRecordingFile();
			if (!result.canceled && result.filePath) {
				set({ selectedFilePath: result.filePath, loadError: null });
				await get().loadRecording(result.filePath);
			}
		} catch (error) {
			console.error("Error selecting file:", error);
			set({ loadError: error instanceof Error ? error.message : String(error) });
		}
	},

	loadRecording: async (filePath: string) => {
		try {
			set({ loadError: null });
			const result = await window.api.loadRecording(filePath);
			if (result.success && result.data) {
				set({ recording: result.data, selectedFilePath: filePath });
			} else {
				set({ loadError: result.error || "Failed to load recording", recording: null });
			}
		} catch (error) {
			console.error("Error loading recording:", error);
			set({ loadError: error instanceof Error ? error.message : String(error), recording: null });
		}
	},

	selectOutputPath: async () => {
		try {
			const result = await window.api.selectOutputFile();
			if (!result.canceled && result.filePath) {
				set({ outputPath: result.filePath });
			}
		} catch (error) {
			console.error("Error selecting output path:", error);
		}
	},

	setFrameRate: (frameRate: number) => {
		set({ frameRate: Math.max(1, Math.min(60, frameRate)) });
	},

	setScoreboardScale: (scale: number) => {
		set({ scoreboardScale: Math.max(0.5, Math.min(3, scale)) });
	},

	startGeneration: async () => {
		const state = get();

		if (!state.selectedFilePath || !state.outputPath || state.isGenerating) {
			return;
		}

		set({ isGenerating: true, progress: initialProgress });

		// Set up progress listener
		const unsubscribe = window.api.onGenerationProgress((progress) => {
			set({ progress });

			// If complete or error, update isGenerating
			if (progress.step === "complete" || progress.step === "error") {
				set({ isGenerating: false });
			}
		});

		try {
			const config: VideoGenerationConfig = {
				recordingPath: state.selectedFilePath,
				outputPath: state.outputPath,
				frameRate: state.frameRate,
				scoreboardScale: state.scoreboardScale,
			};

			const result = await window.api.generateVideo(config);

			if (!result.success) {
				set({
					isGenerating: false,
					progress: {
						step: "error",
						stepProgress: 0,
						overallProgress: 0,
						message: "Generation failed",
						error: result.error,
					},
				});
			}
		} catch (error) {
			console.error("Error generating video:", error);
			set({
				isGenerating: false,
				progress: {
					step: "error",
					stepProgress: 0,
					overallProgress: 0,
					message: "Generation failed",
					error: error instanceof Error ? error.message : String(error),
				},
			});
		} finally {
			unsubscribe();
		}
	},

	cancelGeneration: async () => {
		try {
			await window.api.cancelGeneration();
			set({ isGenerating: false, progress: null });
		} catch (error) {
			console.error("Error cancelling generation:", error);
		}
	},

	reset: () => {
		set({
			selectedFilePath: null,
			recording: null,
			loadError: null,
			outputPath: null,
			frameRate: 30,
			scoreboardScale: 1.0,
			isGenerating: false,
			progress: null,
		});
	},
}));
