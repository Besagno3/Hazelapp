import type { Band } from '../../content/minigames';

/**
 * 📜 Index's Timeline (docs/DESIGN-MINIGAMES.md §5.8): putting things in the
 * order they happened, with Index in the Sunken Archive's card catalog. Soggy
 * cards wash in; the kid puts each on the timeline (tap a card, then a place)
 * and checks: a card in the wrong place floats back with a hint of why ("A
 * bicycle needs wheels, so the wheel came first"). Gentle has 3–4 cards far
 * apart, no years; Medium five across the centuries, no years; Tricky 6–7
 * with their years, BCE and CE. Three sets a round, each a page of Index's
 * timeline book (light, travel, writing, flight, food, music, buildings,
 * medicine). Inventions, discoveries and things people made — no wars,
 * disasters or religion. Pure: the sets, the jobs, the checks and the words.
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
}

const e = (id: string, name: string, said: string, emoji: string, year: number, why: string, about = false): TimelineEvent => ({ id, name, said, emoji, year, why, about });

export const SETS: readonly TimelineSet[] = [
  {
    id: 'light',
    name: 'Light',
    emoji: '💡',
    note: 'For most of history, light at night meant a flame. Electric light is only about 150 years old.',
    events: [
      e('fire', 'Firelight in caves', 'firelight in caves', '🔥', -400000, 'people have lit the dark with fire for hundreds of thousands of years.', true),
      e('oil-lamp', 'Stone oil lamps', 'stone oil lamps', '🪔', -15000, 'an oil lamp is a little fire in a stone dish, from the Stone Age.', true),
      e('candle', 'Candles', 'candles', '🕯️', -500, 'a good candle needs wax and a wick, made with care.', true),
      e('gas-lamp', 'Gas street lamps', 'gas street lamps', '🏮', 1807, 'lighting a whole street took gas pipes under the roads.'),
      e('bulb', 'Electric light bulb', 'the electric light bulb', '💡', 1879, 'a light bulb needs electricity in people’s homes.'),
      e('neon', 'Neon signs', 'neon signs', '🌈', 1910, 'a neon sign is a glass tube of gas that glows with electricity.'),
      e('led', 'First LED light', 'the first LED light', '🔴', 1962, 'an LED is a tiny electronic light — the first ones were small and red.'),
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    emoji: '🚲',
    note: 'For thousands of years, nothing on land went faster than a horse. Then engines changed everything in about 100 years.',
    events: [
      e('canoe', 'Dugout canoes', 'dugout canoes', '🛶', -8000, 'a canoe is a hollowed-out log — one of the oldest ways to travel.', true),
      e('wheel', 'The wheel', 'the wheel', '🛞', -3500, 'the first wheels were made for carts, thousands of years ago.', true),
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
    events: [
      e('kite', 'Kites', 'kites', '🪁', -500, 'kites were the first things people flew.', true),
      e('balloon', 'Hot-air balloon', 'the hot-air balloon', '🎈', 1783, 'a hot-air balloon was the first way people flew themselves.'),
      e('glider', 'Glider with a pilot', 'the glider with a pilot', '🦅', 1853, 'a glider flies with no engine — its pilot had to learn to steer in the air.'),
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
    events: [
      e('mud-brick', 'Mud-brick houses', 'mud-brick houses', '🛖', -9000, 'mud-brick houses came when people first stayed in one place.', true),
      e('pyramid', 'Great Pyramid of Giza', 'the Great Pyramid of Giza', '🔺', -2560, 'the Great Pyramid was built of over two million stone blocks.', true),
      e('aqueduct', 'Roman aqueducts', 'Roman aqueducts', '🌉', -312, 'aqueducts carried water to Roman towns.'),
      e('skyscraper', 'First skyscraper', 'the first skyscraper', '🏙️', 1885, 'a skyscraper needs a steel frame and lifts.'),
      e('eiffel', 'Eiffel Tower', 'the Eiffel Tower', '🗼', 1889, 'the Eiffel Tower is made of iron, built for a world fair.'),
      e('opera-house', 'Sydney Opera House', 'the Sydney Opera House', '🎭', 1973, 'its roof shells took modern concrete and computers to work out.'),
      e('burj', 'Burj Khalifa', 'the Burj Khalifa', '🏗️', 2010, 'it’s the tallest building in the world.'),
    ],
  },
  {
    id: 'medicine',
    name: 'Medicine',
    emoji: '🩺',
    note: 'Many medicines started as plants: willow bark eased aches long before scientists made aspirin from it.',
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

/** Medium's five of a set's seven: every pair of two left out whose cards stay `MIN_GAP` apart, spread over a round. */
function mediumPicks(set: TimelineSet): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++) {
      const ks = [0, 1, 2, 3, 4, 5, 6].filter((k) => k !== a && k !== b);
      if (ks.slice(1).every((k, j) => set.events[k].year - set.events[ks[j]].year >= MIN_GAP)) out.push(ks);
    }
  return out;
}

export interface Job {
  set: SetId;
  /** Its cards, oldest first (the right order). */
  events: readonly TimelineEvent[];
  /** Years on the cards (Tricky). */
  years: boolean;
  /** The order they wash in. */
  dealt: readonly string[];
}

/**
 * Which sets come up in a round: those not in the timeline book yet first,
 * then the rest in turn from where the round would have them.
 */
export function roundQueue(known: (id: SetId) => boolean, round: number): SetId[] {
  const start = (round * JOBS_PER_ROUND) % SET_IDS.length;
  const turn = [...SET_IDS.slice(start), ...SET_IDS.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** A shuffle that's the same every time for a seed. */
function shuffle(ids: readonly string[], seed: number): string[] {
  const out = [...ids];
  let x = seed * 9301 + 49297;
  for (let k = out.length - 1; k > 0; k--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor((x / 233280) * (k + 1));
    [out[k], out[j]] = [out[j], out[k]];
  }
  return out;
}

/**
 * How the cards wash in: a shuffle the same every time for a seed, with at
 * most a third of them where they go (code review round 1: some deals were a
 * swap from done, so tapping them left to right all but solved them).
 */
function deal(ids: readonly string[], seed: number): string[] {
  const most = Math.floor(ids.length / 3);
  for (let t = 0; t < 50; t++) {
    const out = shuffle(ids, seed + t * 7919);
    if (out.filter((id, k) => id === ids[k]).length <= most) return out;
  }
  return [...ids.slice(1), ids[0]];
}

/** The `i`th job of a round. */
export function jobFor(band: Band, round: number, i: number, queue?: readonly SetId[]): Job {
  const q = queue ?? roundQueue(() => false, round);
  const set = SET_BY_ID[q[i % q.length]];
  const at = i % JOBS_PER_ROUND;
  let picks: readonly number[];
  if (band === 'medium') {
    const can = mediumPicks(set);
    picks = can[Math.floor((at * can.length) / JOBS_PER_ROUND)];
  } else picks = PICKS[band][at];
  const events = picks.map((k) => set.events[k]);
  return { set: set.id, events, years: band === 'tricky', dealt: deal(events.map((ev) => ev.id), round * JOBS_PER_ROUND + i + 1) };
}

/** A year, said: "1879", "about 3500 BCE", "about 400,000 BCE" (BCE years count down to year 1). */
export function yearWords(ev: TimelineEvent): string {
  const a = Math.abs(ev.year);
  // A four-figure year as it's written (1879, 3500 BCE); a bigger one with a comma (15,000 BCE).
  const n = a < 10000 ? String(a) : a.toLocaleString('en-GB');
  return `${ev.about ? 'about ' : ''}${n}${ev.year < 0 ? ' BCE' : ev.year < 1000 ? ' CE' : ''}`;
}

/** Now, for "years ago". */
const NOW = 2025;

/**
 * When, for a band whose cards have no years (Gentle, Medium) once a drawer's
 * filed: long ago "about 4,600 years ago", not BCE, which wasn't explained
 * (UX review round 1); a year since year 1 as it is ("1879", "about the year 105").
 */
export function whenWords(ev: TimelineEvent): string {
  if (ev.year > 0) return `${ev.about ? 'about the year ' : ''}${ev.year}`;
  const ago = Number((NOW - ev.year).toPrecision(2));
  return `about ${ago.toLocaleString('en-GB')} years ago`;
}

/** A card's when, as its band says it. */
export const dateOf = (job: Job, ev: TimelineEvent) => (job.years ? yearWords(ev) : whenWords(ev));

/** Placed cards (ids, by place; null for an empty place) checked against the right order: which places are right. */
export function check(job: Job, placed: readonly (string | null)[]): boolean[] {
  return job.events.map((ev, k) => placed[k] === ev.id);
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * The clue after a check: the first place that's wrong, and the card that
 * goes there — the oldest of these, or what came after the card before it —
 * with why (its `why`, naming no other card; on Tricky the years' order).
 * Only cards on the board are named (code review round 1).
 */
export function clueFor(job: Job, placed: readonly (string | null)[]): string {
  const k = job.events.findIndex((ev, j) => placed[j] !== ev.id);
  if (k < 0) return '';
  const r = job.events[k];
  if (k === 0) return `Oldest of these: ${r.said} — ${r.why}`;
  const prev = job.events[k - 1];
  let why = r.why;
  if (job.years && prev.year < 0 && r.year < 0) why = 'in BCE, a bigger year is longer ago.';
  else if (job.years && prev.year < 0) why = 'BCE years come before year 1, CE years after it.';
  return `After ${prev.said} came ${r.said} — ${why}`;
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** After a check: all in order, or how many are, and the clue. Short, so it fits a phone's bar whole. */
export function checkWords(job: Job, right: readonly boolean[], placed: readonly (string | null)[]): string {
  const n = right.filter(Boolean).length;
  const first = job.events[0];
  const last = job.events[job.events.length - 1];
  if (n === job.events.length) return `All in order! ${cap(first.said)} first, ${last.said} last.`;
  return `${n ? `${cap(NUM[n])} in the right place!` : 'Not yet!'} ${cap(clueFor(job, placed))}`;
}

/** Tricky's years, said where a kid sees them (UX review round 1: only on the ticket, hidden on a short screen). */
export const BCE_WORDS = 'BCE means before year 1: the bigger the BCE number, the longer ago. CE years count up from year 1.';

/** The job, as its ticket says it. */
export function jobWords(job: Job): string {
  const set = SET_BY_ID[job.set];
  const n = NUM[job.events.length];
  if (job.years) return `${set.name}: put the ${n} cards in order, oldest first. Their years are on them. ${BCE_WORDS}`;
  return `${set.name}: put the ${n} cards in order, oldest first.`;
}

/** What a set teaches, for the reward. */
export function learnedLine(job: Job): string {
  const set = SET_BY_ID[job.set];
  const first = job.events[0];
  const last = job.events[job.events.length - 1];
  return `${set.name}: ${first.said} (${dateOf(job, first)}) came long before ${last.said} (${dateOf(job, last)}). ${set.note}`;
}
