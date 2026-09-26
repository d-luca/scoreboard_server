/**
 * Runtime config injected by the axum server into the LAN pages
 * (`/scoreboard`, `/control`, `/value/:property`) — see
 * `src-tauri/src/server/assets.rs`.
 */
export interface ScoreboardPageConfig {
	/** WebSocket endpoint, derived from the request's Host header. */
	wsUrl: string;
	/** Control token; injected for `/control` only. */
	token: string | null;
	mode: "scoreboard" | "control" | "value";
	/** `/value/:property` pages only: which field to render. */
	property?: string;
	/**
	 * Score-roll presentation flag, injected for the digit-rendering pages
	 * (`/scoreboard`, `/value/*`). Lets the board start static when the
	 * setting is off, before the first WS frame arrives.
	 */
	scoreAnimationEnabled?: boolean;
}

declare global {
	interface Window {
		__SCOREBOARD__?: ScoreboardPageConfig;
	}
}
