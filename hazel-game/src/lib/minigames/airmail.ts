import type { Band } from '../../content/minigames';

/**
 * 🐉 Ember Air Mail (docs/DESIGN-MINIGAMES.md §5.9): maps and places, with
 * Postmaster Pidge at Port Lantern's post office. A parcel comes with a clue;
 * the kid steers Ember across a map one square at a time with compass
 * buttons — the route drawn as she goes — and delivers it. Gentle: the bay's
 * map, four directions, the place to go shown as a picture. Medium: the
 * town's map, its squares named by a letter and a number (C5), eight
 * directions, the house found from its square or from a landmark ("just
 * north-east of the pond"). Tricky: a blocky map of the real world —
 * continents and oceans, north and south of the equator — then how far Ember
 * flew, by the map's scale. Three parcels a round; each kind of parcel is a
 * stamp in Pidge's album. Pure: the maps, the jobs, the moves and the words.
 */

/** A square of a map: `x` from the west edge, `y` from the north edge (north is up). */
export interface Cell {
  x: number;
  y: number;
}

export type Dir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/** Each direction's step, and its word. */
export const STEP: Record<Dir, readonly [number, number]> = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
export const DIR_WORDS: Record<Dir, string> = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };

/** The compass buttons each band has: four on Gentle and Tricky (a world map's squares are counted for its scale), eight on Medium. */
export const BAND_DIRS: Record<Band, readonly Dir[]> = {
  gentle: ['N', 'E', 'S', 'W'],
  medium: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  tricky: ['N', 'E', 'S', 'W'],
};

// ——— The stamps ———

export const STAMP_IDS = ['letter', 'parcel', 'basket', 'seeds', 'map', 'lantern', 'postcard', 'shell', 'globe'] as const;
export type StampId = (typeof STAMP_IDS)[number];

/** A kind of post, and its stamp in Pidge's album: a true thing about maps and the world. */
export interface Stamp {
  id: StampId;
  name: string;
  emoji: string;
  note: string;
}

export const STAMPS: readonly Stamp[] = [
  { id: 'letter', name: 'Letter', emoji: '✉️', note: 'A compass shows four main directions: north, east, south and west. Its needle always swings round to point north.' },
  { id: 'parcel', name: 'Parcel', emoji: '📦', note: 'Most maps put north at the top, so east is on the right and west on the left. Round the compass: Never Eat Soggy Waffles — N, E, S, W.' },
  { id: 'basket', name: 'Picnic basket', emoji: '🧺', note: 'The Sun rises in the east and sets in the west, so it can tell you which way you’re facing.' },
  { id: 'seeds', name: 'Seed packet', emoji: '🌱', note: 'Between the four main directions are four more: north-east, south-east, south-west and north-west — eight in all.' },
  { id: 'map', name: 'Rolled-up map', emoji: '🗺️', note: 'A grid square is named by its letter along the bottom, then its number up the side — along the corridor, then up the stairs!' },
  { id: 'lantern', name: 'Paper lantern', emoji: '🏮', note: 'Maps draw real things as little pictures called symbols, and the map’s key says what each one means.' },
  { id: 'postcard', name: 'Postcard', emoji: '🏞️', note: 'There are seven continents: Asia (the biggest), Africa, North America, South America, Antarctica, Europe and Australia.' },
  { id: 'shell', name: 'Sea shell', emoji: '🐚', note: 'There are five oceans: the Pacific, the Atlantic, the Indian, the Southern and the Arctic. Together they cover most of the Earth.' },
  { id: 'globe', name: 'Little globe', emoji: '🌐', note: 'The equator runs round the middle of the Earth. North of it is the northern hemisphere, south of it the southern — where summer comes in December.' },
];

export const STAMP_BY_ID = Object.fromEntries(STAMPS.map((s) => [s.id, s])) as Record<StampId, Stamp>;

/** The stamps each band's post brings (pages come from every band, §3.3). */
export const BAND_STAMPS: Record<Band, readonly StampId[]> = {
  gentle: ['letter', 'parcel', 'basket'],
  medium: ['seeds', 'map', 'lantern'],
  tricky: ['postcard', 'shell', 'globe'],
};

export const JOBS_PER_ROUND = 3;

// ——— The bay (Gentle) and the town (Medium) ———

export const PLACE_IDS = ['castle', 'woods', 'lighthouse', 'pond', 'farm', 'harbour', 'market', 'bridge', 'post'] as const;
export type PlaceId = (typeof PLACE_IDS)[number];

export interface Place {
  id: PlaceId;
  name: string;
  emoji: string;
}

export const PLACES: Record<PlaceId, Place> = {
  castle: { id: 'castle', name: 'castle', emoji: '🏰' },
  woods: { id: 'woods', name: 'woods', emoji: '🌲' },
  lighthouse: { id: 'lighthouse', name: 'lighthouse', emoji: '🗼' },
  pond: { id: 'pond', name: 'duck pond', emoji: '🦆' },
  farm: { id: 'farm', name: 'farm', emoji: '🌾' },
  harbour: { id: 'harbour', name: 'harbour', emoji: '⚓' },
  market: { id: 'market', name: 'market', emoji: '🏪' },
  bridge: { id: 'bridge', name: 'bridge', emoji: '🌉' },
  post: { id: 'post', name: 'post office', emoji: '🏤' },
};

/** A map drawn in squares: its sea (`~`) and land (`.`) row by row from the north, and what's where. */
export interface GridMap {
  w: number;
  h: number;
  sea: readonly string[];
  places: readonly (Cell & { place: PlaceId })[];
  houses: readonly Cell[];
  /** Where Ember sets off: the post office. */
  start: Cell;
}

/** The bay round Port Lantern (Gentle): the post office in the middle, the places round it. */
export const BAY: GridMap = {
  w: 5,
  h: 5,
  sea: ['...~~', '....~', '....~', '...~~', '..~~~'],
  places: [
    { x: 0, y: 0, place: 'castle' },
    { x: 2, y: 0, place: 'woods' },
    { x: 4, y: 1, place: 'lighthouse' },
    { x: 0, y: 2, place: 'pond' },
    { x: 2, y: 2, place: 'post' },
    { x: 1, y: 4, place: 'farm' },
    { x: 3, y: 4, place: 'harbour' },
  ],
  houses: [],
  start: { x: 2, y: 2 },
};

/** Port Lantern town (Medium): squares A–F along, 1–6 up; houses to deliver to among its landmarks. */
export const TOWN: GridMap = {
  w: 6,
  h: 6,
  sea: ['.....~', '.....~', '......', '......', '~.....', '~~....'],
  places: [
    { x: 0, y: 0, place: 'castle' },
    { x: 3, y: 0, place: 'woods' },
    { x: 5, y: 1, place: 'lighthouse' },
    { x: 1, y: 2, place: 'pond' },
    { x: 3, y: 3, place: 'post' },
    { x: 4, y: 3, place: 'market' },
    { x: 2, y: 4, place: 'bridge' },
    { x: 5, y: 5, place: 'farm' },
    { x: 0, y: 5, place: 'harbour' },
  ],
  houses: [
    { x: 1, y: 0 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
    { x: 2, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 1, y: 4 },
  ],
  start: { x: 3, y: 3 },
};

/** A town square's name: its letter along (A from the west), its number up (1 at the south). */
export function gridRef(c: Cell, map: GridMap = TOWN): string {
  return `${'ABCDEFGH'[c.x]}${map.h - c.y}`;
}

/** What's on a map's square: a place, a house, or nothing. */
export function placeAt(map: GridMap, c: Cell): PlaceId | 'house' | null {
  const p = map.places.find((q) => q.x === c.x && q.y === c.y);
  if (p) return p.place;
  return map.houses.some((q) => q.x === c.x && q.y === c.y) ? 'house' : null;
}

/**
 * Each town house, and the landmark it's just beside — so a clue can find it
 * either way: by its square, or "just north-east of the duck pond".
 */
export const TOWN_CLUES: readonly { house: Cell; from: PlaceId; dir: Dir }[] = [
  { house: { x: 1, y: 0 }, from: 'castle', dir: 'E' },
  { house: { x: 2, y: 1 }, from: 'pond', dir: 'NE' },
  { house: { x: 3, y: 1 }, from: 'woods', dir: 'S' },
  { house: { x: 4, y: 1 }, from: 'lighthouse', dir: 'W' },
  { house: { x: 2, y: 3 }, from: 'bridge', dir: 'N' },
  { house: { x: 3, y: 4 }, from: 'market', dir: 'SW' },
  { house: { x: 4, y: 4 }, from: 'farm', dir: 'NW' },
  { house: { x: 1, y: 4 }, from: 'harbour', dir: 'NE' },
];

// ——— The world (Tricky) ———

export const REGION_IDS = ['north-america', 'south-america', 'europe', 'africa', 'asia', 'australia', 'antarctica', 'pacific', 'atlantic', 'indian', 'arctic'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export interface Region {
  id: RegionId;
  name: string;
  ocean: boolean;
  /** Its letter on `WORLD`. */
  code: string;
  /** Where a parcel for it is addressed. */
  clue: string;
  /** A true thing about it, for the fact card. */
  fact: string;
}

export const REGIONS: readonly Region[] = [
  { id: 'north-america', name: 'North America', ocean: false, code: 'N', clue: 'to the continent west of Europe, across the Atlantic and north of the equator', fact: 'North America runs from the icy Arctic in the north to the warm tropics in the south.' },
  { id: 'south-america', name: 'South America', ocean: false, code: 'S', clue: 'to the continent of the Amazon rainforest, most of it south of the equator', fact: 'The Amazon rainforest in South America is the biggest rainforest on Earth.' },
  { id: 'europe', name: 'Europe', ocean: false, code: 'E', clue: 'home to Europe', fact: 'Europe is one of the smallest continents, but it has more than forty countries.' },
  { id: 'africa', name: 'Africa', ocean: false, code: 'F', clue: 'to the continent just south of Europe, with the equator right across its middle', fact: 'The equator runs right across Africa, and the Sahara there is the biggest hot desert in the world.' },
  { id: 'asia', name: 'Asia', ocean: false, code: 'A', clue: 'to the biggest continent of all, east of Europe', fact: 'Asia is the biggest continent, and more than half of all the people in the world live there.' },
  { id: 'australia', name: 'Australia', ocean: false, code: 'U', clue: 'to the smallest continent, south of the equator, where kangaroos live', fact: 'Australia is the smallest continent and a whole country too. Wild kangaroos live nowhere else.' },
  {
    id: 'antarctica',
    name: 'Antarctica',
    ocean: false,
    code: 'X',
    clue: 'to the icy continent at the very south of the world',
    fact: 'Antarctica is the coldest place on Earth, nearly all ice. On a flat map it looks huge and wide; on a globe it’s a round cap at the bottom.',
  },
  { id: 'pacific', name: 'the Pacific Ocean', ocean: true, code: 'p', clue: 'to a ship on the biggest ocean, between Asia and the Americas', fact: 'The Pacific is the biggest and deepest ocean: all the land on Earth would fit into it.' },
  { id: 'atlantic', name: 'the Atlantic Ocean', ocean: true, code: 'a', clue: 'to a ship on the ocean between Europe and North America', fact: 'The Atlantic is the second-biggest ocean, between the Americas on one side and Europe and Africa on the other.' },
  { id: 'indian', name: 'the Indian Ocean', ocean: true, code: 'i', clue: 'to a ship on the ocean between Africa and Australia', fact: 'The Indian Ocean is the warmest ocean in the world.' },
  { id: 'arctic', name: 'the Arctic Ocean', ocean: true, code: 'r', clue: 'to a ship on the frozen ocean at the very north of the world', fact: 'The Arctic is the smallest ocean, and much of it is frozen all year round.' },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;
const REGION_BY_CODE = Object.fromEntries(REGIONS.map((r) => [r.code, r])) as Record<string, Region>;

/**
 * The world in squares of 30° by 30° (12 across from 180° west, 6 down from
 * the North Pole): each square marked by what's most of it. The equator runs
 * between the third row and the fourth. Rough on purpose — a first map.
 */
export const WORLD: readonly string[] = ['rNNNNrEAAAAA', 'ppNNaaEAAAAp', 'ppNNaFFAAApp', 'pppSSaFFiiUp', 'pppSaaaiiiUp', 'XXXXXXXXXXXX'];
export const WORLD_W = 12;
export const WORLD_H = 6;
/** Rows above it are north of the equator. */
export const EQUATOR_ROW = 3;
/** The map's scale: each square is about this far across (km). */
export const KM_PER_SQUARE = 3000;
/** Where the world's post sets off: Europe. */
export const WORLD_START: Cell = { x: 6, y: 1 };

/** The continent or ocean a world square shows. */
export function regionAt(c: Cell): Region {
  return REGION_BY_CODE[WORLD[c.y][c.x]];
}

// ——— The jobs ———

export type Job =
  | { band: 'gentle'; stamp: StampId; map: 'bay'; to: PlaceId }
  | { band: 'medium'; stamp: StampId; map: 'town'; to: Cell; by: 'square' | 'landmark' }
  | { band: 'tricky'; stamp: StampId; map: 'world'; to: RegionId };

/** The places Gentle's post goes to, and the order the regions and houses come up. */
const BAY_TO: readonly PlaceId[] = ['lighthouse', 'farm', 'castle', 'harbour', 'woods', 'pond'];
const WORLD_TO: readonly RegionId[] = ['antarctica', 'australia', 'atlantic', 'africa', 'pacific', 'south-america', 'arctic', 'asia', 'indian', 'north-america'];

/** Which stamps come up in a round: those not in the album first, then the rest in turn. */
export function roundQueue(band: Band, known: (id: StampId) => boolean, round: number): StampId[] {
  const can = BAND_STAMPS[band];
  const start = (round * JOBS_PER_ROUND) % can.length;
  const turn = [...can.slice(start), ...can.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** The `i`th parcel of a round. */
export function jobFor(band: Band, round: number, i: number, queue?: readonly StampId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  const stamp = q[i % q.length];
  const slot = round * JOBS_PER_ROUND + i;
  if (band === 'gentle') return { band, stamp, map: 'bay', to: BAY_TO[slot % BAY_TO.length] };
  if (band === 'medium') {
    // Round the houses in a stride, so a round's three are apart; a landmark, then a square, in turn — swapped each
    // time round the houses, so each house comes both ways.
    const clue = TOWN_CLUES[(slot * 3) % TOWN_CLUES.length];
    const by = (slot + Math.floor(slot / TOWN_CLUES.length)) % 2 === 0 ? 'landmark' : 'square';
    return { band, stamp, map: 'town', to: clue.house, by };
  }
  return { band, stamp, map: 'world', to: WORLD_TO[slot % WORLD_TO.length] };
}

/** The map a job's flown on: its size and where Ember starts. */
export function mapOf(job: Job): { w: number; h: number; start: Cell; wraps: boolean } {
  if (job.map === 'world') return { w: WORLD_W, h: WORLD_H, start: WORLD_START, wraps: true };
  const m = job.map === 'bay' ? BAY : TOWN;
  return { w: m.w, h: m.h, start: m.start, wraps: false };
}

/**
 * One square on: the square Ember reaches, or null off the map's edge. The
 * world's east and west edges join (it's round): flying west off its edge
 * comes back from the east.
 */
export function move(job: Job, at: Cell, dir: Dir): Cell | null {
  const { w, h, wraps } = mapOf(job);
  const [dx, dy] = STEP[dir];
  const y = at.y + dy;
  let x = at.x + dx;
  if (y < 0 || y >= h) return null;
  if (x < 0 || x >= w) {
    if (!wraps) return null;
    x = (x + w) % w;
  }
  return { x, y };
}

/** The squares a delivery may land on. */
export function targets(job: Job): Cell[] {
  if (job.map === 'bay') return BAY.places.filter((p) => p.place === job.to).map(({ x, y }) => ({ x, y }));
  if (job.map === 'town') return [job.to];
  const out: Cell[] = [];
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) if (WORLD[y][x] === REGION_BY_ID[job.to].code) out.push({ x, y });
  return out;
}

export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

/** Is Ember where the parcel's going? */
export function delivered(job: Job, at: Cell): boolean {
  return targets(job).some((t) => sameCell(t, at));
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const squares = (n: number) => `${n} square${n === 1 ? '' : 's'}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** How far one square is from another, in compass words: "2 squares north and 1 east". */
export function relWords(from: Cell, to: Cell, wraps = false): string {
  let dx = to.x - from.x;
  if (wraps && Math.abs(dx) > WORLD_W / 2) dx -= Math.sign(dx) * WORLD_W;
  const dy = to.y - from.y;
  const ns = dy ? `${squares(Math.abs(dy))} ${dy < 0 ? 'north' : 'south'}` : '';
  const ew = dx ? `${dy ? Math.abs(dx) : squares(Math.abs(dx))} ${dx > 0 ? 'east' : 'west'}` : '';
  return ns && ew ? `${ns} and ${ew}` : ns || ew;
}

/** The target square nearest to Ember (the world's continents are many squares). */
function nearest(job: Job, at: Cell): Cell {
  const { wraps } = mapOf(job);
  const d = (c: Cell) => {
    const dx = Math.abs(c.x - at.x);
    return Math.max(wraps ? Math.min(dx, WORLD_W - dx) : dx, Math.abs(c.y - at.y)) * 10 + (wraps ? Math.min(dx, WORLD_W - dx) : dx) + Math.abs(c.y - at.y);
  };
  return targets(job).reduce((a, b) => (d(b) < d(a) ? b : a));
}

/** Where a parcel's going, said: "the castle", "the house at C5", "Australia". */
export function destWords(job: Job): string {
  if (job.map === 'bay') return `the ${PLACES[job.to].name}`;
  if (job.map === 'town') {
    if (job.by === 'square') return `the house at ${gridRef(job.to)}`;
    const c = TOWN_CLUES.find((t) => sameCell(t.house, job.to))!;
    return `the house just ${DIR_WORDS[c.dir]} of the ${PLACES[c.from].name}`;
  }
  return REGION_BY_ID[job.to].name;
}

/** What's on the parcel — the clue. */
export function clueWords(job: Job): string {
  const s = STAMP_BY_ID[job.stamp].name.toLowerCase();
  if (job.map === 'world') return `A ${s} ${REGION_BY_ID[job.to].clue}.`;
  return `A ${s} for ${destWords(job)}.`;
}

/** Where Ember is, said: "by the duck pond", "over C4", "over the Pacific Ocean". */
export function whereWords(job: Job, at: Cell): string {
  if (job.map === 'world') return `over ${regionAt(at).name}`;
  const map = job.map === 'bay' ? BAY : TOWN;
  const here = placeAt(map, at);
  const ref = job.map === 'town' ? `over ${gridRef(at)}` : '';
  const what = here === 'house' ? 'a house' : here ? `the ${PLACES[here].name}` : '';
  if (job.map === 'bay') return what ? `at ${what}` : BAY.sea[at.y][at.x] === '~' ? 'over the sea' : 'over the fields';
  return what ? `${ref}, at ${what}` : ref;
}

/**
 * A delivery to the wrong square: where Ember is, and which way to go —
 * short, to fit beside the compass on a phone (bench). Never scolded.
 */
export function missWords(job: Job, at: Cell): string {
  const to = nearest(job, at);
  const way = relWords(at, to, mapOf(job).wraps);
  if (job.map === 'world') return `That’s ${regionAt(at).name}. ${cap(REGION_BY_ID[job.to].name)} is ${way}.`;
  if (job.map === 'bay') {
    const here = placeAt(BAY, at);
    return `${here && here !== 'house' ? `That’s the ${PLACES[here].name}` : 'Nobody’s waiting here'}. The ${PLACES[job.to].name} is ${way}.`;
  }
  return `That’s ${gridRef(at)}. The house is ${way}.`;
}

/** Ember's route, said: "2 east, then 1 north" — each run of one direction once. */
export function routeWords(route: readonly Dir[]): string {
  const runs: [Dir, number][] = [];
  for (const d of route) {
    const last = runs[runs.length - 1];
    if (last && last[0] === d) last[1]++;
    else runs.push([d, 1]);
  }
  return runs.map(([d, n]) => `${n} ${DIR_WORDS[d]}`).join(', then ');
}

/** Pidge's opening for a parcel: the clue, and how to find where it's going. */
export function openingWords(job: Job): string {
  if (job.map === 'bay') return `${clueWords(job)} Can you see it on the map? Steer Ember there with the compass, then deliver it!`;
  if (job.map === 'town') {
    if (job.by === 'square') {
      const ref = gridRef(job.to);
      return `${clueWords(job)} That’s ${ref[0]} along the bottom, ${ref.slice(1)} up the side. Steer Ember there!`;
    }
    const c = TOWN_CLUES.find((t) => sameCell(t.house, job.to))!;
    return `${clueWords(job)} Find the ${PLACES[c.from].name} first, then look ${DIR_WORDS[c.dir]} of it.`;
  }
  return `${clueWords(job)} Where in the world is that? Steer Ember there!`;
}

/** The ticket: the job, and how to play it. */
export function jobWords(job: Job): string {
  if (job.map === 'bay') return `Fly the ${STAMP_BY_ID[job.stamp].name.toLowerCase()} to the ${PLACES[job.to].name}: steer Ember north, east, south or west.`;
  if (job.map === 'town') return `Fly it to ${destWords(job)}. A square is named by its letter along, then its number up — like C5.`;
  return `Fly it ${REGION_BY_ID[job.to].clue}. North is up; the equator runs across the middle.`;
}

/** Tricky's scale question: how far Ember flew, three choices (km), smallest first. */
export function farChoices(flown: number): number[] {
  const n = Math.max(1, flown);
  const others = [n + 2, n > 2 ? n - 2 : n + 4];
  return [n, ...others].map((k) => k * KM_PER_SQUARE).sort((a, b) => a - b);
}

export const kmWords = (km: number) => `${km.toLocaleString('en-GB')} km`;

/** What a delivery teaches, for the fact card and the reward. */
export function learnedLine(job: Job, route: readonly Dir[]): string {
  const stamp = STAMP_BY_ID[job.stamp];
  // The world's: its place, and how far (its stamp's note is in the album — with it, the card was too long for a phone).
  if (job.map === 'world') return `${REGION_BY_ID[job.to].fact} Ember flew ${NUM[route.length] ?? route.length} ${route.length === 1 ? 'square' : 'squares'} — about ${kmWords(route.length * KM_PER_SQUARE)}.`;
  const way = route.length ? `Ember flew ${routeWords(route)}.` : '';
  if (job.map === 'town') {
    const ref = gridRef(job.to);
    return `The house was at ${ref}: ${ref[0]} along, ${ref.slice(1)} up. ${way} ${stamp.note}`;
  }
  return `To the ${PLACES[job.to].name}: ${way} ${stamp.note}`;
}

export { cap as capitalise };
