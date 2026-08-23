import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Close the current window when `Esc` is pressed (doc 01 §9.2). Used on
 * `settings`, `outputs` and `about` — not on `recording` or
 * `video-generator`, where `Esc` could interrupt work.
 */
export function useEscapeToClose(): void {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") return;
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
			) {
				return;
			}
			void getCurrentWindow().close();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
}
