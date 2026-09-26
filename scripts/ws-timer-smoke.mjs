/* Timer-over-WS smoke test: start a 3 s countdown, expect tick frames.
 * Usage: node scripts/ws-timer-smoke.mjs <control URL or token>  (or SB_TOKEN=…)
 * The `serve` example prints the control URL on startup. */
const arg = process.argv[2] ?? process.env.SB_TOKEN;
if (!arg) {
	console.error("usage: node scripts/ws-timer-smoke.mjs <control URL or token>");
	process.exit(2);
}
const controlUrl = arg.includes("?t=") ? new URL(arg) : null;
const token = controlUrl ? controlUrl.searchParams.get("t") : arg;
const url = `ws://localhost:${controlUrl?.port || process.env.SB_PORT || 3001}/ws?t=${encodeURIComponent(token)}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
	const ws = new WebSocket(url);
	const ticks = [];
	let finished = false;
	let authorized = false;
	let error = null;
	const ready = new Promise((resolve) => {
		ws.onmessage = (message) => {
			const frame = JSON.parse(message.data);
			if (frame.type === "authorization") {
				authorized = frame.authorized;
				resolve();
			}
			if (frame.type === "error") error = frame.code;
			if (frame.type === "state" && frame.data.isTimerRunning) ticks.push(frame.data.timer);
			if (frame.type === "event" && frame.event === "timer-finished") finished = true;
		};
	});
	await ready;
	if (!authorized) {
		console.error("FAILED: not authorized — check the control token");
		process.exit(1);
	}
	ws.send(JSON.stringify({ type: "command", action: "timer-set-direction", data: { direction: "down" } }));
	ws.send(JSON.stringify({ type: "command", action: "timer-set", data: { seconds: 3 } }));
	await delay(150);
	ws.send(JSON.stringify({ type: "command", action: "timer-start" }));
	await delay(3600);
	console.log("ticks seen:", ticks.join(","));
	console.log("timer-finished event:", finished);
	console.log("counted down:", ticks.includes(2) && ticks.includes(1));
	if (error) console.log("server error:", error);
	ws.close();
	process.exit(finished && ticks.includes(2) && ticks.includes(1) ? 0 : 1);
}

main().catch((error) => {
	console.error("FAILED:", error.message);
	process.exit(1);
});
