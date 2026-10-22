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

export interface Event {
  id: string;
  /** On its card. */
  name: string;
  emoji: string;
  /** When: a year (negative: BCE), roughly when it's "about". */
  year: number;
  about?: boolean;
  /** Why it comes after the one before it in its set — the hint when it's placed too early. */
  because: string;
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
  events: readonly Event[];
}

const e = (id: string, name: string, emoji: string, year: number, because: string, about = false): Event => ({ id, name, emoji, year, because, about });

export const SETS: readonly TimelineSet[] = [
  {
    id: 'light',
    name: 'Light',
    emoji: '💡',
    note: 'For most of history, light at night meant a flame. Electric light is only about 150 years old.',
    events: [
      e('fire', 'Firelight in caves', '🔥', -400000, 'Fire came first of all: people lit caves with it long before anything else.', true),
      e('oil-lamp', 'Stone oil lamps', '🪔', -15000, 'An oil lamp is a little fire in a dish — people knew fire long before.', true),
      e('candle', 'Candles', '🕯️', -500, 'Candles need wax and a wick made well — oil lamps were thousands of years older.', true),
      e('gas-lamp', 'Gas street lamps', '🏮', 1807, 'Lighting a whole street took gas pipes — long after candles.'),
      e('bulb', 'Electric light bulb', '💡', 1879, 'A bulb needs electricity in homes — gas lamps lit streets first.'),
      e('neon', 'Neon signs', '🌈', 1910, 'Neon signs glow with electricity too — after the bulb.'),
      e('led', 'LED lights', '🔦', 1962, 'LEDs are tiny electronic lights — much newer than bulbs.'),
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    emoji: '🚲',
    note: 'For thousands of years, nothing on land went faster than a horse. Then engines changed everything in about 100 years.',
    events: [
      e('canoe', 'Dugout canoes', '🛶', -8000, 'A canoe is a hollowed-out log — one of the oldest ways to travel.', true),
      e('wheel', 'The wheel', '🛞', -3500, 'Boats came before wheels: the oldest canoes are thousands of years older.', true),
      e('steam-train', 'Steam train', '🚂', 1804, 'Trains run on wheels — the wheel came thousands of years before.'),
      e('bicycle', 'Bicycle', '🚲', 1817, 'The first bicycle (with no pedals yet!) came just after the first steam trains.'),
      e('car', 'Car with an engine', '🚗', 1886, 'A car needs an engine small enough to carry — after bicycles and trains.'),
      e('plane', 'Aeroplane', '✈️', 1903, 'Planes need light, strong engines like cars’ — so cars came first.'),
      e('bullet-train', 'Bullet train', '🚄', 1964, 'The bullet train is a very fast electric train — long after the first planes.'),
    ],
  },
  {
    id: 'writing',
    name: 'Writing',
    emoji: '✍️',
    note: 'People told stories for thousands of years before anyone wrote one down. Writing was invented to keep track of grain and goods.',
    events: [
      e('cave-paintings', 'Cave paintings', '🦬', -30000, 'Pictures on cave walls came long before letters.', true),
      e('clay', 'Writing on clay', '🏺', -3200, 'Writing came after pictures — the first writing was marks pressed into clay.', true),
      e('paper', 'Paper', '📜', 105, 'Before paper, people wrote on clay, wax and animal skins.', true),
      e('printing', 'Printing press', '🖨️', 1440, 'A printing press prints on paper — paper came first.', true),
      e('typewriter', 'Typewriter', '⌨️', 1868, 'A typewriter is a small printing machine for one person — after the printing press.'),
      e('ballpoint', 'Ballpoint pen', '🖊️', 1938, 'Ballpoint pens came long after typewriters.'),
      e('email', 'Email', '📧', 1971, 'Email needs computers joined together — very new.'),
    ],
  },
  {
    id: 'flight',
    name: 'Flight',
    emoji: '🪁',
    note: 'People flew kites for over two thousand years before anyone flew themselves.',
    events: [
      e('kite', 'Kites', '🪁', -500, 'Kites were the first things people flew — long, long ago.', true),
      e('balloon', 'Hot-air balloon', '🎈', 1783, 'Balloons were the first way people flew themselves — after kites.'),
      e('glider', 'Glider', '🦅', 1891, 'Gliders flew without engines — people learned to steer in the air before adding one.'),
      e('first-plane', 'First aeroplane', '✈️', 1903, 'The first plane was a glider with an engine — gliders came first.'),
      e('helicopter', 'Helicopter', '🚁', 1939, 'Helicopters are trickier to fly than planes — they came later.'),
      e('jet', 'Jet airliner', '🛫', 1952, 'Jet airliners came after propeller planes and helicopters.'),
      e('moon', 'People walk on the Moon', '🌕', 1969, 'Going to the Moon took rockets and everything learned from planes — so it came after them.'),
    ],
  },
  {
    id: 'food',
    name: 'Food',
    emoji: '🍞',
    note: 'Farming changed everything: once people grew food, they could stay in one place and build villages.',
    events: [
      e('farming', 'Farming begins', '🌾', -10000, 'Before farms, people gathered and hunted their food.', true),
      e('bread', 'Bread baked in ovens', '🍞', -4000, 'Bread needs grain from farms — farming came first.', true),
      e('chocolate', 'A chocolate drink', '🍫', -1500, 'Chocolate was first a bitter drink made from cacao beans — long after the first bread.', true),
      e('cans', 'Food in cans', '🥫', 1810, 'Canned food came long after chocolate drinks.'),
      e('fridge', 'Home fridge', '🧊', 1913, 'A fridge needs electricity at home — after canned food.'),
      e('sliced-bread', 'Sliced bread', '🥪', 1928, 'The bread-slicing machine came fifteen years after the first home fridge.'),
      e('microwave', 'Microwave oven', '📦', 1947, 'Microwave ovens came after sliced bread.'),
    ],
  },
  {
    id: 'music',
    name: 'Music',
    emoji: '🎵',
    note: 'The oldest instruments found are flutes made from bird bones and mammoth ivory, about 40,000 years old.',
    events: [
      e('bone-flute', 'Bone flute', '🦴', -38000, 'Bone flutes are the oldest instruments ever found.', true),
      e('lyre', 'Lyres and harps', '🪕', -2500, 'Harps and lyres came long after the first flutes.', true),
      e('piano', 'Piano', '🎹', 1700, 'Pianos have strings like a harp, struck by hammers — much later.', true),
      e('phonograph', 'Recorded sound', '📯', 1877, 'Before recordings, music only lived while someone played it — pianos came first.'),
      e('radio', 'Radio shows', '📻', 1920, 'Radio sent music through the air — after the first recordings.'),
      e('cassette', 'Cassette tape', '📼', 1963, 'Cassettes held music on tape — after radio.'),
      e('mp3', 'Music on computers (MP3)', '🎧', 1993, 'MP3s are music as computer files — after cassettes.'),
    ],
  },
  {
    id: 'buildings',
    name: 'Buildings',
    emoji: '🏛️',
    note: 'The Great Pyramid was the tallest building in the world for almost 4,000 years.',
    events: [
      e('mud-brick', 'Mud-brick houses', '🛖', -9000, 'Houses of mud bricks came when people first stayed in one place.', true),
      e('pyramid', 'Great Pyramid of Giza', '🔺', -2560, 'The pyramids were built of stone blocks — long after the first brick houses.', true),
      e('aqueduct', 'Roman aqueducts', '🌉', -312, 'Aqueducts carried water to Roman towns — after the pyramids.'),
      e('skyscraper', 'First skyscraper', '🏙️', 1885, 'A skyscraper needs a steel frame and lifts — very new.'),
      e('eiffel', 'Eiffel Tower', '🗼', 1889, 'The Eiffel Tower is made of iron, built just after the first skyscraper.'),
      e('opera-house', 'Sydney Opera House', '🎭', 1973, 'Its roof shells took modern concrete and computers to work out.'),
      e('burj', 'Burj Khalifa', '🏗️', 2010, 'The tallest building in the world — very new.'),
    ],
  },
  {
    id: 'medicine',
    name: 'Medicine',
    emoji: '🩺',
    note: 'Many medicines started as plants: willow bark eased aches long before scientists made aspirin from it.',
    events: [
      e('willow', 'Willow bark for aches', '🌿', -1500, 'People used plants as medicine long, long ago.', true),
      e('glasses', 'Eyeglasses', '👓', 1290, 'Glasses need well-made lenses — long after plant medicines.', true),
      e('microscope', 'Microscope', '🔬', 1590, 'Microscopes use lenses like glasses — glasses came first.', true),
      e('vaccine', 'First vaccine', '💉', 1796, 'The first vaccine came about two hundred years after the microscope.'),
      e('stethoscope', 'Stethoscope', '🩺', 1816, 'Stethoscopes, for listening to hearts, came just after the first vaccine.'),
      e('x-ray', 'X-ray pictures', '🩻', 1895, 'X-rays needed electricity — after the stethoscope.'),
      e('penicillin', 'Penicillin', '🧫', 1928, 'Penicillin, the first antibiotic, was found by chance in a mouldy dish — after X-rays.'),
    ],
  },
];

export const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s])) as Record<SetId, TimelineSet>;

export const JOBS_PER_ROUND = 3;

/** Which of a set's seven events each band puts in order (oldest first), for each job of a round. */
const PICKS: Record<Band, readonly (readonly number[])[]> = {
  // Far apart, so before and after is plain.
  gentle: [
    [0, 3, 6],
    [1, 4, 6],
    [0, 2, 4, 6],
  ],
  medium: [
    [0, 2, 3, 5, 6],
    [1, 2, 4, 5, 6],
    [0, 1, 3, 4, 6],
  ],
  tricky: [
    [0, 1, 2, 3, 4, 5],
    [0, 1, 2, 4, 5, 6],
    [0, 1, 2, 3, 4, 5, 6],
  ],
};

export interface Job {
  set: SetId;
  /** Its cards, oldest first (the right order). */
  events: readonly Event[];
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

/** A shuffle that's the same every time for a seed, never the right order. */
function deal(ids: readonly string[], seed: number): string[] {
  const out = [...ids];
  let x = seed * 9301 + 49297;
  for (let k = out.length - 1; k > 0; k--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor((x / 233280) * (k + 1));
    [out[k], out[j]] = [out[j], out[k]];
  }
  if (out.every((id, k) => id === ids[k])) out.reverse();
  return out;
}

/** The `i`th job of a round. */
export function jobFor(band: Band, round: number, i: number, queue?: readonly SetId[]): Job {
  const q = queue ?? roundQueue(() => false, round);
  const set = SET_BY_ID[q[i % q.length]];
  const events = PICKS[band][i].map((k) => set.events[k]);
  return { set: set.id, events, years: band === 'tricky', dealt: deal(events.map((ev) => ev.id), round * JOBS_PER_ROUND + i + 1) };
}

/** A year, said: "1879", "about 3500 BCE", "about 400,000 BCE" (BCE years count down to year 1). */
export function yearWords(ev: Event): string {
  const a = Math.abs(ev.year);
  // A four-figure year as it's written (1879, 3500 BCE); a bigger one with a comma (15,000 BCE).
  const n = a < 10000 ? String(a) : a.toLocaleString('en-GB');
  return `${ev.about ? 'about ' : ''}${n}${ev.year < 0 ? ' BCE' : ev.year < 1000 ? ' CE' : ''}`;
}

/** Placed cards (ids, by place; null for an empty place) checked against the right order: which places are right. */
export function check(job: Job, placed: readonly (string | null)[]): boolean[] {
  return job.events.map((ev, k) => placed[k] === ev.id);
}

/**
 * The hint for a card placed in the wrong place: why it goes where it goes —
 * after the one before it in the right order (its `because`), or, the oldest,
 * that it's the oldest of all. On Tricky, the years' order is said too.
 */
export function hintFor(job: Job, id: string): string {
  const k = job.events.findIndex((ev) => ev.id === id);
  const ev = job.events[k];
  if (!ev) return '';
  if (job.years && k > 0 && job.events[k - 1].year < 0 && ev.year < 0) {
    // The years are on the cards: not said again (it fits the bar under the board on a short screen).
    return `${ev.name} came after ${job.events[k - 1].name} — in BCE, a bigger year is longer ago.`;
  }
  if (k === 0) return `${ev.name} is the oldest of these — it goes first.`;
  return ev.because;
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** After a check: all in order, or how many are, and one's hint. */
export function checkWords(job: Job, right: readonly boolean[], placed: readonly (string | null)[]): string {
  const n = right.filter(Boolean).length;
  if (n === job.events.length) return `All in order! ${job.events[0].name} first, ${job.events[job.events.length - 1].name} last.`;
  const wrong = placed.find((id, k) => id && !right[k]);
  const hint = wrong ? ` ${hintFor(job, wrong)}` : '';
  // Short — the others are seen floating back — so the clue fits a phone's bar whole (bench: it was cut at four lines).
  return `${n ? `${NUM[n].charAt(0).toUpperCase()}${NUM[n].slice(1)} in the right place!` : 'Not yet!'}${hint}`;
}

/** The job, as its ticket says it. */
export function jobWords(job: Job): string {
  const set = SET_BY_ID[job.set];
  const n = NUM[job.events.length];
  if (job.years) return `${set.name}: put the ${n} cards in order, oldest first. Their years are on them — BCE years count down to year 1.`;
  return `${set.name}: put the ${n} cards in order, oldest first.`;
}

/** What a set teaches, for the reward. */
export function learnedLine(job: Job): string {
  const set = SET_BY_ID[job.set];
  const first = job.events[0];
  const last = job.events[job.events.length - 1];
  return `${set.name}: ${first.name} (${yearWords(first)}) came long before ${last.name} (${yearWords(last)}). ${set.note}`;
}
