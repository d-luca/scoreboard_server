import { JSX } from "react";

export const PauseIcon = ({ className }: { className?: string }): JSX.Element => (
	<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<rect x="6" y="5" width="4" height="14" rx="1" />
		<rect x="14" y="5" width="4" height="14" rx="1" />
	</svg>
);
