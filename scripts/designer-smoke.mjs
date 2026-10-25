/**
 * Browser-only P5 workflow proof with a revisioned IPC double. The production
 * window is unchanged; native persistence is covered separately by Rust tests.
 * Supply a Playwright Page and the Vite URL. No additional test runner required.
 */
export async function checkDesignerWorkflow(page, url) {
	await page.addInitScript(() => {
		const key = "__scoreboard_designer_p5_smoke__";
		const callbacks = new Map();
		const listeners = new Map();
		let next = 0;
		const initial = () => ({
			sessionId: "designer-smoke",
			storageRevision: 0,
			entries: [],
			published: { sessionId: "designer-smoke", revision: 0, selection: { kind: "classic" } },
			storageStatus: { state: "ready", code: null, message: null, recoveryToken: null, backupPath: null },
		});
		let library = JSON.parse(localStorage.getItem(key) ?? "null") ?? initial();
		const clone = (value) => structuredClone(value);
		const emit = (event, payload) => {
			for (const listener of listeners.values()) {
				if (listener.event === event)
					callbacks.get(listener.handler)?.({ event, id: listener.id, payload: clone(payload) });
			}
		};
		const state = {
			timer: 900,
			half: 1,
			halfPrefix: "PERIODO",
			teamHomeName: "REAL HOME",
			teamAwayName: "REAL AWAY",
			teamHomeScore: 4,
			teamAwayScore: 5,
			teamHomeColor: "#00FF00",
			teamAwayColor: "#FF0000",
			eventLogo: null,
			revision: 0,
			isTimerRunning: true,
			timerDirection: "down",
			timerLoadout1: 900,
			timerLoadout2: 2700,
			timerLoadout3: 1200,
		};
		const test = {
			calls: JSON.parse(sessionStorage.getItem(`${key}_calls`) ?? "[]"),
			failNext: null,
			nativeRequest: null,
			resolutions: [],
			requestClose: (reason) => {
				const previous = test.nativeRequest;
				test.nativeRequest = {
					requestId: previous?.requestId ?? crypto.randomUUID(),
					reason,
					acknowledged: previous?.acknowledged ?? false,
				};
				const request = test.nativeRequest;
				emit("designer:close-requested", request);
				return request.requestId;
			},
			timeoutClose: () => {
				const request = test.nativeRequest;
				test.nativeRequest = null;
				emit("designer:close-error", {
					requestId: request.requestId,
					message: "Designer close acknowledgement timed out; nothing was closed.",
				});
			},
			read: () => clone(library),
			reset: () => {
				library = initial();
				localStorage.removeItem(key);
				test.calls = [];
				test.nativeRequest = null;
				test.resolutions = [];
				sessionStorage.removeItem(`${key}_calls`);
			},
			externalChange: () => {
				library.entries[0].revision++;
				library.storageRevision++;
				localStorage.setItem(key, JSON.stringify(library));
				emit("layouts:library-changed", {
					sessionId: library.sessionId,
					storageRevision: library.storageRevision,
				});
			},
		};
		window.__DESIGNER_SMOKE__ = test;
		window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
		window.__TAURI_INTERNALS__ = {
			transformCallback: (callback) => {
				callbacks.set(++next, callback);
				return next;
			},
			unregisterCallback: (id) => callbacks.delete(id),
			invoke: async (command, args = {}) => {
				test.calls.push(command);
				sessionStorage.setItem(`${key}_calls`, JSON.stringify(test.calls));
				if (command === "plugin:event|listen") {
					listeners.set(++next, { id: next, event: args.event, handler: args.handler });
					return next;
				}
				if (command === "plugin:event|unlisten") {
					listeners.delete(args.eventId);
					return;
				}
				if (command === "sb_get_state") return clone(state);
				if (command === "settings_get") return { scoreAnimationEnabled: true };
				if (command === "layouts_get") return clone(library);
				if (command === "designer_ready") return;
				if (command === "designer_close_prompt_opened" || command === "designer_resolve_close") {
					if (test.nativeRequest?.requestId !== args.requestId)
						throw { code: "invalid-request", message: "Stale close request." };
					if (command === "designer_close_prompt_opened") {
						test.nativeRequest.acknowledged = true;
					} else {
						test.resolutions.push({ ...test.nativeRequest, decision: args.decision });
						test.nativeRequest = null;
					}
					return;
				}
				if (!["layouts_create", "layouts_save", "layouts_rename", "layouts_delete"].includes(command))
					throw new Error(`Unexpected IPC command: ${command}`);
				if (test.failNext) {
					const error = test.failNext;
					test.failNext = null;
					throw error;
				}
				let affectedId = args.id;
				if (command === "layouts_create") {
					affectedId = crypto.randomUUID();
					library.entries.push({
						id: affectedId,
						revision: 1,
						name: args.name.trim(),
						definition: clone(args.definition),
					});
				} else {
					const entry = library.entries.find((entry) => entry.id === args.id);
					if (!entry || entry.revision !== args.expectedRevision)
						throw {
							code: "revision-conflict",
							message: "Stale layout",
							expectedRevision: args.expectedRevision,
							actualRevision: entry?.revision ?? null,
						};
					if (command === "layouts_delete")
						library.entries = library.entries.filter((entry) => entry.id !== args.id);
					else {
						entry.name = args.name.trim();
						if (command === "layouts_save") entry.definition = clone(args.definition);
						entry.revision++;
					}
				}
				library.storageRevision++;
				localStorage.setItem(key, JSON.stringify(library));
				emit("layouts:library-changed", {
					sessionId: library.sessionId,
					storageRevision: library.storageRevision,
				});
				return { library: clone(library), affectedId };
			},
		};
	});
	await page.goto(url);
	await page.waitForSelector(".designer-window");
	await page.evaluate(() => window.__DESIGNER_SMOKE__.reset());
	await page.reload();
	await page.getByRole("button", { name: "New Starter", exact: true }).click();
	await page.getByLabel("Layout name", { exact: true }).fill("Broadcast test");
	await page.getByLabel("Output width", { exact: true }).fill("800");
	await page.getByLabel("Output width", { exact: true }).press("Enter");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.waitForFunction(() => window.__DESIGNER_SMOKE__.read().entries.length === 1);
	const first = await page.evaluate(() => window.__DESIGNER_SMOKE__.read().entries[0]);
	if (first.name !== "Broadcast test" || first.definition.root.width !== 800)
		throw new Error("Save did not commit pending name/geometry.");
	if (!(await page.getByRole("button", { name: "Apply (P7)", exact: true }).isDisabled()))
		throw new Error("Apply must remain unavailable.");

	await page.getByLabel("Output width", { exact: true }).fill("");
	await page.getByRole("button", { name: "New Blank", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true }).click();
	if (!(await page.getByRole("dialog").isVisible()))
		throw new Error("Invalid input allowed guarded navigation.");
	if (!(await page.getByRole("dialog").getByRole("alert").textContent()).includes("required"))
		throw new Error("Guarded Save failure was not visible.");
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	if ((await page.getByLabel("Output width", { exact: true }).inputValue()) !== "")
		throw new Error("Cancel lost invalid pending input.");
	await page.getByLabel("Output width", { exact: true }).press("Escape");
	if ((await page.getByLabel("Output width", { exact: true }).inputValue()) !== "800")
		throw new Error("Escape did not restore the committed geometry.");
	await page.getByLabel("Output width", { exact: true }).fill("3841");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	if ((await page.getByLabel("Output width", { exact: true }).getAttribute("aria-invalid")) !== "true")
		throw new Error("Invalid input was not retained visibly.");
	if ((await page.evaluate(() => window.__DESIGNER_SMOKE__.read().entries[0].definition.root.width)) !== 800)
		throw new Error("Invalid geometry reached storage.");
	await page.getByLabel("Output width", { exact: true }).press("Escape");

	await page.getByRole("button", { name: "Edit sample data", exact: true }).click();
	await page.getByLabel("homeName", { exact: true }).fill("PREVIEW ONLY");
	await page.getByLabel("homeName", { exact: true }).press("Enter");
	if (!(await page.getByRole("button", { name: "Save", exact: true }).isDisabled()))
		throw new Error("Sample changes made the definition dirty.");
	await page.getByRole("combobox", { name: "Preview data", exact: true }).selectOption("Live");
	await page.waitForFunction(() =>
		document.querySelector("[data-layout-live]")?.textContent.includes("REAL HOME"),
	);
	await page.getByRole("combobox", { name: "Preview data", exact: true }).selectOption("Sample");

	await page.getByRole("button", { name: "Duplicate", exact: true }).click();
	if ((await page.evaluate(() => window.__DESIGNER_SMOKE__.read().entries.length)) !== 1)
		throw new Error("Duplicate persisted before Save.");
	await page.getByLabel("Layout", { exact: true }).selectOption("classic");
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.waitForFunction(() => window.__DESIGNER_SMOKE__.read().entries.length === 2);
	const copy = await page.evaluate(() => window.__DESIGNER_SMOKE__.read().entries[1]);
	const ids = new Set(first.definition.editor.layers.map((layer) => layer.nodeId));
	if (copy.definition.editor.layers.some((layer) => ids.has(layer.nodeId)))
		throw new Error("Duplicate retained source node ids.");
	await page.getByRole("button", { name: "Rename", exact: true }).click();
	await page.getByRole("dialog").getByLabel("Layout name", { exact: true }).fill("Renamed copy");
	await page.getByRole("dialog").getByRole("button", { name: "Rename", exact: true }).click();
	await page.waitForFunction(() => window.__DESIGNER_SMOKE__.read().entries[1].name === "Renamed copy");
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
	await page.waitForFunction(() => window.__DESIGNER_SMOKE__.read().entries.length === 1);

	await page.getByLabel("Layout", { exact: true }).selectOption(first.id);
	await page.getByLabel("Output height", { exact: true }).fill("100");
	await page.getByLabel("Output height", { exact: true }).press("Enter");
	await page.evaluate(() => {
		window.__DESIGNER_SMOKE__.failNext = { code: "storage-io", message: "Injected disk failure" };
	});
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.waitForFunction(() =>
		document.querySelector('[role="alert"]')?.textContent.includes("Injected disk failure"),
	);
	if ((await page.evaluate(() => window.__DESIGNER_SMOKE__.read().entries[0].definition.root.height)) !== 80)
		throw new Error("Failed Save changed storage.");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.waitForFunction(
		() => window.__DESIGNER_SMOKE__.read().entries[0].definition.root.height === 100,
	);
	await page.evaluate(() => window.__DESIGNER_SMOKE__.externalChange());
	await page.waitForFunction(() =>
		document.querySelector(".designer-window")?.textContent.includes("Your draft is preserved"),
	);
	if (!(await page.getByRole("button", { name: "Save", exact: true }).isDisabled()))
		throw new Error("A stale draft can still be saved.");
	await page.getByRole("button", { name: "Reload", exact: true }).click();
	await page.waitForFunction(
		() => !document.querySelector(".designer-window")?.textContent.includes("Your draft is preserved"),
	);

	await page.getByRole("button", { name: "Timer", exact: true }).click();
	await page.getByRole("combobox", { name: "Parent", exact: true }).selectOption({ label: "Rendering area" });
	if ((await page.getByLabel("X", { exact: true }).inputValue()) !== "19")
		throw new Error("Reparenting failed to preserve global X.");
	await page.getByRole("button", { name: "Hide Timer", exact: true }).click();
	if (
		(await page
			.getByRole("combobox", { name: "Element type", exact: true })
			.locator('option[value="timer"]')
			.getAttribute("disabled")) === null
	)
		throw new Error("Hidden bindings became available for duplicate insertion.");
	await page.getByRole("button", { name: "Lock Timer", exact: true }).click();
	if (!(await page.getByLabel("Font size", { exact: true }).isDisabled()))
		throw new Error("Locked numeric properties are editable.");
	await page.getByRole("button", { name: "Unlock Timer", exact: true }).click();
	await page.getByRole("button", { name: "Remove element", exact: true }).click();
	await page.getByRole("combobox", { name: "Element type", exact: true }).selectOption("timer");
	await page.getByRole("button", { name: "Add element", exact: true }).click();
	await page.getByRole("button", { name: "Home Score", exact: true }).click();
	await page.getByRole("combobox", { name: "Score animation", exact: true }).selectOption("rolling");
	await page.getByRole("combobox", { name: "Text colour source", exact: true }).selectOption("home");
	await page.getByLabel("Text colour alpha", { exact: true }).fill("0.5");
	await page.getByLabel("Text colour alpha", { exact: true }).press("Enter");
	await page.getByRole("combobox", { name: "Font family", exact: true }).selectOption("poppins");
	await page.getByRole("combobox", { name: "Font weight", exact: true }).selectOption("700");
	await page.getByRole("button", { name: "Rendering area", exact: true }).click();
	await page.getByRole("combobox", { name: "Element type", exact: true }).selectOption("container");
	await page.getByRole("button", { name: "Add element", exact: true }).click();
	await page.getByLabel("Layer name", { exact: true }).fill("Flow proof");
	await page.getByLabel("Layer name", { exact: true }).press("Enter");
	await page.getByLabel("width", { exact: true }).fill("300");
	await page.getByLabel("width", { exact: true }).press("Enter");
	await page.getByLabel("height", { exact: true }).fill("120");
	await page.getByLabel("height", { exact: true }).press("Enter");
	await page.getByLabel("Padding left", { exact: true }).fill("10");
	await page.getByLabel("Padding left", { exact: true }).press("Enter");
	await page.getByRole("combobox", { name: "Layout mode", exact: true }).selectOption("row");
	await page.getByLabel("Gap", { exact: true }).fill("8");
	await page.getByLabel("Gap", { exact: true }).press("Enter");
	await page.getByRole("combobox", { name: "Element type", exact: true }).selectOption("rectangle");
	await page.getByRole("button", { name: "Add element", exact: true }).click();
	await page.getByRole("combobox", { name: "width sizing", exact: true }).selectOption("fill");
	await page.getByRole("combobox", { name: "width sizing", exact: true }).selectOption("fixed");
	if ((await page.getByLabel("width", { exact: true }).inputValue()) !== "290")
		throw new Error("Fill-to-Fixed did not freeze the resolved width.");
	await page.getByRole("combobox", { name: "Background source", exact: true }).selectOption("away");
	await page.getByLabel("Background alpha", { exact: true }).fill("0.5");
	await page.getByLabel("Background alpha", { exact: true }).press("Enter");
	await page.getByLabel("Border width", { exact: true }).fill("2");
	await page.getByLabel("Border width", { exact: true }).press("Enter");
	await page.getByRole("button", { name: "Flow proof", exact: true }).click();
	await page.getByRole("combobox", { name: "Layout mode", exact: true }).selectOption("free");
	await page.getByRole("combobox", { name: "Element type", exact: true }).selectOption("text");
	await page.getByRole("button", { name: "Add element", exact: true }).click();
	await page.getByLabel("Static text", { exact: true }).fill("Line one\n\nLine two\n");
	await page.getByLabel("Static text", { exact: true }).press("Control+Enter");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.waitForFunction(() => document.querySelector(".designer-title")?.textContent.includes("Saved"));
	const styled = await page.evaluate(() => {
		const root = window.__DESIGNER_SMOKE__.read().entries[0].definition.root;
		const home = root.children[1].children.find((node) => node.binding === "home-score");
		const away = root.children[2].children.find((node) => node.binding === "away-score");
		const group = root.children.at(-1);
		return { home, away, group };
	});
	if (
		styled.home.animation !== "rolling" ||
		styled.away.animation !== "none" ||
		styled.home.textStyle.color.team !== "home" ||
		styled.home.textStyle.color.alpha !== 0.5 ||
		styled.home.textStyle.font.weight !== 700 ||
		styled.group.mode !== "free" ||
		styled.group.children[0].box.background.team !== "away" ||
		styled.group.children[0].box.background.alpha !== 0.5 ||
		styled.group.children[0].box.borderWidth !== 2 ||
		styled.group.children[1].text !== "Line one\n\nLine two\n"
	)
		throw new Error("Numeric/style/text inspector edits were not saved exactly.");
	await page.reload();
	await page.getByLabel("Layout", { exact: true }).selectOption(first.id);
	if ((await page.getByLabel("Output height", { exact: true }).inputValue()) !== "100")
		throw new Error("Reload did not reopen the saved definition.");
	await page.getByLabel("Output width", { exact: true }).fill("900");
	await page.getByLabel("Layout", { exact: true }).selectOption("classic");
	await page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true }).click();
	await page.getByLabel("Layout", { exact: true }).selectOption(first.id);
	if ((await page.getByLabel("Output width", { exact: true }).inputValue()) !== "900")
		throw new Error("Guarded Save did not include pending input.");
	await page.getByLabel("Output height", { exact: true }).fill("120");
	await page.getByRole("button", { name: "Rename", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Discard", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	if (
		(await page.getByLabel("Output height", { exact: true }).inputValue()) !== "100" ||
		!(await page.getByRole("button", { name: "Save", exact: true }).isDisabled())
	)
		throw new Error("Discard before a cancelled library operation did not restore the baseline.");
	await page.getByLabel("Output width", { exact: true }).fill("901");
	await page.getByRole("button", { name: "New Blank", exact: true }).click();
	for (let index = 0; index < 6; index++) await page.keyboard.press("Tab");
	if (!(await page.evaluate(() => Boolean(document.activeElement.closest("dialog")))))
		throw new Error("Modal keyboard focus escaped into the editor.");
	await page.keyboard.press("Escape");
	await page.getByRole("dialog").waitFor({ state: "hidden" });
	if ((await page.getByLabel("Output width", { exact: true }).inputValue()) !== "901")
		throw new Error("Cancelling a modal discarded the draft.");
	await page.getByRole("button", { name: "Reload", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Discard", exact: true }).click();
	await page.waitForFunction(() => document.querySelector(".designer-title")?.textContent.includes("Saved"));

	const result = await page.evaluate(() => ({
		entries: window.__DESIGNER_SMOKE__.read().entries.length,
		publication: window.__DESIGNER_SMOKE__.read().published.selection.kind,
		unexpectedMutations: window.__DESIGNER_SMOKE__.calls.filter(
			(command) => command === "sb_dispatch" || command === "layouts_apply",
		),
	}));
	if (result.publication !== "classic" || result.unexpectedMutations.length !== 0)
		throw new Error("Designer modified authoritative match/publication state.");
	return {
		...result,
		workflows:
			"pending/invalid input; Save/Discard/Cancel; field/modal Escape; modal focus; Sample/Live isolation; private Duplicate; Rename/Delete; failed Save; stale revision; Reload; tree operations; numeric/flow/style/text inspector; reopen",
	};
}
