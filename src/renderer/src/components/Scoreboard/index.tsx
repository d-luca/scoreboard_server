import { TeamsData } from "@renderer/types/teamsForm";
import { EventLogo } from "./EventLogo";
import { Half } from "./Half";
import { TeamInfo } from "./TeamInfo";
import { Timer } from "./Timer";
import { JSX } from "react";

export type ScoreboardProps = TeamsData & {
	eventLogo?: string;
	teamHomeScore?: number;
	teamAwayScore?: number;
	timer?: number;
	half?: number;
};

export function Scoreboard({
	eventLogo,
	teamAwayColor,
	teamAwayName,
	teamHomeColor,
	teamHomeName,
	teamHomeScore = 0,
	teamAwayScore = 0,
	timer = 0,
	half = 1,
}: ScoreboardProps): JSX.Element {
	return (
		<div className="top-2 left-2 flex size-full items-center justify-between overflow-hidden rounded-md border-2 border-gray-800 bg-indigo-950 px-3 text-xl font-medium text-gray-200">
			{eventLogo && <EventLogo />}
			<TeamInfo
				teamAwayName={teamAwayName ?? "T-A"}
				teamAwayScore={teamAwayScore}
				teamHomeName={teamHomeName ?? "T-H"}
				teamHomeScore={teamHomeScore}
				teamAwayColor={teamAwayColor ?? "#ff0000"}
				teamHomeColor={teamHomeColor ?? "#00ff00"}
			/>
			<div className="flex h-full w-full justify-between gap-1 pl-2">
				<Timer value={timer} />
				{/* <div className="flex h-full w-0.5 bg-border-app-primary" /> */}
				<Half value={half} />
			</div>
		</div>
	);
}
