import { Button } from "@/components/ui/Button/Button";
import { cn } from "@/lib/utils";
import React from "react";

export interface PresetListItem {
	id: string;
	primary: string;
	/** Colour chips shown on the right (one for teams, two for fixtures). */
	swatches: string[];
}

interface PresetListProps {
	/** Used in the empty state: "No teams yet." / "No matches yet." */
	noun: string;
	items: PresetListItem[];
	selectedId: string | null;
	creating: boolean;
	createLabel: string;
	onSelect(id: string): void;
	onCreate(): void;
}

/**
 * Shared master column for the Presets window (doc 09 §7.2): selectable list
 * with colour swatches plus a create button underneath.
 */
export function PresetList({
	noun,
	items,
	selectedId,
	creating,
	createLabel,
	onSelect,
	onCreate,
}: PresetListProps): React.JSX.Element {
	return (
		<aside className="flex w-64 shrink-0 flex-col gap-2">
			<div className="border-app-secondary flex-1 overflow-auto rounded-md border">
				{items.length === 0 ? (
					<p className="text-app-tertiary p-3 text-xs">No {noun} yet.</p>
				) : (
					<ul className="divide-app-secondary divide-y">
						{items.map((item) => {
							const active = !creating && selectedId === item.id;
							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => onSelect(item.id)}
										aria-current={active ? "true" : undefined}
										className={cn(
											"flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
											active
												? "bg-app-tertiary text-app-primary"
												: "text-app-secondary hover:bg-surface-primary hover:text-app-primary",
										)}
									>
										<span className="truncate">{item.primary}</span>
										<span className="flex shrink-0 gap-1">
											{item.swatches.map((color, index) => (
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
