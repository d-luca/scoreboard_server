import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";

export type TimerControlProps = {
	time: number;
	onTimeChange?: (time: number) => void;
};

export function TimerControl({ time = 0, onTimeChange }: TimerControlProps): JSX.Element {
	const handleTimeChange = (delta: number): void => {
		const newTime = Math.max(0, time + delta);
		onTimeChange?.(newTime);
	};

	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={formatTime(time)} title="Timer" />

			{/* Time Adjustment Controls */}
			<div className="flex flex-col gap-2">
				<div className="flex w-full gap-2">
					<Button className="w-full" onClick={() => handleTimeChange(1)}>
						+1s
					</Button>
					<Button variant="destructive" className="w-full" onClick={() => handleTimeChange(-1)}>
						-1s
					</Button>
				</div>
				<div className="flex w-full gap-2">
					<Button className="w-full" onClick={() => handleTimeChange(60)}>
						+1m
					</Button>
					<Button variant="destructive" className="w-full" onClick={() => handleTimeChange(-60)}>
						-1m
					</Button>
				</div>
			</div>
		</div>
	);
}
