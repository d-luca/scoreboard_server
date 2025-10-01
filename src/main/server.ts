import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { join } from "path";
import { ScoreboardData } from "../types/scoreboard";
import { renderScoreboardHTML } from "./ssr";

export class ScoreboardServer {
	private app: express.Application;
	private server: import("http").Server | null = null;
	private wss!: WebSocketServer;
	private port: number;
	private currentData: ScoreboardData;

	constructor(port: number = 3001) {
		this.port = port;
		this.app = express();
		this.currentData = {
			teamHomeName: "HOME",
			teamAwayName: "AWAY",
			teamHomeScore: 0,
			teamAwayScore: 0,
			teamHomeColor: "#00ff00",
			teamAwayColor: "#ff0000",
			timer: 0,
			half: 1,
		};

		this.setupMiddleware();
		this.setupRoutes();
	}

	private setupMiddleware(): void {
		// Enable CORS for all origins (OBS Browser Source)
		this.app.use(
			cors({
				origin: "*",
				methods: ["GET", "POST"],
				allowedHeaders: ["Content-Type"],
			}),
		);

		this.app.use(express.json());
		this.app.use(express.static(join(__dirname, "../renderer")));
	}

	private setupRoutes(): void {
		// Serve the scoreboard HTML page
		this.app.get("/scoreboard", (_req, res) => {
			res.send(renderScoreboardHTML(this.currentData));
		});

		// API endpoint to get current scoreboard data
		this.app.get("/api/scoreboard", (_req, res) => {
			res.json(this.currentData);
		});

		// API endpoint to update scoreboard data
		this.app.post("/api/scoreboard", (req, res) => {
			this.updateScoreboardData(req.body);
			res.json({ success: true, data: this.currentData });
		});

		// Health check endpoint
		this.app.get("/health", (_req, res) => {
			res.json({ status: "ok", port: this.port });
		});

		// Test endpoint to update scores (for testing real-time updates)
		this.app.post("/test/update-scores", (_req, res) => {
			const testData = {
				teamHomeScore: Math.floor(Math.random() * 10),
				teamAwayScore: Math.floor(Math.random() * 10),
				timer: Math.floor(Math.random() * 3600),
				half: Math.floor(Math.random() * 4) + 1,
			};
			this.updateScoreboardData(testData);
			res.json({ message: "Test data updated", data: testData });
		});
	}

	public updateScoreboardData(data: Partial<ScoreboardData>): void {
		this.currentData = { ...this.currentData, ...data };

		// Broadcast to all WebSocket clients
		const message = JSON.stringify(this.currentData);
		this.wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				// WebSocket.OPEN
				client.send(message);
			}
		});
	}

	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.server = this.app.listen(this.port, "localhost", () => {
					console.log(`Scoreboard server running on http://localhost:${this.port}`);
					console.log(`Scoreboard view: http://localhost:${this.port}/scoreboard`);

					// Set up WebSocket server
					if (this.server) {
						this.wss = new WebSocketServer({ server: this.server });
					}

					this.wss.on("connection", (ws) => {
						console.log("WebSocket client connected");
						// Send current data to new client
						ws.send(JSON.stringify(this.currentData));

						ws.on("close", () => {
							console.log("WebSocket client disconnected");
						});
					});

					resolve();
				});

				this.server.on("error", (error) => {
					reject(error);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	public stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.server) {
				this.wss?.close();
				this.server.close(() => {
					console.log("Scoreboard server stopped");
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	public getCurrentData(): ScoreboardData {
		return { ...this.currentData };
	}
}
