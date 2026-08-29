import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { DEFAULT_HOTKEYS, hotkeyLabel, type HotkeyAction } from "../../lib/hotkeys";

export type TeamControlProps = {
	score: number;
	/** Team name, displayed above the score and tinted with the team colour. */
	name: string;
	color: string;
	teamType: "home" | "away";
	onIncreaseScore: () => void;
	onDecreaseScore: () => void;
	/** Opens Settings on the Scoreboard tab (double-click shortcut). */
	onOpenSettings?: () => void;
};

export function TeamControl({
	score,
	name,
	color,
	teamType,
	onIncreaseScore,
	onDecreaseScore,
	onOpenSettings,
}: TeamControlProps): JSX.Element {
	const increaseAction: HotkeyAction = teamType === "home" ? "increaseHomeScore" : "increaseAwayScore";
	const decreaseAction: HotkeyAction = teamType === "home" ? "decreaseHomeScore" : "decreaseAwayScore";
	const increaseHotkey = hotkeyLabel(DEFAULT_HOTKEYS[increaseAction]);
	const decreaseHotkey = hotkeyLabel(DEFAULT_HOTKEYS[decreaseAction]);

	return (
		<div className="border-app-primary flex min-w-0 flex-1 flex-col items-center gap-4 px-4 first:border-r">
			<button
				type="button"
				onDoubleClick={onOpenSettings}
				title="Double-click to edit in Settings"
				className="cursor-text text-base font-semibold tracking-wide uppercase"
				style={{ color }}
			>
				{name}
			</button>
			<span className="text-app-primary text-center text-5xl font-bold tabular-nums xl:text-6xl 2xl:text-7xl">
				{score}
			</span>
			<div className="mt-3 flex min-h-0 w-full flex-1 gap-4">
				<Button
					variant="destructive"
					className="flex h-full min-h-16 w-32 min-w-16 flex-1 flex-col items-center justify-center text-base xl:text-2xl"
					onClick={onDecreaseScore}
					title={`Hotkey: ${decreaseHotkey}`}
				>
					-1
					<HotkeyBadge hotkey={decreaseHotkey} />
				</Button>
				<Button
					className="flex h-full min-h-16 w-32 min-w-16 flex-1 flex-col items-center justify-center text-base xl:text-2xl"
					onClick={onIncreaseScore}
					title={`Hotkey: ${increaseHotkey}`}
				>
					+1
					<HotkeyBadge hotkey={increaseHotkey} />
				</Button>
			</div>
		</div>
	);
}
