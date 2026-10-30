import { describe, expect, it } from "vitest";
import { blank } from "./layouts/templates";
import type { GenerationStarted } from "../bindings/GenerationStarted";
import type { LayoutLibrarySnapshot } from "../bindings/LayoutLibrarySnapshot";
import {
	calculateVideoDimensions,
	defaultVideoLayoutSelection,
	validateGenerationStarted,
} from "./videoDimensions";

describe("calculateVideoDimensions", () => {
	it.each([
		[622, 80, 1, 622, 80, 30],
		[1920, 1080, 1, 1920, 1080, 4],
		[3840, 2160, 1, 3840, 2160, 1],
		[2160, 3840, 1, 2160, 3840, 1],
		[621, 79, 1, 622, 80, 30],
		[621, 79, 1.5, 932, 120, 30],
	] as const)(
		"custom %dx%d at %dx returns %dx%d and %d frames",
		(rootWidth, rootHeight, scale, width, height, batchFrames) => {
			const result = calculateVideoDimensions(
				{ kind: "custom", width: rootWidth, height: rootHeight },
				scale,
			);
			expect(result).toMatchObject({ width, height, batchFrames });
		},
	);

	it("keeps Classic rounding", () => {
		expect(calculateVideoDimensions({ kind: "classic" }, 1)).toMatchObject({
			width: 622,
			height: 80,
			batchFrames: 30,
		});
		expect(calculateVideoDimensions({ kind: "classic" }, 1.5)).toMatchObject({
			width: 934,
			height: 120,
		});
	});

	it("rejects scaled roots outside the landscape or portrait 4K bounds", () => {
		expect(calculateVideoDimensions({ kind: "custom", width: 3840, height: 2160 }, 1.01)).toBeNull();
		expect(calculateVideoDimensions({ kind: "custom", width: 2160, height: 2160 }, 1.01)).toBeNull();
	});

	it("validates the frozen generation response before allocation", () => {
		const root = blank([], 621, 79);
		const started: GenerationStarted = {
			totalFrames: 3,
			layout: { kind: "custom", sourceId: "id", sourceRevision: 1, sourceName: "Board", root },
			scale: 1.5,
			contentWidth: 931.5,
			contentHeight: 118.5,
			width: 932,
			height: 120,
			batchFrames: 30,
		};
		expect(validateGenerationStarted(started)).toMatchObject({ width: 932, height: 120 });
		expect(() => validateGenerationStarted({ ...started, batchFrames: 4 })).toThrow(
			"dimensions do not match",
		);
	});

	it("defaults to the published custom layout only when its saved revision still exists", () => {
		const library: LayoutLibrarySnapshot = {
			sessionId: "session",
			storageRevision: 1,
			entries: [
				{
					id: "layout",
					name: "Board",
					revision: 2,
					definition: {
						root: blank(),
						editor: { layers: [{ nodeId: "root", label: "Root", locked: false }] },
					},
				},
			],
			published: {
				sessionId: "session",
				revision: 3,
				selection: {
					kind: "custom",
					sourceId: "layout",
					sourceRevision: 2,
					sourceName: "Board",
					root: blank(),
				},
			},
			storageStatus: {
				state: "ready",
				code: null,
				message: null,
				recoveryToken: null,
				backupPath: null,
			},
		};
		expect(defaultVideoLayoutSelection(library)).toEqual({
			kind: "custom",
			id: "layout",
			expectedRevision: 2,
		});
		expect(
			defaultVideoLayoutSelection({
				...library,
				entries: [{ ...library.entries[0], revision: 3 }],
			}),
		).toEqual({ kind: "classic" });
		expect(
			defaultVideoLayoutSelection({
				...library,
				storageStatus: { ...library.storageStatus, state: "blocked" },
			}),
		).toEqual({ kind: "classic" });
	});
});
