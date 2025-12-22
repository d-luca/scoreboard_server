import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useScoreboardStore } from "./stores/scoreboardStore";
import "./global.css";
import { ScoreboardOverlayControl } from "./components/ScoreboardControl";

export function OverlayControl(): React.JSX.Element {
	const store = useScoreboardStore();

	useEffect(() => {
		// Load current scoreboard data from server when overlay opens
		const loadInitialData = async (): Promise<void> => {
			try {
				const currentData = await window.api.getScoreboardData();
				store.updateScoreboardDataFromExternal(currentData);
			} catch (error) {
				console.error("Failed to load initial scoreboard data:", error);
			}
		};

		void loadInitialData();

		// Listen for scoreboard data updates (timer state changes will come from main window)
		const unsubscribeData = window.api.onScoreboardDataUpdate((data) => {
			store.updateScoreboardDataFromExternal(data);
		});

		return () => {
			unsubscribeData();
		};
	}, [store]);

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
				<ScoreboardOverlayControl />
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<OverlayControl />
	</React.StrictMode>,
);
