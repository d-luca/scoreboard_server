import type { Action } from "../bindings/Action";
import type { ScoreboardState } from "../bindings/ScoreboardState";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";
export type TransportEvent = "timer-finished" | "buzzer";

export interface Transport {
	getState(): Promise<ScoreboardState>;
	dispatch(action: Action): Promise<void>;
	subscribe(callback: (state: ScoreboardState) => void): () => void;
	onEvent(name: TransportEvent, callback: () => void): () => void;
	readonly status: ConnectionStatus;
}
