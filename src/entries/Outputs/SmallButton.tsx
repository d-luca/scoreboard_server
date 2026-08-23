import React from "react";

export function SmallButton({
	children,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
	return (
		<button
			type="button"
			className="bg-app-tertiary text-app-secondary hover:bg-app-quaternary shrink-0 rounded px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
			{...props}
		>
			{children}
		</button>
	);
}
