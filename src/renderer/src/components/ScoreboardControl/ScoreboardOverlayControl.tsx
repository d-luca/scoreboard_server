import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";

export function ScoreboardOverlayControl(): JSX.Element {
	const store = useScoreboardStore();
	const { getHotkeyString } = useHotkeyStore();

	const timerValue = store.timer ?? 0;
	const handleToggleTimer = (): void => {
		if (store.timerRunning) {
			store.pauseTimer();
		} else {
			store.startTimer();
		}
	};

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-gray-900 p-3 shadow-2xl backdrop-blur-md">
			{/* Main controls layout - 5 columns */}
			<div className="grid grid-cols-5 gap-2">
				{/* Column 1: Home Team Controls */}
				<div className="flex flex-col gap-1">
					<div className="mb-1 text-center text-xs font-medium text-white/70">Home</div>
					<Button
						className="flex flex-col items-center justify-center px-2 py-2"
						onClick={store.increaseTeamHomeScore}
						title={`Hotkey: ${getHotkeyString("increaseHomeScore")}`}
						size="sm"
					>
						+1
						<HotkeyBadge hotkey={getHotkeyString("increaseHomeScore")} />
					</Button>
					<Button
						variant="destructive"
						className="flex flex-col items-center justify-center px-2 py-2"
						onClick={store.decreaseTeamHomeScore}
						title={`Hotkey: ${getHotkeyString("decreaseHomeScore")}`}
						size="sm"
					>
						-1
						<HotkeyBadge hotkey={getHotkeyString("decreaseHomeScore")} />
					</Button>
					{/* Loadout 1 */}
					<Button
						variant="outline"
						className="flex flex-col items-center justify-center px-1 py-1"
						onClick={() => {
							if ((store.timerLoadout1 ?? 0) >= 0) {
								void store.setTimer(store.timerLoadout1 ?? 0);
							}
						}}
						title={`Hotkey: ${getHotkeyString("timerLoadout1")}`}
						size="sm"
					>
						L1
						<HotkeyBadge hotkey={getHotkeyString("timerLoadout1")} />
					</Button>
				</div>

				{/* Column 2: Away Team Controls */}
				<div className="flex flex-col gap-1">
					<div className="mb-1 text-center text-xs font-medium text-white/70">Away</div>
					<Button
						className="flex flex-col items-center justify-center px-2 py-2"
						onClick={store.increaseTeamAwayScore}
						title={`Hotkey: ${getHotkeyString("increaseAwayScore")}`}
						size="sm"
					>
						+1
						<HotkeyBadge hotkey={getHotkeyString("increaseAwayScore")} />
					</Button>
					<Button
						variant="destructive"
						className="flex flex-col items-center justify-center px-2 py-2"
						onClick={store.decreaseTeamAwayScore}
						title={`Hotkey: ${getHotkeyString("decreaseAwayScore")}`}
						size="sm"
					>
						-1
						<HotkeyBadge hotkey={getHotkeyString("decreaseAwayScore")} />
					</Button>
					{/* Loadout 2 */}
					<Button
						variant="outline"
						className="flex flex-col items-center justify-center px-1 py-1"
						onClick={() => {
							if ((store.timerLoadout2 ?? 0) >= 0) {
								void store.setTimer(store.timerLoadout2 ?? 0);
							}
						}}
						title={`Hotkey: ${getHotkeyString("timerLoadout2")}`}
						size="sm"
					>
						L2
						<HotkeyBadge hotkey={getHotkeyString("timerLoadout2")} />
					</Button>
				</div>

				{/* Column 3: Half Controls */}
				<div className="flex flex-col gap-1">
					<div className="mb-1 text-center text-xs font-medium text-white/70">Half</div>
					<Button
						className="flex flex-col items-center justify-center px-2 py-2"
						onClick={store.increaseHalf}
						title={`Hotkey: ${getHotkeyString("increaseHalf")}`}
						size="sm"
					>
						+1
						<HotkeyBadge hotkey={getHotkeyString("increaseHalf")} />
					</Button>
					<Button
						variant="destructive"
						className="flex flex-col items-center justify-center px-2 py-2"
						onClick={store.decreaseHalf}
						title={`Hotkey: ${getHotkeyString("decreaseHalf")}`}
						size="sm"
					>
						-1
						<HotkeyBadge hotkey={getHotkeyString("decreaseHalf")} />
					</Button>
					{/* Loadout 3 */}
					<Button
						variant="outline"
						className="flex flex-col items-center justify-center px-1 py-1"
						onClick={() => {
							if ((store.timerLoadout3 ?? 0) >= 0) {
								void store.setTimer(store.timerLoadout3 ?? 0);
							}
						}}
						title={`Hotkey: ${getHotkeyString("timerLoadout3")}`}
						size="sm"
					>
						L3
						<HotkeyBadge hotkey={getHotkeyString("timerLoadout3")} />
					</Button>
				</div>

				{/* Column 4: Timer Action Controls */}
				<div className="flex flex-col gap-1">
					<div className="mb-1 text-center text-xs font-medium text-white/70">Timer Action</div>
					{/* Start/Pause Button */}
					<Button
						className="flex flex-col items-center justify-center px-1 py-2"
						onClick={handleToggleTimer}
						disabled={!store.timerRunning && timerValue === 0}
						size="sm"
						title={
							store.timerRunning
								? `Hotkey: ${getHotkeyString("pauseTimer")}`
								: `Hotkey: ${getHotkeyString("startTimer")}`
						}
					>
						{store.timerRunning ? "⏸" : "▶"}
						<HotkeyBadge
							hotkey={store.timerRunning ? getHotkeyString("pauseTimer") : getHotkeyString("startTimer")}
						/>
					</Button>
					{/* Stop Button */}
					<Button
						variant="destructive"
						className="flex flex-col items-center justify-center px-1 py-2"
						onClick={store.stopTimer}
						disabled={!store.timerRunning && (store.timer ?? 0) === 0}
						title={`Hotkey: ${getHotkeyString("stopTimer")}`}
						size="sm"
					>
						⏹
						<HotkeyBadge hotkey={getHotkeyString("stopTimer")} />
					</Button>
					<Button
						variant="destructive"
						className="flex flex-col items-center justify-center px-1 py-1"
						onClick={store.decreaseTimerByOneMinute}
						title={`Hotkey: ${getHotkeyString("decreaseTimerMinute")}`}
						size="sm"
					>
						-1m
						<HotkeyBadge hotkey={getHotkeyString("decreaseTimerMinute")} />
					</Button>
				</div>

				{/* Column 5: Timer Value Controls */}
				<div className="flex flex-col gap-1">
					<div className="mb-1 text-center text-xs font-medium text-white/70">Timer Value</div>
					<Button
						className="flex flex-col items-center justify-center px-1 py-1"
						onClick={store.increaseTimerByOneSecond}
						title={`Hotkey: ${getHotkeyString("increaseTimerSecond")}`}
						size="sm"
					>
						+1s
						<HotkeyBadge hotkey={getHotkeyString("increaseTimerSecond")} />
					</Button>
					<Button
						variant="destructive"
						className="flex flex-col items-center justify-center px-1 py-1"
						onClick={store.decreaseTimerByOneSecond}
						title={`Hotkey: ${getHotkeyString("decreaseTimerSecond")}`}
						size="sm"
					>
						-1s
						<HotkeyBadge hotkey={getHotkeyString("decreaseTimerSecond")} />
					</Button>
					<Button
						className="flex flex-col items-center justify-center px-1 py-1"
						onClick={store.increaseTimerByOneMinute}
						title={`Hotkey: ${getHotkeyString("increaseTimerMinute")}`}
						size="sm"
					>
						+1m
						<HotkeyBadge hotkey={getHotkeyString("increaseTimerMinute")} />
					</Button>
				</div>
			</div>
		</div>
	);
}
