import { cn } from "@/lib/utils";
import { JSX } from "react";

export function StatusButton({
	active = false,
	activeColor = "bg-success-500",
	label,
	title,
	onClick,
	visibleTitle,
}: {
	active?: boolean;
	activeColor?: string;
	label: string;
	title: string;
	onClick(): void;
	visibleTitle?: string;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className="text-app-tertiary hover:text-app-primary flex flex-col gap-0.5 transition-colors"
		>
			{visibleTitle && <span className="text-[10px]">{visibleTitle}</span>}
			<div className="flex items-center gap-1.5">
				{active && <span className={cn("inline-block size-2 rounded-full", activeColor)} />}
				<span className="max-[640px]:hidden">{label}</span>
			</div>
		</button>
	);
}
