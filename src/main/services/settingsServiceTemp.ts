import { app } from "electron";
import { join } from "path";
import { promises as fs } from "fs";

interface AppSettings {
	recordingOutputDir?: string;
}

export class SettingsService {
	private settingsPath: string;
	private settings: AppSettings = {};

	constructor() {
		// Store settings in userData directory
		this.settingsPath = join(app.getPath("userData"), "settings.json");
	}

	async load(): Promise<void> {
		try {
			const data = await fs.readFile(this.settingsPath, "utf-8");
			this.settings = JSON.parse(data);
			console.log("Settings loaded:", this.settings);
		} catch {
			// File doesn't exist yet or is invalid, use defaults
			console.log("No settings file found, using defaults");
			this.settings = {};
		}
	}

	async save(): Promise<void> {
		try {
			await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), "utf-8");
			console.log("Settings saved:", this.settings);
		} catch (error) {
			console.error("Failed to save settings:", error);
			throw error;
		}
	}

	async getRecordingOutputDir(): Promise<string> {
		if (this.settings.recordingOutputDir) {
			return this.settings.recordingOutputDir;
		}

		// Default: Documents/ScoreboardRecordings
		const defaultDir = join(app.getPath("documents"), "ScoreboardRecordings");

		// Create directory if it doesn't exist
		try {
			await fs.mkdir(defaultDir, { recursive: true });
		} catch (error) {
			console.error("Failed to create default recording directory:", error);
		}

		return defaultDir;
	}

	async setRecordingOutputDir(path: string): Promise<void> {
		// Validate that the directory exists
		try {
			const stats = await fs.stat(path);
			if (!stats.isDirectory()) {
				throw new Error("Path is not a directory");
			}
		} catch (error) {
			throw new Error(`Invalid directory: ${error instanceof Error ? error.message : String(error)}`);
		}

		this.settings.recordingOutputDir = path;
		await this.save();
	}
}
