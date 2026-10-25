import { useState, type JSX } from "react";
import { Button } from "../../components/ui/Button/Button";
import {
	displayName,
	elementChoices,
	findNode,
	flatten,
	isLocked,
	parentOf,
	type AddKind,
	type Draft,
	type DraftAction,
	type LayoutNode,
} from "./draft";

export function Layers({
	draft,
	change,
	select,
	remove,
}: {
	draft: Draft;
	change(action: DraftAction): void;
	select(id: string): void;
	remove(id: string): void;
}): JSX.Element {
	const [kind, setKind] = useState<AddKind>("container");
	const root = draft.definition.root;
	const node = findNode(root, draft.selectedId);
	const parent = parentOf(root, node.id);
	const siblings = parent?.children ?? [];
	const index = siblings.findIndex((item) => item.id === node.id);
	const excluded = new Set(flatten(node).map((item) => item.id));
	const bindings = new Set<string>(
		flatten(root).flatMap((item) => (item.kind === "value" ? [item.binding] : [])),
	);
	const locked = isLocked(draft.definition, node.id);
	const draw = (item: LayoutNode): JSX.Element => {
		const layer = draft.definition.editor.layers.find((layer) => layer.nodeId === item.id);
		const ancestorLocked = parentOf(root, item.id);
		return (
			<li key={item.id}>
				<div className="designer-layer">
					<button
						type="button"
						className={item.id === draft.selectedId ? "selected" : ""}
						aria-current={item.id === draft.selectedId ? "true" : undefined}
						onClick={() => select(item.id)}
						title={layer?.label}
					>
						{layer?.label}
					</button>
					{item.kind !== "root" && (
						<>
							<button
								type="button"
								aria-label={`${item.hidden ? "Show" : "Hide"} ${layer?.label}`}
								disabled={isLocked(draft.definition, item.id)}
								onClick={() => change({ type: "hide", id: item.id, hidden: !item.hidden })}
							>
								{item.hidden ? "Show" : "Hide"}
							</button>
							<button
								type="button"
								aria-label={`${layer?.locked ? "Unlock" : "Lock"} ${layer?.label}`}
								disabled={Boolean(ancestorLocked && isLocked(draft.definition, ancestorLocked.id))}
								onClick={() => change({ type: "lock", id: item.id, locked: !layer?.locked })}
							>
								{layer?.locked ? "Unlock" : "Lock"}
							</button>
						</>
					)}
				</div>
				{"children" in item && item.children.length > 0 && <ul>{item.children.map(draw)}</ul>}
			</li>
		);
	};
	return (
		<div className="designer-layers">
			<h2>Elements / Layers</h2>
			<label className="designer-field">
				<span>Element type</span>
				<select
					value={kind}
					onChange={(event) => {
						const next = elementChoices.find((choice) => choice === event.target.value);
						if (next) setKind(next);
					}}
				>
					{elementChoices.map((kind) => (
						<option key={kind} value={kind} disabled={bindings.has(kind)}>
							{displayName(kind)}
							{bindings.has(kind) ? " (present)" : ""}
						</option>
					))}
				</select>
			</label>
			<Button
				type="button"
				size="sm"
				disabled={locked || bindings.has(kind)}
				onClick={() => change({ type: "add", kind })}
			>
				Add element
			</Button>
			<ul className="designer-tree">{draw(root)}</ul>
			<fieldset disabled={node.kind === "root" || locked}>
				<legend>Selected element</legend>
				<div className="designer-actions">
					<Button
						type="button"
						size="sm"
						disabled={index <= 0 || locked}
						onClick={() => change({ type: "reorder", id: node.id, delta: -1 })}
					>
						Move up
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={index < 0 || index >= siblings.length - 1 || locked}
						onClick={() => change({ type: "reorder", id: node.id, delta: 1 })}
					>
						Move down
					</Button>
				</div>
				<label className="designer-field">
					<span>Parent</span>
					<select
						aria-label="Parent"
						value={parent?.id ?? root.id}
						onChange={(event) => change({ type: "reparent", id: node.id, parentId: event.target.value })}
					>
						{flatten(root)
							.filter((item) => "children" in item && !excluded.has(item.id))
							.map((item) => (
								<option key={item.id} value={item.id} disabled={isLocked(draft.definition, item.id)}>
									{draft.definition.editor.layers.find((layer) => layer.nodeId === item.id)?.label}
								</option>
							))}
					</select>
				</label>
				<Button type="button" size="sm" onClick={() => remove(node.id)}>
					Remove element
				</Button>
			</fieldset>
		</div>
	);
}
