import React from "react";

export function SectionHeading({
	id,
	children,
}: {
	id: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<h2 id={id} className="text-app-primary text-base font-semibold">
			{children}
		</h2>
	);
}
