import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { useBuzzerStore } from "@renderer/stores/buzzerStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { formatTime } from "@renderer/utils/formatTime";

export function TimerControl(): JSX.Element {
	const store = useScoreboardStore();
	const { getHotkeyString } = useHotkeyStore();
	const { buzzerEnabled, toggleBuzzer, playBuzzer } = useBuzzerStore();

	const timerValue = store.timer ?? 0;
	const handleToggleTimer = (): void => {
		if (store.timerRunning) {
			store.pauseTimer();
		} else {
			store.startTimer();
		}
	};

	return (
		<div className="flex flex-col gap-3">
			{/* Timer value + start/stop */}
			<div className="flex items-center gap-4">
				<div className="flex flex-col">
					<span className="text-app-secondary text-sm font-semibold tracking-wide uppercase">Timer</span>
					<span className="text-app-primary text-4xl font-bold tabular-nums">
						{formatTime(store.timer ?? 0)}
					</span>
				</div>

				<div className="flex flex-1 gap-2">
					<Button
						className="flex h-12 flex-1 flex-col items-center justify-center text-base"
						onClick={handleToggleTimer}
						disabled={!store.timerRunning && timerValue === 0}
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
						className="flex h-12 flex-1 flex-col items-center justify-center text-base"
						onClick={store.stopTimer}
						disabled={!store.timerRunning && (store.timer ?? 0) === 0}
						title={`Hotkey: ${getHotkeyString("stopTimer")}`}
					>
						Reset
						<HotkeyBadge hotkey={getHotkeyString("stopTimer")} />
					</Button>
				</div>
			</div>

			{/* Time adjustments + Buzzer */}
			<div className="grid grid-cols-6 gap-2">
				<Button
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={store.increaseTimerByOneSecond}
					title={`Hotkey: ${getHotkeyString("increaseTimerSecond")}`}
				>
					+1s
					<HotkeyBadge hotkey={getHotkeyString("increaseTimerSecond")} />
				</Button>
				<Button
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={store.increaseTimerByOneMinute}
					title={`Hotkey: ${getHotkeyString("increaseTimerMinute")}`}
				>
					+1m
					<HotkeyBadge hotkey={getHotkeyString("increaseTimerMinute")} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={store.decreaseTimerByOneSecond}
					title={`Hotkey: ${getHotkeyString("decreaseTimerSecond")}`}
				>
					-1s
					<HotkeyBadge hotkey={getHotkeyString("decreaseTimerSecond")} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={store.decreaseTimerByOneMinute}
					title={`Hotkey: ${getHotkeyString("decreaseTimerMinute")}`}
				>
					-1m
					<HotkeyBadge hotkey={getHotkeyString("decreaseTimerMinute")} />
				</Button>
				<Button
					variant="outline"
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={playBuzzer}
					title="Play buzzer sound"
				>
					Buzzer
				</Button>
				<Button
					variant={buzzerEnabled ? "default" : "outline"}
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={toggleBuzzer}
					title="Auto-buzzer when timer ends"
				>
					Auto: {buzzerEnabled ? "ON" : "OFF"}
				</Button>
			</div>
		</div>
	);
}
