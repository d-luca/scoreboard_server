import { JSX } from "react";

import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";

export type TeamControlProps = {
	score: number;
	title: string;
	onIncreaseScore?: () => void;
	onDecreaseScore?: () => void;
};

export function TeamControl({
	score = 0,
	title,
	onDecreaseScore,
	onIncreaseScore,
}: TeamControlProps): JSX.Element {
	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={score} title={title} />

			{/* Score Controls */}
			<div className="flex size-full gap-2">
				<Button className="size-full" onClick={onIncreaseScore}>
					+1
				</Button>
				<Button variant="destructive" className="size-full w-full" onClick={onDecreaseScore}>
					-1
				</Button>
			</div>
		</div>
	);
}
