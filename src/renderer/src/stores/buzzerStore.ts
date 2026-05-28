import { create } from "zustand";
import buzzerUrl from "../../../../resources/buzzer.mp3";

interface BuzzerState {
	buzzerEnabled: boolean;
	toggleBuzzer: () => void;
	playBuzzer: () => void;
}

let buzzerAudio: HTMLAudioElement | null = null;

export const useBuzzerStore = create<BuzzerState>(() => ({
	buzzerEnabled: true,

	toggleBuzzer: () => useBuzzerStore.setState((state) => ({ buzzerEnabled: !state.buzzerEnabled })),

	playBuzzer: () => {
		if (!buzzerAudio) {
			buzzerAudio = new Audio(buzzerUrl);
		}
		buzzerAudio.currentTime = 0;
		buzzerAudio.play().catch((err) => console.error("Failed to play buzzer:", err));
	},
}));
