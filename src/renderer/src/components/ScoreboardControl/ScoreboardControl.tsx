import { JSX } from "react";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { TeamControl } from "./TeamControl";
import { TimerControl } from "./TimerControl";
import { HalfControl } from "./HalfControl";
import { CardTitle } from "../ui/Card/CardTitle";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";

export function ScoreboardControl(): JSX.Element {
	const store = useScoreboardStore();

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
			</CardContent>
		</Card>
	);
}
