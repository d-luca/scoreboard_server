import { TeamsData } from "@renderer/types/teamsForm";
import { EventLogo } from "./EventLogo";
import { Half } from "./Half";
import { TeamInfo } from "./TeamInfo";
import { Timer } from "./Timer";
import { JSX } from "react";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";

export type ScoreboardProps = TeamsData & {
	eventLogo?: string;
	teamHomeScore?: number;
	teamAwayScore?: number;
	timer?: number;
	half?: number;
};

export function Scoreboard({ eventLogo }: ScoreboardProps): JSX.Element {
	const store = useScoreboardStore();
	console.log({ store });
	return (
		<div className="top-2 left-2 flex size-full items-center justify-between overflow-hidden rounded-md border-2 border-gray-800 bg-indigo-950 px-3 text-xl font-medium text-gray-200">
			{eventLogo && <EventLogo />}
			<TeamInfo
				teamAwayName={store.teamAwayName ?? "T-A"}
				teamAwayScore={store.teamAwayScore ?? 0}
				teamHomeName={store.teamHomeName ?? "T-H"}
				teamHomeScore={store.teamHomeScore ?? 0}
				teamAwayColor={store.teamAwayColor ?? "#ff0000"}
				teamHomeColor={store.teamHomeColor ?? "#00ff00"}
			/>
			<div className="flex h-full w-full justify-between gap-1 pl-2">
				<Timer value={store.timer ?? 0} />
				{/* <div className="flex h-full w-0.5 bg-border-app-primary" /> */}
				<Half value={store.half ?? 1} />
			</div>
		</div>
	);
}
