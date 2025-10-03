import { JSX } from "react";

type VerticalDividerProps = {
	skew?: number;
};

export function VerticalDivider({ skew }: VerticalDividerProps): JSX.Element {
	return (
		<div
			className="flex h-full w-0.5 bg-slate-500"
			style={{ transform: skew ? `skewX(${skew}deg)` : undefined }}
		/>
	);
}
