import { useMemo } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { resolveHotkeys, type HotkeyAction, type HotkeyBinding } from "../hotkeys";

/** Effective hotkey map: defaults until settings load, then with the user's overrides. */
export function useHotkeys(): Record<HotkeyAction, HotkeyBinding> {
	const overrides = useSettingsStore((store) => store.settings?.hotkeys);
	return useMemo(() => resolveHotkeys(overrides), [overrides]);
}
