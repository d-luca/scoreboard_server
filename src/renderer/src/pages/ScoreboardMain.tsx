import { ScoreboardControl } from "@renderer/components/ScoreboardControl/ScoreboardControl";
import { JSX, useEffect } from "react";
import { ScoreboardFeedback } from "@renderer/components/ScoreboardFeedback/ScoreboardFeedback";
import { CameraFeedback } from "@renderer/components/CameraFeedback/CameraFeedback";
import { ScoreboardSettings } from "@renderer/components/ScoreboardSettings";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useKeyboardControls } from "@renderer/hooks/useKeyboardControls";

export function ScoreboardMain(): JSX.Element {
	const store = useScoreboardStore();

	// Enable keyboard controls
	useKeyboardControls();

	useEffect(() => {
		// Load current scoreboard data from server when window opens
		const loadInitialData = async (): Promise<void> => {
			try {
				const currentData = await window.api.getScoreboardData();
				store.updateScoreboardDataFromExternal(currentData);
			} catch (error) {
				console.error("Failed to load initial scoreboard data:", error);
			}
		};

		void loadInitialData();

		// Listen for scoreboard data updates from other windows
		const unsubscribe = window.api.onScoreboardDataUpdate((data) => {
			store.updateScoreboardDataFromExternal(data);
		});

		return () => unsubscribe();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="flex size-full gap-4">
			<div className="flex h-full w-2/3 flex-col gap-4">
				<ScoreboardFeedback />
				<CameraFeedback />
			</div>
			<div className="flex h-full w-1/3 flex-col gap-4 overflow-hidden">
				<ScoreboardControl />
				<ScoreboardSettings />
			</div>
		</div>
	);
}
