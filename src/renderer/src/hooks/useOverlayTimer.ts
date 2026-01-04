import { useCallback } from "react";
import { useScoreboardStore } from "../stores/scoreboardStore";

/**
 * Custom hook for overlay timer using main process timer
 * The timer runs in the main (Node.js) process which is never throttled
 */
export function useOverlayTimer(): {
	startTimer: () => void;
	pauseTimer: () => void;
	stopTimer: () => void;
	isRunning: boolean;
} {
	const store = useScoreboardStore();

	const startTimer = useCallback(() => {
		window.api.mainTimerStart();
	}, []);

	const pauseTimer = useCallback(() => {
		window.api.mainTimerPause();
	}, []);

	const stopTimer = useCallback(() => {
		window.api.mainTimerStop();
	}, []);

	return {
		startTimer,
		pauseTimer,
		stopTimer,
		isRunning: store.timerRunning ?? false,
	};
}
