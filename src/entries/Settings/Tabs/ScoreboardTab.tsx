import { ColorPicker } from "@/components/ui/ColorPicker";
import { DraftInput } from "@/features/remote/RemoteControl/components/DraftInput";
import { useSettingsStore } from "@/lib/settings-store";
import React from "react";
import { LoadoutInput } from "../LoadoutInput";
import { SectionHeading } from "../SectionHeading";
import { Field } from "../Field";
import { INPUT_CLASS } from "../constants";

export function ScoreboardTab(): React.JSX.Element {
	const settings = useSettingsStore((store) => store.settings)!;
	const set = useSettingsStore((store) => store.set);

	const commit = (patch: Parameters<typeof set>[0]): void => {
		void set(patch).catch(() => undefined);
	};

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6">
			<section className="flex flex-col gap-3" aria-labelledby="settings-teams">
				<SectionHeading id="settings-teams">Teams</SectionHeading>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Team Home Name" htmlFor="team-home-name">
						<DraftInput
							id="team-home-name"
							className={INPUT_CLASS}
							maxLength={32}
							value={settings.teamHomeName}
							onCommit={(value) => {
								if (!value.trim()) return false;
								commit({ teamHomeName: value });
							}}
						/>
					</Field>
					<Field label="Team Away Name" htmlFor="team-away-name">
						<DraftInput
							id="team-away-name"
							className={INPUT_CLASS}
							maxLength={32}
							value={settings.teamAwayName}
							onCommit={(value) => {
								if (!value.trim()) return false;
								commit({ teamAwayName: value });
							}}
						/>
					</Field>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Home Colour">
						<ColorPicker
							value={settings.teamHomeColor}
							onChange={(color) => commit({ teamHomeColor: color })}
						/>
					</Field>
					<Field label="Away Colour">
						<ColorPicker
							value={settings.teamAwayColor}
							onChange={(color) => commit({ teamAwayColor: color })}
						/>
					</Field>
				</div>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-half">
				<SectionHeading id="settings-half">Half</SectionHeading>
				<Field label="Half Prefix" htmlFor="half-prefix">
					<DraftInput
						id="half-prefix"
						className={INPUT_CLASS}
						maxLength={24}
						value={settings.halfPrefix}
						onCommit={(value) => commit({ halfPrefix: value })}
					/>
				</Field>
			</section>

			<section className="flex flex-col gap-3" aria-labelledby="settings-loadouts">
				<SectionHeading id="settings-loadouts">Timer Loadouts</SectionHeading>
				<p className="text-app-tertiary text-xs">
					Durations applied by the L1–L3 buttons. Accepts <code>MM:SS</code>, <code>M:SS</code> or bare
					seconds.
				</p>
				<div className="grid gap-4 sm:grid-cols-3">
					{([0, 1, 2] as const).map((index) => (
						<Field key={index} label={`Loadout ${index + 1}`} htmlFor={`loadout-${index + 1}`}>
							<LoadoutInput
								id={`loadout-${index + 1}`}
								value={settings.timerLoadouts[index]}
								onCommit={(seconds) => {
									const next = [...settings.timerLoadouts] as [number, number, number];
									next[index] = seconds;
									commit({ timerLoadouts: next });
								}}
							/>
						</Field>
					))}
				</div>
			</section>
		</div>
	);
}
