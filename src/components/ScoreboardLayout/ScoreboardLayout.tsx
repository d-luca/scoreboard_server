import { useId, type CSSProperties, type JSX } from "react";
import type { ResolvedLayoutColor } from "../../lib/layouts/bindings";
import { layoutBorderPath, roundedLayoutPath } from "../../lib/layouts/paths";
import type { LayoutPaintNode, LayoutRenderFrame } from "../../lib/layouts/renderFrame";
import { placeLayoutText, type LayoutText } from "../../lib/layouts/text";
import { ROLLING_DURATION_MS, useRollingScore } from "../Scoreboard/useRollingScore";
import "./scoreboardLayout.css";

function Text({ layout, color }: { layout: LayoutText; color: ResolvedLayoutColor }): JSX.Element {
	return (
		<g
			fill={color.hex}
			fillOpacity={color.alpha}
			fontFamily={layout.family}
			fontSize={layout.fontSize}
			fontWeight={layout.weight}
			textAnchor={layout.anchor}
			style={{
				whiteSpace: "pre",
				fontKerning: "normal",
				fontVariant: "normal",
				fontStyle: "normal",
				fontStretch: "normal",
				fontSynthesis: "none",
				letterSpacing: 0,
				wordSpacing: 0,
				direction: "ltr",
			}}
		>
			{layout.lines.map(({ text, x, baseline }, index) => (
				<text
					key={index}
					x={x}
					y={baseline}
					dominantBaseline="alphabetic"
					xmlSpace="preserve"
					style={{ whiteSpace: "pre", letterSpacing: 0, wordSpacing: 0 }}
				>
					{text}
				</text>
			))}
		</g>
	);
}

function RollingText({ node, width }: { node: LayoutPaintNode; width: number }): JSX.Element | null {
	const clipId = useId();
	const { number, fromValue, tickKey } = useRollingScore(Number(node.text));
	const { source, contentBounds } = node.geometry;
	if (source.kind !== "value" || !node.textLayout || !node.textColor) return null;
	if (fromValue === null) return <Text layout={node.textLayout} color={node.textColor} />;
	const color = node.textColor;

	const up = number >= fromValue;
	const { lineHeight, top } = node.textLayout;
	const tiles = up ? [fromValue, number] : [number, fromValue];
	const style: CSSProperties & Record<"--roll-from" | "--roll-to", string> = {
		"--roll-from": `${up ? 0 : -lineHeight}px`,
		"--roll-to": `${up ? -lineHeight : 0}px`,
		animation: `scoreboard-layout-roll ${ROLLING_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
	};
	return (
		<g aria-label={String(number)}>
			<defs>
				<clipPath id={clipId}>
					<rect x={0} y={top} width={width} height={lineHeight} />
				</clipPath>
			</defs>
			<g clipPath={`url(#${clipId})`}>
				<g key={tickKey} style={style} data-layout-rolling>
					{tiles.map((tile, index) => (
						<g key={index} transform={`translate(0 ${index * lineHeight})`}>
							<Text
								layout={placeLayoutText(String(tile), source.textStyle, contentBounds, false)}
								color={color}
							/>
						</g>
					))}
				</g>
			</g>
		</g>
	);
}

function Shape({ path, color }: { path: string; color: ResolvedLayoutColor | null }): JSX.Element | null {
	return path && color && color.alpha > 0 ? (
		<path d={path} fill={color.hex} fillOpacity={color.alpha} fillRule="evenodd" />
	) : null;
}

/** A presentation-only root: editor guides, selection and viewport transforms belong outside it. */
export function ScoreboardLayout({
	frame,
	label = "Scoreboard",
}: {
	frame: LayoutRenderFrame;
	label?: string;
}): JSX.Element {
	const clipId = useId();
	const { scene } = frame;
	return (
		<div
			style={{ width: scene.width, height: scene.height, overflow: "hidden", position: "relative" }}
			data-layout-live
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width={scene.width}
				height={scene.height}
				role="img"
				aria-label={label}
				style={{ display: "block", overflow: "visible" }}
			>
				<defs>
					<clipPath id={clipId}>
						<rect {...scene.clip} />
					</clipPath>
				</defs>
				<g clipPath={`url(#${clipId})`}>
					{frame.nodes.map((node) => {
						const { geometry, background, borderColor, separatorColor, textLayout, textColor } = node;
						const { source } = geometry;
						const rolling =
							source.kind === "value" &&
							(source.binding === "home-score" || source.binding === "away-score") &&
							source.animation === "rolling";
						return (
							<g key={geometry.id} data-layout-node={geometry.id}>
								<Shape path={roundedLayoutPath(geometry.bounds, geometry.radius)} color={background} />
								<Shape path={layoutBorderPath(geometry)} color={borderColor} />
								<Shape path={roundedLayoutPath(geometry.bounds, 0)} color={separatorColor} />
								{rolling ? (
									<RollingText node={node} width={scene.width} />
								) : textLayout && textColor ? (
									<Text layout={textLayout} color={textColor} />
								) : null}
							</g>
						);
					})}
				</g>
			</svg>
		</div>
	);
}
