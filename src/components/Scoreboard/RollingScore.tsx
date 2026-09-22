import * as React from "react";
import { JSX } from "react";
import { useEffect, useState } from "react";

const DURATION_MS = 460;

/**
 * Odometer-style digit roll for a scoreboard score.
 *
 * Two invariants the naive version broke, and how this fixes them:
 *
 * 1. DIRECTION ON CARRIES. A single continuous transform can only move one way,
 *    so on a carry (29→30) the ones rolled *backwards* (9→8→…) while the tens
 *    rolled forwards. Here every change is one explicit "tick": each changed
 *    digit animates from its old glyph through its tiles to the new glyph in
 *    ONE direction this update — up on increase/carry, down on decrease — so a
 *    ones digit that carries (9→0) rolls forward (9→10→11…→19→0), matching the
 *    tens above it.
 *
 * 2. CRISP RESTING STATE. An always-present CSS transform (especially with
 *    `will-change: transform`) promotes a digit to its own composited
 *    (rasterized) layer that reads softer than in-flow text at scale — the
 *    "blur" the live/OBS feed shows. So the tile strip exists only *during* a
 *    change; the instant it settles the value re-renders as plain text with no
 *    transform and no `will-change`, exactly as crisp as the original component.
 *
 * 3. RETARGET MID-TICK. A press that lands while a roll is in flight commits
 *    the value the roll was heading to and starts a fresh roll from there
 *    toward the new target. Every rapid press is therefore its own visible
 *    animation — nothing ever replays a finished one or shows a frozen
 *    digit — and the number reaches the real score one tick (460 ms) after
 *    the LAST press instead of after the first.
 *
 * Steady values are otherwise stateless: React reorders cells by a stable
 * place-from-right key as the digit count grows/shrinks.
 */

/** The digit at a given place (0 = ones) of a number; blanks past the length. */
function displayDigits(value: number, place: number): number {
	const str = value.toString();
	const idx = str.length - 1 - place; // right-aligned index
	return idx < 0 ? 0 : str.charCodeAt(idx) - 48;
}

/** Ordered glyphs: `from` … `digit`, stepping +1 (up) or −1 (down) mod 10. */
function tilesFor(digit: number, from: number, up: boolean): number[] {
	const tiles = [from];
	let p = from;
	while (p !== digit) {
		p = up ? (p + 1) % 10 : (p - 1 + 10) % 10;
		tiles.push(p);
	}
	return tiles;
}

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

	const display = fromValue ?? number; // value currently shown (old, while ticking)
	const up = number >= display; // direction for EVERY changed digit this update

	const newDigits = number
		.toString()
		.split("")
		.map((c) => c.charCodeAt(0) - 48);
	const oldLen = display.toString().length;

	return (
		<div className="score-roll" role="img" aria-label={String(number)}>
			{newDigits.map((digit, i) => {
				const place = newDigits.length - 1 - i; // 0 = ones, stable across re-renders
				const isNew = place >= oldLen; // digit wasn't visible before (e.g. new hundreds in 99→100)
				// Right-align the OLD digits to the new width so each place maps to
				// its own old glyph (leading blanks for places that were blank).
				// A place rolls only while a tick is active AND its glyph changed.
				// Everything else renders the crisp plain digit (this also keeps
				// untouched digits crisp while a neighbour rolls).
				const from = isNew ? digit : displayDigits(display, place);
				const rolling = fromValue !== null && !isNew && from !== digit;

				if (!rolling) {
					return (
						<span className="score-roll__cell" key={place} aria-hidden>
							<span className="score-roll__digit">{digit}</span>
						</span>
					);
				}

				const rawTiles = tilesFor(digit, from, up);
				// Travel direction == value direction. An up roll lays tiles
				// naturally (from→target) and moves the strip up; a down roll
				// reverses the tiles (target at top) and moves the strip down,
				// so new digits enter from the top and decreasing scores read
				// as a roll down instead of a mirrored roll up.
				const tiles = up ? rawTiles : [...rawTiles].reverse();
				const dist = `${tiles.length - 1}em`;
				// Strip AND final share the tick identity: the final is the
				// crisp rest-glyph of THIS roll, so a mid-tick re-target must
				// replace it (restarting its opacity fade) together with the
				// strip — otherwise a previous target's fade-in keeps running
				// and ghosts that digit over the newly restarted strip.
				const tickId = `${display}-${place}-${tickKey}`;
				return (
					<div
						key={place}
						className="score-roll__cell score-roll__rolling"
						aria-hidden
						style={
							{
								// Signed travel distance: an up roll goes 0 → `-dist`,
								// a down roll goes `-dist` → 0 (content shifts down).
								"--from": up ? "0em" : `calc(-1 * ${dist})`,
								"--to": up ? `calc(-1 * ${dist})` : "0em",
								"--t": `${DURATION_MS}ms`,
							} as React.CSSProperties
						}
					>
						<div className="score-roll__strip" key={`s-${tickId}`}>
							{tiles.map((t, ti) => (
								<div className="score-roll__tile" key={ti}>
									{t}
								</div>
							))}
						</div>
						<span className="score-roll__digit score-roll__final" key={`f-${tickId}`}>
							{digit}
						</span>
					</div>
				);
			})}
		</div>
	);
}
