import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";

export function HalfControl(): JSX.Element {
	const store = useScoreboardStore();
	const { getHotkeyString } = useHotkeyStore();

	return (
		<div className="flex flex-col items-center justify-center gap-1 px-6 py-4">
			<span className="text-app-secondary text-sm font-semibold tracking-wide uppercase">Half</span>
			<span className="text-app-primary text-5xl font-bold tabular-nums">{store.half ?? 1}</span>
			<div className="mt-2 flex gap-2">
				<Button
					className="flex h-12 flex-col items-center justify-center px-6 text-base"
					onClick={store.increaseHalf}
					title={`Hotkey: ${getHotkeyString("increaseHalf")}`}
				>
					+1
					<HotkeyBadge hotkey={getHotkeyString("increaseHalf")} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-12 flex-col items-center justify-center px-6 text-base"
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
