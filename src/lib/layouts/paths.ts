import type { LayoutRect, ResolvedLayoutNode } from "./resolveLayout";

export function roundedLayoutPath({ x, y, width: w, height: h }: LayoutRect, radius: number): string {
	if (w <= 0 || h <= 0) return "";
	const r = Math.min(radius, w / 2, h / 2);
	if (r === 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
	return [
		`M${x + r} ${y}H${x + w - r}`,
		`A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}`,
		`A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}`,
		`A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}`,
		`A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
	].join("");
}

export function layoutBorderPath(node: ResolvedLayoutNode): string {
	const { bounds, borderWidth: b, radius, innerRadius } = node;
	if (b === 0) return "";
	return (
		roundedLayoutPath(bounds, radius) +
		roundedLayoutPath(
			{ x: bounds.x + b, y: bounds.y + b, width: bounds.width - 2 * b, height: bounds.height - 2 * b },
			innerRadius,
		)
	);
}
