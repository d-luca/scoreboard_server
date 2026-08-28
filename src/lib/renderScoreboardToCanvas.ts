import type { Snapshot } from "../bindings/Snapshot";
import { formatTimer } from "./format";
import * as G from "./scoreboardGeometry";

/**
 * Canvas2D re-implementation of the scoreboard (doc 06 §B1.1): the board is
 * a skewed DOM composition and no webview screenshot API exists, so video
 * generation re-draws each recording snapshot here. Geometry comes from
 * `scoreboardGeometry.ts`, which mirrors the Tailwind classes the React
 * component renders — the two paths must stay visually identical.
 *
 * The canvas must already be sized to `frameDimensions(scale)`; the drawing
 * transform is derived from the canvas size (even rounding of the VP9 frame
 * included), so no separate scale argument is needed. The frame is 622×80 at
 * scale 1: the 600×80 board centered with 11 px of horizontal padding so the
 * skewed corners stay inside the frame (transparent).
 *
 * Fonts must be loaded before the first draw (`document.fonts.load` for
 * Anton + Poppins) or the first frames come out in a fallback font.
 *
 * CSS transform reference points: the board is `skewX(-15°)` about its
 * centre y=40, and text-bearing children counter-skew `+15°` about their own
 * centres (also y=40), so the two skews compose to identity — text is drawn
 * upright at its naive position, while backgrounds/bars keep the board skew.
 */
export function renderScoreboardToCanvas(ctx: CanvasRenderingContext2D, snapshot: Snapshot): void {
	const width = ctx.canvas.width;
	const height = ctx.canvas.height;

	// Transparent page background; only the board is painted.
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, width, height);

	// Scale the 622×80 base frame onto the (even-rounded) canvas.
	ctx.setTransform(width / G.FRAME_WIDTH, 0, 0, height / G.FRAME_HEIGHT, 0, 0);
	const fontScale = height / G.FRAME_HEIGHT;

	// Board skew, about y = 40.
	ctx.transform(1, 0, -G.SKEW_TAN, 1, G.SKEW_TAN * 40, 0);

	ctx.save();
	// The board has `overflow-hidden`: children clip to its pre-transform box.
	ctx.beginPath();
	ctx.rect(G.BOARD_PAD_X, 0, G.BOARD_WIDTH, G.BOARD_HEIGHT);
	ctx.clip();

	const boardX = G.BOARD_PAD_X;
	const boardRight = G.BOARD_PAD_X + G.BOARD_WIDTH;
	const stripX = boardRight - G.STRIP_WIDTH;
	const scoreBlockX = stripX + G.TEAM_ROW_WIDTH + G.STRIP_GAP;
	const awayRowX = scoreBlockX + G.SCORE_BLOCK_WIDTH + G.STRIP_GAP;

	// Board background, team strip, score block, divider, colour bars —
	// these carry no counter-skew, so the board skew keeps them slanted.
	ctx.fillStyle = G.COLOR_BOARD;
	ctx.fillRect(boardX, 0, G.BOARD_WIDTH, G.BOARD_HEIGHT);

	ctx.fillStyle = G.COLOR_PANEL;
	ctx.fillRect(stripX, 0, G.STRIP_WIDTH, G.BOARD_HEIGHT);

	ctx.fillStyle = G.COLOR_BOARD;
	ctx.fillRect(scoreBlockX, 0, G.SCORE_BLOCK_WIDTH, G.BOARD_HEIGHT);

	const dividerHeight = G.BOARD_HEIGHT * G.DIVIDER_HEIGHT_RATIO;
	ctx.fillStyle = G.COLOR_DIVIDER;
	ctx.fillRect(
		scoreBlockX + G.SCORE_BOX_WIDTH,
		(G.BOARD_HEIGHT - dividerHeight) / 2,
		G.DIVIDER_WIDTH,
		dividerHeight,
	);

	ctx.fillStyle = snapshot.hc || "#00ff00";
	ctx.fillRect(stripX, 0, G.COLOR_BAR_WIDTH, G.BOARD_HEIGHT);
	ctx.fillStyle = snapshot.ac || "#ff0000";
	ctx.fillRect(stripX + G.STRIP_WIDTH - G.COLOR_BAR_WIDTH, 0, G.COLOR_BAR_WIDTH, G.BOARD_HEIGHT);

	// Text: counter-skew (+15° about y=40) cancels the board skew.
	ctx.save();
	ctx.transform(1, 0, G.SKEW_TAN, 1, -G.SKEW_TAN * 40, 0);

	ctx.textBaseline = "alphabetic";
	setLetterSpacing(ctx, G.LETTER_SPACING_WIDE_EM * G.FONT_SIZE_DISPLAY * fontScale);

	const displayFont = `${G.FONT_SIZE_DISPLAY * fontScale}px ${G.FONT_DISPLAY}`;
	ctx.font = displayFont;

	// Team names (white, on the strip).
	ctx.fillStyle = G.COLOR_NAME;
	drawCentered(ctx, snapshot.hn, stripX + G.TEAM_ROW_WIDTH - G.TEAM_NAME_WIDTH / 2, 40);
	drawCentered(ctx, snapshot.an, awayRowX + G.TEAM_NAME_WIDTH / 2, 40);

	// Scores (indigo, on the white score block).
	ctx.fillStyle = G.COLOR_PANEL;
	drawCentered(ctx, String(snapshot.hs), scoreBlockX + G.SCORE_BOX_WIDTH / 2, 40);
	drawCentered(
		ctx,
		String(snapshot.as),
		scoreBlockX + G.SCORE_BOX_WIDTH + G.DIVIDER_WIDTH + G.SCORE_BOX_WIDTH / 2,
		40,
	);

	// Timer + half column (left of the strip, on the white board). The React
	// column is `flex-col justify-center` with line-height 1 children:
	// 36 px timer + 14 px half stacked and centered in the 80 px board.
	const columnCenterX = boardX + (G.BOARD_WIDTH - G.STRIP_WIDTH) / 2;
	const timerHeight = G.FONT_SIZE_DISPLAY; // line-height: 1
	const halfHeight = G.FONT_SIZE_HALF; // line-height: 1
	const stackTop = (G.BOARD_HEIGHT - timerHeight - halfHeight) / 2;
	const timerLineCenter = stackTop + timerHeight / 2; // 33
	const halfLineCenter = stackTop + timerHeight + halfHeight / 2; // 58

	setLetterSpacing(ctx, 0);
	ctx.fillStyle = G.COLOR_PANEL;
	drawCentered(ctx, formatTimer(snapshot.tm), columnCenterX, timerLineCenter);

	// Half bar: white bg (invisible over the white board, but drawn for
	// correctness) + Poppins bold text, with the 4 px spacer the React
	// component gets from `mx-0.5`.
	ctx.font = `700 ${G.FONT_SIZE_HALF * fontScale}px ${G.FONT_HALF}`;
	const prefix = snapshot.hp;
	const prefixMetrics = measure(ctx, prefix || "0");
	const valueMetrics = measure(ctx, String(snapshot.hf));
	const spacer = prefix ? 4 * fontScale : 0;
	const barWidth = (prefix ? prefixMetrics.width : 0) + spacer + valueMetrics.width;
	ctx.fillStyle = G.COLOR_BOARD;
	ctx.fillRect(columnCenterX - barWidth / 2, halfLineCenter - halfHeight / 2, barWidth, halfHeight);
	ctx.fillStyle = G.COLOR_HALF_TEXT;
	const halfBaseline = cssBaseline(ctx, valueMetrics, halfLineCenter);
	if (prefix) {
		ctx.textAlign = "left";
		ctx.fillText(prefix, columnCenterX - barWidth / 2, halfBaseline);
		ctx.textAlign = "right";
		ctx.fillText(String(snapshot.hf), columnCenterX + barWidth / 2, halfBaseline);
	} else {
		ctx.textAlign = "center";
		ctx.fillText(String(snapshot.hf), columnCenterX, halfBaseline);
	}

	ctx.restore();
	ctx.restore();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** CSS-centers text on a line box: baseline = center + (ascent − descent)/2. */
function drawCentered(
	ctx: CanvasRenderingContext2D,
	text: string,
	centerX: number,
	lineCenterY: number,
): void {
	const metrics = measure(ctx, text);
	ctx.textAlign = "center";
	ctx.fillText(text, centerX, cssBaseline(ctx, metrics, lineCenterY));
}

/**
 * The baseline Y that reproduces CSS line-box centering:
 * `center + (ascent − descent) / 2`. Uses `fontBoundingBox*` metrics
 * (Chromium's canvas and CSS layout share the hhea source); falls back to
 * `middle` + a measured em offset where those metrics are unavailable
 * (older WebKitGTK) — slightly less exact but within a pixel.
 */
function cssBaseline(ctx: CanvasRenderingContext2D, metrics: TextMetrics, lineCenterY: number): number {
	if (
		typeof metrics.fontBoundingBoxAscent === "number" &&
		typeof metrics.fontBoundingBoxDescent === "number"
	) {
		ctx.textBaseline = "alphabetic";
		return lineCenterY + (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
	}
	ctx.textBaseline = "middle";
	// Chromium's "middle" sits ~(descent − ascent)/2 off the CSS baseline;
	// the fallback accepts that platform's own convention instead.
	return lineCenterY;
}

function measure(ctx: CanvasRenderingContext2D, text: string): TextMetrics {
	return ctx.measureText(text);
}

/** `ctx.letterSpacing` is Chromium-only; degrade gracefully elsewhere. */
function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
	const withSpacing = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
	if ("letterSpacing" in ctx) {
		withSpacing.letterSpacing = `${px}px`;
	}
}
