import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { Button } from "../../components/ui/Button/Button";
import { Input } from "../../components/ui/Input/Input";
import type { SavedLayout } from "../../bindings/SavedLayout";
import type { DesignerCloseRequest } from "../../bindings/DesignerCloseRequest";
import type { DesignerCloseDecision } from "../../bindings/DesignerCloseDecision";
import type { LayoutRenderInputs } from "../../lib/layouts/bindings";
import { inputsFromLiveState } from "../../lib/layouts/bindings";
import { layoutErrorMessage, useLayoutsStore } from "../../lib/stores/layoutsStore";
import { useScoreboardStore } from "../../lib/stores/desktopScoreboardStore";
import { Choice, CommitField, NumberField } from "../../features/scoreboardDesigner/Fields";
import { PendingEditsContext, type PendingEdits } from "../../features/scoreboardDesigner/pendingEdits";
import {
	draftReducer,
	duplicateDraft,
	findNode,
	hasUnappliedAppearance,
	isDirty,
	newDraft,
	openDraft,
	isLocked,
	parentOf,
	validateDraft,
	type Draft,
	type DraftAction,
} from "../../features/scoreboardDesigner/draft";
import { Inspector } from "../../features/scoreboardDesigner/Inspector";
import { Layers } from "../../features/scoreboardDesigner/Layers";
import { Preview } from "../../features/scoreboardDesigner/Preview";
import { emptyHistory, remember, travel, type DraftHistory } from "../../features/scoreboardDesigner/history";
import { connectDesignerLifecycle, designerLifecycle } from "../../features/scoreboardDesigner/lifecycle";
import { resolveLayout } from "../../lib/layouts/resolveLayout";
import "./designer.css";

type Modal =
	| { kind: "guard"; proceed(): void }
	| { kind: "close"; request: DesignerCloseRequest }
	| { kind: "rename"; saved: SavedLayout }
	| { kind: "confirm"; title: string; message: string; proceed(): void };

function DesignerDialog({
	children,
	busy,
	cancel,
}: {
	children: ReactNode;
	busy: boolean;
	cancel(): void;
}): JSX.Element {
	const dialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		dialog.current?.showModal();
	}, []);
	return (
		<dialog
			ref={dialog}
			className="designer-modal"
			aria-labelledby="designer-dialog-title"
			onCancel={(event) => {
				event.preventDefault();
				if (!busy) cancel();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					if (!busy) cancel();
				}
			}}
		>
			{children}
		</dialog>
	);
}

const initialSamples: LayoutRenderInputs = {
	timerSeconds: 900,
	periodPrefix: "PERIODO",
	periodNumber: 1,
	homeName: "HOME",
	awayName: "AWAY",
	homeScore: 0,
	awayScore: 0,
	homeColor: "#00FF00",
	awayColor: "#FF0000",
};

function RenameDialog({
	saved,
	busy,
	rename,
	cancel,
}: {
	saved: SavedLayout;
	busy: boolean;
	rename(name: string): void;
	cancel(): void;
}): JSX.Element {
	const [name, setName] = useState(saved.name);
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				rename(name);
			}}
		>
			<h2 id="designer-dialog-title">Rename saved layout</h2>
			<label>
				Layout name
				<Input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
			</label>
			<div className="designer-actions">
				<Button type="submit" disabled={busy}>
					Rename
				</Button>
				<Button type="button" disabled={busy} onClick={cancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}

export function ScoreboardDesignerWindow(): JSX.Element {
	const library = useLayoutsStore((store) => store.library);
	const storeError = useLayoutsStore((store) => store.error);
	const live = useScoreboardStore((store) => store.state);
	const liveError = useScoreboardStore((store) => store.error);
	const [draft, setDraft] = useState<Draft | null>(null);
	const current = useRef<Draft | null>(null);
	const [pending] = useState(() => new Map<string, () => void>());
	const [pendingCount, setPendingCount] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [operationBusy, setBusy] = useState(false);
	const [closing, setClosing] = useState(false);
	const busy = operationBusy || closing;
	const inFlight = useRef(false);
	const nativeResolving = useRef(false);
	const closeRequest = useRef<DesignerCloseRequest | null>(null);
	const [guardReady, setGuardReady] = useState(false);
	const [guardEpoch, setGuardEpoch] = useState(0);
	const [modal, setModal] = useState<Modal | null>(null);
	const [history, setHistory] = useState<DraftHistory>(emptyHistory);
	const historyRef = useRef(history);
	const gesture = useRef<Draft | null>(null);
	const [samples, setSamples] = useState(initialSamples);
	const [mode, setMode] = useState<"Sample" | "Live">("Sample");
	const [showSamples, setShowSamples] = useState(false);

	const edits = useMemo<PendingEdits>(
		() => ({
			stage: (id, commit) => {
				if (commit) pending.set(id, commit);
				else pending.delete(id);
				setPendingCount(pending.size);
			},
			flush: () => {
				for (const commit of [...pending.values()]) commit();
			},
		}),
		[pending],
	);
	const install = useCallback((next: Draft | null): void => {
		if (next?.key !== current.current?.key) {
			historyRef.current = emptyHistory();
			setHistory(historyRef.current);
			gesture.current = null;
		}
		current.current = next;
		setDraft(next);
	}, []);
	const endGesture = useCallback(
		(cancel: boolean): void => {
			const before = gesture.current;
			gesture.current = null;
			if (!before || !current.current) return;
			if (cancel) install(before);
			else {
				historyRef.current = remember(historyRef.current, before, current.current);
				setHistory(historyRef.current);
			}
		},
		[install],
	);
	const report = useCallback((error: unknown): void => setError(layoutErrorMessage(error)), []);
	const attempt = (action: () => void): void => {
		try {
			action();
		} catch (error) {
			report(error);
		}
	};
	const apply = (action: DraftAction): void => {
		const currentDraft = current.current;
		if (!currentDraft) throw new Error("Classic is protected. Create a custom layout to edit.");
		const next = draftReducer(currentDraft, action);
		if (!gesture.current && action.type !== "select") {
			historyRef.current = remember(historyRef.current, currentDraft, next);
			setHistory(historyRef.current);
		}
		install(next);
		setError(null);
	};
	const change = (action: DraftAction): void =>
		attempt(() => {
			edits.flush();
			apply(action);
		});
	const save = async (): Promise<boolean> => {
		if (inFlight.current) return false;
		endGesture(false);
		inFlight.current = true;
		setBusy(true);
		try {
			edits.flush();
			const draft = current.current;
			if (!draft) throw new Error("Classic cannot be saved as a custom definition.");
			validateDraft(draft.definition);
			const store = useLayoutsStore.getState();
			const saved = draft.saved
				? await store.save(draft.saved, draft.name, draft.definition)
				: await store.create(draft.name, draft.definition);
			install({ ...draft, name: saved.name, definition: structuredClone(saved.definition), saved });
			setError(null);
			return true;
		} catch (error) {
			report(error);
			return false;
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	};
	const request = (proceed: () => void): void => {
		if (inFlight.current || modal) return;
		endGesture(false);
		if ((current.current && isDirty(current.current)) || pending.size > 0)
			setModal({ kind: "guard", proceed });
		else proceed();
	};
	const discard = (proceed: () => void): void => {
		pending.clear();
		setPendingCount(0);
		setError(null);
		setModal(null);
		install(current.current?.saved ? openDraft(current.current.saved) : null);
		proceed();
	};
	const run = async (operation: () => Promise<void>): Promise<void> => {
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		try {
			await operation();
			setError(null);
		} catch (error) {
			report(error);
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	};
	const selectLayout = (id: string): void => {
		if (id === "classic") {
			install(null);
			return;
		}
		const saved = useLayoutsStore.getState().library?.entries.find((entry) => entry.id === id);
		if (!saved) throw new Error("This layout was removed. Reload the library.");
		install(openDraft(saved));
	};
	const duplicate = (): void => {
		const saved = current.current?.saved;
		if (!saved) throw new Error("Save this layout before duplicating it.");
		const source = useLayoutsStore.getState().library?.entries.find((entry) => entry.id === saved.id);
		if (!source || source.revision !== saved.revision)
			throw new Error("The saved layout changed. Reload it before duplicating.");
		install(duplicateDraft(source));
	};
	const deleteLayout = (): void => {
		const saved = current.current?.saved;
		if (!saved) throw new Error("Only saved custom layouts can be deleted.");
		setModal({
			kind: "confirm",
			title: "Delete saved layout?",
			message: `Delete "${saved.name}" from the library? This cannot be undone.`,
			proceed: () => {
				void run(async () => {
					await useLayoutsStore.getState().remove(saved);
					setModal(null);
					install(null);
				});
			},
		});
	};
	const remove = (id: string): void =>
		attempt(() => {
			edits.flush();
			const draft = current.current;
			if (!draft) return;
			const node = findNode(draft.definition.root, id);
			if ("children" in node && node.children.length > 0) {
				setModal({
					kind: "confirm",
					title: "Remove subtree?",
					message: "Remove this container and all its children? This can be undone.",
					proceed: () => {
						change({ type: "remove", id });
						setModal(null);
					},
				});
			} else apply({ type: "remove", id });
		});

	useEffect(() => {
		void useLayoutsStore.getState().refresh().catch(report);
		void useScoreboardStore.getState().connect();
	}, [report]);

	const resolveClose = useCallback(
		async (request: DesignerCloseRequest, decision: DesignerCloseDecision): Promise<void> => {
			if (nativeResolving.current) return;
			nativeResolving.current = true;
			setClosing(true);
			try {
				await designerLifecycle.resolve(request.requestId, decision);
				if (closeRequest.current?.requestId === request.requestId) {
					closeRequest.current = null;
					setModal((modal) => (modal?.kind === "close" ? null : modal));
				}
			} catch (error) {
				report(error);
			} finally {
				nativeResolving.current = false;
				setClosing(false);
			}
		},
		[report],
	);
	const receiveClose = useCallback(
		(request: DesignerCloseRequest): void => {
			endGesture(false);
			const previous = closeRequest.current;
			closeRequest.current = request;
			if (nativeResolving.current && previous?.requestId === request.requestId) {
				setModal((modal) => (modal?.kind === "close" ? { kind: "close", request } : modal));
			} else if (inFlight.current || (current.current && isDirty(current.current)) || pending.size > 0) {
				setModal({ kind: "close", request });
			} else {
				void resolveClose(request, "allow");
			}
		},
		[endGesture, pending, resolveClose],
	);
	useEffect(() => {
		let active = true;
		let stop: (() => void) | null = null;
		void connectDesignerLifecycle(
			designerLifecycle,
			(request) => {
				if (active) receiveClose(request);
			},
			(failure) => {
				if (!active) return;
				if (closeRequest.current?.requestId === failure.requestId) {
					closeRequest.current = null;
					setModal((modal) => (modal?.kind === "close" ? null : modal));
				}
				report(new Error(failure.message));
			},
		).then(
			(unlisten) => {
				if (active) {
					stop = unlisten;
					setGuardReady(true);
				} else unlisten();
			},
			(error: unknown) => {
				if (active) report(error);
			},
		);
		return () => {
			active = false;
			stop?.();
		};
	}, [guardEpoch, receiveClose, report]);
	const promptId = modal?.kind === "close" ? modal.request.requestId : null;
	useEffect(() => {
		if (promptId) void designerLifecycle.promptOpened(promptId).catch(report);
	}, [promptId, report]);
	const cancelModal = (): void => {
		if (modal?.kind === "close") void resolveClose(modal.request, "cancel");
		else setModal(null);
	};
	const navigateHistory = (direction: "undo" | "redo"): void =>
		attempt(() => {
			endGesture(false);
			edits.flush();
			const draft = current.current;
			if (!draft) return;
			const next = travel(historyRef.current, draft, direction);
			historyRef.current = next.history;
			setHistory(next.history);
			install(next.draft);
			setError(null);
		});
	const saved = draft?.saved;
	const published = library?.published.selection;
	const dirty = draft !== null && (isDirty(draft) || pendingCount > 0);
	const stale =
		saved && library && library.entries.find((entry) => entry.id === saved.id)?.revision !== saved.revision;
	const protectedSource = saved && published?.kind === "custom" && published.sourceId === saved.id;
	const blocked = library?.storageStatus.state === "blocked";
	const inputs = useMemo(
		() => (mode === "Live" ? inputsFromLiveState(live) : samples),
		[mode, live, samples],
	);
	const sampleEdits = useMemo<PendingEdits>(() => ({ stage: () => undefined, flush: () => undefined }), []);

	return (
		<PendingEditsContext.Provider value={edits}>
			<div
				className="designer-window"
				onKeyDown={(event) => {
					if (event.defaultPrevented || busy || modal) return;
					const command = event.ctrlKey || event.metaKey;
					if (command && event.key.toLowerCase() === "s") {
						event.preventDefault();
						if (draft && !blocked && !stale) void save();
						return;
					}
					if (
						event.target instanceof HTMLElement &&
						event.target.closest("input, textarea, select, [contenteditable]")
					)
						return;
					if (command && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
						event.preventDefault();
						navigateHistory(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
					} else if (event.key === "Delete" && current.current) {
						event.preventDefault();
						const id = current.current.selectedId;
						if (id !== current.current.definition.root.id && !isLocked(current.current.definition, id))
							remove(id);
					} else if (event.key.startsWith("Arrow") && !command && !event.altKey && current.current) {
						const currentDraft = current.current;
						const node = findNode(currentDraft.definition.root, currentDraft.selectedId);
						const parent = parentOf(currentDraft.definition.root, node.id);
						if (
							node.kind === "root" ||
							!parent ||
							isLocked(currentDraft.definition, node.id) ||
							(parent.kind === "container" && parent.mode !== "free") ||
							!resolveLayout(currentDraft.definition.root).nodes.some((item) => item.id === node.id)
						)
							return;
						event.preventDefault();
						const step = event.shiftKey ? 10 : 1;
						const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
						const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
						change({
							type: "update",
							id: node.id,
							update: (node) => {
								if (node.kind !== "root") {
									node.frame.x += dx;
									node.frame.y += dy;
								}
							},
						});
					}
				}}
			>
				<header className="designer-header">
					<div className="designer-title">
						<h1>Scoreboard Designer</h1>
						<span>
							{draft
								? dirty
									? "Modified / unsaved"
									: `Saved · revision ${saved?.revision}`
								: "Classic · protected"}
						</span>
						<span>
							{published?.kind === "custom"
								? `Published: ${published.sourceName} · revision ${published.sourceRevision}`
								: "Published: Classic"}
						</span>
						{saved && published && (
							<span>
								{hasUnappliedAppearance(saved, published)
									? "Saved appearance not applied"
									: "Saved appearance matches publication"}
							</span>
						)}
						{protectedSource && <span>Selected layout is the published source</span>}
						{draft && saved && draft.name !== saved.name && <span>Draft name: {draft.name}</span>}
					</div>
					<fieldset disabled={busy || !library || Boolean(modal)}>
						<div className="designer-actions">
							<label>
								Layout{" "}
								<select
									aria-label="Layout"
									value={draft ? (saved?.id ?? "draft") : "classic"}
									onChange={(event) => {
										const id = event.target.value;
										request(() => attempt(() => selectLayout(id)));
									}}
								>
									<option value="classic">Classic (protected)</option>
									{draft && !saved && <option value="draft">{draft.name} (private draft)</option>}
									{library?.entries.map((entry) => (
										<option key={entry.id} value={entry.id}>
											{entry.name}
										</option>
									))}
								</select>
							</label>
							<Button type="button" size="sm" onClick={() => request(() => install(newDraft("blank")))}>
								New Blank
							</Button>
							<Button type="button" size="sm" onClick={() => request(() => install(newDraft("starter")))}>
								New Starter
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={!saved || blocked}
								onClick={() =>
									request(() => {
										const saved = current.current?.saved;
										if (saved) setModal({ kind: "rename", saved });
									})
								}
							>
								Rename
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={!saved}
								onClick={() => request(() => attempt(duplicate))}
							>
								Duplicate
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={!saved || Boolean(protectedSource) || blocked}
								onClick={() => request(() => attempt(deleteLayout))}
							>
								Delete
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={!draft || (history.past.length === 0 && pendingCount === 0)}
								onClick={() => navigateHistory("undo")}
							>
								Undo
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={!draft || history.future.length === 0}
								onClick={() => navigateHistory("redo")}
							>
								Redo
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={!draft || !dirty || blocked || Boolean(stale)}
								onClick={() => {
									void save();
								}}
							>
								Save
							</Button>
							<Button type="button" size="sm" disabled title="Live publication is introduced in P7">
								Apply (P7)
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() =>
									request(() => {
										void run(async () => {
											await useLayoutsStore.getState().refresh();
											selectLayout(current.current?.saved?.id ?? "classic");
										});
									})
								}
							>
								Reload
							</Button>
						</div>
						{draft && !saved && (
							<CommitField
								id="draft-name"
								label="Layout name"
								value={draft.name}
								edits={edits}
								onCommit={(name) => apply({ type: "name", name })}
							/>
						)}
					</fieldset>
				</header>
				{!guardReady && (
					<div className="designer-alert" role="status">
						Initializing native close guard. Closing is blocked until the designer can respond.
						<Button type="button" size="sm" onClick={() => setGuardEpoch((value) => value + 1)}>
							Retry close guard
						</Button>
					</div>
				)}
				{(error || storeError) && (
					<div role="alert" className="designer-alert">
						{error ?? storeError}
					</div>
				)}
				{stale && (
					<div role="alert" className="designer-alert">
						This saved layout changed or was deleted elsewhere. Your draft is preserved. Reload explicitly
						before saving.
					</div>
				)}
				{blocked && (
					<div role="alert" className="designer-alert">
						{library.storageStatus.message} The original file is preserved; Save is blocked.
						{library.storageStatus.recoveryToken && (
							<Button
								type="button"
								size="sm"
								disabled={busy}
								onClick={() =>
									request(() => {
										const token = useLayoutsStore.getState().library?.storageStatus.recoveryToken;
										if (!token) {
											report(new Error("Reload storage status before recovery."));
											return;
										}
										setModal({
											kind: "confirm",
											title: "Back up and reset layout storage?",
											message:
												"Preserve the original in a backup and reset the library and published selection to Classic.",
											proceed: () => {
												void run(async () => {
													await useLayoutsStore.getState().recover(token);
													install(null);
													setModal(null);
												});
											},
										});
									})
								}
							>
								Back up and reset
							</Button>
						)}
					</div>
				)}
				{!library ? (
					<div className="designer-loading">
						Loading layout library...{" "}
						<Button
							type="button"
							onClick={() => {
								void useLayoutsStore.getState().refresh().catch(report);
							}}
						>
							Retry
						</Button>
					</div>
				) : (
					<div className="designer-body">
						<aside className="designer-sidebar designer-left" aria-label="Layers">
							<fieldset disabled={busy || Boolean(modal)}>
								{draft ? (
									<Layers
										draft={draft}
										change={change}
										select={(id) => change({ type: "select", id })}
										remove={remove}
									/>
								) : (
									<p>Classic cannot be edited, duplicated or deleted. Create a Blank or Starter layout.</p>
								)}
							</fieldset>
						</aside>
						<Preview
							draft={draft}
							inputs={inputs}
							disabled={busy || Boolean(modal)}
							editing={{
								begin: (id) => {
									edits.flush();
									apply({ type: "select", id });
									const draft = current.current;
									if (!draft) throw new Error("Classic cannot be manipulated.");
									gesture.current = draft;
									return draft;
								},
								change: apply,
								end: endGesture,
								error: report,
							}}
						/>
						<aside className="designer-sidebar designer-right" aria-label="Properties">
							<fieldset disabled={busy || Boolean(modal)}>
								{draft ? (
									<Inspector key={draft.key} draft={draft} edits={edits} change={apply} />
								) : (
									<p>Classic output: 622 × 80. Protected built-in layout.</p>
								)}
							</fieldset>
						</aside>
					</div>
				)}
				<footer className="designer-footer">
					<div className="designer-actions">
						<Choice
							label="Preview data"
							choices={["Sample", "Live"] as const}
							value={mode}
							onChange={(value) => setMode(value)}
						/>
						{mode === "Sample" && (
							<Button type="button" size="sm" onClick={() => setShowSamples((value) => !value)}>
								{showSamples ? "Hide" : "Edit"} sample data
							</Button>
						)}
						<span>
							Preview only. Save never publishes or changes the match. Apply is unavailable until P7.
						</span>
					</div>
					{mode === "Live" && <p>Read-only match values{liveError ? ` · ${liveError}` : ""}</p>}
					{mode === "Sample" && showSamples && (
						<PendingEditsContext.Provider value={sampleEdits}>
							<div className="designer-samples">
								{(["homeName", "awayName", "homeColor", "awayColor", "periodPrefix"] as const).map((key) => (
									<CommitField
										key={key}
										id={`sample-${key}`}
										label={key}
										value={samples[key]}
										edits={sampleEdits}
										onCommit={(value) => {
											if ((key === "homeColor" || key === "awayColor") && !/^#[0-9a-f]{6}$/i.test(value))
												throw new Error("Use #RRGGBB.");
											setSamples((current) => ({ ...current, [key]: value }));
										}}
									/>
								))}
								{(["timerSeconds", "periodNumber", "homeScore", "awayScore"] as const).map((key) => (
									<NumberField
										key={key}
										id={`sample-${key}`}
										label={key}
										value={samples[key]}
										edits={sampleEdits}
										min={key === "periodNumber" ? 1 : 0}
										max={999999}
										integer
										onCommit={(value) => setSamples((current) => ({ ...current, [key]: value }))}
									/>
								))}
							</div>
						</PendingEditsContext.Provider>
					)}
					<small>
						Drag/resize Free children; drag Row/Column children to reorder. Space or middle-drag pans. Ctrl+S
						saves; Ctrl+Z / Ctrl+Shift+Z undo/redo. Arrows nudge 1px; Shift+arrows 10px.
					</small>
				</footer>
				{modal && (
					<DesignerDialog busy={busy} cancel={cancelModal}>
						{modal.kind === "guard" || modal.kind === "close" ? (
							<>
								<h2 id="designer-dialog-title">
									{modal.kind === "close"
										? modal.request.reason === "close-designer"
											? "Close Scoreboard Designer?"
											: "Close application?"
										: "Unsaved layout changes"}
								</h2>
								<p>
									Save your draft, discard it, or cancel navigation. Pending field edits count as unsaved
									work.
								</p>
								<div className="designer-actions">
									<Button
										type="button"
										disabled={busy || blocked}
										onClick={() => {
											if (
												modal.kind === "close" &&
												(!current.current || !isDirty(current.current)) &&
												pending.size === 0
											) {
												void resolveClose(modal.request, "allow");
												return;
											}
											void save().then((ok) => {
												if (ok) {
													if (modal.kind === "close") void resolveClose(modal.request, "allow");
													else {
														setModal(null);
														modal.proceed();
													}
												}
											});
										}}
									>
										Save changes
									</Button>
									<Button
										type="button"
										disabled={busy}
										onClick={() => {
											if (modal.kind === "close") void resolveClose(modal.request, "allow");
											else discard(modal.proceed);
										}}
									>
										Discard
									</Button>
									<Button type="button" disabled={busy} onClick={cancelModal}>
										Cancel
									</Button>
								</div>
							</>
						) : modal.kind === "rename" ? (
							<RenameDialog
								saved={modal.saved}
								busy={busy}
								cancel={() => setModal(null)}
								rename={(name) => {
									void run(async () => {
										const saved = await useLayoutsStore.getState().rename(modal.saved, name);
										install(openDraft(saved));
										setModal(null);
									});
								}}
							/>
						) : (
							<>
								<h2 id="designer-dialog-title">{modal.title}</h2>
								<p>{modal.message}</p>
								<div className="designer-actions">
									<Button type="button" disabled={busy} onClick={modal.proceed}>
										Confirm
									</Button>
									<Button type="button" disabled={busy} onClick={() => setModal(null)}>
										Cancel
									</Button>
								</div>
							</>
						)}
						{error && <p role="alert">{error}</p>}
					</DesignerDialog>
				)}
			</div>
		</PendingEditsContext.Provider>
	);
}
