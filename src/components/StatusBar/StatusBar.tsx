import { JSX, useEffect } from "react";
import { useScoreboardStore } from "../../lib/scoreboard-store";
import { useServerStore } from "../../lib/server-store";
import { useWindowStore } from "../../lib/window-store";
import { VerticalDivider } from "../ui/VerticalDivider";

/**
 * Status strip at the bottom of the main window (doc 04 §7.3).
 *
 * Live in Phase 3: connection, timer state, server and client badges. The
 * control-token, overlay and REC badges are wired as Phases 4/7/8 land.
 */
export function StatusBar(): JSX.Element {
	const isTimerRunning = useScoreboardStore((store) => store.state.isTimerRunning);
	const connection = useScoreboardStore((store) => store.connection);
	const openWindow = useWindowStore((store) => store.openWindow);
	const serverStatus = useServerStore((store) => store.status);
	const refreshServer = useServerStore((store) => store.refresh);

	useEffect(() => {
		void refreshServer();
	}, [refreshServer]);

	const running = serverStatus?.running ?? false;
	const port = serverStatus?.port ?? 0;
	const clients = serverStatus?.wsClients ?? 0;

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
				title={`${clients} WebSocket client${clients === 1 ? "" : "s"} connected`}
				onClick={() => void openWindow("outputs")}
			/>
		</div>
	);
}

function StatusDot({
	active,
	activeColor,
	label,
	title,
}: {
	active: boolean;
	activeColor: string;
	label: string;
	title: string;
}): JSX.Element {
	return (
		<span className="text-app-tertiary flex items-center gap-1.5" title={title}>
			<span className={`inline-block size-2 rounded-full ${active ? activeColor : "bg-app-disabled"}`} />
			<span className="max-[640px]:hidden">{label}</span>
		</span>
	);
}

function StatusButton({
	active,
	activeColor,
	label,
	title,
	onClick,
}: {
	active: boolean;
	activeColor: string;
	label: string;
	title: string;
	onClick(): void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="text-app-tertiary hover:text-app-primary flex items-center gap-1.5 transition-colors"
		>
			<span className={`inline-block size-2 rounded-full ${active ? activeColor : "bg-app-disabled"}`} />
			<span className="max-[640px]:hidden">{label}</span>
		</button>
	);
}
