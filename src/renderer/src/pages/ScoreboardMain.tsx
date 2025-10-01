import { ScoreboardControl } from "@renderer/components/ScoreboardControl/ScoreboardControl";
import { JSX } from "react";
import { ScoreboardFeedback } from "@renderer/components/ScoreboardFeedback/ScoreboardFeedback";
import { CameraFeedback } from "@renderer/components/CameraFeedback/CameraFeedback";
import { ScoreboardSettings } from "@renderer/components/ScoreboardSettings";

export function ScoreboardMain(): JSX.Element {
	return (
		<div className="flex size-full gap-4">
			<div className="flex size-full flex-col gap-4">
				<ScoreboardFeedback />
				<CameraFeedback />
			</div>
			<div className="flex h-full w-1/2 flex-col gap-4">
				<ScoreboardControl />
				<ScoreboardSettings />
			</div>
		</div>
	);
}
