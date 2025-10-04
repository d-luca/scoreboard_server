import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OverlayState {
	enabled: boolean;
	toggleOverlay: () => void;
	setOverlay: (enabled: boolean) => void;
}

export const useOverlayStore = create<OverlayState>()(
	persist(
		(set) => ({
			enabled: false,
			toggleOverlay: () => set((state) => ({ enabled: !state.enabled })),
			setOverlay: (enabled) => set({ enabled }),
		}),
		{
			name: "scoreboard-overlay",
		},
	),
);
