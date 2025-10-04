import { ScoreboardControl } from "@renderer/components/ScoreboardControl/ScoreboardControl";
import { JSX, useEffect } from "react";
import { ScoreboardFeedback } from "@renderer/components/ScoreboardFeedback/ScoreboardFeedback";
import { CameraFeedback } from "@renderer/components/CameraFeedback/CameraFeedback";
import { ScoreboardSettings } from "@renderer/components/ScoreboardSettings";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";
import { useKeyboardControls } from "@renderer/hooks/useKeyboardControls";

export function ScoreboardMain(): JSX.Element {
	const store = useScoreboardStore();

	// Enable keyboard controls
	useKeyboardControls();

	useEffect(() => {
		window.api.updateScoreboardData({
			half: store.half,
			timer: store.timer,
			teamHomeName: store.teamHomeName,
			teamAwayName: store.teamAwayName,
			teamHomeScore: store.teamHomeScore,
			teamAwayScore: store.teamAwayScore,
			teamHomeColor: store.teamHomeColor,
			teamAwayColor: store.teamAwayColor,
			eventLogo: store.eventLogo,
		});
	}, [
		store.eventLogo,
		store.half,
		store.teamAwayColor,
		store.teamAwayName,
		store.teamAwayScore,
		store.teamHomeColor,
		store.teamHomeName,
		store.teamHomeScore,
		store.timer,
	]);

	return (
		<div className="flex size-full gap-4">
			<div className="flex h-full w-2/3 flex-col gap-4">
				<ScoreboardFeedback />
				<CameraFeedback />
			</div>
			<div className="flex h-full w-1/3 flex-col gap-4 overflow-hidden">
				<ScoreboardControl />
				<ScoreboardSettings />
			</div>
		</div>
	);
}
