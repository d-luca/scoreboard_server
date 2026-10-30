import type { Action } from "../bindings/Action";
import type { PublishedLayoutSnapshot } from "../bindings/PublishedLayoutSnapshot";
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
	/** Resolves with the current complete publication (waits for the first one if none is known yet). */
	getPublishedLayout(): Promise<PublishedLayoutSnapshot>;
	/**
	 * Delivers the current publication (if known) and every newer one, in
	 * session/revision order. `onError` reports protocol or read failures;
	 * the last valid publication is retained.
	 */
	subscribePublishedLayout(
		callback: (snapshot: PublishedLayoutSnapshot) => void,
		onError?: (error: Error) => void,
	): () => void;
	readonly status: ConnectionStatus;
}
