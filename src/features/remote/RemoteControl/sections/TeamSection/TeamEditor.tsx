import type { ScoreboardPatch } from "@/bindings/ScoreboardPatch";
import React from "react";
import { useStore } from "zustand";
import { DraftInput } from "../../components/DraftInput";
import { RemoteButton } from "../../components/RemoteButton";
import { SectionProps } from "../types";
import { INPUT_CLASS } from "../constants";
import { run } from "../utils";

const PRESET_COLORS = ["#ffffff", "#000000", "#ffcc00", "#0066cc", "#00cc00"] as const;

export function TeamEditor({
	store,
	side,
	disabled,
}: SectionProps & { side: "home" | "away" }): React.JSX.Element {
	const isHome = side === "home";
	const nameKey = isHome ? "teamHomeName" : "teamAwayName";
	const colorKey = isHome ? "teamHomeColor" : "teamAwayColor";
	const name = useStore(store, (current) => current.state[nameKey]);
	const color = useStore(store, (current) => current.state[colorKey]);
	const score = useStore(store, (current) => current.state[isHome ? "teamHomeScore" : "teamAwayScore"]);
	const patch = useStore(store, (current) => current.patch);
	const increase = useStore(store, (current) => (isHome ? current.incHome : current.incAway));
	const decrease = useStore(store, (current) => (isHome ? current.decHome : current.decAway));

	const update = (next: ScoreboardPatch): void => {
		void patch(next).catch(() => undefined);
	};

	return (
		<div className="rounded-lg bg-slate-900/60 p-3">
			<label
				className="mb-1 block text-xs font-semibold tracking-wide text-slate-300 uppercase"
				htmlFor={`${side}-name`}
			>
				{isHome ? "Home" : "Away"} name
			</label>
			<DraftInput
				id={`${side}-name`}
				className={INPUT_CLASS}
				value={name}
				disabled={disabled}
				maxLength={32}
				autoComplete="off"
				onCommit={(next) => {
					if (next && next !== name) update({ [nameKey]: next });
					return next.length > 0;
				}}
			/>

			<div className="mt-3 flex items-center gap-2">
				<input
					type="color"
					value={color}
					disabled={disabled}
					onChange={(event) => update({ [colorKey]: event.currentTarget.value })}
					aria-label={`${isHome ? "Home" : "Away"} custom color`}
					className="w-14 cursor-pointer border border-slate-600 bg-slate-700 p-1"
				/>
				<code className="text-xs text-slate-300">{color}</code>
			</div>

			<div className="mt-2 grid grid-cols-5 gap-2" aria-label={`${isHome ? "Home" : "Away"} color presets`}>
				{PRESET_COLORS.map((preset) => (
					<button
						key={preset}
						type="button"
						disabled={disabled}
						onClick={() => update({ [colorKey]: preset })}
						className={`border-2 ${color.toLowerCase() === preset ? "border-amber-400" : "border-slate-600"}`}
						style={{ backgroundColor: preset }}
						aria-label={`Set ${isHome ? "home" : "away"} color to ${preset}`}
						aria-pressed={color.toLowerCase() === preset}
					/>
				))}
			</div>

			<div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
				<RemoteButton
					tone="danger"
					disabled={disabled}
					onClick={() => run(decrease())}
					aria-label={`Decrease ${side} score`}
				>
					−
				</RemoteButton>
				<output
					className="min-w-16 text-center text-4xl font-black tabular-nums"
					aria-label={`${side} score`}
				>
					{score}
				</output>
				<RemoteButton
					disabled={disabled}
					onClick={() => run(increase())}
					aria-label={`Increase ${side} score`}
				>
					+
				</RemoteButton>
			</div>
		</div>
	);
}
