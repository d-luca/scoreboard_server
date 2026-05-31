import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";

export function HalfControl(): JSX.Element {
	const store = useScoreboardStore();
	const { getHotkeyString } = useHotkeyStore();

	return (
		<div className="flex min-w-0 flex-col items-center justify-center gap-2 px-4 py-4">
			<span className="text-app-secondary text-base font-semibold tracking-wide uppercase">Half</span>
			<span className="text-app-primary text-7xl font-bold tabular-nums">{store.half ?? 1}</span>
			<div className="mt-3 flex w-full gap-2">
				<Button
					className="flex h-16 flex-1 flex-col items-center justify-center text-xl"
					onClick={store.increaseHalf}
					title={`Hotkey: ${getHotkeyString("increaseHalf")}`}
				>
					+1
					<HotkeyBadge hotkey={getHotkeyString("increaseHalf")} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-16 flex-1 flex-col items-center justify-center text-xl"
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
