import { ChangeEvent, JSX } from "react";
import { Label } from "../ui/Label";
import { Input } from "../ui/Input";

type TimerLoadoutIndex = 1 | 2 | 3;

const timerLoadoutConfig: Array<{
	index: TimerLoadoutIndex;
	label: string;
	placeholder: string;
}> = [
	{ index: 1, label: "Loadout 1 (MM:SS)", placeholder: "45:00" },
	{ index: 2, label: "Loadout 2 (MM:SS)", placeholder: "90:00" },
	{ index: 3, label: "Loadout 3 (MM:SS)", placeholder: "30:00" },
];

interface TimerLoadoutSettingsProps {
	loadoutInputs: Record<TimerLoadoutIndex, string>;
	onLoadoutChange: (index: TimerLoadoutIndex) => (event: ChangeEvent<HTMLInputElement>) => void;
	onLoadoutFocus: (index: TimerLoadoutIndex) => () => void;
	onLoadoutBlur: (index: TimerLoadoutIndex) => () => void;
}

export function TimerLoadoutSettings({
	loadoutInputs,
	onLoadoutChange,
	onLoadoutFocus,
	onLoadoutBlur,
}: TimerLoadoutSettingsProps): JSX.Element {
	return (
		<div className="space-y-4">
			<Label>Timer Loadouts</Label>
			<div className="grid grid-cols-3 gap-4">
				{timerLoadoutConfig.map(({ index, label, placeholder }) => (
					<div key={index} className="space-y-2">
						<Label htmlFor={`timerLoadout${index}`}>{label}</Label>
						<Input
							id={`timerLoadout${index}`}
							type="text"
							inputMode="numeric"
							placeholder={placeholder}
							value={loadoutInputs[index]}
							pattern="^\\d{1,3}(:[0-5]\\d)?$"
							onFocus={onLoadoutFocus(index)}
							onBlur={onLoadoutBlur(index)}
							onChange={onLoadoutChange(index)}
						/>
					</div>
				))}
			</div>
		</div>
	);
}
