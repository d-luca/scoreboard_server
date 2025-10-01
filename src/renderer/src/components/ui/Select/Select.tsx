import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "../../../lib/utils";
import { selectTriggerVariants, selectContentVariants, selectItemVariants } from "./variants";

// Simple icon components using CSS/Unicode
const ChevronDownIcon = ({ className }: { className?: string }): React.ReactElement => (
	<svg
		className={className}
		width="15"
		height="15"
		viewBox="0 0 15 15"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="m4.93179 5.43179c0.15698 -0.15698 0.41143 -0.15698 0.56841 0l2.5 2.5l2.5 -2.5c0.15698 -0.15698 0.41143 -0.15698 0.56841 0c0.15698 0.15698 0.15698 0.41142 0 0.56840l-2.78461 2.78461c-0.15698 0.15698 -0.41143 0.15698 -0.56841 0l-2.78461 -2.78461c-0.15698 -0.15698 -0.15698 -0.41142 0 -0.56840z"
			fill="currentColor"
			fillRule="evenodd"
			clipRule="evenodd"
		/>
	</svg>
);

const CheckIcon = ({ className }: { className?: string }): React.ReactElement => (
	<svg
		className={className}
		width="15"
		height="15"
		viewBox="0 0 15 15"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			d="m11.4669 3.72684c0.15698 0.15713 0.15668 0.41126 -0.00045 0.56823l-5.25022 5.25022c-0.15696 0.15696 -0.41113 0.15696 -0.41109 0.15696c-0.15696 0 -0.41113 0 -0.56809 -0.15696l-2.25 -2.25c-0.15713 -0.15697 -0.15743 -0.4111 -0.00045 -0.56823c0.15697 -0.15713 0.4111 -0.15743 0.56823 -0.00045l1.94151 1.94151l4.97002 -4.97001c0.15713 -0.15698 0.41126 -0.15668 0.56823 0.00045z"
			fill="currentColor"
			fillRule="evenodd"
			clipRule="evenodd"
		/>
	</svg>
);

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Trigger ref={ref} className={cn(selectTriggerVariants({ className }))} {...props}>
		{children}
		<SelectPrimitive.Icon asChild>
			<ChevronDownIcon className="h-4 w-4 opacity-50" />
		</SelectPrimitive.Icon>
	</SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content
			ref={ref}
			className={cn(selectContentVariants({ className }))}
			position={position}
			{...props}
		>
			<SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Item ref={ref} className={cn(selectItemVariants({ className }))} {...props}>
		<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
			<SelectPrimitive.ItemIndicator>
				<CheckIcon className="h-4 w-4" />
			</SelectPrimitive.ItemIndicator>
		</span>
		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
	</SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem };
