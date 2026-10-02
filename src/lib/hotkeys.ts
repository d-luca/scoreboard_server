import type { Action } from "../bindings/Action";
import type { HotkeyBinding } from "../bindings/HotkeyBinding";
import type { Settings } from "../bindings/Settings";

export type { HotkeyBinding };

/**
 * Local (window-focused) hotkeys, with the Electron app's defaults [PARITY].
 *
 * These are *window* hotkeys: they fire only while the window is focused.
 * The global hotkeys that work while another app is focused are a separate,
 * planned `[OPTIONAL]` feature backed by `tauri-plugin-global-shortcut`.
 *
 * User overrides live in `Settings.hotkeys` (persisted by Rust); see
 * `resolveHotkeys` and the Key Bindings tab in Settings.
 */

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

function bind(key: string, modifiers: Partial<Omit<HotkeyBinding, "key">> = {}): HotkeyBinding {
	return { key, ctrl: false, shift: false, alt: false, ...modifiers };
}

/** Default map. Keys are stored lowercase for comparison. */
export const DEFAULT_HOTKEYS: Record<HotkeyAction, HotkeyBinding> = {
	increaseHomeScore: bind("q"),
	decreaseHomeScore: bind("a"),
	increaseAwayScore: bind("e"),
	decreaseAwayScore: bind("d"),
	increaseHalf: bind("]"),
	decreaseHalf: bind("["),
	startTimer: bind(" "),
	pauseTimer: bind("p"),
	stopTimer: bind("s"),
	increaseTimerSecond: bind("ArrowUp"),
	decreaseTimerSecond: bind("ArrowDown"),
	increaseTimerMinute: bind("ArrowUp", { shift: true }),
	decreaseTimerMinute: bind("ArrowDown", { shift: true }),
	timerLoadout1: bind("1", { ctrl: true }),
	timerLoadout2: bind("2", { ctrl: true }),
	timerLoadout3: bind("3", { ctrl: true }),
	resetScoreboard: bind("r", { ctrl: true, shift: true }),
};

/** Defaults with the user's overrides (`Settings.hotkeys`) applied; unknown ids are ignored. */
export function resolveHotkeys(
	overrides: Settings["hotkeys"] | undefined,
): Record<HotkeyAction, HotkeyBinding> {
	const resolved = { ...DEFAULT_HOTKEYS };
	if (!overrides) return resolved;
	for (const action of Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]) {
		const binding = overrides[action];
		if (binding) resolved[action] = binding;
	}
	return resolved;
}

function normalizeKey(key: string): string {
	return key.length === 1 ? key.toLowerCase() : key;
}

/** True when both bindings describe the same key combination. */
export function sameHotkey(a: HotkeyBinding, b: HotkeyBinding): boolean {
	return (
		normalizeKey(a.key) === normalizeKey(b.key) && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt
	);
}

/** Keys that cannot complete a combination on their own. */
const NON_BINDABLE_KEYS = new Set([
	"Shift",
	"Control",
	"Alt",
	"AltGraph",
	"Meta",
	"OS",
	"Fn",
	"FnLock",
	"CapsLock",
	"NumLock",
	"ScrollLock",
	"Dead",
	"Process",
	"Unidentified",
]);

/**
 * Binding captured from a key press, or `null` while only modifiers are held.
 * Meta (Win/Cmd) combos are rejected: `matchesHotkey` does not check Meta.
 */
export function hotkeyFromEvent(event: KeyboardEvent): HotkeyBinding | null {
	if (event.metaKey || NON_BINDABLE_KEYS.has(event.key)) return null;
	return bind(normalizeKey(event.key), { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey });
}

/** Main-window native menu accelerators (src-tauri/src/menu.rs); the menu would also fire. */
const MENU_ACCELERATORS = [",", "=", "+", "-", "0", "p"].map((key) => bind(key, { ctrl: true }));

export function isReservedHotkey(binding: HotkeyBinding): boolean {
	return MENU_ACCELERATORS.some((reserved) => sameHotkey(reserved, binding));
}

/** Human-readable label for tooltips and badges, e.g. `Ctrl + Shift + R`. */
export function hotkeyLabel(binding: HotkeyBinding): string {
	const parts: string[] = [];
	if (binding.ctrl) parts.push("Ctrl");
	if (binding.alt) parts.push("Alt");
	if (binding.shift) parts.push("Shift");
	parts.push(
		binding.key === " " ? "Space" : binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
	);
	return parts.join(" + ");
}

/** True when the event matches the binding (key + all modifiers). */
export function matchesHotkey(event: KeyboardEvent, binding: HotkeyBinding): boolean {
	return (
		normalizeKey(event.key) === normalizeKey(binding.key) &&
		event.ctrlKey === binding.ctrl &&
		event.altKey === binding.alt &&
		event.shiftKey === binding.shift
	);
}

/** Map a hotkey action to the domain `Action` it dispatches. */
export function hotkeyToAction(action: HotkeyAction): Action {
	switch (action) {
		case "increaseHomeScore":
			return { action: "score-home-inc" };
		case "decreaseHomeScore":
			return { action: "score-home-dec" };
		case "increaseAwayScore":
			return { action: "score-away-inc" };
		case "decreaseAwayScore":
			return { action: "score-away-dec" };
		case "increaseHalf":
			return { action: "half-inc" };
		case "decreaseHalf":
			return { action: "half-dec" };
		case "startTimer":
			return { action: "timer-start" };
		case "pauseTimer":
			return { action: "timer-pause" };
		case "stopTimer":
			return { action: "timer-stop" };
		case "increaseTimerSecond":
			return { action: "timer-adjust", data: { delta: 1 } };
		case "decreaseTimerSecond":
			return { action: "timer-adjust", data: { delta: -1 } };
		case "increaseTimerMinute":
			return { action: "timer-adjust", data: { delta: 60 } };
		case "decreaseTimerMinute":
			return { action: "timer-adjust", data: { delta: -60 } };
		case "timerLoadout1":
			return { action: "timer-loadout", data: { slot: 1 } };
		case "timerLoadout2":
			return { action: "timer-loadout", data: { slot: 2 } };
		case "timerLoadout3":
			return { action: "timer-loadout", data: { slot: 3 } };
		case "resetScoreboard":
			return { action: "reset" };
	}
}
