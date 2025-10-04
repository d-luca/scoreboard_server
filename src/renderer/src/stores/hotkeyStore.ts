import { create } from "zustand";
import { persist } from "zustand/middleware";

export type HotkeyAction =
	| "increaseHomeScore"
	| "decreaseHomeScore"
	| "increaseAwayScore"
	| "decreaseAwayScore"
	| "increaseHalf"
	| "decreaseHalf"
	| "startTimer"
	| "pauseTimer"
	| "stopTimer"
	| "increaseTimerSecond"
	| "decreaseTimerSecond"
	| "increaseTimerMinute"
	| "decreaseTimerMinute"
	| "timerLoadout1"
	| "timerLoadout2"
	| "timerLoadout3"
	| "resetScoreboard";

export interface HotkeyMapping {
	key: string;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	enabled?: boolean;
}

export type HotkeyConfig = Record<HotkeyAction, HotkeyMapping>;

// Default hotkey mappings
const defaultHotkeys: HotkeyConfig = {
	increaseHomeScore: { key: "q", enabled: true },
	decreaseHomeScore: { key: "a", enabled: true },
	increaseAwayScore: { key: "e", enabled: true },
	decreaseAwayScore: { key: "d", enabled: true },
	increaseHalf: { key: "]", enabled: true },
	decreaseHalf: { key: "[", enabled: true },
	startTimer: { key: " ", enabled: true }, // Space
	pauseTimer: { key: "p", enabled: true },
	stopTimer: { key: "s", enabled: true },
	increaseTimerSecond: { key: "ArrowUp", enabled: true },
	decreaseTimerSecond: { key: "ArrowDown", enabled: true },
	increaseTimerMinute: { key: "ArrowUp", shiftKey: true, enabled: true },
	decreaseTimerMinute: { key: "ArrowDown", shiftKey: true, enabled: true },
	timerLoadout1: { key: "1", ctrlKey: true, enabled: true },
	timerLoadout2: { key: "2", ctrlKey: true, enabled: true },
	timerLoadout3: { key: "3", ctrlKey: true, enabled: true },
	resetScoreboard: { key: "r", ctrlKey: true, shiftKey: true, enabled: true },
};

interface HotkeyState {
	hotkeys: HotkeyConfig;
	enabled: boolean;
	setHotkey: (action: HotkeyAction, mapping: HotkeyMapping) => void;
	resetHotkeys: () => void;
	toggleEnabled: () => void;
	setEnabled: (enabled: boolean) => void;
	getHotkeyString: (action: HotkeyAction) => string;
}

export const useHotkeyStore = create<HotkeyState>()(
	persist(
		(set, get) => ({
			hotkeys: defaultHotkeys,
			enabled: true,

			setHotkey: (action, mapping) => {
				set((state) => {
					const newHotkeys = {
						...state.hotkeys,
						[action]: mapping,
					};
					// Notify other windows about the change
					if (typeof window !== "undefined" && window.api) {
						window.api.notifyHotkeyUpdate(JSON.stringify(newHotkeys));
					}
					return { hotkeys: newHotkeys };
				});
			},

			resetHotkeys: () => {
				set({ hotkeys: defaultHotkeys });
				// Notify other windows about the reset
				if (typeof window !== "undefined" && window.api) {
					window.api.notifyHotkeyUpdate(JSON.stringify(defaultHotkeys));
				}
			},

			toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),

			setEnabled: (enabled) => set({ enabled }),

			getHotkeyString: (action) => {
				const hotkey = get().hotkeys[action];
				if (!hotkey) return "";

				const parts: string[] = [];
				if (hotkey.ctrlKey) parts.push("Ctrl");
				if (hotkey.altKey) parts.push("Alt");
				if (hotkey.shiftKey) parts.push("Shift");

				// Format key name
				let keyName = hotkey.key;
				if (keyName === " ") keyName = "Space";
				else if (keyName.startsWith("Arrow")) keyName = keyName.replace("Arrow", "");
				else keyName = keyName.toUpperCase();

				parts.push(keyName);

				return parts.join(" + ");
			},
		}),
		{
			name: "scoreboard-hotkeys",
		},
	),
);

// Setup listener for hotkey updates from other windows
if (typeof window !== "undefined" && window.api) {
	window.api.onHotkeyUpdate((hotkeysJson: string) => {
		try {
			const hotkeys = JSON.parse(hotkeysJson) as HotkeyConfig;
			useHotkeyStore.setState({ hotkeys });
		} catch (error) {
			console.error("Failed to parse hotkey update:", error);
		}
	});
}

// Helper function to check if a keyboard event matches a hotkey mapping
export function matchesHotkey(event: KeyboardEvent, mapping: HotkeyMapping): boolean {
	if (!mapping.enabled) return false;

	const keyMatches = event.key.toLowerCase() === mapping.key.toLowerCase();
	const ctrlMatches = !!mapping.ctrlKey === event.ctrlKey;
	const altMatches = !!mapping.altKey === event.altKey;
	const shiftMatches = !!mapping.shiftKey === event.shiftKey;

	return keyMatches && ctrlMatches && altMatches && shiftMatches;
}

// Helper function to find if a hotkey mapping is already used by another action
export function findDuplicateHotkey(
	hotkeys: HotkeyConfig,
	currentAction: HotkeyAction,
	newMapping: HotkeyMapping,
): HotkeyAction | null {
	for (const [action, mapping] of Object.entries(hotkeys)) {
		// Skip the current action being edited
		if (action === currentAction) continue;

		// Check if the mapping matches (same key and modifiers)
		const keyMatches = mapping.key.toLowerCase() === newMapping.key.toLowerCase();
		const ctrlMatches = !!mapping.ctrlKey === !!newMapping.ctrlKey;
		const altMatches = !!mapping.altKey === !!newMapping.altKey;
		const shiftMatches = !!mapping.shiftKey === !!newMapping.shiftKey;

		if (keyMatches && ctrlMatches && altMatches && shiftMatches) {
			return action as HotkeyAction;
		}
	}
	return null;
}

// Get action labels for display
export const hotkeyActionLabels: Record<HotkeyAction, string> = {
	increaseHomeScore: "Increase Home Score",
	decreaseHomeScore: "Decrease Home Score",
	increaseAwayScore: "Increase Away Score",
	decreaseAwayScore: "Decrease Away Score",
	increaseHalf: "Increase Half",
	decreaseHalf: "Decrease Half",
	startTimer: "Start Timer",
	pauseTimer: "Pause Timer",
	stopTimer: "Stop Timer",
	increaseTimerSecond: "Timer +1 Second",
	decreaseTimerSecond: "Timer -1 Second",
	increaseTimerMinute: "Timer +1 Minute",
	decreaseTimerMinute: "Timer -1 Minute",
	timerLoadout1: "Timer Loadout 1",
	timerLoadout2: "Timer Loadout 2",
	timerLoadout3: "Timer Loadout 3",
	resetScoreboard: "Reset Scoreboard",
};
