import { JSX } from "react";

export function ScoreboardFeedbackIframe(): JSX.Element {
	return (
		<div className="flex h-16 w-[580px] items-center justify-center">
			<iframe src={"http://localhost:3001/scoreboard"} className="flex h-20 w-[560px]" />
		</div>
	);
}
