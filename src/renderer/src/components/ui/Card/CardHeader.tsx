import { cn } from "@renderer/lib/utils";
import { HTMLAttributes, JSX } from "react";

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
	return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}
