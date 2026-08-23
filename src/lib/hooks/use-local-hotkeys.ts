import { useEffect } from "react";
import { useScoreboardStore } from "../stores/desktop-scoreboard-store";
import { DEFAULT_HOTKEYS, hotkeyToAction, matchesHotkey, type HotkeyAction } from "../hotkeys";

/**
 * Window-focused keyboard shortcuts (doc 04 §9, doc 05 §5.1) [PARITY].
 *
 * Ignores events whose target is an `INPUT`, `TEXTAREA` or `contentEditable`
 * element, so typing in a field never triggers a hotkey. Iterates the
 * mapping in action order; the first match calls `preventDefault()` and
 * dispatches.
 */
export function useLocalHotkeys(): void {
	const dispatch = useScoreboardStore((store) => store.dispatch);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
			) {
				return;
			}

			for (const action of Object.keys(DEFAULT_HOTKEYS) as HotkeyAction[]) {
				const binding = DEFAULT_HOTKEYS[action];
				if (matchesHotkey(event, binding)) {
					event.preventDefault();
					void dispatch(hotkeyToAction(action)).catch(() => undefined);
					break;
				}
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [dispatch]);
}
