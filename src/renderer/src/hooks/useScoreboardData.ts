import { useState, useEffect, useCallback } from "react";
import { ScoreboardData } from "../../../types/scoreboard";

const initialScoreboardData: ScoreboardData = {
	teamHomeName: "HOME",
	teamAwayName: "AWAY",
	teamHomeScore: 0,
	teamAwayScore: 0,
	teamHomeColor: "#00ff00",
	teamAwayColor: "#ff0000",
	timer: 0,
	half: 1,
};

type useScoreboardDataReturn = {
	scoreboardData: ScoreboardData;
	isLoading: boolean;
	error: string | null;
	updateScoreboardData: (updates: Partial<ScoreboardData>) => Promise<void>;
	updateTeamScore: (team: "home" | "away", score: number) => void;
	updateTeamName: (team: "home" | "away", name: string) => void;
	updateTeamColor: (team: "home" | "away", color: string) => void;
	updateTimer: (timer: number) => void;
	updateHalf: (half: number) => void;
	resetScoreboard: () => void;
};

export function useScoreboardData(): useScoreboardDataReturn {
	const [scoreboardData, setScoreboardData] = useState<ScoreboardData>(initialScoreboardData);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load initial data
	useEffect(() => {
		const loadData = async (): Promise<void> => {
			try {
				setIsLoading(true);
				const data = await window.api.getScoreboardData();
				setScoreboardData(data);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load scoreboard data");
				console.error("Failed to load scoreboard data:", err);
			} finally {
				setIsLoading(false);
			}
		};

		loadData();
	}, []);

	// Update scoreboard data
	const updateScoreboardData = useCallback(async (updates: Partial<ScoreboardData>) => {
		try {
			const updatedData = await window.api.updateScoreboardData(updates);
			setScoreboardData(updatedData);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update scoreboard data");
			console.error("Failed to update scoreboard data:", err);
		}
	}, []);

	// Individual update methods for convenience
	const updateTeamScore = useCallback(
		(team: "home" | "away", score: number) => {
			const key = team === "home" ? "teamHomeScore" : "teamAwayScore";
			updateScoreboardData({ [key]: score });
		},
		[updateScoreboardData],
	);

	const updateTeamName = useCallback(
		(team: "home" | "away", name: string) => {
			const key = team === "home" ? "teamHomeName" : "teamAwayName";
			updateScoreboardData({ [key]: name });
		},
		[updateScoreboardData],
	);

	const updateTeamColor = useCallback(
		(team: "home" | "away", color: string) => {
			const key = team === "home" ? "teamHomeColor" : "teamAwayColor";
			updateScoreboardData({ [key]: color });
		},
		[updateScoreboardData],
	);

	const updateTimer = useCallback(
		(timer: number) => {
			updateScoreboardData({ timer });
		},
		[updateScoreboardData],
	);

	const updateHalf = useCallback(
		(half: number) => {
			updateScoreboardData({ half });
		},
		[updateScoreboardData],
	);

	const resetScoreboard = useCallback(() => {
		updateScoreboardData(initialScoreboardData);
	}, [updateScoreboardData]);

	return {
		scoreboardData,
		isLoading,
		error,
		updateScoreboardData,
		updateTeamScore,
		updateTeamName,
		updateTeamColor,
		updateTimer,
		updateHalf,
		resetScoreboard,
	};
}
