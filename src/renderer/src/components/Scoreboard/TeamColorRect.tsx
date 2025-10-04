import { JSX } from "react";

type TeamColorReactProps = {
	color: string;
	"data-home-color"?: boolean;
	"data-away-color"?: boolean;
};

export function TeamColorRect({ color, ...dataProps }: TeamColorReactProps): JSX.Element {
	return (
		<div
			className="h-full w-2"
			style={{ backgroundColor: color ?? "#ffffff", transform: "skewX(-15deg)" }}
			{...dataProps}
		/>
	);
}
