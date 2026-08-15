import { JSX } from "react";
import type { ScoreboardState } from "../../bindings/ScoreboardState";
import { EventLogo } from "./EventLogo";
import { Half } from "./Half";
import { TeamInfo } from "./TeamInfo";
import { Timer } from "./Timer";

/**
 * The visual scoreboard, ported verbatim from the Electron build
 * (doc 04 §6). Must render pixel-identical at 600×80.
 *
 * All props are optional with the documented fallbacks (names "T-H"/"T-A",
 * colours #00ff00/#ff0000, scores 0, timer 0, half 1).
 */
export type ScoreboardProps = Partial<
	Pick<
		ScoreboardState,
		| "teamHomeName"
		| "teamAwayName"
		| "teamHomeColor"
		| "teamAwayColor"
		| "teamHomeScore"
		| "teamAwayScore"
		| "timer"
		| "half"
		| "halfPrefix"
		| "eventLogo"
	>
>;

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
