/* WS smoke test: initial state, command fanout, ping, rate limit. */
const url = "ws://localhost:3001/ws";

function connect(label) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const frames = [];
		ws.onmessage = (message) => {
			const frame = JSON.parse(message.data);
			frames.push(frame);
			if (frame.type === "state" && frames.length === 1) resolve({ ws, frames, frame });
		};
		ws.onerror = () => reject(new Error(`${label}: ws error`));
		setTimeout(() => reject(new Error(`${label}: timeout waiting for initial state`)), 5000);
	});
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
	// 1. Initial state frame on connect.
	const a = await connect("a");
	console.log("A initial state ok:", a.frame.type === "state" && a.frame.data.teamHomeName === "HOME");

	// 2. A second client; a command from A must reach B.
	const b = await connect("b");
	const bGotUpdate = new Promise((resolve) => {
		b.ws.onmessage = (message) => {
			const frame = JSON.parse(message.data);
			if (frame.type === "state" && frame.data.teamHomeScore === 7) resolve(true);
		};
	});
	a.ws.send(JSON.stringify({ type: "command", action: "patch", data: { teamHomeScore: 7 } }));
	console.log("B received fanout:", await Promise.race([bGotUpdate, delay(3000).then(() => "TIMEOUT")]));

	// 3. Ping keepalive.
	const pong = new Promise((resolve) => {
		a.ws.onmessage = (message) => {
			const frame = JSON.parse(message.data);
			if (frame.type === "ping") resolve(true);
		};
	});
	a.ws.send(JSON.stringify({ type: "ping" }));
	console.log("ping replied:", await Promise.race([pong, delay(2000).then(() => "TIMEOUT")]));

	// 4. Bad frame -> error + close 1003.
	const badClose = new Promise((resolve) => {
		b.ws.onclose = (event) => resolve(event.code);
	});
	b.ws.send("this is not json");
	console.log("bad frame close code:", await Promise.race([badClose, delay(2000).then(() => "TIMEOUT")]));

	// 5. Rate limit: 40 commands in a burst -> error + close 1008.
	const c = await connect("c");
	const limited = new Promise((resolve) => {
		c.ws.onclose = (event) => resolve(event.code);
	});
	for (let i = 0; i < 40; i += 1) {
		c.ws.send(JSON.stringify({ type: "command", action: "score-home-inc" }));
	}
	console.log("rate limit close code:", await Promise.race([limited, delay(3000).then(() => "TIMEOUT")]));

	a.ws.close();
	process.exit(0);
}

main().catch((error) => {
	console.error("FAILED:", error.message);
	process.exit(1);
});
