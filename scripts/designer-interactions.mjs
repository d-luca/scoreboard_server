import { checkDesignerWorkflow } from "./designer-smoke.mjs";

/** P6 production UI proof. Native OS close interception is covered separately in Rust/manual checks. */
export async function checkDesignerInteractions(page, url) {
	await checkDesignerWorkflow(page, url);
	const button = (name) => page.getByRole("button", { name, exact: true });
	const field = (name) => page.getByLabel(name, { exact: true });
	const choice = (name) => page.getByRole("combobox", { name, exact: true });
	const workspace = page.getByLabel("Layout workspace", { exact: true });
	const set = async (name, value) => {
		await field(name).fill(String(value));
		await field(name).press("Enter");
	};
	const assertField = async (name, value) => {
		const actual = Number(await field(name).inputValue());
		if (Math.abs(actual - value) > 0.00001) throw new Error(`${name}: expected ${value}, got ${actual}`);
	};
	const scenePoint = async (x, y) => {
		const box = await page.locator(".designer-scene").boundingBox();
		const zoom = box.width / 622;
		return { x: box.x + x * zoom, y: box.y + y * zoom, zoom };
	};
	const drag = async (start, dx, dy, finish = true) => {
		await page.mouse.move(start.x, start.y);
		await page.mouse.down();
		await page.mouse.move(start.x + dx, start.y + dy, { steps: 10 });
		if (finish) await page.mouse.up();
	};
	const save = async () => {
		await button("Save").click();
		await page.waitForFunction(() =>
			document.querySelector(".designer-title")?.textContent.includes("Saved"),
		);
	};
	const select = async (name) => button(name).click();
	const add = async (kind, label) => {
		await choice("Element type").selectOption(kind);
		await button("Add element").click();
		await set("Layer name", label);
	};
	const saved = async () =>
		page.evaluate(() =>
			window.__DESIGNER_SMOKE__.read().entries.find((entry) => entry.name === "Manipulation proof"),
		);
	const nodeByLabel = (entry, label) => {
		const id = entry.definition.editor.layers.find((layer) => layer.label === label).nodeId;
		const visit = (node) => (node.id === id ? node : node.children?.map(visit).find(Boolean));
		return visit(entry.definition.root);
	};
	await button("New Blank").click();
	await set("Layout name", "Manipulation proof");
	await set("Output height", 400);
	await add("rectangle", "Drag target");
	await set("X", 160);
	await set("Y", 80);
	await set("width", 100);
	await set("height", 40);
	await page.getByRole("checkbox", { name: "Snap", exact: true }).uncheck();
	await choice("Zoom").selectOption("1");

	let point = await scenePoint(210, 100);
	await drag(point, 35 * point.zoom, 20 * point.zoom);
	await assertField("X", 195);
	await assertField("Y", 100);
	await button("Undo").click();
	await assertField("X", 160);
	await assertField("Y", 80);
	await button("Redo").click();
	await assertField("X", 195);
	await save();
	await button("Undo").click();
	if (await button("Save").isDisabled()) throw new Error("Undo after Save did not become dirty.");
	await button("Redo").click();
	if (!(await button("Save").isDisabled())) throw new Error("Redo to saved state remained dirty.");

	point = await scenePoint(245, 120);
	await drag(point, 30 * point.zoom, 20 * point.zoom, false);
	await page.keyboard.press("Escape");
	await page.mouse.up();
	await assertField("X", 195);
	if (!(await button("Save").isDisabled())) throw new Error("Cancelled drag changed the definition.");
	const handle = await page.locator('[data-resize="se"]').boundingBox();
	await drag(
		{ x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
		20 * point.zoom,
		15 * point.zoom,
	);
	await assertField("width", 120);
	await assertField("height", 55);
	await button("Undo").click();
	await assertField("width", 100);
	await assertField("height", 40);

	for (const zoom of ["0.5", "2"]) {
		await choice("Zoom").selectOption(zoom);
		point = await scenePoint(245, 120);
		await drag(point, 20 * point.zoom, 10 * point.zoom);
		await assertField("X", 215);
		await assertField("Y", 110);
		await button("Undo").click();
		await assertField("X", 195);
	}
	await button("Fit").click();
	const beforePan = await page.locator(".designer-scene").boundingBox();
	const stage = await workspace.boundingBox();
	await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
	await page.mouse.down({ button: "middle" });
	await page.mouse.move(stage.x + stage.width / 2 + 60, stage.y + stage.height / 2 + 40, { steps: 6 });
	await page.mouse.up({ button: "middle" });
	const afterPan = await page.locator(".designer-scene").boundingBox();
	if (Math.abs(afterPan.x - beforePan.x - 60) > 0.01 || Math.abs(afterPan.y - beforePan.y - 40) > 0.01)
		throw new Error("Pan did not move the viewport by the exact CSS-pixel delta.");
	await page.getByRole("checkbox", { name: "Grid (8px)", exact: true }).check();
	if (!(await button("Save").isDisabled()))
		throw new Error("Viewport/grid changes made the definition dirty.");
	await button("Fit").click();
	await choice("Zoom").selectOption("1");
	await select("Rendering area");
	await add("rectangle", "Snap target");
	await set("X", 400);
	await set("Y", 150);
	await set("height", 40);
	await save();
	await select("Drag target");
	await page.getByRole("checkbox", { name: "Grid (8px)", exact: true }).uncheck();
	await page.getByRole("checkbox", { name: "Snap", exact: true }).check();
	point = await scenePoint(245, 120);
	await drag(point, 99 * point.zoom, 50 * point.zoom, false);
	await assertField("X", 300);
	await assertField("Y", 150);
	if ((await page.locator("[data-guide]").count()) !== 2)
		throw new Error("Snapped drag did not show guides.");
	await page.mouse.up();
	if (await page.locator("[data-guide]").count()) throw new Error("Snap guides survived the gesture.");
	await button("Undo").click();
	await assertField("X", 195);
	if (!(await button("Save").isDisabled()))
		throw new Error("One Undo did not restore the pre-drag saved state.");
	await button("Lock Drag target").click();
	point = await scenePoint(245, 120);
	await page.mouse.click(point.x, point.y);
	if ((await page.locator("[data-resize]").count()) !== 0)
		throw new Error("Locked box still exposes handles.");
	await select("Drag target");
	if (!(await field("X").isDisabled())) throw new Error("Tree-selected locked box became editable.");
	await button("Unlock Drag target").click();

	await select("Rendering area");
	await add("container", "Flow row");
	await set("X", 40);
	await set("Y", 240);
	await set("width", 500);
	await set("height", 100);
	await add("rectangle", "A");
	await set("width", 80);
	await set("height", 30);
	await select("Flow row");
	await add("container", "B group");
	await set("width", 80);
	await set("height", 30);
	await add("rectangle", "Nested child");
	await set("width", 10);
	await set("height", 10);
	await select("Flow row");
	await add("rectangle", "C");
	await set("width", 80);
	await set("height", 30);
	await select("Flow row");
	await choice("Layout mode").selectOption("row");
	await set("Gap", 10);
	await save();
	await select("B group");
	point = await scenePoint(170, 255);
	await drag(point, 160 * point.zoom, 0);
	await button("Undo").click();
	await select("B group");
	// The second child begins at 40 + 80 + 10 after a single undo.
	if (await field("X").count()) throw new Error("Flow child unexpectedly exposes Free coordinates.");
	await button("Redo").click();
	await save();
	let entry = await saved();
	let row = nodeByLabel(entry, "Flow row");
	const labels = new Map(entry.definition.editor.layers.map((layer) => [layer.nodeId, layer.label]));
	if (
		row.children.map((node) => labels.get(node.id)).join(",") !== "A,C,B group" ||
		nodeByLabel(entry, "B group").children[0].id !== nodeByLabel(entry, "Nested child").id
	)
		throw new Error("Flow drag failed to move the whole subtree as one edit.");

	await select("Drag target");
	await workspace.focus();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Shift+ArrowDown");
	await assertField("X", 196);
	await assertField("Y", 110);
	await page.keyboard.press("Control+z");
	await page.keyboard.press("Control+z");
	await assertField("X", 195);
	await assertField("Y", 100);
	await page.keyboard.press("Control+Shift+z");
	await page.keyboard.press("Control+y");
	await assertField("X", 196);
	await assertField("Y", 110);
	await page.keyboard.press("Control+z");
	await page.keyboard.press("Control+z");
	await field("X").fill("777");
	await field("X").press("Control+z");
	await field("X").press("Escape");
	await assertField("X", 195);
	if (!(await button("Save").isDisabled()))
		throw new Error("Text-field undo leaked into definition history.");

	await page.evaluate(() => window.__DESIGNER_SMOKE__.requestClose("close-designer"));
	await page.waitForFunction(() => window.__DESIGNER_SMOKE__.resolutions.at(-1)?.decision === "allow");
	await field("X").fill("");
	const closeId = await page.evaluate(() => window.__DESIGNER_SMOKE__.requestClose("close-main"));
	await page.getByRole("dialog").waitFor({ state: "visible" });
	await page.waitForFunction(() => window.__DESIGNER_SMOKE__.nativeRequest?.acknowledged === true);
	const upgraded = await page.evaluate(() => window.__DESIGNER_SMOKE__.requestClose("quit"));
	await page.evaluate(() => window.__DESIGNER_SMOKE__.requestClose("quit"));
	if (upgraded !== closeId || (await page.getByRole("dialog").count()) !== 1)
		throw new Error("Close upgrades/repeats created multiple prompts or request ids.");
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	if ((await field("X").inputValue()) !== "") throw new Error("Close Cancel lost pending invalid input.");
	await field("X").press("Escape");
	await field("X").fill("250");
	await page.evaluate(() => {
		window.__DESIGNER_SMOKE__.failNext = { code: "storage-io", message: "Injected close Save failure" };
		window.__DESIGNER_SMOKE__.requestClose("quit");
	});
	await page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true }).click();
	await page.waitForFunction(() =>
		document.querySelector("dialog")?.textContent.includes("Injected close Save failure"),
	);
	if (nodeByLabel(await saved(), "Drag target").frame.x !== 195)
		throw new Error("Failed close Save reached storage.");
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	await assertField("X", 250);
	await page.evaluate(() => window.__DESIGNER_SMOKE__.requestClose("quit"));
	await page.getByRole("dialog").getByRole("button", { name: "Save changes", exact: true }).click();
	await page.getByRole("dialog").waitFor({ state: "hidden" });
	if (nodeByLabel(await saved(), "Drag target").frame.x !== 250)
		throw new Error("Close Save did not include pending edits.");
	const revision = (await saved()).revision;
	await field("X").fill("260");
	await page.evaluate(() => window.__DESIGNER_SMOKE__.requestClose("close-designer"));
	await page.getByRole("dialog").getByRole("button", { name: "Discard", exact: true }).click();
	await page.getByRole("dialog").waitFor({ state: "hidden" });
	if ((await saved()).revision !== revision) throw new Error("Discard persisted the private draft.");
	await button("Reload").click();
	await page.getByRole("dialog").getByRole("button", { name: "Discard", exact: true }).click();
	await select("Drag target");
	await field("X").fill("270");
	await page.evaluate(() => window.__DESIGNER_SMOKE__.requestClose("close-main"));
	await page.getByRole("dialog").waitFor({ state: "visible" });
	await page.evaluate(() => window.__DESIGNER_SMOKE__.timeoutClose());
	await page.getByRole("dialog").waitFor({ state: "hidden" });
	await assertField("X", 270);
	await button("Reload").click();
	await page.getByRole("dialog").getByRole("button", { name: "Discard", exact: true }).click();

	const result = await page.evaluate(() => ({
		resolutions: window.__DESIGNER_SMOKE__.resolutions,
		publication: window.__DESIGNER_SMOKE__.read().published.selection.kind,
		unsafeMutations: window.__DESIGNER_SMOKE__.calls.filter(
			(command) => command === "sb_dispatch" || command === "layouts_apply",
		),
	}));
	if (
		result.publication !== "classic" ||
		result.unsafeMutations.length ||
		result.resolutions.filter((resolution) => resolution.decision === "allow").length !== 3
	)
		throw new Error("Close guard authorized unexpected work or changed match/publication state.");
	return {
		...result,
		workflows:
			"P5 regression; Free drag/resize; zoom-independent transforms; gesture Escape; atomic undo/redo after Save; pan/grid; snap guides; locks; flow subtree reorder; keyboard/native text undo; coalesced/upgraded native close; Save failure/Cancel/Save/Discard/timeout",
	};
}
