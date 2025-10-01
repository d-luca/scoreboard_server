import { JSX } from "react";

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

export function TeamControl({ score = 0, title, onScoreChange }: TeamControlProps): JSX.Element {
	const handleScoreChange = (delta: number): void => {
		const newScore = Math.max(0, score + delta);
		onScoreChange?.(newScore);
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={score} title={title} />

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
