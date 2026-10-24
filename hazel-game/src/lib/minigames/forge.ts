import type { PlayBand } from '../../content/minigames';

/**
 * 🔨 Word Forge (docs/DESIGN-MINIGAMES.md §5.10): how words are built, with
 * Scrivener Dot at Inkwell Cove. Dot reads out a meaning ("a tall flower with
 * a big round face like the sun"); the kid puts two word parts from the tray
 * on the anvil, in order, and hammers them into a word — the real one meant
 * goes on Dot's word wall. Gentle joins two words into one (sun + flower) and
 * makes more than one (fox + es); Medium builds on a root word with parts at
 * its front and back (un-, re-, pre-; -ful, -less, -er, -est); Tricky joins
 * Greek and Latin roots, each tile saying what it means (tele "far" + scope
 * "look"). Expert (§8.5): Latin and Greek roots, the tiles plain — and once
 * the word's forged, what one of its roots means. Three words a round; each
 * word's family is a page of the wall. Pure: the families, the jobs, the
 * checks and the words.
 */

export const FAMILY_IDS = ['sun', 'rain', 'more', 'help', 'kind', 'view', 'tele', 'micro', 'graph'] as const;
export type FamilyId = (typeof FAMILY_IDS)[number];

export interface Word {
  word: string;
  /** Its two parts, in order; joined as they are, they spell it. */
  parts: readonly [string, string];
  /** What Dot asks for. */
  meaning: string;
}

export interface Family {
  id: FamilyId;
  /** On the wall: "Sun words". */
  name: string;
  /** Its page: how the family's words are built. */
  note: string;
  words: readonly [Word, Word, Word];
}

const w = (word: string, a: string, b: string, meaning: string): Word => ({ word, parts: [a, b], meaning });

/**
 * Tricky's meanings are said in everyday words, not the tiles' (UX review
 * round 1: "a tube for looking at things far away" beside tiles saying "far"
 * and "look" was matching words, not working out a root).
 */
export const FAMILIES: readonly Family[] = [
  {
    id: 'sun',
    name: 'Sun words',
    // Not one of its words: the note's said with each of them (UX review round 1: "sun + flower" with sunrise).
    note: 'Two words joined into one make a compound word. Its meaning comes from both of them.',
    // Only a young sunflower turns to face the sun (UX review round 1).
    words: [w('sunflower', 'sun', 'flower', 'a tall flower with a big round face like the sun'), w('sunshine', 'sun', 'shine', 'the light that shines from the sun'), w('sunrise', 'sun', 'rise', 'when the sun comes up in the morning')],
  },
  {
    id: 'rain',
    name: 'Rain words',
    note: 'Rain makes lots of compound words: rainbow, raincoat, raindrop — and rainfall and rainforest too.',
    words: [w('rainbow', 'rain', 'bow', 'a curve of colours in the sky after rain'), w('raincoat', 'rain', 'coat', 'a coat that keeps the rain off'), w('raindrop', 'rain', 'drop', 'one little drop of rain')],
  },
  {
    id: 'more',
    name: 'More than one',
    note: 'Add -s to make more than one: cats. After s, x, z, ch or sh, add -es — it’s easier to say: foxes, wishes.',
    words: [w('cats', 'cat', 's', 'more than one cat'), w('foxes', 'fox', 'es', 'more than one fox'), w('wishes', 'wish', 'es', 'more than one wish')],
  },
  {
    id: 'help',
    name: 'Help words',
    note: 'One root word grows many: help → helpful (full of help), helpless (without help), helper (one who helps).',
    words: [w('helpful', 'help', 'ful', 'always ready to help, full of help'), w('helpless', 'help', 'less', 'without help, not able to help yourself'), w('helper', 'help', 'er', 'someone who helps')],
  },
  {
    id: 'kind',
    name: 'Kind words',
    note: 'Un- at the front of a word turns it to its opposite: unkind. -er and -est at the end compare: kinder, kindest.',
    words: [w('unkind', 'un', 'kind', 'not kind'), w('kinder', 'kind', 'er', 'more kind'), w('kindest', 'kind', 'est', 'the most kind of all')],
  },
  {
    id: 'view',
    name: 'View words',
    note: 'Pre- means before and re- means again: preview, review. And -er can mean someone who does it: viewer.',
    words: [w('preview', 'pre', 'view', 'a look at something before it starts'), w('review', 're', 'view', 'a look at something again'), w('viewer', 'view', 'er', 'someone who watches')],
  },
  {
    id: 'tele',
    name: 'Tele, “far”',
    note: 'Tele comes from Greek and means far: telescope (far + look), telephone (far + sound), television (far + seeing).',
    words: [
      w('telescope', 'tele', 'scope', 'what you peer through to see the Moon’s craters'),
      w('telephone', 'tele', 'phone', 'what you use to talk to someone in another town'),
      w('television', 'tele', 'vision', 'a screen showing pictures sent from miles away'),
    ],
  },
  {
    id: 'micro',
    name: 'Micro, “small”',
    note: 'Micro comes from Greek and means small: microscope (small + look), microphone (small + sound), microwave (small + wave).',
    // A microphone turns sound into a signal, so a voice can be made louder (code review rounds 1 and 2: it was said to make
    // it louder); a microwave's are about 12 cm, short for radio waves, not tiny.
    words: [
      w('microscope', 'micro', 'scope', 'what a scientist peers into to see germs'),
      w('microphone', 'micro', 'phone', 'what you speak into so a soft voice can fill a hall'),
      w('microwave', 'micro', 'wave', 'an oven that cooks with short, invisible waves'),
    ],
  },
  {
    id: 'graph',
    name: 'Graph, “write”',
    note: 'Graph comes from Greek and means write or draw: photograph (light + write), autograph (self + write), biography (life + writing).',
    words: [
      w('photograph', 'photo', 'graph', 'a picture a camera takes in a flash'),
      w('autograph', 'auto', 'graph', 'a famous person’s name, signed in their own hand'),
      w('biography', 'bio', 'graphy', 'a book telling a real person’s true story'),
    ],
  },
];

export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<FamilyId, Family>;

/**
 * Expert's word (§8.5): built from Latin and Greek roots, its tiles plain —
 * and, once it's forged, the root asked about (`ask`: "What does “sol” mean in
 * solar?"). Its meaning never says the asked root's (so the question isn't
 * read off the ask). Each split is the word's own (code review round 1:
 * aqua + tic and aqua + rium weren't — aquaticus is aqu + -atic).
 */
export interface ExpertWord extends Word {
  ask: string;
}

const x = (word: string, a: string, b: string, meaning: string, ask: string): ExpertWord => ({ word, parts: [a, b], meaning, ask });

/**
 * Expert's words, three a family — each page's on Expert too (§8.4) — each
 * tied to its page where a root can be: the sun's sol, the rain's water, many
 * for more than one, a helper's and a kind word's roots, a viewer's look,
 * tele, micro's measures, graph's writing. Every root in §8.5's list is here:
 * port, dict, spect, aqua, chrono, geo, -logy, -meter (tested).
 */
export const EXPERT_WORDS: Record<FamilyId, readonly [ExpertWord, ExpertWord, ExpertWord]> = {
  sun: [
    x('solar', 'sol', 'ar', 'powered by daylight, like a panel on a roof', 'sol'),
    x('solstice', 'sol', 'stice', 'the longest or the shortest day of the year', 'stice'),
    x('parasol', 'para', 'sol', 'a light umbrella for a sunny day', 'para'),
  ],
  rain: [
    x('aqueduct', 'aque', 'duct', 'a bridge that carries water across a valley', 'duct'),
    x('aquamarine', 'aqua', 'marine', 'a pale blue-green gem, the colour of a tropical sea', 'aqua'),
    x('aquanaut', 'aqua', 'naut', 'a diver who lives under the sea for days at a time', 'naut'),
  ],
  more: [
    x('polygon', 'poly', 'gon', 'a flat shape with three or more straight sides', 'gon'),
    x('multiply', 'multi', 'ply', 'to take a number a given number of times, as in 3 × 4', 'multi'),
    x('polyglot', 'poly', 'glot', 'someone who speaks several languages', 'glot'),
  ],
  help: [
    x('support', 'sup', 'port', 'to hold something up so it doesn’t fall', 'sup'),
    x('assist', 'as', 'sist', 'to help someone with a job', 'sist'),
    x('benefactor', 'bene', 'factor', 'someone who gives money to help a good cause', 'bene'),
  ],
  kind: [
    x('benevolent', 'bene', 'volent', 'kind and generous to others', 'volent'),
    x('sympathy', 'sym', 'pathy', 'being sorry for someone who is sad', 'sym'),
    x('philanthropy', 'phil', 'anthropy', 'giving money or time to help other people', 'phil'),
  ],
  view: [
    x('inspect', 'in', 'spect', 'to check something closely for faults', 'in'),
    x('spectator', 'spect', 'ator', 'someone at a match who isn’t playing in it', 'spect'),
    x('predict', 'pre', 'dict', 'to work out what will happen before it does', 'dict'),
  ],
  tele: [
    x('teleport', 'tele', 'port', 'to vanish and reappear somewhere else, in stories', 'port'),
    x('telegraph', 'tele', 'graph', 'an old machine that sent messages along wires', 'graph'),
    x('telepathy', 'tele', 'pathy', 'reading someone’s thoughts without words, in stories', 'pathy'),
  ],
  micro: [
    x('micrometer', 'micro', 'meter', 'a tool for checking tiny thicknesses, like a hair’s', 'meter'),
    x('microcosm', 'micro', 'cosm', 'a small place that’s like a bigger one in miniature', 'cosm'),
    x('chronometer', 'chrono', 'meter', 'a very exact clock, carried on ships', 'chrono'),
  ],
  graph: [
    x('geography', 'geo', 'graphy', 'the study of lands, seas, countries and maps', 'geo'),
    x('calligraphy', 'calli', 'graphy', 'fancy handwriting done with a special pen', 'calli'),
    x('geology', 'geo', 'logy', 'the science of rocks and how mountains form', 'logy'),
  ],
};

/** What Expert's roots mean — said only once a word's forged, in its question and lesson, and in a hint after a miss. */
export const ROOT_MEANS: Record<string, string> = {
  sol: 'sun', ar: 'to do with', stice: 'standing still', para: 'shield against',
  aqua: 'water', aque: 'water', duct: 'lead', marine: 'of the sea', naut: 'sailor',
  poly: 'many', gon: 'angle', multi: 'many', ply: 'fold', glot: 'tongue',
  sup: 'under', port: 'carry', as: 'towards', sist: 'stand', bene: 'well', factor: 'one who makes',
  volent: 'wishing', sym: 'with', pathy: 'feeling', phil: 'love', anthropy: 'people',
  in: 'into', spect: 'look', ator: 'one who', pre: 'before', dict: 'say',
  tele: 'far', graph: 'write', micro: 'small', meter: 'measure', cosm: 'world', chrono: 'time',
  geo: 'earth', graphy: 'writing', calli: 'beauty', logy: 'study of',
};

/** Other words a root's in, for the lesson ("More with “port”: transport and export"). */
export const ROOT_KIN: Record<string, readonly string[]> = {
  sol: ['solar', 'parasol', 'solstice'],
  para: ['parachute'],
  aqua: ['aquarium', 'aquatic', 'aquamarine'],
  aque: ['aqueous'],
  duct: ['conduct', 'viaduct'],
  marine: ['submarine', 'ultramarine'],
  naut: ['astronaut', 'nautical'],
  poly: ['polygon', 'polyglot', 'polyhedron'],
  gon: ['hexagon', 'octagon'],
  multi: ['multiply', 'multicoloured', 'multitude'],
  sup: ['support', 'suppress', 'supply'],
  port: ['transport', 'export', 'portable'],
  sist: ['insist', 'resist'],
  bene: ['benefit', 'benevolent', 'benefactor'],
  volent: ['malevolent'],
  pathy: ['sympathy', 'telepathy', 'empathy'],
  sym: ['symphony', 'symmetry'],
  phil: ['philosophy', 'philharmonic'],
  in: ['inhale', 'include'],
  spect: ['inspect', 'spectacles', 'respect'],
  ator: ['narrator', 'creator'],
  dict: ['dictionary', 'verdict'],
  tele: ['telescope', 'telephone', 'television'],
  graph: ['autograph', 'photograph', 'paragraph'],
  micro: ['microscope', 'microphone'],
  meter: ['thermometer', 'speedometer'],
  cosm: ['cosmos', 'cosmonaut'],
  chrono: ['chronology', 'chronograph'],
  geo: ['geography', 'geology', 'geometry'],
  graphy: ['biography', 'photography'],
  logy: ['biology', 'zoology'],
};

/**
 * A root with no other word to think of, a clue to its meaning after a wrong
 * pick (code and UX review round 1: "Read what solstice means again." said
 * nothing of standing still).
 */
export const ROOT_CLUE: Record<string, string> = {
  stice: 'At a solstice the sun seems to stop, then turn back.',
  glot: 'It’s the part of your mouth that talks.',
  calli: 'Think what fancy handwriting is meant to be.',
};

/** A root a tile shares with another of another meaning, said in its lesson (code review round 1: para in paragraph). */
export const ROOT_NOTE: Record<string, string> = {
  para: 'Greek para, “beside”, is another: paragraph.',
};

/**
 * The word wall's pages on Expert: each family's name without a meaning (code
 * review round 1: "Graph, “write”" was in sight as "graph" was asked) and its
 * Expert words tied (UX review round 1: the page taught -s, and solar as a
 * compound word).
 */
export const EXPERT_PAGES: Record<FamilyId, { name: string; note: string }> = {
  sun: { name: 'Sun words', note: 'Sol is Latin for the sun: solar, solstice (when the sun seems to stand still), and parasol (a shield against it).' },
  rain: { name: 'Water words', note: 'Aqua is Latin for water: an aqueduct leads it, aquamarine is its colour, and an aquanaut sails under it.' },
  more: { name: 'Many words', note: 'Poly (Greek) and multi (Latin) both mean many: a polygon has many angles, a polyglot many tongues, and to multiply is to fold many times.' },
  help: { name: 'Help words', note: 'Helping, from Latin: support carries from under, assist stands by, and a benefactor does good.' },
  kind: { name: 'Kind words', note: 'Kindness, from Latin and Greek: benevolent wishes well, sympathy feels with, and philanthropy loves people.' },
  view: { name: 'View words', note: 'Spect is Latin for look: to inspect looks into, a spectator looks on — and to predict says before.' },
  tele: { name: 'Tele words', note: 'Tele is Greek for far: teleport carries far, telegraph writes far, telepathy feels far.' },
  micro: { name: 'Micro words', note: 'Meter is Greek for measure: a micrometer measures small things, a chronometer time — and a microcosm is a small world.' },
  graph: { name: 'Graph words', note: 'Geo is Greek for earth: geography writes it, geology studies it — and calligraphy is beautiful writing.' },
};

/** The families each band forges (pages come from every band, §3.3); Expert from all of them (§8.4). */
export const BAND_FAMILIES: Record<PlayBand, readonly FamilyId[]> = {
  gentle: ['sun', 'rain', 'more'],
  medium: ['help', 'kind', 'view'],
  tricky: ['tele', 'micro', 'graph'],
  expert: FAMILY_IDS,
};

/** What a word part means — said on Tricky's tiles, and in Medium's and Tricky's hints. -er has two: `meansIn`. */
export const PART_MEANS: Record<string, string> = {
  un: 'not',
  re: 'again',
  pre: 'before',
  ful: 'full of',
  less: 'without',
  est: 'the most',
  tele: 'far',
  scope: 'look',
  phone: 'sound',
  vision: 'seeing',
  micro: 'small',
  wave: 'wave',
  photo: 'light',
  graph: 'write',
  auto: 'self',
  bio: 'life',
  graphy: 'writing',
};

/** Parts that go at a word's front, and at its back: shown with their hyphen ("un-", "-ful"). */
const FRONT = ['un', 're', 'pre'];
const BACK = ['ful', 'less', 'er', 'est', 's', 'es'];

/** A part as its tile shows it: an add-on with its hyphen; Tricky's and Expert's roots plain. */
export function partText(p: string, band: PlayBand): string {
  if (band === 'tricky' || band === 'expert') return p;
  return FRONT.includes(p) ? `${p}-` : BACK.includes(p) ? `-${p}` : p;
}

/**
 * An end part's hyphen kept with it on a line, for what's shown: a word
 * joiner after it (UX review round 2: "add -" / "es" — what's taught, split
 * in two).
 */
export const keepHyphens = (t: string) => t.replace(/(^|[\s“(])-(?=[a-z])/g, '$1-\u2060');

/** What a part means in this word: -er is "more" (kinder) or "one who" (helper); Expert's roots, theirs. */
function meansIn(job: Job, p: string): string {
  if (job.band === 'expert') return ROOT_MEANS[p] ?? p;
  if (p === 'er') return job.word.meaning.startsWith('more') ? 'more' : 'one who';
  return PART_MEANS[p] ?? p;
}

/**
 * Every real word two tiles of a band's tray can make that isn't asked for,
 * and what it means (code and UX review round 1: "Unless isn't a word",
 * "Suns isn't a word", "Photography isn't a word"). Every pair a tray can
 * make is held to these or a reviewed list of not-words (`forge.test`).
 */
export const ALSO: Record<string, string> = {
  // Gentle.
  suns: 'more than one sun',
  flowers: 'more than one flower',
  bows: 'more than one bow',
  coats: 'more than one coat',
  drops: 'more than one drop',
  rains: 'as in “it rains”',
  shines: 'as in “the sun shines”',
  rises: 'as in “the sun rises”',
  scat: '“go away!”, said to a cat',
  swish: 'the sound of something swung fast',
  ess: 'the name of the letter S',
  sunbow: 'a rainbow in a waterfall’s spray',
  // Medium.
  // A whole sentence a 7-year-old can follow (UX review round 2: "not unless it's sunny").
  unless: 'as in “We’ll play outside unless it rains”',
  lesser: 'smaller, or not as important',
  ester: 'a chemical that often smells of fruit',
  kindless: 'an old, old word for heartless',
  viewless: 'an old word for “unseen”',
  // Tricky.
  telegraph: 'an old machine that sent messages by wire',
  telegraphy: 'sending messages far away by wire',
  telephoto: 'a camera lens for faraway things',
  photography: 'taking pictures with a camera',
  micrograph: 'a photo taken through a microscope',
  micrography: 'writing in very, very tiny letters',
  photophone: 'an 1880 machine that sent sound on light',
  biograph: 'an old name for a film projector',
  bioscope: 'an old name for a cinema',
  // Not the autograph asked for (UX review round 2: "something written in your own hand" sounded the same).
  autography: 'handwriting itself, not a name signed',
  // Expert: the real words its roots make that aren't asked (the rarest — arnaut, symar — left as not-words, looked at).
  argon: 'a gas with no smell or colour, about 1% of the air',
  chronograph: 'a watch with a stopwatch built in',
  chronology: 'the order things happened in',
  dictator: 'a ruler who has all the power and shares none',
  geometer: 'someone who studies geometry, like Euclid',
  indict: 'to charge someone with a crime, in court',
  insist: 'to say firmly that something must be so',
  paragon: 'a perfect example of something',
  paragraph: 'a group of sentences about one idea',
  parameter: 'a setting that shapes how something works',
  polygraph: 'a lie-detector machine',
  supply: 'to give people what they need',
  telemeter: 'a device that measures from far away',
  // Too new for the big dictionary, or missed (code review round 1: "Multimeter isn’t a word").
  multimeter: 'a meter for volts, amps and resistance',
  induct: 'to bring someone into a club or a job, with a welcome',
};

export const JOBS_PER_ROUND = 3;

export interface Job {
  band: PlayBand;
  family: FamilyId;
  /** Expert's: an `ExpertWord`, its root to ask about. */
  word: Word | ExpertWord;
  /** The tray: the word's parts and some others, in a fixed shuffle. */
  tiles: readonly string[];
}

/**
 * Which families come up in a round: each round starts at the next (code
 * review round 1: every round started at the same one), those not on the wall
 * first.
 */
export function roundQueue(band: PlayBand, known: (id: FamilyId) => boolean, round: number): FamilyId[] {
  const can = BAND_FAMILIES[band];
  const start = round % can.length;
  const turn = [...can.slice(start), ...can.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** A small, fixed number from a seed: the same tray every time for a job. */
function rand(seed: number): () => number {
  let x = seed * 9301 + 49297;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

/** How many other parts are in the tray, by band. */
const OTHERS: Record<PlayBand, number> = { gentle: 2, medium: 3, tricky: 4, expert: 4 };

/** Every part an Expert word's made of: Expert's trays draw their others from these. */
const EXPERT_PARTS = (): string[] => [...new Set(FAMILY_IDS.flatMap((id) => EXPERT_WORDS[id].flatMap((x) => x.parts)))];

/**
 * The `i`th word of a round: the family's word for the round, and a tray of
 * its parts and the band's others — for more than one, always the other
 * ending, so -s or -es is the kid's to pick (UX review round 1: in 11 rounds
 * of 12 the tray held only the right one).
 */
export function jobFor(band: PlayBand, round: number, i: number, queue?: readonly FamilyId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  // Expert walks its 27 words in turn, the families first (UX review round 1: by the wall's queue and the round, words came
  // back three rounds on and five not till round 10): rounds 0–2 a word of every family, 0–8 each word once.
  const k = round * JOBS_PER_ROUND + i;
  const family = band === 'expert' ? FAMILY_BY_ID[FAMILY_IDS[k % FAMILY_IDS.length]] : FAMILY_BY_ID[q[i % q.length]];
  // Expert: the family's own word of Latin and Greek roots, the others from every Expert word's parts.
  const word = band === 'expert' ? EXPERT_WORDS[family.id][Math.floor(k / FAMILY_IDS.length) % 3] : family.words[round % family.words.length];
  const r = rand(round * JOBS_PER_ROUND + i + 1);
  const pool = (band === 'expert' ? EXPERT_PARTS() : [...new Set(BAND_FAMILIES[band].flatMap((id) => FAMILY_BY_ID[id].words.flatMap((x) => x.parts)))]).filter((p) => !word.parts.includes(p));
  const ending = family.id === 'more' ? pool.indexOf(word.parts[1] === 's' ? 'es' : 's') : -1;
  const others = ending >= 0 ? pool.splice(ending, 1) : [];
  while (others.length < OTHERS[band] && pool.length) others.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const tiles = [...word.parts, ...others];
  for (let k = tiles.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [tiles[k], tiles[j]] = [tiles[j], tiles[k]];
  }
  return { band, family: family.id, word, tiles };
}

/** Every word the forge knows, by its spelling, and what it means. */
const KNOWN: Record<string, string> = {
  ...Object.fromEntries(FAMILIES.flatMap((f) => f.words.map((x) => [x.word, x.meaning]))),
  ...Object.fromEntries(FAMILY_IDS.flatMap((id) => EXPERT_WORDS[id].map((x) => [x.word, x.meaning]))),
  ...ALSO,
};

/** What the word two parts make means, if it's a real word the forge knows. */
export const realWord = (made: string): string | undefined => KNOWN[made];

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const quoted = (p: string) => `“${p}”`;

/**
 * A hint for the word: which parts to look for — after a try, building on
 * what it got right (UX review round 1: "Sundrop isn't a word. It starts with
 * “sun”" told a kid to do what they'd done).
 */
export function hintFor(job: Job, tried?: readonly [string, string]): string {
  return hintWords(job, tried);
}

function hintWords(job: Job, tried?: readonly [string, string]): string {
  const roots = job.band === 'tricky' || job.band === 'expert';
  const [a, b] = job.word.parts;
  const show = (p: string) => quoted(partText(p, job.band));
  if (job.band === 'expert') return expertHint(job, tried);
  if (tried?.[0] === a) {
    if (roots) return `${show(a)} first is right — now a part meaning ${quoted(meansIn(job, b))}.`;
    if (job.band === 'medium') return FRONT.includes(a) ? `${show(a)} first is right — now the root word.` : `${show(a)} first is right — now an end part meaning ${quoted(meansIn(job, b))}.`;
    return job.family === 'more' ? `${show(a)} first is right — now make it more than one.` : `${show(a)} first is right — the meaning tells you the rest.`;
  }
  if (tried?.[1] === b) {
    if (roots) return `${show(b)} second is right — now a part meaning ${quoted(meansIn(job, a))} first.`;
    if (job.band === 'medium') return FRONT.includes(a) ? `${show(b)} second is right — now a front part meaning ${quoted(meansIn(job, a))}.` : `${show(b)} at the end is right — now the root word.`;
    return `${show(b)} second is right — now the first part.`;
  }
  if (tried && (tried[0] === b || tried[1] === a)) {
    const p = tried[0] === b ? b : a;
    return `${show(p)} is in it — but ${p === a ? 'first' : 'second'}!`;
  }
  // One part, as the other bands' (UX review round 2: both meanings, printed on the tiles, was matching again).
  if (roots) return `It starts with a part meaning ${quoted(meansIn(job, a))}.`;
  if (job.band === 'medium') {
    const affix = FRONT.includes(a) ? a : b;
    return `It ${affix === a ? 'starts' : 'ends'} with a part meaning ${quoted(meansIn(job, affix))}.`;
  }
  if (job.family === 'more') return `Start with ${quoted(a)}, then make it more than one.`;
  return `It starts with ${quoted(a)}.`;
}

/**
 * Expert's hint, plainly: a part by its meaning — but never the root the
 * question will ask about (code review round 1: 44% of misses gave its
 * meaning away), that one by its first letter; a part that means the same as
 * the right one said so (UX review round 1: "multi" for polygon was told to
 * try "many" again).
 */
function expertHint(job: Job, tried?: readonly [string, string]): string {
  const w = job.word as ExpertWord;
  const [a, b] = w.parts;
  const what = (p: string) => (p === w.ask ? `starts with ${quoted(p[0])}` : `means ${quoted(ROOT_MEANS[p])}`);
  const twin = tried?.find((p, k) => p !== w.parts[k] && !!ROOT_MEANS[p] && ROOT_MEANS[p] === ROOT_MEANS[w.parts[k]]);
  // Its meaning not said where it's the asked root's too (multi for multiply's poly).
  if (twin) return `${quoted(twin)} means ${ROOT_MEANS[twin] === ROOT_MEANS[w.ask] ? 'the same' : `${quoted(ROOT_MEANS[twin])} too`} — but ${w.word} takes the other one.`;
  if (tried?.[0] === a) return `${quoted(a)} first is right — the second part ${what(b)}.`;
  if (tried?.[1] === b) return `${quoted(b)} second is right — the first part ${what(a)}.`;
  if (tried && (tried[0] === b || tried[1] === a)) return `${quoted(tried[0] === b ? b : a)} is in it — but ${tried[0] === b ? 'second' : 'first'}.`;
  return w.ask === a ? `The second part ${what(b)}.` : `The first part ${what(a)}.`;
}

/**
 * The anvil's two parts hammered: right, or why not — a real word that means
 * something else (the other way round too: scat), the other way round, the
 * wrong one of -s and -es, two add-ons, an add-on in the wrong place, or no
 * word at all, with a hint that builds on what was right. Never scolded, and
 * short, for the bar on a phone (code and UX review round 1: "Dot wants …"
 * again, under the meaning, was cut off at 320 × 568). Advice that can't
 * lead to another miss (code and UX review round 2: "“re-” goes at the front —
 * try it first!" led to "Rekind isn't a word", and two add-ons went round in
 * a loop): a right part is kept ("Keep “tele”!"), two add-ons need a root
 * word, and an add-on not in the word is said where it goes, with the hint.
 */
export function forgeWords(job: Job, parts: readonly [string, string]): { right: boolean; said: string } {
  const out = forged(job, parts);
  // Expert's plainly (§8.3).
  return job.band === 'expert' ? { right: out.right, said: out.said.replace(/!/g, '.') } : out;
}

function forged(job: Job, parts: readonly [string, string]): { right: boolean; said: string } {
  const made = parts.join('');
  const [x, y] = parts;
  const [a, b] = job.word.parts;
  if (made === job.word.word) return { right: true, said: `${cap(made)}! ${cap(job.word.meaning)}.` };
  const show = (p: string) => quoted(partText(p, job.band));
  const reversed = y + x === job.word.word;
  const keep = x === a ? `Keep ${show(a)}!` : y === b ? `Keep ${show(b)}!` : null;
  const addOns = [x, y].every((p) => FRONT.includes(p) || BACK.includes(p));
  const real = realWord(made);
  if (real) {
    const next = reversed ? 'Try them the other way round!' : (keep ?? (addOns ? (job.band === 'gentle' ? 'Start with a word!' : 'It needs a root word!') : 'Not this one!'));
    return { right: false, said: `${cap(made)} is a real word: ${real}. ${next}` };
  }
  if (reversed) return { right: false, said: `${cap(made)} isn’t a word — try them the other way round!` };
  if ((y === 's' || y === 'es') && !BACK.includes(x)) {
    const end = /(ch|sh|s|x|z)$/.exec(x)?.[1];
    const plural = x + (end ? 'es' : 's');
    const rule = end ? `After ${quoted(end)} it’s -es — easier to say: ${plural}.` : `Just -s here: ${plural}.`;
    return { right: false, said: plural === job.word.word ? rule : `${rule} Not this one, though!` };
  }
  if (addOns && !keep) return { right: false, said: `${job.band === 'gentle' ? 'Both are endings!' : 'Both are add-ons — it needs a root word!'} ${hintFor(job, parts)}` };
  // An add-on where it doesn't go: Medium's rule, not Expert's (code review round 1: "“pre” goes at the front" for solar).
  const astray = keep || job.band === 'expert' ? null : BACK.includes(x) && x !== b ? x : FRONT.includes(y) && y !== a ? y : null;
  if (astray) return { right: false, said: `${show(astray)} goes at the ${BACK.includes(astray) ? 'end' : 'front'}. ${hintFor(job, parts)}` };
  return { right: false, said: `${cap(made)} isn’t a word. ${hintFor(job, parts)}` };
}

/** The ticket: what to forge. */
export function jobWords(job: Job): string {
  if (job.band === 'expert') return `Forge a word that means “${job.word.meaning}”: two roots on the anvil, in order, and hammer. Then: what does one of its roots mean?`;
  return `Forge a word that means “${job.word.meaning}”: put two parts on the anvil, in order, and hammer!`;
}

/** How a word's built: "Telescope: tele (“far”) + scope (“look”)." — the reward recaps the round's three (UX review round 2: only the last). */
export function builtLine(job: Job): string {
  const [a, b] = job.word.parts;
  const means = job.band === 'expert' ? ROOT_MEANS : PART_MEANS;
  const built = job.band === 'tricky' || job.band === 'expert' ? `${a} (${quoted(means[a])}) + ${b} (${quoted(means[b])})` : `${partText(a, job.band)} + ${partText(b, job.band)}`;
  return `${cap(job.word.word)}: ${built}.`;
}

/** What a word teaches, for its card: how it's built, and its family's page — on Expert, other words a root's in. */
export function learnedLine(job: Job): string {
  if (job.band === 'expert') return `${builtLine(job)} ${kinLine(job)}`.trim();
  return `${builtLine(job)} ${FAMILY_BY_ID[job.family].note}`;
}

// ——— Expert's roots (§8.5) ———

/** Expert's word, its root to ask about (`ask`) and the other part. */
function rootsOf(job: Job): { word: string; ask: string; other: string } {
  const w = job.word;
  // Expert's words only (code review round 1: a cast, and a younger word reaching here threw).
  if (!('ask' in w)) throw new Error(`${w.word} isn't an Expert word`);
  const [a, b] = w.parts;
  return { word: w.word, ask: w.ask, other: w.ask === a ? b : a };
}

/** Other words a root's in, said: "More with “port”: transport and export." — the asked root's, else the other part's. */
function kinLine(job: Job): string {
  const { word, ask, other } = rootsOf(job);
  const kin = (r: string) => (ROOT_KIN[r] ?? []).filter((k) => k !== word).slice(0, 2);
  const r = kin(ask).length ? ask : kin(other).length ? other : null;
  if (!r) return '';
  const k = kin(r);
  const note = ROOT_NOTE[ask] ?? ROOT_NOTE[other];
  return `More with ${quoted(r)}: ${k.join(' and ')}.${note ? ` ${note}` : ''}`;
}

/** Expert's question, once the word's forged: "What does “sol” mean in solar?" */
export function rootAsk(job: Job): string {
  const { word, ask } = rootsOf(job);
  return `What does ${quoted(ask)} mean in ${word}?`;
}

/**
 * Four meanings to pick from: the root's, the other part's, and two others —
 * none alike (not "write" beside "writing") — in an order by the word, so
 * where the answer is says nothing.
 */
export function rootChoices(job: Job): string[] {
  const { ask, other } = rootsOf(job);
  const right = ROOT_MEANS[ask];
  const near = (x: string, y: string) => x.slice(0, 4) === y.slice(0, 4);
  const pool = [...new Set(Object.values(ROOT_MEANS))].filter((m) => !near(m, right) && !near(m, ROOT_MEANS[other]));
  const at = FAMILY_IDS.indexOf(job.family) * 3 + EXPERT_WORDS[job.family].findIndex((x) => x.word === job.word.word);
  const r = rand(at + 7);
  const extra: string[] = [];
  while (extra.length < 2) {
    const m = pool.splice(Math.floor(r() * pool.length), 1)[0];
    if (!extra.some((e) => near(e, m))) extra.push(m);
  }
  const all = [right, ROOT_MEANS[other], ...extra];
  for (let k = all.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [all[k], all[j]] = [all[j], all[k]];
  }
  return all;
}

/** A meaning picked: right, and other words the root's in; the other part's meaning; or another, with a word it's in to think of. Plain. */
export function rootWords(job: Job, picked: string): { right: boolean; said: string } {
  const { word, ask, other } = rootsOf(job);
  const right = ROOT_MEANS[ask];
  if (picked === right) return { right: true, said: `Yes: ${quoted(ask)} means ${quoted(right)}. ${learnedLine(job)}` };
  if (picked === ROOT_MEANS[other]) return { right: false, said: `Not ${quoted(picked)}: that’s ${quoted(other)}, the other part of ${word}.` };
  const kin = (ROOT_KIN[ask] ?? []).find((k) => k !== word);
  return { right: false, said: kin ? `Not ${quoted(picked)}. Think of ${kin}: what does it share with ${word}?` : `Not ${quoted(picked)}. ${ROOT_CLUE[ask] ?? `Read what ${word} means again.`}` };
}

export { cap as capitalise };
