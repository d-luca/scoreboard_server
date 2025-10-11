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
		<Card className="flex h-1/2 w-full flex-col gap-4 overflow-hidden">
			<CardTitle>Scoreboard Controls</CardTitle>

			<CardContent className="flex size-full flex-col justify-between gap-4 overflow-auto">
				<div className="flex w-full justify-between gap-4">
					<TeamControl
						score={store.teamHomeScore ?? 0}
						title="Home"
						teamType="home"
						onDecreaseScore={store.decreaseTeamHomeScore}
						onIncreaseScore={store.increaseTeamHomeScore}
					/>
					<TeamControl
						score={store.teamAwayScore ?? 0}
						title="Away"
						teamType="away"
						onDecreaseScore={store.decreaseTeamAwayScore}
						onIncreaseScore={store.increaseTeamAwayScore}
					/>
					<TimerControl />
					<HalfControl />
				</div>

				<div className="grid w-full grid-cols-3 gap-2" aria-label="Timer loadout shortcuts">
					{timerLoadoutButtons.map(({ label, value }, index) => (
						<Button
							key={label}
							variant="outline"
							className="flex flex-col items-center justify-center py-2 whitespace-nowrap"
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

				<Button
					variant="destructive"
					className="flex w-full flex-col items-center justify-center py-2"
					onClick={() => {
						void store.reset();
					}}
					title={`Hotkey: ${getHotkeyString("resetScoreboard")}`}
				>
					Reset Scoreboard
					<HotkeyBadge hotkey={getHotkeyString("resetScoreboard")} />
				</Button>
			</CardContent>
		</Card>
	);
}
