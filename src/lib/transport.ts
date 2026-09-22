import type { Action } from "../bindings/Action";
import type { ScoreboardState } from "../bindings/ScoreboardState";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
export type AuthorizationStatus = "unknown" | "authorized" | "unauthorized";
export type TransportEvent = "timer-finished" | "buzzer";

export interface Transport {
	getState(): Promise<ScoreboardState>;
	dispatch(action: Action): Promise<void>;
	subscribe(callback: (state: ScoreboardState) => void): () => void;
	onEvent(name: TransportEvent, callback: () => void): () => void;
	/**
	 * Optional: the score-roll presentation flag. The server sends it once,
	 * when the setting is turned off (on is the default, so re-enabling needs
	 * no frame — the page already knows).
	 */
	onScoreAnimation?(callback: (enabled: boolean) => void): () => void;
	readonly status: ConnectionStatus;
}
