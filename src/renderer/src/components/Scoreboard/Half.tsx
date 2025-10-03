import { JSX } from "react";

type HalfProps = {
	value: number;
	prefix?: string;
};

export function Half({ value, prefix = "PERIODO" }: HalfProps): JSX.Element {
	return (
		<div className="flex items-center justify-center bg-white text-sm font-bold text-neutral-950" data-half>
			{prefix && (
				<>
					<span data-half-prefix>{prefix}</span>
					<span className="mx-0.5" />
				</>
			)}
			<span data-half-value>{value}</span>
		</div>
	);
}
