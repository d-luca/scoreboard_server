import { useBuzzerStore } from "@/lib/stores/buzzer-store";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { tauriTransport } from "@/lib/tauri-transport";
import { useEffect } from "react";

/**
 * Desktop buzzer playback (doc 03 §3.4): the `main` webview decides based on
 * the persisted `buzzerAutoPlay` setting. `buzzer:play` (manual presses from
 * the desktop or the phone remote) always plays; `timer:finished` plays only
 * when auto-play is on.
 */
export function useBuzzerPlayback(): void {
	const play = useBuzzerStore((store) => store.play);

	useEffect(() => {
		const stopBuzzer = tauriTransport.onEvent("buzzer", play);
		const stopTimerFinished = tauriTransport.onEvent("timer-finished", () => {
			if (useSettingsStore.getState().settings?.buzzerAutoPlay ?? true) play();
		});
		return () => {
			stopBuzzer();
			stopTimerFinished();
		};
	}, [play]);
}
