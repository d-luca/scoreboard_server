import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../../lib/utils";
import { inputVariants, type InputVariants } from "./variants";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, InputVariants {
	asChild?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type = "text", variant, controlSize, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : "input";

		return (
			<Comp
				ref={ref}
				className={cn(inputVariants({ variant, controlSize, className }))}
				{...(!asChild ? { type } : {})}
				{...props}
			/>
		);
	},
);
Input.displayName = "Input";

export { Input };
