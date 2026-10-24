import type { PlayBand } from '../../content/minigames';

/**
 * 🌳 Ringwood's Rings (docs/DESIGN-MINIGAMES.md §5.7): reading tree rings,
 * with Old Ringwood in Eldergrove — the tree who loses count of his own. A
 * tree grows a ring a year: wide in a wet year, thin in a dry one. Gentle
 * counts a young tree's slice ring by ring from the middle out (one ring, one
 * year) and finds its wettest year; Medium reads a core (a pencil-thin sample
 * from bark to middle): the ring from the year something happened, counted
 * back from the bark, and the dry years; Tricky cross-dates — slides an old
 * beam's core along a living tree's till the thin rings line up, and so finds
 * the year the beam's tree was cut, as scientists do. Expert (§8.5)
 * cross-dates with climate data: the beam's rings, measured, slid along the
 * grove's rainfall record till its thin rings sit under the dry years, then
 * dated to the year. Three trees a round, each a page of Ringwood's grove
 * book. Pure: the weather, the rainfall, the trees, the jobs, the checks and
 * the words.
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

/** Expert's rainfall record: under this a year was dry (mm). */
export const DRY_MM = 500;

/**
 * A year's rain in the grove (mm), from its weather: a dry year 380–469, a
 * fair one 560–719, a wet one 820–959 — each year its own amount, so the
 * record reads like a real one, but never across the dry line by mistake.
 */
export function rainfall(year: number): number {
  const g = weather(year);
  if (g === 'dry') return 380 + ((year * 37) % 90);
  if (g === 'fair') return 560 + ((year * 53) % 160);
  return 820 + ((year * 29) % 140);
}

/** Expert's beam measured: a ring's width (mm, to 0.1), which follows the year's rain — a dry year's under 1 mm. */
export const ringMm = (year: number) => Math.round((rainfall(year) - 200) / 30) / 10;

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
  /** Gentle's young trees: how many rings their slice has — the tree's age, the same every round. */
  age?: number;
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
    age: 4,
  },
  {
    id: 'willow',
    name: 'Weeping Willow',
    from: 'a young willow that fell into the pond',
    note: 'Willow bark has a medicine in it: people chewed it for aches long ago, and it led to aspirin.',
    cut: 2016,
    age: 6,
  },
  {
    id: 'beech',
    name: 'Beech',
    from: 'a beech the woodcutter felled to make room',
    note: 'People once wrote on thin beech boards: the words “book” and “beech” grew from the same old word.',
    cut: 2011,
    age: 8,
  },
  {
    id: 'rowan',
    name: 'Rowan',
    from: 'a rowan that grew too close to the path',
    note: 'Its red berries feed thrushes all winter, and the birds carry its seeds far away.',
    cut: 2004,
    age: 5,
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
    scar: 2017,
  },
];

export const TREE_BY_ID = Object.fromEntries(TREES.map((t) => [t.id, t])) as Record<TreeId, Tree>;

/** The trees each band reads (pages come from every band, §3.3). */
export const BAND_TREES: Record<PlayBand, readonly TreeId[]> = {
  gentle: ['birch', 'willow', 'beech', 'rowan'],
  medium: ['oak', 'pine', 'yew', 'sequoia'],
  tricky: TREE_IDS,
  expert: TREE_IDS,
};

export const JOBS_PER_ROUND = 3;

/** How many rings each job of a round has: Medium's cores, Tricky's and Expert's beams (Gentle's slices are their tree's `age`). */
const RINGS: Record<Exclude<PlayBand, 'gentle'>, readonly [number, number, number]> = {
  medium: [10, 12, 14],
  tricky: [8, 9, 10],
  expert: [10, 11, 12],
};

/** A living tree's core on Tricky, and Expert's rainfall record: this many years, to slide the beam along. */
export const TREE_CORE = 30;

/** Medium's "the year it happened": something in the grove, the same year in every tree's rings. */
export const EVENTS = [
  { what: 'the bridge over Dawdle Brook was built', year: 2016 },
  { what: 'the first Lantern Fair came to the grove', year: 2018 },
  { what: 'Fen planted the hedge by the pond', year: 2014 },
] as const;

/** The old buildings a beam (Tricky, Expert) comes from. */
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

/**
 * Expert: slide an old beam's rings, measured, along the grove's rainfall
 * record till its thin rings sit under the dry years — then date its last
 * ring. Cross-dating with climate data.
 */
export interface RainJob extends JobBase {
  kind: 'rain';
  /** The record's years, oldest first, to `LAST_YEAR`. */
  rings: readonly number[];
  /** The beam's rings, oldest first (its years are what's found). */
  beam: readonly number[];
  building: string;
}

export type Job = CountJob | DateJob | MatchJob | RainJob;

/** A beam slid along a strip of years: Tricky's living tree, Expert's rainfall record. */
export type SlideJob = MatchJob | RainJob;

/**
 * Which trees come up in a round: those not in the grove book yet first, so
 * every round can fill pages, then the rest in turn from where the round
 * would have them.
 */
export function roundQueue(band: PlayBand, known: (id: TreeId) => boolean, round: number): TreeId[] {
  const can = BAND_TREES[band];
  const start = (round * JOBS_PER_ROUND) % can.length;
  const turn = [...can.slice(start), ...can.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** The `i`th job of a round. */
export function jobFor(band: PlayBand, round: number, i: number, queue?: readonly TreeId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  const tree = TREE_BY_ID[q[i % q.length]];
  if (band === 'gentle') return { kind: 'count', tree: tree.id, rings: years(tree.cut - (tree.age ?? 4) + 1, tree.cut) };
  const n = RINGS[band][i % JOBS_PER_ROUND];
  if (band === 'medium') {
    const rings = years(tree.cut - n + 1, tree.cut);
    // An event inside the core — never its first ring or the bark's — in turn by round and place.
    const can = EVENTS.filter((e) => e.year > rings[0] && e.year < tree.cut);
    const e = can[(round + i) % can.length];
    return { kind: 'date', tree: tree.id, rings, event: { what: e.what, year: e.year } };
  }
  // The beam's last ring: somewhere in the tree's core, never at either end, by round and place.
  const core = years(LAST_YEAR - TREE_CORE + 1, LAST_YEAR);
  const room = TREE_CORE - n - 2;
  const start = core[1 + ((round * 7 + i * 11) % room)];
  const job = { tree: tree.id, rings: core, beam: years(start, start + n - 1), building: BEAMS[(round + i) % BEAMS.length] };
  return band === 'expert' ? { kind: 'rain', ...job } : { kind: 'match', ...job };
}

/** The rings (years) of a job that grew in a weather. */
export const ringsOf = (rings: readonly number[], g: Growth) => rings.filter((y) => weather(y) === g);

/**
 * Tricky's slide: with the beam's first ring under the tree core's ring
 * `offset`, does every ring match the weather of the one above it?
 */
export function matchesAt(job: SlideJob, offset: number): boolean {
  return job.beam.every((y, k) => job.rings[offset + k] !== undefined && weather(job.rings[offset + k]) === weather(y));
}

/** Where the beam fits: the core ring its first ring sits under. */
export const fitOffset = (job: SlideJob) => job.rings.indexOf(job.beam[0]);

/** How far the beam can slide: its first ring under the core's first … to its last ring under the core's last. */
export const maxOffset = (job: SlideJob) => job.rings.length - job.beam.length;

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** A number in words (as figures past fourteen). */
export const numberWord = (n: number) => NUM[n] ?? String(n);
/** The `k`th (from 0), in words (as figures past the fourteenth: 21st, 22nd, 23rd). */
export const ordinal = (k: number) => {
  const n = k + 1;
  return ORDINAL[k] ?? `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
};
/** How a ring looks, by its weather. */
export const growthWord = (year: number) => ({ wet: 'wide', fair: 'medium', dry: 'thin' })[weather(year)];

/** A ring, said: which from the middle, and how it grew. */
export function ringWords(k: number, year: number, said = true): string {
  return `The ${ordinal(k)} ring from the middle${said ? `, ${growthWord(year)}` : ''}`;
}

/** A core's ring, said from the bark (`back` rings in), as the year's found by counting. */
export const backWords = (back: number) => (back === 0 ? 'The ring by the bark' : `${cap(numberWord(back))} ${back === 1 ? 'ring' : 'rings'} in from the bark`);

/** The job, as its ticket says it. */
export function jobWords(job: Job): string {
  const t = TREE_BY_ID[job.tree];
  if (job.kind === 'count') return `A slice from ${t.from}. Count its rings from the middle out — one ring, one year — then find its wettest year.`;
  if (job.kind === 'date') return `A core from ${t.from}, ${t.cut === LAST_YEAR ? 'taken' : 'cut'} in ${t.cut}. Find the ring from ${job.event.year}, when ${job.event.what} — then every dry year.`;
  if (job.kind === 'rain')
    return `A ${t.name.toLowerCase()} beam from ${job.building}, its rings measured, and the grove’s rainfall record from ${job.rings[0]}. Slide the beam till its thin rings sit under the dry years, then date its last ring.`;
  return `A beam from ${job.building}, and a core from a living ${t.name.toLowerCase()} in the grove. Slide the beam till its rings match the tree’s: when was the beam’s tree cut?`;
}

/** After a ring is tapped while counting (`next` is the one to count, from the middle). Never scolded. */
export function countWords(next: number, tapped: number, total: number): string {
  const n = numberWord(total);
  // The bark isn't a ring (UX review round 2: "That's the bark" had a kid count it).
  if (tapped === next) return next + 1 === total ? `${cap(n)}! The last ring, right by the bark — ${n} rings, so the tree was ${n} years old.` : `${cap(numberWord(next + 1))}!`;
  if (tapped === next - 1) return 'That one’s counted already — the next is just outside it.';
  if (tapped < next) return `That one’s counted already — count on from ${numberWord(next)}: the ${ordinal(next)} ring.`;
  if (next === 0) return 'Count from the middle out: start with the first ring, right by the middle.';
  return `Count from the middle out: the next ring is the ${ordinal(next)}, just outside the last one counted.`;
}

/** As the wettest year's step starts: what to tap (UX review round 2: on a short screen nothing said it). */
export function wetAsk(job: CountJob): string {
  return ringsOf(job.rings, 'wet').length > 1 ? 'Now tap one of the two widest rings — its wettest years!' : 'Now tap the widest ring — its wettest year!';
}

/** As the dry years' step starts: what to find. */
export function dryAsk(job: DateJob): string {
  return `Now find every thin ring: ${numberWord(ringsOf(job.rings, 'dry').length)} dry years!`;
}

/** A dry year tapped again; `left` still to find. */
export const foundWords = (year: number, left: number) => `${year} is found already — ${numberWord(left)} to go.`;

/** After a ring is picked as the wettest year (Gentle). */
export function wetWords(job: CountJob, k: number): string {
  const y = job.rings[k];
  const two = ringsOf(job.rings, 'wet').length > 1;
  if (weather(y) === 'wet') return `Yes — ${two ? 'one of the widest rings' : 'the widest ring'}: ${y} was a wet year, so the tree grew a lot.`;
  return weather(y) === 'dry'
    ? `That ring is thin — a dry year, when the tree hardly grew. The wet year’s ring is the widest.`
    : `That one’s medium — not the widest. The wet year’s ring is the widest of all.`;
}

/** After a ring is picked as the event's year (Medium): counted back from the bark. */
export function dateWords(job: DateJob, k: number): string {
  const y = job.rings[k];
  const want = job.event.year;
  const last = job.rings[job.rings.length - 1];
  if (y === want) return `Yes — ${want}: ${backWords(last - want).toLowerCase()}, the year ${job.event.what}.`;
  return `That ring is ${y}: the ring by the bark is ${last}, and each ring in is a year earlier. ${want} is ${y > want ? 'further in' : 'further out'}.`;
}

/** After a ring is picked as a dry year (Medium); `left` dry rings still to find after it. */
export function dryWords(job: DateJob, k: number, left: number): string {
  const y = job.rings[k];
  if (weather(y) !== 'dry') return `${y}’s ring isn’t thin — not a dry year. Look for the narrowest rings.`;
  return left ? `${y} — a dry year! ${cap(numberWord(left))} more to find.` : `${y} — and that’s every dry year!`;
}

/** With the beam at `offset`, does every thin ring of the beam sit under a thin ring of the tree, and none under a wider one? */
export function thinLinedUp(job: SlideJob, offset: number): boolean {
  return job.beam.every((y, k) => (weather(y) === 'dry') === (weather(job.rings[offset + k]) === 'dry'));
}

/** After "Do they match?" on Tricky's slide: thin under thin and wide under wide, every ring — or what to look at. */
export function matchWords(job: MatchJob, offset: number): string {
  if (offset === fitOffset(job)) {
    const end = job.beam[job.beam.length - 1];
    return `They match! The beam’s rings run from ${job.beam[0]} to ${end}, so its tree was cut in ${end} — and ${job.building} was built soon after.`;
  }
  if (thinLinedUp(job, offset)) return 'The thin rings line up here — but not the wide ones. Slide on: thin under thin, wide under wide!';
  return 'Not yet — find the thin dark rings first: slide till the beam’s sit right under the tree’s.';
}

/** A list said: "2005, 2008 and 2013". */
export const listWords = (xs: readonly (string | number)[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : `${xs[0] ?? ''}`);

/**
 * After "Do they line up?" on Expert: every thin ring under a dry year and
 * every wide one under a wet year — or what's wrong, and one thing to try.
 * Plain (§8.3); no years given: dating it is the next step.
 */
export function lineUpWords(job: RainJob, offset: number): string {
  if (offset === fitOffset(job)) return 'They line up: every thin ring sits under a dry year, every wide one under a wet year.';
  if (thinLinedUp(job, offset)) return 'The thin rings sit under dry years here, but a wide ring isn’t under a wet year. Slide on.';
  return `Not lined up: a thin ring sits under a year with more than ${DRY_MM} mm of rain. Slide the beam’s thinnest rings under bars below the dry line.`;
}

/**
 * Expert's dating: the year the beam's last ring grew, from four — its first
 * ring's, and two of the years round the last's: both before it, one either
 * side or both after, in turn by the beam (code and UX review round 1: always
 * one either side, the answer was always the third, the middle of three),
 * inside the record.
 */
export function dateChoices(job: RainJob): number[] {
  const end = job.beam[job.beam.length - 1];
  const ways: readonly (readonly [number, number])[] = [
    [-2, -1],
    [-1, 1],
    [1, 2],
  ];
  const fits = ways.filter(([a, b]) => end + b <= job.rings[job.rings.length - 1] && end + a > job.beam[0]);
  const [a, b] = fits[(end + job.beam.length) % fits.length];
  return [job.beam[0], end + a, end, end + b].sort((x, y) => x - y);
}

/** Expert's dating, asked. */
// How to read it, in the ask (code review round 2: the step's tip never showed — the box shows what Ringwood said).
export const dateAsk = 'Which year did its last ring grow — the one by the bark? Follow the gold line up to its tick on the record.';

/** After a year's picked for the beam's last ring: right, or which ring that year is. */
export function datedWords(job: RainJob, year: number): string {
  const end = job.beam[job.beam.length - 1];
  if (year === end) return `Yes — ${end}: its last ring sits under ${end} on the record, so its tree was cut in ${end}.`;
  if (year === job.beam[0]) return `${year} is its first ring, nearest the middle of the tree. The last, by the bark, sits under ${end}.`;
  // How to read it: from the labelled fifth year nearest, a tick a year (UX review round 1: a label right over the last ring
  // was a year off).
  const fifth = Math.round(end / 5) * 5;
  const from = fifth === end ? '' : ` Count the ticks from ${fifth}, one a year.`;
  const n = Math.abs(end - year);
  return `Not ${year}: the last ring sits under ${end}, ${n === 1 ? 'a year' : `${n} years`} ${year < end ? 'after' : 'before'} ${year}.${from}`;
}

/** What a job teaches, for the reward. */
export function learnedLine(job: Job): string {
  const t = TREE_BY_ID[job.tree];
  if (job.kind === 'count') {
    const wet = ringsOf(job.rings, 'wet');
    const n = numberWord(job.rings.length);
    const widest = wet.length > 1 ? `Its widest rings, ${wet.slice(0, -1).join(', ')} and ${wet[wet.length - 1]}, were wet years.` : `Its widest ring is ${wet[0]}, a wet year.`;
    return `${t.name}: ${n} rings, ${n} years. ${widest} ${t.note}`;
  }
  if (job.kind === 'date') {
    const scar = t.scar && job.rings.includes(t.scar) ? ` The dark scar on ${t.scar}’s ring is a fire it lived through.` : '';
    const dry = ringsOf(job.rings, 'dry');
    const list = dry.length > 1 ? `${dry.slice(0, -1).join(', ')} and ${dry[dry.length - 1]}` : `${dry[0]}`;
    return `${t.name}: its thin rings were dry years — ${list}.${scar} ${t.note}`;
  }
  const end = job.beam[job.beam.length - 1];
  if (job.kind === 'rain') {
    const dry = ringsOf(job.beam, 'dry');
    return `Cross-dating with rain: the ${t.name.toLowerCase()} beam’s thin rings grew in the record’s dry years, ${listWords(dry.map((y) => `${y} (${rainfall(y)} mm)`))}. Its rings run from ${job.beam[0]} to ${end}, so its tree was cut in ${end}. ${t.note}`;
  }
  return `Matching rings dates wood: the beam’s rings matched the living ${t.name.toLowerCase()}’s from ${job.beam[0]} to ${end}, so its tree was cut in ${end}. ${t.note}`;
}
