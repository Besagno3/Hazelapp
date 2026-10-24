import type { PlayBand } from '../../content/minigames';

/**
 * 📜 Index's Timeline (docs/DESIGN-MINIGAMES.md §5.8): putting things in the
 * order they happened, with Index in the Sunken Archive's card catalog. Soggy
 * cards wash in; the kid puts each on the timeline (tap a card, then a place)
 * and checks: the longest run already in order stays, each card in its own
 * place, and the rest float back with a hint of why ("After gas street lamps
 * came the electric light bulb — …"). Gentle has 3–4 cards far
 * apart, no years; Medium five across the centuries, no years; Tricky 6–7
 * with their years, BCE and CE; Expert all seven, each dated by its century
 * where that's enough to place it, then how many years lie between two of
 * them across BCE and CE, and what led to what (§8.5). Three sets a round,
 * each a page of Index's timeline book (light, travel, writing, flight, food,
 * music, buildings, medicine). Inventions, discoveries and things people
 * made — no wars, disasters or religion. Pure: the sets, the jobs, the checks
 * and the words.
 */

export interface TimelineEvent {
  id: string;
  /** On its card. */
  name: string;
  /** Inside a sentence ("after the wheel"). */
  said: string;
  emoji: string;
  /** When: a year (negative: BCE), roughly when it's "about". */
  year: number;
  about?: boolean;
  /** Why it is where it is in time, naming no other card — the clue when it's placed wrong (code review round 1: each named the card before it in the whole set, often not dealt). */
  why: string;
}

export const SET_IDS = ['light', 'travel', 'writing', 'flight', 'food', 'music', 'buildings', 'medicine'] as const;
export type SetId = (typeof SET_IDS)[number];

export interface TimelineSet {
  id: SetId;
  name: string;
  emoji: string;
  /** Its page in the timeline book. */
  note: string;
  /** Oldest first. */
  events: readonly TimelineEvent[];
  /** What led to what, among its cards (Expert's lesson): checked, and no wars, disasters or religion. */
  led: string;
}

const e = (id: string, name: string, said: string, emoji: string, year: number, why: string, about = false): TimelineEvent => ({ id, name, said, emoji, year, why, about });

export const SETS: readonly TimelineSet[] = [
  {
    id: 'light',
    name: 'Light',
    emoji: '💡',
    note: 'For most of history, light at night meant a flame. Electric light is only about 150 years old.',
    // Of these cards only (code review round 1: arc lamps lit streets before the bulb, and gas lamps stayed long after it).
    led: 'Every light on these cards before the electric bulb (1879) burned something: wood, oil, wax or gas. The ones after it run on electricity: neon signs, then LEDs.',
    events: [
      e('fire', 'Firelight in caves', 'firelight in caves', '🔥', -400000, 'people have lit the dark with fire for hundreds of thousands of years.', true),
      e('oil-lamp', 'Stone oil lamps', 'stone oil lamps', '🪔', -15000, 'an oil lamp is a little fire in a stone dish, from the Stone Age.', true),
      e('candle', 'Candles', 'candles', '🕯️', -500, 'a good candle needs wax and a wick, made with care.', true),
      e('gas-lamp', 'Gas street lamps', 'gas street lamps', '🏮', 1807, 'lighting a whole street took gas pipes under the roads.'),
      e('bulb', 'Electric light bulb', 'the electric light bulb', '💡', 1879, 'its thin wire glows with electricity, without burning up.'),
      e('neon', 'Neon signs', 'neon signs', '🌈', 1910, 'a neon sign is a glass tube of gas that glows with electricity.'),
      e('led', 'First LED light', 'the first LED light', '🔴', 1962, 'an LED is a tiny electronic light — the first ones were small and red.'),
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    emoji: '🚲',
    note: 'For thousands of years, nothing on land went faster than a horse. Then engines changed everything in about 100 years.',
    led: 'The Wright brothers ran a bicycle shop before they built their aeroplane (1903), and it flew on a light petrol engine, the kind that drove the first cars (1886).',
    events: [
      e('canoe', 'Dugout canoes', 'dugout canoes', '🛶', -8000, 'a canoe is a hollowed-out log — one of the oldest ways to travel.', true),
      e('wheel', 'The wheel', 'the wheel', '🛞', -3500, 'wheels were first put on carts, thousands of years ago.', true),
      e('steam-train', 'Steam train', 'the steam train', '🚂', 1804, 'a steam train needs an engine that burns coal to make steam.'),
      e('bicycle', 'Bicycle', 'the bicycle', '🚲', 1817, 'the first bicycle had no pedals — riders pushed with their feet!'),
      e('car', 'Petrol car', 'the petrol car', '🚗', 1886, 'a petrol car needs an engine small enough to carry.'),
      e('plane', 'Aeroplane', 'the aeroplane', '✈️', 1903, 'a plane needs an engine that’s light but strong.'),
      e('bullet-train', 'Bullet train', 'the bullet train', '🚄', 1964, 'the bullet train is a very fast electric train.'),
    ],
  },
  {
    id: 'writing',
    name: 'Writing',
    emoji: '✍️',
    note: 'People told stories for thousands of years before anyone wrote one down. Writing was invented to keep track of grain and goods.',
    led: 'The printing press (about 1440) printed on paper, first made in China about 1,300 years before.',
    events: [
      e('cave-paintings', 'Cave paintings', 'cave paintings', '🦬', -30000, 'pictures on cave walls came long before letters.', true),
      e('clay', 'Writing on clay', 'writing on clay', '🏺', -3200, 'the first writing was marks pressed into clay, to count grain.', true),
      e('paper', 'Paper', 'paper', '📜', 105, 'paper was first made from plants and old rags, in China.', true),
      e('printing', 'Printing press', 'the printing press', '🖨️', 1440, 'a printing press prints whole pages at once, with little metal letters.', true),
      e('typewriter', 'Typewriter', 'the typewriter', '⌨️', 1868, 'a typewriter is a little printing machine for one person.'),
      e('ballpoint', 'Ballpoint pen', 'the ballpoint pen', '🖊️', 1938, 'a ballpoint pen has a tiny ball that rolls the ink on.'),
      e('email', 'Email', 'email', '📧', 1971, 'email needs computers joined together.'),
    ],
  },
  {
    id: 'flight',
    name: 'Flight',
    emoji: '🪁',
    note: 'People flew kites for over two thousand years before anyone flew themselves.',
    led: 'Gliders came first: the Wright brothers flew their own gliders from 1900 to 1902, then added an engine, and that was the first aeroplane (1903).',
    events: [
      e('kite', 'Kites', 'kites', '🪁', -500, 'kites were the first things people flew.', true),
      e('balloon', 'Hot-air balloon', 'the hot-air balloon', '🎈', 1783, 'a hot-air balloon was the first way people flew themselves.'),
      e('glider', 'Glider with a pilot', 'the glider with a pilot', '🦅', 1853, 'a glider carried a man across a valley — with no engine at all.'),
      e('first-plane', 'First aeroplane', 'the first aeroplane', '✈️', 1903, 'the first aeroplane was a glider with an engine.'),
      e('helicopter', 'Helicopter', 'the helicopter', '🚁', 1939, 'a helicopter’s spinning blades are trickier to fly than wings.'),
      e('jet', 'Jet airliner', 'the jet airliner', '🛫', 1952, 'a jet airliner carries lots of people fast, with jet engines.'),
      e('moon', 'People walk on the Moon', 'people on the Moon', '🌕', 1969, 'going to the Moon took giant rockets and everything learned from planes.'),
    ],
  },
  {
    id: 'food',
    name: 'Food',
    emoji: '🍞',
    note: 'Farming changed everything: once people grew food, they could stay in one place and build villages.',
    led: 'Farming (about 10,000 BCE) grew grain in plenty, enough for ovens full of bread; thousands of years later, a machine sliced the loaves (1928).',
    events: [
      e('farming', 'Farming begins', 'farming', '🌾', -10000, 'before farms, people gathered and hunted all their food.', true),
      e('bread', 'Bread baked in ovens', 'bread baked in ovens', '🍞', -4000, 'ovens full of bread needed lots of grain, which farms grew.', true),
      e('chocolate', 'A chocolate drink', 'a chocolate drink', '🍫', -1500, 'chocolate was first a bitter drink made from cacao beans.', true),
      e('cans', 'Food in cans', 'food in cans', '🥫', 1810, 'cans kept food good to eat for sailors on long voyages.'),
      e('fridge', 'Home fridge', 'the home fridge', '🧊', 1913, 'a fridge needs electricity in people’s homes.'),
      e('sliced-bread', 'Sliced bread', 'sliced bread', '🥪', 1928, 'sliced bread needed a bread-slicing machine.'),
      e('microwave', 'Microwave oven', 'the microwave oven', '♨️', 1947, 'a microwave oven cooks with tiny waves of energy.'),
    ],
  },
  {
    id: 'music',
    name: 'Music',
    emoji: '🎵',
    note: 'The oldest instruments found are flutes made from bird bones and mammoth ivory, about 40,000 years old.',
    led: 'Once sound could be played back (1877), music could be kept: on records, then on tapes like the cassette (1963), then as files like the MP3 (1993).',
    events: [
      e('bone-flute', 'Bone flute', 'the bone flute', '🦴', -38000, 'bone flutes are the oldest instruments ever found.', true),
      e('lyre', 'Lyres and harps', 'lyres and harps', '🪕', -2500, 'lyres and harps were played in the first cities.', true),
      e('piano', 'Piano', 'the piano', '🎹', 1700, 'a piano’s strings are struck by little hammers.', true),
      e('phonograph', 'Sound played back', 'sound played back', '🔊', 1877, 'before recordings, music only lived while someone played it.'),
      e('radio', 'Radio shows', 'radio shows', '📻', 1920, 'radio sends music through the air.'),
      e('cassette', 'Cassette tape', 'the cassette tape', '📼', 1963, 'a cassette holds music on a thin tape.'),
      e('mp3', 'MP3 music files', 'MP3 music files', '🎧', 1993, 'an MP3 is music saved as a computer file.'),
    ],
  },
  {
    id: 'buildings',
    name: 'Buildings',
    emoji: '🏛️',
    note: 'The Great Pyramid was the tallest building in the world for almost 4,000 years.',
    // What holds for every tower since (code review round 1: the Burj Khalifa stands on a concrete core of thick walls).
    led: 'The first skyscraper (1885) was held up by a metal frame, not thick walls, and lifts took people up it: every tall tower since, up to the Burj Khalifa (2010), needs lifts.',
    events: [
      e('mud-brick', 'Mud-brick houses', 'mud-brick houses', '🛖', -9000, 'mud-brick houses came when people first stayed in one place.', true),
      e('pyramid', 'Great Pyramid of Giza', 'the Great Pyramid of Giza', '🔺', -2560, 'the Great Pyramid was built of over two million stone blocks.', true),
      e('aqueduct', 'Roman aqueducts', 'Roman aqueducts', '🌉', -312, 'aqueducts carried water to Roman towns.'),
      e('skyscraper', 'First skyscraper', 'the first skyscraper', '🏙️', 1885, 'a skyscraper needs a steel frame and lifts.'),
      e('eiffel', 'Eiffel Tower', 'the Eiffel Tower', '🗼', 1889, 'the Eiffel Tower is made of iron, built for a world fair.'),
      e('opera-house', 'Sydney Opera House', 'the Sydney Opera House', '🎭', 1973, 'its roof shells took modern concrete and computers to work out.'),
      e('burj', 'Burj Khalifa', 'the Burj Khalifa', '🏗️', 2010, 'it was the tallest building in the world when it opened.'),
    ],
  },
  {
    id: 'medicine',
    name: 'Medicine',
    emoji: '🩺',
    note: 'Many medicines started as plants: willow bark eased aches long before scientists made aspirin from it.',
    led: 'Lens makers made eyeglasses (about 1290); about 300 years later, two lenses in a tube made the first microscope (about 1590).',
    events: [
      e('willow', 'Willow bark for aches', 'willow bark for aches', '🌿', -1500, 'people used plants as medicine long, long ago.', true),
      e('glasses', 'Eyeglasses', 'eyeglasses', '👓', 1290, 'glasses need lenses of glass, well made.', true),
      e('microscope', 'Microscope', 'the microscope', '🔬', 1590, 'a microscope uses lenses to see tiny things.', true),
      e('vaccine', 'First vaccine', 'the first vaccine', '💉', 1796, 'the first vaccine kept people safe from smallpox.'),
      e('stethoscope', 'Stethoscope', 'the stethoscope', '🩺', 1816, 'a stethoscope is for listening to hearts.'),
      e('x-ray', 'X-ray pictures', 'X-ray pictures', '🩻', 1895, 'X-ray pictures need electricity.'),
      e('penicillin', 'Penicillin', 'penicillin', '🧫', 1928, 'penicillin, the first antibiotic, was found in a mouldy dish.'),
    ],
  },
];

export const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s])) as Record<SetId, TimelineSet>;

export const JOBS_PER_ROUND = 3;

/** Which of a set's seven events Gentle and Tricky put in order (oldest first), for each job of a round. */
const PICKS: Record<'gentle' | 'tricky', readonly (readonly number[])[]> = {
  // Far apart, so before and after is plain.
  gentle: [
    [0, 3, 6],
    [1, 4, 6],
    [0, 2, 4, 6],
  ],
  tricky: [
    [0, 1, 2, 3, 4, 5],
    [0, 1, 2, 4, 5, 6],
    [0, 1, 2, 3, 4, 5, 6],
  ],
};

/** On a card with no year (Gentle, Medium), the least two side by side are apart (code review round 1: four years). */
export const MIN_GAP = 30;

/** Years from one event to a later one (there's no year 0: 1 BCE to 1 CE is a year). */
export const yearsApart = (a: TimelineEvent, b: TimelineEvent) => b.year - a.year - (a.year < 0 && b.year > 0 ? 1 : 0);

/**
 * Medium's five of a set's events: every two left out — never the oldest, so a
 * drawer runs across the centuries (code review round 2: a third of them were
 * a few hundred years) — whose cards stay `MIN_GAP` apart.
 */
function mediumPicks(set: TimelineSet): number[][] {
  const all = set.events.map((_, k) => k);
  const out: number[][] = [];
  for (let a = 1; a < all.length; a++)
    for (let b = a + 1; b < all.length; b++) {
      const ks = all.filter((k) => k !== a && k !== b);
      if (ks.slice(1).every((k, j) => yearsApart(set.events[ks[j]], set.events[k]) >= MIN_GAP)) out.push(ks);
    }
  return out;
}

export interface Job {
  set: SetId;
  /** Its cards, oldest first (the right order). */
  events: readonly TimelineEvent[];
  /** When's on the cards (Tricky, Expert). */
  years: boolean;
  /** The order they wash in. */
  dealt: readonly string[];
  /** Expert: each card dated by its century where that's enough to place it, and how many years lie from one card to another. */
  expert?: { span: { from: TimelineEvent; to: TimelineEvent }; seed: number };
}

/**
 * Where Expert's turn starts: Writing, with three CE centuries to place (UX
 * review round 1: a new teen's first two drawers, Light and Travel, had one
 * BCE century card each and none CE — the 1800s trap came third).
 */
export const EXPERT_FIRST: SetId = 'writing';

/**
 * Which sets come up in a round: those not in the timeline book yet first,
 * then the rest in turn from where the round would have them (on Expert, from
 * `EXPERT_FIRST`).
 */
export function roundQueue(known: (id: SetId) => boolean, round: number, band?: PlayBand): SetId[] {
  const start = (round * JOBS_PER_ROUND + (band === 'expert' ? SET_IDS.indexOf(EXPERT_FIRST) : 0)) % SET_IDS.length;
  const turn = [...SET_IDS.slice(start), ...SET_IDS.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** A shuffle that's the same every time for a seed. */
function shuffle<T>(ids: readonly T[], seed: number): T[] {
  const out = [...ids];
  let x = seed * 9301 + 49297;
  for (let k = out.length - 1; k > 0; k--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor((x / 233280) * (k + 1));
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}

/** How long the longest run of `xs` going up is (cards in order, not side by side). */
function longestRun(xs: readonly number[]): number {
  const ends = xs.map(() => 1);
  xs.forEach((x, k) => xs.slice(0, k).forEach((y, j) => y < x && (ends[k] = Math.max(ends[k], ends[j] + 1))));
  return Math.max(0, ...ends);
}

/**
 * How the cards wash in: a shuffle the same every time for a seed, with at
 * most a third of them where they go — none of three (code review round 2: a
 * swap from done) — and no run in order longer than half of them, so tapping
 * them as they lie leaves most to do (code review round 1: some deals were a
 * swap from done). `tries` shuffles, then the other way round (never needed:
 * a test).
 */
export function deal(ids: readonly string[], seed: number, tries = 50): string[] {
  const n = ids.length;
  const most = n <= 3 ? 0 : Math.floor(n / 3);
  const run = Math.max(2, Math.floor(n / 2));
  for (let t = 0; t < tries; t++) {
    const out = shuffle(ids, seed + t * 7919);
    const at = out.map((id) => ids.indexOf(id));
    if (at.filter((x, k) => x === k).length <= most && longestRun(at) <= run) return out;
  }
  // The other way round; with an odd count the middle two swapped, so none's in its place.
  const out = [...ids].reverse();
  const m = (n - 1) / 2;
  if (n % 2) [out[m], out[m + 1]] = [out[m + 1], out[m]];
  return out;
}

/** BCE years from here on are dated by their year on Expert's cards, not their century (the 50th century BCE and on). */
export const CENTURY_UP_TO = 5000;

/**
 * Expert's question of years: from a BCE card (one dated in centuries, not
 * the Stone Age's tens of thousands) to a CE card, a different pair each time
 * a set comes round.
 */
export function spanFor(set: TimelineSet, round: number, i: number): { from: TimelineEvent; to: TimelineEvent } {
  const bce = set.events.filter((ev) => ev.year < 0 && -ev.year < CENTURY_UP_TO);
  const ce = set.events.filter((ev) => ev.year > 0);
  return { from: bce[(round + i) % bce.length], to: ce[(round + i) % ce.length] };
}

/** The `i`th job of a round. */
export function jobFor(band: PlayBand, round: number, i: number, queue?: readonly SetId[]): Job {
  const q = queue ?? roundQueue(() => false, round, band);
  const set = SET_BY_ID[q[i % q.length]];
  const at = i % JOBS_PER_ROUND;
  const seed = round * JOBS_PER_ROUND + i + 1;
  // Expert: every card in the drawer.
  if (band === 'expert') return { set: set.id, events: set.events, years: true, dealt: deal(set.events.map((ev) => ev.id), seed), expert: { span: spanFor(set, round, i), seed } };
  let picks: readonly number[];
  if (band === 'medium') {
    const can = mediumPicks(set);
    // Spread over a round (a test: every set has three); none at all only if a set's years were all close.
    picks = can[Math.floor((at * can.length) / JOBS_PER_ROUND)] ?? [0, 1, 3, 5, 6];
  } else picks = PICKS[band][at];
  const events = picks.map((k) => set.events[k]);
  return { set: set.id, events, years: band === 'tricky', dealt: deal(events.map((ev) => ev.id), seed) };
}

/** A year, said: "1879", "about 3500 BCE", "about 400,000 BCE" (BCE years count down to year 1). */
export function yearWords(ev: TimelineEvent): string {
  const a = Math.abs(ev.year);
  // A four-figure year as it's written (1879, 3500 BCE); a bigger one with a comma (15,000 BCE).
  const n = a < 10000 ? String(a) : a.toLocaleString('en-GB');
  return `${ev.about ? 'about ' : ''}${n}${ev.year < 0 ? ' BCE' : ev.year < 1000 ? ' CE' : ''}`;
}

/** Now, for "years ago". */
const NOW = new Date().getFullYear();

/**
 * When, for a band whose cards have no years (Gentle, Medium) once a drawer's
 * filed: long ago "about 4,600 years ago", not BCE, which wasn't explained
 * (UX review round 1); a year since year 1 as it is ("1879", "about the year 105").
 */
export function whenWords(ev: TimelineEvent): string {
  if (ev.year > 0) return `${ev.about ? 'about the year ' : ''}${ev.year}`;
  const ago = Number((NOW - ev.year - 1).toPrecision(2));
  return `about ${ago.toLocaleString('en-GB')} years ago`;
}

/** A card's when, as its band says it once the drawer's in order. */
export const dateOf = (job: Job, ev: TimelineEvent) => (job.years ? yearWords(ev) : whenWords(ev));

/** Which century a year's in: 1–100 the 1st, 1801–1900 the 19th; 400–301 BCE the 4th century BCE. */
export const centuryOf = (year: number) => Math.ceil(Math.abs(year) / 100);

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** A century, said: "the 19th century", "the 4th century BCE" (without "the": `bare`). */
export function centuryWords(year: number, bare = false): string {
  return `${bare ? '' : 'the '}${ordinal(centuryOf(year))} century${year < 0 ? ' BCE' : ''}`;
}

/** A century's years: "1801 to 1900", "400 to 301 BCE". */
export function centuryYears(year: number): string {
  const n = centuryOf(year);
  return year < 0 ? `${n * 100} to ${(n - 1) * 100 + 1} BCE` : `${(n - 1) * 100 + 1} to ${n * 100}`;
}

/**
 * Whether Expert's card gives its century, not its year: where that's enough
 * to place it — no other card in the drawer in the same century — and not
 * long ago (the Stone Age's tens of thousands of years), nor a whole hundred
 * CE (is 1700 in the 17th century or the 18th? Strictly the 17th, but the
 * 1700s are the 18th: the card gives the year). A BCE one's dated by its
 * century all the same (500 BCE, strictly the 5th, is in "the 500s BCE",
 * mostly the 6th): "the 1700s" is how CE years are talked of, not BCE ones,
 * the clue teaches the strict rule, and without them Light and Travel would
 * have no century card (code review round 1).
 */
export function byCentury(job: Job, ev: TimelineEvent): boolean {
  if (!job.expert || Math.abs(ev.year) >= CENTURY_UP_TO || (ev.year > 0 && ev.year % 100 === 0)) return false;
  const same = (other: TimelineEvent) => Math.sign(other.year) === Math.sign(ev.year) && centuryOf(other.year) === centuryOf(ev.year);
  return job.events.filter(same).length === 1;
}

/** What a card says while it's placed: its year, or its band's when; Expert's, its century where that's enough (`byCentury`). */
export const cardDate = (job: Job, ev: TimelineEvent) => (byCentury(job, ev) ? centuryWords(ev.year, true) : dateOf(job, ev));

/**
 * Placed cards (ids, by place; null for an empty place) checked: which places'
 * cards stay. The longest run of them already in order stays, each card going
 * to its own place — with every card already in its place in it (UX review
 * round 2: by place, the oldest put last sent every card back). A run of one
 * isn't moved (it would show where a lone card goes): then only a card
 * already in its place stays. Of runs as long, the one moving cards least.
 */
export function check(job: Job, placed: readonly (string | null)[]): boolean[] {
  const n = job.events.length;
  // Each place's card's own place (-1: none).
  const own = job.events.map((_, k) => job.events.findIndex((ev) => ev.id === placed[k]));
  const there = own.flatMap((t, k) => (t === k ? [k] : []));
  let best: number[] = [];
  let moves = 0;
  for (let mask = 1; mask < 1 << n; mask++) {
    const ks = own.flatMap((_, k) => ((mask >> k) & 1 ? [k] : []));
    if (ks.some((k) => own[k] < 0) || there.some((k) => !ks.includes(k)) || ks.some((k, j) => j > 0 && own[k] < own[ks[j - 1]])) continue;
    const m = ks.reduce((sum, k) => sum + Math.abs(own[k] - k), 0);
    if (ks.length > best.length || (ks.length === best.length && m < moves)) [best, moves] = [ks, m];
  }
  const stay = best.length >= 2 ? best : there;
  return job.events.map((_, t) => stay.some((k) => own[k] === t));
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The clue after a check (`stay`: which places' cards stayed): the first empty
 * place, and the card that goes there — the oldest of these, or what came
 * after the card before it (which stayed) — with why (its `why`, naming no
 * other card; on Tricky, with BCE before it, how BCE years count: code review
 * round 2, the oldest too). Only cards on the board are named (code review
 * round 1).
 */
export function clueFor(job: Job, stay: readonly boolean[]): string {
  const k = stay.indexOf(false);
  if (k < 0) return '';
  const r = job.events[k];
  const prev = job.events[k - 1];
  if (job.expert) return `${k ? `After ${prev.said} came ${r.said}` : `Oldest of these: ${r.said}`} — ${expertWhy(job, r, prev)}`;
  if (k === 0) return `Oldest of these: ${r.said} — ${job.years && r.year < 0 ? 'in BCE, a bigger year is longer ago.' : r.why}`;
  let why = r.why;
  if (job.years && prev.year < 0 && r.year < 0) why = 'in BCE, a bigger year is longer ago.';
  else if (job.years && prev.year < 0) why = 'BCE years come before year 1, CE years after it.';
  return `After ${prev.said} came ${r.said} — ${why}`;
}

/**
 * Expert's why, plainly (§8.3), about the card that goes in the gap: its
 * century's years, if it gives one; across BCE and CE, how they count; the
 * card before it's century, in the same era (the 19th century's years, before
 * 1903); in BCE, which way the years go; else the two dates as the cards
 * give them (code review round 1: a BCE century's years for a CE card; UX
 * review round 1: a card not in the slip's century).
 */
function expertWhy(job: Job, r: TimelineEvent, prev?: TimelineEvent): string {
  const years = (ev: TimelineEvent) => `${centuryWords(ev.year)} is the years ${centuryYears(ev.year)}.`;
  if (byCentury(job, r)) return years(r);
  if (!prev) return r.year < 0 ? 'in BCE, a bigger year is longer ago.' : `${cardDate(job, r)} is the earliest of these dates.`;
  if (prev.year < 0 && r.year > 0) return 'BCE years come before year 1, CE years after it.';
  if (byCentury(job, prev)) return years(prev);
  if (r.year < 0) return 'in BCE, a bigger year is longer ago.';
  return `${cardDate(job, prev)} is before ${cardDate(job, r)}.`;
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** After a check: all in order, or how many stayed, and the clue. Short, so it fits a phone's bar whole. */
export function checkWords(job: Job, stay: readonly boolean[]): string {
  const n = stay.filter(Boolean).length;
  const first = job.events[0];
  const last = job.events[job.events.length - 1];
  // Expert, plainly (§8.3).
  const mark = job.expert ? '.' : '!';
  if (n === job.events.length) return `All in order${mark} ${cap(first.said)} first, ${last.said} last.`;
  return `${n > 1 ? `${cap(NUM[n])} in order` : n ? 'One in the right place' : 'Not yet'}${mark} ${clueFor(job, stay)}`;
}

/** Tricky's years, said where a kid sees them (UX review round 1: only on the ticket, hidden on a short screen). */
export const BCE_WORDS = 'BCE means before year 1: the bigger the BCE number, the longer ago. CE years count up from year 1.';

/** Expert's first card dated by its century, its years said: "The 15th century is the years 1401 to 1500." */
export function centuryTip(job: Job): string {
  const ev = job.events.find((x) => byCentury(job, x));
  return ev ? `${cap(centuryWords(ev.year))} is the years ${centuryYears(ev.year)}.` : '';
}

/** The job, as its ticket says it. */
export function jobWords(job: Job): string {
  const set = SET_BY_ID[job.set];
  const n = NUM[job.events.length];
  if (job.expert) return `${set.name}: put the ${n} cards in order, oldest first. A card gives its century where that’s enough to place it, else its year. ${centuryTip(job)} Then: how many years from one to another?`;
  if (job.years) return `${set.name}: put the ${n} cards in order, oldest first. Their years are on them. ${BCE_WORDS}`;
  return `${set.name}: put the ${n} cards in order, oldest first.`;
}

/** A year in a sum: "312 BCE", "1885", "105 CE" — no "about" (the card's year as it is). */
const sumYear = (ev: TimelineEvent) => yearWords({ ...ev, about: false });

/**
 * Expert's question: how many years from one card to another, across BCE and
 * CE — an "about" year taken as it is (UX review round 1: "about 500 BCE",
 * and the answer to the year).
 */
export function spanAsk(job: Job): string {
  if (!job.expert) return '';
  const { from, to } = job.expert.span;
  if (from.about || to.about) return `Say ${from.said} came in ${sumYear(from)} and ${to.said} in ${sumYear(to)}: how many years from one to the other?`;
  return `From ${from.said} (${sumYear(from)}) to ${to.said} (${sumYear(to)}): how many years?`;
}

/** Expert's years from one card to the other: no year 0, so 1 BCE to 1 CE is a year. */
export const spanRight = (job: Job) => (job.expert ? yearsApart(job.expert.span.from, job.expert.span.to) : 0);

/** A slip in the sum: a hundred out, over or under by the drawer. */
const slipOf = (job: Job, right: number) => (job.expert && job.expert.seed % 2 ? right + 100 : right - 100);

/**
 * Six answers, three pairs a year apart: the right one and the year 0 counted,
 * a hundred out (the sum slipped) and that with the year 0, the years taken
 * away and one more — so neither the smaller of the only two a year apart nor
 * a shared ending gives the answer away: only the sum does (code and UX review
 * round 2; round 1: sorted, it was always the middle of three). In an order by
 * the drawer, its seed scrambled first (code review round 2: consecutive seeds
 * put the answer last in every odd round's first drawer).
 */
export function spanChoices(job: Job): number[] {
  if (!job.expert) return [];
  const { from, to } = job.expert.span;
  const right = yearsApart(from, to);
  const slip = slipOf(job, right);
  const away = Math.abs(to.year + from.year);
  return shuffle([right, right + 1, slip, slip + 1, away, away + 1], Math.imul(job.expert.seed, 2654435761) >>> 0);
}

const many = (n: number) => n.toLocaleString('en-GB');

/** How it's worked out: add the BCE year and the CE year, then take 1 — there's no year 0. */
export function spanMethod(job: Job): string {
  if (!job.expert) return '';
  const { from, to } = job.expert.span;
  const a = -from.year;
  return `${a} + ${to.year} = ${many(a + to.year)}, less 1 — there’s no year 0, as 1 BCE is followed by 1 CE: ${many(yearsApart(from, to))} years.`;
}

/** After a pick: right, the way it's worked out; wrong, what's wrong with it — the method's for the next pick. */
export function spanWords(job: Job, picked: number): string {
  if (!job.expert) return '';
  const { from, to } = job.expert.span;
  const right = yearsApart(from, to);
  if (picked === right) return spanMethod(job);
  if (picked === right + 1) return `Not ${many(picked)}: there’s no year 0 — 1 BCE is followed by 1 CE, so take 1.`;
  if (picked === slipOf(job, right)) return `Not ${many(picked)}: add ${sumYear(from)} and ${sumYear(to)} again, carefully — then take 1.`;
  if (picked === slipOf(job, right) + 1) return `Not ${many(picked)}: add ${sumYear(from)} and ${sumYear(to)} again — and there’s no year 0, so take 1.`;
  // Short, the two years in the ask (UX review round 2: three lines at 667 × 375, and the answers moved).
  return `Not ${many(picked)}: BCE years count back, so the two years add up — then take 1.`;
}

/** What a set teaches, for the reward. */
export function learnedLine(job: Job): string {
  const set = SET_BY_ID[job.set];
  if (job.expert) {
    const { from, to } = job.expert.span;
    return `${set.led} From ${sumYear(from)} to ${sumYear(to)} is ${many(yearsApart(from, to))} years: there’s no year 0.`;
  }
  const first = job.events[0];
  const last = job.events[job.events.length - 1];
  return `${set.name}: ${first.said} (${dateOf(job, first)}) came long before ${last.said} (${dateOf(job, last)}). ${set.note}`;
}
