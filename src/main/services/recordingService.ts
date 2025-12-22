import { promises as fs } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { ScoreboardRecording, ScoreboardSnapshot } from "../../types/scoreboard";

export class RecordingService {
	private currentRecording: ScoreboardRecording | null = null;
	private currentFilePath: string | null = null;
	private recordingStartTime: number | null = null;
	private snapshotBuffer: ScoreboardSnapshot[] = [];
	private bufferFlushInterval: NodeJS.Timeout | null = null;
	private statusBroadcastCallback: ((status: ReturnType<RecordingService["getStatus"]>) => void) | null =
		null;

	setStatusBroadcastCallback(callback: (status: ReturnType<RecordingService["getStatus"]>) => void): void {
		this.statusBroadcastCallback = callback;
	}

	private broadcastStatus(): void {
		if (this.statusBroadcastCallback) {
			this.statusBroadcastCallback(this.getStatus());
		}
	}

	isRecording(): boolean {
		return this.currentRecording !== null;
	}

	getCurrentFilePath(): string | null {
		return this.currentFilePath;
	}

	getSnapshotCount(): number {
		return this.currentRecording?.snapshots.length ?? 0;
	}

	getDuration(): number {
		if (!this.recordingStartTime) return 0;
		return Math.floor((Date.now() - this.recordingStartTime) / 1000);
	}

	async startRecording(
		outputDir: string,
		homeName: string,
		awayName: string,
	): Promise<{ success: boolean; filePath: string; recordingId: string; error?: string }> {
		if (this.isRecording()) {
			return {
				success: false,
				filePath: "",
				recordingId: "",
				error: "Recording already in progress",
			};
		}

		try {
			// Generate recording ID
			const recordingId = uuidv4();
			const startTime = new Date();
			this.recordingStartTime = startTime.getTime();

			// Sanitize team names for filename
			const sanitizedHome = this.sanitizeFilename(homeName);
			const sanitizedAway = this.sanitizeFilename(awayName);
			const timestamp = startTime.toISOString().replace(/:/g, "-").split(".")[0];

			// Create filename
			const fileName = `${sanitizedHome}-${sanitizedAway}-${timestamp}.json`;
			this.currentFilePath = join(outputDir, fileName);

			// Initialize recording structure
			this.currentRecording = {
				version: "1.0",
				metadata: {
					recordingId,
					startedAt: startTime.toISOString(),
					endedAt: "", // Will be filled when recording stops
					homeName,
					awayName,
					totalSnapshots: 0,
				},
				snapshots: [],
			};

			// Create the file with initial structure
			await this.writeToFile();

			// Start buffer flush interval (every 5 seconds)
			this.bufferFlushInterval = setInterval(() => {
				void this.flushBuffer();
			}, 5000);

			console.log(`Recording started: ${this.currentFilePath}`);

			return {
				success: true,
				filePath: this.currentFilePath,
				recordingId,
			};
		} catch (error) {
			console.error("Failed to start recording:", error);
			this.cleanup();
			return {
				success: false,
				filePath: "",
				recordingId: "",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async writeSnapshot(snapshot: ScoreboardSnapshot): Promise<{ success: boolean; error?: string }> {
		if (!this.isRecording() || !this.currentRecording) {
			return {
				success: false,
				error: "No active recording",
			};
		}

		try {
			// Add snapshot to buffer
			this.snapshotBuffer.push(snapshot);
			this.currentRecording.snapshots.push(snapshot);
			this.currentRecording.metadata.totalSnapshots = this.currentRecording.snapshots.length;

			// Broadcast status update
			this.broadcastStatus();

			return { success: true };
		} catch (error) {
			console.error("Failed to write snapshot:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async stopRecording(): Promise<{
		success: boolean;
		filePath: string;
		totalSnapshots: number;
		error?: string;
	}> {
		if (!this.isRecording() || !this.currentRecording || !this.currentFilePath) {
			return {
				success: false,
				filePath: "",
				totalSnapshots: 0,
				error: "No active recording",
			};
		}

		try {
			// Flush any remaining snapshots
			await this.flushBuffer();

			// Update end time
			this.currentRecording.metadata.endedAt = new Date().toISOString();

			// Final write to file
			await this.writeToFile();

			const filePath = this.currentFilePath;
			const totalSnapshots = this.currentRecording.snapshots.length;

			console.log(`Recording stopped: ${filePath} (${totalSnapshots} snapshots)`);

			// Cleanup
			this.cleanup();

			return {
				success: true,
				filePath,
				totalSnapshots,
			};
		} catch (error) {
			console.error("Failed to stop recording:", error);
			return {
				success: false,
				filePath: this.currentFilePath ?? "",
				totalSnapshots: 0,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	private async flushBuffer(): Promise<void> {
		if (this.snapshotBuffer.length === 0) return;

		try {
			// Write current state to file
			await this.writeToFile();
			this.snapshotBuffer = [];
		} catch (error) {
			console.error("Failed to flush buffer:", error);
		}
	}

	private async writeToFile(): Promise<void> {
		if (!this.currentRecording || !this.currentFilePath) return;

		await fs.writeFile(this.currentFilePath, JSON.stringify(this.currentRecording, null, 2), "utf-8");
	}

	private cleanup(): void {
		if (this.bufferFlushInterval) {
			clearInterval(this.bufferFlushInterval);
			this.bufferFlushInterval = null;
		}
		this.currentRecording = null;
		this.currentFilePath = null;
		this.recordingStartTime = null;
		this.snapshotBuffer = [];
	}

	private sanitizeFilename(name: string): string {
		return name
			.replace(/[^a-zA-Z0-9-_]/g, "_")
			.replace(/_{2,}/g, "_")
			.replace(/^_|_$/g, "");
	}

	getStatus(): {
		isRecording: boolean;
		filePath: string | null;
		snapshotCount: number;
		duration: number;
	} {
		return {
			isRecording: this.isRecording(),
			filePath: this.currentFilePath,
			snapshotCount: this.getSnapshotCount(),
			duration: this.getDuration(),
		};
	}
}
