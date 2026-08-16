export function createControlWsUrl(baseUrl: string, token: string | null): string {
	const url = new URL(baseUrl, window.location.href);
	if (token && !url.searchParams.has("t")) url.searchParams.set("t", token);
	return url.toString();
}
