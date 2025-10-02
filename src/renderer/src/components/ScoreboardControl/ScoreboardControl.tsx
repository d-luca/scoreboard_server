import { JSX } from "react";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { TeamControl } from "./TeamControl";
import { TimerControl } from "./TimerControl";
import { HalfControl } from "./HalfControl";
import { CardTitle } from "../ui/Card/CardTitle";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { Button } from "../ui/Button/Button";

export function ScoreboardControl(): JSX.Element {
	const store = useScoreboardStore();

	const timerLoadoutButtons = [
		{ label: "Loadout 1", value: store.timerLoadout1 ?? 0 },
		{ label: "Loadout 2", value: store.timerLoadout2 ?? 0 },
		{ label: "Loadout 3", value: store.timerLoadout3 ?? 0 },
	];

	// const isTimerLoadoutAvailable = timerLoadoutButtons.some((button) => button.value > 0);

	return (
		<Card className="flex flex-col gap-4">
			<CardTitle>Scoreboard Controls</CardTitle>
			<CardContent className="flex flex-col gap-4">
				<div className="flex justify-between gap-4">
					<TeamControl
						score={store.teamHomeScore ?? 0}
						title="Home"
						onDecreaseScore={store.decreaseTeamHomeScore}
						onIncreaseScore={store.increaseTeamHomeScore}
					/>
					<TeamControl
						score={store.teamAwayScore ?? 0}
						title="Away"
						onDecreaseScore={store.decreaseTeamAwayScore}
						onIncreaseScore={store.increaseTeamAwayScore}
					/>
					<TimerControl />
					<HalfControl />
				</div>

				<div className="grid grid-cols-3 gap-2" aria-label="Timer loadout shortcuts">
					{timerLoadoutButtons.map(({ label, value }) => (
						<Button
							key={label}
							variant="outline"
							// disabled={!isTimerLoadoutAvailable}
							className="whitespace-nowrap"
							onClick={() => {
								if (value >= 0) {
									void store.setTimer(value);
								}
							}}
						>
							{label}
						</Button>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
