import type { Band } from '../../content/minigames';

/**
 * ✨ Vela's Star Charts (docs/DESIGN-MINIGAMES.md §5.6): star pictures and how
 * far starlight travels, with Vela in her Observatory on Starfall Coast. Vela
 * names a star picture; the kid joins its stars — tap one, then another, and
 * if they're joined in the picture a line appears — till it's whole; then a
 * fact card. Gentle has 3–5 stars with the outline shown; Medium 6–8, only the
 * picture card to go by, and finds the North Star from the Big Dipper's
 * pointer stars; Tricky has the sky turned (it turns through the night) and no
 * outline, and each card says how long the light took to get here. Three
 * pictures a round; each finished is a page of Vela's chart. Pure: the
 * pictures, the jobs, the joins and the words.
 */

/** A star of a picture: where it is in a 100 × 100 sky (upright), and how bright (1 brightest … 3). */
export interface Star {
  id: string;
  name: string;
  x: number;
  y: number;
  mag: 1 | 2 | 3;
}

export const PICTURE_IDS = ['belt', 'triangle', 'crux', 'cassiopeia', 'big-dipper', 'little-dipper', 'orion', 'cygnus', 'leo'] as const;
export type PictureId = (typeof PICTURE_IDS)[number];

export interface Picture {
  id: PictureId;
  name: string;
  /** How a sentence says it: "the Big Dipper", "Orion’s Belt". */
  called: string;
  /** How it's drawn on the picture card and said: what it looks like. */
  looks: string;
  /** What it looks like on a turned sky, where `looks` says which way up (code review round 1: Tricky said "slanting up"). */
  turnedLooks?: string;
  stars: readonly Star[];
  /** Its lines: pairs of star ids. */
  lines: readonly (readonly [string, string])[];
  /** Its page on Vela's chart: a true thing about it. */
  note: string;
  /**
   * One of its stars, and how many years its light took to get here — rounded
   * (`about`), or where it's only roughly known, the least it can be (`atLeast`).
   */
  far: { star: string; years: number; about?: boolean; atLeast?: boolean };
}

const s = (id: string, name: string, x: number, y: number, mag: 1 | 2 | 3 = 2): Star => ({ id, name, x, y, mag });

export const PICTURES: readonly Picture[] = [
  {
    id: 'belt',
    name: 'Orion’s Belt',
    called: 'Orion’s Belt',
    looks: 'three stars in a short straight line, slanting up to the right',
    turnedLooks: 'three stars in a short straight line',
    stars: [s('alnitak', 'Alnitak', 34, 60), s('alnilam', 'Alnilam', 50, 50), s('mintaka', 'Mintaka', 66, 41)],
    lines: [
      ['alnitak', 'alnilam'],
      ['alnilam', 'mintaka'],
    ],
    note: 'Three stars in a row, the belt of Orion the hunter. Sailors and farmers have used it to find their way and to tell the seasons.',
    far: { star: 'Alnilam', years: 1000, atLeast: true },
  },
  {
    id: 'triangle',
    name: 'Summer Triangle',
    called: 'the Summer Triangle',
    looks: 'three bright stars making a big triangle, its point at the bottom',
    turnedLooks: 'three bright stars making a big triangle',
    stars: [s('vega', 'Vega', 64, 22, 1), s('deneb', 'Deneb', 28, 30, 1), s('altair', 'Altair', 52, 78, 1)],
    lines: [
      ['vega', 'deneb'],
      ['deneb', 'altair'],
      ['altair', 'vega'],
    ],
    note: 'Three of the brightest stars of summer nights, each in a different constellation: Vega, Deneb and Altair.',
    far: { star: 'Vega', years: 25 },
  },
  {
    id: 'crux',
    name: 'Southern Cross',
    called: 'the Southern Cross',
    looks: 'four stars making a small kite-shaped cross, the long bar up and down',
    turnedLooks: 'four stars making a small kite-shaped cross',
    stars: [s('gacrux', 'Gacrux', 50, 18), s('acrux', 'Acrux', 54, 82, 1), s('mimosa', 'Mimosa', 28, 48, 1), s('imai', 'Imai', 74, 44)],
    lines: [
      ['gacrux', 'acrux'],
      ['mimosa', 'imai'],
    ],
    note: 'The smallest constellation of all, seen from the south of the world. It’s on the flags of Australia, New Zealand and Brazil.',
    far: { star: 'Acrux', years: 320, about: true },
  },
  {
    id: 'cassiopeia',
    name: 'Cassiopeia',
    called: 'Cassiopeia',
    looks: 'five stars making a W',
    turnedLooks: 'five stars in a zigzag — a W, turned',
    stars: [s('caph', 'Caph', 86, 39), s('schedar', 'Schedar', 72, 62, 1), s('navi', 'Navi', 53, 45), s('ruchbah', 'Ruchbah', 36, 53), s('segin', 'Segin', 14, 38)],
    lines: [
      ['caph', 'schedar'],
      ['schedar', 'navi'],
      ['navi', 'ruchbah'],
      ['ruchbah', 'segin'],
    ],
    note: 'A queen in an old Greek story, sitting on her throne. Her W sits across from the Big Dipper, on the other side of the North Star.',
    far: { star: 'Schedar', years: 230, about: true },
  },
  {
    id: 'big-dipper',
    name: 'Big Dipper',
    called: 'the Big Dipper',
    looks: 'seven stars: a bowl of four and a long bent handle of three',
    stars: [
      s('alkaid', 'Alkaid', 10, 50),
      s('mizar', 'Mizar', 24, 44),
      s('alioth', 'Alioth', 37, 46),
      s('megrez', 'Megrez', 50, 52),
      s('phecda', 'Phecda', 54, 70),
      s('merak', 'Merak', 76, 72),
      s('dubhe', 'Dubhe', 80, 50, 1),
    ],
    lines: [
      ['alkaid', 'mizar'],
      ['mizar', 'alioth'],
      ['alioth', 'megrez'],
      ['megrez', 'phecda'],
      ['phecda', 'merak'],
      ['merak', 'dubhe'],
      ['dubhe', 'megrez'],
    ],
    note: 'Part of the Great Bear. The two stars at the end of its bowl, Merak and Dubhe, point to the North Star.',
    far: { star: 'Dubhe', years: 120, about: true },
  },
  {
    id: 'little-dipper',
    name: 'Little Dipper',
    called: 'the Little Dipper',
    looks: 'seven fainter stars: a small bowl of four and a handle of three ending at the North Star',
    stars: [
      s('polaris', 'Polaris, the North Star', 13, 31, 1),
      s('yildun', 'Yildun', 17, 46, 3),
      s('epsilon-umi', 'Epsilon', 27, 62, 3),
      s('zeta-umi', 'Zeta', 44, 71, 3),
      s('eta-umi', 'Eta', 42, 82, 3),
      s('pherkad', 'Pherkad', 65, 86),
      s('kochab', 'Kochab', 64, 73, 1),
    ],
    lines: [
      ['polaris', 'yildun'],
      ['yildun', 'epsilon-umi'],
      ['epsilon-umi', 'zeta-umi'],
      ['zeta-umi', 'eta-umi'],
      ['eta-umi', 'pherkad'],
      ['pherkad', 'kochab'],
      ['kochab', 'zeta-umi'],
    ],
    note: 'Its handle ends at the North Star, which hardly moves all night: face it and you’re facing north.',
    far: { star: 'Polaris', years: 430, about: true },
  },
  {
    id: 'orion',
    name: 'Orion',
    called: 'Orion',
    looks: 'seven bright stars: two shoulders, a belt of three in the middle, two feet',
    stars: [
      s('betelgeuse', 'Betelgeuse', 30, 18, 1),
      s('bellatrix', 'Bellatrix', 68, 22),
      s('alnitak-o', 'Alnitak', 40, 54),
      s('alnilam-o', 'Alnilam', 50, 50),
      s('mintaka-o', 'Mintaka', 60, 46),
      s('saiph', 'Saiph', 36, 84),
      s('rigel', 'Rigel', 72, 80, 1),
    ],
    lines: [
      ['betelgeuse', 'bellatrix'],
      ['betelgeuse', 'alnitak-o'],
      ['bellatrix', 'mintaka-o'],
      ['alnitak-o', 'alnilam-o'],
      ['alnilam-o', 'mintaka-o'],
      ['alnitak-o', 'saiph'],
      ['mintaka-o', 'rigel'],
    ],
    note: 'The hunter. Betelgeuse, his shoulder, is a red supergiant: put it where the Sun is and it would swallow Mars’s path round the Sun.',
    far: { star: 'Betelgeuse', years: 550, about: true },
  },
  {
    id: 'cygnus',
    name: 'Cygnus',
    called: 'Cygnus',
    looks: 'six stars making a cross: a long body and two wings, like a swan flying',
    stars: [
      s('deneb-c', 'Deneb', 50, 12, 1),
      s('sadr', 'Sadr', 50, 40),
      s('eta-cyg', 'Eta', 50, 62, 3),
      s('albireo', 'Albireo', 50, 88),
      s('gienah', 'Gienah', 22, 48),
      s('delta-cyg', 'Delta', 78, 32),
    ],
    lines: [
      ['deneb-c', 'sadr'],
      ['sadr', 'eta-cyg'],
      ['eta-cyg', 'albireo'],
      ['gienah', 'sadr'],
      ['sadr', 'delta-cyg'],
    ],
    note: 'The swan, flying down the Milky Way. Albireo, its beak, is two stars together — one gold, one blue.',
    far: { star: 'Deneb', years: 1400, atLeast: true },
  },
  {
    id: 'leo',
    name: 'Leo',
    called: 'Leo',
    looks: 'eight stars: a backwards question mark for the lion’s head and a triangle for its back',
    stars: [
      s('regulus', 'Regulus', 87, 63, 1),
      s('eta-leo', 'Eta', 83, 50, 3),
      s('algieba', 'Algieba', 72, 45),
      s('adhafera', 'Adhafera', 70, 35, 3),
      s('rasalas', 'Rasalas', 81, 22, 3),
      s('zosma', 'Zosma', 38, 55),
      s('denebola', 'Denebola', 19, 78),
      s('chertan', 'Chertan', 42, 69, 3),
    ],
    lines: [
      ['regulus', 'eta-leo'],
      ['eta-leo', 'algieba'],
      ['algieba', 'adhafera'],
      ['adhafera', 'rasalas'],
      ['algieba', 'zosma'],
      ['zosma', 'denebola'],
      ['denebola', 'chertan'],
      ['chertan', 'zosma'],
      ['chertan', 'regulus'],
    ],
    note: 'The lion. Its brightest star, Regulus, is its heart — and it spins so fast it bulges in the middle.',
    far: { star: 'Regulus', years: 79 },
  },
];

export const PICTURE_BY_ID = Object.fromEntries(PICTURES.map((p) => [p.id, p])) as Record<PictureId, Picture>;

/** The pictures each band joins (pages come from every band, §3.3). */
export const BAND_PICTURES: Record<Band, readonly PictureId[]> = {
  gentle: ['belt', 'triangle', 'crux', 'cassiopeia'],
  medium: ['big-dipper', 'little-dipper', 'orion', 'cygnus', 'leo'],
  tricky: PICTURE_IDS,
};

export const JOBS_PER_ROUND = 3;

/** The sky’s other stars, tiny dim dots — every star of the picture is bigger and brighter: how many by band. */
const EXTRAS: Record<Band, number> = { gentle: 4, medium: 8, tricky: 10 };

/** Tricky's skies turn: by how much, in turn. */
const TURNS = [90, -45, 135, 45, -90, 180];

export interface Job {
  picture: PictureId;
  /** The outline shown, dashed (Gentle). */
  outline: boolean;
  /** Degrees the sky is turned (Tricky); 0 upright. */
  turn: number;
  /** The Little Dipper on Medium: first find the North Star from the Big Dipper's pointers. */
  findNorth: boolean;
  /** The sky: the picture's stars and the extras, turned, each { id, x, y, mag, extra }. */
  sky: readonly SkyStar[];
}

export interface SkyStar {
  id: string;
  x: number;
  y: number;
  mag: 1 | 2 | 3;
  /** Not part of the picture. */
  extra: boolean;
}

/**
 * Which pictures come up in a round: those not on the chart yet first, so
 * every round can fill pages, then the rest in turn from where the round
 * would have them.
 */
export function roundQueue(band: Band, known: (id: PictureId) => boolean, round: number): PictureId[] {
  const can = BAND_PICTURES[band];
  const start = (round * JOBS_PER_ROUND) % can.length;
  const turn = [...can.slice(start), ...can.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** A point turned about the sky's middle. */
export function turned(x: number, y: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const dx = x - 50;
  const dy = y - 50;
  return [Math.round((50 + dx * Math.cos(a) - dy * Math.sin(a)) * 10) / 10, Math.round((50 + dx * Math.sin(a) + dy * Math.cos(a)) * 10) / 10];
}

/** A small, fixed number from a seed: the same sky every time for a job. */
function rand(seed: number): () => number {
  let x = seed * 9301 + 49297;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

type Point = { x: number; y: number };

/** How far a point is from a line between two others. */
export function segmentGap(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** How near the extras may come: to a star, and to a line drawn (the picture's, the bowl's, the arrow). */
export const EXTRA_GAP = { star: 14, line: 6 } as const;

/**
 * The extras: tiny stars placed where no star of the picture (nor the Big
 * Dipper, when it's there) is close, nor any line (code review round 1: one
 * sat on the Summer Triangle's dotted outline, looking like a fourth star).
 */
function extras(stars: readonly Point[], lines: readonly (readonly [Point, Point])[], n: number, seed: number): SkyStar[] {
  const r = rand(seed);
  const out: SkyStar[] = [];
  for (let tries = 0; out.length < n && tries < 600; tries++) {
    const p = { x: Math.round(8 + r() * 84), y: Math.round(8 + r() * 84) };
    if ([...stars, ...out].every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= EXTRA_GAP.star) && lines.every(([a, b]) => segmentGap(p, a, b) >= EXTRA_GAP.line))
      out.push({ id: `extra-${out.length + 1}`, ...p, mag: 3, extra: true });
  }
  return out;
}

/** The `i`th job of a round. */
export function jobFor(band: Band, round: number, i: number, queue?: readonly PictureId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  const id = q[i % q.length];
  const p = PICTURE_BY_ID[id];
  const slot = round * JOBS_PER_ROUND + i;
  const turn = band === 'tricky' ? TURNS[slot % TURNS.length] : 0;
  const findNorth = band === 'medium' && id === 'little-dipper';
  const placed = p.stars.map((st) => {
    const [x, y] = turned(st.x, st.y, turn);
    return { id: st.id, x, y, mag: st.mag, extra: false };
  });
  // The North Star's hunt shows the Big Dipper's bowl too, its pointers aimed at Polaris (and the arrow from them, once tapped).
  const guide = findNorth ? POINTER_GUIDE : [];
  const at = Object.fromEntries([...placed, ...guide].map((st) => [st.id, st]));
  const drawn = [...p.lines, ...(findNorth ? [...GUIDE_BOWL, ['merak-g', 'polaris'] as const] : [])].map(([a, b]) => [at[a], at[b]] as const);
  const sky = [...placed, ...guide, ...extras([...placed, ...guide], drawn, EXTRAS[band], slot + 1)];
  return { picture: id, outline: band === 'gentle', turn, findNorth, sky };
}

/**
 * The Big Dipper beside the Little Dipper, for finding the North Star: its
 * bowl's end stars (Merak, then Dubhe) point straight at Polaris, about five
 * times as far again (drawn closer here, to fit the sky).
 */
export const POINTER_GUIDE: readonly SkyStar[] = [
  // As in the real sky, turned (never mirrored: code review round 1 — its bowl was on the wrong side of the pointers),
  // drawn closer to the North Star; Dubhe exactly on the line from Merak to Polaris.
  { id: 'merak-g', x: 77, y: 12, mag: 2, extra: false },
  { id: 'dubhe-g', x: 64.7, y: 15.6, mag: 1, extra: false },
  { id: 'phecda-g', x: 87, y: 26, mag: 3, extra: true },
  { id: 'megrez-g', x: 79, y: 33, mag: 3, extra: true },
];

/**
 * The arrow from Merak through Dubhe: where it ends, `short` sky units before
 * it reaches the North Star (the arrowhead's tip), and its direction (a unit).
 */
export function pointerArrow(polaris: { x: number; y: number }, short = 5): { x: number; y: number; ux: number; uy: number } {
  const [m, d] = POINTER_GUIDE;
  const len = Math.hypot(d.x - m.x, d.y - m.y);
  const ux = (d.x - m.x) / len;
  const uy = (d.y - m.y) / len;
  const t = (polaris.x - m.x) * ux + (polaris.y - m.y) * uy - short;
  return { x: m.x + ux * t, y: m.y + uy * t, ux, uy };
}

/** The Big Dipper's bowl, drawn faint while the North Star is found. */
export const GUIDE_BOWL: readonly (readonly [string, string])[] = [
  ['megrez-g', 'dubhe-g'],
  ['dubhe-g', 'merak-g'],
  ['merak-g', 'phecda-g'],
  ['phecda-g', 'megrez-g'],
];

/** The pointers, in the order to tap them: Merak, then Dubhe — the line runs on to Polaris. */
export const POINTERS = ['merak-g', 'dubhe-g'] as const;

/** Is a line between `a` and `b` one of the picture's? */
export function isLine(p: Picture, a: string, b: string): boolean {
  return p.lines.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** The key a line is kept under, either way round. */
export const lineKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** A star's name in a picture, or null for one of the sky's others. */
export function starName(p: Picture, id: string): string | null {
  return p.stars.find((st) => st.id === id)?.name ?? null;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** How far a picture's turned, said: a quarter turn's "on its side" (UX review round 1: it said that of every turn). */
export function turnWords(turn: number): string {
  const t = ((turn % 360) + 360) % 360;
  if (t === 90 || t === 270) return 'on its side';
  if (t === 180) return 'upside down';
  if (t === 135 || t === 225) return 'tilted, nearly upside down';
  return 'tilted';
}

/** What a job's picture looks like, said the way its sky is (turned, no "up" or "down"). */
export function looksWords(job: Job): string {
  const p = PICTURE_BY_ID[job.picture];
  return job.turn ? (p.turnedLooks ?? p.looks) : p.looks;
}

/** The job, as its ticket says it. */
export function jobWords(job: Job): string {
  const p = PICTURE_BY_ID[job.picture];
  const n = NUM[p.stars.length];
  if (job.findNorth) return `First find the North Star: follow the Big Dipper’s two pointer stars. Then join the ${n} stars of ${p.called}.`;
  if (job.outline) return `Join the ${n} stars of ${p.called} along the dotted lines.`;
  if (job.turn) return `Join the ${n} stars of ${p.called} — the sky has turned, so it’s ${turnWords(job.turn)}.`;
  return `Join the ${n} stars of ${p.called}. The card shows its shape.`;
}

/** After two stars are tapped: joined, already joined, or not a line of the picture. Never scolded. */
export function joinWords(p: Picture, a: string, b: string, done: boolean): string {
  const an = starName(p, a);
  const bn = starName(p, b);
  if (!an || !bn) return `That tiny star isn’t part of ${p.called} — its stars are bigger. Look at the card!`;
  if (!isLine(p, a, b)) return `${an} and ${bn} are both in ${p.called}, but they aren’t joined. Look at the card again!`;
  if (done) return `${an} and ${bn} are joined already.`;
  return `${an} to ${bn} — joined!`;
}

/** What a finished picture teaches, for the reward: its note, and on Tricky how long its light took. */
export function learnedLine(job: Job, band: Band): string {
  const p = PICTURE_BY_ID[job.picture];
  if (band !== 'tricky') return p.note;
  const { star, years, about, atLeast } = p.far;
  return `${p.note} The light you see from ${star} left it ${atLeast ? 'at least ' : about ? 'about ' : ''}${years.toLocaleString('en-GB')} years ago.`;
}

/** How a star is said on the sky, by where it is: "a bright star near the top left"; one of the sky's others, "a tiny star". */
export function placeWords(x: number, y: number, mag: 1 | 2 | 3, extra = false): string {
  const v = y < 34 ? 'top' : y > 66 ? 'bottom' : 'middle';
  const h = x < 34 ? 'left' : x > 66 ? 'right' : 'middle';
  const where = v === 'middle' && h === 'middle' ? 'the middle' : v === 'middle' ? `the middle ${h}` : h === 'middle' ? `the ${v}` : `the ${v} ${h}`;
  return `${extra ? 'A tiny' : mag === 1 ? 'A bright' : mag === 2 ? 'A' : 'A faint'} star near ${where}`;
}

export { cap as capitalise };
