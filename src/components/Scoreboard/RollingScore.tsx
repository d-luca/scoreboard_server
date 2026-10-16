import * as React from "react";
import { JSX } from "react";
import { useEffect, useState } from "react";

const DURATION_MS = 460;

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
	const number = Math.max(0, Math.floor(value));

	const [reduced] = useState(
		() =>
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);

	// `settled` is the last *committed* (fully-shown) value — written only when
	// a tick completes, so it is always the value the user last saw. While a
	// tick is in flight, `tickTarget` is the value the roll animates TOWARD and
	// `fromValue` the value it animates FROM (the previous target when
	// re-targeted mid-tick) — both null at rest. All three are **state, not
	// refs**: they drive what renders, so React's rules (and the React Compiler)
	// require them to be state. `tickKey` bumps once per started tick so the
	// rolling strip's <div> key changes and the CSS animation restarts cleanly
	// on every re-target.
	const [settled, setSettled] = useState<number>(number);
	const [fromValue, setFromValue] = useState<number | null>(null);
	const [tickTarget, setTickTarget] = useState<number | null>(null);
	const [tickKey, setTickKey] = useState(0);

	// Start (or re-target) a tick the moment the target changes. This
	// render-phase state update is the React-idiomatic "derive from props"
	// pattern — one extra render, no refs read during render, no loop. The
	// guard is `number !== (tickTarget ?? settled)`: at rest it compares
	// against the committed value, and while rolling it compares against the
	// target the current roll already heads to, so it fires exactly once per
	// new value (it is false again on the re-render after `tickTarget` is
	// captured). A mid-tick press therefore moves `fromValue` to the roll's
	// previous target and points it at the new value — every rapid press gets
	// its own restart instead of being swallowed.
	if (number !== (tickTarget ?? settled)) {
		setFromValue(tickTarget ?? settled);
		setTickTarget(number);
		setTickKey((k) => k + 1);
	}

	// When the tick duration elapses, commit the target: `settled` moves and
	// the tick state clears → the value re-renders as crisp plain text. The
	// closure captures the target; the cleanup cancels the stale timer when the
	// effect re-runs on a mid-tick re-target, so the commit always matches the
	// latest target (one tick after the LAST press, not the first).
	useEffect(() => {
		if (tickTarget === null) {
			return;
		}
		const target = tickTarget;
		const id = window.setTimeout(() => {
			setSettled(target);
			setFromValue(null);
			setTickTarget(null);
		}, DURATION_MS);
		return () => window.clearTimeout(id);
	}, [tickTarget]);

	if (!animated || reduced) {
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
							"--t": `${DURATION_MS}ms`,
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
