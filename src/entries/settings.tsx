import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";
import { useEscapeToClose } from "../lib/use-escape-to-close";

/**
 * Shell for the Settings window (content lands in Phase 5, doc 04 §7.4).
 *
 * Exists now so the window plumbing (singleton open/focus, geometry
 * persistence, Esc-to-close) is proven before the content exists (Phase 2).
 */
function SettingsShell(): React.JSX.Element {
	useEscapeToClose();
	return (
		<div className="flex h-screen w-screen flex-col items-center justify-center gap-2 p-6 text-center">
			<h1 className="font-[Poppins] text-2xl font-semibold">Settings</h1>
			<p className="text-app-tertiary text-sm">Scoreboard, Server and Buzzer settings arrive in Phase 5.</p>
			<p className="text-app-quaternary text-xs">Press Esc to close</p>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<SettingsShell />
	</React.StrictMode>,
);
