import type { Action } from "../bindings/Action";
import type { ScoreboardState } from "../bindings/ScoreboardState";
import type { ConnectionStatus, Transport, TransportEvent } from "./transport";

/**
 * Reconnecting WebSocket client for the LAN pages (`/scoreboard`,
 * `/control`, `/value/:property`) — tauri-rebuild doc 02 §4.3.
 *
 * Exponential backoff (250 ms → 5 s, jittered), a full-state resync on
 * every open, and an `onStatus` callback driving the connection indicator.
 * The server sends full states, so resync is just "wait for the next
 * frame".
 */

const BACKOFF_MIN_MS = 250;
const BACKOFF_MAX_MS = 5000;

type StateCallback = (state: ScoreboardState) => void;
type StatusCallback = (status: ConnectionStatus) => void;
type EventCallback = () => void;

export class WsTransport implements Transport {
	private socket: WebSocket | null = null;
	private stateCallbacks = new Set<StateCallback>();
	private statusCallbacks = new Set<StatusCallback>();
	private eventCallbacks = new Map<TransportEvent, Set<EventCallback>>();
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private closed = false;
	private currentStatus: ConnectionStatus = "connecting";

	constructor(private readonly url: string) {
		this.open();
	}

	get status(): ConnectionStatus {
		return this.currentStatus;
	}

	getState(): Promise<ScoreboardState> {
		// The server pushes a full state frame on connect and after every
		// mutation; REST is the fallback for a cold read.
		return fetch("/api/scoreboard").then((response) => {
			if (!response.ok) throw new Error(`GET /api/scoreboard failed: ${response.status}`);
			return response.json() as Promise<ScoreboardState>;
		});
	}

	dispatch(action: Action): Promise<void> {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error("not connected"));
		}
		socket.send(JSON.stringify({ type: "command", ...action }));
		return Promise.resolve();
	}

	subscribe(callback: StateCallback): () => void {
		this.stateCallbacks.add(callback);
		return () => this.stateCallbacks.delete(callback);
	}

	onStatus(callback: StatusCallback): () => void {
		this.statusCallbacks.add(callback);
		callback(this.currentStatus);
		return () => this.statusCallbacks.delete(callback);
	}

	onEvent(name: TransportEvent, callback: EventCallback): () => void {
		let callbacks = this.eventCallbacks.get(name);
		if (!callbacks) {
			callbacks = new Set();
			this.eventCallbacks.set(name, callbacks);
		}
		callbacks.add(callback);
		return () => callbacks.delete(callback);
	}

	/** Stop reconnecting and close the socket (page unload, tests). */
	close(): void {
		this.closed = true;
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.socket?.close();
		this.socket = null;
	}

	private open(): void {
		if (this.closed) return;
		this.setStatus("connecting");
		const socket = new WebSocket(this.url);
		this.socket = socket;

		socket.onopen = () => {
			this.reconnectAttempts = 0;
			this.setStatus("connected");
		};
		socket.onmessage = (message: MessageEvent<string>) => {
			this.handleFrame(message.data);
		};
		socket.onclose = () => {
			this.socket = null;
			if (this.closed) return;
			this.setStatus("disconnected");
			this.scheduleReconnect();
		};
		socket.onerror = () => {
			// `onclose` follows and handles the reconnect.
		};
	}

	private scheduleReconnect(): void {
		const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.reconnectAttempts);
		this.reconnectAttempts += 1;
		// Full jitter (AWS-style): spreads a reconnect storm after a server
		// restart so the app is not hammered by every OBS source at once.
		const delay = Math.floor(Math.random() * backoff);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.open();
		}, delay);
	}

	private handleFrame(raw: string): void {
		let frame: { type?: string; data?: ScoreboardState; event?: string };
		try {
			frame = JSON.parse(raw) as typeof frame;
		} catch {
			return;
		}
		if (frame.type === "state" && frame.data) {
			for (const callback of this.stateCallbacks) callback(frame.data);
		} else if (frame.type === "event" && (frame.event === "timer-finished" || frame.event === "buzzer")) {
			for (const callback of this.eventCallbacks.get(frame.event) ?? []) callback();
		}
	}

	private setStatus(status: ConnectionStatus): void {
		if (status === this.currentStatus) return;
		this.currentStatus = status;
		for (const callback of this.statusCallbacks) callback(status);
	}
}
