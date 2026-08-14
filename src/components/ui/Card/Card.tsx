import { HTMLAttributes, JSX } from "react";
import { cn } from "../../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
	return (
		<div
			className={cn(
				"border-app-primary bg-surface-primary text-app-primary rounded-lg border p-4 shadow-md",
				className,
			)}
			{...props}
		/>
	);
}
