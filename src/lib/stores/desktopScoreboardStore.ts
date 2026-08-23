import { createScoreboardStore } from "./scoreboardStore";
import { tauriTransport } from "../tauriTransport";

/** Desktop singleton. Browser entries import only the transport-agnostic factory. */
export const useScoreboardStore = createScoreboardStore(tauriTransport);
