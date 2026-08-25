import { Button } from "@/components/ui/Button/Button";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { INPUT_CLASS } from "@/entries/Settings/constants";
import { matchDisplayName, usePresetsStore } from "@/lib/stores/presetsStore";
import type { MatchPreset } from "@/bindings/MatchPreset";
import type { PresetLibrary } from "@/bindings/PresetLibrary";
import React from "react";
import { PresetList } from "../PresetList";

interface MatchDraft {
	/** `""` clears the label, restoring the derived `"{home} vs {away}"`. */
	label: string;
	homeTeamId: string;
	awayTeamId: string;
}

const NEW_MATCH_DRAFT: MatchDraft = { label: "", homeTeamId: "", awayTeamId: "" };

function draftOf(fixture: MatchPreset): MatchDraft {
	return {
		label: fixture.label ?? "",
		homeTeamId: fixture.homeTeamId,
		awayTeamId: fixture.awayTeamId,
	};
}

function initialDraft(library: PresetLibrary, focusMatchId: string | null): MatchDraft | null {
	const fixture = focusMatchId ? library.matches.find((entry) => entry.id === focusMatchId) : undefined;
	return fixture ? draftOf(fixture) : null;
}

interface MatchesTabProps {
	library: PresetLibrary;
	onDirtyChange(dirty: boolean): void;
	discardSignal: number;
	/**
	 * Set when a Teams-tab link asks to open a specific fixture. Consumed at
	 * mount — a jump always mounts this tab fresh (the two tabs are never
	 * mounted together), and the parent clears it on manual tab switches.
	 */
	focusMatchId: string | null;
}

/**
 * Matches tab (doc 09 §7.2): fixture list on the left (derived name + both
 * team colours), optional label and two team selects on the right. The team
 * already chosen for the other slot is disabled, which enforces the
 * "two different teams" rule in the UI instead of via an error toast.
 */
export function MatchesTab({
	library,
	onDirtyChange,
	discardSignal,
	focusMatchId,
}: MatchesTabProps): React.JSX.Element {
	const createMatch = usePresetsStore((store) => store.createMatch);
	const updateMatch = usePresetsStore((store) => store.updateMatch);
	const deleteMatch = usePresetsStore((store) => store.deleteMatch);

	const [selectedId, setSelectedId] = React.useState<string | null>(() =>
		focusMatchId && library.matches.some((entry) => entry.id === focusMatchId) ? focusMatchId : null,
	);
	const [creating, setCreating] = React.useState(false);
	const [draft, setDraft] = React.useState<MatchDraft | null>(() => initialDraft(library, focusMatchId));
	const [baseline, setBaseline] = React.useState<MatchDraft | null>(() =>
		initialDraft(library, focusMatchId),
	);
	const [error, setError] = React.useState<string | null>(null);

	const selectedFixture = creating ? undefined : library.matches.find((entry) => entry.id === selectedId);

	const dirty = Boolean(
		draft &&
		baseline &&
		(draft.label !== baseline.label ||
			draft.homeTeamId !== baseline.homeTeamId ||
			draft.awayTeamId !== baseline.awayTeamId),
	);

	React.useEffect(() => {
		onDirtyChange(dirty);
		return () => onDirtyChange(false);
	}, [dirty, onDirtyChange]);

	const discard = React.useCallback(() => {
		setDraft(baseline);
		setError(null);
	}, [baseline]);

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

	const openDraft = (next: MatchDraft, id: string | null, isCreate: boolean): void => {
		setDraft(next);
		setBaseline(next);
		setSelectedId(id);
		setCreating(isCreate);
		setError(null);
	};

	const selectFixture = (id: string): void => {
		if (id === selectedId && !creating) return;
		const fixture = library.matches.find((entry) => entry.id === id);
		if (!fixture || !confirmDiscard()) return;
		openDraft(draftOf(fixture), fixture.id, false);
	};

	const startCreate = (): void => {
		if (!confirmDiscard()) return;
		openDraft({ ...NEW_MATCH_DRAFT }, null, true);
	};

	const teamName = (id: string): string => library.teams.find((team) => team.id === id)?.name ?? "?";
	const teamColor = (id: string): string => library.teams.find((team) => team.id === id)?.color ?? "#666666";

	const twoDifferentTeams =
		draft !== null &&
		draft.homeTeamId !== "" &&
		draft.awayTeamId !== "" &&
		draft.homeTeamId !== draft.awayTeamId;
	const canSave = Boolean(draft && dirty && twoDifferentTeams && (creating || selectedFixture));

	const save = async (): Promise<void> => {
		if (!draft || !canSave) return;
		try {
			setError(null);
			const fixture = creating
				? await createMatch(
						draft.label.trim() === "" ? null : draft.label.trim(),
						draft.homeTeamId,
						draft.awayTeamId,
					)
				: selectedFixture
					? // `""` clears the label server-side (`null` means "leave unchanged").
						await updateMatch(selectedFixture.id, {
							label: draft.label,
							homeTeamId: draft.homeTeamId,
							awayTeamId: draft.awayTeamId,
						})
					: undefined;
			if (fixture) {
				openDraft(draftOf(fixture), fixture.id, false);
			}
		} catch (cause) {
			setError(String(cause));
		}
	};

	const remove = async (): Promise<void> => {
		if (!selectedFixture) return;
		try {
			setError(null);
			await deleteMatch(selectedFixture.id);
			setDraft(null);
			setBaseline(null);
			setSelectedId(null);
		} catch (cause) {
			setError(String(cause));
		}
	};

	// Placeholder for the label field: what shows when no label is set.
	const derivedName =
		draft && draft.homeTeamId && draft.awayTeamId && draft.homeTeamId !== draft.awayTeamId
			? `${teamName(draft.homeTeamId)} vs ${teamName(draft.awayTeamId)}`
			: undefined;

	const notEnoughTeams = library.teams.length < 2;

	const teamSelect = (
		id: string,
		label: string,
		value: string,
		otherValue: string,
		onValueChange: (value: string) => void,
	): React.JSX.Element => (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Select value={value === "" ? undefined : value} onValueChange={onValueChange}>
				<SelectTrigger id={id}>
					<SelectValue placeholder="Select a team" />
				</SelectTrigger>
				<SelectContent>
					{library.teams.map((team) => (
						<SelectItem key={team.id} value={team.id} disabled={team.id === otherValue}>
							{team.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);

	return (
		<div className="flex h-full gap-4">
			<PresetList
				noun="matches"
				items={library.matches.map((fixture) => ({
					id: fixture.id,
					primary: matchDisplayName(library, fixture),
					swatches: [teamColor(fixture.homeTeamId), teamColor(fixture.awayTeamId)],
				}))}
				selectedId={selectedId}
				creating={creating}
				createLabel="+ New match"
				onSelect={selectFixture}
				onCreate={startCreate}
			/>
			<section className="border-app-secondary flex-1 overflow-auto rounded-md border p-4">
				{!draft ? (
					<p className="text-app-tertiary text-sm">Select a preset, or create a new one.</p>
				) : (
					<div className="flex max-w-md flex-col gap-4">
						{notEnoughTeams && creating && (
							<p className="text-warning-400 text-xs" role="alert">
								A fixture needs two different teams. Add teams in the Teams tab first.
							</p>
						)}
						{teamSelect("preset-match-home", "Home team", draft.homeTeamId, draft.awayTeamId, (value) =>
							setDraft({ ...draft, homeTeamId: value }),
						)}
						{teamSelect("preset-match-away", "Away team", draft.awayTeamId, draft.homeTeamId, (value) =>
							setDraft({ ...draft, awayTeamId: value }),
						)}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="preset-match-label">Label (optional)</Label>
							<input
								id="preset-match-label"
								className={INPUT_CLASS}
								maxLength={64}
								value={draft.label}
								onChange={(event) => setDraft({ ...draft, label: event.target.value })}
								placeholder={derivedName ?? "Home vs Away"}
							/>
							{derivedName && (
								<p className="text-app-quaternary text-xs">Leave empty to show “{derivedName}”.</p>
							)}
						</div>
						{error && (
							<p className="text-error-400 text-xs" role="alert">
								{error}
							</p>
						)}
						<div className="flex items-center justify-end gap-2">
							{!creating && selectedFixture && (
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
