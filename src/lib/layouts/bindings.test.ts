import { describe, expect, it } from "vitest";
import type { LayoutBinding } from "../../bindings/LayoutBinding";
import type { LayoutColor } from "../../bindings/LayoutColor";
import type { LayoutElement } from "../../bindings/LayoutElement";
import type { ScoreboardState } from "../../bindings/ScoreboardState";
import type { Snapshot } from "../../bindings/Snapshot";
import {
	inputsFromLiveState,
	inputsFromSnapshot,
	resolveLayoutBindings,
	resolveLayoutColor,
	resolveLayoutValue,
	type LayoutRenderInputs,
} from "./bindings";
import { resolveLayout } from "./resolveLayout";
import {
	alternateInputs,
	blank,
	box,
	container,
	fixtureId,
	frame,
	sampleInputs,
	starter,
	textStyle,
	value,
} from "./testFixtures";

function liveState(inputs: LayoutRenderInputs): ScoreboardState {
	return {
		timer: inputs.timerSeconds,
		halfPrefix: inputs.periodPrefix,
		half: inputs.periodNumber,
		teamHomeName: inputs.homeName,
		teamAwayName: inputs.awayName,
		teamHomeScore: inputs.homeScore,
		teamAwayScore: inputs.awayScore,
		teamHomeColor: inputs.homeColor,
		teamAwayColor: inputs.awayColor,
		eventLogo: null,
		isTimerRunning: true,
		timerDirection: "up",
		timerLoadout1: 1,
		timerLoadout2: 2,
		timerLoadout3: 3,
		revision: 123,
	};
}

function snapshot(inputs: LayoutRenderInputs): Snapshot {
	return {
		t: 9876,
		tm: inputs.timerSeconds,
		hp: inputs.periodPrefix,
		hf: inputs.periodNumber,
		hn: inputs.homeName,
		an: inputs.awayName,
		hs: inputs.homeScore,
		as: inputs.awayScore,
		hc: inputs.homeColor,
		ac: inputs.awayColor,
	};
}

describe("rendering-input adapters and value bindings", () => {
	it.each([sampleInputs, alternateInputs])(
		"makes live, sample and recorded values identical: $periodPrefix",
		(inputs) => {
			const scene = resolveLayout(starter());
			const live = inputsFromLiveState(liveState(inputs));
			const recorded = inputsFromSnapshot(snapshot(inputs));
			expect(live).toEqual(inputs);
			expect(recorded).toEqual(inputs);
			const sampleScene = resolveLayoutBindings(scene, inputs);
			expect(resolveLayoutBindings(scene, live)).toEqual(sampleScene);
			expect(resolveLayoutBindings(scene, recorded)).toEqual(sampleScene);
			expect(sampleScene.filter(({ text }) => text !== null).map(({ text }) => text)).toEqual(
				inputs === sampleInputs
					? ["15:00", "PERIODO", "1", "HOME", "0", "AWAY", "0"]
					: ["60:00", "OVERTIME", "3", inputs.homeName, "12", inputs.awayName, "105"],
			);
		},
	);

	it.each<[LayoutBinding, string]>([
		["timer", "60:00"],
		["period-prefix", "OVERTIME"],
		["period-number", "3"],
		["home-name", alternateInputs.homeName],
		["away-name", alternateInputs.awayName],
		["home-score", "12"],
		["away-score", "105"],
	])("binds %s independently as %s", (binding, expected) => {
		expect(resolveLayoutValue(binding, alternateInputs)).toBe(expected);
	});

	it.each([
		[0, "00:00"],
		[59, "00:59"],
		[60, "01:00"],
		[3599, "59:59"],
		[3600, "60:00"],
		[3601, "60:01"],
		[6000, "100:00"],
	])("preserves existing timer formatting at %s seconds", (timerSeconds, expected) => {
		expect(resolveLayoutValue("timer", { ...sampleInputs, timerSeconds })).toBe(expected);
	});

	it("never derives the recorded timer from timestamp or the live direction", () => {
		const recorded = snapshot(alternateInputs);
		recorded.t = 12;
		recorded.tm = 72;
		expect(inputsFromSnapshot(recorded).timerSeconds).toBe(72);
		const live = liveState(alternateInputs);
		live.timerDirection = "down";
		live.isTimerRunning = false;
		live.revision++;
		expect(inputsFromLiveState(live)).toEqual(alternateInputs);
	});

	it("retains recorded identity, colours and prefix changes independently on each frame", () => {
		const frames = [snapshot(sampleInputs), snapshot(alternateInputs)];
		expect(frames.map(inputsFromSnapshot)).toEqual([sampleInputs, alternateInputs]);
	});
});

describe("dynamic style bindings without geometry changes", () => {
	it.each<{ color: LayoutColor; hex: string }>([
		{ color: { kind: "literal", hex: "#AaBbCc", alpha: 0 }, hex: "#AaBbCc" },
		{ color: { kind: "team", team: "home", alpha: 0.5 }, hex: sampleInputs.homeColor },
		{ color: { kind: "team", team: "away", alpha: 1 }, hex: sampleInputs.awayColor },
	])("resolves $color with its original alpha", ({ color, hex }) => {
		expect(resolveLayoutColor(color, sampleInputs)).toEqual({ hex, alpha: color.alpha });
	});

	it("binds every style surface, including root, border, text and separator colours", () => {
		const label: LayoutElement = {
			kind: "text",
			id: fixtureId(2),
			hidden: false,
			frame: frame(160, 32),
			box: box({
				background: { kind: "team", team: "home", alpha: 0 },
				borderColor: { kind: "team", team: "away", alpha: 0.5 },
				borderWidth: 3,
				radius: 12,
			}),
			text: "Label\n\nlast line\n",
			textStyle: textStyle({ color: { kind: "team", team: "home", alpha: 1 } }),
		};
		const separator: LayoutElement = {
			kind: "separator",
			id: fixtureId(3),
			hidden: false,
			frame: frame(100, 2),
			orientation: "horizontal",
			color: { kind: "team", team: "away", alpha: 0 },
		};
		const root = blank([
			container(1, {
				box: box({
					background: { kind: "literal", hex: "#111827", alpha: 0.9 },
					borderColor: { kind: "team", team: "home", alpha: 1 },
				}),
				children: [label, separator],
			}),
		]);
		root.background = { kind: "team", team: "away", alpha: 0.5 };
		const geometry = resolveLayout(root);
		const bound = resolveLayoutBindings(geometry, sampleInputs);
		expect(bound[0].background).toEqual({ hex: "#FF0000", alpha: 0.5 });
		expect(bound[1]).toMatchObject({
			background: { hex: "#111827", alpha: 0.9 },
			borderColor: { hex: "#00FF00", alpha: 1 },
		});
		expect(bound[2]).toMatchObject({
			background: { hex: "#00FF00", alpha: 0 },
			borderColor: { hex: "#FF0000", alpha: 0.5 },
			textColor: { hex: "#00FF00", alpha: 1 },
			text: "Label\n\nlast line\n",
		});
		expect(bound[3]).toMatchObject({
			background: null,
			borderColor: null,
			textColor: null,
			separatorColor: { hex: "#FF0000", alpha: 0 },
			text: null,
		});
		expect(resolveLayoutBindings(geometry, inputsFromSnapshot(snapshot(sampleInputs)))).toEqual(bound);
	});

	it("reuses every geometry object across timer ticks, score/identity changes and recorded frames", () => {
		const root = starter();
		const original = structuredClone(root);
		const geometry = resolveLayout(root);
		const first = resolveLayoutBindings(geometry, sampleInputs);
		const next = resolveLayoutBindings(geometry, {
			...alternateInputs,
			timerSeconds: alternateInputs.timerSeconds + 1,
		});
		const recorded = resolveLayoutBindings(geometry, inputsFromSnapshot(snapshot(alternateInputs)));
		for (const [index, node] of geometry.nodes.entries()) {
			expect(first[index].geometry).toBe(node);
			expect(next[index].geometry).toBe(node);
			expect(recorded[index].geometry).toBe(node);
		}
		expect(next[2].text).toBe("60:01");
		expect(next[8].background).toEqual({ hex: alternateInputs.homeColor, alpha: 1 });
		expect(root).toEqual(original);
		expect(resolveLayout(root)).toEqual(geometry);
	});

	it("keeps independent score animation choices as instructions, not geometry or value transforms", () => {
		const root = blank([
			value(1, "home-score", { animation: "none" }),
			value(2, "away-score", { animation: "rolling" }),
		]);
		const bound = resolveLayoutBindings(resolveLayout(root), alternateInputs);
		expect(bound.slice(1).map(({ text, geometry }) => [text, geometry.source])).toEqual([
			["12", root.children[0]],
			["105", root.children[1]],
		]);
	});

	it("does not bind hidden values or descendants", () => {
		const root = blank([
			value(1, "timer", { hidden: true }),
			container(2, { hidden: true, children: [value(3, "period-prefix")] }),
		]);
		expect(resolveLayoutBindings(resolveLayout(root), sampleInputs)).toHaveLength(1);
	});
});
