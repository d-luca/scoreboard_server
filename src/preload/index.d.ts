import { ElectronAPI } from "@electron-toolkit/preload";
import { ScoreboardData } from "../types/scoreboard";

interface ScoreboardAPI {
	getScoreboardData: () => Promise<ScoreboardData>;
	updateScoreboardData: (data: Partial<ScoreboardData>) => Promise<ScoreboardData>;
	onHotkeyUpdate: (callback: (hotkeys: string) => void) => () => void;
	notifyHotkeyUpdate: (hotkeys: string) => void;
	notifyHotkeyEnabledChange: (enabled: boolean) => void;
	getHotkeyEnabled: () => Promise<boolean>;
	onHotkeyEnabledUpdate: (callback: (enabled: boolean) => void) => () => void;
	onRequestHotkeyEnabledState: (callback: () => void) => () => void;
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
