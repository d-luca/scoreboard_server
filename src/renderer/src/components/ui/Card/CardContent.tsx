import { cn } from "@renderer/lib/utils";
import { HTMLAttributes, JSX } from "react";

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
	return <div className={cn("p-2 pt-0", className)} {...props} />;
}
