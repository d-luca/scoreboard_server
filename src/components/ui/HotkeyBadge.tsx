import { JSX } from "react";

interface HotkeyBadgeProps {
	hotkey: string;
	className?: string;
}

export function HotkeyBadge({ hotkey, className = "" }: HotkeyBadgeProps): JSX.Element {
	if (!hotkey) return <></>;

	return (
		<kbd
			className={`rounded bg-black/10 px-1.5 py-0.5 text-xs font-semibold opacity-70 xl:text-sm ${className}`}
		>
			{hotkey}
		</kbd>
	);
}
