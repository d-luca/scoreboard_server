import { JSX } from "react";
import { Card } from "../ui/Card/Card";
import { CardTitle } from "../ui/Card/CardTitle";
import { CardContent } from "../ui/Card/CardContent";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { ColorPicker } from "../ui/ColorPicker";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";

export function ScoreboardSettings(): JSX.Element {
	const store = useScoreboardStore();

	const handleTeamHomeNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
		store.setTeamHomeName(e.target.value);
	};

	return (
		<Card className="border-app-primary flex flex-col gap-4 border">
			<CardTitle>Scoreboard Settings</CardTitle>
			<CardContent className="flex flex-col gap-6">
				{/* Team Settings */}
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="teamHomeName">Team Home Name</Label>
						<Input
							id="teamHomeName"
							placeholder="Home Team"
							onChange={handleTeamHomeNameChange}
							value={store.teamHomeName}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="teamAwayName">Team Away Name</Label>
						<Input id="teamAwayName" placeholder="Away Team" />
					</div>
				</div>

				{/* Team Colors */}
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-2">
						<Label htmlFor="teamHomeColor">Team Home Color</Label>
						<ColorPicker value="#00ff00" />
					</div>
					<div className="space-y-2">
						<Label htmlFor="teamAwayColor">Team Away Color</Label>
						<ColorPicker value="#ff0000" />
					</div>
				</div>

				{/* Timer Loadouts */}
				<div className="space-y-4">
					<h4 className="text-sm font-medium text-gray-900">Timer Loadouts</h4>
					<div className="grid grid-cols-3 gap-4">
						<div className="space-y-2">
							<Label htmlFor="timerLoadout1">Loadout 1 (minutes)</Label>
							<Input id="timerLoadout1" type="number" placeholder="45" min="0" max="120" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="timerLoadout2">Loadout 2 (minutes)</Label>
							<Input id="timerLoadout2" type="number" placeholder="90" min="0" max="120" />
						</div>
						<div className="space-y-2">
							<Label htmlFor="timerLoadout3">Loadout 3 (minutes)</Label>
							<Input id="timerLoadout3" type="number" placeholder="30" min="0" max="120" />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
