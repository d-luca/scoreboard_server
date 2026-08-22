import { JSX, useEffect } from "react";
import { ScoreboardControl } from "./components/ScoreboardControl";
import { StatusBar } from "./components/StatusBar";
import { useBuzzerStore } from "./lib/buzzer-store";
import { useScoreboardStore } from "./lib/desktop-scoreboard-store";
import { useSettingsStore } from "./lib/settings-store";
import { tauriTransport } from "./lib/tauri-transport";
import { useWindowStore } from "./lib/window-store";
import { useLocalHotkeys } from "./lib/use-local-hotkeys";

/**
 * Main window (doc 04 §7.1): a single-column control surface plus a status
 * bar. No settings card, no preview, no two-column split — everything else
 * opens from the native menu.
 */
function App(): JSX.Element {
	const connect = useScoreboardStore((store) => store.connect);
	const refreshWindows = useWindowStore((store) => store.refresh);
	const refreshSettings = useSettingsStore((store) => store.refresh);
	const refreshBuzzer = useBuzzerStore((store) => store.refresh);

	useEffect(() => {
		void connect();
		void refreshWindows();
		void refreshSettings();
		void refreshBuzzer();
	}, [connect, refreshWindows, refreshSettings, refreshBuzzer]);

	useLocalHotkeys();
	useBuzzerPlayback();

	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden">
			<main className="flex-1 overflow-auto p-4">
				<ScoreboardControl />
			</main>
			<StatusBar />
		</div>
	);
}

/**
 * Desktop buzzer playback (doc 03 §3.4): the `main` webview decides based on
 * the persisted `buzzerAutoPlay` setting. `buzzer:play` (manual presses from
 * the desktop or the phone remote) always plays; `timer:finished` plays only
 * when auto-play is on.
 */
function useBuzzerPlayback(): void {
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

export default App;
