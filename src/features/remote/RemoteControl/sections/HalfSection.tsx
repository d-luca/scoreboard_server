import React from "react";
import { useStore } from "zustand";
import { RemoteButton } from "../components/RemoteButton";
import { SectionHeading } from "../components/SectionHeading";
import { SectionProps } from "./types";
import { PANEL_CLASS } from "./constants";
import { run } from "./utils";

export function HalfSection({ store, disabled }: SectionProps): React.JSX.Element {
	const half = useStore(store, (current) => current.state.half);
	const prefix = useStore(store, (current) => current.state.halfPrefix);
	const increase = useStore(store, (current) => current.incHalf);
	const decrease = useStore(store, (current) => current.decHalf);

	return (
		<section className={`${PANEL_CLASS} col-span-12 min-[720px]:col-span-5`} aria-labelledby="half-heading">
			<SectionHeading id="half-heading">Half</SectionHeading>
			<div className="grid grid-cols-[1fr_minmax(0,2fr)_1fr] items-center gap-2">
				<RemoteButton
					tone="danger"
					disabled={disabled}
					onClick={() => run(decrease())}
					aria-label="Decrease half"
				>
					−
				</RemoteButton>
				<output
					className="text-center text-xl font-bold wrap-break-word text-amber-400"
					aria-label="Current half"
				>
					{prefix} {half}
				</output>
				<RemoteButton disabled={disabled} onClick={() => run(increase())} aria-label="Increase half">
					+
				</RemoteButton>
			</div>
		</section>
	);
}
