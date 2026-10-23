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
  { id: 'shell', name: 'Sea shell', emoji: '🐚', note: 'There are five oceans: the Pacific, the Atlantic, the Indian, the Southern (all round Antarctica) and the Arctic. Together they cover most of the Earth.' },
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
  /** Its picture on the map — the lighthouse and the bridge are drawn (no emoji is one: UX review round 1). */
  emoji: string;
}

export const PLACES: Record<PlaceId, Place> = {
  castle: { id: 'castle', name: 'castle', emoji: '🏰' },
  woods: { id: 'woods', name: 'woods', emoji: '🌲' },
  lighthouse: { id: 'lighthouse', name: 'lighthouse', emoji: '🗼' },
  pond: { id: 'pond', name: 'duck pond', emoji: '🦆' },
  farm: { id: 'farm', name: 'farm', emoji: '🌾' },
  harbour: { id: 'harbour', name: 'harbour', emoji: '⚓' },
  market: { id: 'market', name: 'market', emoji: '🛒' },
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
  /** Where it is on the map, said after a first wrong delivery (UX review round 1: the first said the way, so the map was never read). */
  spot: string;
  /** A true thing about it, for the fact card. */
  fact: string;
}

export const REGIONS: readonly Region[] = [
  { id: 'north-america', name: 'North America', ocean: false, code: 'N', clue: 'to the continent west of Europe, across the Atlantic and north of the equator', spot: 'at the top on the left, across the Atlantic', fact: 'North America runs from the icy Arctic in the north to the warm tropics in the south.' },
  { id: 'south-america', name: 'South America', ocean: false, code: 'S', clue: 'to the continent of the Amazon rainforest, most of it south of the equator', spot: 'under North America, across the equator', fact: 'The Amazon rainforest in South America is the biggest rainforest on Earth.' },
  { id: 'europe', name: 'Europe', ocean: false, code: 'E', clue: 'to the small continent the post sets off from', spot: 'in the middle at the top, where Ember sets off', fact: 'Europe is one of the smallest continents, but it has more than forty countries.' },
  { id: 'africa', name: 'Africa', ocean: false, code: 'F', clue: 'to the continent just south of Europe, with the equator right across its middle', spot: 'just under Europe, with the equator across it', fact: 'The equator runs right across Africa, and the Sahara there is the biggest hot desert in the world.' },
  { id: 'asia', name: 'Asia', ocean: false, code: 'A', clue: 'to the biggest continent of all, east of Europe', spot: 'the big green one, at the top on the right', fact: 'Asia is the biggest continent, and more than half of all the people in the world live there.' },
  { id: 'australia', name: 'Australia', ocean: false, code: 'U', clue: 'to the smallest continent, south of the equator, where kangaroos live', spot: 'low down on the right, under Asia', fact: 'Australia is the smallest continent and a whole country too. Wild koalas live nowhere else.' },
  {
    id: 'antarctica',
    name: 'Antarctica',
    ocean: false,
    code: 'X',
    clue: 'to the icy continent at the very south of the world',
    spot: 'the icy one, all along the bottom',
    fact: 'Antarctica is the coldest place on Earth, nearly all ice. On a flat map it looks huge and wide; on a globe it’s a round cap at the bottom.',
  },
  { id: 'pacific', name: 'the Pacific Ocean', ocean: true, code: 'p', clue: 'to a ship on the biggest ocean, between Asia and the Americas', spot: 'the big ocean at both edges of the map — the left and the right', fact: 'The Pacific is the biggest and deepest ocean: all the land on Earth would fit into it.' },
  { id: 'atlantic', name: 'the Atlantic Ocean', ocean: true, code: 'a', clue: 'to a ship on the ocean between Europe and North America', spot: 'the ocean between the Americas and Europe and Africa', fact: 'The Atlantic is the second-biggest ocean, between the Americas on one side and Europe and Africa on the other.' },
  { id: 'indian', name: 'the Indian Ocean', ocean: true, code: 'i', clue: 'to a ship on the ocean between Africa and Australia', spot: 'the ocean under Asia, between Africa and Australia', fact: 'The Indian Ocean is the warmest ocean in the world.' },
  { id: 'arctic', name: 'the Arctic Ocean', ocean: true, code: 'r', clue: 'to a ship on the frozen ocean at the very top of the map, north-west of Europe', spot: 'the pale ice at the very top, by Europe and on the far left', fact: 'The Arctic is the smallest ocean, and much of it is frozen all year round.' },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;
const REGION_BY_CODE: Partial<Record<string, Region>> = Object.fromEntries(REGIONS.map((r) => [r.code, r]));

/**
 * The world in squares of 30° by 30° (12 across from 180° west, 6 down from
 * the North Pole), drawn so each continent and ocean has a shape a kid knows
 * — rough on purpose, a first map, so a square isn't always most of what
 * it's marked (code review round 1: north of Moscow was Asia, the Horn of
 * Africa too). The equator runs between the third row and the fourth.
 */
export const WORLD: readonly string[] = ['rNNNNrEEAAAA', 'ppNNaaEAAAAp', 'ppNNaaFFAApp', 'pppSSaFFiiUp', 'pppSaaaiiiUp', 'XXXXXXXXXXXX'];
export const WORLD_W = 12;
export const WORLD_H = 6;
/** Rows above it are north of the equator. */
export const EQUATOR_ROW = 3;
/**
 * The map's scale: each square counts as about this far (km) — true top to
 * bottom, and across near the equator; a flat map stretches the far north and
 * south across, so it's said as the map's scale (code review round 1).
 */
export const KM_PER_SQUARE = 3000;
/** Where the world's post sets off: Europe. */
export const WORLD_START: Cell = { x: 6, y: 1 };

/** The continent or ocean a world square shows. */
export function regionAt(c: Cell): Region {
  const r = REGION_BY_CODE[WORLD[c.y]?.[c.x] ?? ''];
  if (!r) throw new Error(`No region at ${c.x},${c.y}`);
  return r;
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

/** From one square to another: across (east +, the short way round the world) and down (south +). */
function offset(from: Cell, to: Cell, wraps: boolean): [number, number] {
  let dx = to.x - from.x;
  if (wraps && Math.abs(dx) > WORLD_W / 2) dx -= Math.sign(dx) * WORLD_W;
  return [dx, to.y - from.y];
}

/**
 * How far one square is from another, in compass words: "2 squares north and
 * 1 east" — with eight directions, straight along a diagonal "2 squares
 * north-east" (code review round 1: the pond's clue said north-east, the hint
 * "north and east").
 */
export function relWords(from: Cell, to: Cell, wraps = false, diagonals = false): string {
  const [dx, dy] = offset(from, to, wraps);
  if (diagonals && dx && Math.abs(dx) === Math.abs(dy)) return `${squares(Math.abs(dx))} ${dy < 0 ? 'north' : 'south'}-${dx > 0 ? 'east' : 'west'}`;
  const ns = dy ? `${squares(Math.abs(dy))} ${dy < 0 ? 'north' : 'south'}` : '';
  const ew = dx ? `${dy ? Math.abs(dx) : squares(Math.abs(dx))} ${dx > 0 ? 'east' : 'west'}` : '';
  return ns && ew ? `${ns} and ${ew}` : ns || ew;
}

/**
 * The fewest moves from one square to another with a band's compass: four
 * directions count across and down; eight, the longer of the two.
 */
export function movesBetween(job: Job, from: Cell, to: Cell): number {
  const [dx, dy] = offset(from, to, mapOf(job).wraps).map(Math.abs);
  return BAND_DIRS[job.band].length === 8 ? Math.max(dx, dy) : dx + dy;
}

/** The target square fewest moves from Ember (the world's continents are many squares) — counted as the band moves (code review round 1: on the world, four directions, it counted diagonals). */
function nearest(job: Job, at: Cell): Cell {
  const d = (c: Cell) => movesBetween(job, at, c) * 100 + Math.abs(c.x - at.x) + Math.abs(c.y - at.y);
  return targets(job).reduce((a, b) => (d(b) < d(a) ? b : a));
}

/** A town house's landmark (none: a house found only by its square). */
export function landmarkOf(job: Job): (typeof TOWN_CLUES)[number] | null {
  if (job.map !== 'town' || job.by !== 'landmark') return null;
  return TOWN_CLUES.find((t) => sameCell(t.house, job.to)) ?? null;
}

/** Where a parcel's going, said: "the castle", "the house at C5", "Australia". */
export function destWords(job: Job): string {
  if (job.map === 'bay') return `the ${PLACES[job.to].name}`;
  if (job.map === 'town') {
    const c = landmarkOf(job);
    return c ? `the house just ${DIR_WORDS[c.dir]} of the ${PLACES[c.from].name}` : `the house at ${gridRef(job.to)}`;
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

/** How to find a town house: by its square, or from its landmark. */
function howWords(job: Job & { map: 'town' }): string {
  const c = landmarkOf(job);
  if (c) return `Find the ${PLACES[c.from].name} first, then look ${DIR_WORDS[c.dir]} of it.`;
  const ref = gridRef(job.to);
  return `${ref} is ${ref[0]} along the bottom, then ${ref.slice(1)} up the side.`;
}

/**
 * A delivery to the wrong square (`misses`: this parcel's, this one counted):
 * where Ember is, and — the first time on the town and the world — how to
 * find the place on the map; from the second, which way to go (UX review
 * round 1: the first said the way, so the map need never be read). Gentle's
 * lesson is the way, so it says it at once. Short, to fit beside the compass
 * on a phone (bench). Never scolded.
 */
export function missWords(job: Job, at: Cell, misses = 2): string {
  const to = nearest(job, at);
  const way = relWords(at, to, mapOf(job).wraps, BAND_DIRS[job.band].length === 8);
  if (job.map === 'world') {
    const r = REGION_BY_ID[job.to];
    return misses < 2 ? `That’s ${regionAt(at).name}. ${cap(r.name)} is ${r.spot} — find its name on the map.` : `That’s ${regionAt(at).name}. ${cap(r.name)} is ${way}.`;
  }
  if (job.map === 'bay') {
    const here = placeAt(BAY, at);
    return `${here && here !== 'house' ? `That’s the ${PLACES[here].name}` : 'Nobody’s waiting here'}. The ${PLACES[job.to].name} is ${way}.`;
  }
  return misses < 2 ? `That’s ${gridRef(at)}. ${howWords(job)}` : `That’s ${gridRef(at)}. The house is ${way}.`;
}

/**
 * Ember's route, said: "1 square north, then 2 squares east" — each run of one
 * direction once; past three runs, just how many squares (code review round 1:
 * a wandering route made a card too long for a phone).
 */
export function routeWords(route: readonly Dir[]): string {
  const runs: [Dir, number][] = [];
  for (const d of route) {
    const last = runs[runs.length - 1];
    if (last && last[0] === d) last[1]++;
    else runs.push([d, 1]);
  }
  if (runs.length > 3) return squares(route.length);
  return runs.map(([d, n], k) => `${k ? n : squares(n)} ${DIR_WORDS[d]}`).join(', then ');
}

/** Pidge's opening for a parcel: the clue, and how to find where it's going. */
export function openingWords(job: Job): string {
  if (job.map === 'bay') return `${clueWords(job)} Can you see it on the map? Steer Ember there with the compass, then deliver it!`;
  if (job.map === 'town') return `${clueWords(job)} ${howWords(job)} Steer Ember there!`;
  return `${clueWords(job)} Where in the world is that? Steer Ember there!`;
}

/**
 * For a reader, where the parcel's going (the map's squares are pictures, so
 * only a wrong delivery said it: code review round 1): on the bay, which way
 * from Ember; on the town, the landmark's square (a square's in the clue); on
 * the world, where it is on the map.
 */
export function targetWords(job: Job, at: Cell): string {
  if (job.map === 'bay') return delivered(job, at) ? `The ${PLACES[job.to].name} is here.` : `The ${PLACES[job.to].name} is ${relWords(at, nearest(job, at))}.`;
  if (job.map === 'town') {
    const c = landmarkOf(job);
    const lm = c && TOWN.places.find((p) => p.place === c.from);
    return lm && c ? `The ${PLACES[c.from].name} is at ${gridRef(lm)}.` : '';
  }
  const r = REGION_BY_ID[job.to];
  return `${cap(r.name)} is ${r.spot}.`;
}

/**
 * How to find where the parcel's going, as the step's card says it till the
 * first move (UX review round 1: on a phone, Pidge's "E along the bottom" was
 * below the fold).
 */
export function howToFind(job: Job): string {
  if (job.map === 'bay') return `Find the ${PLACES[job.to].name}’s picture on the map, then steer Ember there.`;
  if (job.map === 'town') return howWords(job);
  return `Find ${REGION_BY_ID[job.to].name} on the map: north is up, the equator across the middle.`;
}

/** The ticket: the job, and how to play it. */
export function jobWords(job: Job): string {
  if (job.map === 'bay') return `Fly the ${STAMP_BY_ID[job.stamp].name.toLowerCase()} to the ${PLACES[job.to].name}: steer Ember north, east, south or west.`;
  if (job.map === 'town') return `Fly it to ${destWords(job)}. A square is named by its letter along, then its number up — like C5.`;
  return `Fly it ${REGION_BY_ID[job.to].clue}. North is up; the equator runs across the middle.`;
}

/**
 * Tricky's scale question: about how far, for `n` squares — three choices (km),
 * smallest first, the right one first, in the middle or last by the parcel
 * (`slot`), so where it sits says nothing (code review and UX review round 1:
 * always the middle, or first).
 */
export function farChoices(n: number, slot = 0): number[] {
  const k = Math.max(1, n);
  // Where the right one goes: as the slot says, as far as squares above none allow.
  const at = Math.min(slot % 3, k - 1);
  const others = at === 0 ? [k + 1, k + 2] : at === 1 ? [k - 1, k + 1] : [k - 2, k - 1];
  return [k, ...others].map((m) => m * KM_PER_SQUARE).sort((a, b) => a - b);
}

export const kmWords = (km: number) => `${km.toLocaleString('en-GB')} km`;

/**
 * How far a world parcel went: the fewest squares from where the post set off
 * to where it was delivered — the distance between the places, whichever way
 * Ember flew (UX review round 1: a wandering route was asked as its length,
 * and taught as how far apart they are).
 */
export const squaresAway = (job: Job, at: Cell) => movesBetween(job, mapOf(job).start, at);

/** What a delivery teaches, for the fact card and the reward (`at`: where it was delivered). */
export function learnedLine(job: Job, route: readonly Dir[], at: Cell): string {
  const stamp = STAMP_BY_ID[job.stamp];
  // The world's: its place, and how far (its stamp's note is in the album — with it, the card was too long for a phone).
  if (job.map === 'world') {
    const n = squaresAway(job, at);
    return `${REGION_BY_ID[job.to].fact} From Europe it’s ${NUM[n] ?? n} ${n === 1 ? 'square' : 'squares'} — about ${kmWords(n * KM_PER_SQUARE)} by the map’s scale.`;
  }
  const way = route.length ? `Ember flew ${routeWords(route)}.` : '';
  if (job.map === 'town') {
    const ref = gridRef(job.to);
    return `The house was at ${ref}: ${ref[0]} along, ${ref.slice(1)} up. ${way} ${stamp.note}`;
  }
  return `${way} ${stamp.note}`.trim();
}

export { cap as capitalise };
