import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { Action } from "../../bindings/Action";
import type { ScoreboardPatch } from "../../bindings/ScoreboardPatch";
import type { ScoreboardState } from "../../bindings/ScoreboardState";
import type { AuthorizationStatus, ConnectionStatus, Transport } from "../transport";

/** Optional live status feeds implemented by reconnecting transports. */
interface StatusAwareTransport extends Transport {
	readonly authorization?: AuthorizationStatus;
	onStatus?(callback: (status: ConnectionStatus) => void): () => void;
	onAuthorization?(callback: (status: AuthorizationStatus) => void): () => void;
}

const initialState: ScoreboardState = {
	teamHomeName: "HOME",
	teamAwayName: "AWAY",
	teamHomeScore: 0,
	teamAwayScore: 0,
	teamHomeColor: "#00ff00",
	teamAwayColor: "#ff0000",
	timer: 0,
	half: 1,
	halfPrefix: "PERIODO",
	eventLogo: null,
	isTimerRunning: false,
	timerLoadout1: 900,
	timerLoadout2: 2700,
	timerLoadout3: 1200,
	revision: 0,
};

export interface ScoreboardStore {
	state: ScoreboardState;
	connection: ConnectionStatus;
	authorization: AuthorizationStatus;
	error: string | null;
	connect(): Promise<void>;
	dispatch(action: Action): Promise<void>;
	incHome(): Promise<void>;
	decHome(): Promise<void>;
	incAway(): Promise<void>;
	decAway(): Promise<void>;
	incHalf(): Promise<void>;
	decHalf(): Promise<void>;
	startTimer(): Promise<void>;
	pauseTimer(): Promise<void>;
	stopTimer(): Promise<void>;
	adjustTimer(delta: number): Promise<void>;
	setTimer(seconds: number): Promise<void>;
	applyLoadout(slot: 1 | 2 | 3): Promise<void>;
	patch(patch: ScoreboardPatch): Promise<void>;
	playBuzzer(): Promise<void>;
	reset(): Promise<void>;
}

export function createScoreboardStore(
	transport: StatusAwareTransport,
): UseBoundStore<StoreApi<ScoreboardStore>> {
	let unsubscribe: (() => void) | undefined;
	let unsubscribeStatus: (() => void) | undefined;
	let unsubscribeAuthorization: (() => void) | undefined;

	return create<ScoreboardStore>((set, get) => {
		const acceptState = (next: ScoreboardState): void => {
			set(({ state }) => (next.revision >= state.revision ? { state: next } : {}));
		};

		return {
			state: initialState,
			connection: "connecting",
			authorization: transport.authorization ?? "authorized",
			error: null,
			connect: async () => {
				try {
					unsubscribe ??= transport.subscribe(acceptState);
					// Live connection status (WS reconnects, drops) when the
					// transport provides it; the Tauri transport is always
					// "connected" and never calls back.
					unsubscribeStatus ??= transport.onStatus?.((status) => set({ connection: status }));
					unsubscribeAuthorization ??= transport.onAuthorization?.((authorization) => set({ authorization }));
					acceptState(await transport.getState());
					set({ connection: transport.status, error: null });
				} catch (error) {
					set({
						connection: "disconnected",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			},
			dispatch: async (action) => {
				set({ error: null });
				try {
					await transport.dispatch(action);
				} catch (error) {
					set({ error: error instanceof Error ? error.message : String(error) });
					throw error;
				}
			},
			incHome: () => get().dispatch({ action: "score-home-inc" }),
			decHome: () => get().dispatch({ action: "score-home-dec" }),
			incAway: () => get().dispatch({ action: "score-away-inc" }),
			decAway: () => get().dispatch({ action: "score-away-dec" }),
			incHalf: () => get().dispatch({ action: "half-inc" }),
			decHalf: () => get().dispatch({ action: "half-dec" }),
			startTimer: () => get().dispatch({ action: "timer-start" }),
			pauseTimer: () => get().dispatch({ action: "timer-pause" }),
			stopTimer: () => get().dispatch({ action: "timer-stop" }),
			adjustTimer: (delta) => get().dispatch({ action: "timer-adjust", data: { delta } }),
			setTimer: (seconds) => get().dispatch({ action: "timer-set", data: { seconds } }),
			applyLoadout: (slot) => get().dispatch({ action: "timer-loadout", data: { slot } }),
			patch: (patch) => get().dispatch({ action: "patch", data: patch }),
			playBuzzer: () => get().dispatch({ action: "buzzer-play" }),
			reset: () => get().dispatch({ action: "reset" }),
		};
	});
}
