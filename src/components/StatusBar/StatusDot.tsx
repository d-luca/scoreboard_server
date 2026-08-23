import { JSX } from "react";

export function StatusDot({
	active,
	activeColor,
	label,
	title,
}: {
	active: boolean;
	activeColor: string;
	label: string;
	title: string;
}): JSX.Element {
	return (
		<span className="text-app-tertiary flex items-center gap-1.5" title={title}>
			<span className={`inline-block size-2 rounded-full ${active ? activeColor : "bg-app-disabled"}`} />
			<span className="max-[640px]:hidden">{label}</span>
		</span>
	);
}
