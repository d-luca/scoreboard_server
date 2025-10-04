import { useEffect } from "react";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useHotkeyStore, matchesHotkey, type HotkeyAction } from "@renderer/stores/hotkeyStore";

export function useKeyboardControls(): void {
	const scoreboardStore = useScoreboardStore();
	const { hotkeys, enabled } = useHotkeyStore();

	useEffect(() => {
		if (!enabled) return;

		const handleKeyDown = (event: KeyboardEvent): void => {
			// Don't trigger hotkeys when user is typing in an input field
			const target = event.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
				return;
			}

			// Check each hotkey mapping
			const actionMap: Record<HotkeyAction, () => void> = {
				increaseHomeScore: () => scoreboardStore.increaseTeamHomeScore(),
				decreaseHomeScore: () => scoreboardStore.decreaseTeamHomeScore(),
				increaseAwayScore: () => scoreboardStore.increaseTeamAwayScore(),
				decreaseAwayScore: () => scoreboardStore.decreaseTeamAwayScore(),
				increaseHalf: () => scoreboardStore.increaseHalf(),
				decreaseHalf: () => scoreboardStore.decreaseHalf(),
				startTimer: () => scoreboardStore.startTimer(),
				pauseTimer: () => scoreboardStore.pauseTimer(),
				stopTimer: () => scoreboardStore.stopTimer(),
				increaseTimerSecond: () => scoreboardStore.increaseTimerByOneSecond(),
				decreaseTimerSecond: () => scoreboardStore.decreaseTimerByOneSecond(),
				increaseTimerMinute: () => scoreboardStore.increaseTimerByOneMinute(),
				decreaseTimerMinute: () => scoreboardStore.decreaseTimerByOneMinute(),
				timerLoadout1: () => {
					const value = scoreboardStore.timerLoadout1;
					if (value !== undefined && value >= 0) {
						void scoreboardStore.setTimer(value);
					}
				},
				timerLoadout2: () => {
					const value = scoreboardStore.timerLoadout2;
					if (value !== undefined && value >= 0) {
						void scoreboardStore.setTimer(value);
					}
				},
				timerLoadout3: () => {
					const value = scoreboardStore.timerLoadout3;
					if (value !== undefined && value >= 0) {
						void scoreboardStore.setTimer(value);
					}
				},
				resetScoreboard: () => scoreboardStore.reset(),
			};

			// Find matching action
			for (const [action, callback] of Object.entries(actionMap)) {
				const mapping = hotkeys[action as HotkeyAction];
				if (mapping && matchesHotkey(event, mapping)) {
					event.preventDefault();
					callback();
					break;
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [hotkeys, enabled, scoreboardStore]);
}
