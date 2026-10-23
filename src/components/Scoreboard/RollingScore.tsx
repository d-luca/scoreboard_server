import * as React from "react";
import { JSX } from "react";
import { ROLLING_DURATION_MS, useRollingScore } from "./useRollingScore";

type RollingScoreProps = {
	/** Value to display; negatives / fractions are floored to >= 0. */
	value: number;
	/**
	 * When false the value is rendered as plain text (no roll). Kept in sync
	 * with the canvas/video render path (`renderScoreboardToCanvas`), which
	 * only paints static glyphs — the OBS page opts in, everything else stays
	 * byte-identical to today.
	 */
	animated?: boolean;
};

export function RollingScore({ value, animated = true }: RollingScoreProps): JSX.Element {
	const { number, enabled, fromValue, tickKey } = useRollingScore(value, animated);
	if (!enabled) {
		return <>{number}</>;
	}

	const display = fromValue ?? number;
	const up = number >= display;
	const tiles = up ? [display, number] : [number, display];

	return (
		<div className="score-roll" role="img" aria-label={String(number)}>
			{fromValue === null ? (
				<span className="score-roll__digit" aria-hidden>
					{number}
				</span>
			) : (
				<div
					className="score-roll__strip"
					key={tickKey}
					aria-hidden
					style={
						{
							"--from": up ? "0em" : "-1em",
							"--to": up ? "-1em" : "0em",
							"--t": `${ROLLING_DURATION_MS}ms`,
						} as React.CSSProperties
					}
				>
					{tiles.map((tile, index) => (
						<div className="score-roll__tile" key={index}>
							{tile}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
