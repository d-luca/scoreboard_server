import { JSX } from "react";

export const PlusIcon = ({ className }: { className?: string }): JSX.Element => (
	<svg
		className={className}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M12 5v14M5 12h14" />
	</svg>
);
