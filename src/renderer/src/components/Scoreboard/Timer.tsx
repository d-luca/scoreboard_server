import { JSX } from "react";

type TimerProps = {
	value: number;
};

export function Timer({ value }: TimerProps): JSX.Element {
	return (
		<div
			className="flex items-center justify-center text-4xl"
			style={{ fontFamily: "Anton", lineHeight: 1 }}
			data-timer
		>
			{`${Math.floor(value / 60)
				.toString()
				.padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`}
		</div>
	);
}
