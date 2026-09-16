import { JSX, useEffect } from "react";
import { formatTimer } from "../../lib/format";
import { useScoreboardStore } from "../../lib/stores/desktopScoreboardStore";
import { useServerStore } from "../../lib/stores/serverStore";
import { useWindowStore } from "../../lib/stores/windowStore";
import { VerticalDivider } from "../ui/VerticalDivider";
import { StatusDot } from "./StatusDot";
import { StatusButton } from "./StatusButton";

/**
 * Status strip at the bottom of the main window (doc 04 §7.3).
 *
 * Live connection, timer, server, client, control-token and REC badges. The
 * overlay badge is added by its optional phase.
 */
export function StatusBar(): JSX.Element {
	const isTimerRunning = useScoreboardStore((store) => store.state.isTimerRunning);
	const timerDirection = useScoreboardStore((store) => store.state.timerDirection);
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
	// REC badge (doc 06 §A6): hidden when idle, pulsing red `● REC MM:SS`
	// while recording; driven by `ServerStatus.recording*`.
	const recordingActive = serverStatus?.recordingActive ?? false;
	const recordingSeconds = serverStatus?.recordingSeconds ?? 0;
	const directionArrow = timerDirection === "up" ? "▲" : "▼";
	const directionLabel = timerDirection === "up" ? "count up" : "countdown";

	return (
		<div className="border-app-primary bg-app-secondary flex h-10 shrink-0 items-center gap-3 border-t px-3 text-xs">
			{/* Connection */}
			{connection !== "connected" && (
				<>
					<StatusDot
						active
						activeColor={connection === "connecting" ? "bg-amber-500" : "bg-error-500"}
						label={connection}
						title={`Backend connection: ${connection}`}
					/>
					<VerticalDivider />
				</>
			)}

			{/* Timer source */}
			<StatusDot
				label={`${directionArrow} ${isTimerRunning ? "▶ running" : "⏸ paused"}`}
				title={`Timer ${directionLabel}: ${isTimerRunning ? "running" : "paused"}`}
				visibleTitle={"Timer"}
			/>

			<VerticalDivider />

			{/* Server (doc 04 §7.3) — opens the Outputs window. */}
			<StatusButton
				active={running}
				activeColor="bg-success-500"
				label={running ? `:${port}` : "server down"}
				title={running ? `HTTP server listening on port ${port}` : "HTTP server is not running"}
				onClick={() => void openWindow("outputs")}
				visibleTitle={"Outputs & Sharing"}
			/>

			{/* Clients */}
			<StatusButton
				active={clients > 0}
				activeColor="bg-success-500"
				label={clients.toString()}
				title={`${clients} WebSocket client${clients === 1 ? "" : "s"} connected; ${authorizedClients} authorized`}
				onClick={() => void openWindow("outputs")}
				visibleTitle={"Clients"}
			/>

			<VerticalDivider />

			{/* Control token — opens Settings › Server. */}
			<StatusButton
				label={tokenRequired === undefined ? "token…" : tokenRequired ? "🔒 Required" : "🔓 Not required"}
				title={
					tokenRequired === undefined
						? "Loading control-token status"
						: tokenRequired
							? "Remote control requires a token"
							: "Remote control is open to the LAN"
				}
				onClick={() => void openWindow("settings")}
				visibleTitle={"Control Token"}
			/>

			{/* Recording (doc 04 §7.3) — hidden when idle; opens the Recording window. */}
			{recordingActive ? (
				<>
					<VerticalDivider />
					<StatusButton
						active
						activeColor="bg-error-500 animate-pulse"
						label={`REC ${formatTimer(recordingSeconds)}`}
						title={`Recording in progress (${formatTimer(recordingSeconds)}) — click to open the Recording window`}
						onClick={() => void openWindow("recording")}
						visibleTitle={"Recording"}
					/>
				</>
			) : null}
		</div>
	);
}
