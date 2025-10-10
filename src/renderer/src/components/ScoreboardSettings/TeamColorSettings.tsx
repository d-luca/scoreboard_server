import { JSX } from "react";
import { Label } from "../ui/Label";
import { ColorPicker } from "../ui/ColorPicker";

interface TeamColorSettingsProps {
	teamHomeColor?: string;
	teamAwayColor?: string;
	onTeamHomeColorChange: (color: string) => void;
	onTeamAwayColorChange: (color: string) => void;
}

export function TeamColorSettings({
	teamHomeColor,
	teamAwayColor,
	onTeamHomeColorChange,
	onTeamAwayColorChange,
}: TeamColorSettingsProps): JSX.Element {
	return (
		<div className="grid grid-cols-2 gap-4">
			<div className="space-y-2">
				<Label htmlFor="teamHomeColor">Team Home Color</Label>
				<ColorPicker value={teamHomeColor} onChange={onTeamHomeColorChange} />
			</div>
			<div className="space-y-2">
				<Label htmlFor="teamAwayColor">Team Away Color</Label>
				<ColorPicker value={teamAwayColor} onChange={onTeamAwayColorChange} />
			</div>
		</div>
	);
}
