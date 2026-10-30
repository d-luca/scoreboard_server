import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedLayoutSnapshot } from "../bindings/PublishedLayoutSnapshot";
import { WsTransport } from "./wsTransport";

class FakeSocket {
	static readonly OPEN = 1;
	static instances: FakeSocket[] = [];
	readyState = 0;
	onopen: (() => void) | null = null;
	onmessage: ((message: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;

	sent: string[] = [];

	constructor(readonly url: string) {
		FakeSocket.instances.push(this);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.readyState = 3;
		this.onclose?.();
	}

	open(): void {
		this.readyState = FakeSocket.OPEN;
		this.onopen?.();
	}

	frame(value: unknown): void {
		this.onmessage?.({ data: JSON.stringify(value) });
	}

	layout(snapshot: unknown): void {
		this.frame({ type: "layout", data: snapshot });
	}
}

function classic(sessionId: string, revision: number): PublishedLayoutSnapshot {
	return { sessionId, revision, selection: { kind: "classic" } };
}

function custom(sessionId: string, revision: number): PublishedLayoutSnapshot {
	return {
		sessionId,
		revision,
		selection: {
			kind: "custom",
			sourceId: "a",
			sourceRevision: 1,
			sourceName: "Wide",
			root: {
				kind: "root",
				id: "00000000-0000-4000-8000-000000000000",
				width: 320,
				height: 120,
				background: { kind: "literal", hex: "#000000", alpha: 0 },
				children: [],
			},
		},
	};
}

function transport(publishedLayout?: unknown): WsTransport {
	const window: Record<string, unknown> = {
		__SCOREBOARD__: { wsUrl: "ws://h/ws", token: null, mode: "scoreboard", publishedLayout },
	};
	// Top-level page, not the Outputs iframe.
	window.top = window;
	window.self = window;
	vi.stubGlobal("window", window);
	return new WsTransport("ws://h/ws");
}

function latest(): FakeSocket {
	const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
	if (!socket) throw new Error("no socket");
	return socket;
}

beforeEach(() => {
	FakeSocket.instances = [];
	vi.stubGlobal("WebSocket", FakeSocket);
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("WsTransport published layout", () => {
	it("uses the page bootstrap as the cold baseline", async () => {
		const ws = transport(custom("a", 2));
		await expect(ws.getPublishedLayout()).resolves.toEqual(custom("a", 2));
		const seen: PublishedLayoutSnapshot[] = [];
		ws.subscribePublishedLayout((snapshot) => seen.push(snapshot));
		expect(seen).toEqual([custom("a", 2)]);
		ws.close();
	});

	it("waits for the first frame when no bootstrap exists", async () => {
		const ws = transport();
		const pending = ws.getPublishedLayout();
		latest().open();
		latest().layout(classic("a", 0));
		await expect(pending).resolves.toEqual(classic("a", 0));
		ws.close();
	});

	it("delivers newer publications once and ignores the duplicate connect frame", () => {
		const ws = transport(classic("a", 1));
		const seen: PublishedLayoutSnapshot[] = [];
		ws.subscribePublishedLayout((snapshot) => seen.push(snapshot));
		latest().open();
		latest().layout(classic("a", 1));
		latest().layout(custom("a", 2));
		latest().layout(custom("a", 2));
		expect(seen).toEqual([classic("a", 1), custom("a", 2)]);
		ws.close();
	});

	it("re-establishes the session from a reconnected socket even at a lower revision", () => {
		const ws = transport(custom("old", 7));
		const seen: PublishedLayoutSnapshot[] = [];
		ws.subscribePublishedLayout((snapshot) => seen.push(snapshot));
		const first = latest();
		first.open();
		first.layout(custom("old", 7));
		first.close();
		vi.runAllTimers();
		const second = latest();
		expect(second).not.toBe(first);
		second.open();
		second.layout(classic("new", 0));
		// A late frame from the retired socket must not override the new session.
		first.layout(custom("old", 8));
		expect(seen).toEqual([custom("old", 7), classic("new", 0)]);
		ws.close();
	});

	it("reports invalid frames and retains the last valid publication", () => {
		const ws = transport(custom("a", 2));
		const seen: PublishedLayoutSnapshot[] = [];
		const errors: Error[] = [];
		ws.subscribePublishedLayout(
			(snapshot) => seen.push(snapshot),
			(error) => errors.push(error),
		);
		latest().open();
		latest().layout({ sessionId: "a", revision: 3, selection: { kind: "custom" } });
		expect(errors).toHaveLength(1);
		expect(seen).toEqual([custom("a", 2)]);
		// An invalid initial frame does not establish the socket's session.
		latest().layout(classic("b", 0));
		expect(seen).toEqual([custom("a", 2), classic("b", 0)]);
		ws.close();
	});

	it("reports an invalid bootstrap without fabricating Classic", async () => {
		const ws = transport({ nope: true });
		const errors: Error[] = [];
		const seen: PublishedLayoutSnapshot[] = [];
		ws.subscribePublishedLayout(
			(snapshot) => seen.push(snapshot),
			(error) => errors.push(error),
		);
		expect(errors).toHaveLength(1);
		expect(seen).toEqual([]);
		latest().open();
		latest().layout(classic("a", 0));
		expect(seen).toEqual([classic("a", 0)]);
		await expect(ws.getPublishedLayout()).resolves.toEqual(classic("a", 0));
		ws.close();
	});
});
