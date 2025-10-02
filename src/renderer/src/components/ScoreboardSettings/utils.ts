export function formatSecondsToClock(seconds?: number | null): string {
	if (seconds == null || Number.isNaN(seconds)) {
		return "00:00";
	}
	const safeSeconds = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(safeSeconds / 60);
	const remainder = safeSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function parseMinutesSeconds(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		return 0;
	}
	const match = trimmed.match(/^([0-9]{1,3})(?::([0-5]?[0-9]))?$/);
	if (!match) {
		return null;
	}
	const minutes = Number(match[1]);
	const seconds = match[2] ? Number(match[2]) : 0;
	if (seconds >= 60) {
		return null;
	}
	return minutes * 60 + seconds;
}

export function sanitizeTimerInput(rawValue: string): string {
	const numericAndColonOnly = rawValue.replace(/[^0-9:]/g, "");
	const firstColonIndex = numericAndColonOnly.indexOf(":");
	if (firstColonIndex === -1) {
		return numericAndColonOnly.slice(0, 3);
	}
	const before = numericAndColonOnly.slice(0, firstColonIndex + 1);
	const after = numericAndColonOnly.slice(firstColonIndex + 1).replace(/:/g, "");
	return `${before}${after.slice(0, 2)}`;
}
