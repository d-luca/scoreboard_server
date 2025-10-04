import { app, shell, BrowserWindow, ipcMain, Menu, globalShortcut, screen } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { ScoreboardServer } from "./server";
import { ScoreboardData } from "../types/scoreboard";

// Global server instance
let scoreboardServer: ScoreboardServer;
let mainWindow: BrowserWindow | null = null;
let hotkeySettingsWindow: BrowserWindow | null = null;
let overlayPreviewWindow: BrowserWindow | null = null;
let overlayControlWindow: BrowserWindow | null = null;

// Map to convert hotkey format to Electron accelerator format
function convertToAccelerator(key: string, ctrlKey?: boolean, altKey?: boolean, shiftKey?: boolean): string {
	const modifiers: string[] = [];
	if (ctrlKey) modifiers.push("CommandOrControl");
	if (altKey) modifiers.push("Alt");
	if (shiftKey) modifiers.push("Shift");

	// Convert key name to Electron format
	let electronKey = key;
	if (key === " ") electronKey = "Space";
	else if (key === "ArrowUp") electronKey = "Up";
	else if (key === "ArrowDown") electronKey = "Down";
	else if (key === "ArrowLeft") electronKey = "Left";
	else if (key === "ArrowRight") electronKey = "Right";
	else if (key.length === 1) electronKey = key.toUpperCase();

	return modifiers.length > 0 ? `${modifiers.join("+")}+${electronKey}` : electronKey;
}

// Global hotkey action handlers
function executeHotkeyAction(action: string): void {
	if (!scoreboardServer) return;

	const currentData = scoreboardServer.getCurrentData();
	let updatedData: Partial<ScoreboardData> | null = null;

	switch (action) {
		case "increaseHomeScore":
			updatedData = { teamHomeScore: (currentData.teamHomeScore ?? 0) + 1 };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "decreaseHomeScore":
			updatedData = { teamHomeScore: Math.max(0, (currentData.teamHomeScore ?? 0) - 1) };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "increaseAwayScore":
			updatedData = { teamAwayScore: (currentData.teamAwayScore ?? 0) + 1 };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "decreaseAwayScore":
			updatedData = { teamAwayScore: Math.max(0, (currentData.teamAwayScore ?? 0) - 1) };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "increaseHalf":
			updatedData = { half: (currentData.half ?? 1) + 1 };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "decreaseHalf":
			updatedData = { half: Math.max(1, (currentData.half ?? 1) - 1) };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "increaseTimerSecond":
			updatedData = { timer: (currentData.timer ?? 0) + 1 };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "decreaseTimerSecond":
			updatedData = { timer: Math.max(0, (currentData.timer ?? 0) - 1) };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "increaseTimerMinute":
			updatedData = { timer: (currentData.timer ?? 0) + 60 };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "decreaseTimerMinute":
			updatedData = { timer: Math.max(0, (currentData.timer ?? 0) - 60) };
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		case "resetScoreboard":
			updatedData = {
				teamHomeScore: 0,
				teamAwayScore: 0,
				timer: 0,
				half: 1,
			};
			scoreboardServer.updateScoreboardData(updatedData);
			break;
		// Timer control actions are handled via IPC
		default:
			// Send IPC to overlay control window for timer actions
			if (overlayControlWindow) {
				overlayControlWindow.webContents.send("global-hotkey-action", action);
			}
			return; // Don't broadcast for timer control actions
	}

	// Broadcast the update to all renderer windows
	if (updatedData) {
		// Get the full updated data from server and broadcast it
		const fullData = scoreboardServer.getCurrentData();
		BrowserWindow.getAllWindows().forEach((window) => {
			window.webContents.send("scoreboard-data-update", fullData);
		});
	}
}

// Register global hotkeys
function registerGlobalHotkeys(): void {
	try {
		// Get hotkeys from localStorage (we'll use default ones for now)
		const defaultHotkeys: Record<
			string,
			{ key: string; enabled: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }
		> = {
			increaseHomeScore: { key: "q", enabled: true },
			decreaseHomeScore: { key: "a", enabled: true },
			increaseAwayScore: { key: "e", enabled: true },
			decreaseAwayScore: { key: "d", enabled: true },
			increaseHalf: { key: "]", enabled: true },
			decreaseHalf: { key: "[", enabled: true },
			startTimer: { key: " ", enabled: true },
			pauseTimer: { key: "p", enabled: true },
			stopTimer: { key: "s", enabled: true },
			increaseTimerSecond: { key: "ArrowUp", enabled: true },
			decreaseTimerSecond: { key: "ArrowDown", enabled: true },
			increaseTimerMinute: { key: "ArrowUp", shiftKey: true, enabled: true },
			decreaseTimerMinute: { key: "ArrowDown", shiftKey: true, enabled: true },
			timerLoadout1: { key: "1", ctrlKey: true, enabled: true },
			timerLoadout2: { key: "2", ctrlKey: true, enabled: true },
			timerLoadout3: { key: "3", ctrlKey: true, enabled: true },
			resetScoreboard: { key: "r", ctrlKey: true, shiftKey: true, enabled: true },
		};

		Object.entries(defaultHotkeys).forEach(([action, mapping]) => {
			if (!mapping.enabled) return;

			const accelerator = convertToAccelerator(
				mapping.key,
				mapping.ctrlKey,
				mapping.altKey,
				mapping.shiftKey,
			);

			try {
				const registered = globalShortcut.register(accelerator, () => {
					executeHotkeyAction(action);
				});

				if (registered) {
					console.log(`Global hotkey registered: ${action} -> ${accelerator}`);
				} else {
					console.warn(`Failed to register global hotkey: ${action} -> ${accelerator}`);
				}
			} catch (error) {
				console.error(`Error registering hotkey ${action}:`, error);
			}
		});
	} catch (error) {
		console.error("Error in registerGlobalHotkeys:", error);
	}
}

// Unregister all global hotkeys
function unregisterGlobalHotkeys(): void {
	globalShortcut.unregisterAll();
	console.log("All global hotkeys unregistered");
}

function createWindow(): void {
	// Create the browser window.
	mainWindow = new BrowserWindow({
		width: 900,
		height: 670,
		show: false,
		autoHideMenuBar: false,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	mainWindow.on("ready-to-show", () => {
		mainWindow?.show();
	});

	mainWindow.on("closed", () => {
		// Close overlay windows when main window closes
		if (overlayPreviewWindow) {
			overlayPreviewWindow.close();
			overlayPreviewWindow = null;
		}
		if (overlayControlWindow) {
			overlayControlWindow.close();
			overlayControlWindow = null;
		}
		mainWindow = null;
	});

	mainWindow.webContents.on("did-finish-load", () => {
		// Reset overlay state on main window load since windows don't persist across app restarts
		mainWindow?.webContents.send("reset-overlay-state");
	});

	mainWindow.webContents.setWindowOpenHandler((details) => {
		shell.openExternal(details.url);
		return { action: "deny" };
	});

	// Handle media permissions for camera access
	mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
		if (permission === "media") {
			// Allow camera and microphone access
			callback(true);
		} else {
			callback(false);
		}
	});

	// HMR for renderer base on electron-vite cli.
	// Load the remote URL for development or the local html file for production.
	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
	} else {
		mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

function createHotkeySettingsWindow(): void {
	// Don't create multiple instances
	if (hotkeySettingsWindow) {
		hotkeySettingsWindow.focus();
		return;
	}

	hotkeySettingsWindow = new BrowserWindow({
		width: 800,
		height: 700,
		show: false,
		autoHideMenuBar: true,
		parent: mainWindow || undefined,
		modal: false,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	hotkeySettingsWindow.on("ready-to-show", () => {
		hotkeySettingsWindow?.show();
	});

	hotkeySettingsWindow.on("closed", () => {
		hotkeySettingsWindow = null;
	});

	// Load the hotkey settings page
	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		hotkeySettingsWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/hotkeys.html`);
	} else {
		hotkeySettingsWindow.loadFile(join(__dirname, "../renderer/hotkeys.html"));
	}
}

function createOverlayPreviewWindow(): void {
	if (overlayPreviewWindow) {
		overlayPreviewWindow.focus();
		return;
	}

	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.workAreaSize;

	overlayPreviewWindow = new BrowserWindow({
		width: 1200,
		height: 150,
		x: Math.floor((width - 1200) / 2),
		y: 50,
		show: false,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: true,
		skipTaskbar: true,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false, // Allow iframe to load localhost:3001
		},
	});

	overlayPreviewWindow.setIgnoreMouseEvents(false);
	overlayPreviewWindow.setAlwaysOnTop(true, "screen-saver");

	overlayPreviewWindow.on("ready-to-show", () => {
		overlayPreviewWindow?.show();
	});

	overlayPreviewWindow.on("closed", () => {
		overlayPreviewWindow = null;
		// If both overlay windows are closed, notify main window to update state
		if (!overlayControlWindow && mainWindow) {
			mainWindow.webContents.send("overlay-windows-closed");
		}
	});

	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		overlayPreviewWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/overlay-preview.html`);
	} else {
		overlayPreviewWindow.loadFile(join(__dirname, "../renderer/overlay-preview.html"));
	}
}

function createOverlayControlWindow(): void {
	if (overlayControlWindow) {
		overlayControlWindow.focus();
		return;
	}

	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.workAreaSize;

	overlayControlWindow = new BrowserWindow({
		width: 400,
		height: 600,
		x: width - 420,
		y: height - 620,
		show: false,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: true,
		skipTaskbar: true,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	overlayControlWindow.setAlwaysOnTop(true, "floating");

	overlayControlWindow.on("ready-to-show", () => {
		overlayControlWindow?.show();
	});

	overlayControlWindow.on("closed", () => {
		overlayControlWindow = null;
		// If both overlay windows are closed, notify main window to update state
		if (!overlayPreviewWindow && mainWindow) {
			mainWindow.webContents.send("overlay-windows-closed");
		}
	});

	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		overlayControlWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/overlay-control.html`);
	} else {
		overlayControlWindow.loadFile(join(__dirname, "../renderer/overlay-control.html"));
	}
}

function closeOverlayWindows(): void {
	if (overlayPreviewWindow) {
		overlayPreviewWindow.close();
		overlayPreviewWindow = null;
	}
	if (overlayControlWindow) {
		overlayControlWindow.close();
		overlayControlWindow = null;
	}
}

function createMenu(): void {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [
				{
					role: "quit",
				},
			],
		},
		{
			label: "Settings",
			submenu: [
				{
					label: "Keyboard Shortcuts",
					accelerator: "CmdOrCtrl+K",
					click: () => {
						createHotkeySettingsWindow();
					},
				},
			],
		},
		{
			label: "Overlay",
			submenu: [
				{
					label: "Toggle Overlay Mode",
					accelerator: "CmdOrCtrl+Shift+O",
					click: () => {
						if (overlayPreviewWindow || overlayControlWindow) {
							// Closing overlay mode
							unregisterGlobalHotkeys();
							closeOverlayWindows();
							// Notify main window to update state
							if (mainWindow) {
								mainWindow.webContents.send("overlay-windows-closed");
							}
						} else {
							// Opening overlay mode
							registerGlobalHotkeys();
							createOverlayPreviewWindow();
							createOverlayControlWindow();
							// Notify main window to update state
							if (mainWindow) {
								mainWindow.webContents.send("overlay-windows-opened");
							}
						}
					},
				},
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
	];

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
	// Set app user model id for windows
	electronApp.setAppUserModelId("com.electron");

	// Default open or close DevTools by F12 in development
	// and ignore CommandOrControl + R in production.
	// see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
	app.on("browser-window-created", (_, window) => {
		optimizer.watchWindowShortcuts(window);
	});

	// Initialize scoreboard server
	scoreboardServer = new ScoreboardServer(3001);
	scoreboardServer
		.start()
		.then(() => {
			console.log("Scoreboard server started successfully");
		})
		.catch((error) => {
			console.error("Failed to start scoreboard server:", error);
		});

	// IPC handlers for scoreboard data
	ipcMain.handle("get-scoreboard-data", () => {
		return scoreboardServer.getCurrentData();
	});

	ipcMain.handle("update-scoreboard-data", (_event, data: Partial<ScoreboardData>) => {
		scoreboardServer.updateScoreboardData(data);
		return scoreboardServer.getCurrentData();
	});

	// IPC test
	ipcMain.on("ping", () => console.log("pong"));

	// IPC handler to open hotkey settings window
	ipcMain.on("open-hotkey-settings", () => {
		createHotkeySettingsWindow();
	});

	// IPC handler for hotkey synchronization
	ipcMain.on("hotkey-changed", (_event, hotkeys: string) => {
		// Broadcast to all windows
		BrowserWindow.getAllWindows().forEach((window) => {
			window.webContents.send("hotkey-update", hotkeys);
		});
	});

	// IPC handlers for overlay mode
	ipcMain.on("toggle-overlay-mode", () => {
		if (overlayPreviewWindow || overlayControlWindow) {
			unregisterGlobalHotkeys();
			closeOverlayWindows();
		} else {
			registerGlobalHotkeys();
			createOverlayPreviewWindow();
			createOverlayControlWindow();
		}
	});

	ipcMain.on("enable-overlay-mode", () => {
		if (!overlayPreviewWindow && !overlayControlWindow) {
			registerGlobalHotkeys();
			createOverlayPreviewWindow();
			createOverlayControlWindow();
		}
	});

	ipcMain.on("disable-overlay-mode", () => {
		if (overlayPreviewWindow || overlayControlWindow) {
			unregisterGlobalHotkeys();
			closeOverlayWindows();
		}
	});

	createMenu();
	createWindow();

	app.on("activate", function () {
		// On macOS it's common to re-create a window in the app when the
		// dock icon is clicked and there are no other windows open.
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		// Stop the scoreboard server before quitting
		if (scoreboardServer) {
			scoreboardServer.stop().finally(() => {
				app.quit();
			});
		} else {
			app.quit();
		}
	}
});

// Ensure server is stopped when app is quitting
app.on("before-quit", async () => {
	// Unregister global hotkeys
	unregisterGlobalHotkeys();

	if (scoreboardServer) {
		await scoreboardServer.stop();
	}
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
