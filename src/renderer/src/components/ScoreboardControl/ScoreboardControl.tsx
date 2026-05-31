import { JSX } from "react";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { TeamControl } from "./TeamControl";
import { TimerControl } from "./TimerControl";
import { HalfControl } from "./HalfControl";
import { CardTitle } from "../ui/Card/CardTitle";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { Button } from "../ui/Button/Button";
import { useHotkeyStore } from "@renderer/stores/hotkeyStore";
import { HotkeyBadge } from "../ui/HotkeyBadge";

export function ScoreboardControl(): JSX.Element {
	const store = useScoreboardStore();
	const { getHotkeyString } = useHotkeyStore();

	const timerLoadoutButtons = [
		{ label: "Loadout 1", value: store.timerLoadout1 ?? 0 },
		{ label: "Loadout 2", value: store.timerLoadout2 ?? 0 },
		{ label: "Loadout 3", value: store.timerLoadout3 ?? 0 },
	];

	return (
		<Card className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
			<CardTitle>Scoreboard Controls</CardTitle>

			<CardContent className="flex size-full flex-col justify-between overflow-x-hidden overflow-y-auto">
				{/* Score & Half row */}
				<div className="border-app-primary flex items-stretch border-b">
					<TeamControl
						score={store.teamHomeScore ?? 0}
						title="Home"
						teamType="home"
						onDecreaseScore={store.decreaseTeamHomeScore}
						onIncreaseScore={store.increaseTeamHomeScore}
					/>
					<div className="border-app-primary flex border-x">
						<HalfControl />
					</div>
					<TeamControl
						score={store.teamAwayScore ?? 0}
						title="Away"
						teamType="away"
						onDecreaseScore={store.decreaseTeamAwayScore}
						onIncreaseScore={store.increaseTeamAwayScore}
					/>
				</div>

				{/* Timer section */}
				<div className="border-app-primary border-b p-4">
					<TimerControl />
				</div>

				{/* Timer loadouts + Reset */}
				<div className="grid grid-cols-3 gap-2 p-3" aria-label="Timer loadout shortcuts">
					{timerLoadoutButtons.map(({ label, value }, index) => (
						<Button
							key={label}
							variant="outline"
							className="flex h-11 flex-col items-center justify-center text-sm whitespace-nowrap"
							onClick={() => {
								if (value >= 0) {
									void store.setTimer(value);
								}
							}}
							title={`Hotkey: ${getHotkeyString(`timerLoadout${(index + 1) as 1 | 2 | 3}`)}`}
						>
							{label}
							<HotkeyBadge hotkey={getHotkeyString(`timerLoadout${(index + 1) as 1 | 2 | 3}`)} />
						</Button>
					))}
				</div>

				<div className="mt-auto p-3 pt-0">
					<Button
						variant="destructive"
						className="flex h-12 w-full flex-col items-center justify-center text-base"
						onClick={() => {
							void store.reset();
						}}
						title={`Hotkey: ${getHotkeyString("resetScoreboard")}`}
					>
						Reset Scoreboard
						<HotkeyBadge hotkey={getHotkeyString("resetScoreboard")} />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
