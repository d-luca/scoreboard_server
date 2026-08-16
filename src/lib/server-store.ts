import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ServerInfo } from "../bindings/ServerInfo";
import type { ServerStatus } from "../bindings/ServerStatus";

/**
 * Mirrors of the Rust server state (doc 04 §4.4).
 *
 * `ServerInfo` is heavy (LAN URLs, later a QR SVG) and rarely changes;
 * `ServerStatus` is light and changes often. They are separate slices so a
 * client connecting on the LAN does not re-render the QR code.
 * `showAddresses` is UI-only (the eye toggle in the Outputs window).
 */
interface ServerStore {
	info: ServerInfo | null;
	status: ServerStatus | null;
	showAddresses: boolean;
	refresh(): Promise<void>;
	regenerateToken(): Promise<ServerInfo>;
	toggleShowAddresses(): void;
}

let subscribed = false;

export const useServerStore = create<ServerStore>((set, get) => ({
	info: null,
	status: null,
	showAddresses: false,
	refresh: async () => {
		if (!subscribed) {
			subscribed = true;
			void listen<ServerInfo>("server:info", ({ payload }) => set({ info: payload }));
			void listen<ServerStatus>("server:status", ({ payload }) => set({ status: payload }));
		}
		const [info, status] = await Promise.all([
			invoke<ServerInfo>("server_get_info"),
			invoke<ServerStatus>("server_get_status"),
		]);
		set({ info, status });
	},
	regenerateToken: async () => {
		const info = await invoke<ServerInfo>("server_regenerate_token");
		set({ info });
		return info;
	},
	toggleShowAddresses: () => set({ showAddresses: !get().showAddresses }),
}));
