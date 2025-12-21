import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

import {
	ScoreboardData,
	ScoreboardSnapshot,
	ScoreboardRecording,
	VideoGenerationConfig,
	GenerationProgress,
} from "../types/scoreboard";

// Custom APIs for renderer
const api = {
	// Scoreboard API
	getScoreboardData: () => ipcRenderer.invoke("get-scoreboard-data"),
	updateScoreboardData: (data: Partial<ScoreboardData>) => ipcRenderer.invoke("update-scoreboard-data", data),

	// Recording API
	startRecording: (config: { homeName: string; awayName: string }) =>
		ipcRenderer.invoke("recording:start", config),
	writeSnapshot: (snapshot: ScoreboardSnapshot) => ipcRenderer.invoke("recording:write-snapshot", snapshot),
	stopRecording: () => ipcRenderer.invoke("recording:stop"),
	getRecordingStatus: () => ipcRenderer.invoke("recording:get-status"),

	// Settings API
	getRecordingOutputDir: () => ipcRenderer.invoke("settings:get-recording-output-dir"),
	setRecordingOutputDir: (path: string) => ipcRenderer.invoke("settings:set-recording-output-dir", path),
	selectRecordingOutputDir: () => ipcRenderer.invoke("settings:select-recording-output-dir"),

	// Hotkey synchronization
	onHotkeyUpdate: (callback: (hotkeys: string) => void) => {
		const subscription = (_event: Electron.IpcRendererEvent, hotkeys: string): void => callback(hotkeys);
		ipcRenderer.on("hotkey-update", subscription);
		return () => ipcRenderer.removeListener("hotkey-update", subscription);
	},
	notifyHotkeyUpdate: (hotkeys: string) => ipcRenderer.send("hotkey-changed", hotkeys),
	notifyHotkeyEnabledChange: (enabled: boolean) => ipcRenderer.send("hotkey-enabled-changed", enabled),
	getHotkeyEnabled: () => ipcRenderer.invoke("get-hotkey-enabled"),
	onRequestHotkeys: (callback: () => void) => {
		const subscription = (): void => callback();
		ipcRenderer.on("request-hotkeys", subscription);
		return () => ipcRenderer.removeListener("request-hotkeys", subscription);
	},
	onHotkeyEnabledUpdate: (callback: (enabled: boolean) => void) => {
		const subscription = (_event: Electron.IpcRendererEvent, enabled: boolean): void => callback(enabled);
		ipcRenderer.on("hotkey-enabled-update", subscription);
		return () => ipcRenderer.removeListener("hotkey-enabled-update", subscription);
	},
	onRequestHotkeyEnabledState: (callback: () => void) => {
		const subscription = (): void => callback();
		ipcRenderer.on("request-hotkey-enabled-state", subscription);
		return () => ipcRenderer.removeListener("request-hotkey-enabled-state", subscription);
	},
	// Overlay mode
	toggleOverlayMode: (hotkeyEnabled: boolean) => ipcRenderer.send("toggle-overlay-mode", hotkeyEnabled),
	enableOverlayMode: (hotkeyEnabled: boolean) => ipcRenderer.send("enable-overlay-mode", hotkeyEnabled),
	disableOverlayMode: () => ipcRenderer.send("disable-overlay-mode"),
	onGlobalHotkeyAction: (callback: (action: string) => void) => {
		const subscription = (_event: Electron.IpcRendererEvent, action: string): void => callback(action);
		ipcRenderer.on("global-hotkey-action", subscription);
		return () => ipcRenderer.removeListener("global-hotkey-action", subscription);
	},
	onScoreboardDataUpdate: (callback: (data: Partial<ScoreboardData>) => void) => {
		const subscription = (_event: Electron.IpcRendererEvent, data: Partial<ScoreboardData>): void =>
			callback(data);
		ipcRenderer.on("scoreboard-data-update", subscription);
		return () => ipcRenderer.removeListener("scoreboard-data-update", subscription);
	},
	onOverlayWindowsClosed: (callback: () => void) => {
		const subscription = (): void => callback();
		ipcRenderer.on("overlay-windows-closed", subscription);
		return () => ipcRenderer.removeListener("overlay-windows-closed", subscription);
	},
	onOverlayWindowsOpened: (callback: () => void) => {
		const subscription = (): void => callback();
		ipcRenderer.on("overlay-windows-opened", subscription);
		return () => ipcRenderer.removeListener("overlay-windows-opened", subscription);
	},
	onResetOverlayState: (callback: () => void) => {
		const subscription = (): void => callback();
		ipcRenderer.on("reset-overlay-state", subscription);
		return () => ipcRenderer.removeListener("reset-overlay-state", subscription);
	},

	// Video Generator API
	openVideoGenerator: () => ipcRenderer.send("video-generator:open-window"),
	selectRecordingFile: (): Promise<{ canceled: boolean; filePath?: string }> =>
		ipcRenderer.invoke("video-generator:select-file"),
	loadRecording: (
		filePath: string,
	): Promise<{ success: boolean; data?: ScoreboardRecording; error?: string }> =>
		ipcRenderer.invoke("video-generator:load-recording", filePath),
	selectOutputFile: (): Promise<{ canceled: boolean; filePath?: string }> =>
		ipcRenderer.invoke("video-generator:select-output"),
	generateVideo: (
		config: VideoGenerationConfig,
	): Promise<{ success: boolean; outputPath?: string; error?: string }> =>
		ipcRenderer.invoke("video-generator:generate", config),
	cancelGeneration: (): Promise<void> => ipcRenderer.invoke("video-generator:cancel"),
	onGenerationProgress: (callback: (progress: GenerationProgress) => void) => {
		const subscription = (_event: Electron.IpcRendererEvent, progress: GenerationProgress): void =>
			callback(progress);
		ipcRenderer.on("video-generator:progress", subscription);
		return () => ipcRenderer.removeListener("video-generator:progress", subscription);
	},
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld("electron", electronAPI);
		contextBridge.exposeInMainWorld("api", api);
	} catch (error) {
		console.error(error);
	}
} else {
	// @ts-ignore (define in dts)
	window.electron = electronAPI;
	// @ts-ignore (define in dts)
	window.api = api;
}
