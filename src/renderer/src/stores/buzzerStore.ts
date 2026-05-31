import { create } from "zustand";
import buzzerUrl from "../../../../resources/buzzer.mp3";

interface BuzzerState {
	buzzerEnabled: boolean;
	/** File name of the user-selected custom track, or null when using the default. */
	customTrackName: string | null;
	toggleBuzzer: () => void;
	playBuzzer: () => void;
	loadPersistedTrack: () => Promise<void>;
	selectTrack: () => Promise<void>;
	clearTrack: () => Promise<void>;
}

let defaultAudio: HTMLAudioElement | null = null;
let customAudio: HTMLAudioElement | null = null;
let customObjectUrl: string | null = null;

function buildCustomAudio(data: Uint8Array): void {
	if (customObjectUrl) {
		URL.revokeObjectURL(customObjectUrl);
		customObjectUrl = null;
	}
	const blob = new Blob([data as BlobPart], { type: "audio/mpeg" });
	customObjectUrl = URL.createObjectURL(blob);
	customAudio = new Audio(customObjectUrl);
}

function disposeCustomAudio(): void {
	customAudio = null;
	if (customObjectUrl) {
		URL.revokeObjectURL(customObjectUrl);
		customObjectUrl = null;
	}
}

export const useBuzzerStore = create<BuzzerState>((set) => ({
	buzzerEnabled: true,
	customTrackName: null,

	toggleBuzzer: () => set((state) => ({ buzzerEnabled: !state.buzzerEnabled })),

	playBuzzer: () => {
		const audio = customAudio ?? (defaultAudio ??= new Audio(buzzerUrl));
		audio.currentTime = 0;
		audio.play().catch((err) => console.error("Failed to play buzzer:", err));
	},

	loadPersistedTrack: async () => {
		try {
			const result = await window.api.getBuzzerTrack();
			if (result.path && result.data && result.fileName) {
				buildCustomAudio(result.data);
				set({ customTrackName: result.fileName });
			}
		} catch (err) {
			console.error("Failed to load persisted buzzer track:", err);
		}
	},

	selectTrack: async () => {
		try {
			const result = await window.api.selectBuzzerTrack();
			if (result.canceled || !result.data || !result.fileName) {
				if (result.error) console.error("Failed to select buzzer track:", result.error);
				return;
			}
			buildCustomAudio(result.data);
			set({ customTrackName: result.fileName });
		} catch (err) {
			console.error("Failed to select buzzer track:", err);
		}
	},

	clearTrack: async () => {
		try {
			await window.api.clearBuzzerTrack();
		} catch (err) {
			console.error("Failed to clear buzzer track:", err);
		}
		disposeCustomAudio();
		set({ customTrackName: null });
	},
}));

// Load any persisted custom track on startup
void useBuzzerStore.getState().loadPersistedTrack();
