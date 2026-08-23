import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Settings } from "../../bindings/Settings";
import type { SettingsPatch } from "../../bindings/SettingsPatch";

/**
 * Mirror of `Settings` from Rust (doc 04 §4.2). `set(patch)` invokes
 * `settings_set`; Rust persists atomically (debounced) and broadcasts
 * `settings:changed` to every window. There is no `persist` middleware —
 * persistence lives in Rust.
 */
interface SettingsStore {
	settings: Settings | null;
	refresh(): Promise<Settings>;
	set(patch: SettingsPatch): Promise<Settings>;
}

let subscribed = false;

export const useSettingsStore = create<SettingsStore>((set) => ({
	settings: null,
	refresh: async () => {
		if (!subscribed) {
			subscribed = true;
			void listen<Settings>("settings:changed", ({ payload }) => set({ settings: payload }));
		}
		const settings = await invoke<Settings>("settings_get");
		set({ settings });
		return settings;
	},
	set: async (patch) => {
		const settings = await invoke<Settings>("settings_set", { patch });
		set({ settings });
		return settings;
	},
}));
