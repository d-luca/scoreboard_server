/**
 * Run against the development proof page using a supplied Playwright Page at
 * DPR 1 / 100% zoom. No production entry or additional browser runner is needed.
 */
export async function checkLayoutParity(page) {
	await page.reload();
	await page.waitForSelector("#fixture");
	const environment = await page.evaluate(() => ({
		engine: navigator.userAgent,
		dpr: devicePixelRatio,
	}));
	if (environment.dpr !== 1) throw new Error("Pixel parity requires DPR 1 at 100% output scale.");
	const fixtures = await page
		.locator("#fixture option")
		.evaluateAll((options) => options.map((option) => ({ value: option.value, name: option.textContent })));
	if (fixtures.length === 0) throw new Error("No layout parity fixtures were loaded.");
	for (const name of [
		"blank",
		"starter",
		"nested-flow",
		"hidden-flow",
		"overflow",
		"degenerate",
		"full-frame",
		"portrait",
		"styles",
		"root-edges",
		"alignments",
		"rolling-both",
	]) {
		if (!fixtures.some((fixture) => fixture.name === name))
			throw new Error(`Required parity fixture ${name} is missing.`);
	}
	const results = [];
	for (const fixture of fixtures) {
		await page.locator("#fixture").selectOption(fixture.value);
		await page.waitForFunction(
			(name) => document.querySelector("main")?.dataset.fixture === name,
			fixture.name,
		);
		for (const alternate of [false, true]) {
			if ((await page.locator("main").getAttribute("data-alternate")) !== String(alternate)) {
				await page.locator("#inputs").dispatchEvent("click");
			}
			await page.waitForFunction(
				(value) => document.querySelector("main")?.dataset.alternate === value,
				String(alternate),
			);
			await page.waitForFunction(() => !document.querySelector("[data-layout-rolling]"));
			const live = page.locator("[data-layout-live]");
			const canvas = page.locator("[data-layout-canvas]");
			for (const surface of [live, canvas]) {
				const origin = await surface.evaluate((element) => {
					const box = element.getBoundingClientRect();
					return { x: box.x + scrollX, y: box.y + scrollY };
				});
				if (!Number.isInteger(origin.x) || !Number.isInteger(origin.y)) {
					throw new Error("Capture output roots on integer device pixels, without viewport scaling.");
				}
			}
			const livePng = await live.screenshot({ omitBackground: true, scale: "css" });
			const canvasPng = await canvas.screenshot({ omitBackground: true, scale: "css" });
			const comparison = await page.evaluate(
				async ({ live, canvas }) => {
					const { compareLayoutPixels } = await import("/src/lib/layouts/pixelParity.ts");
					async function read(png) {
						const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
						const buffer = document.createElement("canvas");
						buffer.width = image.width;
						buffer.height = image.height;
						const ctx = buffer.getContext("2d");
						if (!ctx) throw new Error("Canvas2D is unavailable for screenshot comparison.");
						ctx.drawImage(image, 0, 0);
						image.close();
						return ctx.getImageData(0, 0, buffer.width, buffer.height);
					}
					return compareLayoutPixels(await read(live), await read(canvas));
				},
				{ live: livePng.toString("base64"), canvas: canvasPng.toString("base64") },
			);
			results.push({ fixture: fixture.name, alternate, ...comparison });
		}
	}
	const failures = results.filter(({ outsideTolerancePixels }) => outsideTolerancePixels !== 0);
	if (failures.length > 0) throw new Error(`Layout pixel parity failed: ${JSON.stringify(failures)}`);
	return { ...environment, results };
}
