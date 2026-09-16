import { cn } from "@/lib/utils";
import { JSX } from "react";

export function StatusDot({
	active = false,
	activeColor = "bg-success-500",
	label,
	title,
	visibleTitle,
}: {
	active?: boolean;
	activeColor?: string;
	label: string;
	title: string;
	visibleTitle?: string;
}): JSX.Element {
	return (
		<div className="text-app-tertiary flex flex-col gap-0.5" title={title}>
			{visibleTitle && <span className="text-[10px]">{visibleTitle}</span>}
			<div className="flex items-center gap-1.5">
				{active && <span className={cn("inline-block size-2 rounded-full", activeColor)} />}
				<span className="max-[640px]:hidden">{label}</span>
			</div>
		</div>
	);
}
