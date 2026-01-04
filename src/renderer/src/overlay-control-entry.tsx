import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useScoreboardStore } from "./stores/scoreboardStore";
import { useOverlayTimer } from "./hooks/useOverlayTimer";
import "./global.css";
import { ScoreboardOverlayControl } from "./components/ScoreboardControl";

export function OverlayControl(): React.JSX.Element {
	const store = useScoreboardStore();
	const overlayTimer = useOverlayTimer();

	useEffect(() => {
		// Load current scoreboard data from server when overlay opens
		// Wait for this to complete before signaling ready to receive timer control
		const loadInitialData = async (): Promise<void> => {
			try {
				const currentData = await window.api.getScoreboardData();
				store.updateScoreboardDataFromExternal(currentData);
			} catch (error) {
				console.error("Failed to load initial scoreboard data:", error);
			}
			// Signal ready AFTER initial data is loaded
			// This ensures timer handoff won't be overwritten by initial data
			window.api.signalOverlayReady();
		};

		void loadInitialData();

		// Listen for global hotkey actions - overlay handles timer actions when open
		const unsubscribeHotkey = window.api.onGlobalHotkeyAction((action: string) => {
			switch (action) {
				case "startTimer":
					overlayTimer.startTimer();
					break;
				case "pauseTimer":
					overlayTimer.pauseTimer();
					break;
				case "stopTimer":
					overlayTimer.stopTimer();
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

		// Listen for scoreboard data updates
		const unsubscribeData = window.api.onScoreboardDataUpdate((data) => {
			store.updateScoreboardDataFromExternal(data);
		});

		// Listen for timer control receive (when main window surrenders control)
		const unsubscribeReceive = window.api.onReceiveTimerControl((state) => {
			console.log("Overlay receiving timer control:", state);
			store.receiveTimerControl(state);
		});

		// Handle window close - surrender timer control back to main window
		const handleBeforeUnload = (): void => {
			// Stop the worker timer first
			overlayTimer.pauseTimer();
			const timerState = store.surrenderTimerControl();
			console.log("Overlay surrendering timer before close:", timerState);
			window.api.surrenderTimerBeforeClose(timerState);
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			unsubscribeHotkey();
			unsubscribeData();
			unsubscribeReceive();
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [store, overlayTimer]);

	return (
		<div className="flex h-screen w-screen flex-col">
			{/* Draggable title bar */}
			<div
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
				className="flex h-8 w-full cursor-move items-center justify-center bg-gray-800/90 backdrop-blur-sm"
			>
				<span className="text-xs font-semibold text-white/80">🎮 Control Panel - Drag to move</span>
			</div>
			{/* Content area */}
			<div className="flex flex-1 items-start justify-center p-2">
				<ScoreboardOverlayControl
					timerControls={{
						startTimer: overlayTimer.startTimer,
						pauseTimer: overlayTimer.pauseTimer,
						stopTimer: overlayTimer.stopTimer,
					}}
				/>
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<OverlayControl />
	</React.StrictMode>,
);
