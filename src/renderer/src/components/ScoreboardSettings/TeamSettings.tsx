import { ChangeEvent, JSX } from "react";
import { Label } from "../ui/Label";
import { Input } from "../ui/Input";

interface TeamSettingsProps {
	teamHomeName?: string;
	teamAwayName?: string;
	halfPrefix?: string;
	onTeamHomeNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
	onTeamAwayNameChange: (e: ChangeEvent<HTMLInputElement>) => void;
	onHalfPrefixChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function TeamSettings({
	teamHomeName,
	teamAwayName,
	halfPrefix,
	onTeamHomeNameChange,
	onTeamAwayNameChange,
	onHalfPrefixChange,
}: TeamSettingsProps): JSX.Element {
	return (
		<div className="grid grid-cols-3 gap-4">
			<div className="space-y-2">
				<Label htmlFor="teamHomeName">Team Home Name</Label>
				<Input
					id="teamHomeName"
					placeholder="Home Team"
					onChange={onTeamHomeNameChange}
					value={teamHomeName}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="teamAwayName">Team Away Name</Label>
				<Input
					id="teamAwayName"
					placeholder="Away Team"
					onChange={onTeamAwayNameChange}
					value={teamAwayName}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="halfPrefix">Half Prefix</Label>
				<Input id="halfPrefix" placeholder="PERIODO" onChange={onHalfPrefixChange} value={halfPrefix} />
			</div>
		</div>
	);
}
