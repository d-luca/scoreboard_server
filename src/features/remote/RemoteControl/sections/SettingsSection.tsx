import type { ScoreboardPatch } from "@/bindings/ScoreboardPatch";
import { formatTimer } from "@/lib/format";
import React from "react";
import { useStore } from "zustand";
import { DraftInput } from "../components/DraftInput";

import { RemoteButton } from "../components/RemoteButton";
import { SectionHeading } from "../components/SectionHeading";
import { SectionProps } from "./types";
import { INPUT_CLASS, PANEL_CLASS } from "./constants";
import { run } from "./utils";

function parseLoadout(value: string): number | null {
	if (value === "") return 0;
	if (/^\d{1,3}$/.test(value)) return Number(value);
	const match = /^(\d{1,3}):([0-5]?\d)$/.exec(value);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function filterDurationInput(event: React.FormEvent<HTMLInputElement>): void {
	const input = event.currentTarget;
	const filtered = input.value.replace(/[^\d:]/g, "");
	const [minutes = "", ...secondsParts] = filtered.split(":");
	input.value = `${minutes.slice(0, 3)}${secondsParts.length > 0 ? `:${secondsParts.join("").slice(0, 2)}` : ""}`;
}

export function SettingsSection({ store, disabled }: SectionProps): React.JSX.Element {
	const state = useStore(store, (current) => current.state);
	const patch = useStore(store, (current) => current.patch);
	const reset = useStore(store, (current) => current.reset);

	const commitPatch = (next: ScoreboardPatch): void => {
		void patch(next).catch(() => undefined);
	};

	const loadouts: Array<{ key: "timerLoadout1" | "timerLoadout2" | "timerLoadout3"; value: number }> = [
		{ key: "timerLoadout1", value: state.timerLoadout1 },
		{ key: "timerLoadout2", value: state.timerLoadout2 },
		{ key: "timerLoadout3", value: state.timerLoadout3 },
	];

	return (
		<section
			className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-7`}
			aria-labelledby="settings-heading"
		>
			<SectionHeading id="settings-heading">Settings</SectionHeading>
			<label
				className="mb-1 block text-xs font-semibold tracking-wide text-slate-300 uppercase"
				htmlFor="half-prefix"
			>
				Half prefix
			</label>
			<DraftInput
				id="half-prefix"
				className={INPUT_CLASS}
				value={state.halfPrefix}
				disabled={disabled}
				maxLength={24}
				onCommit={(value) => {
					if (value && value !== state.halfPrefix) commitPatch({ halfPrefix: value });
					return value.length > 0;
				}}
			/>

			<div className="mt-4 grid gap-3 min-[521px]:grid-cols-3">
				{loadouts.map(({ key, value }, index) => (
					<label key={key} className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
						Loadout {index + 1}
						<DraftInput
							className={`${INPUT_CLASS} remote-timer mt-1`}
							value={formatTimer(value)}
							disabled={disabled}
							inputMode="numeric"
							placeholder="15:00"
							onInput={filterDurationInput}
							onCommit={(draft) => {
								const seconds = parseLoadout(draft);
								if (seconds === null) return false;
								if (seconds !== value) commitPatch({ [key]: seconds });
							}}
						/>
					</label>
				))}
			</div>

			<RemoteButton
				tone="danger"
				disabled={disabled}
				className="mt-4 w-full"
				onClick={() => {
					if (
						window.confirm("Reset scores, timer, and half? Team names, colors, and loadouts will be kept.")
					) {
						run(reset());
					}
				}}
			>
				Reset All
			</RemoteButton>
		</section>
	);
}
