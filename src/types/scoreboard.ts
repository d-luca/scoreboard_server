export interface ScoreboardData {
	teamHomeName: string;
	teamAwayName: string;
	teamHomeScore: number;
	teamAwayScore: number;
	teamHomeColor: string;
	teamAwayColor: string;
	timer: number; // in seconds
	half: number;
	eventLogo?: string;
}

export interface GameState extends ScoreboardData {
	isTimerRunning: boolean;
	lastUpdated: number;
}
