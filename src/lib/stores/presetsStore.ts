import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { MatchPreset } from "../../bindings/MatchPreset";
import type { MatchPresetPatch } from "../../bindings/MatchPresetPatch";
import type { PresetLibrary } from "../../bindings/PresetLibrary";
import type { TeamPreset } from "../../bindings/TeamPreset";
import type { TeamPresetPatch } from "../../bindings/TeamPresetPatch";

/**
 * Mirror of the `PresetLibrary` from Rust (doc 09 §7.4). Persistence lives in
 * Rust (`presets.json`, atomic + debounced) — no `persist` middleware.
 * `refresh()` subscribes once to `presets:changed`; every mutation command
 * emits it, so the window stays in sync with the native menu without extra
 * plumbing.
 */
interface PresetsStore {
	library: PresetLibrary | null;
	refresh(): Promise<PresetLibrary>;
	createTeam(name: string, color: string): Promise<TeamPreset>;
	updateTeam(id: string, patch: TeamPresetPatch): Promise<TeamPreset>;
	/** Rejects while a fixture references the team; the error names them. */
	deleteTeam(id: string): Promise<void>;
	createMatch(label: string | null, homeTeamId: string, awayTeamId: string): Promise<MatchPreset>;
	updateMatch(id: string, patch: MatchPresetPatch): Promise<MatchPreset>;
	deleteMatch(id: string): Promise<void>;
	/** Load a fixture into Settings (identity only — score/half/timer untouched). */
	loadMatch(id: string): Promise<void>;
}

let subscribed = false;

export const usePresetsStore = create<PresetsStore>((set) => ({
	library: null,
	refresh: async () => {
		if (!subscribed) {
			subscribed = true;
			void listen<PresetLibrary>("presets:changed", ({ payload }) => set({ library: payload }));
		}
		const library = await invoke<PresetLibrary>("presets_get");
		set({ library });
		return library;
	},
	createTeam: (name, color) => invoke<TeamPreset>("team_preset_create", { name, color }),
	updateTeam: (id, patch) => invoke<TeamPreset>("team_preset_update", { id, patch }),
	deleteTeam: async (id) => {
		await invoke("team_preset_delete", { id });
	},
	createMatch: (label, homeTeamId, awayTeamId) =>
		invoke<MatchPreset>("match_preset_create", { label, homeTeamId, awayTeamId }),
	updateMatch: (id, patch) => invoke<MatchPreset>("match_preset_update", { id, patch }),
	deleteMatch: async (id) => {
		await invoke("match_preset_delete", { id });
	},
	loadMatch: async (id) => {
		await invoke("preset_load", { id });
	},
}));

/**
 * What the menu and the window show for a fixture: the label when set,
 * otherwise the derived `"{home} vs {away}"` (doc 09 §2).
 */
export function matchDisplayName(library: PresetLibrary, fixture: MatchPreset): string {
	const label = fixture.label?.trim();
	if (label) return label;
	const nameOf = (id: string): string => library.teams.find((team) => team.id === id)?.name ?? "?";
	return `${nameOf(fixture.homeTeamId)} vs ${nameOf(fixture.awayTeamId)}`;
}
