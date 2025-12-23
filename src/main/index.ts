import { app, shell, BrowserWindow, ipcMain, globalShortcut, screen, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { ScoreboardServer } from "./server";
import {
	ScoreboardData,
	ScoreboardSnapshot,
	VideoGenerationConfig,
	GenerationProgress,
} from "../types/scoreboard";
import { RecordingService } from "./services/recordingService";
import { SettingsService } from "./services/settingsService";
import { VideoGeneratorService } from "./services/videoGeneratorService";

// Global server instance
let scoreboardServer: ScoreboardServer;
let recordingService: RecordingService;
let settingsService: SettingsService;
let videoGeneratorService: VideoGeneratorService;
let mainWindow: BrowserWindow | null = null;
let overlayPreviewWindow: BrowserWindow | null = null;
let overlayControlWindow: BrowserWindow | null = null;
let videoGeneratorWindow: BrowserWindow | null = null;

// Store current hotkey configuration
let currentHotkeys: Record<
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
		// Timer control actions - handled by main process timer
		case "startTimer":
			startMainTimer();
			return; // Don't broadcast - timer functions handle it
		case "pauseTimer":
			pauseMainTimer();
			return;
		case "stopTimer":
			stopMainTimer();
			return;
		// Timer loadout actions - forward to the appropriate window
		case "timerLoadout1":
		case "timerLoadout2":
		case "timerLoadout3":
			if (overlayControlWindow && !overlayControlWindow.isDestroyed()) {
				overlayControlWindow.webContents.send("global-hotkey-action", action);
			} else if (mainWindow) {
				mainWindow.webContents.send("global-hotkey-action", action);
			}
			return;
		default:
			// Unknown action - try to forward to a window
			if (overlayControlWindow && !overlayControlWindow.isDestroyed()) {
				overlayControlWindow.webContents.send("global-hotkey-action", action);
			} else if (mainWindow) {
				mainWindow.webContents.send("global-hotkey-action", action);
			}
			return;
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
		Object.entries(currentHotkeys).forEach(([action, mapping]) => {
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

// Main process timer - never throttled
let mainTimerInterval: ReturnType<typeof setInterval> | null = null;
let isTimerRunning = false;

function startMainTimer(): void {
	if (mainTimerInterval !== null || !scoreboardServer) {
		return;
	}

	const currentData = scoreboardServer.getCurrentData();
	if ((currentData.timer ?? 0) <= 0) {
		return;
	}

	isTimerRunning = true;
	// Broadcast that timer started
	scoreboardServer.updateScoreboardData({ isTimerRunning: true });
	BrowserWindow.getAllWindows().forEach((window) => {
		window.webContents.send("scoreboard-data-update", { isTimerRunning: true });
	});

	mainTimerInterval = setInterval(() => {
		if (!scoreboardServer) {
			stopMainTimer();
			return;
		}

		const data = scoreboardServer.getCurrentData();
		const currentTimer = data.timer ?? 0;

		if (currentTimer <= 0) {
			stopMainTimer();
			return;
		}

		const newTimer = currentTimer - 1;
		scoreboardServer.updateScoreboardData({ timer: newTimer });

		// Broadcast to all windows
		BrowserWindow.getAllWindows().forEach((window) => {
			window.webContents.send("scoreboard-data-update", { timer: newTimer });
		});

		if (newTimer <= 0) {
			stopMainTimer();
		}
	}, 1000);

	console.log("Main process timer started");
}

function pauseMainTimer(): void {
	if (mainTimerInterval === null) {
		return;
	}

	clearInterval(mainTimerInterval);
	mainTimerInterval = null;
	isTimerRunning = false;

	// Broadcast that timer paused
	if (scoreboardServer) {
		scoreboardServer.updateScoreboardData({ isTimerRunning: false });
	}
	BrowserWindow.getAllWindows().forEach((window) => {
		window.webContents.send("scoreboard-data-update", { isTimerRunning: false });
	});

	console.log("Main process timer paused");
}

function stopMainTimer(): void {
	if (mainTimerInterval !== null) {
		clearInterval(mainTimerInterval);
		mainTimerInterval = null;
	}
	isTimerRunning = false;

	// Broadcast that timer stopped and reset to 0
	if (scoreboardServer) {
		scoreboardServer.updateScoreboardData({ timer: 0, isTimerRunning: false });
	}
	BrowserWindow.getAllWindows().forEach((window) => {
		window.webContents.send("scoreboard-data-update", { timer: 0, isTimerRunning: false });
	});

	console.log("Main process timer stopped");
}

function createWindow(): void {
	// Create the browser window.
	mainWindow = new BrowserWindow({
		width: 900,
		height: 670,
		show: false,
		autoHideMenuBar: true,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	mainWindow.on("ready-to-show", () => {
		mainWindow?.maximize();
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

function createOverlayPreviewWindow(): void {
	if (overlayPreviewWindow) {
		overlayPreviewWindow.focus();
		return;
	}

	overlayPreviewWindow = new BrowserWindow({
		width: 600,
		height: 80,
		x: 50,
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
			backgroundThrottling: false,
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
		width: 500,
		height: 250,
		x: width - 550,
		y: height - 250,
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
			backgroundThrottling: false,
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

function createVideoGeneratorWindow(): void {
	// If window already exists, focus it
	if (videoGeneratorWindow) {
		videoGeneratorWindow.focus();
		return;
	}

	videoGeneratorWindow = new BrowserWindow({
		width: 900,
		height: 700,
		title: "Scoreboard Video Generator",
		autoHideMenuBar: true,
		...(process.platform === "linux" ? { icon } : {}),
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			sandbox: false,
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
		},
	});

	videoGeneratorWindow.on("closed", () => {
		videoGeneratorWindow = null;
	});

	// Load video-generator.html
	if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
		videoGeneratorWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/video-generator.html`);
	} else {
		videoGeneratorWindow.loadFile(join(__dirname, "../renderer/video-generator.html"));
	}
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

	// Initialize services
	scoreboardServer = new ScoreboardServer(3001);
	recordingService = new RecordingService();
	settingsService = new SettingsService();
	videoGeneratorService = new VideoGeneratorService();

	// Set up recording status broadcast callback
	recordingService.setStatusBroadcastCallback((status) => {
		BrowserWindow.getAllWindows().forEach((window) => {
			window.webContents.send("recording-status-changed", status);
		});
	});

	// Set up scoreboard data callback for recording - allows main process to capture snapshots
	recordingService.setGetScoreboardDataCallback(() => {
		return scoreboardServer.getCurrentData();
	});

	// Load settings
	settingsService
		.load()
		.then(() => {
			console.log("Settings loaded successfully");
		})
		.catch((error) => {
			console.error("Failed to load settings:", error);
		});

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
		const fullData = scoreboardServer.getCurrentData();

		// Broadcast to all Electron windows so they stay in sync
		BrowserWindow.getAllWindows().forEach((window) => {
			window.webContents.send("scoreboard-data-update", fullData);
		});

		return fullData;
	});

	// IPC test
	ipcMain.on("ping", () => console.log("pong"));

	// IPC handlers for recording
	ipcMain.handle("recording:start", async (_event, config: { homeName: string; awayName: string }) => {
		const outputDir = await settingsService.getRecordingOutputDir();
		const result = await recordingService.startRecording(outputDir, config.homeName, config.awayName);

		// Broadcast status change to all windows
		if (result.success) {
			const status = recordingService.getStatus();
			BrowserWindow.getAllWindows().forEach((window) => {
				window.webContents.send("recording-status-changed", status);
			});
		}

		return result;
	});

	ipcMain.handle("recording:write-snapshot", async (_event, snapshot: ScoreboardSnapshot) => {
		return recordingService.writeSnapshot(snapshot);
	});

	ipcMain.handle("recording:stop", async () => {
		const result = await recordingService.stopRecording();

		// Broadcast status change to all windows
		if (result.success) {
			const status = recordingService.getStatus();
			BrowserWindow.getAllWindows().forEach((window) => {
				window.webContents.send("recording-status-changed", status);
			});
		}

		return result;
	});

	ipcMain.handle("recording:get-status", async () => {
		return recordingService.getStatus();
	});

	// IPC handlers for settings
	ipcMain.handle("settings:get-recording-output-dir", async () => {
		return settingsService.getRecordingOutputDir();
	});

	ipcMain.handle("settings:set-recording-output-dir", async (_event, path: string) => {
		try {
			await settingsService.setRecordingOutputDir(path);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	ipcMain.handle("settings:select-recording-output-dir", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "createDirectory"],
			title: "Select Recording Output Directory",
		});

		return {
			canceled: result.canceled,
			path: result.filePaths[0],
		};
	});

	// IPC handlers for video generation
	ipcMain.on("video-generator:open-window", () => {
		createVideoGeneratorWindow();
	});

	ipcMain.handle("video-generator:select-file", async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			title: "Select Recording File",
			filters: [{ name: "JSON Files", extensions: ["json"] }],
		});

		return {
			canceled: result.canceled,
			filePath: result.filePaths[0],
		};
	});

	ipcMain.handle("video-generator:load-recording", async (_event, filePath: string) => {
		return videoGeneratorService.loadRecording(filePath);
	});

	ipcMain.handle("video-generator:select-output", async () => {
		const result = await dialog.showSaveDialog({
			title: "Save Video As",
			defaultPath: "scoreboard-video.webm",
			filters: [{ name: "WebM Video", extensions: ["webm"] }],
		});

		return {
			canceled: result.canceled,
			filePath: result.filePath,
		};
	});

	ipcMain.handle("video-generator:generate", async (_event, config: VideoGenerationConfig) => {
		// Set up progress callback to send updates to renderer
		videoGeneratorService.setProgressCallback((progress: GenerationProgress) => {
			if (videoGeneratorWindow && !videoGeneratorWindow.isDestroyed()) {
				videoGeneratorWindow.webContents.send("video-generator:progress", progress);
			}
		});

		return videoGeneratorService.generateVideo(config);
	});

	ipcMain.handle("video-generator:cancel", async () => {
		await videoGeneratorService.cancel();
	});

	// Main process timer IPC handlers - timer runs in main process, never throttled
	ipcMain.on("main-timer:start", () => {
		startMainTimer();
	});

	ipcMain.on("main-timer:pause", () => {
		pauseMainTimer();
	});

	ipcMain.on("main-timer:stop", () => {
		stopMainTimer();
	});

	ipcMain.handle("main-timer:is-running", () => {
		return isTimerRunning;
	});

	// IPC handler for timer action requests from any window
	// Now uses the main process timer
	ipcMain.on("request-timer-action", (_event, action: string) => {
		switch (action) {
			case "startTimer":
				startMainTimer();
				break;
			case "pauseTimer":
				pauseMainTimer();
				break;
			case "stopTimer":
				stopMainTimer();
				break;
			default:
				// Forward other actions to the appropriate window
				if (overlayControlWindow && !overlayControlWindow.isDestroyed()) {
					overlayControlWindow.webContents.send("global-hotkey-action", action);
				} else if (mainWindow) {
					mainWindow.webContents.send("global-hotkey-action", action);
				}
		}
	});

	// IPC handler for hotkey synchronization
	ipcMain.on("hotkey-changed", (_event, hotkeys: string) => {
		try {
			// Parse the hotkeys and update current configuration
			const parsedHotkeys = JSON.parse(hotkeys) as Record<
				string,
				{ key: string; enabled: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }
			>;
			currentHotkeys = parsedHotkeys;

			// If overlay mode is active and hotkeys are enabled, re-register global shortcuts
			if (overlayPreviewWindow || overlayControlWindow) {
				unregisterGlobalHotkeys();
				registerGlobalHotkeys();
				console.log("Global hotkeys updated");
			}
		} catch (error) {
			console.error("Failed to parse hotkeys:", error);
		}

		// Broadcast to all windows
		BrowserWindow.getAllWindows().forEach((window) => {
			window.webContents.send("hotkey-update", hotkeys);
		});
	});

	// IPC handler for hotkey enabled state changes
	ipcMain.on("hotkey-enabled-changed", (_event, enabled: boolean) => {
		if (enabled) {
			// Only register if overlay windows are open
			if (overlayPreviewWindow || overlayControlWindow) {
				registerGlobalHotkeys();
			}
		} else {
			unregisterGlobalHotkeys();
		}
		// Broadcast to all windows
		BrowserWindow.getAllWindows().forEach((window) => {
			window.webContents.send("hotkey-enabled-update", enabled);
		});
	});

	// IPC handler to get hotkey enabled state
	ipcMain.handle("get-hotkey-enabled", () => {
		// We'll store this state; for now assume enabled by default
		return true;
	});

	// IPC handlers for overlay mode
	// Timer control handoff state
	let pendingTimerHandoff: { timer: number; isRunning: boolean } | null = null;
	let overlayReady = false;

	// Handle timer control surrendered from main window
	ipcMain.on("timer-control-surrendered", (_event, state: { timer: number; isRunning: boolean }) => {
		console.log("Timer control surrendered:", state);
		// Send to overlay control window if it exists and is ready
		if (overlayReady && overlayControlWindow && !overlayControlWindow.isDestroyed()) {
			overlayControlWindow.webContents.send("receive-timer-control", state);
			pendingTimerHandoff = null;
		} else {
			// Store for later if overlay isn't ready yet
			pendingTimerHandoff = state;
			console.log("Overlay not ready, storing handoff for later");
		}
	});

	// Handle overlay control window signaling it's ready to receive timer control
	ipcMain.on("overlay-ready", () => {
		overlayReady = true;
		// If we have a pending handoff, send it now
		if (pendingTimerHandoff && overlayControlWindow && !overlayControlWindow.isDestroyed()) {
			console.log("Sending pending timer handoff:", pendingTimerHandoff);
			overlayControlWindow.webContents.send("receive-timer-control", pendingTimerHandoff);
			pendingTimerHandoff = null;
		}
	});

	// Handle timer surrendered from overlay before it closes
	ipcMain.on("overlay-timer-surrender", (_event, state: { timer: number; isRunning: boolean }) => {
		console.log("Overlay surrendering timer:", state);
		// Send to main window to take over
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("receive-timer-control", state);
		}
	});

	ipcMain.on("toggle-overlay-mode", (_event, hotkeyEnabled: boolean) => {
		if (overlayPreviewWindow || overlayControlWindow) {
			// Closing overlay - timer handoff happens via overlay-timer-surrender
			overlayReady = false;
			unregisterGlobalHotkeys();
			closeOverlayWindows();
		} else {
			// Opening overlay - first create windows, then request timer handoff
			if (mainWindow) {
				mainWindow.webContents.send("request-hotkeys");
			}

			setTimeout(() => {
				if (hotkeyEnabled) {
					registerGlobalHotkeys();
				}
				createOverlayPreviewWindow();
				createOverlayControlWindow();

				// Request timer handoff after windows are created
				// The overlay will signal when it's ready via "overlay-ready"
				setTimeout(() => {
					if (mainWindow) {
						mainWindow.webContents.send("surrender-timer-control");
					}
				}, 50);
			}, 50);
		}
	});

	ipcMain.on("enable-overlay-mode", (_event, hotkeyEnabled: boolean) => {
		if (!overlayPreviewWindow && !overlayControlWindow) {
			// Opening overlay - first create windows, then request timer handoff
			if (mainWindow) {
				mainWindow.webContents.send("request-hotkeys");
			}

			setTimeout(() => {
				if (hotkeyEnabled) {
					registerGlobalHotkeys();
				}
				createOverlayPreviewWindow();
				createOverlayControlWindow();

				// Request timer handoff after windows are created
				// The overlay will signal when it's ready via "overlay-ready"
				setTimeout(() => {
					if (mainWindow) {
						mainWindow.webContents.send("surrender-timer-control");
					}
				}, 50);
			}, 50);
		}
	});

	ipcMain.on("disable-overlay-mode", () => {
		if (overlayPreviewWindow || overlayControlWindow) {
			// Timer handoff happens via overlay-timer-surrender before close
			unregisterGlobalHotkeys();
			closeOverlayWindows();
		}
	});

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
