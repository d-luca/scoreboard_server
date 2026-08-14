import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";

/**
 * Placeholder for the phone remote page (Phase 4, doc 04 §8).
 *
 * Served over plain HTTP by the embedded axum server, so this entry must
 * never import `@tauri-apps/*` — enforced by an ESLint `no-restricted-imports`
 * rule.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<div className="font-[Poppins] text-2xl text-white">control entry — Phase 4</div>
	</React.StrictMode>,
);
