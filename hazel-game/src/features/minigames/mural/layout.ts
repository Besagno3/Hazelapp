/**
 * How Mirror Mural's canvas fits its space from `sm` up (review rounds 1 and
 * 2): with its paints and the mirror (or Hang it) beside it or under it,
 * whichever leaves the bigger canvas. The paints are drawn at fixed sizes, so
 * how tall they stand at a width is known before they're drawn — nothing is
 * measured but the space, so nothing can loop. Below a floor the canvas keeps
 * the floor's size and its space scrolls (`tight`), rather than hide the mirror.
 */

/** A paint's button: compact (its name under the swatch) or full; its height; the gap between paints. */
export const PAINT_W = { compact: 56, full: 112 } as const;
export const PAINT_H = 44;
export const PAINT_GAP = 6;
/** The ↔ between an opposite pair, and its two small gaps. */
export const PAIR_JOIN = 18;
/** "Opposites side by side ↔" over the pairs. */
export const CAPTION_H = 18;
/** The gold button, and Not this time beside the canvas. */
export const GOLD_H = 56;
export const OUTLINE_H = 44;
/** Room for the gold button's shadow. */
export const SHADOW = 4;
/** `gap-2` under the canvas and between the controls; `gap-3` beside it. */
export const GAP_UNDER = 8;
export const GAP_BESIDE = 12;
/** The column beside the canvas: at least three compact paints across; at most 22rem. */
export const BESIDE_PX = 180;
export const BESIDE_MAX = 352;
/** Below 26 px squares (and the frame) the canvas stops shrinking and its space scrolls instead. */
export const FLOOR_PX = 6 * 26 + 8;

/**
 * What stands with the canvas: its paints (Rub out besides), in opposite pairs or not; Hang it and Not this time, or
 * the mirror; and the room Expert's axis numbers take inside the canvas's size (0 on the other bands).
 */
export interface Controls {
  paints: number;
  pairs: boolean;
  free: boolean;
  axes?: number;
}

export interface Fit {
  size: number;
  beside: boolean;
  compact: boolean;
  tight: boolean;
}

/** How many rows a run of buttons wraps into across `w`. */
function rows(widths: readonly number[], w: number): number {
  let n = 1;
  let x = 0;
  for (const bw of widths) {
    if (x > 0 && x + PAINT_GAP + bw > w) {
      n += 1;
      x = bw;
    } else x += (x > 0 ? PAINT_GAP : 0) + bw;
  }
  return n;
}

/** How tall the paints and the buttons stand at `w`. */
export function controlsHeight(c: Controls, w: number, compact: boolean, beside: boolean): number {
  const bw = compact ? PAINT_W.compact : PAINT_W.full;
  const widths = c.pairs ? [...Array<number>(c.paints / 2).fill(2 * bw + PAIR_JOIN), bw] : Array<number>(c.paints + 1).fill(bw);
  const r = rows(widths, w);
  const paints = r * PAINT_H + (r - 1) * PAINT_GAP;
  const caption = c.pairs ? CAPTION_H + GAP_UNDER : 0;
  const buttons = c.free && beside ? GOLD_H + GAP_UNDER + OUTLINE_H : GOLD_H;
  return caption + paints + GAP_UNDER + buttons + SHADOW;
}

/**
 * The canvas for a space `w` × `h` (`heading`: the room its heading takes;
 * `short`: a short screen, where the paints are compact).
 */
export function fitCanvas({ w, h, heading, short }: { w: number; h: number; heading: number; short: boolean }, c: Controls): Fit {
  const tall = h - heading;
  // Beside: as tall as the space, the controls in the column left over — if they fit its height, full-size paints
  // where they do, else compact ones.
  const bSize = Math.min(tall, w - BESIDE_PX - GAP_BESIDE);
  const col = Math.min(BESIDE_MAX, w - bSize - GAP_BESIDE);
  const bCompact = short || col < 2 * PAINT_W.full + PAINT_GAP || controlsHeight(c, col, false, true) > h;
  const beside: Fit = { size: bSize, beside: true, compact: bCompact, tight: false };
  const bFits = controlsHeight(c, col, bCompact, true) <= h;
  // Under: the controls as wide as the space — compact if that saves a row.
  const full = controlsHeight(c, w, false, false);
  const small = controlsHeight(c, w, true, false);
  const uCompact = short || small < full;
  const under: Fit = { size: Math.min(w, tall - GAP_UNDER - (uCompact ? small : full)), beside: false, compact: uCompact, tight: false };
  const best = bFits && beside.size >= under.size ? beside : under;
  // The squares' floor: the axes' numbers come out of the canvas's size, not its squares (PR 14).
  const floor = FLOOR_PX + (c.axes ?? 0);
  if (best.size >= floor) return { ...best, size: Math.floor(best.size) };
  // Too small to tap well: the floor, under (beside it wouldn't fit across), and the space scrolls.
  return { size: Math.min(floor, Math.floor(w)), beside: false, compact: true, tight: true };
}
