/** Format seconds as `MM:SS` (doc 04 §6.2). */
export function formatTimer(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	return `${minutes.toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
