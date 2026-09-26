/* WS smoke test: auth, command fanout, ping, bad frame, rate limit.
 * Usage: node scripts/ws-smoke.mjs <control URL or token>  (or SB_TOKEN=…)
 * The `serve` example prints the control URL on startup. */
const arg = process.argv[2] ?? process.env.SB_TOKEN;
if (!arg) {
	console.error("usage: node scripts/ws-smoke.mjs <control URL or token>");
	process.exit(2);
}
const controlUrl = arg.includes("?t=") ? new URL(arg) : null;
const token = controlUrl ? controlUrl.searchParams.get("t") : arg;
const url = `ws://localhost:${controlUrl?.port || process.env.SB_PORT || 3001}/ws`;

/** Resolves once the connect-time `state` and `authorization` frames arrived. */
function connect(label, withToken) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(withToken ? `${url}?t=${encodeURIComponent(token)}` : url);
		let state;
		ws.onmessage = (message) => {
			const frame = JSON.parse(message.data);
			if (frame.type === "state") state = frame.data;
			if (frame.type === "authorization") resolve({ ws, state, authorized: frame.authorized });
		};
		ws.onerror = () => reject(new Error(`${label}: ws error`));
		setTimeout(() => reject(new Error(`${label}: timeout waiting for initial frames`)), 5000);
	});
}

/** Resolves with the first frame matching `predicate`, or "TIMEOUT". */
function nextFrame(ws, predicate, ms = 2000) {
	return Promise.race([
		new Promise((resolve) => {
			ws.onmessage = (message) => {
				const frame = JSON.parse(message.data);
				if (predicate(frame)) resolve(frame);
			};
		}),
		delay(ms).then(() => "TIMEOUT"),
	]);
}

function closeCode(ws, ms = 3000) {
	return Promise.race([
		new Promise((resolve) => {
			ws.onclose = (event) => resolve(event.code);
		}),
		delay(ms).then(() => "TIMEOUT"),
	]);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function check(name, ok) {
	console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
	if (!ok) failures += 1;
}

async function main() {
	// 1. Initial state + authorization frames on connect.
	const a = await connect("a", true);
	check("initial state frame", typeof a.state?.teamHomeName === "string");
	check("token-bearing client is authorized", a.authorized === true);

	// 2. Without a token the socket is read-only.
	const readOnly = await connect("read-only", false);
	check("client without token is not authorized", readOnly.authorized === false);
	const rejected = nextFrame(readOnly.ws, (frame) => frame.type === "error");
	readOnly.ws.send(JSON.stringify({ type: "command", action: "score-home-inc" }));
	check("command without token is rejected", (await rejected).code === "unauthorized");

	// 3. A command from A reaches every other client.
	const score = a.state.teamHomeScore + 1;
	const fanout = nextFrame(
		readOnly.ws,
		(frame) => frame.type === "state" && frame.data.teamHomeScore === score,
		3000,
	);
	a.ws.send(JSON.stringify({ type: "command", action: "patch", data: { teamHomeScore: score } }));
	check("command fans out to other clients", (await fanout) !== "TIMEOUT");

	// 4. Application-level ping.
	const pong = nextFrame(a.ws, (frame) => frame.type === "ping");
	a.ws.send(JSON.stringify({ type: "ping" }));
	check("ping is answered", (await pong) !== "TIMEOUT");

	// 5. Bad frame -> error + close 1003.
	const badClose = closeCode(readOnly.ws);
	readOnly.ws.send("this is not json");
	check("bad frame closes with 1003", (await badClose) === 1003);

	// 6. Rate limit: 40 commands in a burst -> error + close 1008.
	const c = await connect("c", true);
	const limited = closeCode(c.ws);
	for (let i = 0; i < 40; i += 1) {
		c.ws.send(JSON.stringify({ type: "command", action: "score-home-inc" }));
	}
	check("burst closes with 1008", (await limited) === 1008);

	a.ws.close();
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error("FAILED:", error.message);
	process.exit(1);
});
