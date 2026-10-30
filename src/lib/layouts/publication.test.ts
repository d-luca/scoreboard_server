import { describe, expect, it } from "vitest";
import type { PublishedLayoutSnapshot } from "../../bindings/PublishedLayoutSnapshot";
import {
	parsePublishedLayout,
	publishedLayoutDimensions,
	PublishedLayoutProtocolError,
	PublishedLayoutTracker,
} from "./publication";

const root = {
	kind: "root",
	id: "00000000-0000-4000-8000-000000000000",
	width: 320,
	height: 120,
	background: { kind: "literal", hex: "#000000", alpha: 0 },
	children: [],
};

function classic(sessionId: string, revision: number): PublishedLayoutSnapshot {
	return { sessionId, revision, selection: { kind: "classic" } };
}

function custom(sessionId: string, revision: number): PublishedLayoutSnapshot {
	return {
		sessionId,
		revision,
		selection: { kind: "custom", sourceId: "a", sourceRevision: 2, sourceName: "Wide", root },
	} as PublishedLayoutSnapshot;
}

describe("parsePublishedLayout", () => {
	it("accepts Classic and custom publications", () => {
		expect(parsePublishedLayout(classic("s", 0))).toEqual(classic("s", 0));
		expect(parsePublishedLayout(custom("s", 4))).toEqual(custom("s", 4));
	});

	it("normalizes Classic to its contract shape", () => {
		expect(
			parsePublishedLayout({ sessionId: "s", revision: 1, selection: { kind: "classic", x: 1 } }),
		).toEqual(classic("s", 1));
	});

	it.each([
		["non-object", null],
		["missing session", { revision: 0, selection: { kind: "classic" } }],
		["empty session", { sessionId: "", revision: 0, selection: { kind: "classic" } }],
		["negative revision", { sessionId: "s", revision: -1, selection: { kind: "classic" } }],
		["fractional revision", { sessionId: "s", revision: 1.5, selection: { kind: "classic" } }],
		["unsafe revision", { sessionId: "s", revision: 2 ** 53, selection: { kind: "classic" } }],
		["unknown kind", { sessionId: "s", revision: 0, selection: { kind: "fancy" } }],
		["missing root", { ...custom("s", 1), selection: { ...custom("s", 1).selection, root: undefined } }],
		[
			"zero-size root",
			{ ...custom("s", 1), selection: { ...custom("s", 1).selection, root: { ...root, width: 0 } } },
		],
		[
			"non-array children",
			{ ...custom("s", 1), selection: { ...custom("s", 1).selection, root: { ...root, children: {} } } },
		],
		["missing source", { ...custom("s", 1), selection: { kind: "custom", root } }],
	])("rejects %s as a protocol error", (_, value) => {
		expect(() => parsePublishedLayout(value)).toThrow(PublishedLayoutProtocolError);
	});
});

describe("PublishedLayoutTracker", () => {
	it("accepts the first publication and newer revisions in the same session", () => {
		const tracker = new PublishedLayoutTracker();
		expect(tracker.accept(classic("a", 3), false)).toBe(true);
		expect(tracker.accept(custom("a", 4), false)).toBe(true);
		expect(tracker.current).toEqual(custom("a", 4));
	});

	it("ignores duplicates and older revisions within one session", () => {
		const tracker = new PublishedLayoutTracker();
		tracker.accept(custom("a", 4), true);
		expect(tracker.accept(custom("a", 4), true)).toBe(false);
		expect(tracker.accept(classic("a", 2), true)).toBe(false);
		expect(tracker.current).toEqual(custom("a", 4));
	});

	it("lets a baseline from a new session replace a higher previous revision", () => {
		const tracker = new PublishedLayoutTracker();
		tracker.accept(custom("old", 9), true);
		expect(tracker.accept(classic("new", 0), true)).toBe(true);
		expect(tracker.current).toEqual(classic("new", 0));
	});

	it("does not switch sessions from a non-baseline update", () => {
		const tracker = new PublishedLayoutTracker();
		tracker.accept(classic("a", 1), true);
		expect(tracker.accept(custom("b", 5), false)).toBe(false);
		expect(tracker.current).toEqual(classic("a", 1));
	});
});

describe("publishedLayoutDimensions", () => {
	it("keeps the existing Classic output frame size", () => {
		expect(publishedLayoutDimensions(classic("s", 0))).toEqual({ width: 622, height: 80 });
	});

	it("uses the custom rendering root dimensions", () => {
		expect(publishedLayoutDimensions(custom("s", 1))).toEqual({ width: 320, height: 120 });
	});
});
