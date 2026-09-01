import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";
import { useEscapeToClose } from "../lib/hooks/useEscapeToClose";
import appPackageJson from "../../package.json";

/** About window: version, licences, ffmpeg credit (doc 01 §9.1). */
function AboutShell(): React.JSX.Element {
	useEscapeToClose();
	return (
		<div className="flex h-screen w-screen flex-col items-center justify-center gap-2 p-6 text-center">
			<h1 className="font-[Anton] text-3xl">Scoreboard Server</h1>
			<p className="text-app-tertiary text-sm">Version {appPackageJson.version}</p>
			<p className="text-app-quaternary max-w-xs text-xs">
				A live scoreboard for OBS over the LAN. Rebuilt on Tauri.
			</p>
			<p className="text-app-quaternary text-xs">Press Esc to close</p>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<AboutShell />
	</React.StrictMode>,
);
