import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { useScoreboardStore } from "../../lib/scoreboard-store";
import { DEFAULT_HOTKEYS, hotkeyLabel } from "../../lib/hotkeys";

export function HalfControl(): JSX.Element {
	const half = useScoreboardStore((store) => store.state.half);
	const incHalf = useScoreboardStore((store) => store.incHalf);
	const decHalf = useScoreboardStore((store) => store.decHalf);

	const increaseHotkey = hotkeyLabel(DEFAULT_HOTKEYS.increaseHalf);
	const decreaseHotkey = hotkeyLabel(DEFAULT_HOTKEYS.decreaseHalf);

	return (
		<div className="flex min-w-0 flex-col items-center justify-center gap-2 px-4 py-4">
			<span className="text-app-secondary text-base font-semibold tracking-wide uppercase">Half</span>
			<span className="text-app-primary text-7xl font-bold tabular-nums">{half}</span>
			<div className="mt-3 flex w-full gap-2">
				<Button
					className="flex h-16 flex-1 flex-col items-center justify-center text-xl"
					onClick={() => void incHalf()}
					title={`Hotkey: ${increaseHotkey}`}
				>
					+1
					<HotkeyBadge hotkey={increaseHotkey} />
				</Button>
				<Button
					variant="destructive"
					className="flex h-16 flex-1 flex-col items-center justify-center text-xl"
					onClick={() => void decHalf()}
					title={`Hotkey: ${decreaseHotkey}`}
				>
					-1
					<HotkeyBadge hotkey={decreaseHotkey} />
				</Button>
			</div>
		</div>
	);
}
