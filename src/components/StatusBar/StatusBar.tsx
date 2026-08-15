import { JSX } from "react";
import { useScoreboardStore } from "../../lib/scoreboard-store";
import { useWindowStore } from "../../lib/window-store";
import { VerticalDivider } from "../ui/VerticalDivider";

/**
 * Status strip at the bottom of the main window (doc 04 §7.3).
 *
 * Only the badges that have data in Phase 2 are live (timer state,
 * connection). The server, client, control-token, overlay and REC badges are
 * wired as the corresponding phases land.
 */
export function StatusBar(): JSX.Element {
	const isTimerRunning = useScoreboardStore((store) => store.state.isTimerRunning);
	const connection = useScoreboardStore((store) => store.connection);
	const openWindow = useWindowStore((store) => store.openWindow);

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

			{/* Server — placeholder until Phase 3; opens the Outputs window. */}
			<button
				type="button"
				onClick={() => void openWindow("outputs")}
				title="Server status (available in Phase 3) — open Outputs & Sharing"
				className="text-app-tertiary hover:text-app-primary flex items-center gap-1.5 transition-colors"
			>
				<span className="bg-app-disabled inline-block size-2 rounded-full" />
				<span className="max-[640px]:hidden">server</span>
			</button>
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
