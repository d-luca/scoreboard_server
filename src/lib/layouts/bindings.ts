import type { LayoutBinding } from "../../bindings/LayoutBinding";
import type { LayoutColor } from "../../bindings/LayoutColor";
import type { ScoreboardState } from "../../bindings/ScoreboardState";
import type { Snapshot } from "../../bindings/Snapshot";
import { formatTimer } from "../format";
import type { ResolvedLayoutNode, ResolvedLayoutScene } from "./resolveLayout";

export type LayoutRenderInputs = Readonly<{
	timerSeconds: number;
	periodPrefix: string;
	periodNumber: number;
	homeName: string;
	awayName: string;
	homeScore: number;
	awayScore: number;
	homeColor: string;
	awayColor: string;
}>;

export type ResolvedLayoutColor = Readonly<{ hex: string; alpha: number }>;

export type BoundLayoutNode = Readonly<{
	geometry: ResolvedLayoutNode;
	background: ResolvedLayoutColor | null;
	borderColor: ResolvedLayoutColor | null;
	textColor: ResolvedLayoutColor | null;
	separatorColor: ResolvedLayoutColor | null;
	text: string | null;
}>;

export function inputsFromLiveState(state: ScoreboardState): LayoutRenderInputs {
	return {
		timerSeconds: state.timer,
		periodPrefix: state.halfPrefix,
		periodNumber: state.half,
		homeName: state.teamHomeName,
		awayName: state.teamAwayName,
		homeScore: state.teamHomeScore,
		awayScore: state.teamAwayScore,
		homeColor: state.teamHomeColor,
		awayColor: state.teamAwayColor,
	};
}

export function inputsFromSnapshot(snapshot: Snapshot): LayoutRenderInputs {
	return {
		timerSeconds: snapshot.tm,
		periodPrefix: snapshot.hp,
		periodNumber: snapshot.hf,
		homeName: snapshot.hn,
		awayName: snapshot.an,
		homeScore: snapshot.hs,
		awayScore: snapshot.as,
		homeColor: snapshot.hc,
		awayColor: snapshot.ac,
	};
}

export function resolveLayoutValue(binding: LayoutBinding, inputs: LayoutRenderInputs): string {
	switch (binding) {
		case "timer":
			return formatTimer(inputs.timerSeconds);
		case "period-prefix":
			return inputs.periodPrefix;
		case "period-number":
			return String(inputs.periodNumber);
		case "home-name":
			return inputs.homeName;
		case "away-name":
			return inputs.awayName;
		case "home-score":
			return String(inputs.homeScore);
		case "away-score":
			return String(inputs.awayScore);
	}
}

export function resolveLayoutColor(color: LayoutColor, inputs: LayoutRenderInputs): ResolvedLayoutColor {
	return {
		hex: color.kind === "literal" ? color.hex : color.team === "home" ? inputs.homeColor : inputs.awayColor,
		alpha: color.alpha,
	};
}

/** Bind a tick/frame without resolving boxes again; all geometry references are retained. */
export function resolveLayoutBindings(
	scene: ResolvedLayoutScene,
	inputs: LayoutRenderInputs,
): readonly BoundLayoutNode[] {
	return scene.nodes.map((geometry) => {
		const { source } = geometry;
		const box = "box" in source ? source.box : null;
		const textStyle = source.kind === "value" || source.kind === "text" ? source.textStyle : null;
		return {
			geometry,
			background:
				source.kind === "root"
					? resolveLayoutColor(source.background, inputs)
					: box
						? resolveLayoutColor(box.background, inputs)
						: null,
			borderColor: box ? resolveLayoutColor(box.borderColor, inputs) : null,
			textColor: textStyle ? resolveLayoutColor(textStyle.color, inputs) : null,
			separatorColor: source.kind === "separator" ? resolveLayoutColor(source.color, inputs) : null,
			text:
				source.kind === "value"
					? resolveLayoutValue(source.binding, inputs)
					: source.kind === "text"
						? source.text
						: null,
		};
	});
}
