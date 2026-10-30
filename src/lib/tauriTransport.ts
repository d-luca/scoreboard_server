import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Settings } from "../bindings/Settings";
import type { Action } from "../bindings/Action";
import type { LayoutLibrarySnapshot } from "../bindings/LayoutLibrarySnapshot";
import type { PublishedLayoutSnapshot } from "../bindings/PublishedLayoutSnapshot";
import type { ScoreboardState } from "../bindings/ScoreboardState";
import { PublishedLayoutTracker } from "./layouts/publication";
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

	/**
	 * The LAN pages get a dedicated frame; desktop windows learn it from the
	 * `settings:changed` broadcast (the same source of truth as the Settings
	 * store). The initial subscription also reports the current value so a
	 * window opened with the toggle off starts static.
	 */
	onScoreAnimation(callback: (enabled: boolean) => void): () => void {
		const unlisten = subscribeToEvent<Settings>("settings:changed", (settings) => {
			callback(settings.scoreAnimationEnabled);
		});
		void invoke<Settings>("settings_get").then((settings) => callback(settings.scoreAnimationEnabled));
		return unlisten;
	}

	async getPublishedLayout(): Promise<PublishedLayoutSnapshot> {
		return (await invoke<LayoutLibrarySnapshot>("layouts_get")).published;
	}

	/** Listens before reading so a concurrent Apply cannot fall between the two. */
	subscribePublishedLayout(
		callback: (snapshot: PublishedLayoutSnapshot) => void,
		onError?: (error: Error) => void,
	): () => void {
		let active = true;
		let unlisten: UnlistenFn | undefined;
		const tracker = new PublishedLayoutTracker();
		const deliver = (snapshot: PublishedLayoutSnapshot, baseline: boolean): void => {
			if (active && tracker.accept(snapshot, baseline)) callback(snapshot);
		};
		const fail = (error: unknown): void => {
			if (active) onError?.(error instanceof Error ? error : new Error(String(error)));
		};

		void listen<PublishedLayoutSnapshot>("layouts:published", ({ payload }) => deliver(payload, false))
			.then(async (stopListening) => {
				if (!active) {
					stopListening();
					return;
				}
				unlisten = stopListening;
				deliver(await this.getPublishedLayout(), true);
			})
			.catch(fail);

		return () => {
			active = false;
			unlisten?.();
		};
	}
}

export const tauriTransport = new TauriTransport();
