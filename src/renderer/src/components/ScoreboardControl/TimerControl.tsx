import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";

export function TimerControl(): JSX.Element {
	const store = useScoreboardStore();

	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const timerValue = store.timer ?? 0;
	const handleToggleTimer = (): void => {
		if (store.timerRunning) {
			store.pauseTimer();
		} else {
			store.startTimer();
		}
	};

	// const timerStatus = store.timerRunning
	// 	? { label: "Running", color: "bg-green-500" }
	// 	: timerValue > 0
	// 		? { label: "Paused", color: "bg-yellow-500" }
	// 		: { label: "Stopped", color: "bg-gray-400" };

	return (
		<div className="flex flex-col items-center gap-4">
			<div className="relative">
				<ValueBox value={formatTime(store.timer ?? 0)} title="Timer" />
			</div>
			{/* <div className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
				<span className={`h-2.5 w-2.5 rounded-full ${timerStatus.color}`} aria-hidden="true" />
				<span>{timerStatus.label}</span>
			</div> */}

			<div className="flex w-full gap-2">
				<Button
					className="w-full"
					onClick={handleToggleTimer}
					disabled={!store.timerRunning && timerValue === 0}
				>
					{store.timerRunning ? "Pause" : "Start"}
				</Button>
				<Button
					variant="destructive"
					className="w-full"
					onClick={store.stopTimer}
					disabled={!store.timerRunning && (store.timer ?? 0) === 0}
				>
					Stop
				</Button>
			</div>

			{/* Time Adjustment Controls */}
			<div className="flex w-full flex-col gap-2">
				<div className="flex w-full gap-2">
					<Button className="w-full" onClick={store.increaseTimerByOneSecond}>
						+1s
					</Button>
					<Button variant="destructive" className="w-full" onClick={store.decreaseTimerByOneSecond}>
						-1s
					</Button>
				</div>
				<div className="flex w-full gap-2">
					<Button className="w-full" onClick={store.increaseTimerByOneMinute}>
						+1m
					</Button>
					<Button variant="destructive" className="w-full" onClick={store.decreaseTimerByOneMinute}>
						-1m
					</Button>
				</div>
			</div>
		</div>
	);
}
