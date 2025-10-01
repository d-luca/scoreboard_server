import { JSX } from "react";
import { Card } from "../ui/Card/Card";
import { CardTitle } from "../ui/Card/CardTitle";
import { CardContent } from "../ui/Card/CardContent";
import { ScoreboardFeedbackIframe } from "./ScoreboardFeedbackIframe";
import { ScoreboardFeedbackUrlMessage } from "./ScoreboardFeedbackUrlMessage";

export function ScoreboardFeedback(): JSX.Element {
	return (
		<Card className="border-app-primary flex flex-col gap-4 border">
			<CardTitle>Scoreboard Feed</CardTitle>
			<CardContent className="flex w-full justify-between gap-2">
				<ScoreboardFeedbackUrlMessage />
				<ScoreboardFeedbackIframe />
			</CardContent>
		</Card>
	);
}
