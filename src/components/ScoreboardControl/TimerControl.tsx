import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { useScoreboardStore } from "../../lib/stores/desktopScoreboardStore";
import { DEFAULT_HOTKEYS, hotkeyLabel } from "../../lib/hotkeys";
import { formatTimer } from "../../lib/format";
import { BellIcon } from "../icons/BellIcon";
import { PlayIcon } from "../icons/PlayIcon";
import { PauseIcon } from "../icons/PauseIcon";

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
		<div className="flex w-full flex-col gap-4 px-4">
			{/* Timer value + start/stop */}
			<div className="flex w-full items-center justify-center">
				<div className="flex flex-col">
					<span className="text-app-secondary text-base font-semibold tracking-wide uppercase">Timer</span>
					<span className="text-app-primary text-center text-5xl font-bold tabular-nums xl:text-6xl 2xl:text-7xl">
						{formatTimer(timer)}
					</span>
				</div>
			</div>

			<div className="mt-3 flex h-full gap-4">
				<div className="flex size-full flex-col gap-4">
					<div className="flex items-center gap-4">
						<Button
							className="flex h-full min-h-16 flex-1 flex-col items-center justify-center text-base xl:text-2xl"
							onClick={handleToggleTimer}
							disabled={startResetDisabled}
							title={`Hotkey: ${startPauseHotkey}`}
						>
							<span className="flex items-center gap-2">
								{isTimerRunning ? <PauseIcon className="size-[1em]" /> : <PlayIcon className="size-[1em]" />}
								{isTimerRunning ? "Pause" : "Start"}
							</span>
							<HotkeyBadge hotkey={startPauseHotkey} />
						</Button>
					</div>

					{/* Time adjustments + Buzzer */}
					<div className="flex h-full gap-4">
						<div className="flex w-full flex-col gap-4">
							<Button
								variant="destructive"
								className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
								onClick={() => void adjustTimer(-1)}
								title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerSecond)}`}
							>
								-1s
								<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerSecond)} />
							</Button>
							<Button
								variant="destructive"
								className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
								onClick={() => void adjustTimer(-60)}
								title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerMinute)}`}
							>
								-1m
								<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.decreaseTimerMinute)} />
							</Button>
						</div>

						<div className="flex w-full flex-col gap-4">
							<Button
								className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
								onClick={() => void adjustTimer(1)}
								title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerSecond)}`}
							>
								+1s
								<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerSecond)} />
							</Button>
							<Button
								className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
								onClick={() => void adjustTimer(60)}
								title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerMinute)}`}
							>
								+1m
								<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.increaseTimerMinute)} />
							</Button>
						</div>
					</div>
					<Button
						variant="destructive"
						className="flex h-full min-h-16 flex-1 flex-col items-center justify-center text-base xl:text-2xl"
						onClick={() => void stopTimer()}
						disabled={startResetDisabled}
						title={`Hotkey: ${stopHotkey}`}
					>
						Reset Timer
						<HotkeyBadge hotkey={stopHotkey} />
					</Button>
				</div>
				<Button
					variant="outline"
					className="flex h-full min-w-32 flex-col items-center justify-center text-base"
					onClick={() => void playBuzzer()}
					title="Play buzzer sound"
				>
					<BellIcon className="size-8" />
					Buzzer
				</Button>
			</div>
		</div>
	);
}
