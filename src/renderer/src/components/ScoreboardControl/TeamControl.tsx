import { JSX, useState } from "react";

import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";

export type TeamControlProps = {
	score: number;
	title: string;
	teamName?: string;
	teamColor?: string;
	onScoreChange?: (score: number) => void;
	onNameChange?: (name: string) => void;
	onColorChange?: (color: string) => void;
};

export function TeamControl({
	score = 0,
	title,
	teamName = "",
	teamColor = "#000000",
	onScoreChange,
	onNameChange,
	onColorChange,
}: TeamControlProps): JSX.Element {
	const [isEditing, setIsEditing] = useState(false);
	const [tempName, setTempName] = useState(teamName);

	const handleScoreChange = (delta: number): void => {
		const newScore = Math.max(0, score + delta);
		onScoreChange?.(newScore);
	};

	const handleNameSubmit = (): void => {
		onNameChange?.(tempName);
		setIsEditing(false);
	};

	const handleNameCancel = (): void => {
		setTempName(teamName);
		setIsEditing(false);
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={score} title={title} />

			{/* Team Name Editor */}
			<div className="flex w-full flex-col gap-2">
				{isEditing ? (
					<div className="flex gap-1">
						<input
							type="text"
							value={tempName}
							onChange={(e) => setTempName(e.target.value)}
							className="flex-1 rounded border px-2 py-1 text-xs"
							placeholder="Team name"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleNameSubmit();
								if (e.key === "Escape") handleNameCancel();
							}}
							autoFocus
						/>
						<Button size="sm" onClick={handleNameSubmit} className="px-2">
							✓
						</Button>
						<Button size="sm" variant="outline" onClick={handleNameCancel} className="px-2">
							✗
						</Button>
					</div>
				) : (
					<Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="w-full text-xs">
						{teamName || "Set Name"}
					</Button>
				)}

				{/* Color Picker */}
				<div className="flex items-center gap-2">
					<input
						type="color"
						value={teamColor}
						onChange={(e) => onColorChange?.(e.target.value)}
						className="h-6 w-6 cursor-pointer rounded border"
						title="Team color"
					/>
					<span className="text-xs text-gray-600">Color</span>
				</div>
			</div>

			{/* Score Controls */}
			<div className="flex size-full gap-2">
				<Button className="size-full" onClick={() => handleScoreChange(1)}>
					+1
				</Button>
				<Button variant="destructive" className="size-full w-full" onClick={() => handleScoreChange(-1)}>
					-1
				</Button>
			</div>
		</div>
	);
}
