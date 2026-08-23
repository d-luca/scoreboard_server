import { createScoreboardStore } from "./scoreboard-store";
import { tauriTransport } from "../tauri-transport";

/** Desktop singleton. Browser entries import only the transport-agnostic factory. */
export const useScoreboardStore = createScoreboardStore(tauriTransport);
