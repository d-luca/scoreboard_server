import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { HotkeyBadge } from "../ui/HotkeyBadge";
import { TeamControl } from "./TeamControl";
import { HalfControl } from "./HalfControl";
import { TimerControl } from "./TimerControl";
import { useScoreboardStore } from "../../lib/stores/desktopScoreboardStore";
import { useWindowStore } from "../../lib/stores/windowStore";
import { DEFAULT_HOTKEYS, hotkeyLabel } from "../../lib/hotkeys";

/**
 * The match-operation control surface (doc 04 §7.2). No `Card` chrome — the
 * window *is* the card (doc 04 §7.1). Single column, fills the window.
 */
export function ScoreboardControl(): JSX.Element {
	const state = useScoreboardStore((store) => store.state);
	const incHome = useScoreboardStore((store) => store.incHome);
	const decHome = useScoreboardStore((store) => store.decHome);
	const incAway = useScoreboardStore((store) => store.incAway);
	const decAway = useScoreboardStore((store) => store.decAway);
	const reset = useScoreboardStore((store) => store.reset);
	const openWindow = useWindowStore((store) => store.openWindow);

	const openSettings = (): void => {
		void openWindow("settings");
	};

	return (
		<div className="flex size-full flex-col gap-4">
			{/* Score & Half row */}
			<div className="border-app-primary flex h-full items-stretch border-b py-4 pt-0 2xl:max-h-1/3">
				<TeamControl
					score={state.teamHomeScore}
					name={state.teamHomeName}
					color={state.teamHomeColor}
					teamType="home"
					onIncreaseScore={() => void incHome()}
					onDecreaseScore={() => void decHome()}
					onOpenSettings={openSettings}
				/>

				<TeamControl
					score={state.teamAwayScore}
					name={state.teamAwayName}
					color={state.teamAwayColor}
					teamType="away"
					onIncreaseScore={() => void incAway()}
					onDecreaseScore={() => void decAway()}
					onOpenSettings={openSettings}
				/>
			</div>

			{/* Timer section */}
			<div className="border-app-primary flex h-full border-b py-4 pt-0">
				<TimerControl />
				<div className="border-app-primary flex max-w-96 flex-1 border-l">
					<HalfControl />
				</div>
			</div>

			{/* Reset */}
			<div className="p-3 pt-0">
				<Button
					variant="destructive"
					className="flex h-16 w-full flex-col items-center justify-center text-base xl:text-2xl"
					onClick={() => void reset()}
					title={`Hotkey: ${hotkeyLabel(DEFAULT_HOTKEYS.resetScoreboard)}`}
				>
					Reset Scoreboard
					<HotkeyBadge hotkey={hotkeyLabel(DEFAULT_HOTKEYS.resetScoreboard)} />
				</Button>
			</div>
		</div>
	);
}
