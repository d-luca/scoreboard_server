import { create } from "zustand";
import { ScoreboardProps } from "@renderer/components/Scoreboard";

interface ScoreboardState extends ScoreboardProps {
	// Actions for updating the state
	setEventLogo: (eventLogo?: string) => void;
	setTeamHomeScore: (score: number) => void;
	setTeamAwayScore: (score: number) => void;
	setTimer: (timer: number) => void;
	setHalf: (half: number) => void;
	setTeamHomeName: (name?: string) => void;
	setTeamAwayName: (name?: string) => void;
	setTeamHomeColor: (color?: string) => void;
	setTeamAwayColor: (color?: string) => void;
	increaseHalf: () => void;

	// Bulk update action
	updateScoreboardData: (data: Partial<ScoreboardProps>) => void;

	// Reset to defaults
	reset: () => void;
}

// Default values for the scoreboard
const defaultScoreboardData: ScoreboardProps = {
	eventLogo: undefined,
	teamHomeName: "T-H",
	teamAwayName: "T-A",
	teamHomeColor: "#00ff00",
	teamAwayColor: "#ff0000",
	teamHomeScore: 0,
	teamAwayScore: 0,
	timer: 0,
	half: 1,
};

export const useScoreboardStore = create<ScoreboardState>((set, get) => ({
	// Initial state
	...defaultScoreboardData,

	// Actions
	setEventLogo: async (eventLogo) => {
		await window.api.updateScoreboardData({
			eventLogo,
		});
		return set({ eventLogo });
	},
	setTeamHomeScore: async (teamHomeScore) => {
		await window.api.updateScoreboardData({
			teamHomeScore,
		});
		return set({ teamHomeScore });
	},
	setTeamAwayScore: async (teamAwayScore) => {
		await window.api.updateScoreboardData({
			teamAwayScore,
		});
		return set({ teamAwayScore });
	},
	setTimer: async (timer) => {
		await window.api.updateScoreboardData({
			timer,
		});
		return set({ timer });
	},
	setHalf: async (half) => {
		await window.api.updateScoreboardData({
			half,
		});
		return set({ half });
	},
	setTeamHomeName: async (teamHomeName) => {
		await window.api.updateScoreboardData({
			teamHomeName,
		});
		return set({ teamHomeName });
	},
	setTeamAwayName: async (teamAwayName) => {
		await window.api.updateScoreboardData({
			teamAwayName,
		});
		return set({ teamAwayName });
	},
	setTeamHomeColor: async (teamHomeColor) => {
		await window.api.updateScoreboardData({
			teamHomeColor,
		});
		return set({ teamHomeColor });
	},
	setTeamAwayColor: async (teamAwayColor) => {
		await window.api.updateScoreboardData({
			teamAwayColor,
		});
		return set({ teamAwayColor });
	},

	increaseHalf: async () => {
		const currentHalf = get().half ?? 1;
		const newHalf = currentHalf + 1;
		await window.api.updateScoreboardData({
			half: newHalf,
		});
		return set({ half: newHalf });
	},

	// Bulk update
	updateScoreboardData: async (data) => {
		await window.api.updateScoreboardData(data);
		return set((state) => ({ ...state, ...data }));
	},

	// Reset to defaults
	reset: async () => {
		await window.api.updateScoreboardData(defaultScoreboardData);
		return set(defaultScoreboardData);
	},
}));

// Selector hooks for specific parts of the state (optional but useful)
export const useScoreboardData = (): {
	eventLogo?: string;
	teamHomeName?: string;
	teamAwayName?: string;
	teamHomeColor?: string;
	teamAwayColor?: string;
	teamHomeScore?: number;
	teamAwayScore?: number;
	timer?: number;
	half?: number;
} => {
	const store = useScoreboardStore();
	return {
		eventLogo: store.eventLogo,
		teamHomeName: store.teamHomeName,
		teamAwayName: store.teamAwayName,
		teamHomeColor: store.teamHomeColor,
		teamAwayColor: store.teamAwayColor,
		teamHomeScore: store.teamHomeScore,
		teamAwayScore: store.teamAwayScore,
		timer: store.timer,
		half: store.half,
	};
};

export const useScoreboardActions = (): {
	setEventLogo: (eventLogo?: string) => void;
	setTeamHomeScore: (score: number) => void;
	setTeamAwayScore: (score: number) => void;
	setTimer: (timer: number) => void;
	setHalf: (half: number) => void;
	setTeamHomeName: (name?: string) => void;
	setTeamAwayName: (name?: string) => void;
	setTeamHomeColor: (color?: string) => void;
	setTeamAwayColor: (color?: string) => void;
	updateScoreboardData: (data: Partial<ScoreboardProps>) => void;
	reset: () => void;
} => {
	const store = useScoreboardStore();
	return {
		setEventLogo: store.setEventLogo,
		setTeamHomeScore: store.setTeamHomeScore,
		setTeamAwayScore: store.setTeamAwayScore,
		setTimer: store.setTimer,
		setHalf: store.setHalf,
		setTeamHomeName: store.setTeamHomeName,
		setTeamAwayName: store.setTeamAwayName,
		setTeamHomeColor: store.setTeamHomeColor,
		setTeamAwayColor: store.setTeamAwayColor,
		updateScoreboardData: store.updateScoreboardData,
		reset: store.reset,
	};
};
