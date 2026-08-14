import React from "react";
import ReactDOM from "react-dom/client";
import "../scoreboard.css";

/**
 * Placeholder for the OBS browser-source page (Phase 3, doc 04 §2).
 *
 * Served over plain HTTP by the embedded axum server, so this entry must
 * never import `@tauri-apps/*` — enforced by an ESLint `no-restricted-imports`
 * rule and a CI grep for `__TAURI__` in the built chunk.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<div className="font-[Anton] text-2xl text-lime-400">scoreboard entry — Phase 3</div>
	</React.StrictMode>,
);
