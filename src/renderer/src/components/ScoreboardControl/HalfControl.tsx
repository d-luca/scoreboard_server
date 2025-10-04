import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";

export function HalfControl(): JSX.Element {
	const store = useScoreboardStore();
	const { getHotkeyString } = useHotkeyStore();

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={store.half ?? 1} title="Half" />
			<div className="flex size-full gap-2">
				<Button
					className="flex size-full flex-col items-center justify-center"
					onClick={store.increaseHalf}
					title={`Hotkey: ${getHotkeyString("increaseHalf")}`}
				>
					+1
					<HotkeyBadge hotkey={getHotkeyString("increaseHalf")} />
				</Button>
				<Button
					variant="destructive"
					className="flex size-full flex-col items-center justify-center"
					onClick={store.decreaseHalf}
					title={`Hotkey: ${getHotkeyString("decreaseHalf")}`}
				>
					-1
					<HotkeyBadge hotkey={getHotkeyString("decreaseHalf")} />
				</Button>
			</div>
		</div>
	);
}
