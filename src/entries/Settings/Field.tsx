import { Label } from "@/components/ui/Label";

export function Field({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="flex flex-col gap-1.5">
			{htmlFor ? <Label htmlFor={htmlFor}>{label}</Label> : <Label>{label}</Label>}
			{children}
		</div>
	);
}
