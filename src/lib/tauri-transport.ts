import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Action } from "../bindings/Action";
import type { ScoreboardState } from "../bindings/ScoreboardState";
import type { Transport, TransportEvent } from "./transport";

function subscribeToEvent<T>(event: string, callback: (payload: T) => void): () => void {
	let active = true;
	let unlisten: UnlistenFn | undefined;

	void listen<T>(event, ({ payload }) => callback(payload))
		.then((stopListening) => {
			if (active) {
				unlisten = stopListening;
			} else {
				stopListening();
			}
		})
		.catch(() => undefined);

	return () => {
		active = false;
		unlisten?.();
	};
}

export class TauriTransport implements Transport {
	readonly status = "connected" as const;

	getState(): Promise<ScoreboardState> {
		return invoke<ScoreboardState>("sb_get_state");
	}

	async dispatch(action: Action): Promise<void> {
		await invoke<ScoreboardState>("sb_dispatch", { action });
	}

	subscribe(callback: (state: ScoreboardState) => void): () => void {
		let active = true;
		let unlisten: UnlistenFn | undefined;

		void listen<ScoreboardState>("state:changed", ({ payload }) => callback(payload))
			.then(async (stopListening) => {
				if (!active) {
					stopListening();
					return;
				}
				unlisten = stopListening;
				const current = await this.getState();
				if (active) callback(current);
			})
			.catch(() => undefined);

		return () => {
			active = false;
			unlisten?.();
		};
	}

	onEvent(name: TransportEvent, callback: () => void): () => void {
		const event = name === "timer-finished" ? "timer:finished" : "buzzer:play";
		return subscribeToEvent<void>(event, callback);
	}
}

export const tauriTransport = new TauriTransport();
