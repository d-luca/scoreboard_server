export interface ScoreboardData {
	teamHomeName: string;
	teamAwayName: string;
	teamHomeScore: number;
	teamAwayScore: number;
	teamHomeColor: string;
	teamAwayColor: string;
	timer: number; // in seconds
	half: number;
	halfPrefix?: string;
	eventLogo?: string;
}

export interface GameState extends ScoreboardData {
	isTimerRunning: boolean;
	lastUpdated: number;
}

// Recording types

// Single snapshot of scoreboard state
export interface ScoreboardSnapshot {
	timestamp: number; // Unix timestamp (ms) when snapshot was taken
	relativeTime: number; // Seconds since recording started (0, 1, 2, ...)
	teamHomeName: string;
	teamAwayName: string;
	teamHomeColor: string;
	teamAwayColor: string;
	teamHomeScore: number;
	teamAwayScore: number;
	timer: number; // Timer value in seconds
	half: number;
	halfPrefix: string;
}

// Full recording file structure
export interface ScoreboardRecording {
	version: string; // Schema version for future compatibility
	metadata: {
		recordingId: string; // UUID for unique identification
		startedAt: string; // ISO date string
		endedAt: string; // ISO date string (filled when recording stops)
		homeName: string;
		awayName: string;
		totalSnapshots: number;
	};
	snapshots: ScoreboardSnapshot[];
}

// Recording status for UI state management
export interface RecordingStatus {
	isRecording: boolean;
	recordingId?: string;
	filePath?: string;
	snapshotCount: number;
	startTime?: number; // Unix timestamp (ms)
	duration: number; // Seconds
}

// Video generation types

export interface VideoGenerationConfig {
	recordingPath: string;
	outputPath: string; // Full path including filename.webm
	frameRate: number; // Default: 30
	scoreboardScale: number; // Default: 1.0 (multiplier for scoreboard size)
}

export type GenerationStep = "idle" | "parsing" | "rendering" | "encoding" | "cleanup" | "complete" | "error";

export interface GenerationProgress {
	step: GenerationStep;
	stepProgress: number; // 0-100 for current step
	overallProgress: number; // 0-100 for entire process
	currentFrame?: number;
	totalFrames?: number;
	message: string;
	error?: string;
}
