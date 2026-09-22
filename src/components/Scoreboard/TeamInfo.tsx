import { JSX } from "react";
import { RollingScore } from "./RollingScore";
import { TeamColorRect } from "./TeamColorRect";
import { VerticalDivider } from "../ui/VerticalDivider";

type TeamInfoProps = {
	teamHomeName: string;
	teamAwayName: string;
	teamAwayColor: string;
	teamHomeScore: number;
	teamAwayScore: number;
	teamHomeColor: string;
	/** Odometer scroll on score changes; `false` renders static digits. */
	scoreAnimation?: boolean;
};

export function TeamInfo({
	teamAwayName,
	teamAwayScore,
	teamAwayColor,
	teamHomeName,
	teamHomeScore,
	teamHomeColor,
	scoreAnimation = true,
}: TeamInfoProps): JSX.Element {
	return (
		<div className="flex h-full gap-3 bg-indigo-950 text-nowrap">
			<div className="flex items-center justify-between gap-2" style={{ transform: "skewX(15deg)" }}>
				<TeamColorRect color={teamHomeColor} data-home-color />
				<div
					className="flex w-28 items-center justify-center tracking-wide text-white"
					style={{ fontFamily: "Anton" }}
					data-home-name
				>
					{teamHomeName}
				</div>
			</div>{" "}
			<div className="flex items-center bg-white" style={{ fontFamily: "Anton" }}>
				<div
					className="flex h-full w-16 items-center justify-center"
					style={{ transform: "skewX(15deg)" }}
					data-home-score
				>
					<RollingScore value={teamHomeScore} animated={scoreAnimation} />
				</div>
				<div className="h-2/3">
					<VerticalDivider />
				</div>
				<div
					className="flex h-full w-16 items-center justify-center"
					style={{ transform: "skewX(15deg)" }}
					data-away-score
				>
					<RollingScore value={teamAwayScore} animated={scoreAnimation} />
				</div>
			</div>{" "}
			<div className="flex items-center justify-between gap-2" style={{ transform: "skewX(15deg)" }}>
				<div
					className="flex w-28 items-center justify-center tracking-wide text-white"
					style={{ fontFamily: "Anton" }}
					data-away-name
				>
					{teamAwayName}
				</div>
				<TeamColorRect color={teamAwayColor} data-away-color />
			</div>
		</div>
	);
}
