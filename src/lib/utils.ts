import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes and tailwind-merge for Tailwind-specific merging
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
