import assert from "node:assert/strict";
import { mockIPC } from "@tauri-apps/api/mocks";
import { createServer } from "vite";

const server = await createServer({
	server: { middlewareMode: true },
	appType: "custom",
	optimizeDeps: { noDiscovery: true, include: [] },
});
const previousWindow = globalThis.window;

try {
	const { createScoreboardStore } = await server.ssrLoadModule("/src/lib/stores/scoreboardStore.ts");
	const { hotkeyToAction } = await server.ssrLoadModule("/src/lib/hotkeys.ts");
	const { useScoreboardStore } = await server.ssrLoadModule("/src/lib/stores/desktopScoreboardStore.ts");
	let prompts = 0;
	let accepted = false;
	globalThis.window = {
		crypto: globalThis.crypto,
		confirm: () => {
			prompts += 1;
			return accepted;
		},
	};

	function createStore(running, direction = "down", confirm) {
		const actions = [];
		const store = createScoreboardStore(
			{
				status: "connected",
				getState: async () => store.getState().state,
				dispatch: async (action) => {
					actions.push(action);
				},
				subscribe: () => () => {},
				onEvent: () => () => {},
			},
			confirm,
		);
		store.setState({
			state: { ...store.getState().state, timer: 125, isTimerRunning: running, timerDirection: direction },
		});
		return { store, actions };
	}

	const timerChanges = [
		...[1, 2, 3].map((slot) => ({
			action: hotkeyToAction(`timerLoadout${slot}`),
			invoke: (store) => store.getState().applyLoadout(slot),
			hotkey: `timerLoadout${slot}`,
			title: "Load timer preset?",
			confirmLabel: "Load preset",
			message: "Loading a preset",
		})),
		{
			action: hotkeyToAction("stopTimer"),
			invoke: (store) => store.getState().stopTimer(),
			hotkey: "stopTimer",
			title: "Reset timer?",
			confirmLabel: "Reset timer",
			message: "set the time to 00:00",
		},
	];

	for (const direction of ["down", "up"]) {
		for (const running of [false, true]) {
			for (const answer of [false, true]) {
				prompts = 0;
				accepted = answer;
				const { store, actions } = createStore(running, direction);
				const original = store.getState().state;
				for (const change of timerChanges) {
					await change.invoke(store);
					await store.getState().dispatch(hotkeyToAction(change.hotkey));
				}
				assert.equal(prompts, running ? timerChanges.length * 2 : 0);
				assert.deepEqual(
					actions,
					!running || accepted ? timerChanges.flatMap(({ action }) => [action, action]) : [],
				);
				assert.strictEqual(store.getState().state, original);
			}
		}
	}

	globalThis.window.confirm = () => {
		throw new Error("Desktop must use the native dialog, not window.confirm");
	};
	for (const confirmed of [false, true]) {
		for (const change of timerChanges) {
			let respond;
			const dialog = new Promise((resolve) => {
				respond = resolve;
			});
			const dialogs = [];
			const actions = [];
			mockIPC((command, args) => {
				if (command === "plugin:dialog|message") {
					dialogs.push(args);
					return dialog;
				}
				assert.equal(command, "sb_dispatch");
				actions.push(args.action);
			});
			useScoreboardStore.setState({
				state: { ...useScoreboardStore.getState().state, timer: 125, isTimerRunning: true },
			});
			const original = useScoreboardStore.getState().state;
			const loading = useScoreboardStore.getState().dispatch(hotkeyToAction(change.hotkey));
			assert.equal(dialogs.length, 1);
			assert.equal(dialogs[0].title, change.title);
			assert.equal(dialogs[0].kind, "warning");
			assert.ok(dialogs[0].message.includes(change.message));
			assert.ok(JSON.stringify(dialogs[0].buttons).includes(change.confirmLabel));
			assert.ok(JSON.stringify(dialogs[0].buttons).includes("Cancel"));
			for (const repeated of timerChanges) await repeated.invoke(useScoreboardStore);
			assert.equal(dialogs.length, 1, "Repeated requests must not open another dialog");
			assert.equal(actions.length, 0, "The timer must not change before the native dialog responds");
			respond(confirmed ? change.confirmLabel : "Cancel");
			await loading;
			assert.deepEqual(actions, confirmed ? [change.action] : []);
			assert.strictEqual(useScoreboardStore.getState().state, original);
		}
	}

	for (const change of timerChanges) {
		let attempts = 0;
		const { store, actions } = createStore(true, "down", async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("Dialog failed");
			return false;
		});
		await assert.rejects(change.invoke(store), /Dialog failed/);
		assert.equal(store.getState().error, "Dialog failed");
		await change.invoke(store);
		assert.equal(attempts, 2, "A failed dialog must not leave timer changes locked");
		assert.equal(actions.length, 0, "Dialog errors must never change the timer");
	}

	console.log(
		"Timer loadout/reset confirmation passed: native IPC, browser confirmation, accept/cancel, shortcuts, paused timers, duplicate requests, and errors.",
	);
} finally {
	if (previousWindow === undefined) delete globalThis.window;
	else globalThis.window = previousWindow;
	await server.close();
}
