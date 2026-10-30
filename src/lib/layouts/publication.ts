import type { PublishedLayoutSnapshot } from "../../bindings/PublishedLayoutSnapshot";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../scoreboardGeometry";

/**
 * Tauri-free publication synchronization helpers shared by the LAN and
 * desktop transports (see the P0 "Public synchronization and ordering"
 * contract).
 */

/** Malformed publication data from the server or page bootstrap. */
export class PublishedLayoutProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid published layout: ${message}`);
		this.name = "PublishedLayoutProtocolError";
	}
}

const MAX_REVISION = Number.MAX_SAFE_INTEGER;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_REVISION;
}

function isDimension(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Validates the publication envelope and the rendering root's shape. The
 * element tree itself was validated in Rust before publication; renderers
 * must still treat a resolution failure as a protocol error.
 */
export function parsePublishedLayout(value: unknown): PublishedLayoutSnapshot {
	if (!isRecord(value)) throw new PublishedLayoutProtocolError("expected an object");
	const { sessionId, revision, selection } = value;
	if (typeof sessionId !== "string" || sessionId.length === 0)
		throw new PublishedLayoutProtocolError("missing session id");
	if (!isRevision(revision)) throw new PublishedLayoutProtocolError("invalid revision");
	if (!isRecord(selection)) throw new PublishedLayoutProtocolError("missing selection");
	if (selection.kind === "classic") return { sessionId, revision, selection: { kind: "classic" } };
	if (selection.kind !== "custom") throw new PublishedLayoutProtocolError("unknown selection kind");
	const { sourceId, sourceRevision, sourceName, root } = selection;
	if (typeof sourceId !== "string" || typeof sourceName !== "string" || !isRevision(sourceRevision))
		throw new PublishedLayoutProtocolError("invalid custom source");
	if (
		!isRecord(root) ||
		root.kind !== "root" ||
		typeof root.id !== "string" ||
		!isDimension(root.width) ||
		!isDimension(root.height) ||
		!isRecord(root.background) ||
		!Array.isArray(root.children)
	)
		throw new PublishedLayoutProtocolError("invalid rendering root");
	return value as PublishedLayoutSnapshot;
}

export function publishedLayoutDimensions(
	snapshot: PublishedLayoutSnapshot,
): Readonly<{ width: number; height: number }> {
	return snapshot.selection.kind === "custom"
		? { width: snapshot.selection.root.width, height: snapshot.selection.root.height }
		: { width: FRAME_WIDTH, height: FRAME_HEIGHT };
}

/**
 * Orders publications by runtime session plus revision. Revisions are only
 * comparable within one session; only a baseline (page bootstrap, a
 * socket's initial frame or a desktop read) may switch sessions, and a new
 * session replaces the previous one even with a lower revision.
 */
export class PublishedLayoutTracker {
	private snapshot: PublishedLayoutSnapshot | null = null;

	get current(): PublishedLayoutSnapshot | null {
		return this.snapshot;
	}

	/** Returns true when `next` replaced the current publication. */
	accept(next: PublishedLayoutSnapshot, baseline: boolean): boolean {
		const current = this.snapshot;
		if (current) {
			if (next.sessionId !== current.sessionId) {
				if (!baseline) return false;
			} else if (next.revision <= current.revision) {
				return false;
			}
		}
		this.snapshot = next;
		return true;
	}
}
