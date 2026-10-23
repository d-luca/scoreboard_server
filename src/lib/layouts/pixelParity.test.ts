import { describe, expect, it } from "vitest";
import { compareLayoutPixels } from "./pixelParity";

function square(x: number, color = [255, 255, 255, 255]): ImageData {
	const data = new Uint8ClampedArray(20 * 20 * 4);
	for (let y = 5; y < 15; y++) {
		for (let column = x; column < x + 8; column++) data.set(color, (y * 20 + column) * 4);
	}
	return { width: 20, height: 20, data, colorSpace: "srgb" };
}

describe("one-device-pixel parity criterion", () => {
	it("accepts identical images and ignores RGB in fully transparent pixels", () => {
		const a = square(5);
		const b = square(5);
		b.data[0] = 255;
		expect(compareLayoutPixels(a, b)).toMatchObject({ differingPixels: 0, outsideTolerancePixels: 0 });
	});

	it("accepts one-pixel edge displacement, but rejects two-pixel displacement", () => {
		expect(compareLayoutPixels(square(5), square(6))).toMatchObject({ outsideTolerancePixels: 0 });
		expect(compareLayoutPixels(square(5), square(7)).outsideTolerancePixels).toBeGreaterThan(0);
	});

	it("does not allow interior colour or alpha differences", () => {
		expect(
			compareLayoutPixels(square(5), square(5, [255, 0, 0, 255])).outsideTolerancePixels,
		).toBeGreaterThan(0);
		expect(
			compareLayoutPixels(square(5), square(5, [255, 255, 255, 128])).outsideTolerancePixels,
		).toBeGreaterThan(0);
	});

	it("permits coverage differences along the same thin glyph edge", () => {
		const a = square(5, [0, 0, 0, 0]);
		const b = square(5, [0, 0, 0, 0]);
		for (let y = 5; y < 15; y++) {
			[22, 203, 250, 203, 22].forEach((alpha, index) =>
				a.data.set([255, 255, 255, alpha], (y * 20 + 3 + index) * 4),
			);
			[2, 157, 225, 209, 25].forEach((alpha, index) =>
				b.data.set([255, 255, 255, alpha], (y * 20 + 3 + index) * 4),
			);
		}
		expect(compareLayoutPixels(a, b).outsideTolerancePixels).toBe(0);
	});

	it("rejects different dimensions and incomplete image data", () => {
		expect(() =>
			compareLayoutPixels(square(5), { width: 1, height: 1, data: new Uint8ClampedArray(4) }),
		).toThrow("identical dimensions");
		expect(() =>
			compareLayoutPixels(square(5), { width: 20, height: 20, data: new Uint8ClampedArray(4) }),
		).toThrow("complete RGBA");
	});
});
