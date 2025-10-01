import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";

export type HalfControlProps = {
	half: number;
	onHalfChange?: (half: number) => void;
};

export function HalfControl({ half = 1, onHalfChange }: HalfControlProps): JSX.Element {
	const handleHalfChange = (delta: number): void => {
		const newHalf = Math.max(1, half + delta);
		onHalfChange?.(newHalf);
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={half} title="Half" />
			<div className="flex size-full gap-2">
				<Button className="size-full" onClick={() => handleHalfChange(1)}>
					+1
				</Button>
				<Button variant="destructive" className="size-full" onClick={() => handleHalfChange(-1)}>
					-1
				</Button>
			</div>
		</div>
	);
}
