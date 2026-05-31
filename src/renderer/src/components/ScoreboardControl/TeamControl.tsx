import { JSX } from "react";

import { Button } from "../ui/Button/Button";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";

export type TeamControlProps = {
	score: number;
	title: string;
	onIncreaseScore?: () => void;
	onDecreaseScore?: () => void;
	teamType: "home" | "away";
};

export function TeamControl({
	score = 0,
	title,
	onDecreaseScore,
	onIncreaseScore,
	teamType,
}: TeamControlProps): JSX.Element {
	const { getHotkeyString } = useHotkeyStore();
	const increaseAction = teamType === "home" ? "increaseHomeScore" : "increaseAwayScore";
	const decreaseAction = teamType === "home" ? "decreaseHomeScore" : "decreaseAwayScore";

	return (
		<div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-4">
			<span className="text-app-secondary text-base font-semibold tracking-wide uppercase">{title}</span>
			<span className="text-app-primary text-7xl font-bold tabular-nums">{score}</span>
			<div className="mt-3 flex w-full gap-2">
				<Button
					className="flex h-16 flex-1 flex-col items-center justify-center text-xl"
					onClick={onIncreaseScore}
					title={`Hotkey: ${getHotkeyString(increaseAction)}`}
				>
					+1
					<HotkeyBadge hotkey={getHotkeyString(increaseAction)} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-16 flex-1 flex-col items-center justify-center text-xl"
					onClick={onDecreaseScore}
					title={`Hotkey: ${getHotkeyString(decreaseAction)}`}
				>
					-1
					<HotkeyBadge hotkey={getHotkeyString(decreaseAction)} />
				</Button>
			</div>
		</div>
	);
}
