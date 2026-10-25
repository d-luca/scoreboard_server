import { createContext } from "react";

export type PendingEdits = {
	stage(id: string, commit: (() => void) | null): void;
	flush(): void;
};

export const PendingEditsContext = createContext<PendingEdits | null>(null);

export function parseNumber(raw: string, min: number, max: number, integer = false): number {
	if (!raw.trim()) throw new Error("A value is required.");
	const number = Number(raw);
	if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
		throw new Error(`Enter ${integer ? "an integer" : "a number"} from ${min} to ${max}.`);
	}
	return number;
}
