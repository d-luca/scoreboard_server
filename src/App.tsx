import { JSX, useEffect } from "react";
import { ScoreboardControl } from "./components/ScoreboardControl";
import { StatusBar } from "./components/StatusBar";
import { useScoreboardStore } from "./lib/desktop-scoreboard-store";
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

	useEffect(() => {
		void connect();
		void refreshWindows();
	}, [connect, refreshWindows]);

	useLocalHotkeys();

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
