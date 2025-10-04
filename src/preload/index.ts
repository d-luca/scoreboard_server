import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

import { ScoreboardData } from "../types/scoreboard";

// Custom APIs for renderer
const api = {
	// Scoreboard API
	getScoreboardData: () => ipcRenderer.invoke("get-scoreboard-data"),
	updateScoreboardData: (data: Partial<ScoreboardData>) => ipcRenderer.invoke("update-scoreboard-data", data),
	// Hotkey synchronization
	onHotkeyUpdate: (callback: (hotkeys: string) => void) => {
		const subscription = (_event: Electron.IpcRendererEvent, hotkeys: string): void => callback(hotkeys);
		ipcRenderer.on("hotkey-update", subscription);
		return () => ipcRenderer.removeListener("hotkey-update", subscription);
	},
	notifyHotkeyUpdate: (hotkeys: string) => ipcRenderer.send("hotkey-changed", hotkeys),
	// Overlay mode
	toggleOverlayMode: () => ipcRenderer.send("toggle-overlay-mode"),
	enableOverlayMode: () => ipcRenderer.send("enable-overlay-mode"),
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
