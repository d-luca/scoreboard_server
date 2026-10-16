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

/**
 * The score-roll toggle. Transports that do not receive it (the Tauri
 * transport pre-settings, test fakes) leave the animation on — the
 * setting's default.
 */
interface ScoreAnimationAwareTransport extends StatusAwareTransport {
	onScoreAnimation?(callback: (enabled: boolean) => void): () => void;
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
	timerDirection: "down",
	timerLoadout1: 900,
	timerLoadout2: 2700,
	timerLoadout3: 1200,
	revision: 0,
};

export interface ScoreboardStore {
	state: ScoreboardState;
	/** Score-roll presentation toggle (`Settings.scoreAnimationEnabled`). */
	scoreAnimation: boolean;
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
	transport: ScoreAnimationAwareTransport,
	confirmTimerChange: (
		message: string,
		action: "timer-loadout" | "timer-stop",
	) => boolean | Promise<boolean> = (message) => window.confirm(message),
): UseBoundStore<StoreApi<ScoreboardStore>> {
	let unsubscribe: (() => void) | undefined;
	let unsubscribeStatus: (() => void) | undefined;
	let unsubscribeAuthorization: (() => void) | undefined;
	let unsubscribeScoreAnimation: (() => void) | undefined;
	let timerChangePending = false;

	return create<ScoreboardStore>((set, get) => {
		const acceptState = (next: ScoreboardState): void => {
			set(({ state }) => (next.revision >= state.revision ? { state: next } : {}));
		};

		return {
			state: initialState,
			// `true` = on (the setting's default); the callback delivered on
			// subscription corrects it when the page starts with it off.
			scoreAnimation: true,
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
					unsubscribeScoreAnimation ??= transport.onScoreAnimation?.((enabled) =>
						set({ scoreAnimation: enabled }),
					);
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
				const timerAction =
					action.action === "timer-loadout" || action.action === "timer-stop" ? action.action : null;
				if (timerAction !== null && timerChangePending) return;
				const requiresConfirmation = timerAction !== null && get().state.isTimerRunning;
				if (requiresConfirmation) timerChangePending = true;
				set({ error: null });
				try {
					if (
						requiresConfirmation &&
						!(await confirmTimerChange(
							timerAction === "timer-stop"
								? "The timer is running. Resetting it will stop it and set the time to 00:00. Continue?"
								: "The timer is running. Loading a preset will pause it and replace the current time. Continue?",
							timerAction,
						))
					) {
						return;
					}
					await transport.dispatch(action);
				} catch (error) {
					set({ error: error instanceof Error ? error.message : String(error) });
					throw error;
				} finally {
					if (requiresConfirmation) timerChangePending = false;
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
