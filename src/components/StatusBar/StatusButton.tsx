import { JSX } from "react";

export function StatusButton({
	active,
	activeColor,
	label,
	title,
	onClick,
}: {
	active: boolean;
	activeColor: string;
	label: string;
	title: string;
	onClick(): void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="text-app-tertiary hover:text-app-primary flex items-center gap-1.5 transition-colors"
		>
			<span className={`inline-block size-2 rounded-full ${active ? activeColor : "bg-app-disabled"}`} />
			<span className="max-[640px]:hidden">{label}</span>
		</button>
	);
}
