import { cva } from "class-variance-authority";

export const buttonVariants = cva(
	"inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				default: "bg-primary-600 text-white shadow hover:bg-primary-700",
				destructive: "bg-error-600 text-white shadow-sm hover:bg-error-700",
				outline:
					"border border-primary-600 bg-transparent text-primary-400 shadow-sm hover:bg-primary-600 hover:text-white",
				secondary: "bg-secondary-600 text-white shadow-sm hover:bg-secondary-700",
				ghost: "text-app-secondary hover:bg-surface-primary hover:text-app-primary",
				link: "text-primary-600 underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 rounded-md px-3 text-xs",
				lg: "h-10 rounded-md px-8",
				icon: "h-9 w-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);
