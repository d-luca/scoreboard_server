import React from "react";
import ReactDOM from "react-dom/client";
import { RemoteControl } from "../features/remote/RemoteControl/RemoteControl";
import { createControlWsUrl } from "../features/remote/control-url";
import { createScoreboardStore } from "../lib/stores/scoreboard-store";
import { WsTransport } from "../lib/ws-transport";
import "../global.css";

/** Browser-only phone remote. This dependency graph intentionally contains no Tauri modules. */
const config = window.__SCOREBOARD__;
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = createControlWsUrl(
	config?.wsUrl ?? `${protocol}//${window.location.host}/ws`,
	config?.token ?? null,
);
const transport = new WsTransport(wsUrl);
const store = createScoreboardStore(transport);

window.addEventListener("pagehide", () => transport.close(), { once: true });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<RemoteControl store={store} transport={transport} />
	</React.StrictMode>,
);
