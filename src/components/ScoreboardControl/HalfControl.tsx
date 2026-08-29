import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { useScoreboardStore } from "../../lib/stores/desktopScoreboardStore";
import { DEFAULT_HOTKEYS, hotkeyLabel } from "../../lib/hotkeys";

export function HalfControl(): JSX.Element {
	const half = useScoreboardStore((store) => store.state.half);
	const incHalf = useScoreboardStore((store) => store.incHalf);
	const decHalf = useScoreboardStore((store) => store.decHalf);

	const increaseHotkey = hotkeyLabel(DEFAULT_HOTKEYS.increaseHalf);
	const decreaseHotkey = hotkeyLabel(DEFAULT_HOTKEYS.decreaseHalf);

	return (
		<div className="flex w-full min-w-0 flex-col items-center gap-4 px-4">
			<div className="flex flex-col justify-center">
				<span className="text-app-secondary text-base font-semibold tracking-wide uppercase">Half</span>
				<span className="text-app-primary text-center text-5xl font-bold tabular-nums xl:text-6xl 2xl:text-7xl">
					{half}
				</span>
			</div>
			<div className="mt-3 flex h-full w-full gap-4">
				<Button
					variant="destructive"
					className="flex h-full min-h-16 w-32 min-w-16 flex-1 flex-col items-center justify-center text-base xl:text-2xl"
					onClick={() => void decHalf()}
					title={`Hotkey: ${decreaseHotkey}`}
				>
					-1
					<HotkeyBadge hotkey={decreaseHotkey} />
				</Button>
				<Button
					className="flex h-full min-h-16 w-32 min-w-16 flex-1 flex-col items-center justify-center text-base xl:text-2xl"
					onClick={() => void incHalf()}
					title={`Hotkey: ${increaseHotkey}`}
				>
					+1
					<HotkeyBadge hotkey={increaseHotkey} />
				</Button>
			</div>
		</div>
	);
}
