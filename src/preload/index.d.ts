import { ElectronAPI } from "@electron-toolkit/preload";
import { ScoreboardData, ScoreboardSnapshot, RecordingStatus } from "../types/scoreboard";

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
}

declare global {
	interface Window {
		electron: ElectronAPI;
		api: ScoreboardAPI;
	}
}
