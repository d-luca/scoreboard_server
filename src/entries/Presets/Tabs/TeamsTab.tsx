import { Button } from "@/components/ui/Button/Button";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { Label } from "@/components/ui/Label";
import { INPUT_CLASS } from "@/entries/Settings/constants";
import { matchDisplayName, usePresetsStore } from "@/lib/stores/presetsStore";
import type { PresetLibrary } from "@/bindings/PresetLibrary";
import React from "react";
import { PresetList } from "../PresetList";

interface TeamDraft {
	name: string;
	color: string;
}

const NEW_TEAM_DRAFT: TeamDraft = { name: "", color: "#0066cc" };

/** Delete-blocked fixtures listed inline before `…and N more` (doc 09 §4.1). */
const MAX_LISTED_BLOCKING = 5;

interface TeamsTabProps {
	library: PresetLibrary;
	onDirtyChange(dirty: boolean): void;
	discardSignal: number;
	onJumpToMatch(matchId: string): void;
}

/**
 * Teams tab (doc 09 §7.2): team list with colour swatches on the left, a
 * name + colour draft form on the right. Save is disabled while the draft is
 * invalid or unchanged; deleting a referenced team renders the blocking
 * fixtures as links that jump to the Matches tab.
 */
export function TeamsTab({
	library,
	onDirtyChange,
	discardSignal,
	onJumpToMatch,
}: TeamsTabProps): React.JSX.Element {
	const createTeam = usePresetsStore((store) => store.createTeam);
	const updateTeam = usePresetsStore((store) => store.updateTeam);
	const deleteTeam = usePresetsStore((store) => store.deleteTeam);

	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [creating, setCreating] = React.useState(false);
	const [draft, setDraft] = React.useState<TeamDraft | null>(null);
	const [baseline, setBaseline] = React.useState<TeamDraft | null>(null);
	const [error, setError] = React.useState<string | null>(null);

	const selectedTeam = creating ? undefined : library.teams.find((team) => team.id === selectedId);

	const dirty = Boolean(
		draft && baseline && (draft.name !== baseline.name || draft.color !== baseline.color),
	);

	React.useEffect(() => {
		onDirtyChange(dirty);
		return () => onDirtyChange(false);
	}, [dirty, onDirtyChange]);

	const discard = React.useCallback(() => {
		if (creating) {
			// A new entry never reaches the backend — discarding closes the draft.
			setDraft(null);
			setBaseline(null);
			setSelectedId(null);
			setCreating(false);
		} else {
			setDraft(baseline);
		}
		setError(null);
	}, [creating, baseline]);

	// The window bumps `discardSignal` on the first Esc while dirty.
	const lastDiscardSignal = React.useRef(discardSignal);
	React.useEffect(() => {
		if (discardSignal === lastDiscardSignal.current) return;
		lastDiscardSignal.current = discardSignal;
		discard();
	}, [discardSignal, discard]);

	const confirmDiscard = (): boolean => {
		if (!dirty) return true;
		if (window.confirm("Discard unsaved changes?")) {
			discard();
			return true;
		}
		return false;
	};

	const openDraft = (next: TeamDraft, id: string | null, isCreate: boolean): void => {
		setDraft(next);
		setBaseline(next);
		setSelectedId(id);
		setCreating(isCreate);
		setError(null);
	};

	const selectTeam = (id: string): void => {
		if (id === selectedId && !creating) return;
		const team = library.teams.find((entry) => entry.id === id);
		if (!team || !confirmDiscard()) return;
		openDraft({ name: team.name, color: team.color }, team.id, false);
	};

	const startCreate = (): void => {
		if (!confirmDiscard()) return;
		openDraft({ ...NEW_TEAM_DRAFT }, null, true);
	};

	const trimmedName = draft?.name.trim() ?? "";
	const canSave = Boolean(draft && dirty && trimmedName !== "" && (creating || selectedTeam));

	const save = async (): Promise<void> => {
		if (!draft || !canSave) return;
		try {
			setError(null);
			const team = creating
				? await createTeam(trimmedName, draft.color)
				: selectedTeam
					? await updateTeam(selectedTeam.id, { name: trimmedName, color: draft.color })
					: undefined;
			if (team) {
				// Adopt the server-normalized values (trimmed/lowercased) as the
				// new baseline.
				openDraft({ name: team.name, color: team.color }, team.id, false);
			}
		} catch (cause) {
			setError(String(cause));
		}
	};

	const remove = async (): Promise<void> => {
		if (!selectedTeam) return;
		try {
			setError(null);
			await deleteTeam(selectedTeam.id);
			setDraft(null);
			setBaseline(null);
			setSelectedId(null);
		} catch (cause) {
			setError(String(cause));
		}
	};

	// Soft warning only — two clubs can share a name; the id disambiguates.
	const duplicateName =
		trimmedName !== "" &&
		library.teams.some(
			(team) => team.id !== selectedId && team.name.toLowerCase() === trimmedName.toLowerCase(),
		);

	// Fixtures that block deletion, shown as links into the Matches tab.
	const blocking = selectedTeam
		? library.matches.filter(
				(fixture) => fixture.homeTeamId === selectedTeam.id || fixture.awayTeamId === selectedTeam.id,
			)
		: [];

	// The draft, live in the left column: a new entry shows as its own
	// "new" badge row from the moment it opens; an edit is flagged
	// "modified" once it has unsaved changes (name shown live while typing).
	const pending =
		draft === null
			? null
			: creating
				? {
						id: undefined,
						primary: trimmedName === "" ? "New team" : trimmedName,
						swatches: [draft.color],
					}
				: dirty && selectedId !== null
					? {
							id: selectedId,
							primary: trimmedName === "" ? (selectedTeam?.name ?? selectedId) : trimmedName,
							swatches: [draft.color],
						}
					: null;

	return (
		<div className="flex h-full gap-4">
			<PresetList
				noun="teams"
				items={library.teams.map((team) => ({
					id: team.id,
					primary: team.name,
					swatches: [team.color],
				}))}
				pending={pending}
				selectedId={selectedId}
				creating={creating}
				createLabel="+ New team"
				onSelect={selectTeam}
				onCreate={startCreate}
			/>
			<section className="border-app-secondary flex-1 overflow-auto rounded-md border p-4">
				{!draft ? (
					<p className="text-app-tertiary text-sm">Select a preset, or create a new one.</p>
				) : (
					<div className="flex max-w-md flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="preset-team-name">Name</Label>
							<input
								id="preset-team-name"
								className={INPUT_CLASS}
								maxLength={32}
								value={draft.name}
								onChange={(event) => setDraft({ ...draft, name: event.target.value })}
								placeholder="Team name"
							/>
							{duplicateName && (
								<p className="text-warning-400 text-xs">Another team already uses this name.</p>
							)}
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>Colour</Label>
							{/* Remount on external change: the picker keeps internal state. */}
							<ColorPicker
								key={`${selectedId ?? "new"}-${draft.color}`}
								value={draft.color}
								onChange={(color) => setDraft({ ...draft, color })}
							/>
						</div>
						{error && (
							<div className="flex flex-col gap-1" role="alert">
								<p className="text-error-400 text-xs">{error}</p>
								{blocking.length > 0 && (
									<ul className="flex flex-col gap-0.5">
										{blocking.slice(0, MAX_LISTED_BLOCKING).map((fixture) => (
											<li key={fixture.id}>
												<button
													type="button"
													className="text-primary-400 text-xs underline-offset-4 hover:underline"
													onClick={() => onJumpToMatch(fixture.id)}
												>
													{matchDisplayName(library, fixture)}
												</button>
											</li>
										))}
										{blocking.length > MAX_LISTED_BLOCKING && (
											<li className="text-app-quaternary text-xs">
												…and {blocking.length - MAX_LISTED_BLOCKING} more
											</li>
										)}
									</ul>
								)}
							</div>
						)}
						<div className="flex items-center justify-end gap-2">
							{!creating && selectedTeam && (
								<Button type="button" variant="destructive" size="sm" onClick={() => void remove()}>
									Delete
								</Button>
							)}
							<Button type="button" variant="ghost" size="sm" disabled={!dirty} onClick={discard}>
								Discard
							</Button>
							<Button type="button" size="sm" disabled={!canSave} onClick={() => void save()}>
								Save
							</Button>
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
