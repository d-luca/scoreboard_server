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
