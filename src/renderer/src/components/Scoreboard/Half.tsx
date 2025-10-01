import { JSX } from "react";

type HalfProps = {
	value: number;
};

export function Half({ value }: HalfProps): JSX.Element {
	return (
		<div
			className="mr-1 flex items-center justify-center bg-white px-3 text-2xl font-bold text-neutral-950"
			data-half
		>
			{value}
		</div>
	);
}
