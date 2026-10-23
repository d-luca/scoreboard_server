import type { ResolvedLayoutColor } from "./bindings";
import { layoutBorderPath, roundedLayoutPath } from "./paths";
import type { LayoutRenderFrame } from "./renderFrame";

/** Draw at a uniform scale, leaving any extra right/bottom canvas pixels transparent. */
export function renderLayoutToCanvas(
	ctx: CanvasRenderingContext2D,
	frame: LayoutRenderFrame,
	scale = 1,
): void {
	const { scene } = frame;
	if (
		!Number.isFinite(scale) ||
		scale <= 0 ||
		ctx.canvas.width < Math.ceil(scene.width * scale) ||
		ctx.canvas.height < Math.ceil(scene.height * scale)
	) {
		throw new Error("The custom layout canvas must contain the complete uniformly scaled root.");
	}
	ctx.save();
	try {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		ctx.globalCompositeOperation = "source-over";
		ctx.shadowColor = "transparent";
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
		ctx.filter = "none";
		ctx.beginPath();
		ctx.rect(scene.clip.x, scene.clip.y, scene.clip.width, scene.clip.height);
		ctx.clip();
		function fill(path: string, color: ResolvedLayoutColor | null): void {
			if (!path || !color || color.alpha === 0) return;
			ctx.fillStyle = color.hex;
			ctx.globalAlpha = color.alpha;
			ctx.fill(new Path2D(path), "evenodd");
		}
		for (const node of frame.nodes) {
			const { geometry, background, borderColor, separatorColor, textColor, textLayout } = node;
			fill(roundedLayoutPath(geometry.bounds, geometry.radius), background);
			fill(layoutBorderPath(geometry), borderColor);
			fill(roundedLayoutPath(geometry.bounds, 0), separatorColor);
			if (!textLayout || !textColor || textColor.alpha === 0) continue;
			ctx.font = textLayout.font;
			ctx.textAlign = textLayout.canvasAlign;
			ctx.textBaseline = "alphabetic";
			ctx.direction = "ltr";
			ctx.fontKerning = "normal";
			ctx.fontStretch = "normal";
			ctx.fontVariantCaps = "normal";
			ctx.letterSpacing = "0px";
			ctx.wordSpacing = "0px";
			ctx.fillStyle = textColor.hex;
			ctx.globalAlpha = textColor.alpha;
			for (const { text, x, baseline } of textLayout.lines) ctx.fillText(text, x, baseline);
		}
	} finally {
		ctx.restore();
	}
}
