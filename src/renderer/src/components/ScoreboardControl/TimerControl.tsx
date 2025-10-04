import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";

export function TimerControl(): JSX.Element {
	const store = useScoreboardStore();
	const { getHotkeyString } = useHotkeyStore();

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
					className="flex w-full flex-col items-center justify-center p-0 px-2"
					onClick={handleToggleTimer}
					disabled={!store.timerRunning && timerValue === 0}
					size="lg"
					title={
						store.timerRunning
							? `Hotkey: ${getHotkeyString("pauseTimer")}`
							: `Hotkey: ${getHotkeyString("startTimer")}`
					}
				>
					{store.timerRunning ? "Pause" : "Start"}
					<HotkeyBadge
						hotkey={store.timerRunning ? getHotkeyString("pauseTimer") : getHotkeyString("startTimer")}
					/>
				</Button>
				<Button
					variant="destructive"
					className="flex w-full flex-col items-center justify-center p-0 px-2"
					onClick={store.stopTimer}
					disabled={!store.timerRunning && (store.timer ?? 0) === 0}
					title={`Hotkey: ${getHotkeyString("stopTimer")}`}
					size="lg"
				>
					Stop
					<HotkeyBadge hotkey={getHotkeyString("stopTimer")} />
				</Button>
			</div>

			{/* Time Adjustment Controls */}
			<div className="flex w-full flex-col gap-2">
				<div className="flex w-full gap-2">
					<Button
						className="flex w-full flex-col items-center justify-center p-0 px-2"
						onClick={store.increaseTimerByOneSecond}
						title={`Hotkey: ${getHotkeyString("increaseTimerSecond")}`}
						size="lg"
					>
						+1s
						<HotkeyBadge hotkey={getHotkeyString("increaseTimerSecond")} />
					</Button>
					<Button
						variant="destructive"
						className="flex w-full flex-col items-center justify-center p-0 px-2"
						onClick={store.decreaseTimerByOneSecond}
						title={`Hotkey: ${getHotkeyString("decreaseTimerSecond")}`}
						size="lg"
					>
						-1s
						<HotkeyBadge hotkey={getHotkeyString("decreaseTimerSecond")} />
					</Button>
				</div>
				<div className="flex w-full gap-2">
					<Button
						className="flex w-full flex-col items-center justify-center p-0 px-2"
						onClick={store.increaseTimerByOneMinute}
						title={`Hotkey: ${getHotkeyString("increaseTimerMinute")}`}
						size="lg"
					>
						+1m
						<HotkeyBadge hotkey={getHotkeyString("increaseTimerMinute")} />
					</Button>
					<Button
						variant="destructive"
						className="flex w-full flex-col items-center justify-center p-0 px-2"
						onClick={store.decreaseTimerByOneMinute}
						title={`Hotkey: ${getHotkeyString("decreaseTimerMinute")}`}
						size="lg"
					>
						-1m
						<HotkeyBadge hotkey={getHotkeyString("decreaseTimerMinute")} />
					</Button>
				</div>
			</div>
		</div>
	);
}
