import React from "react";
import ReactDOM from "react-dom/client";
import { formatTimer } from "../lib/format";
import { createScoreboardStore } from "../lib/scoreboard-store";
import type { ScoreboardPageConfig } from "../lib/scoreboard-page-config";
import { WsTransport } from "../lib/ws-transport";
import "../scoreboard.css";

/**
 * Single-value page at `/value/:property` (doc 02 §5.1) — a transparent,
 * white, 48 px bold centred value that updates over WebSocket, for
 * compositing individual fields in OBS. Served over plain HTTP: never
 * import `@tauri-apps/*` here.
 */

const config = window.__SCOREBOARD__ as ScoreboardPageConfig | undefined;
const property = config?.property ?? "";
const transport = new WsTransport(config?.wsUrl ?? `ws://${window.location.host}/ws`);
const useStore = createScoreboardStore(transport);

function readProperty(state: ReturnType<typeof useStore.getState>["state"], key: string): string {
	switch (key) {
		case "teamHomeName":
			return state.teamHomeName;
		case "teamAwayName":
			return state.teamAwayName;
		case "teamHomeScore":
			return String(state.teamHomeScore);
		case "teamAwayScore":
			return String(state.teamAwayScore);
		case "teamHomeColor":
			return state.teamHomeColor;
		case "teamAwayColor":
			return state.teamAwayColor;
		case "timer":
			return formatTimer(state.timer);
		case "half":
			return String(state.half);
		case "halfPrefix":
			return state.halfPrefix;
		case "isTimerRunning":
			return String(state.isTimerRunning);
		case "timerLoadout1":
			return String(state.timerLoadout1);
		case "timerLoadout2":
			return String(state.timerLoadout2);
		case "timerLoadout3":
			return String(state.timerLoadout3);
		default:
			return "";
	}
}

function ValueView(): React.JSX.Element {
	const state = useStore((store) => store.state);
	const connect = useStore((store) => store.connect);

	React.useEffect(() => {
		void connect();
	}, [connect]);

	return (
		<div
			className="flex h-screen w-screen items-center justify-center font-bold text-white"
			style={{ fontSize: 48, fontFamily: "Poppins, sans-serif" }}
		>
			{readProperty(state, property)}
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ValueView />
	</React.StrictMode>,
);
