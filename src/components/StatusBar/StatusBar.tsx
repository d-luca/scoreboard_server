import { JSX, useEffect } from "react";
import { useScoreboardStore } from "../../lib/stores/desktop-scoreboard-store";
import { useServerStore } from "../../lib/stores/server-store";
import { useWindowStore } from "../../lib/stores/window-store";
import { VerticalDivider } from "../ui/VerticalDivider";
import { StatusDot } from "./StatusDot";
import { StatusButton } from "./StatusButton";

/**
 * Status strip at the bottom of the main window (doc 04 §7.3).
 *
 * Live connection, timer, server, client, and control-token badges. Overlay
 * and recording badges are added by their optional phases.
 */
export function StatusBar(): JSX.Element {
	const isTimerRunning = useScoreboardStore((store) => store.state.isTimerRunning);
	const connection = useScoreboardStore((store) => store.connection);
	const openWindow = useWindowStore((store) => store.openWindow);
	const serverStatus = useServerStore((store) => store.status);
	const serverInfo = useServerStore((store) => store.info);
	const refreshServer = useServerStore((store) => store.refresh);

	useEffect(() => {
		void refreshServer();
	}, [refreshServer]);

	const running = serverStatus?.running ?? false;
	const port = serverStatus?.port ?? 0;
	const clients = serverStatus?.wsClients ?? 0;
	const authorizedClients = serverStatus?.authorizedClients ?? 0;
	const tokenRequired = serverInfo?.tokenRequired;

	return (
		<div className="border-app-primary bg-app-secondary flex h-8 shrink-0 items-center gap-3 border-t px-3 text-xs">
			{/* Connection */}
			<StatusDot
				active={connection === "connected"}
				activeColor="bg-success-500"
				label={connection === "connected" ? "connected" : connection}
				title={`Backend connection: ${connection}`}
			/>

			<VerticalDivider />

			{/* Timer source */}
			<StatusDot
				active={isTimerRunning}
				activeColor="bg-success-500"
				label={isTimerRunning ? "▶ running" : "⏸ paused"}
				title={isTimerRunning ? "Timer is running" : "Timer is paused"}
			/>

			<VerticalDivider />

			{/* Server (doc 04 §7.3) — opens the Outputs window. */}
			<StatusButton
				active={running}
				activeColor="bg-success-500"
				label={running ? `:${port}` : "server down"}
				title={running ? `HTTP server listening on port ${port}` : "HTTP server is not running"}
				onClick={() => void openWindow("outputs")}
			/>

			{/* Clients */}
			<StatusButton
				active={clients > 0}
				activeColor="bg-success-500"
				label={clients === 0 ? "no clients" : `${clients} client${clients === 1 ? "" : "s"}`}
				title={`${clients} WebSocket client${clients === 1 ? "" : "s"} connected; ${authorizedClients} authorized`}
				onClick={() => void openWindow("outputs")}
			/>

			<VerticalDivider />

			{/* Control token — opens Settings › Server. */}
			<StatusButton
				active={tokenRequired !== undefined}
				activeColor={tokenRequired ? "bg-success-500" : "bg-warning-500"}
				label={tokenRequired === undefined ? "token…" : tokenRequired ? "🔒 protected" : "🔓 open"}
				title={
					tokenRequired === undefined
						? "Loading control-token status"
						: tokenRequired
							? "Remote control requires a token"
							: "Remote control is open to the LAN"
				}
				onClick={() => void openWindow("settings")}
			/>
		</div>
	);
}
