import { useBuzzerStore } from "@/lib/stores/buzzer-store";
import { useServerStore } from "@/lib/stores/server-store";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useEscapeToClose } from "@/lib/hooks/use-escape-to-close";
import React from "react";
import { BuzzerTab } from "./Tabs/BuzzerTab";
import { ScoreboardTab } from "./Tabs/ScoreboardTab";
import { ServerTab } from "./Tabs/ServerTab";

/**
 * Settings window (doc 04 §7.4). Every change dispatches immediately and is
 * persisted by Rust (debounced, atomic) — there is no Save button.
 * `Esc` closes the window.
 */

export type Tab = "scoreboard" | "server" | "buzzer";

export function SettingsWindow(): React.JSX.Element {
	useEscapeToClose();
	const [tab, setTab] = React.useState<Tab>("scoreboard");

	const settings = useSettingsStore((store) => store.settings);
	const refresh = useSettingsStore((store) => store.refresh);
	const refreshServer = useServerStore((store) => store.refresh);
	const refreshBuzzer = useBuzzerStore((store) => store.refresh);

	React.useEffect(() => {
		void refresh();
		void refreshServer();
		void refreshBuzzer();
	}, [refresh, refreshServer, refreshBuzzer]);

	if (!settings) {
		return (
			<div className="flex h-screen w-screen items-center justify-center">
				<p className="text-app-tertiary text-sm">Loading settings…</p>
			</div>
		);
	}

	return (
		<div className="bg-app-primary flex h-screen w-screen flex-col overflow-hidden">
			<header className="border-app-primary flex items-center justify-between gap-3 border-b px-4 py-3">
				<h1 className="font-[Poppins] text-lg font-semibold">Settings</h1>
				<nav className="flex gap-1" aria-label="Settings sections">
					{(
						[
							["scoreboard", "Scoreboard"],
							["server", "Server"],
							["buzzer", "Buzzer"],
						] as const
					).map(([key, label]) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							aria-current={tab === key ? "page" : undefined}
							className={`rounded-md px-3 py-1.5 text-sm transition-colors ${tab === key ? "bg-app-tertiary text-app-primary" : "text-app-tertiary hover:text-app-primary"}`}
						>
							{label}
						</button>
					))}
				</nav>
			</header>
			<main className="flex-1 overflow-auto p-4">
				{tab === "scoreboard" && <ScoreboardTab />}
				{tab === "server" && <ServerTab />}
				{tab === "buzzer" && <BuzzerTab />}
			</main>
			<footer className="text-app-quaternary border-app-primary border-t px-4 py-2 text-xs">
				Changes apply immediately and are saved automatically. Press Esc to close.
			</footer>
		</div>
	);
}
