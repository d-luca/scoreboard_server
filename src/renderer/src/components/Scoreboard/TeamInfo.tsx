import { JSX } from "react";
import { TeamColorRect } from "./TeamColorRect";
import { VerticalDivider } from "../ui/VerticalDivider";

type TeamInfoProps = {
	teamHomeName: string;
	teamAwayName: string;
	teamAwayColor: string;
	teamHomeScore: number;
	teamAwayScore: number;
	teamHomeColor: string;
};

export function TeamInfo({
	teamAwayName,
	teamAwayScore,
	teamAwayColor,
	teamHomeName,
	teamHomeScore,
	teamHomeColor,
}: TeamInfoProps): JSX.Element {
	return (
		<div className="flex h-full gap-3 px-1 font-bold">
			<div className="flex items-center justify-between gap-2">
				<TeamColorRect color={teamHomeColor} data-home-color />
				<div className="flex w-16 items-center justify-center tracking-wider" data-home-name>
					{teamHomeName}
				</div>
			</div>{" "}
			<div className="flex items-center bg-white py-1 text-2xl text-neutral-950">
				<div className="flex w-12 items-center justify-center bg-white" data-home-score>
					{teamHomeScore}
				</div>
				<VerticalDivider />
				<div className="flex w-12 items-center justify-center bg-white" data-away-score>
					{teamAwayScore}
				</div>
			</div>{" "}
			<div className="flex items-center justify-between gap-2">
				<div className="flex w-16 items-center justify-center tracking-wider" data-away-name>
					{teamAwayName}
				</div>
				<TeamColorRect color={teamAwayColor} data-away-color />
			</div>
		</div>
	);
}
