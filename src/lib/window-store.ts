import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppWindow } from "../bindings/AppWindow";

/**
 * Mirrors which feature windows are open (doc 04 §4.5). Fed by the
 * `window:opened` / `window:closed` events emitted by the Rust window
 * manager, and seeded from `window_list` on first use.
 */
interface WindowStore {
	open: AppWindow[];
	refresh(): Promise<void>;
	openWindow(which: AppWindow): Promise<void>;
	closeWindow(which: AppWindow): Promise<void>;
}

let subscribed = false;

export const useWindowStore = create<WindowStore>((set, get) => ({
	open: [],
	refresh: async () => {
		if (!subscribed) {
			subscribed = true;
			void listen<string>("window:opened", ({ payload }) => {
				const which = payload as AppWindow;
				set(({ open }) => (open.includes(which) ? {} : { open: [...open, which] }));
			});
			void listen<string>("window:closed", ({ payload }) => {
				const which = payload as AppWindow;
				set(({ open }) => ({ open: open.filter((label) => label !== which) }));
			});
		}
		const open = await invoke<AppWindow[]>("window_list");
		set({ open });
	},
	openWindow: async (which) => {
		await invoke("window_open", { which });
		await get().refresh();
	},
	closeWindow: async (which) => {
		await invoke("window_close", { which });
		await get().refresh();
	},
}));
