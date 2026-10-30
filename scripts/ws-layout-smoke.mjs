import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const storageDir = await mkdtemp(join(tmpdir(), "scoreboard-layout-ws-smoke-"));
const server = spawn("cargo", ["run", "--manifest-path", "src-tauri/Cargo.toml", "--example", "serve"], {
	cwd: root,
	env: { ...process.env, SB_LAYOUTS_PATH: join(storageDir, "layouts.json") },
	stdio: ["pipe", "pipe", "pipe"],
});

let output = "";
let errorOutput = "";
const stdoutWaiters = [];
server.stdout.setEncoding("utf8");
server.stderr.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
	output += chunk;
	for (const waiter of [...stdoutWaiters]) {
		if (waiter.pattern.test(output)) {
			clearTimeout(waiter.timer);
			stdoutWaiters.splice(stdoutWaiters.indexOf(waiter), 1);
			waiter.resolve(output.match(waiter.pattern));
		}
	}
});
server.stderr.on("data", (chunk) => {
	errorOutput += chunk;
	process.stderr.write(chunk);
});
server.on("error", (error) => {
	for (const waiter of stdoutWaiters.splice(0)) {
		clearTimeout(waiter.timer);
		waiter.reject(error);
	}
});
server.on("exit", (code) => {
	if (code === 0) return;
	const error = new Error(`Standalone server exited with ${code}; stderr:\n${errorOutput}`);
	for (const waiter of stdoutWaiters.splice(0)) {
		clearTimeout(waiter.timer);
		waiter.reject(error);
	}
});

function waitForOutput(pattern, timeoutMs = 120_000) {
	const existing = output.match(pattern);
	if (existing) return Promise.resolve(existing);
	if (server.exitCode !== null) {
		return Promise.reject(
			new Error(`Standalone server exited with ${server.exitCode}; stderr:\n${errorOutput}`),
		);
	}
	return new Promise((resolve, reject) => {
		const waiter = {
			pattern,
			resolve,
			timer: setTimeout(() => {
				const index = stdoutWaiters.indexOf(waiter);
				if (index !== -1) stdoutWaiters.splice(index, 1);
				reject(new Error(`Timed out waiting for server output ${pattern}; stderr:\n${errorOutput}`));
			}, timeoutMs),
		};
		stdoutWaiters.push(waiter);
	});
}

function waitForExit(timeoutMs = 10_000) {
	if (server.exitCode !== null) return Promise.resolve(server.exitCode);
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Standalone server did not stop after `quit`.")),
			timeoutMs,
		);
		server.once("exit", (code) => {
			clearTimeout(timer);
			resolve(code ?? 1);
		});
	});
}

function createClient(url) {
	const socket = new WebSocket(url);
	const frames = [];
	const waiters = new Set();
	socket.addEventListener("message", (event) => {
		const frame = JSON.parse(event.data);
		frames.push(frame);
		for (const waiter of waiters) {
			if (waiter.predicate(frame)) {
				clearTimeout(waiter.timer);
				waiters.delete(waiter);
				waiter.resolve(frame);
			}
		}
	});
	return {
		socket,
		waitForFrame(predicate, timeoutMs = 5000) {
			const existing = frames.find(predicate);
			if (existing) return Promise.resolve(existing);
			return new Promise((resolve, reject) => {
				const waiter = {
					predicate,
					resolve,
					timer: setTimeout(() => {
						waiters.delete(waiter);
						reject(new Error("Timed out waiting for WebSocket frame."));
					}, timeoutMs),
				};
				waiters.add(waiter);
			});
		},
	};
}

async function connected(url) {
	const client = createClient(url);
	const [state, authorization, layout] = await Promise.all([
		client.waitForFrame((frame) => frame.type === "state"),
		client.waitForFrame((frame) => frame.type === "authorization"),
		client.waitForFrame((frame) => frame.type === "layout"),
	]);
	if (!state.data || authorization.authorized !== false)
		throw new Error("Initial state or read-only authorization frame was invalid.");
	return { ...client, initialLayout: layout.data };
}

async function scoreboardBootstrap(httpUrl) {
	const response = await fetch(`${httpUrl}/scoreboard`);
	if (!response.ok) throw new Error(`/scoreboard returned ${response.status}.`);
	const html = await response.text();
	const match = html.match(/window\.__SCOREBOARD__ = (.*?);<\/script>/s);
	if (!match) throw new Error("/scoreboard did not include its runtime bootstrap.");
	const config = JSON.parse(match[1]);
	if (!config.publishedLayout) throw new Error("/scoreboard bootstrap omitted publishedLayout.");
	return config.publishedLayout;
}

function equal(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

async function apply(command, expectedRevision) {
	const marker = `applied publication:`;
	const start = output.length;
	server.stdin.write(`apply ${command}\n`);
	const response = await waitForOutput(
		new RegExp(`${marker} session=([^\\s]+) revision=${expectedRevision}`),
	);
	if (response.index < start) throw new Error("Matched an earlier Apply response.");
}

async function main() {
	const [listening] = await Promise.all([
		waitForOutput(/listening on http:\/\/localhost:(\d+)/),
		waitForOutput(/stdin: `apply smoke/),
	]);
	const port = Number(listening[1]);
	const httpUrl = `http://localhost:${port}`;
	const wsUrl = `ws://localhost:${port}/ws`;

	const early = await connected(wsUrl);
	const initialBootstrap = await scoreboardBootstrap(httpUrl);
	if (!equal(early.initialLayout, initialBootstrap) || initialBootstrap.selection.kind !== "classic")
		throw new Error("Classic cold bootstrap did not match the initial WS publication.");

	await apply("smoke", 1);
	const published = {
		kind: "layout",
		data: await early
			.waitForFrame((frame) => frame.type === "layout" && frame.data.revision === 1)
			.then((frame) => frame.data),
	};
	if (
		published.data.selection.kind !== "custom" ||
		published.data.selection.sourceName !== "P7 Smoke Fixture" ||
		published.data.selection.root.width !== 320 ||
		published.data.selection.root.height !== 120
	)
		throw new Error("Apply did not fan out the valid custom smoke fixture.");

	const bootstrap = await scoreboardBootstrap(httpUrl);
	if (!equal(bootstrap, published.data))
		throw new Error("Custom `/scoreboard` bootstrap did not match the live publication.");

	const cold = await connected(wsUrl);
	if (!equal(cold.initialLayout, published.data))
		throw new Error("A cold WebSocket connection did not receive the current custom publication.");

	const disconnected = new Promise((resolve) =>
		cold.socket.addEventListener("close", resolve, { once: true }),
	);
	cold.socket.close();
	await disconnected;
	const reconnected = await connected(wsUrl);
	if (!equal(reconnected.initialLayout, published.data))
		throw new Error("A reconnected client did not receive the current custom publication.");

	await apply("classic", 2);
	const classicPredicate = (frame) => frame.type === "layout" && frame.data.revision === 2;
	const [classic, reconnectClassic] = await Promise.all([
		early.waitForFrame(classicPredicate),
		reconnected.waitForFrame(classicPredicate),
	]);
	if (classic.data.selection.kind !== "classic")
		throw new Error("Classic Apply did not fan out to the connected client.");
	if (!equal(reconnectClassic.data, classic.data))
		throw new Error("Classic publication differed across connected clients.");
	const classicBootstrap = await scoreboardBootstrap(httpUrl);
	if (!equal(classicBootstrap, classic.data))
		throw new Error("Classic `/scoreboard` bootstrap did not match the live publication.");

	console.log("ok  Classic bootstrap matches initial WS publication");
	console.log("ok  Apply fans out custom fixture to connected clients");
	console.log("ok  custom bootstrap and cold connection match publication");
	console.log("ok  reconnect receives the current publication");
	console.log("ok  Classic Apply fans out to connected clients and updates bootstrap");

	for (const client of [early, cold, reconnected]) client.socket.close();
	server.stdin.write("quit\n");
	const exitCode = await waitForExit();
	if (exitCode !== 0) throw new Error(`Standalone server exited with ${exitCode}.`);
}

main()
	.catch((error) => {
		console.error("FAILED:", error);
		server.stdin.write("quit\n");
		process.exitCode = 1;
	})
	.finally(async () => {
		if (server.exitCode === null && server.signalCode === null) {
			try {
				await waitForExit(3000);
			} catch {
				server.kill("SIGTERM");
			}
		}
		await rm(storageDir, { recursive: true, force: true });
	});
