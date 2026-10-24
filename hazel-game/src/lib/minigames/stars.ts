import type { PlayBand } from '../../content/minigames';

/**
 * ✨ Vela's Star Charts (docs/DESIGN-MINIGAMES.md §5.6): star pictures and how
 * far starlight travels, with Vela in her Observatory on Starfall Coast. Vela
 * names a star picture; the kid joins its stars — tap one, then another, and
 * if they're joined in the picture a line appears — till it's whole; then a
 * fact card. Gentle has 3–5 stars with the outline shown; Medium 6–8, only the
 * picture card to go by, and finds the North Star from the Big Dipper's
 * pointer stars; Tricky has the sky turned (it turns through the night) and no
 * outline, and each card says how long the light took to get here. Expert
 * (§8.5) reads the sky's coordinates: each picture on an altitude–azimuth
 * grid, one of its stars found from its coordinates before it's joined, and
 * on the Little Dipper the latitude read from the North Star's altitude.
 * Three pictures a round; each finished is a page of Vela's chart. Pure: the
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
  /**
   * Expert's night (§8.5): the sidereal time (degrees) Vela shows it at — how
   * far the sky has turned — chosen so it's well up from all of `LATITUDES`,
   * its top under about 45°, where the grid's stretch is small (code review
   * round 1: each was drawn at a place and a turn it can't have from the
   * coast). Its stars go where they really are then (`expertSky`).
   */
  lst: number;
  /** What it teaches on Expert: where it is in the sky, true for anywhere on Earth. */
  sky: string;
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
    lst: 161,
    sky: 'The celestial equator is the Earth’s equator carried out onto the sky, and a star’s declination is how far north (+) or south (−) of it the star is. Mintaka, in the belt, is almost on it (declination 0°), so it rises due east and sets due west from almost anywhere on Earth.',
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
    lst: 220,
    sky: 'Vega’s declination — how far north of the celestial equator it is — is +39°: from 39° north of the Earth’s equator it passes straight overhead, and the further south you are, the lower it stays.',
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
    lst: 171,
    sky: 'Acrux, its brightest and southernmost star, is at declination −63°: it rises only south of 90° − 63° = 27° N, so from the coast here the whole cross is seen low in the south.',
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
    lst: 78,
    sky: 'Its stars are about 60° north of the celestial equator: from 35° N and further north it never sets — it wheels round the North Star all night.',
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
    lst: 120,
    sky: 'Its stars are 49° to 62° north of the celestial equator: from 41° N and further north it never sets, and its pointers always lead to the North Star.',
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
    lst: 308,
    sky: 'The North Star is less than 1° from the pole the sky turns round, so its altitude is your latitude: at the North Pole it’s straight overhead, at the equator on the horizon.',
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
    lst: 153,
    sky: 'Orion lies across the celestial equator, so it’s seen from everywhere people live — upside down from the far south.',
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
    lst: 18,
    sky: 'Deneb is 45° north of the celestial equator, so from 45° N it passes straight overhead; Cygnus flies along the Milky Way.',
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
    lst: 225,
    sky: 'Regulus is less than half a degree from the ecliptic, the Sun’s yearly path round the sky, so the Moon and the planets often pass close to it.',
  },
];

export const PICTURE_BY_ID = Object.fromEntries(PICTURES.map((p) => [p.id, p])) as Record<PictureId, Picture>;

const hms = (h: number, m: number) => (h + m / 60) * 15;

/**
 * The real sky: each picture's stars' right ascension and declination (J2000,
 * degrees) — where Expert draws them (`expertSky`), and what the tests check
 * the pictures' shapes against.
 */
export const RADEC: Readonly<Record<string, readonly [number, number]>> = {
  alnitak: [hms(5, 40.8), -1.94], alnilam: [hms(5, 36.2), -1.2], mintaka: [hms(5, 32), -0.3],
  vega: [hms(18, 36.9), 38.78], deneb: [hms(20, 41.4), 45.28], altair: [hms(19, 50.8), 8.87],
  acrux: [hms(12, 26.6), -63.1], mimosa: [hms(12, 47.7), -59.69], gacrux: [hms(12, 31.2), -57.11], imai: [hms(12, 15.1), -58.75],
  caph: [hms(0, 9.2), 59.15], schedar: [hms(0, 40.5), 56.54], navi: [hms(0, 56.7), 60.72], ruchbah: [hms(1, 25.8), 60.24], segin: [hms(1, 54.4), 63.67],
  dubhe: [hms(11, 3.7), 61.75], merak: [hms(11, 1.8), 56.38], phecda: [hms(11, 53.8), 53.69], megrez: [hms(12, 15.4), 57.03], alkaid: [hms(13, 47.5), 49.31],
  mizar: [hms(13, 23.9), 54.93], alioth: [hms(12, 54), 55.96],
  polaris: [hms(2, 31.8), 89.26], yildun: [hms(17, 32.2), 86.59], 'epsilon-umi': [hms(16, 46), 82.04], 'zeta-umi': [hms(15, 44.1), 77.79], 'eta-umi': [hms(16, 17.5), 75.76], kochab: [hms(14, 50.7), 74.16], pherkad: [hms(15, 20.7), 71.83],
  betelgeuse: [hms(5, 55.2), 7.41], bellatrix: [hms(5, 25.1), 6.35], rigel: [hms(5, 14.5), -8.2], saiph: [hms(5, 47.8), -9.67],
  'deneb-c': [hms(20, 41.4), 45.28], sadr: [hms(20, 22.2), 40.26], 'eta-cyg': [hms(19, 56.3), 35.08], gienah: [hms(20, 46.2), 33.97], albireo: [hms(19, 30.7), 27.96], 'delta-cyg': [hms(19, 45), 45.13],
  regulus: [hms(10, 8.4), 11.97], 'eta-leo': [hms(10, 7.3), 16.76], algieba: [hms(10, 20), 19.84], adhafera: [hms(10, 16.7), 23.42], rasalas: [hms(9, 52.8), 26.01], zosma: [hms(11, 14.1), 20.52], denebola: [hms(11, 49.1), 14.57], chertan: [hms(11, 14.2), 15.43],
};

/** A star's place in the real sky: Orion's belt stars and the hunt's Big Dipper share their names' (`alnitak-o`, `merak-g`). */
export function radecOf(id: string): readonly [number, number] {
  const at = RADEC[id.replace(/-[go]$/, '')] as readonly [number, number] | undefined;
  if (!at) throw new Error(`No place in the sky for ${id}`);
  return at;
}

/** The pictures each band joins (pages come from every band, §3.3). */
export const BAND_PICTURES: Record<PlayBand, readonly PictureId[]> = {
  gentle: ['belt', 'triangle', 'crux', 'cassiopeia'],
  medium: ['big-dipper', 'little-dipper', 'orion', 'cygnus', 'leo'],
  tricky: PICTURE_IDS,
  expert: PICTURE_IDS,
};

export const JOBS_PER_ROUND = 3;

/** The sky’s other stars, tiny dim dots — every star of the picture is bigger and brighter: how many by band. */
const EXTRAS: Record<PlayBand, number> = { gentle: 4, medium: 8, tricky: 10, expert: 10 };

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
  /** Expert: the sky's altitude–azimuth view; the star to find from its coordinates; on the Little Dipper, the latitude. */
  view: View | null;
  find: string | null;
  latitude: number | null;
}

/** Expert's view of a picture: the azimuth and altitude at the sky's middle, and degrees a sky unit. */
export interface View {
  facing: number;
  mid: number;
  k: number;
  /** How far the picture's turned on this sky from its card's drawing (degrees, clockwise): the card's turned to match. */
  turn?: number;
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
export function roundQueue(band: PlayBand, known: (id: PictureId) => boolean, round: number): PictureId[] {
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
function extras(stars: readonly Point[], lines: readonly (readonly [Point, Point])[], n: number, seed: number, ok: (p: Point) => boolean = () => true): SkyStar[] {
  const r = rand(seed);
  const out: SkyStar[] = [];
  for (let tries = 0; out.length < n && tries < 600; tries++) {
    const p = { x: Math.round(8 + r() * 84), y: Math.round(8 + r() * 84) };
    if (ok(p) && [...stars, ...out].every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= EXTRA_GAP.star) && lines.every(([a, b]) => segmentGap(p, a, b) >= EXTRA_GAP.line))
      out.push({ id: `extra-${out.length + 1}`, ...p, mag: 3, extra: true });
  }
  return out;
}

/** The `i`th job of a round. */
export function jobFor(band: PlayBand, round: number, i: number, queue?: readonly PictureId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  const id = q[i % q.length];
  const p = PICTURE_BY_ID[id];
  const slot = round * JOBS_PER_ROUND + i;
  const turn = band === 'tricky' ? TURNS[slot % TURNS.length] : 0;
  const findNorth = band === 'medium' && id === 'little-dipper';
  // Expert: one night's latitude along the coast for the round, and each star where it really is from there.
  const night = band === 'expert' ? LATITUDES[turnFor(round, LATITUDES.length)] : null;
  const real = night === null ? null : expertSky(p, night);
  const placed =
    real?.stars ??
    p.stars.map((st) => {
      const [x, y] = turned(st.x, st.y, turn);
      return { id: st.id, x, y, mag: st.mag, extra: false };
    });
  // The North Star's hunt shows the Big Dipper's bowl too, its pointers aimed at Polaris (and the arrow from them, once tapped).
  const guide = findNorth ? POINTER_GUIDE : [];
  const at = Object.fromEntries([...placed, ...guide].map((st) => [st.id, st]));
  const drawn = [...p.lines, ...(findNorth ? [...GUIDE_BOWL, ['merak-g', 'polaris'] as const] : [])].map(([a, b]) => [at[a], at[b]] as const);
  // Expert's others: above the horizon, and never at a picture star's coordinates (code review round 2: on Orion's Belt three
  // tiny dots were at the very altitude and azimuth asked, and a tap on one cost the seal).
  const round0 = (v: View, q: Point) => {
    const c = altAz(v, q.x, q.y);
    return `${Math.round(c.alt)}|${Math.round(c.az) % 360}`;
  };
  const taken = real ? new Set(placed.map((st) => round0(real.view, st))) : null;
  const ok = real && taken ? (q: Point) => altAz(real.view, q.x, q.y).alt >= 2 && !taken.has(round0(real.view, q)) : undefined;
  const sky = [...placed, ...guide, ...extras([...placed, ...guide], drawn, EXTRAS[band], slot + 1, ok)];
  if (!real) return { picture: id, outline: band === 'gentle', turn, findNorth, sky, view: null, find: null, latitude: null };
  // Each time a picture comes round on Expert, another of its bright stars to find (by the round: `turnFor`) — and on the
  // Little Dipper, the latitude.
  const latitude = id === 'little-dipper' ? night : null;
  // Its bright stars clear of the others, so a tap can't land on one beside it (Orion's belt stars are 6 apart).
  const bright = real.stars.filter((st) => st.mag < 3 && real.stars.every((o) => o === st || Math.hypot(o.x - st.x, o.y - st.y) >= FIND_GAP));
  return { picture: id, outline: false, turn: 0, findNorth: false, sky, view: real.view, find: latitude === null ? bright[turnFor(round, bright.length)].id : null, latitude };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Which of `n` an Expert question is, by the round (code review round 1: by a
 * picture's lap of the nine, and with pages on the chart a picture comes out
 * of turn — the same question twice running): never the same one round or
 * three apart (a picture's turn comes round every third round), and in turn
 * every one where it can be.
 */
export function turnFor(round: number, n: number): number {
  if (n < 2) return 0;
  // The step a picture's turn (three rounds) moves it: never back where it was, and round all of them where it can.
  const b = [1, 2, 3, 4].find((x) => gcd(3 + x, n) === 1) ?? 1;
  return (round + b * Math.floor(round / 3)) % n;
}

/**
 * Where Vela sets up her telescope along Starfall Coast, a night a round
 * (degrees north): far enough south that the Southern Cross clears the
 * horizon (south of about 27° N), far enough north that the Little Dipper
 * does (tested).
 */
export const LATITUDES: readonly number[] = [20, 15, 25];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** An angle as a turn either way, −180° to 180°. */
const either = (deg: number) => ((((deg % 360) + 540) % 360) - 180);

/**
 * Where a star is seen from `lat`° N when the sky's turned to sidereal time
 * `lst` (degrees): altitude up from the horizon, azimuth round from north
 * through east.
 */
export function realAltAz([ra, dec]: readonly [number, number], lat: number, lst: number): { alt: number; az: number } {
  const r = Math.PI / 180;
  const [h, d, p] = [(lst - ra) * r, dec * r, lat * r];
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)) / r;
  const az = Math.atan2(-Math.cos(d) * Math.sin(h), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h)) / r;
  return { alt, az: (az + 360) % 360 };
}

/** How far a star to find is from any other of its picture's, at least (sky units). */
export const FIND_GAP = 10;

/** How far from the sky's middle a picture's stars reach, at most (sky units): room for their names round them. */
export const SPREAD = 36;

/**
 * Expert's sky of a picture from `lat`° N (§8.5; code review round 1: each
 * was drawn at a place and a turn it can't have from the coast, and a degree
 * of azimuth up high is less sky than one of altitude): every star where it
 * really is at the picture's sidereal time (`Picture.lst`), on a grid with a
 * degree of azimuth as wide as one of altitude — so its coordinates are the
 * real ones, read straight off the grid, and up high a picture's a little
 * wider than it looks (1 / cos altitude: its top's kept under about 45°).
 * The view's middle is the picture's, and it fills the sky to `SPREAD`.
 */
export function expertSky(p: Picture, lat: number): { view: View; stars: SkyStar[] } {
  const at = p.stars.map((st) => ({ st, ...realAltAz(radecOf(st.id), lat, p.lst) }));
  const dz = at.map((a) => either(a.az - at[0].az));
  const alts = at.map((a) => a.alt);
  const facing = (at[0].az + (Math.max(...dz) + Math.min(...dz)) / 2 + 360) % 360;
  const mid = (Math.max(...alts) + Math.min(...alts)) / 2;
  const k = Math.max(Math.max(...dz) - Math.min(...dz), Math.max(...alts) - Math.min(...alts)) / (2 * SPREAD);
  const stars = at.map(({ st, alt, az }) => ({ id: st.id, x: round1(50 + either(az - facing) / k), y: round1(50 - (alt - mid) / k), mag: st.mag, extra: false }));
  return { view: { facing, mid, k, turn: cardTurn(p.stars, stars) }, stars };
}

/**
 * How far a picture's turned on the sky from its card (degrees, clockwise on
 * the screen, whole): the turn that best lays the card's stars over the
 * sky's, round their middles (UX review round 2: the real sky turns a
 * picture up to 141° from its upright card, and nothing said so).
 */
export function cardTurn(card: readonly Point[], sky: readonly Point[]): number {
  const mid = (ps: readonly Point[]) => ({ x: ps.reduce((t, q) => t + q.x, 0) / ps.length, y: ps.reduce((t, q) => t + q.y, 0) / ps.length });
  const [mc, ms] = [mid(card), mid(sky)];
  let a = 0;
  let b = 0;
  card.forEach((c, k) => {
    const [dx, dy] = [c.x - mc.x, c.y - mc.y];
    const [ex, ey] = [sky[k].x - ms.x, sky[k].y - ms.y];
    a += dx * ex + dy * ey;
    b += dx * ey - dy * ex;
  });
  return Math.round((Math.atan2(b, a) * 180) / Math.PI);
}

/** A point of the sky (0–100, y down) in the view's coordinates: altitude up from the horizon, azimuth round from north through east. */
export function altAz(view: View, x: number, y: number): { alt: number; az: number } {
  const az = (((view.facing + (x - 50) * view.k) % 360) + 360) % 360;
  return { alt: view.mid + (50 - y) * view.k, az };
}

/** A star's coordinates, said in whole degrees. */
export function starCoords(job: Job, id: string): { alt: number; az: number } | null {
  const st = job.sky.find((o) => o.id === id);
  if (!job.view || !st) return null;
  const { alt, az } = altAz(job.view, st.x, st.y);
  return { alt: Math.round(alt), az: Math.round(az) % 360 };
}

/** The grid's step: the smallest of 1°, 2°, 5° and 10° whose lines are at least 15 sky units apart. */
export function gridStep(view: View): number {
  return [1, 2, 5, 10].find((st) => st / view.k >= 15) ?? 10;
}

type GridLine = { v: number; at: number };

/**
 * The grid's lines across the sky: each altitude's y and each azimuth's x
 * (0–100), at the view's step — and on a 10° grid, fainter unlabelled lines
 * between, every 5° (`minor`; UX review round 1: telling 32° from 35° between
 * lines 10° apart was a guess on a small sky).
 */
export function gridLines(view: View): { step: number; alts: GridLine[]; azs: GridLine[]; minor: { alts: GridLine[]; azs: GridLine[] } } {
  const step = gridStep(view);
  const lines = (at: number) => {
    const alts: GridLine[] = [];
    const azs: GridLine[] = [];
    const top = view.mid + 50 * view.k;
    // (`|| 0`: the horizon's 0°, never −0.)
    for (let v = Math.ceil((view.mid - 50 * view.k) / at) * at; v <= top + 1e-9; v += at) alts.push({ v: v || 0, at: round1(50 - (v - view.mid) / view.k) });
    const left = view.facing - 50 * view.k;
    for (let a = Math.ceil(left / at) * at; a <= left + 100 * view.k + 1e-9; a += at) azs.push({ v: ((a % 360) + 360) % 360, at: round1(50 + (a - view.facing) / view.k) });
    return { alts, azs };
  };
  const { alts, azs } = lines(step);
  const between = step === 10 ? lines(5) : { alts: [], azs: [] };
  const off = (l: GridLine) => l.v % step !== 0;
  return { step, alts, azs, minor: { alts: between.alts.filter(off), azs: between.azs.filter(off) } };
}

/** "altitude 57°, azimuth 102°". */
export const coordsWords = ({ alt, az }: { alt: number; az: number }) => `altitude ${alt}°, azimuth ${az}°`;

/** Expert's ask: the star to find, by its coordinates — its name, but not where it is. */
export function findWords(job: Job): string {
  const p = PICTURE_BY_ID[job.picture];
  if (!job.find) return '';
  return `${shortName(p, job.find)} is at ${coordsWords(starCoords(job, job.find)!)}. Find it on the grid and tap it.`;
}

/** A star tapped while finding: found, or where the one tapped is and which way to look. Plain. */
export function foundWords(job: Job, tapped: string): string {
  const p = PICTURE_BY_ID[job.picture];
  const want = job.find ? starCoords(job, job.find) : null;
  const got = starCoords(job, tapped);
  if (!job.find || !want || !got) return '';
  const name = shortName(p, job.find);
  if (tapped === job.find) return `${name}, at ${coordsWords(want)}. Now join the stars of ${p.called}.`;
  const what = starName(p, tapped) ? 'That star' : 'That tiny dot';
  const up = want.alt > got.alt ? 'higher' : want.alt < got.alt ? 'lower' : '';
  const dAz = ((want.az - got.az + 540) % 360) - 180;
  const side = dAz > 0 ? 'to the right' : dAz < 0 ? 'to the left' : '';
  const way = [up, side].filter(Boolean).join(' and ');
  return `${what} is at ${coordsWords(got)}. ${name} is ${way || 'close by'}. Try again.`;
}

/** The latitude's four choices on the Little Dipper: the right one; 90° less it (the angle from overhead); south; a grid line off. */
export function latitudeChoices(latitude: number, step: number): string[] {
  const all = [`${latitude}° N`, `${90 - latitude}° N`, `${latitude}° S`, `${latitude + step}° N`];
  // In an order that moves round, never first (UX review rounds 1 and 2: a new teen's first, 15° N, was).
  const k = (latitude / 5 + 2) % all.length;
  return [...all.slice(k), ...all.slice(0, k)];
}

/** Expert's ask on the Little Dipper. */
export const latitudeAsk = 'The North Star, at the end of the Little Dipper’s handle, is within a degree of due north. Read its altitude on the grid: how far north are we tonight?';

/** Is a latitude picked the night's? (The words and the seal by the one check: code review round 1.) */
export const isRightLatitude = (latitude: number, picked: string) => picked === `${latitude}° N`;

/** After a latitude's picked: the reason, either way. Plain. */
export function latitudeWords(latitude: number, picked: string): string {
  const why = `The North Star is over the Earth’s North Pole, so its altitude is your latitude: it’s ${latitude}° up, and we’re ${latitude}° north.`;
  return isRightLatitude(latitude, picked) ? `Yes — ${picked}. ${why}` : `Not ${picked}. ${why}`;
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

/**
 * The North Star's hunt, said as `POINTER_GUIDE` draws it (UX review round 2:
 * the words still said where the stars were before round 1 moved them):
 * Merak is the bowl's highest star, Dubhe just left of it; the arrow runs on,
 * left, to Polaris.
 */
export const HUNT_WORDS = {
  start: 'Before the Little Dipper, let’s find the North Star: tap Merak, the highest star of the Big Dipper’s bowl, then Dubhe just left of it!',
  doing: 'Tap Merak — the highest star of the Big Dipper’s bowl, at the top right — then Dubhe, just left of it. They point at the North Star; then tap it.',
  notMerak: 'Not that one: Merak is the highest star of the Big Dipper’s bowl, at the top right.',
  merak: 'Merak! Now Dubhe — the bright star just left of it.',
  notDubhe: 'Not that one: Dubhe is the bright star just left of Merak.',
  dubhe: 'Dubhe! The two of them point the way: follow the arrow left, to the bright star near the top left.',
  followArrow: 'Follow the arrow from Merak through Dubhe, to the left — the North Star is the bright star at its end.',
  polarisEarly: ['That’s the North Star! Now find it the star-watchers’ way: tap Merak, then Dubhe — they point to it.', 'That’s the North Star! Tap Dubhe first — Merak and Dubhe point to it.'],
  found: 'The North Star! It’s the end of the Little Dipper’s handle — join its stars from here.',
} as const;

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

/** A star's name as it's said in a line or written on the sky: Polaris without its ", the North Star" (code review round 2). */
export function shortName(p: Picture, id: string): string | null {
  return starName(p, id)?.replace(/, the North Star$/, '') ?? null;
}

/** One of the sky's others — drawn tiny (not the Big Dipper's bowl, drawn for the North Star's hunt). */
export const isTiny = (st: SkyStar) => st.extra && !st.id.endsWith('-g');

/** Where a star's name sits round it. */
export type NameSpot = 'below' | 'above' | 'right' | 'left' | 'below-right' | 'below-left' | 'above-right' | 'above-left';
export const NAME_SPOTS: readonly NameSpot[] = ['below', 'above', 'right', 'left', 'below-right', 'below-left', 'above-right', 'above-left'];
/** A name's box on the sky, in sky units (0–100). */
export interface NameBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Where each named star's name goes (UX and code review rounds 1 and 2:
 * names covered stars and each other, or ran off the sky): under it, over
 * it, beside it or at a corner — the first that's in the sky and covers
 * nothing, else the least bad: off the sky worst, then over a star of the
 * picture, then over a name already placed. Left to right, so a name never
 * jumps as others appear. `skyPx` is the sky's inner width; `width` measures
 * a name in px at `font`.
 */
export function nameSpots(
  stars: readonly SkyStar[],
  names: Readonly<Record<string, string>>,
  skyPx: number,
  font: number,
  width: (name: string) => number,
): Record<string, { spot: NameSpot; box: NameBox }> {
  const u = 100 / skyPx;
  const h = (font * 1.25 + 2) * u;
  const off = 8 * u;
  const overlap = (a: NameBox, b: NameBox) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const dots = stars.filter((o) => !isTiny(o)).map((o) => ({ id: o.id, box: { x0: o.x - 9 * u, x1: o.x + 9 * u, y0: o.y - 9 * u, y1: o.y + 9 * u } }));
  const placed: NameBox[] = [];
  const out: Record<string, { spot: NameSpot; box: NameBox }> = {};
  for (const st of [...stars].sort((a, b) => a.x - b.x || a.y - b.y)) {
    const name = names[st.id];
    if (!name) continue;
    const w = (width(name) + 8) * u;
    const box = (spot: NameSpot): NameBox => {
      const x0 = spot === 'below' || spot === 'above' ? st.x - w / 2 : spot.endsWith('left') ? st.x - off - w : st.x + off;
      const y0 = spot === 'right' || spot === 'left' ? st.y - h / 2 : spot.startsWith('above') ? st.y - off - h : st.y + off;
      return { x0, x1: x0 + w, y0, y1: y0 + h };
    };
    let best: { spot: NameSpot; box: NameBox; cost: number } | null = null;
    NAME_SPOTS.forEach((spot, k) => {
      const b = box(spot);
      const outside = Math.max(0, -b.x0) + Math.max(0, b.x1 - 100) + Math.max(0, -b.y0) + Math.max(0, b.y1 - 100);
      const onStars = dots.reduce((c, o) => c + (o.id === st.id ? 0 : overlap(b, o.box)), 0);
      const onNames = placed.reduce((c, o) => c + overlap(b, o), 0);
      const cost = outside * 1000 + onStars * 30 + onNames * 10 + k * 0.01;
      if (!best || cost < best.cost) best = { spot, box: b, cost };
    });
    out[st.id] = { spot: best!.spot, box: best!.box };
    placed.push(best!.box);
  }
  return out;
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
  return job.turn || job.view ? (p.turnedLooks ?? p.looks) : p.looks;
}

/** The job, as its ticket says it — with what the picture looks like, but for the strip over a phone's sky (it has the card). */
export function jobWords(job: Job, looks = true): string {
  const p = PICTURE_BY_ID[job.picture];
  const n = NUM[p.stars.length];
  // What it looks like, said on Expert too (UX review round 2: a reader never heard it; the card's turned to match the sky).
  const turnedLike = looks ? ` It looks like ${looksWords(job)}.` : '';
  if (job.latitude !== null) return `Read the North Star’s altitude for our latitude, then join the ${n} stars of ${p.called}.${turnedLike}`;
  const asked = job.find ? starCoords(job, job.find) : null;
  if (job.find && asked) return `Find ${shortName(p, job.find)} at ${coordsWords(asked)}, then join the ${n} stars of ${p.called}.${turnedLike}`;
  if (job.findNorth) return `First find the North Star: follow the Big Dipper’s two pointer stars. Then join the ${n} stars of ${p.called}.`;
  if (job.outline) return `Join the ${n} stars of ${p.called} along the dotted lines.`;
  // What it looks like, said too (UX review round 2: "the card shows its shape" — the card's a picture, hidden from a reader).
  const like = looks ? ` It looks like ${looksWords(job)}.` : '';
  if (job.turn) return `Join the ${n} stars of ${p.called} — the sky has turned, so it’s ${turnWords(job.turn)}.${like}`;
  return `Join the ${n} stars of ${p.called}.${like}`;
}

/**
 * After two stars are tapped: joined, already joined, or not a line of the
 * picture. Never scolded. Where to look: the card — or on Gentle, the dotted
 * lines (`outline`; UX review round 2).
 */
export function joinWords(p: Picture, a: string, b: string, done: boolean, outline = false, plain = false): string {
  const an = shortName(p, a);
  const bn = shortName(p, b);
  // Expert's plainly (§8.3; UX review round 1: "Caph to Schedar — joined!").
  const mark = plain ? '.' : '!';
  if (!an || !bn) return `That tiny dot isn’t part of ${p.called} — ${outline ? 'its stars are on the dotted lines' : 'its stars are bigger. Look at the card'}${mark}`;
  if (!isLine(p, a, b)) return `${an} and ${bn} are both in ${p.called}, but they aren’t joined. ${outline ? 'Follow a dotted line' : 'Look at the card again'}${mark}`;
  if (done) return `${an} and ${bn} are joined already.`;
  return `${an} to ${bn} — joined${mark}`;
}

/** What a finished picture teaches, for the reward: its note, and on Tricky how long its light took. */
export function learnedLine(job: Job, band: PlayBand): string {
  const p = PICTURE_BY_ID[job.picture];
  if (band === 'expert') return p.sky;
  if (band !== 'tricky') return p.note;
  const { star, years, about, atLeast } = p.far;
  return `${p.note} The light you see from ${star} left it ${atLeast ? 'at least ' : about ? 'about ' : ''}${years.toLocaleString('en-GB')} years ago.`;
}

/** How a star is said on the sky, by where it is: "a bright star near the top left"; one of the sky's others, "a tiny dot" (a "faint star" is the picture's). */
export function placeWords(x: number, y: number, mag: 1 | 2 | 3, extra = false): string {
  const v = y < 34 ? 'top' : y > 66 ? 'bottom' : 'middle';
  const h = x < 34 ? 'left' : x > 66 ? 'right' : 'middle';
  const where = v === 'middle' && h === 'middle' ? 'the middle' : v === 'middle' ? `the middle ${h}` : h === 'middle' ? `the ${v}` : `the ${v} ${h}`;
  return `${extra ? 'A tiny dot' : mag === 1 ? 'A bright star' : mag === 2 ? 'A star' : 'A faint star'} near ${where}`;
}

export { cap as capitalise };
