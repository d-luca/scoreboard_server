import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { LayoutDefinition } from "../../bindings/LayoutDefinition";
import type { LayoutLibraryChanged } from "../../bindings/LayoutLibraryChanged";
import type { LayoutLibrarySnapshot } from "../../bindings/LayoutLibrarySnapshot";
import type { LayoutMutationResult } from "../../bindings/LayoutMutationResult";
import type { SavedLayout } from "../../bindings/SavedLayout";
import type { LayoutStorageStatus } from "../../bindings/LayoutStorageStatus";

export function layoutErrorMessage(error: unknown): string {
	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
	) {
		let message = error.message;
		if ("expectedRevision" in error && "actualRevision" in error && error.actualRevision !== null) {
			message += ` Expected revision ${String(error.expectedRevision)}; current revision ${String(error.actualRevision)}. Reload explicitly before retrying.`;
		}
		if ("diagnostics" in error && Array.isArray(error.diagnostics)) {
			for (const diagnostic of error.diagnostics) {
				if (typeof diagnostic === "object" && diagnostic !== null && "message" in diagnostic) {
					message += `\n${"property" in diagnostic ? String(diagnostic.property) : ""}: ${String(diagnostic.message)}`;
				}
			}
		}
		return message;
	}
	return String(error);
}

export interface LayoutsApi {
	read(): Promise<LayoutLibrarySnapshot>;
	listenChanged(callback: (change: LayoutLibraryChanged) => void): Promise<UnlistenFn>;
	listenWarning(callback: (status: LayoutStorageStatus) => void): Promise<UnlistenFn>;
	create(name: string, definition: LayoutDefinition): Promise<LayoutMutationResult>;
	save(saved: SavedLayout, name: string, definition: LayoutDefinition): Promise<LayoutMutationResult>;
	rename(saved: SavedLayout, name: string): Promise<LayoutMutationResult>;
	remove(saved: SavedLayout): Promise<LayoutMutationResult>;
	recover(token: string): Promise<LayoutMutationResult>;
}

export interface LayoutsStore {
	library: LayoutLibrarySnapshot | null;
	error: string | null;
	refresh(): Promise<void>;
	create(name: string, definition: LayoutDefinition): Promise<SavedLayout>;
	save(saved: SavedLayout, name: string, definition: LayoutDefinition): Promise<SavedLayout>;
	rename(saved: SavedLayout, name: string): Promise<SavedLayout>;
	remove(saved: SavedLayout): Promise<void>;
	recover(token: string): Promise<void>;
	dispose(): void;
}

export function createLayoutsStore(api: LayoutsApi): UseBoundStore<StoreApi<LayoutsStore>> {
	let subscription: Promise<void> | null = null;
	const stops: UnlistenFn[] = [];
	let disposed = false;
	let request = 0;
	let accepted = 0;
	return create<LayoutsStore>((set, get) => {
		const accept = (library: LayoutLibrarySnapshot, sequence: number): void => {
			if (disposed) return;
			const current = get().library;
			if (current?.sessionId === library.sessionId && library.storageRevision < current.storageRevision)
				return;
			if (current?.sessionId !== library.sessionId && sequence < accepted) return;
			accepted = Math.max(accepted, sequence);
			set({ library, error: null });
		};
		const mutate = async (operation: () => Promise<LayoutMutationResult>): Promise<LayoutMutationResult> => {
			try {
				const sequence = ++request;
				const result = await operation();
				accept(result.library, sequence);
				return result;
			} catch (error) {
				set({ error: layoutErrorMessage(error) });
				throw error;
			}
		};
		const affected = (result: LayoutMutationResult): SavedLayout => {
			const saved = result.library.entries.find((entry) => entry.id === result.affectedId);
			if (!saved) throw new Error("The layout command did not return its saved entry.");
			return saved;
		};
		return {
			library: null,
			error: null,
			refresh: async () => {
				try {
					if (!subscription) {
						subscription = (async () => {
							const off = await api.listenChanged(() => {
								void get()
									.refresh()
									.catch((error: unknown) => set({ error: layoutErrorMessage(error) }));
							});
							stops.push(off);
							const warning = await api.listenWarning(() => {
								void get()
									.refresh()
									.catch((error: unknown) => set({ error: layoutErrorMessage(error) }));
							});
							stops.push(warning);
							if (disposed) stops.splice(0).forEach((stop) => stop());
						})().catch((error: unknown) => {
							stops.splice(0).forEach((stop) => stop());
							subscription = null;
							throw error;
						});
					}
					await subscription;
					const sequence = ++request;
					accept(await api.read(), sequence);
				} catch (error) {
					set({ error: layoutErrorMessage(error) });
					throw error;
				}
			},
			create: async (name, definition) => affected(await mutate(() => api.create(name, definition))),
			save: async (saved, name, definition) =>
				affected(await mutate(() => api.save(saved, name, definition))),
			rename: async (saved, name) => affected(await mutate(() => api.rename(saved, name))),
			remove: async (saved) => {
				await mutate(() => api.remove(saved));
			},
			recover: async (token) => {
				await mutate(() => api.recover(token));
			},
			dispose: () => {
				disposed = true;
				stops.splice(0).forEach((stop) => stop());
			},
		};
	});
}

export const useLayoutsStore = createLayoutsStore({
	read: () => invoke<LayoutLibrarySnapshot>("layouts_get"),
	listenChanged: (callback) =>
		listen<LayoutLibraryChanged>("layouts:library-changed", ({ payload }) => callback(payload)),
	listenWarning: (callback) =>
		listen<LayoutStorageStatus>("layouts:storage-warning", ({ payload }) => callback(payload)),
	create: (name, definition) => invoke<LayoutMutationResult>("layouts_create", { name, definition }),
	save: (saved, name, definition) =>
		invoke<LayoutMutationResult>("layouts_save", {
			id: saved.id,
			expectedRevision: saved.revision,
			name,
			definition,
		}),
	rename: (saved, name) =>
		invoke<LayoutMutationResult>("layouts_rename", { id: saved.id, expectedRevision: saved.revision, name }),
	remove: (saved) =>
		invoke<LayoutMutationResult>("layouts_delete", { id: saved.id, expectedRevision: saved.revision }),
	recover: (expectedRecoveryToken) =>
		invoke<LayoutMutationResult>("layouts_recover", { expectedRecoveryToken }),
});
