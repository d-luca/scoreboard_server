import { describe, expect, it, vi } from "vitest";
import type { LayoutLibrarySnapshot } from "../../bindings/LayoutLibrarySnapshot";
import type { LayoutLibraryChanged } from "../../bindings/LayoutLibraryChanged";
import { newDraft } from "../../features/scoreboardDesigner/draft";
import { createLayoutsStore, layoutErrorMessage, type LayoutsApi } from "./layoutsStore";

function snapshot(revision = 0): LayoutLibrarySnapshot {
	return {
		sessionId: "session-a",
		storageRevision: revision,
		entries: [],
		published: { sessionId: "session-a", revision: 0, selection: { kind: "classic" } },
		storageStatus: { state: "ready", code: null, message: null, recoveryToken: null, backupPath: null },
	};
}

function api(): LayoutsApi & {
	notify(change: LayoutLibraryChanged): void;
	stops: ReturnType<typeof vi.fn>[];
} {
	let changed: (change: LayoutLibraryChanged) => void = () => undefined;
	const stops = [vi.fn(), vi.fn()];
	return {
		read: vi.fn(async () => snapshot()),
		listenChanged: vi.fn(async (callback) => {
			changed = callback;
			return stops[0];
		}),
		listenWarning: vi.fn(async () => stops[1]),
		create: vi.fn(),
		save: vi.fn(),
		rename: vi.fn(),
		remove: vi.fn(),
		recover: vi.fn(),
		notify: (change) => changed(change),
		stops,
	};
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolve: (value: T) => void = () => {
		throw new Error("Promise not initialized");
	};
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("desktop layout library ordering", () => {
	it("awaits subscriptions before reading and subscribes only once", async () => {
		const backend = api();
		const ready = deferred<() => void>();
		vi.mocked(backend.listenChanged).mockReturnValueOnce(ready.promise);
		const store = createLayoutsStore(backend);
		const refresh = store.getState().refresh();
		expect(backend.read).not.toHaveBeenCalled();
		ready.resolve(vi.fn());
		await refresh;
		await store.getState().refresh();
		expect(backend.listenChanged).toHaveBeenCalledOnce();
		expect(backend.listenWarning).toHaveBeenCalledOnce();
		expect(backend.read).toHaveBeenCalledTimes(2);
	});

	it("does not replace a newer library with an older concurrent refresh", async () => {
		const backend = api();
		const store = createLayoutsStore(backend);
		await store.getState().refresh();
		const old = deferred<LayoutLibrarySnapshot>();
		const newer = deferred<LayoutLibrarySnapshot>();
		vi.mocked(backend.read).mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
		const first = store.getState().refresh();
		const second = store.getState().refresh();
		await Promise.resolve();
		newer.resolve(snapshot(8));
		await second;
		old.resolve(snapshot(3));
		await first;
		expect(store.getState().library?.storageRevision).toBe(8);
	});

	it("reads after notifications and never overwrites drafts or invokes publication", async () => {
		const backend = api();
		const store = createLayoutsStore(backend);
		await store.getState().refresh();
		vi.mocked(backend.read).mockResolvedValueOnce(snapshot(9));
		backend.notify({ sessionId: "session-a", storageRevision: 9 });
		await vi.waitFor(() => expect(store.getState().library?.storageRevision).toBe(9));
		expect(backend.save).not.toHaveBeenCalled();
		expect(backend.create).not.toHaveBeenCalled();
	});

	it("accepts a new session baseline but rejects a late response from the old session", async () => {
		const backend = api();
		const store = createLayoutsStore(backend);
		vi.mocked(backend.read).mockResolvedValueOnce(snapshot(99));
		await store.getState().refresh();
		const old = deferred<LayoutLibrarySnapshot>();
		const newer = deferred<LayoutLibrarySnapshot>();
		vi.mocked(backend.read).mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
		const first = store.getState().refresh();
		const second = store.getState().refresh();
		await Promise.resolve();
		newer.resolve({ ...snapshot(), sessionId: "session-b" });
		await second;
		expect(store.getState().library?.sessionId).toBe("session-b");
		expect(store.getState().library?.storageRevision).toBe(0);
		old.resolve(snapshot(100));
		await first;
		expect(store.getState().library?.sessionId).toBe("session-b");
	});

	it("retains structured conflict and persistence diagnostics without retrying mutations", async () => {
		const backend = api();
		const store = createLayoutsStore(backend);
		await store.getState().refresh();
		const draft = newDraft("blank");
		const saved = { id: "saved", name: draft.name, definition: draft.definition, revision: 1 };
		const error = {
			code: "revision-conflict",
			message: "Stale layout",
			expectedRevision: 1,
			actualRevision: 2,
			diagnostics: [{ property: "/root", message: "Reload needed" }],
		};
		vi.mocked(backend.save).mockRejectedValueOnce(error);
		await expect(store.getState().save(saved, saved.name, saved.definition)).rejects.toEqual(error);
		expect(backend.save).toHaveBeenCalledOnce();
		expect(store.getState().error).toContain("Expected revision 1; current revision 2");
		expect(store.getState().error).toContain("/root: Reload needed");
		expect(layoutErrorMessage(new Error("Disk full"))).toBe("Disk full");
	});

	it("returns the durable mutation's affected saved entry and retains the newest snapshot", async () => {
		const backend = api();
		const store = createLayoutsStore(backend);
		await store.getState().refresh();
		const draft = newDraft("blank");
		const entry = { id: "saved", name: draft.name, definition: draft.definition, revision: 1 };
		vi.mocked(backend.create).mockResolvedValueOnce({
			affectedId: entry.id,
			library: { ...snapshot(1), entries: [entry] },
		});
		expect(await store.getState().create(entry.name, entry.definition)).toEqual(entry);
		expect(store.getState().library?.published.selection.kind).toBe("classic");
	});

	it("surfaces listener/read errors and releases subscriptions", async () => {
		const backend = api();
		const store = createLayoutsStore(backend);
		vi.mocked(backend.listenWarning).mockRejectedValueOnce(new Error("Subscription unavailable"));
		await expect(store.getState().refresh()).rejects.toThrow("Subscription unavailable");
		expect(backend.stops[0]).toHaveBeenCalledOnce();
		expect(store.getState().error).toBe("Subscription unavailable");
		await store.getState().refresh();
		store.getState().dispose();
		expect(backend.stops[1]).toHaveBeenCalledOnce();
	});
});
