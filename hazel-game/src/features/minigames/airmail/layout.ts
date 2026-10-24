/**
 * Ember Air Mail's layout maths (pure, so it's table-tested — code review
 * round 2): where the step's card goes and how big the map is. The game
 * measures the board and calls `fitMap` (`useMapLayout`).
 */

/** The compass's side (px): its buttons 52 px where the screen's over 600 px high, else 44 (UX review round 1: the smallest thing on screen). */
export const compassSide = (tall: boolean) => (tall ? 3 * 52 + 8 : 3 * 44 + 8);
/** Deliver beside the compass, at least (px): its word fits (UX review round 1: at 640 × 360 it ran out of a 28 px button). */
export const DELIVER_MIN = 92;
/** The step's card's padding and frame (px). */
export const CARD_CHROME = 30;
/** On a short phone held sideways, the room what Pidge said needs under the map (px). */
export const SAID_UNDER = 64;
/** The town's labels: its letters under the map, its numbers beside it (px); the world's scale under it (its line and gap). */
export const GUTTER = 18;
export const SCALE_LINE = 22;
export const MIN_MAP = 150;
const GAP = 8;

/**
 * The step's card beside the map: at least the compass and Deliver side by
 * side — the same for a stamp's card, so the map doesn't shrink as a parcel's
 * delivered (UX review round 1: at 1366 × 650, 60 px).
 */
export const cardMin = (width: number, compass: number) => Math.min(300, Math.max(compass + 8 + DELIVER_MIN + CARD_CHROME, width * 0.4));

/**
 * Under the map, the card's height: on a split screen under 500 px high only
 * Deliver and the compass, the clue beside them (what Pidge says is in her
 * bubble beside the board) — a stamp's card, its fact (bench: at 640 × 400 its
 * first line was clipped); else its parts: the parcel's count over 700 px
 * high, the clue (`clue`, measured), and the compass, Deliver and what Pidge
 * said beside it — a miss on a narrow phone is four lines (UX review round 1: a
 * constant cut the compass's last row off on a tablet held upright).
 */
export const cardUnder = (compass: number, tallScreen: boolean, clue: number) => (tallScreen ? 28 : 0) + clue + 10 + Math.max(compass, 48 + 8 + 96) + CARD_CHROME + 2;
export const CARD_UNDER_SHORT = { fly: 140 + CARD_CHROME + 2, done: 220 } as const;

export interface FitIn {
  /** The board's room (px), less its padding: on a split screen its own height, on a phone the screen's under the header. */
  w: number;
  h: number;
  split: boolean;
  /** The screen's height (px): the compass's size, the card's count, a short screen. */
  screenH: number;
  /** The clue's height (px), as measured under the map. */
  clue: number;
  /** The map's width over its height. */
  ratio: number;
  /** Room beside the map (the town's numbers) and under it (its letters, or the world's scale). */
  gutter: number;
  under: number;
  done: boolean;
}

export interface Fit {
  /** The card beside the map, or under it. */
  beside: boolean;
  /** The map's width (px). */
  size: number;
  /** On a short phone held sideways, what Pidge said under the map. */
  saidUnder: boolean;
  /** Beside the map: Deliver under the compass, where it'd be squeezed beside it. */
  stack: boolean;
  /** Under the map: Deliver over the compass, where the column beside it is too narrow for its word (code review round 2: at 280 px wide). */
  narrow: boolean;
}

/**
 * Beside the map or under it, whichever lets the map be bigger — but beside
 * only where the card's room holds the compass at least (code review round 2:
 * the least map forced a 116 px card beside it at 360 × 400, the compass
 * sticking out of it, the page scrolling sideways).
 */
export function fitMap({ w, h, split, screenH, clue, ratio, gutter, under, done }: FitIn): Fit {
  const short = screenH <= 500;
  const compass = compassSide(screenH > 600);
  const card = split && short ? (done ? CARD_UNDER_SHORT.done : CARD_UNDER_SHORT.fly) : cardUnder(compass, screenH > 700, clue);
  const side = Math.floor(Math.max(MIN_MAP, Math.min((h - under) * ratio, w - cardMin(w, compass) - GAP - gutter)));
  const cardW = w - side - GAP - gutter;
  const below = Math.min(w - gutter, (h - card - GAP - under) * ratio, ratio === 1 ? 440 : Infinity);
  if (cardW >= compass + CARD_CHROME && side > below)
    return {
      beside: true,
      size: side,
      saidUnder: !split && short && h - under - side / ratio - GAP >= SAID_UNDER,
      stack: cardW < compass + 8 + DELIVER_MIN + CARD_CHROME,
      narrow: false,
    };
  return { beside: false, size: Math.floor(Math.min(w - gutter, Math.max(MIN_MAP, below))), saidUnder: false, stack: false, narrow: w - CARD_CHROME - compass - 12 < DELIVER_MIN };
}

/**
 * Expert's world map's labels, by a square's size (px; null before the map's
 * measured): its longitudes every 30° (two columns) wherever a number fits
 * between two lines — 12 px squares, the number alone under 24 px (west of 0°
 * on the left; UX review round 1: on a phone every 90°, five lines to count) —
 * else every 60°; the 180° ends where they clear the 150s (16 px); the
 * continents' names from 14 px (at 11 px they piled up: the bench, 568 × 320).
 */
export function globeLabels(cell: number | null): { longStep: number; bare: boolean; ends: boolean; named: boolean } {
  return { longStep: cell !== null && cell < 12 ? 4 : 2, bare: cell !== null && cell < 24, ends: cell === null || cell >= 16, named: cell === null || cell >= 14 };
}

/** Expert's latitudes labelled, by row (every 30°, the equator the 6th). */
export const GLOBE_LAT_ROWS = [2, 4, 6, 8, 10] as const;

/** A latitude's label at the foot of row `row - 1`: "60°N", "0°", "30°S". */
export function latLabel(row: number): string {
  const v = 90 - 15 * row;
  return v ? `${Math.abs(v)}°${v > 0 ? 'N' : 'S'}` : '0°';
}

/** A longitude's label at column `col`'s west side (of 24): "150°W", "0°", "180°" — or bare, "150". */
export function longLabel(col: number, bare: boolean): string {
  const v = -180 + 15 * col;
  if (!v) return '0°';
  if (Math.abs(v) === 180) return bare ? '180' : '180°';
  return bare ? String(Math.abs(v)) : `${Math.abs(v)}°${v > 0 ? 'E' : 'W'}`;
}
