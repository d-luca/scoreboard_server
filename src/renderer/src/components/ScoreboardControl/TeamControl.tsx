import { JSX } from "react";

import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";
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
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={score} title={title} />

			{/* Score Controls */}
			<div className="flex size-full flex-col gap-2">
				<Button
					className="flex size-full flex-col items-center justify-center"
					onClick={onIncreaseScore}
					title={`Hotkey: ${getHotkeyString(increaseAction)}`}
				>
					+1
					<HotkeyBadge hotkey={getHotkeyString(increaseAction)} />
				</Button>
				<Button
					variant="destructive"
					className="flex size-full w-full flex-col items-center justify-center"
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
