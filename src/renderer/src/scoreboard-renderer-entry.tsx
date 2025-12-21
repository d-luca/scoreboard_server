import "./global.css";
import "./scoreboard.css";

import { StrictMode, useState, useEffect, useCallback, JSX } from "react";
import { createRoot } from "react-dom/client";
import { Scoreboard } from "./components/Scoreboard";
import { ScoreboardSnapshot } from "../../types/scoreboard";

// Minimal scoreboard renderer for video generation
function ScoreboardRenderer(): JSX.Element {
	const [data, setData] = useState<Partial<ScoreboardSnapshot>>({
		teamHomeName: "HOME",
		teamAwayName: "AWAY",
		teamHomeColor: "#00ff00",
		teamAwayColor: "#ff0000",
		teamHomeScore: 0,
		teamAwayScore: 0,
		timer: 0,
		half: 1,
		halfPrefix: "PERIODO",
	});

	const updateScoreboardData = useCallback((newData: ScoreboardSnapshot) => {
		setData(newData);
	}, []);

	useEffect(() => {
		// Expose the update function globally for the main process to call
		(window as unknown as { updateScoreboardData: (data: ScoreboardSnapshot) => void }).updateScoreboardData =
			updateScoreboardData;
	}, [updateScoreboardData]);

	return (
		<div
			style={{
				width: "600px",
				height: "80px",
				padding: "0px 12px",
				background: "transparent",
				overflow: "hidden",
			}}
		>
			<Scoreboard
				teamHomeName={data.teamHomeName}
				teamAwayName={data.teamAwayName}
				teamHomeColor={data.teamHomeColor}
				teamAwayColor={data.teamAwayColor}
				teamHomeScore={data.teamHomeScore}
				teamAwayScore={data.teamAwayScore}
				timer={data.timer}
				half={data.half}
				halfPrefix={data.halfPrefix}
			/>
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ScoreboardRenderer />
	</StrictMode>,
);
