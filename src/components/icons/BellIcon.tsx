import { JSX } from "react";

export const BellIcon = ({ className }: { className?: string }): JSX.Element => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
		<path d="M10 19a2 2 0 0 0 4 0" />
	</svg>
);
