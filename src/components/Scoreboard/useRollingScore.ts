import { useEffect, useState } from "react";

export const ROLLING_DURATION_MS = 460;

export function useRollingScore(
	value: number,
	animated = true,
): { number: number; enabled: boolean; fromValue: number | null; tickKey: number } {
	const number = Math.max(0, Math.floor(value));
	const [reduced] = useState(
		() =>
			typeof window !== "undefined" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
	);
	const [settled, setSettled] = useState(number);
	const [fromValue, setFromValue] = useState<number | null>(null);
	const [tickTarget, setTickTarget] = useState<number | null>(null);
	const [tickKey, setTickKey] = useState(0);

	// Retarget from the previous target, not an obsolete settled score, on rapid updates.
	if (number !== (tickTarget ?? settled)) {
		setFromValue(tickTarget ?? settled);
		setTickTarget(number);
		setTickKey((key) => key + 1);
	}
	useEffect(() => {
		if (tickTarget === null) return;
		const target = tickTarget;
		const id = window.setTimeout(() => {
			setSettled(target);
			setFromValue(null);
			setTickTarget(null);
		}, ROLLING_DURATION_MS);
		return () => window.clearTimeout(id);
	}, [tickTarget]);

	const enabled = animated && !reduced;
	return { number, enabled, fromValue: enabled ? fromValue : null, tickKey };
}
