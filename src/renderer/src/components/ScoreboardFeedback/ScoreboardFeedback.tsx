import { JSX, useEffect, useState } from "react";
import { Card } from "../ui/Card/Card";
import { CardTitle } from "../ui/Card/CardTitle";
import { CardContent } from "../ui/Card/CardContent";
import { ScoreboardFeedbackIframe } from "./ScoreboardFeedbackIframe";
import { ScoreboardFeedbackUrlMessage } from "./ScoreboardFeedbackUrlMessage";

type FeedTab = "local" | "external";

export function ScoreboardFeedback(): JSX.Element {
	const [activeTab, setActiveTab] = useState<FeedTab>("local");

	type LanAddress = { name: string; address: string; url: string };
	const [lanUrls, setLanUrls] = useState<LanAddress[]>([]);

	useEffect(() => {
		let isMounted = true;
		void window.api
			.getLanAddresses()
			.then((urls) => {
				if (isMounted) setLanUrls(urls);
			})
			.catch((err) => console.error("Failed to load LAN addresses:", err));
		return () => {
			isMounted = false;
		};
	}, []);

	// Derive the scoreboard URL for the first LAN address (replace /control with /scoreboard)
	const externalScoreboardUrl =
		lanUrls.length > 0 ? lanUrls[0].url.replace(/\/control$/, "/scoreboard") : null;

	return (
		<Card className="border-app-primary flex flex-col gap-4 border">
			<CardTitle>Scoreboard Feed</CardTitle>
			<CardContent className="flex w-full flex-col justify-between gap-2">
				{/* Tab menu */}
				<div className="flex gap-2">
					<button
						className={`rounded-md px-3 py-1 text-sm font-semibold transition ${
							activeTab === "local"
								? "bg-primary-500 text-white"
								: "bg-surface-secondary text-app-secondary hover:bg-surface-tertiary"
						}`}
						onClick={() => setActiveTab("local")}
					>
						Local
					</button>
					<button
						className={`rounded-md px-3 py-1 text-sm font-semibold transition ${
							activeTab === "external"
								? "bg-primary-500 text-white"
								: "bg-surface-secondary text-app-secondary hover:bg-surface-tertiary"
						}`}
						onClick={() => setActiveTab("external")}
					>
						External
					</button>
				</div>

				{activeTab === "local" && (
					<>
						<ScoreboardFeedbackUrlMessage />
						<ScoreboardFeedbackIframe />
					</>
				)}

				{activeTab === "external" && (
					<>
						{lanUrls.length > 0 ? (
							<div className="flex flex-col gap-2">
								<div className="text-app-secondary text-sm font-semibold">LAN Remote Control</div>
								<div className="flex flex-col gap-1">
									{lanUrls.map((entry) => (
										<a
											key={entry.url}
											href={entry.url}
											target="_blank"
											rel="noreferrer"
											className="text-primary-300 hover:text-primary-200 font-mono text-sm break-all underline underline-offset-4"
										>
											{entry.name} — {entry.url}
										</a>
									))}
								</div>
								{externalScoreboardUrl && (
									<div className="mt-2 flex h-16 w-[580px] items-center justify-center">
										<iframe src={externalScoreboardUrl} className="flex h-20 w-[560px]" />
									</div>
								)}
							</div>
						) : (
							<p className="text-app-secondary text-sm">No LAN addresses available.</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
