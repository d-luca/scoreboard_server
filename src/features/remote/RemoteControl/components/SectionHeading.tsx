import React from "react";

export function SectionHeading({
	id,
	children,
}: {
	id: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<h2 id={id} className="mb-3 text-lg font-bold text-slate-100">
			{children}
		</h2>
	);
}
