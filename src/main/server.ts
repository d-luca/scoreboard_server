import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { join } from "path";
import { ScoreboardData, ScoreboardWSCommand, TimerCommand } from "../types/scoreboard";
import { renderScoreboardHTML } from "./ssr";
import { renderControlPage } from "./controlPage";

export class ScoreboardServer {
	private app: express.Application;
	private server: import("http").Server | null = null;
	private wss!: WebSocketServer;
	private port: number;
	private currentData: ScoreboardData;
	private onTimerCommand: ((command: TimerCommand, value?: number) => void) | null = null;
	private onStateChangedFromExternal: ((data: ScoreboardData) => void) | null = null;
	private onBuzzerCommand: (() => void) | null = null;

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
			halfPrefix: "PERIODO",
			isTimerRunning: false,
			timerLoadout1: 15 * 60,
			timerLoadout2: 45 * 60,
			timerLoadout3: 20 * 60,
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
		// Serve buzzer audio file for remote control page
		this.app.get("/buzzer.mp3", (_req, res) => {
			res.sendFile(join(__dirname, "../../resources/buzzer.mp3"));
		});

		// Serve the scoreboard HTML page
		this.app.get("/scoreboard", (_req, res) => {
			res.send(renderScoreboardHTML(this.currentData));
		});

		// Serve the mobile-friendly LAN remote control page
		this.app.get("/control", (_req, res) => {
			res.send(renderControlPage());
		});

		// Serve individual property value with auto-update via WebSocket
		this.app.get("/value/:property", (req, res) => {
			const property = req.params.property as keyof ScoreboardData;

			if (!(property in this.currentData)) {
				res.status(404).send("Property not found");
				return;
			}

			// Format timer value for display
			const formatValue = (
				prop: keyof ScoreboardData,
				value: ScoreboardData[keyof ScoreboardData],
			): string => {
				if (prop === "timer" && typeof value === "number") {
					const mins = Math.floor(value / 60);
					const secs = value % 60;
					return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
				}
				return String(value);
			};

			const displayValue = formatValue(property, this.currentData[property]);

			const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: transparent;
            font-family: system-ui, -apple-system, sans-serif;
            color: white;
            font-size: 48px;
            font-weight: bold;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
        }
        #value {
            text-align: center;
        }
    </style>
</head>
<body>
    <div id="value">${displayValue}</div>
    <script>
        const property = '${property}';

        function formatValue(prop, value) {
            if (prop === 'timer' && typeof value === 'number') {
                const mins = Math.floor(value / 60);
                const secs = value % 60;
                return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
            }
            return String(value);
        }

        const ws = new WebSocket('ws://' + window.location.host);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (property in data) {
                    document.getElementById('value').textContent = formatValue(property, data[property]);
                }
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed');
        };
    </script>
</body>
</html>
			`;
			res.send(html);
		});

		// API endpoint to get current scoreboard data
		this.app.get("/api/scoreboard", (_req, res) => {
			res.json(this.currentData);
		});

		// API endpoint to get a specific property from scoreboard data
		this.app.get("/api/scoreboard/:property", (req, res) => {
			const property = req.params.property as keyof ScoreboardData;

			if (property in this.currentData) {
				res.send(String(this.currentData[property]));
			} else {
				res.status(404).send("Property not found");
			}
		});

		// API endpoint to update scoreboard data
		this.app.post("/api/scoreboard", (req, res) => {
			this.applyExternalScoreboardData(req.body);
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

	public setTimerCommandCallback(callback: (command: TimerCommand, value?: number) => void): void {
		this.onTimerCommand = callback;
	}

	public setStateChangedCallback(callback: (data: ScoreboardData) => void): void {
		this.onStateChangedFromExternal = callback;
	}

	public setBuzzerCommandCallback(callback: () => void): void {
		this.onBuzzerCommand = callback;
	}

	private sanitizeNonNegativeInteger(value: unknown): number | undefined {
		const parsedValue = typeof value === "number" ? value : Number(value);
		return Number.isFinite(parsedValue) ? Math.max(0, Math.floor(parsedValue)) : undefined;
	}

	private sanitizePositiveInteger(value: unknown): number | undefined {
		const parsedValue = this.sanitizeNonNegativeInteger(value);
		return parsedValue === undefined ? undefined : Math.max(1, parsedValue);
	}

	private sanitizeScoreboardData(data: Partial<ScoreboardData>): Partial<ScoreboardData> {
		const sanitizedData: Partial<ScoreboardData> = {};
		const teamHomeScore = this.sanitizeNonNegativeInteger(data.teamHomeScore);
		const teamAwayScore = this.sanitizeNonNegativeInteger(data.teamAwayScore);
		const timer = this.sanitizeNonNegativeInteger(data.timer);
		const half = this.sanitizePositiveInteger(data.half);
		const timerLoadout1 = this.sanitizeNonNegativeInteger(data.timerLoadout1);
		const timerLoadout2 = this.sanitizeNonNegativeInteger(data.timerLoadout2);
		const timerLoadout3 = this.sanitizeNonNegativeInteger(data.timerLoadout3);

		if (typeof data.teamHomeName === "string") sanitizedData.teamHomeName = data.teamHomeName;
		if (typeof data.teamAwayName === "string") sanitizedData.teamAwayName = data.teamAwayName;
		if (typeof data.teamHomeColor === "string") sanitizedData.teamHomeColor = data.teamHomeColor;
		if (typeof data.teamAwayColor === "string") sanitizedData.teamAwayColor = data.teamAwayColor;
		if (typeof data.halfPrefix === "string") sanitizedData.halfPrefix = data.halfPrefix;
		if (typeof data.eventLogo === "string") sanitizedData.eventLogo = data.eventLogo;
		if (typeof data.isTimerRunning === "boolean") sanitizedData.isTimerRunning = data.isTimerRunning;
		if (teamHomeScore !== undefined) sanitizedData.teamHomeScore = teamHomeScore;
		if (teamAwayScore !== undefined) sanitizedData.teamAwayScore = teamAwayScore;
		if (timer !== undefined) sanitizedData.timer = timer;
		if (half !== undefined) sanitizedData.half = half;
		if (timerLoadout1 !== undefined) sanitizedData.timerLoadout1 = timerLoadout1;
		if (timerLoadout2 !== undefined) sanitizedData.timerLoadout2 = timerLoadout2;
		if (timerLoadout3 !== undefined) sanitizedData.timerLoadout3 = timerLoadout3;

		return sanitizedData;
	}

	private notifyStateChangedFromExternal(): void {
		this.onStateChangedFromExternal?.(this.getCurrentData());
	}

	private setTimerFromExternal(timer: number): void {
		const sanitizedTimer = this.sanitizeNonNegativeInteger(timer) ?? 0;

		if (this.onTimerCommand) {
			this.onTimerCommand("set", sanitizedTimer);
			return;
		}

		this.updateScoreboardData({ timer: sanitizedTimer });
		this.notifyStateChangedFromExternal();
	}

	private applyExternalScoreboardData(data: Partial<ScoreboardData>): void {
		const sanitizedData = this.sanitizeScoreboardData(data);
		const { timer, ...scoreboardData } = sanitizedData;

		if (Object.keys(scoreboardData).length > 0) {
			this.updateScoreboardData(scoreboardData);
			this.notifyStateChangedFromExternal();
		}

		if (timer !== undefined) {
			this.setTimerFromExternal(timer);
		}
	}

	private handleWSMessage(rawData: RawData): void {
		try {
			const message = JSON.parse(rawData.toString()) as Partial<ScoreboardWSCommand>;
			if (message.type === "command" && typeof message.action === "string") {
				this.handleWSCommand(message.action, message.data);
			}
		} catch (error) {
			console.error("Invalid WebSocket message:", error);
		}
	}

	private handleWSCommand(action: string, data?: Partial<ScoreboardData>): void {
		switch (action) {
			case "update":
				if (data) this.applyExternalScoreboardData(data);
				break;
			case "timer:start":
				if (this.onTimerCommand) this.onTimerCommand("start");
				else if ((this.currentData.timer ?? 0) > 0)
					this.applyExternalScoreboardData({ isTimerRunning: true });
				break;
			case "timer:pause":
				if (this.onTimerCommand) this.onTimerCommand("pause");
				else this.applyExternalScoreboardData({ isTimerRunning: false });
				break;
			case "timer:stop":
				if (this.onTimerCommand) this.onTimerCommand("stop");
				else this.applyExternalScoreboardData({ timer: 0, isTimerRunning: false });
				break;
			case "timer:set": {
				const timer = this.sanitizeNonNegativeInteger(data?.timer);
				if (timer !== undefined) this.setTimerFromExternal(timer);
				break;
			}
			case "timer:inc:second":
				this.setTimerFromExternal((this.currentData.timer ?? 0) + 1);
				break;
			case "timer:dec:second":
				this.setTimerFromExternal((this.currentData.timer ?? 0) - 1);
				break;
			case "timer:inc:minute":
				this.setTimerFromExternal((this.currentData.timer ?? 0) + 60);
				break;
			case "timer:dec:minute":
				this.setTimerFromExternal((this.currentData.timer ?? 0) - 60);
				break;
			case "score:home:inc":
				this.applyExternalScoreboardData({ teamHomeScore: (this.currentData.teamHomeScore ?? 0) + 1 });
				break;
			case "score:home:dec":
				this.applyExternalScoreboardData({
					teamHomeScore: Math.max(0, (this.currentData.teamHomeScore ?? 0) - 1),
				});
				break;
			case "score:away:inc":
				this.applyExternalScoreboardData({ teamAwayScore: (this.currentData.teamAwayScore ?? 0) + 1 });
				break;
			case "score:away:dec":
				this.applyExternalScoreboardData({
					teamAwayScore: Math.max(0, (this.currentData.teamAwayScore ?? 0) - 1),
				});
				break;
			case "buzzer:play":
				this.onBuzzerCommand?.();
				break;
			case "half:inc":
				this.applyExternalScoreboardData({ half: (this.currentData.half ?? 1) + 1 });
				break;
			case "half:dec":
				this.applyExternalScoreboardData({ half: Math.max(1, (this.currentData.half ?? 1) - 1) });
				break;
			case "reset":
				if (this.onTimerCommand) this.onTimerCommand("stop");
				else this.applyExternalScoreboardData({ timer: 0, isTimerRunning: false });
				this.applyExternalScoreboardData({
					teamHomeScore: 0,
					teamAwayScore: 0,
					half: 1,
					isTimerRunning: false,
				});
				break;
			default:
				console.warn("Unknown WebSocket command:", action);
		}
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

	public broadcastTimerFinished(): void {
		const message = JSON.stringify({ event: "timer-finished" });
		this.wss.clients.forEach((client) => {
			if (client.readyState === 1) {
				client.send(message);
			}
		});
	}

	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.server = this.app.listen(this.port, "0.0.0.0", () => {
					console.log(`Scoreboard server running on http://0.0.0.0:${this.port}`);
					console.log(`Scoreboard view: http://localhost:${this.port}/scoreboard`);
					console.log(`Remote control: http://localhost:${this.port}/control`);

					// Set up WebSocket server
					if (this.server) {
						this.wss = new WebSocketServer({ server: this.server });
					}

					this.wss.on("connection", (ws) => {
						console.log("WebSocket client connected");
						// Send current data to new client
						ws.send(JSON.stringify(this.currentData));

						ws.on("message", (rawData) => {
							this.handleWSMessage(rawData);
						});

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
