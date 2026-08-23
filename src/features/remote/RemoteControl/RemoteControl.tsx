import React from "react";
import { useStore } from "zustand";

import type { WsTransport } from "../../../lib/wsTransport";
import "./remote.css";
import { TeamsSection } from "./sections/TeamSection/TeamsSection";
import { TimerSection } from "./sections/TimerSection";
import { HalfSection } from "./sections/HalfSection";
import { SettingsSection } from "./sections/SettingsSection";
import { ScoreboardHook } from "./types";
import { BuzzerSection } from "./sections/BuzzerSection";

export type ButtonTone = "primary" | "secondary" | "danger" | "amber";

interface RemoteControlProps {
	store: ScoreboardHook;
	transport: WsTransport;
}

export function RemoteControl({ store, transport }: RemoteControlProps): React.JSX.Element {
	const connect = useStore(store, (current) => current.connect);
	const connection = useStore(store, (current) => current.connection);
	const authorization = useStore(store, (current) => current.authorization);
	const error = useStore(store, (current) => current.error);
	const disabled = connection !== "connected" || authorization !== "authorized";

	React.useEffect(() => {
		void connect();
	}, [connect]);

	console.log({ connect, connection, authorization, error, disabled });

	return (
		<div className="remote-page bg-slate-900 text-slate-50">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
				<header className="flex items-center justify-between gap-3 max-[520px]:flex-col max-[520px]:items-start">
					<div>
						<p className="text-sm font-semibold tracking-widest text-amber-400 uppercase">
							Live match control
						</p>
						<h1 className="text-2xl font-bold">Scoreboard Remote</h1>
					</div>
					<div
						className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 text-sm font-semibold"
						role="status"
						aria-live="polite"
					>
						<span
							className={`size-3 rounded-full ${connection === "connected" ? "bg-emerald-400" : "bg-red-500"}`}
							aria-hidden="true"
						/>
						{connection === "connected"
							? "Connected"
							: connection === "connecting"
								? "Connecting…"
								: "Disconnected"}
					</div>
				</header>

				{authorization === "unauthorized" ? (
					<div
						className="rounded-lg border border-amber-500 bg-amber-950 px-4 py-3 text-sm text-amber-100"
						role="alert"
					>
						<strong>Read-only:</strong> this control link is not authorized. Scan or open the latest control
						link from Outputs &amp; Sharing.
					</div>
				) : null}

				{error && authorization !== "unauthorized" ? (
					<div
						className="rounded-lg border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-100"
						role="alert"
					>
						{error}
					</div>
				) : null}

				<main className="grid grid-cols-12 gap-4">
					<TeamsSection store={store} disabled={disabled} />
					<TimerSection store={store} disabled={disabled} />
					<HalfSection store={store} disabled={disabled} />
					<SettingsSection store={store} disabled={disabled} />
					<BuzzerSection store={store} transport={transport} disabled={disabled} />
				</main>
			</div>
		</div>
	);
}
