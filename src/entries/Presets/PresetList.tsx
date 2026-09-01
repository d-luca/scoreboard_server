import { PencilIcon } from "@/components/icons/PencilIcon";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { Button } from "@/components/ui/Button/Button";
import { cn } from "@/lib/utils";
import React from "react";

export interface PresetListItem {
	id: string;
	primary: string;
	/** Colour chips shown on the right (one for teams, two for fixtures). */
	swatches: string[];
}

/**
 * Live, unsaved draft shown in the list before it is confirmed with Save.
 * A brand-new draft has `id: undefined`; an edit targets an existing row.
 */
export interface PresetPendingItem {
	id?: string;
	primary: string;
	swatches: string[];
}

interface PresetListProps {
	/** Used in the empty state: "No teams yet." / "No matches yet." */
	noun: string;
	items: PresetListItem[];
	/**
	 * The in-progress draft, if any. A new draft renders an extra row at the
	 * bottom (where the backend appends saved entries); a modified draft
	 * replaces the existing row's display and badges it.
	 */
	pending: PresetPendingItem | null;
	selectedId: string | null;
	creating: boolean;
	createLabel: string;
	onSelect(id: string): void;
	onCreate(): void;
}

interface PresetListRow extends PresetListItem {
	/** No saved entry backs this row yet — it is purely the draft. */
	preview: boolean;
	/** The draft changed something on an existing entry. */
	modified: boolean;
	/** The draft is a not-yet-saved new entry. */
	brandNew: boolean;
}

/** Merge saved items with the pending draft into display rows. */
function rowsOf(items: PresetListItem[], pending: PresetPendingItem | null): PresetListRow[] {
	const rows = items.map((item) => {
		// A draft editing this row replaces its display and badges it.
		const isPending = pending !== null && pending.id === item.id;
		return isPending
			? {
					...item,
					primary: pending.primary,
					swatches: pending.swatches,
					preview: false,
					modified: true,
					brandNew: false,
				}
			: { ...item, preview: false, modified: false, brandNew: false };
	});
	// A draft for a not-yet-saved entry appends its own row at the bottom —
	// the same spot the backend uses for new records, so no jump on save.
	if (pending !== null && pending.id === undefined) {
		rows.push({
			id: "__pending__",
			primary: pending.primary,
			swatches: pending.swatches,
			preview: true,
			modified: false,
			brandNew: true,
		});
	}
	return rows;
}

/**
 * Shared master column for the Presets window (doc 09 §7.2): selectable list
 * with colour swatches plus a create button underneath. Unsaved drafts appear
 * inline — a new one as a "new" badge row, an edit as a "modified" badge.
 */
export function PresetList({
	noun,
	items,
	pending,
	selectedId,
	creating,
	createLabel,
	onSelect,
	onCreate,
}: PresetListProps): React.JSX.Element {
	const rows = rowsOf(items, pending);

	return (
		<aside className="flex w-64 shrink-0 flex-col gap-2">
			<div className="border-app-secondary flex-1 overflow-auto rounded-md border">
				{rows.length === 0 ? (
					<p className="text-app-tertiary p-3 text-xs">No {noun} yet.</p>
				) : (
					<ul className="divide-app-secondary divide-y">
						{rows.map((row) => {
							// The row whose draft is open stays highlighted; a dirty
							// one additionally shows its "new"/"modified" badge.
							const active = row.preview ? creating : selectedId === row.id;
							return (
								<li key={row.id}>
									<button
										type="button"
										disabled={row.preview}
										onClick={() => onSelect(row.id)}
										aria-current={active ? "true" : undefined}
										className={cn(
											"flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
											active
												? "bg-app-tertiary text-app-primary"
												: "text-app-secondary hover:bg-surface-primary hover:text-app-primary",
										)}
									>
										<span className="flex min-w-0 items-center gap-1.5">
											<span className="truncate">{row.primary}</span>
											{row.brandNew && (
												<span className="text-primary-400 flex shrink-0 items-center gap-0.5 text-[11px] font-medium">
													<PlusIcon className="h-3 w-3" />
													new
												</span>
											)}
											{row.modified && (
												<span className="text-warning-400 flex shrink-0 items-center gap-0.5 text-[11px] font-medium">
													<PencilIcon className="h-3 w-3" />
													modified
												</span>
											)}
										</span>
										<span className="flex shrink-0 gap-1">
											{row.swatches.map((color, index) => (
												<span
													key={index}
													className="h-3.5 w-3.5 rounded-sm border border-black/20"
													style={{ backgroundColor: color }}
												/>
											))}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
			<Button type="button" variant="outline" size="sm" onClick={onCreate}>
				{createLabel}
			</Button>
		</aside>
	);
}
