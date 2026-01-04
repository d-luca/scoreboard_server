import { JSX, useEffect } from "react";
import { ScoreboardSettings } from "@renderer/components/ScoreboardSettings";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useKeyboardControls } from "@renderer/hooks/useKeyboardControls";
import { HotkeySettings } from "@renderer/components/HotkeySettings";
import { ScoreboardControl } from "@renderer/components/ScoreboardControl";
import { ScoreboardFeedback } from "@renderer/components/ScoreboardFeedback";
import { RecordingControls } from "@renderer/components/RecordingControls";

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

		// Listen for scoreboard data updates from other windows
		const unsubscribeData = window.api.onScoreboardDataUpdate((data) => {
			store.updateScoreboardDataFromExternal(data);
		});

		// Listen for timer control surrender request (when overlay opens)
		const unsubscribeSurrender = window.api.onSurrenderTimerControl(() => {
			return store.surrenderTimerControl();
		});

		// Listen for timer control receive (when overlay closes)
		const unsubscribeReceive = window.api.onReceiveTimerControl((state) => {
			store.receiveTimerControl(state);
		});

		return () => {
			unsubscribeHotkey();
			unsubscribeData();
			unsubscribeSurrender();
			unsubscribeReceive();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<div className="flex size-full gap-4">
			<div className="flex h-full w-full flex-col gap-4">
				<ScoreboardFeedback />
				<RecordingControls />
				<HotkeySettings />
			</div>
			<div className="flex h-full w-full flex-col gap-4 overflow-hidden">
				<ScoreboardControl />
				<ScoreboardSettings />
			</div>
		</div>
	);
}
