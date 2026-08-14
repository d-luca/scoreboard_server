import React from "react";
import ReactDOM from "react-dom/client";
import "../global.css";

/**
 * Placeholder for the Settings window (filled in Phase 5, doc 04 §7.4).
 *
 * Created on demand by the Rust window manager (`windows.rs`, Phase 2) as a
 * singleton — this entry only ever runs inside a Tauri webview.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<div className="font-[Poppins] text-2xl text-white">settings entry — Phase 5</div>
	</React.StrictMode>,
);
