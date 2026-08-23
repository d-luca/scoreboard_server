import { formatTimer } from "@/lib/format";
import React from "react";
import { useStore } from "zustand";
import { DraftInput } from "../components/DraftInput";
import { RemoteButton } from "../components/RemoteButton";
import { SectionHeading } from "../components/SectionHeading";
import { SectionProps } from "./types";
import { INPUT_CLASS, PANEL_CLASS } from "./constants";
import { run } from "./utils";

function parseManualTimer(value: string): number | null {
	if (/^\d+$/.test(value)) {
		const seconds = Number(value);
		return Number.isSafeInteger(seconds) ? seconds : null;
	}
	const match = /^(\d{1,3}):([0-5]?\d)$/.exec(value);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function TimerSection({ store, disabled }: SectionProps): React.JSX.Element {
	const timer = useStore(store, (current) => current.state.timer);
	const running = useStore(store, (current) => current.state.isTimerRunning);
	const timerLoadout1 = useStore(store, (current) => current.state.timerLoadout1);
	const timerLoadout2 = useStore(store, (current) => current.state.timerLoadout2);
	const timerLoadout3 = useStore(store, (current) => current.state.timerLoadout3);
	const loadouts = [timerLoadout1, timerLoadout2, timerLoadout3];
	const start = useStore(store, (current) => current.startTimer);
	const pause = useStore(store, (current) => current.pauseTimer);
	const stop = useStore(store, (current) => current.stopTimer);
	const adjust = useStore(store, (current) => current.adjustTimer);
	const setTimer = useStore(store, (current) => current.setTimer);
	const applyLoadout = useStore(store, (current) => current.applyLoadout);

	return (
		<section className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-5`} aria-labelledby="timer-heading">
			<SectionHeading id="timer-heading">Timer</SectionHeading>
			<div className="remote-timer mb-4 text-center text-5xl font-bold tracking-tight text-amber-400 tabular-nums">
				{formatTimer(timer)}
			</div>
			<div className="grid grid-cols-2 gap-2 min-[521px]:grid-cols-3">
				<RemoteButton disabled={disabled} onClick={() => run(adjust(60))}>
					+1m
				</RemoteButton>
				<RemoteButton disabled={disabled} onClick={() => run(adjust(1))}>
					+1s
				</RemoteButton>
				<RemoteButton
					disabled={disabled || (!running && timer === 0)}
					onClick={() => run(running ? pause() : start())}
					className="col-span-2 min-[521px]:col-span-1"
				>
					{running ? "Pause" : "Start"}
				</RemoteButton>
				<RemoteButton tone="danger" disabled={disabled} onClick={() => run(adjust(-1))}>
					−1s
				</RemoteButton>
				<RemoteButton tone="danger" disabled={disabled} onClick={() => run(adjust(-60))}>
					−1m
				</RemoteButton>
				<RemoteButton
					tone="danger"
					disabled={disabled || (!running && timer === 0)}
					onClick={() => run(stop())}
				>
					Reset
				</RemoteButton>
			</div>

			<label
				className="mt-4 mb-1 block text-xs font-semibold tracking-wide text-slate-300 uppercase"
				htmlFor="manual-timer"
			>
				Set timer (MM:SS or seconds)
			</label>
			<div className="grid grid-cols-[1fr_auto] gap-2">
				<DraftInput
					id="manual-timer"
					className={`${INPUT_CLASS} remote-timer`}
					value={formatTimer(timer)}
					disabled={disabled}
					inputMode="numeric"
					placeholder="15:00"
					onCommit={(value) => {
						const seconds = parseManualTimer(value);
						if (seconds === null) return false;
						if (seconds !== timer) run(setTimer(seconds));
					}}
				/>
				<RemoteButton
					tone="amber"
					disabled={disabled}
					onClick={() => document.getElementById("manual-timer")?.blur()}
				>
					Set
				</RemoteButton>
			</div>

			<div className="mt-3 grid grid-cols-1 gap-2 min-[521px]:grid-cols-3" aria-label="Timer loadouts">
				{loadouts.map((seconds, index) => {
					const slot = (index + 1) as 1 | 2 | 3;
					return (
						<RemoteButton
							key={slot}
							tone="secondary"
							disabled={disabled}
							onClick={() => run(applyLoadout(slot))}
						>
							L{slot} {formatTimer(seconds)}
						</RemoteButton>
					);
				})}
			</div>
		</section>
	);
}
