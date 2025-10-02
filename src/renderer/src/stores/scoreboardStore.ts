import { create } from "zustand";
import { ScoreboardProps } from "@renderer/components/Scoreboard";

interface ScoreboardStoreData extends ScoreboardProps {
	// Additional states wrt ScoreboardProps
	timerLoadout1?: number; // in seconds
	timerLoadout2?: number; // in seconds
	timerLoadout3?: number; // in seconds
}

interface ScoreboardState extends ScoreboardStoreData {
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
	setTimerLoadout: ({ index, value }: { index: 1 | 2 | 3; value: number }) => void;
	increaseHalf: () => void;
	decreaseHalf: () => void;
	increaseTeamHomeScore: () => void;
	decreaseTeamHomeScore: () => void;
	increaseTeamAwayScore: () => void;
	decreaseTeamAwayScore: () => void;
	increaseTimerByOneSecond: () => void;
	decreaseTimerByOneSecond: () => void;
	increaseTimerByOneMinute: () => void;
	decreaseTimerByOneMinute: () => void;

	// Bulk update action
	updateScoreboardData: (data: Partial<ScoreboardProps>) => void;

	// Reset to defaults
	reset: () => void;
}

// Default values for the scoreboard
const defaultScoreboardData: ScoreboardStoreData = {
	eventLogo: undefined,
	teamHomeName: "T-H",
	teamAwayName: "T-A",
	teamHomeColor: "#00ff00",
	teamAwayColor: "#ff0000",
	teamHomeScore: 0,
	teamAwayScore: 0,
	timer: 0,
	half: 1,
	timerLoadout1: 45 * 60,
	timerLoadout2: 90 * 60,
	timerLoadout3: 30 * 60,
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
	setTimerLoadout: async ({ index, value }: { index: 1 | 2 | 3; value: number }) => {
		const boundedIndex = Math.min(Math.max(index, 1), 3) as 1 | 2 | 3;
		const key = `timerLoadout${boundedIndex}` as const;
		const sanitizedValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
		const payload = { [key]: sanitizedValue } as Partial<ScoreboardProps>;
		return set(payload as Partial<ScoreboardState>);
	},
	increaseHalf: async () => {
		const currentHalf = get().half ?? 1;
		const newHalf = currentHalf + 1;
		await window.api.updateScoreboardData({
			half: newHalf,
		});
		return set({ half: newHalf });
	},
	decreaseHalf: async () => {
		const currentHalf = get().half ?? 1;
		const newHalf = currentHalf > 1 ? currentHalf - 1 : 1;
		await window.api.updateScoreboardData({
			half: newHalf,
		});
		return set({ half: newHalf });
	},
	increaseTeamHomeScore: async () => {
		const currentScore = get().teamHomeScore ?? 0;
		const newScore = currentScore + 1;
		await window.api.updateScoreboardData({
			teamHomeScore: newScore,
		});
		return set({ teamHomeScore: newScore });
	},
	decreaseTeamHomeScore: async () => {
		const currentScore = get().teamHomeScore ?? 0;
		const newScore = currentScore > 0 ? currentScore - 1 : 0;
		await window.api.updateScoreboardData({
			teamHomeScore: newScore,
		});
		return set({ teamHomeScore: newScore });
	},
	increaseTeamAwayScore: async () => {
		const currentScore = get().teamAwayScore ?? 0;
		const newScore = currentScore + 1;
		await window.api.updateScoreboardData({
			teamAwayScore: newScore,
		});
		return set({ teamAwayScore: newScore });
	},
	decreaseTeamAwayScore: async () => {
		const currentScore = get().teamAwayScore ?? 0;
		const newScore = currentScore > 0 ? currentScore - 1 : 0;
		await window.api.updateScoreboardData({
			teamAwayScore: newScore,
		});
		return set({ teamAwayScore: newScore });
	},
	increaseTimerByOneSecond: async () => {
		const currentTimer = get().timer ?? 0;
		const newTimer = currentTimer + 1;
		await window.api.updateScoreboardData({
			timer: newTimer,
		});
		return set({ timer: newTimer });
	},
	decreaseTimerByOneSecond: async () => {
		const currentTimer = get().timer ?? 0;
		const newTimer = currentTimer > 0 ? currentTimer - 1 : 0;
		await window.api.updateScoreboardData({
			timer: newTimer,
		});
		return set({ timer: newTimer });
	},
	increaseTimerByOneMinute: async () => {
		const currentTimer = get().timer ?? 0;
		const newTimer = currentTimer + 60;
		await window.api.updateScoreboardData({
			timer: newTimer,
		});
		return set({ timer: newTimer });
	},
	decreaseTimerByOneMinute: async () => {
		const currentTimer = get().timer ?? 0;
		const newTimer = currentTimer >= 60 ? currentTimer - 60 : 0;
		await window.api.updateScoreboardData({
			timer: newTimer,
		});
		return set({ timer: newTimer });
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
	timerLoadout1?: number;
	timerLoadout2?: number;
	timerLoadout3?: number;
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
		timerLoadout1: store.timerLoadout1,
		timerLoadout2: store.timerLoadout2,
		timerLoadout3: store.timerLoadout3,
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
	setTimerLoadout: ({ index, value }: { index: 1 | 2 | 3; value: number }) => void;
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
		setTimerLoadout: store.setTimerLoadout,
		updateScoreboardData: store.updateScoreboardData,
		reset: store.reset,
	};
};
