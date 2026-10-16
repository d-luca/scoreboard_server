import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { useScoreboardStore } from "../../lib/stores/desktopScoreboardStore";
import { hotkeyLabel } from "../../lib/hotkeys";
import { useHotkeys } from "../../lib/hooks/useHotkeys";
import { formatTimer } from "../../lib/format";
import { BellIcon } from "../icons/BellIcon";
import { PlayIcon } from "../icons/PlayIcon";
import { PauseIcon } from "../icons/PauseIcon";

export function TimerControl(): JSX.Element {
	const timer = useScoreboardStore((store) => store.state.timer);
	const timerDirection = useScoreboardStore((store) => store.state.timerDirection);
	const isTimerRunning = useScoreboardStore((store) => store.state.isTimerRunning);
	const startTimer = useScoreboardStore((store) => store.startTimer);
	const pauseTimer = useScoreboardStore((store) => store.pauseTimer);
	const stopTimer = useScoreboardStore((store) => store.stopTimer);
	const adjustTimer = useScoreboardStore((store) => store.adjustTimer);
	const playBuzzer = useScoreboardStore((store) => store.playBuzzer);
	const applyLoadout = useScoreboardStore((store) => store.applyLoadout);
	const timerLoadout1 = useScoreboardStore((store) => store.state.timerLoadout1);
	const timerLoadout2 = useScoreboardStore((store) => store.state.timerLoadout2);
	const timerLoadout3 = useScoreboardStore((store) => store.state.timerLoadout3);
	const hotkeys = useHotkeys();
	const loadouts = [
		{ slot: 1, seconds: timerLoadout1, hotkey: hotkeyLabel(hotkeys.timerLoadout1) },
		{ slot: 2, seconds: timerLoadout2, hotkey: hotkeyLabel(hotkeys.timerLoadout2) },
		{ slot: 3, seconds: timerLoadout3, hotkey: hotkeyLabel(hotkeys.timerLoadout3) },
	] as const;

	const handleToggleTimer = (): void => {
		if (isTimerRunning) {
			void pauseTimer();
		} else {
			void startTimer();
		}
	};

	// Start and Reset are disabled when the timer is at 0 and not running
	// [PARITY] — countdown only; count-up can always start
	// from 0 (the Rust engine has no zero guard for the up direction).
	const startResetDisabled = !isTimerRunning && timer === 0 && timerDirection !== "up";

	const startPauseHotkey = hotkeyLabel(isTimerRunning ? hotkeys.pauseTimer : hotkeys.startTimer);
	const stopHotkey = hotkeyLabel(hotkeys.stopTimer);
	const decreaseSecondHotkey = hotkeyLabel(hotkeys.decreaseTimerSecond);
	const decreaseMinuteHotkey = hotkeyLabel(hotkeys.decreaseTimerMinute);
	const increaseSecondHotkey = hotkeyLabel(hotkeys.increaseTimerSecond);
	const increaseMinuteHotkey = hotkeyLabel(hotkeys.increaseTimerMinute);

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
				<div className="grid size-full min-w-0 grid-cols-3 grid-rows-4 gap-4">
					<Button
						className="col-span-3 flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
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

					<div className="col-span-2 row-span-3 grid grid-cols-2 grid-rows-3 gap-4">
						<Button
							variant="destructive"
							className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
							onClick={() => void adjustTimer(-1)}
							title={`Hotkey: ${decreaseSecondHotkey}`}
						>
							-1s
							<HotkeyBadge hotkey={decreaseSecondHotkey} />
						</Button>
						<Button
							className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
							onClick={() => void adjustTimer(1)}
							title={`Hotkey: ${increaseSecondHotkey}`}
						>
							+1s
							<HotkeyBadge hotkey={increaseSecondHotkey} />
						</Button>
						<Button
							variant="destructive"
							className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
							onClick={() => void adjustTimer(-60)}
							title={`Hotkey: ${decreaseMinuteHotkey}`}
						>
							-1m
							<HotkeyBadge hotkey={decreaseMinuteHotkey} />
						</Button>
						<Button
							className="flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
							onClick={() => void adjustTimer(60)}
							title={`Hotkey: ${increaseMinuteHotkey}`}
						>
							+1m
							<HotkeyBadge hotkey={increaseMinuteHotkey} />
						</Button>
						<Button
							variant="destructive"
							className="col-span-2 flex h-full min-h-16 flex-col items-center justify-center text-base xl:text-2xl"
							onClick={() => void stopTimer()}
							disabled={startResetDisabled}
							title={`Hotkey: ${stopHotkey}`}
						>
							Reset Timer
							<HotkeyBadge hotkey={stopHotkey} />
						</Button>
					</div>
					<div className="row-span-3 grid grid-rows-3 gap-4" role="group" aria-label="Timer loadouts">
						{loadouts.map(({ slot, seconds, hotkey }) => (
							<Button
								key={slot}
								variant="outline"
								className="flex h-full min-h-16 flex-col items-center justify-center text-base tabular-nums xl:text-2xl"
								onClick={() => void applyLoadout(slot)}
								aria-label={`Load timer ${slot}: ${formatTimer(seconds)}`}
								title={`Load timer ${slot} (${formatTimer(seconds)}) - Hotkey: ${hotkey}`}
							>
								{formatTimer(seconds)}
								<HotkeyBadge hotkey={hotkey} />
							</Button>
						))}
					</div>
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
