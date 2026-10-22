import type { Band } from '../../content/minigames';

/**
 * 🌳 Ringwood's Rings (docs/DESIGN-MINIGAMES.md §5.7): reading tree rings,
 * with Old Ringwood in Eldergrove — the tree who loses count of his own. A
 * tree grows a ring a year: wide in a wet year, thin in a dry one. Gentle
 * counts a young tree's slice ring by ring from the middle out (one ring, one
 * year) and finds its wettest year; Medium reads a core (a pencil-thin sample
 * from bark to middle): the ring from the year something happened, counted
 * back from the bark, and the dry years; Tricky cross-dates — slides an old
 * beam's core along a living tree's till the thin rings line up, and so finds
 * the year the beam's tree was cut, as scientists do. Three trees a round,
 * each a page of Ringwood's grove book. Pure: the weather, the trees, the
 * jobs, the checks and the words.
 */

/** How a year's ring grew. */
export type Growth = 'wet' | 'fair' | 'dry';

/** A ring's width, in the units it's drawn in. */
export const RING_WIDTH: Record<Growth, number> = { wet: 3, fair: 2, dry: 1 };

export const FIRST_YEAR = 1950;
export const LAST_YEAR = 2024;

/**
 * Eldergrove's dry and wet years. The same weather for every tree in the
 * grove, so their rings make the same pattern — what cross-dating matches.
 * The dry years are spaced unevenly, so a run of rings fits in one place only.
 */
const DRY_YEARS = new Set([1952, 1957, 1959, 1966, 1971, 1975, 1978, 1986, 1988, 1994, 1998, 2005, 2008, 2013, 2017, 2022]);
const WET_YEARS = new Set([1954, 1962, 1968, 1973, 1981, 1984, 1991, 1996, 2001, 2003, 2010, 2015, 2019, 2023]);

/** A year's weather in the grove. */
export function weather(year: number): Growth {
  return DRY_YEARS.has(year) ? 'dry' : WET_YEARS.has(year) ? 'wet' : 'fair';
}

/** The years from `from` to `to`, both in. */
export const years = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

export const TREE_IDS = ['birch', 'willow', 'beech', 'rowan', 'oak', 'pine', 'yew', 'sequoia'] as const;
export type TreeId = (typeof TREE_IDS)[number];

export interface Tree {
  id: TreeId;
  name: string;
  /** Where its slice or core came from, as Ringwood says it. */
  from: string;
  /** Its page in the grove book: a true thing about its kind. */
  note: string;
  /** The year it fell (a slice) or was cored (a living tree, `LAST_YEAR`). */
  cut: number;
  /** A fire it lived through: a dark scar on that year's ring. */
  scar?: number;
}

export const TREES: readonly Tree[] = [
  {
    id: 'birch',
    name: 'Silver Birch',
    from: 'a young birch the wind blew down by the brook',
    note: 'One of the first trees to grow on bare ground — its tiny seeds fly far on the wind.',
    cut: 2019,
  },
  {
    id: 'willow',
    name: 'Weeping Willow',
    from: 'a willow branch that fell into the pond',
    note: 'Willow bark has a medicine in it: people chewed it for aches long ago, and it led to aspirin.',
    cut: 2016,
  },
  {
    id: 'beech',
    name: 'Beech',
    from: 'a beech the woodcutter felled to make room',
    note: 'People once wrote on thin beech boards: the words "book" and "beech" grew from the same old word.',
    cut: 2011,
  },
  {
    id: 'rowan',
    name: 'Rowan',
    from: 'a rowan that grew too close to the path',
    note: 'Its red berries feed thrushes all winter, and the birds carry its seeds far away.',
    cut: 2004,
  },
  {
    id: 'oak',
    name: 'Old Oak',
    from: 'the oak that fell in the great storm',
    note: 'An old oak is a home to thousands of kinds of living things, from beetles to birds and bats.',
    cut: 2023,
  },
  {
    id: 'pine',
    name: 'Lodgepole Pine',
    from: 'a pine by the old fire break',
    note: 'Some of its cones stay shut until a fire’s heat opens them — then new pines grow where the fire was.',
    cut: 2020,
    scar: 2013,
  },
  {
    id: 'yew',
    name: 'Yew',
    from: 'the yew by Ringwood’s own roots',
    note: 'Some yews are thought to be two thousand years old or more — far older than Ringwood!',
    cut: 2024,
  },
  {
    id: 'sequoia',
    name: 'Giant Sequoia',
    from: 'the great sequoia on the hill',
    note: 'Its bark can be half a metre thick and keeps out fire: many old sequoias carry fire scars and grow on.',
    cut: 2024,
    scar: 2008,
  },
];

export const TREE_BY_ID = Object.fromEntries(TREES.map((t) => [t.id, t])) as Record<TreeId, Tree>;

/** The trees each band reads (pages come from every band, §3.3). */
export const BAND_TREES: Record<Band, readonly TreeId[]> = {
  gentle: ['birch', 'willow', 'beech', 'rowan'],
  medium: ['oak', 'pine', 'yew', 'sequoia'],
  tricky: TREE_IDS,
};

export const JOBS_PER_ROUND = 3;

/** How many rings each job of a round has: Gentle's slices, Medium's cores, Tricky's beam. */
const RINGS: Record<Band, readonly [number, number, number]> = {
  gentle: [4, 6, 8],
  medium: [10, 12, 14],
  tricky: [8, 9, 10],
};

/** A living tree's core on Tricky: this many rings, to slide the beam along. */
export const TREE_CORE = 30;

/** Medium's "the year it happened": something in the grove, by how many rings back from the bark. */
const EVENTS = [
  { what: 'the bridge over Dawdle Brook was built', back: 4 },
  { what: 'the first Lantern Fair came to the grove', back: 6 },
  { what: 'Fen planted the hedge by the pond', back: 9 },
] as const;

/** The old buildings a Tricky beam comes from. */
const BEAMS = ['the old mill', 'the boathouse', 'the barn on the hill'] as const;

interface JobBase {
  tree: TreeId;
}

/** Gentle: count a slice's rings from the middle out, then find the wettest year. */
export interface CountJob extends JobBase {
  kind: 'count';
  /** The slice's years, middle (oldest) first. */
  rings: readonly number[];
}

/** Medium: in a core, find the ring from a year (counted back from the bark), then every dry year. */
export interface DateJob extends JobBase {
  kind: 'date';
  rings: readonly number[];
  event: { what: string; year: number };
}

/** Tricky: slide an old beam's core along a living tree's till the rings match: when was the beam's tree cut? */
export interface MatchJob extends JobBase {
  kind: 'match';
  /** The living tree's core, oldest first, to `LAST_YEAR`. */
  rings: readonly number[];
  /** The beam's rings, oldest first (its years are what's found). */
  beam: readonly number[];
  /** Where the beam came from. */
  building: string;
}

export type Job = CountJob | DateJob | MatchJob;

/**
 * Which trees come up in a round: those not in the grove book yet first, so
 * every round can fill pages, then the rest in turn from where the round
 * would have them.
 */
export function roundQueue(band: Band, known: (id: TreeId) => boolean, round: number): TreeId[] {
  const can = BAND_TREES[band];
  const start = (round * JOBS_PER_ROUND) % can.length;
  const turn = [...can.slice(start), ...can.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** The `i`th job of a round. */
export function jobFor(band: Band, round: number, i: number, queue?: readonly TreeId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  const tree = TREE_BY_ID[q[i % q.length]];
  const n = RINGS[band][i];
  if (band === 'gentle') return { kind: 'count', tree: tree.id, rings: years(tree.cut - n + 1, tree.cut) };
  if (band === 'medium') {
    const e = EVENTS[(round + i) % EVENTS.length];
    return { kind: 'date', tree: tree.id, rings: years(tree.cut - n + 1, tree.cut), event: { what: e.what, year: tree.cut - Math.min(e.back, n - 2) } };
  }
  // The beam's last ring: somewhere in the tree's core, never at either end, by round and place.
  const core = years(LAST_YEAR - TREE_CORE + 1, LAST_YEAR);
  const room = TREE_CORE - n - 2;
  const start = core[1 + ((round * 7 + i * 11) % room)];
  return { kind: 'match', tree: tree.id, rings: core, beam: years(start, start + n - 1), building: BEAMS[(round + i) % BEAMS.length] };
}

/** The rings (years) of a job that grew in a weather. */
export const ringsOf = (rings: readonly number[], g: Growth) => rings.filter((y) => weather(y) === g);

/**
 * Tricky's slide: with the beam's first ring under the tree core's ring
 * `offset`, does every ring match the weather of the one above it?
 */
export function matchesAt(job: MatchJob, offset: number): boolean {
  return job.beam.every((y, k) => job.rings[offset + k] !== undefined && weather(job.rings[offset + k]) === weather(y));
}

/** Where the beam fits: the core ring its first ring sits under. */
export const fitOffset = (job: MatchJob) => job.rings.indexOf(job.beam[0]);

/** How far the beam can slide: its first ring under the core's first … to its last ring under the core's last. */
export const maxOffset = (job: MatchJob) => job.rings.length - job.beam.length;

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** A ring, said: which from the middle, and how it grew. */
export function ringWords(k: number, year: number, said = true): string {
  const g = weather(year);
  return `The ${ORDINAL[k]} ring from the middle${said ? `, ${g === 'wet' ? 'wide' : g === 'dry' ? 'thin' : 'middling'}` : ''}`;
}

/** The job, as its ticket says it. */
export function jobWords(job: Job): string {
  const t = TREE_BY_ID[job.tree];
  if (job.kind === 'count') return `A slice from ${t.from}. Count its rings from the middle out — one ring, one year — then find its wettest year.`;
  if (job.kind === 'date') return `A core from ${t.from}, cut in ${t.cut}. Find the ring from ${job.event.year}, when ${job.event.what} — then every dry year.`;
  return `A beam from ${job.building}, and a core from ${t.from}, living today. Slide the beam till its rings match the tree’s: when was the beam’s tree cut?`;
}

/** After a ring is tapped while counting (`next` is the one to count, from the middle). Never scolded. */
export function countWords(next: number, tapped: number, total: number): string {
  if (tapped === next) return next + 1 === total ? `${cap(NUM[total])}! That’s the bark — ${NUM[total]} rings, so the tree was ${NUM[total]} years old.` : `${cap(NUM[next + 1])}!`;
  if (tapped < next) return `That one’s counted already — the next is just outside it.`;
  return `Count from the middle out: the next ring is the ${ORDINAL[next]}, just outside the last one counted.`;
}

/** After a ring is picked as the wettest year (Gentle). */
export function wetWords(job: CountJob, k: number): string {
  const y = job.rings[k];
  if (weather(y) === 'wet') return `Yes — the widest ring: ${y} was a wet year, so the tree grew a lot.`;
  return weather(y) === 'dry'
    ? `That ring is thin — a dry year, when the tree hardly grew. The wet year’s ring is the widest.`
    : `That one’s middling. The wet year’s ring is the widest of all.`;
}

/** After a ring is picked as the event's year (Medium): counted back from the bark. */
export function dateWords(job: DateJob, k: number): string {
  const y = job.rings[k];
  const want = job.event.year;
  const last = job.rings[job.rings.length - 1];
  if (y === want) return `Yes — ${want}: ${last - want} rings in from the bark, the year ${job.event.what}.`;
  return `That ring is ${y}: the bark ring is ${last}, and each ring in is a year earlier. ${want} is ${y > want ? 'further in' : 'further out'}.`;
}

/** After a ring is picked as a dry year (Medium); `left` dry rings still to find after it. */
export function dryWords(job: DateJob, k: number, left: number): string {
  const y = job.rings[k];
  if (weather(y) !== 'dry') return `${y}’s ring isn’t thin — not a dry year. Look for the narrowest rings.`;
  return left ? `${y} — a dry year! ${cap(NUM[left])} more to find.` : `${y} — and that’s every dry year!`;
}

/** After "Check" on Tricky's slide. */
export function matchWords(job: MatchJob, offset: number): string {
  if (offset === fitOffset(job)) {
    const end = job.beam[job.beam.length - 1];
    return `They match! The beam’s rings run from ${job.beam[0]} to ${end}, so its tree was cut in ${end} — and ${job.building} was built soon after.`;
  }
  return `Not yet — look at the thin dark rings: do the beam’s sit right under the tree’s?`;
}

/** What a job teaches, for the reward. */
export function learnedLine(job: Job): string {
  const t = TREE_BY_ID[job.tree];
  if (job.kind === 'count') {
    const wet = ringsOf(job.rings, 'wet');
    return `${t.name}: ${NUM[job.rings.length]} rings, ${NUM[job.rings.length]} years. ${wet.length ? `Its widest ring is ${wet[0]}, a wet year.` : ''} ${t.note}`.replace(/\s+/g, ' ');
  }
  if (job.kind === 'date') {
    const scar = t.scar && job.rings.includes(t.scar) ? ` The dark scar on ${t.scar}’s ring is a fire it lived through.` : '';
    const dry = ringsOf(job.rings, 'dry');
    const list = dry.length > 1 ? `${dry.slice(0, -1).join(', ')} and ${dry[dry.length - 1]}` : `${dry[0]}`;
    return `${t.name}: its thin rings were dry years — ${list}.${scar} ${t.note}`;
  }
  return `Matching rings dates wood: the beam from ${job.building} was cut in ${job.beam[job.beam.length - 1]}. ${t.note}`;
}
