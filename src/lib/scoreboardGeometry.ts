/**
 * Shared scoreboard geometry (doc 04 §6, doc 06 §B1.1).
 *
 * The React scoreboard renders these values through Tailwind classes
 * (`w-28` = 112 px, `gap-3` = 12 px, …) and inline skew transforms; the
 * canvas renderer for video generation consumes the constants below. The
 * class name is documented next to each constant so a design tweak has one
 * obvious home.
 *
 * The *board* is 600×80 (doc 04 §6.3 parity item 11), but the −15° skew
 * widens its bounding box by 80·tan(15°) ≈ 21.4 px, so the render frame is
 * 622×80 with the board centered — identical to `pages/scoreboard.html`.
 */

/** Skew of the whole board; text-bearing children counter-skew. */
export const SKEW_DEG = 15;
export const SKEW_TAN = Math.tan((SKEW_DEG * Math.PI) / 180);

export const BOARD_WIDTH = 600;
export const BOARD_HEIGHT = 80;
/** Horizontal padding per side so the skewed corners stay visible. */
export const BOARD_PAD_X = 11;
/** Full render frame (OBS page / video frame at scale 1). */
export const FRAME_WIDTH = BOARD_WIDTH + 2 * BOARD_PAD_X; // 622
export const FRAME_HEIGHT = BOARD_HEIGHT; // 80

export const COLOR_BOARD = "#ffffff"; // board + score block bg
export const COLOR_PANEL = "#1e1b4b"; // indigo-950: strip bg, timer, scores
export const COLOR_DIVIDER = "#64748b"; // slate-500
export const COLOR_HALF_TEXT = "#0a0a0a"; // neutral-950
export const COLOR_NAME = "#ffffff";

export const TEAM_NAME_WIDTH = 112; // w-28
export const COLOR_BAR_WIDTH = 8; // w-2
export const ROW_GAP = 8; // gap-2 inside a team row
export const STRIP_GAP = 12; // gap-3 inside the team strip
export const SCORE_BOX_WIDTH = 64; // w-16
export const DIVIDER_WIDTH = 2; // w-0.5
export const DIVIDER_HEIGHT_RATIO = 2 / 3; // h-2/3

export const FONT_SIZE_DISPLAY = 36; // text-4xl (timer, names, scores)
export const FONT_SIZE_HALF = 14; // text-sm
export const LETTER_SPACING_WIDE_EM = 0.025; // tracking-wide on names
export const FONT_DISPLAY = "Anton";
export const FONT_HALF = "Poppins";

/** One team row: colour bar + gap + name box. */
export const TEAM_ROW_WIDTH = COLOR_BAR_WIDTH + ROW_GAP + TEAM_NAME_WIDTH; // 128
/** Score block: two score boxes + divider. */
export const SCORE_BLOCK_WIDTH = SCORE_BOX_WIDTH * 2 + DIVIDER_WIDTH; // 130
/** The indigo team strip. */
export const STRIP_WIDTH = TEAM_ROW_WIDTH * 2 + SCORE_BLOCK_WIDTH + STRIP_GAP * 2; // 410

/** Video frame size: `round(base × scale)`, each rounded up to even (VP9
 * wants even dimensions, doc 06 §B2). Mirrors `video::frame_dimensions`. */
export function frameDimensions(scale: number): { width: number; height: number } {
	const even = (value: number): number => {
		const rounded = Math.max(2, Math.round(value));
		return rounded % 2 === 0 ? rounded : rounded + 1;
	};
	return { width: even(FRAME_WIDTH * scale), height: even(FRAME_HEIGHT * scale) };
}
