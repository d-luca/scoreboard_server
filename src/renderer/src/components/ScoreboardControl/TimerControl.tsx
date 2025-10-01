import { JSX, useState } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";

export type TimerControlProps = {
	time: number;
	onTimeChange?: (time: number) => void;
};

export function TimerControl({ time = 0, onTimeChange }: TimerControlProps): JSX.Element {
	const [isEditing, setIsEditing] = useState(false);
	const [tempTime, setTempTime] = useState(time);

	const handleTimeChange = (delta: number): void => {
		const newTime = Math.max(0, time + delta);
		onTimeChange?.(newTime);
	};

	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const parseTime = (timeStr: string): number => {
		const parts = timeStr.split(":");
		if (parts.length === 2) {
			const mins = parseInt(parts[0], 10) || 0;
			const secs = parseInt(parts[1], 10) || 0;
			return mins * 60 + secs;
		}
		return 0;
	};

	const handleTimeSubmit = (): void => {
		const newTime = parseTime(tempTime.toString());
		onTimeChange?.(newTime);
		setIsEditing(false);
	};

	const handleTimeCancel = (): void => {
		setTempTime(time);
		setIsEditing(false);
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={formatTime(time)} title="Timer" />

			{/* Direct Time Input */}
			<div className="flex w-full flex-col gap-2">
				{isEditing ? (
					<div className="flex gap-1">
						<input
							type="text"
							value={formatTime(tempTime)}
							onChange={(e) => setTempTime(parseTime(e.target.value))}
							className="flex-1 rounded border px-2 py-1 text-center text-xs"
							placeholder="MM:SS"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleTimeSubmit();
								if (e.key === "Escape") handleTimeCancel();
							}}
							autoFocus
						/>
						<Button size="sm" onClick={handleTimeSubmit} className="px-2">
							✓
						</Button>
						<Button size="sm" variant="outline" onClick={handleTimeCancel} className="px-2">
							✗
						</Button>
					</div>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setTempTime(time);
							setIsEditing(true);
						}}
						className="w-full text-xs"
					>
						Set Time
					</Button>
				)}
			</div>

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
