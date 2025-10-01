import { JSX } from "react";
import { CardDescription } from "../ui/Card/CardDescription";

export function ScoreboardFeedbackUrlMessage(): JSX.Element {
	return (
		<div className="text-app-secondary flexflex-col gap-4">
			<CardDescription className="font-medium">OBS Browser Source URL:</CardDescription>
			<CardDescription className="flex flex-col">
				<p className="font-mono text-blue-500">http://localhost:3001/scoreboard</p>
				<p className="text-nowrap">
					Copy this URL into OBS Studio&apos;s Browser Source to display the scoreboard in your stream.
				</p>
			</CardDescription>
		</div>
	);
}
