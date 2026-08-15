/**
 * Runtime config injected by the axum server into the LAN pages
 * (`/scoreboard`, `/control`, `/value/:property`) — see
 * `src-tauri/src/server/assets.rs` (tauri-rebuild doc 03 §4.3).
 */
export interface ScoreboardPageConfig {
	/** WebSocket endpoint, derived from the request's Host header. */
	wsUrl: string;
	/** Control token; injected for `/control` only, and only in Phase 4+. */
	token: string | null;
	mode: "scoreboard" | "control" | "value";
	/** `/value/:property` pages only: which field to render. */
	property?: string;
}

declare global {
	interface Window {
		__SCOREBOARD__?: ScoreboardPageConfig;
	}
}
