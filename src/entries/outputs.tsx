import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";

/**
 * Placeholder for the Outputs & Sharing window (filled in Phase 3/4, doc 04 §7.5).
 *
 * Created on demand by the Rust window manager (`windows.rs`, Phase 2) as a
 * singleton — this entry only ever runs inside a Tauri webview.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<div className="font-[Poppins] text-2xl text-white">outputs entry — Phase 3/4</div>
	</React.StrictMode>,
);
