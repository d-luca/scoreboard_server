type Raster = Readonly<{ width: number; height: number; data: Uint8ClampedArray }>;

export type LayoutPixelComparison = Readonly<{
	width: number;
	height: number;
	differingPixels: number;
	outsideTolerancePixels: number;
	maxChannelDelta: number;
}>;

function channel(image: Raster, index: number, component: number): number {
	return component === 3
		? image.data[index + 3]
		: Math.round((image.data[index + component] * image.data[index + 3]) / 255);
}

/** Compare DPR-1 screenshots. Non-identical pixels must lie within one pixel of an edge in both images. */
export function compareLayoutPixels(a: Raster, b: Raster): LayoutPixelComparison {
	if (
		a.width !== b.width ||
		a.height !== b.height ||
		a.data.length !== a.width * a.height * 4 ||
		b.data.length !== b.width * b.height * 4
	) {
		throw new Error("Layout parity screenshots must have identical dimensions and complete RGBA data.");
	}
	let differingPixels = 0;
	let outsideTolerancePixels = 0;
	let maxChannelDelta = 0;
	function nearEdge(image: Raster, x: number, y: number): boolean {
		function transition(x1: number, y1: number, x2: number, y2: number): boolean {
			const first = (y1 * image.width + x1) * 4;
			const second = (y2 * image.width + x2) * 4;
			for (let c = 0; c < 4; c++) {
				if (Math.abs(channel(image, first, c) - channel(image, second, c)) > 1) return true;
			}
			return false;
		}
		// Transitions lie between pixel centres; do not expand a two-pixel shift into tolerance.
		for (let yy = Math.max(0, y - 1); yy <= Math.min(image.height - 1, y + 1); yy++) {
			for (let xx = Math.max(0, x - 1); xx <= Math.min(image.width - 2, x); xx++) {
				if (transition(xx, yy, xx + 1, yy)) return true;
			}
		}
		for (let xx = Math.max(0, x - 1); xx <= Math.min(image.width - 1, x + 1); xx++) {
			for (let yy = Math.max(0, y - 1); yy <= Math.min(image.height - 2, y); yy++) {
				if (transition(xx, yy, xx, yy + 1)) return true;
			}
		}
		return false;
	}
	for (let y = 0; y < a.height; y++) {
		for (let x = 0; x < a.width; x++) {
			const index = (y * a.width + x) * 4;
			let delta = 0;
			for (let c = 0; c < 4; c++)
				delta = Math.max(delta, Math.abs(channel(a, index, c) - channel(b, index, c)));
			maxChannelDelta = Math.max(maxChannelDelta, delta);
			if (delta <= 1) continue;
			differingPixels++;
			if (!nearEdge(a, x, y) || !nearEdge(b, x, y)) outsideTolerancePixels++;
		}
	}
	return { width: a.width, height: a.height, differingPixels, outsideTolerancePixels, maxChannelDelta };
}
