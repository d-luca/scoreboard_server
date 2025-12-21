import { promises as fs } from "fs";
import { join, dirname } from "path";
import { BrowserWindow, app } from "electron";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import {
	ScoreboardRecording,
	ScoreboardSnapshot,
	VideoGenerationConfig,
	GenerationProgress,
	GenerationStep,
} from "../../types/scoreboard";

// Set FFmpeg path
if (ffmpegStatic) {
	ffmpeg.setFfmpegPath(ffmpegStatic);
}

export class VideoGeneratorService {
	private isGenerating = false;
	private shouldCancel = false;
	private progressCallback: ((progress: GenerationProgress) => void) | null = null;
	private tempDir: string | null = null;
	private scoreboardWindow: BrowserWindow | null = null;
	private ffmpegCommand: ReturnType<typeof ffmpeg> | null = null;

	setProgressCallback(callback: (progress: GenerationProgress) => void): void {
		this.progressCallback = callback;
	}

	private reportProgress(
		step: GenerationStep,
		stepProgress: number,
		overallProgress: number,
		message: string,
		currentFrame?: number,
		totalFrames?: number,
		error?: string,
	): void {
		if (this.progressCallback) {
			this.progressCallback({
				step,
				stepProgress,
				overallProgress,
				message,
				currentFrame,
				totalFrames,
				error,
			});
		}
	}

	async loadRecording(filePath: string): Promise<{
		success: boolean;
		data?: ScoreboardRecording;
		error?: string;
	}> {
		try {
			const content = await fs.readFile(filePath, "utf-8");
			const data = JSON.parse(content) as ScoreboardRecording;

			// Validate structure
			if (!data.version || !data.metadata || !Array.isArray(data.snapshots)) {
				return {
					success: false,
					error: "Invalid recording file format. Missing required fields.",
				};
			}

			return { success: true, data };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async generateVideo(
		config: VideoGenerationConfig,
	): Promise<{ success: boolean; outputPath?: string; error?: string }> {
		if (this.isGenerating) {
			return { success: false, error: "Video generation already in progress" };
		}

		this.isGenerating = true;
		this.shouldCancel = false;

		try {
			// Step 1: Parse JSON
			this.reportProgress("parsing", 0, 0, "Loading recording file...");
			const loadResult = await this.loadRecording(config.recordingPath);
			if (!loadResult.success || !loadResult.data) {
				throw new Error(loadResult.error || "Failed to load recording");
			}

			const recording = loadResult.data;
			const totalFrames = recording.snapshots.length;

			if (totalFrames === 0) {
				throw new Error("Recording contains no snapshots");
			}

			this.reportProgress("parsing", 100, 5, `Loaded ${totalFrames} snapshots`);

			if (this.shouldCancel) {
				throw new Error("Generation cancelled");
			}

			// Step 2: Create temp directory for frames
			this.tempDir = join(app.getPath("temp"), `scoreboard-video-${Date.now()}`);
			await fs.mkdir(this.tempDir, { recursive: true });

			// Step 3: Render frames
			this.reportProgress("rendering", 0, 10, "Rendering scoreboard frames...");

			await this.renderFrames(recording.snapshots, config.scoreboardScale, totalFrames);

			if (this.shouldCancel) {
				throw new Error("Generation cancelled");
			}

			// Step 4: Encode video with FFmpeg
			this.reportProgress("encoding", 0, 60, "Encoding video...");

			// Ensure output directory exists
			await fs.mkdir(dirname(config.outputPath), { recursive: true });

			await this.encodeVideo(config.outputPath, config.frameRate, totalFrames);

			// Step 5: Cleanup
			this.reportProgress("cleanup", 0, 95, "Cleaning up temporary files...");
			await this.cleanup();

			this.reportProgress("complete", 100, 100, "Video generation complete!");

			return { success: true, outputPath: config.outputPath };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.reportProgress("error", 0, 0, "Generation failed", undefined, undefined, errorMessage);

			// Cleanup on error
			await this.cleanup();

			return { success: false, error: errorMessage };
		} finally {
			this.isGenerating = false;
			this.closeScoreboardWindow();
		}
	}

	private async renderFrames(
		snapshots: ScoreboardSnapshot[],
		scale: number,
		totalFrames: number,
	): Promise<void> {
		// Create offscreen window for rendering
		this.scoreboardWindow = new BrowserWindow({
			width: Math.round(600 * scale),
			height: Math.round(80 * scale),
			show: false,
			frame: false,
			transparent: true,
			webPreferences: {
				offscreen: true,
				nodeIntegration: false,
				contextIsolation: true,
			},
		});

		// Load the scoreboard renderer page
		const scoreboardUrl = this.getScoreboardRendererUrl();
		await this.scoreboardWindow.loadURL(scoreboardUrl);

		// Wait for the page to be ready
		await new Promise((resolve) => setTimeout(resolve, 500));

		for (let i = 0; i < snapshots.length; i++) {
			if (this.shouldCancel) {
				throw new Error("Generation cancelled");
			}

			const snapshot = snapshots[i];
			const stepProgress = Math.round((i / totalFrames) * 100);
			const overallProgress = 10 + Math.round((i / totalFrames) * 50);

			this.reportProgress(
				"rendering",
				stepProgress,
				overallProgress,
				`Rendering frame ${i + 1} of ${totalFrames}...`,
				i + 1,
				totalFrames,
			);

			// Check if window still exists before using it
			if (!this.scoreboardWindow || this.scoreboardWindow.isDestroyed()) {
				throw new Error("Generation cancelled");
			}

			// Update scoreboard data via executeJavaScript
			await this.scoreboardWindow.webContents.executeJavaScript(`
				window.updateScoreboardData(${JSON.stringify(snapshot)});
			`);

			// Small delay to ensure render is complete
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Check again before capturing (in case cancel was called during delay)
			if (!this.scoreboardWindow || this.scoreboardWindow.isDestroyed()) {
				throw new Error("Generation cancelled");
			}

			// Capture the frame
			const image = await this.scoreboardWindow.webContents.capturePage();
			const pngBuffer = image.toPNG();

			// Save frame with zero-padded index
			const framePath = join(this.tempDir!, `frame_${String(i).padStart(5, "0")}.png`);
			await fs.writeFile(framePath, pngBuffer);
		}

		this.closeScoreboardWindow();
	}

	private getScoreboardRendererUrl(): string {
		// In development, use the dev server URL
		if (process.env.NODE_ENV === "development" && process.env["ELECTRON_RENDERER_URL"]) {
			return `${process.env["ELECTRON_RENDERER_URL"]}/scoreboard-renderer.html`;
		}
		// In production, use the file protocol
		return `file://${join(__dirname, "../renderer/scoreboard-renderer.html")}`;
	}

	private async encodeVideo(outputPath: string, frameRate: number, totalSnapshots: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const inputPattern = join(this.tempDir!, "frame_%05d.png");
			// Total output frames = snapshots * frameRate (each snapshot becomes frameRate frames)
			const totalOutputFrames = totalSnapshots * frameRate;

			// Using VP9 with alpha channel for transparency
			// Each frame represents 1 second of recording, so input framerate is 1
			// Output framerate is user-specified (e.g., 30fps)
			this.ffmpegCommand = ffmpeg()
				.input(inputPattern)
				.inputFPS(1) // 1 frame per second in input (each snapshot = 1 second)
				.outputFPS(frameRate) // Output at desired framerate (frames will be duplicated)
				.outputOptions([
					"-c:v libvpx-vp9",
					"-pix_fmt yuva420p", // Enable alpha channel
					"-auto-alt-ref 0", // Required for alpha
					"-b:v 2M", // Bitrate
				])
				.output(outputPath)
				.on("progress", (progress) => {
					// Use frames processed for more accurate progress
					const framesProcessed = progress.frames || 0;
					const percent = Math.min(100, Math.round((framesProcessed / totalOutputFrames) * 100));
					const overallProgress = Math.min(95, 60 + Math.round(percent * 0.35));

					// Show current encoding speed and frames
					const fps = progress.currentFps || 0;
					const message = `Encoding video... (${framesProcessed}/${totalOutputFrames} frames, ${fps.toFixed(1)} fps)`;

					this.reportProgress(
						"encoding",
						percent,
						overallProgress,
						message,
						framesProcessed,
						totalOutputFrames,
					);
				})
				.on("end", () => {
					this.ffmpegCommand = null;
					resolve();
				})
				.on("error", (err) => {
					this.ffmpegCommand = null;
					// Check if error is from cancellation
					if (this.shouldCancel) {
						reject(new Error("Generation cancelled"));
					} else {
						reject(new Error(`FFmpeg error: ${err.message}`));
					}
				});

			this.ffmpegCommand.run();
		});
	}

	private async cleanup(): Promise<void> {
		if (this.tempDir) {
			try {
				await fs.rm(this.tempDir, { recursive: true, force: true });
			} catch (error) {
				console.error("Failed to cleanup temp directory:", error);
			}
			this.tempDir = null;
		}
	}

	private closeScoreboardWindow(): void {
		if (this.scoreboardWindow && !this.scoreboardWindow.isDestroyed()) {
			this.scoreboardWindow.close();
		}
		this.scoreboardWindow = null;
	}

	async cancel(): Promise<void> {
		this.shouldCancel = true;

		// Kill FFmpeg process if running
		if (this.ffmpegCommand) {
			try {
				this.ffmpegCommand.kill("SIGKILL");
				this.ffmpegCommand = null;
			} catch (error) {
				console.error("Failed to kill FFmpeg process:", error);
			}
		}

		this.closeScoreboardWindow();
	}

	getIsGenerating(): boolean {
		return this.isGenerating;
	}
}
