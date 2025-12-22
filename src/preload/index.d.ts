import { ElectronAPI } from "@electron-toolkit/preload";
import {
	ScoreboardData,
	ScoreboardSnapshot,
	ScoreboardRecording,
	RecordingStatus,
	VideoGenerationConfig,
	GenerationProgress,
} from "../types/scoreboard";

interface ScoreboardAPI {
	// Scoreboard
	getScoreboardData: () => Promise<ScoreboardData>;
	updateScoreboardData: (data: Partial<ScoreboardData>) => Promise<ScoreboardData>;

	// Recording
	startRecording: (config: { homeName: string; awayName: string }) => Promise<{
		success: boolean;
		filePath: string;
		recordingId: string;
		error?: string;
	}>;
	writeSnapshot: (snapshot: ScoreboardSnapshot) => Promise<{ success: boolean; error?: string }>;
	stopRecording: () => Promise<{
		success: boolean;
		filePath: string;
		totalSnapshots: number;
		error?: string;
	}>;
	getRecordingStatus: () => Promise<RecordingStatus>;

	// Settings
	getRecordingOutputDir: () => Promise<string>;
	setRecordingOutputDir: (path: string) => Promise<{ success: boolean; error?: string }>;
	selectRecordingOutputDir: () => Promise<{ canceled: boolean; path?: string }>;

	// Recording status updates
	onRecordingStatusChange: (
		callback: (status: {
			isRecording: boolean;
			filePath?: string;
			snapshotCount: number;
			duration: number;
		}) => void,
	) => () => void;

	// Hotkeys
	onHotkeyUpdate: (callback: (hotkeys: string) => void) => () => void;
	notifyHotkeyUpdate: (hotkeys: string) => void;
	notifyHotkeyEnabledChange: (enabled: boolean) => void;
	getHotkeyEnabled: () => Promise<boolean>;
	onHotkeyEnabledUpdate: (callback: (enabled: boolean) => void) => () => void;
	onRequestHotkeyEnabledState: (callback: () => void) => () => void;
	onRequestHotkeys: (callback: () => void) => () => void;

	// Overlay
	toggleOverlayMode: (hotkeyEnabled: boolean) => void;
	enableOverlayMode: (hotkeyEnabled: boolean) => void;
	disableOverlayMode: () => void;
	onGlobalHotkeyAction: (callback: (action: string) => void) => () => void;
	onScoreboardDataUpdate: (callback: (data: Partial<ScoreboardData>) => void) => () => void;
	onOverlayWindowsClosed: (callback: () => void) => () => void;
	onOverlayWindowsOpened: (callback: () => void) => () => void;
	onResetOverlayState: (callback: () => void) => () => void;

	// Video Generator
	openVideoGenerator: () => void;
	selectRecordingFile: () => Promise<{ canceled: boolean; filePath?: string }>;
	loadRecording: (filePath: string) => Promise<{
		success: boolean;
		data?: ScoreboardRecording;
		error?: string;
	}>;
	selectOutputFile: () => Promise<{ canceled: boolean; filePath?: string }>;
	generateVideo: (config: VideoGenerationConfig) => Promise<{
		success: boolean;
		outputPath?: string;
		error?: string;
	}>;
	cancelGeneration: () => Promise<void>;
	onGenerationProgress: (callback: (progress: GenerationProgress) => void) => () => void;
}

declare global {
	interface Window {
		electron: ElectronAPI;
		api: ScoreboardAPI;
	}
}
