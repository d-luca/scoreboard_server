/* Timer-over-WS smoke test: start a 3 s timer, expect tick frames. */
const url = "ws://localhost:3001/ws";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
	const ws = new WebSocket(url);
	const ticks = [];
	let finished = false;
	ws.onmessage = (message) => {
		const frame = JSON.parse(message.data);
		if (frame.type === "state" && frame.data.isTimerRunning) ticks.push(frame.data.timer);
		if (frame.type === "event" && frame.event === "timer-finished") finished = true;
	};
	await new Promise((resolve) => {
		ws.onopen = resolve;
	});
	ws.send(JSON.stringify({ type: "command", action: "timer-set", data: { seconds: 3 } }));
	await delay(150);
	ws.send(JSON.stringify({ type: "command", action: "timer-start" }));
	await delay(3600);
	console.log("ticks seen:", ticks.join(","));
	console.log("timer-finished event:", finished);
	console.log("counted down:", ticks.includes(2) && ticks.includes(1));
	ws.close();
	process.exit(finished && ticks.includes(2) && ticks.includes(1) ? 0 : 1);
}

main().catch((error) => {
	console.error("FAILED:", error.message);
	process.exit(1);
});
