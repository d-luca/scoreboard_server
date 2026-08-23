import { DraftInput } from "@/features/remote/RemoteControl/components/DraftInput";
import { formatTimer } from "@/lib/format";
import React from "react";
import { INPUT_CLASS } from "./constants";

/**
 * `MM:SS` loadout input (doc 04 §7.4): filter allows digits and one colon;
 * on blur, `^([0-9]{1,3})(?::([0-5]?[0-9]))?$` — empty means zero, invalid
 * reverts to the stored value.
 */

export function parseLoadout(value: string): number | null {
	if (value === "") return 0;
	if (/^\d{1,3}$/.test(value)) return Number(value);
	const match = /^(\d{1,3}):([0-5]?\d)$/.exec(value);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function filterDurationInput(event: React.FormEvent<HTMLInputElement>): void {
	const input = event.currentTarget;
	const filtered = input.value.replace(/[^\d:]/g, "");
	const [minutes = "", ...secondsParts] = filtered.split(":");
	input.value = `${minutes.slice(0, 3)}${secondsParts.length > 0 ? `:${secondsParts.join("").slice(0, 2)}` : ""}`;
}

export function LoadoutInput({
	id,
	value,
	onCommit,
}: {
	id: string;
	value: number;
	onCommit(seconds: number): void;
}): React.JSX.Element {
	return (
		<DraftInput
			id={id}
			className={INPUT_CLASS}
			inputMode="numeric"
			value={formatTimer(value)}
			onInput={filterDurationInput}
			onCommit={(raw) => {
				const seconds = parseLoadout(raw);
				if (seconds === null) return false;
				if (seconds !== value) onCommit(seconds);
			}}
		/>
	);
}
