import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { useScoreboardStore } from "../../lib/stores/desktop-scoreboard-store";
import { DEFAULT_HOTKEYS, hotkeyLabel } from "../../lib/hotkeys";
import { formatTimer } from "../../lib/format";

export function TimerControl(): JSX.Element {
	const timer = useScoreboardStore((store) => store.state.timer);
	const isTimerRunning = useScoreboardStore((store) => store.state.isTimerRunning);
	const startTimer = useScoreboardStore((store) => store.startTimer);
	const pauseTimer = useScoreboardStore((store) => store.pauseTimer);
	const stopTimer = useScoreboardStore((store) => store.stopTimer);
	const adjustTimer = useScoreboardStore((store) => store.adjustTimer);
	const playBuzzer = useScoreboardStore((store) => store.playBuzzer);

	const handleToggleTimer = (): void => {
		if (isTimerRunning) {
			void pauseTimer();
		} else {
			void startTimer();
		}
	};

	// Start and Reset are disabled when the timer is at 0 and not running
	// [PARITY] (doc 04 §7.2).
	const startResetDisabled = !isTimerRunning && timer === 0;

	const startPauseHotkey = hotkeyLabel(
		isTimerRunning ? DEFAULT_HOTKEYS.pauseTimer : DEFAULT_HOTKEYS.startTimer,
	);
	const stopHotkey = hotkeyLabel(DEFAULT_HOTKEYS.stopTimer);

	return (
		<div className="flex flex-col gap-3">
			{/* Timer value + start/stop */}
			<div className="flex items-center gap-4">
				<div className="flex flex-col">
					<span className="text-app-secondary text-sm font-semibold tracking-wide uppercase">Timer</span>
					<span className="text-app-primary text-4xl font-bold tabular-nums">{formatTimer(timer)}</span>
				</div>

				<div className="flex flex-1 gap-2">
					<Button
						className="flex h-12 flex-1 flex-col items-center justify-center text-base"
						onClick={handleToggleTimer}
						disabled={startResetDisabled}
						title={`Hotkey: ${startPauseHotkey}`}
					>
						{isTimerRunning ? "Pause" : "Start"}
						<HotkeyBadge hotkey={startPauseHotkey} />
					</Button>
					<Button
						variant="destructive"
						className="flex h-12 flex-1 flex-col items-center justify-center text-base"
						onClick={() => void stopTimer()}
						disabled={startResetDisabled}
						title={`Hotkey: ${stopHotkey}`}
					>
						Reset
						<HotkeyBadge hotkey={stopHotkey} />
					</Button>
				</div>
			</div>

			{/* Time adjustments + Buzzer */}
			<div className="grid grid-cols-5 gap-2">
				<Button
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={() => void adjustTimer(1)}
					title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerSecond)}`}
				>
					+1s
					<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerSecond)} />
				</Button>
				<Button
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={() => void adjustTimer(60)}
					title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerMinute)}`}
				>
					+1m
					<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerMinute)} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={() => void adjustTimer(-1)}
					title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerSecond)}`}
				>
					-1s
					<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerSecond)} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={() => void adjustTimer(-60)}
					title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerMinute)}`}
				>
					-1m
					<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerMinute)} />
				</Button>
				<Button
					variant="outline"
					className="flex h-11 flex-col items-center justify-center text-sm"
					onClick={() => void playBuzzer()}
					title="Play buzzer sound"
				>
					Buzzer
				</Button>
			</div>
		</div>
	);
}
