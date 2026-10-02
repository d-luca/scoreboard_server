import { useEffect } from "react";
import { useScoreboardStore } from "../stores/desktopScoreboardStore";
import { hotkeyToAction, matchesHotkey, type HotkeyAction } from "../hotkeys";
import { useHotkeys } from "./useHotkeys";

/**
 * Window-focused keyboard shortcuts [PARITY].
 *
 * Ignores events whose target is an `INPUT`, `TEXTAREA` or `contentEditable`
 * element, so typing in a field never triggers a hotkey. Iterates the
 * mapping in action order; the first match calls `preventDefault()` and
 * dispatches.
 */
export function useLocalHotkeys(): void {
	const dispatch = useScoreboardStore((store) => store.dispatch);
	const hotkeys = useHotkeys();

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
			) {
				return;
			}

			for (const action of Object.keys(hotkeys) as HotkeyAction[]) {
				const binding = hotkeys[action];
				if (matchesHotkey(event, binding)) {
					event.preventDefault();
					void dispatch(hotkeyToAction(action)).catch(() => undefined);
					break;
				}
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [dispatch, hotkeys]);
}
