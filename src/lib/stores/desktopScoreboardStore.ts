import { confirm } from "@tauri-apps/plugin-dialog";
import { createScoreboardStore } from "./scoreboardStore";
import { tauriTransport } from "../tauriTransport";

/** Desktop singleton. Browser entries import only the transport-agnostic factory. */
export const useScoreboardStore = createScoreboardStore(tauriTransport, (message, action) =>
	confirm(message, {
		title: action === "timer-stop" ? "Reset timer?" : "Load timer preset?",
		kind: "warning",
		okLabel: action === "timer-stop" ? "Reset timer" : "Load preset",
		cancelLabel: "Cancel",
	}),
);
