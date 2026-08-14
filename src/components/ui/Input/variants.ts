import { cva, type VariantProps } from "class-variance-authority";

export const inputVariants = cva(
	"flex w-full rounded-md border bg-app-tertiary text-sm text-app-primary shadow-sm transition-colors placeholder:text-app-quaternary focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium",
	{
		variants: {
			variant: {
				default: "border-app-secondary hover:border-primary-400",
				outline: "border-app-secondary bg-transparent hover:border-primary-500",
				subtle: "border-transparent bg-surface-secondary hover:border-app-tertiary",
				error: "border-error-500 focus-visible:ring-error-500",
				success: "border-success-500 focus-visible:ring-success-500",
			},
			controlSize: {
				default: "h-10 px-3 py-2",
				sm: "h-9 px-2 py-1 text-xs",
				lg: "h-11 px-4 py-3 text-base",
			},
		},
		defaultVariants: {
			variant: "default",
			controlSize: "default",
		},
	},
);

export type InputVariants = VariantProps<typeof inputVariants>;
