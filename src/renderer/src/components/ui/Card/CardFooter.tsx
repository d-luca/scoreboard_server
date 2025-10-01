import { cn } from "@renderer/lib/utils";
import { HTMLAttributes, JSX } from "react";

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
	return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}
