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
	halfPrefix?: string;
	isTimerRunning?: boolean;
};

export function Scoreboard({
	eventLogo,
	teamAwayColor,
	teamAwayName,
	teamHomeColor,
	teamHomeName,
	half,
	halfPrefix,
	teamAwayScore,
	teamHomeScore,
	timer,
}: ScoreboardProps): JSX.Element {
	return (
		<div
			className="flex size-full items-center justify-between overflow-hidden bg-white text-4xl text-indigo-950"
			style={{ transform: "skewX(-15deg)", fontFamily: "Anton" }}
		>
			{eventLogo && <EventLogo />}

			<div
				className="flex w-full flex-col items-center justify-center gap-0"
				style={{ transform: "skewX(15deg)" }}
			>
				<Timer value={timer ?? 0} />
				{/* <div className="flex h-full w-0.5 bg-border-app-primary" /> */}
				<Half value={half ?? 1} prefix={halfPrefix} />
			</div>
			<TeamInfo
				teamAwayName={teamAwayName ?? "T-A"}
				teamAwayScore={teamAwayScore ?? 0}
				teamHomeName={teamHomeName ?? "T-H"}
				teamHomeScore={teamHomeScore ?? 0}
				teamAwayColor={teamAwayColor ?? "#ff0000"}
				teamHomeColor={teamHomeColor ?? "#00ff00"}
			/>
		</div>
	);
}
