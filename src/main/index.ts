import { app, shell, BrowserWindow, ipcMain, Menu } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { ScoreboardServer } from "./server";
import { ScoreboardData } from "../types/scoreboard";

// Global server instance
let scoreboardServer: ScoreboardServer;
let mainWindow: BrowserWindow | null = null;
let hotkeySettingsWindow: BrowserWindow | null = null;

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
		mainWindow = null;
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
	if (scoreboardServer) {
		await scoreboardServer.stop();
	}
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
