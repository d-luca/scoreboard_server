import { JSX } from "react";

type ValueBoxProps = {
	title?: string;
	value: number | string;
};

export function ValueBox({ value, title }: ValueBoxProps): JSX.Element {
	return (
		<div className="flex flex-col gap-2">
			<div className="text-app-secondary font-semibold">{title}</div>
			<div className="bg-app-primary border-app-primary flex w-28 items-center justify-center rounded-md border p-4">
				{value}
			</div>
		</div>
	);
}
