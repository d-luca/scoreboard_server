import { cn } from "@renderer/lib/utils";
import { HTMLAttributes, JSX } from "react";

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>): JSX.Element {
	return (
		<h2
			className={cn("text-app-primary text-xl leading-none font-bold tracking-wider", className)}
			{...props}
		/>
	);
}
