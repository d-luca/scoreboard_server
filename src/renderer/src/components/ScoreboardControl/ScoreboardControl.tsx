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
						teamName={store.teamHomeName}
						teamColor={store.teamHomeColor}
						onScoreChange={(score) => store.setTeamHomeScore(score)}
						onNameChange={(name) => store.setTeamHomeName(name)}
						onColorChange={(color) => store.setTeamHomeColor(color)}
					/>
					<TeamControl
						score={store.teamAwayScore ?? 0}
						title="Away"
						teamName={store.teamAwayName}
						teamColor={store.teamAwayColor}
						onScoreChange={(score) => store.setTeamAwayScore(score)}
						onNameChange={(name) => store.setTeamAwayName(name)}
						onColorChange={(color) => store.setTeamAwayColor(color)}
					/>
					<TimerControl time={store.timer ?? 0} onTimeChange={(time) => store.setTimer(time)} />
					<HalfControl />
				</div>
			</CardContent>
		</Card>
	);
}
