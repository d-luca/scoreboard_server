import { JSX, useEffect } from "react";
import { ScoreboardControl } from "./components/ScoreboardControl";
import { StatusBar } from "./components/StatusBar";
import { useBuzzerStore } from "./lib/stores/buzzerStore";
import { useScoreboardStore } from "./lib/stores/desktopScoreboardStore";
import { useSettingsStore } from "./lib/stores/settingsStore";
import { useWindowStore } from "./lib/stores/windowStore";
import { useLocalHotkeys } from "./lib/hooks/useLocalHotkeys";
import { useBuzzerPlayback } from "./lib/hooks/useBuzzerPlayback";

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

export default App;
