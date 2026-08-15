import React from "react";
import ReactDOM from "react-dom/client";
import { Scoreboard } from "../components/Scoreboard";
import { createScoreboardStore } from "../lib/scoreboard-store";
import { WsTransport } from "../lib/ws-transport";
import "../scoreboard.css";

/**
 * OBS browser-source page (doc 04 §5/§6), served over plain HTTP by the
 * embedded axum server — this entry must never import `@tauri-apps/*`
 * (enforced by an ESLint `no-restricted-imports` rule).
 *
 * The page is exactly 600×80 with a transparent background (see
 * `scoreboard.html`); OBS composites it over the game feed.
 */

const config = window.__SCOREBOARD__;
const transport = new WsTransport(config?.wsUrl ?? `ws://${window.location.host}/ws`);
const useStore = createScoreboardStore(transport);

function ScoreboardView(): React.JSX.Element {
	const state = useStore((store) => store.state);
	const connect = useStore((store) => store.connect);

	React.useEffect(() => {
		void connect();
	}, [connect]);

	// Preload Anton while the socket connects so the first rendered frame
	// already has the right glyphs (no FOUT in the OBS source).
	React.useEffect(() => {
		void document.fonts.load('400 32px "Anton"');
	}, []);

	return <Scoreboard {...state} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ScoreboardView />
	</React.StrictMode>,
);
