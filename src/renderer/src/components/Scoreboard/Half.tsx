import { JSX } from "react";

type HalfProps = {
	value: number;
};

export function Half({ value }: HalfProps): JSX.Element {
	return (
		<div className="flex items-center justify-center bg-white text-sm font-bold text-neutral-950" data-half>
			PERIODO {value}
		</div>
	);
}
