import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ScoreboardControl } from "./components/ScoreboardControl/ScoreboardControl";
import { useScoreboardStore } from "./stores/scoreboardStore";
import "./global.css";

export function OverlayControl(): React.JSX.Element {
	const store = useScoreboardStore();

	useEffect(() => {
		// Listen for global hotkey actions from main process
		const unsubscribeHotkey = window.api.onGlobalHotkeyAction((action: string) => {
			switch (action) {
				case "startTimer":
					store.startTimer();
					break;
				case "pauseTimer":
					store.pauseTimer();
					break;
				case "stopTimer":
					store.stopTimer();
					break;
				case "timerLoadout1":
					if (store.timerLoadout1 !== undefined && store.timerLoadout1 >= 0) {
						void store.setTimer(store.timerLoadout1);
					}
					break;
				case "timerLoadout2":
					if (store.timerLoadout2 !== undefined && store.timerLoadout2 >= 0) {
						void store.setTimer(store.timerLoadout2);
					}
					break;
				case "timerLoadout3":
					if (store.timerLoadout3 !== undefined && store.timerLoadout3 >= 0) {
						void store.setTimer(store.timerLoadout3);
					}
					break;
			}
		});

		// Listen for scoreboard data updates from global hotkeys
		const unsubscribeData = window.api.onScoreboardDataUpdate((data) => {
			store.updateScoreboardDataFromExternal(data);
		});

		return () => {
			unsubscribeHotkey();
			unsubscribeData();
		};
	}, [store]);

	return (
		<div className="flex h-screen w-screen flex-col bg-transparent">
			{/* Draggable title bar */}
			<div
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
				className="flex h-8 w-full cursor-move items-center justify-center bg-black/20 backdrop-blur-sm"
			>
				<span className="text-xs font-semibold text-white/60">🎮 Control Panel - Drag to move</span>
			</div>
			{/* Content area */}
			<div className="flex flex-1 items-center justify-center p-4">
				<ScoreboardControl />
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<OverlayControl />
	</React.StrictMode>,
);
