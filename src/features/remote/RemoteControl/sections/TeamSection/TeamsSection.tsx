import React from "react";
import { SectionHeading } from "../../components/SectionHeading";
import { TeamEditor } from "./TeamEditor";
import { SectionProps } from "../types";
import { PANEL_CLASS } from "../constants";

export function TeamsSection({ store, disabled }: SectionProps): React.JSX.Element {
	return (
		<section className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-7`} aria-labelledby="teams-heading">
			<SectionHeading id="teams-heading">Teams</SectionHeading>
			<div className="grid gap-4 min-[521px]:grid-cols-2">
				<TeamEditor store={store} side="home" disabled={disabled} />
				<TeamEditor store={store} side="away" disabled={disabled} />
			</div>
		</section>
	);
}
