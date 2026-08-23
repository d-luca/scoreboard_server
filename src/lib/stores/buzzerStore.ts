import { create } from "zustand";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ServerStatus } from "../../bindings/ServerStatus";
import type { Settings } from "../../bindings/Settings";
import { useServerStore } from "./serverStore";
import { useSettingsStore } from "./settingsStore";

/**
 * Buzzer playback state for the desktop (doc 04 §4.3).
 *
 * The audio element source comes from `convertFileSrc(path)` (asset
 * protocol) rather than shuttling bytes over IPC. Preloaded once; a trigger
 * rewinds and plays. The bundled `/buzzer.mp3` is the default when no
 * custom track is configured.
 */
interface BuzzerStore {
	trackPath: string | null;
	trackName: string | null;
	/** Resolved audio source for `<audio src>`. */
	source: string;
	refresh(): Promise<void>;
	selectTrack(): Promise<void>;
	clearTrack(): Promise<void>;
	/** Play the buzzer once (used by Test and by timer-finished). */
	play(): void;
}

interface BuzzerTrackResponse {
	path: string | null;
	fileName: string | null;
}

let subscribed = false;

function ensureSubscribed(): void {
	if (subscribed) return;
	subscribed = true;
	// The Settings window can change/clear the track; mirror it live.
	void listen<Settings>("settings:changed", ({ payload }) => {
		const path = payload.buzzerTrackPath;
		useBuzzerStore.setState({
			trackPath: path,
			trackName: path ? fileName(path) : null,
			source: resolveSource(path),
		});
	});
	// A port change (Settings › Server) moves the default-track URL.
	void listen<ServerStatus>("server:status", () => {
		const current = useBuzzerStore.getState();
		if (!current.trackPath) {
			useBuzzerStore.setState({ source: resolveSource(null) });
		}
	});
}

function resolveSource(path: string | null): string {
	if (path) return convertFileSrc(path);
	// The built-in default is served by the embedded HTTP server (the same
	// `/buzzer.mp3` the phone remote uses), on whichever port it bound.
	const port = useServerStore.getState().status?.port;
	return port ? `http://localhost:${port}/buzzer.mp3` : "/buzzer.mp3";
}

export const useBuzzerStore = create<BuzzerStore>((set, get) => ({
	trackPath: null,
	trackName: null,
	source: "/buzzer.mp3",
	refresh: async () => {
		ensureSubscribed();
		const track = await invoke<BuzzerTrackResponse>("buzzer_get_track");
		// Keep the store in sync if the settings window changed the track.
		const settings = useSettingsStore.getState().settings;
		const path = settings?.buzzerTrackPath ?? track.path;
		set({
			trackPath: path,
			trackName: path ? (track.fileName ?? fileName(path)) : null,
			source: resolveSource(path),
		});
	},
	selectTrack: async () => {
		ensureSubscribed();
		const track = await invoke<BuzzerTrackResponse | null>("buzzer_select_track");
		if (!track) return; // dialog cancelled
		set({
			trackPath: track.path,
			trackName: track.fileName,
			source: resolveSource(track.path),
		});
	},
	clearTrack: async () => {
		ensureSubscribed();
		await invoke("buzzer_clear_track");
		set({ trackPath: null, trackName: null, source: resolveSource(null) });
		// The settings mirror must reflect the cleared track.
		void useSettingsStore.getState().refresh();
	},
	play: () => {
		const element = player(get().source);
		if (!element) return;
		element.currentTime = 0;
		void element.play().catch(() => undefined);
	},
}));

function fileName(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

/** Shared preloaded audio element; recreated when the track changes. */
let audio: HTMLAudioElement | undefined;
let audioSource: string | undefined;

function player(source: string): HTMLAudioElement | undefined {
	if (typeof document === "undefined") return undefined;
	if (!audio || audioSource !== source) {
		audio = new Audio(source);
		audio.preload = "auto";
		audioSource = source;
	}
	return audio;
}
