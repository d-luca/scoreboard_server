import { ElectronAPI } from "@electron-toolkit/preload";
import { ScoreboardData } from "../types/scoreboard";

interface ScoreboardAPI {
	getScoreboardData: () => Promise<ScoreboardData>;
	updateScoreboardData: (data: Partial<ScoreboardData>) => Promise<ScoreboardData>;
}

declare global {
	interface Window {
		electron: ElectronAPI;
		api: ScoreboardAPI;
	}
}
