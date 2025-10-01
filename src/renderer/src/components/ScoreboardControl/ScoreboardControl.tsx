import { JSX } from "react";
import { Card } from "../ui/Card/Card";
import { CardContent } from "../ui/Card/CardContent";
import { TeamControl } from "./TeamControl";
import { TimerControl } from "./TimerControl";
import { HalfControl } from "./HalfControl";
import { useScoreboardData } from "../../hooks/useScoreboardData";
import { CardTitle } from "../ui/Card/CardTitle";

export function ScoreboardControl(): JSX.Element {
	const {
		scoreboardData,
		updateTeamScore,
		updateTeamName,
		updateTeamColor,
		updateTimer,
		updateHalf,
		isLoading,
		error,
	} = useScoreboardData();

	if (isLoading) {
		return (
			<Card>
				<CardContent className="flex h-64 items-center justify-center">
					<div>Loading scoreboard data...</div>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="flex h-64 items-center justify-center">
					<div className="text-red-500">Error: {error}</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="flex flex-col gap-4">
			<CardTitle>Scoreboard Controls</CardTitle>
			<CardContent className="flex flex-col gap-4">
				<div className="flex justify-between gap-4">
					<TeamControl
						score={scoreboardData.teamHomeScore}
						title="Home"
						teamName={scoreboardData.teamHomeName}
						teamColor={scoreboardData.teamHomeColor}
						onScoreChange={(score) => updateTeamScore("home", score)}
						onNameChange={(name) => updateTeamName("home", name)}
						onColorChange={(color) => updateTeamColor("home", color)}
					/>
					<TeamControl
						score={scoreboardData.teamAwayScore}
						title="Away"
						teamName={scoreboardData.teamAwayName}
						teamColor={scoreboardData.teamAwayColor}
						onScoreChange={(score) => updateTeamScore("away", score)}
						onNameChange={(name) => updateTeamName("away", name)}
						onColorChange={(color) => updateTeamColor("away", color)}
					/>
					<TimerControl time={scoreboardData.timer} onTimeChange={updateTimer} />
					<HalfControl half={scoreboardData.half} onHalfChange={updateHalf} />
				</div>
			</CardContent>
		</Card>
	);
}
