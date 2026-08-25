import { usePresetsStore } from "@/lib/stores/presetsStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import React from "react";
import { MatchesTab } from "./Tabs/MatchesTab";
import { TeamsTab } from "./Tabs/TeamsTab";

export type Tab = "teams" | "matches";

/**
 * Presets window (doc 09 §7): master/detail with `Teams` | `Matches` tabs.
 *
 * Unlike Settings, edits are explicit — the detail pane edits a local draft
 * with Save/Discard, because immediate persistence would put a half-typed
 * record into the native menu on every keystroke. When a draft is dirty, the
 * first `Esc` discards it and the second closes the window; closing with a
 * dirty draft via the title bar prompts.
 */
export function PresetsWindow(): React.JSX.Element {
	const [tab, setTab] = React.useState<Tab>("teams");
	const [dirty, setDirty] = React.useState(false);
	const [discardSignal, setDiscardSignal] = React.useState(0);
	const [focusMatchId, setFocusMatchId] = React.useState<string | null>(null);

	const library = usePresetsStore((store) => store.library);
	const refresh = usePresetsStore((store) => store.refresh);

	React.useEffect(() => {
		void refresh();
	}, [refresh]);

	// First Esc discards a dirty draft; the second closes the window.
	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key !== "Escape") return;
			if (dirty) {
				setDiscardSignal((count) => count + 1);
				return;
			}
			void getCurrentWindow().close();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [dirty]);

	// Closing with a dirty draft via the title bar prompts.
	React.useEffect(() => {
		if (!dirty) return;
		const unlisten = getCurrentWindow().onCloseRequested((event) => {
			if (!window.confirm("Discard unsaved changes?")) {
				event.preventDefault();
			}
		});
		return () => {
			void unlisten.then((off) => off());
		};
	}, [dirty]);

	const confirmDiscard = (): boolean => !dirty || window.confirm("Discard unsaved changes?");

	const switchTab = (next: Tab): void => {
		if (next === tab || !confirmDiscard()) return;
		setFocusMatchId(null); // a manual switch never carries a jump target
		setTab(next);
	};

	const jumpToMatch = (matchId: string): void => {
		if (!confirmDiscard()) return;
		setFocusMatchId(matchId);
		setTab("matches");
	};

	if (!library) {
		return (
			<div className="flex h-screen w-screen items-center justify-center">
				<p className="text-app-tertiary text-sm">Loading presets…</p>
			</div>
		);
	}

	return (
		<div className="bg-app-primary flex h-screen w-screen flex-col overflow-hidden">
			<header className="border-app-primary flex items-center justify-between gap-3 border-b px-4 py-3">
				<h1 className="font-[Poppins] text-lg font-semibold">Presets</h1>
				<nav className="flex gap-1" aria-label="Preset sections">
					{(
						[
							["teams", "Teams"],
							["matches", "Matches"],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							type="button"
							onClick={() => switchTab(key)}
							aria-current={tab === key ? "page" : undefined}
							className={`rounded-md px-3 py-1.5 text-sm transition-colors ${tab === key ? "bg-app-tertiary text-app-primary" : "text-app-tertiary hover:text-app-primary"}`}
						>
							{label}
						</button>
					))}
				</nav>
			</header>
			<main className="flex-1 overflow-hidden p-4">
				{tab === "teams" ? (
					<TeamsTab
						library={library}
						onDirtyChange={setDirty}
						discardSignal={discardSignal}
						onJumpToMatch={jumpToMatch}
					/>
				) : (
					<MatchesTab
						library={library}
						onDirtyChange={setDirty}
						discardSignal={discardSignal}
						focusMatchId={focusMatchId}
					/>
				)}
			</main>
			<footer className="text-app-quaternary border-app-primary border-t px-4 py-2 text-xs">
				Loading a preset from the menu changes team identity only — scores, half and timer are never touched.
				Press Esc to close.
			</footer>
		</div>
	);
}
