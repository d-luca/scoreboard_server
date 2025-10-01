import { JSX } from "react";
import { Button } from "../ui/Button/Button";
import { ValueBox } from "../ui/ValueBox";
import { useScoreboardStore } from "@renderer/stores/scoreboardStore";

export function TimerControl(): JSX.Element {
	const store = useScoreboardStore();

	const formatTime = (seconds: number): string => {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	return (
		<div className="flex flex-col items-center gap-4">
			<ValueBox value={formatTime(store.timer ?? 0)} title="Timer" />

			{/* Time Adjustment Controls */}
			<div className="flex flex-col gap-2">
				<div className="flex w-full gap-2">
					<Button className="w-full" onClick={store.increaseTimerByOneSecond}>
						+1s
					</Button>
					<Button variant="destructive" className="w-full" onClick={store.decreaseTimerByOneSecond}>
						-1s
					</Button>
				</div>
				<div className="flex w-full gap-2">
					<Button className="w-full" onClick={store.increaseTimerByOneMinute}>
						+1m
					</Button>
					<Button variant="destructive" className="w-full" onClick={store.decreaseTimerByOneMinute}>
						-1m
					</Button>
				</div>
			</div>
		</div>
	);
}
