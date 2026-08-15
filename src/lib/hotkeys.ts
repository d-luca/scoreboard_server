import type { Action } from "../bindings/Action";

/**
 * Local (window-focused) hotkeys, defaults from doc 05 §5.1 [PARITY].
 *
 * These are *window* hotkeys: they fire only while the window is focused.
 * The global hotkeys that work while another app is focused are a separate
 * `[OPTIONAL]` feature (Phase 7) backed by `tauri-plugin-global-shortcut`.
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

export interface HotkeyBinding {
	/** `KeyboardEvent.key` value, e.g. `"q"`, `" "`, `"ArrowUp"`, `"]"`. */
	key: string;
	ctrl?: boolean;
	shift?: boolean;
	alt?: boolean;
}

/** Default map (doc 05 §5.1). Keys are stored lowercase for comparison. */
export const DEFAULT_HOTKEYS: Record<HotkeyAction, HotkeyBinding> = {
	increaseHomeScore: { key: "q" },
	decreaseHomeScore: { key: "a" },
	increaseAwayScore: { key: "e" },
	decreaseAwayScore: { key: "d" },
	increaseHalf: { key: "]" },
	decreaseHalf: { key: "[" },
	startTimer: { key: " " },
	pauseTimer: { key: "p" },
	stopTimer: { key: "s" },
	increaseTimerSecond: { key: "ArrowUp" },
	decreaseTimerSecond: { key: "ArrowDown" },
	increaseTimerMinute: { key: "ArrowUp", shift: true },
	decreaseTimerMinute: { key: "ArrowDown", shift: true },
	timerLoadout1: { key: "1", ctrl: true },
	timerLoadout2: { key: "2", ctrl: true },
	timerLoadout3: { key: "3", ctrl: true },
	resetScoreboard: { key: "r", ctrl: true, shift: true },
};

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
	const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
	const bindingKey = binding.key.length === 1 ? binding.key.toLowerCase() : binding.key;
	return (
		key === bindingKey &&
		event.ctrlKey === (binding.ctrl ?? false) &&
		event.altKey === (binding.alt ?? false) &&
		event.shiftKey === (binding.shift ?? false)
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
