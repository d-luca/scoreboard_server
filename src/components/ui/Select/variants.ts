import { cva, type VariantProps } from "class-variance-authority";

export const selectTriggerVariants = cva(
	"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
	{
		variants: {
			variant: {
				default: "border-app-secondary hover:border-gray-400 focus:border-blue-500 bg-app-tertiary",
				outline: "border-gray-200 bg-transparent hover:bg-gray-50",
			},
			size: {
				default: "h-10 px-3 py-2",
				sm: "h-9 px-3 text-sm",
				lg: "h-11 px-4 py-2",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export const selectContentVariants = cva(
	"relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
	{
		variants: {
			variant: {
				default: "border-app-primary bg-app-tertiary shadow-lg",
				popover: "border-gray-100 bg-white shadow-xl",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export const selectItemVariants = cva(
	"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
	{
		variants: {
			variant: {
				default: "hover:bg-gray-100 focus:bg-blue-50 focus:text-blue-900",
				subtle: "hover:bg-gray-50 focus:bg-gray-100",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export type SelectTriggerVariants = VariantProps<typeof selectTriggerVariants>;
export type SelectContentVariants = VariantProps<typeof selectContentVariants>;
export type SelectItemVariants = VariantProps<typeof selectItemVariants>;
