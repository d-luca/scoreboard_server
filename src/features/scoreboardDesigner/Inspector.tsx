import type { JSX } from "react";
import type { LayoutColor } from "../../bindings/LayoutColor";
import type { LayoutBoxStyle } from "../../bindings/LayoutBoxStyle";
import type { LayoutTextStyle } from "../../bindings/LayoutTextStyle";
import { Choice, CommitField, NumberField } from "./Fields";
import type { PendingEdits } from "./pendingEdits";
import { findNode, isLocked, parentOf, type Draft, type DraftAction, type LayoutNode } from "./draft";

const alignments = ["start", "center", "end"] as const;

function ColorField({
	id,
	label,
	color,
	edits,
	onChange,
}: {
	id: string;
	label: string;
	color: LayoutColor;
	edits: PendingEdits;
	onChange(color: LayoutColor): void;
}): JSX.Element {
	return (
		<fieldset>
			<legend>{label}</legend>
			<Choice
				label={`${label} source`}
				value={color.kind === "literal" ? "literal" : color.team}
				choices={["literal", "home", "away"] as const}
				onChange={(kind) =>
					onChange(
						kind === "literal"
							? { kind, hex: "#FFFFFF", alpha: color.alpha }
							: { kind: "team", team: kind, alpha: color.alpha },
					)
				}
			/>
			{color.kind === "literal" && (
				<CommitField
					id={`${id}-hex`}
					label={`${label} hex`}
					value={color.hex}
					edits={edits}
					onCommit={(hex) => {
						if (!/^#[0-9a-f]{6}$/i.test(hex.trim())) throw new Error("Use #RRGGBB.");
						onChange({ ...color, hex: hex.trim().toUpperCase() });
					}}
				/>
			)}
			<NumberField
				id={`${id}-alpha`}
				label={`${label} alpha`}
				value={color.alpha}
				min={0}
				max={1}
				edits={edits}
				onCommit={(alpha) => onChange({ ...color, alpha })}
			/>
		</fieldset>
	);
}

export function Inspector({
	draft,
	edits,
	change,
}: {
	draft: Draft;
	edits: PendingEdits;
	change(action: DraftAction): void;
}): JSX.Element {
	const node = findNode(draft.definition.root, draft.selectedId);
	const parent = parentOf(draft.definition.root, node.id);
	const layer = draft.definition.editor.layers.find((item) => item.nodeId === node.id);
	const locked = isLocked(draft.definition, node.id);
	const flow = parent?.kind === "container" && parent.mode !== "free";
	const update = (update: (node: LayoutNode) => void): void =>
		change({ type: "update", id: node.id, update });
	const updateBox = (patch: Partial<LayoutBoxStyle>): void =>
		update((current) => {
			if ("box" in current) Object.assign(current.box, patch);
		});
	const updateText = (patch: Partial<LayoutTextStyle>): void =>
		update((current) => {
			if ("textStyle" in current) Object.assign(current.textStyle, patch);
		});
	return (
		<div className="designer-inspector">
			<h2>Properties</h2>
			<p>
				{node.kind === "value" ? node.binding : node.kind}
				{locked ? " — locked" : ""}
			</p>
			<fieldset disabled={locked}>
				<CommitField
					id={`${node.id}-label`}
					label="Layer name"
					value={layer?.label ?? ""}
					edits={edits}
					onCommit={(label) => change({ type: "label", id: node.id, label })}
				/>
				{node.kind === "root" ? (
					<>
						<NumberField
							id="output-width"
							label="Output width"
							value={node.width}
							min={1}
							max={3840}
							integer
							edits={edits}
							onCommit={(width) =>
								update((current) => {
									if (current.kind === "root") current.width = width;
								})
							}
						/>
						<NumberField
							id="output-height"
							label="Output height"
							value={node.height}
							min={1}
							max={3840}
							integer
							edits={edits}
							onCommit={(height) =>
								update((current) => {
									if (current.kind === "root") current.height = height;
								})
							}
						/>
						<ColorField
							id="root-background"
							label="Background"
							color={node.background}
							edits={edits}
							onChange={(color) =>
								update((current) => {
									if (current.kind === "root") current.background = color;
								})
							}
						/>
					</>
				) : (
					<>
						{!flow &&
							(["x", "y"] as const).map((axis) => (
								<NumberField
									key={axis}
									id={`${node.id}-${axis}`}
									label={axis.toUpperCase()}
									value={node.frame[axis]}
									min={-16384}
									max={16384}
									edits={edits}
									onCommit={(value) =>
										update((current) => {
											if (current.kind !== "root") current.frame[axis] = value;
										})
									}
								/>
							))}
						{(["width", "height"] as const).map((axis) => {
							const size = node.frame[axis];
							return (
								<fieldset key={axis}>
									<legend>{axis}</legend>
									{flow && (
										<Choice
											label={`${axis} sizing`}
											choices={["fixed", "fill"] as const}
											value={size.kind}
											onChange={(kind) => change({ type: "sizing", id: node.id, axis, kind })}
										/>
									)}
									{size.kind === "fixed" && (
										<NumberField
											id={`${node.id}-${axis}`}
											label={axis}
											value={size.pixels}
											min={1}
											max={8192}
											edits={edits}
											onCommit={(pixels) =>
												update((current) => {
													if (current.kind !== "root") current.frame[axis] = { kind: "fixed", pixels };
												})
											}
										/>
									)}
								</fieldset>
							);
						})}
						{flow && <p>Position follows {parent.mode} order. Use the Layers controls to reorder.</p>}
					</>
				)}
				{node.kind === "container" && (
					<>
						<Choice
							label="Layout mode"
							choices={["free", "row", "column"] as const}
							value={node.mode}
							onChange={(mode) => change({ type: "mode", id: node.id, mode })}
						/>
						{(["top", "right", "bottom", "left"] as const).map((side) => (
							<NumberField
								key={side}
								id={`${node.id}-padding-${side}`}
								label={`Padding ${side}`}
								value={node.padding[side]}
								min={0}
								max={4096}
								edits={edits}
								onCommit={(value) =>
									update((current) => {
										if (current.kind === "container") current.padding[side] = value;
									})
								}
							/>
						))}
						{node.mode !== "free" && (
							<>
								<NumberField
									id={`${node.id}-gap`}
									label="Gap"
									value={node.gap}
									min={0}
									max={4096}
									edits={edits}
									onCommit={(gap) =>
										update((current) => {
											if (current.kind === "container") current.gap = gap;
										})
									}
								/>
								<Choice
									label="Main alignment"
									choices={alignments}
									value={node.mainAlign}
									onChange={(value) =>
										update((current) => {
											if (current.kind === "container") current.mainAlign = value;
										})
									}
								/>
								<Choice
									label="Cross alignment"
									choices={alignments}
									value={node.crossAlign}
									onChange={(value) =>
										update((current) => {
											if (current.kind === "container") current.crossAlign = value;
										})
									}
								/>
							</>
						)}
					</>
				)}
				{"box" in node && (
					<>
						<ColorField
							id={`${node.id}-background`}
							label="Background"
							color={node.box.background}
							edits={edits}
							onChange={(background) => updateBox({ background })}
						/>
						<ColorField
							id={`${node.id}-border`}
							label="Border"
							color={node.box.borderColor}
							edits={edits}
							onChange={(borderColor) => updateBox({ borderColor })}
						/>
						<NumberField
							id={`${node.id}-border-width`}
							label="Border width"
							value={node.box.borderWidth}
							min={0}
							max={256}
							edits={edits}
							onCommit={(borderWidth) => updateBox({ borderWidth })}
						/>
						<NumberField
							id={`${node.id}-radius`}
							label="Radius"
							value={node.box.radius}
							min={0}
							max={4096}
							edits={edits}
							onCommit={(radius) => updateBox({ radius })}
						/>
					</>
				)}
				{node.kind === "text" && (
					<CommitField
						id={`${node.id}-text`}
						label="Static text"
						multiline
						value={node.text}
						edits={edits}
						onCommit={(text) =>
							update((current) => {
								if (current.kind === "text") current.text = text.replace(/\r\n|\r/g, "\n");
							})
						}
					/>
				)}
				{"textStyle" in node && (
					<>
						<Choice
							label="Font family"
							choices={["anton", "poppins"] as const}
							value={node.textStyle.font.family}
							onChange={(family) =>
								updateText({
									font: { family, weight: family === "anton" ? 400 : node.textStyle.font.weight },
								})
							}
						/>
						<Choice
							label="Font weight"
							choices={
								node.textStyle.font.family === "anton" ? ["400"] : ["400", "500", "600", "700", "800", "900"]
							}
							value={String(node.textStyle.font.weight)}
							onChange={(weight) => updateText({ font: { ...node.textStyle.font, weight: Number(weight) } })}
						/>
						<NumberField
							id={`${node.id}-font-size`}
							label="Font size"
							value={node.textStyle.fontSize}
							min={1}
							max={512}
							edits={edits}
							onCommit={(fontSize) => updateText({ fontSize })}
						/>
						<ColorField
							id={`${node.id}-text-color`}
							label="Text colour"
							color={node.textStyle.color}
							edits={edits}
							onChange={(color) => updateText({ color })}
						/>
						<Choice
							label="Horizontal alignment"
							choices={alignments}
							value={node.textStyle.horizontalAlign}
							onChange={(horizontalAlign) => updateText({ horizontalAlign })}
						/>
						<Choice
							label="Vertical alignment"
							choices={alignments}
							value={node.textStyle.verticalAlign}
							onChange={(verticalAlign) => updateText({ verticalAlign })}
						/>
					</>
				)}
				{node.kind === "value" && (node.binding === "home-score" || node.binding === "away-score") && (
					<Choice
						label="Score animation"
						choices={["none", "rolling"] as const}
						value={node.animation}
						onChange={(animation) =>
							update((current) => {
								if (current.kind === "value") current.animation = animation;
							})
						}
					/>
				)}
				{node.kind === "separator" && (
					<>
						<Choice
							label="Orientation"
							choices={["horizontal", "vertical"] as const}
							value={node.orientation}
							onChange={(orientation) =>
								update((current) => {
									if (current.kind === "separator") current.orientation = orientation;
								})
							}
						/>
						<ColorField
							id={`${node.id}-separator`}
							label="Separator colour"
							color={node.color}
							edits={edits}
							onChange={(color) =>
								update((current) => {
									if (current.kind === "separator") current.color = color;
								})
							}
						/>
					</>
				)}
			</fieldset>
			<p>
				Up to 256 nodes / 16 levels. Static labels: 2048 characters. Output: landscape or portrait 4K maximum.
			</p>
		</div>
	);
}
