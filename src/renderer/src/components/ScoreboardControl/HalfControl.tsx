import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";

export function HalfControl(): JSX.Element {
	const store = useScoreboardStore();

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={store.half ?? 1} title="Half" />
			<div className="flex size-full gap-2">
				<Button className="size-full" onClick={store.increaseHalf}>
					+1
				</Button>
				<Button variant="destructive" className="size-full" onClick={store.decreaseHalf}>
					-1
				</Button>
			</div>
		</div>
	);
}
