import { cn } from "@renderer/lib/utils";
import { HTMLAttributes, JSX } from "react";

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>): JSX.Element {
	return <span className={cn("text-app-secondary text-sm", className)} {...props} />;
}
