import type { LayoutRoot } from "../../bindings/LayoutRoot";
import type { LayoutRenderInputs } from "./bindings";
import { blank, box, container, fill, frame, rectangle } from "./templates";
export {
	blank,
	box,
	container,
	fill,
	frame,
	rectangle,
	starter,
	textStyle,
	value,
	templateId as fixtureId,
} from "./templates";

export function nestedFlow(hidden = false): LayoutRoot {
	return blank(
		[
			container(1, {
				frame: frame(300, 120, 10, 20),
				box: box({ borderWidth: 2 }),
				padding: { top: 6, right: 10, bottom: 6, left: 10 },
				mode: "row",
				gap: 8,
				mainAlign: "center",
				crossAlign: "end",
				children: [
					rectangle(2, 60, 20),
					container(3, {
						hidden,
						frame: frame(fill, fill),
						mode: "column",
						padding: { top: 4, right: 4, bottom: 4, left: 4 },
						gap: 4,
						crossAlign: "center",
						children: [rectangle(4, 20, 20), rectangle(5, fill, fill)],
					}),
					rectangle(6, fill, 40),
				],
			}),
		],
		400,
		200,
	);
}

export const sampleInputs: LayoutRenderInputs = {
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

export const alternateInputs: LayoutRenderInputs = {
	timerSeconds: 3600,
	periodPrefix: "OVERTIME",
	periodNumber: 3,
	homeName: "A very long home team name",
	awayName: "A very long away team name",
	homeScore: 12,
	awayScore: 105,
	homeColor: "#123456",
	awayColor: "#ABCDEF",
};
