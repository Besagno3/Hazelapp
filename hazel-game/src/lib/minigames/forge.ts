import type { Band } from '../../content/minigames';

/**
 * 🔨 Word Forge (docs/DESIGN-MINIGAMES.md §5.10): how words are built, with
 * Scrivener Dot at Inkwell Cove. Dot reads out a meaning ("a tall flower with
 * a big round face like the sun"); the kid puts two word parts from the tray
 * on the anvil, in order, and hammers them into a word — the real one meant
 * goes on Dot's word wall. Gentle joins two words into one (sun + flower) and
 * makes more than one (fox + es); Medium builds on a root word with parts at
 * its front and back (un-, re-, pre-; -ful, -less, -er, -est); Tricky joins
 * Greek and Latin roots, each tile saying what it means (tele "far" + scope
 * "look"). Three words a round; each word's family is a page of the wall.
 * Pure: the families, the jobs, the checks and the words.
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

/** The families each band forges (pages come from every band, §3.3). */
export const BAND_FAMILIES: Record<Band, readonly FamilyId[]> = {
  gentle: ['sun', 'rain', 'more'],
  medium: ['help', 'kind', 'view'],
  tricky: ['tele', 'micro', 'graph'],
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

/** A part as its tile shows it: an add-on with its hyphen; Tricky's roots plain (each says what it means). */
export function partText(p: string, band: Band): string {
  if (band === 'tricky') return p;
  return FRONT.includes(p) ? `${p}-` : BACK.includes(p) ? `-${p}` : p;
}

/**
 * An end part's hyphen kept with it on a line, for what's shown: a word
 * joiner after it (UX review round 2: "add -" / "es" — what's taught, split
 * in two).
 */
export const keepHyphens = (t: string) => t.replace(/(^|[\s“(])-(?=[a-z])/g, '$1-\u2060');

/** What a part means in this word: -er is "more" (kinder) or "one who" (helper). */
function meansIn(job: Job, p: string): string {
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
};

export const JOBS_PER_ROUND = 3;

export interface Job {
  band: Band;
  family: FamilyId;
  word: Word;
  /** The tray: the word's parts and some others, in a fixed shuffle. */
  tiles: readonly string[];
}

/**
 * Which families come up in a round: each round starts at the next (code
 * review round 1: every round started at the same one), those not on the wall
 * first.
 */
export function roundQueue(band: Band, known: (id: FamilyId) => boolean, round: number): FamilyId[] {
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
const OTHERS: Record<Band, number> = { gentle: 2, medium: 3, tricky: 4 };

/**
 * The `i`th word of a round: the family's word for the round, and a tray of
 * its parts and the band's others — for more than one, always the other
 * ending, so -s or -es is the kid's to pick (UX review round 1: in 11 rounds
 * of 12 the tray held only the right one).
 */
export function jobFor(band: Band, round: number, i: number, queue?: readonly FamilyId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  const family = FAMILY_BY_ID[q[i % q.length]];
  const word = family.words[round % family.words.length];
  const r = rand(round * JOBS_PER_ROUND + i + 1);
  const pool = [...new Set(BAND_FAMILIES[band].flatMap((id) => FAMILY_BY_ID[id].words.flatMap((x) => x.parts)))].filter((p) => !word.parts.includes(p));
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
const KNOWN: Record<string, string> = { ...Object.fromEntries(FAMILIES.flatMap((f) => f.words.map((x) => [x.word, x.meaning]))), ...ALSO };

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
  const [a, b] = job.word.parts;
  const show = (p: string) => quoted(partText(p, job.band));
  if (tried?.[0] === a) {
    if (job.band === 'tricky') return `${show(a)} first is right — now a part meaning ${quoted(meansIn(job, b))}.`;
    if (job.band === 'medium') return FRONT.includes(a) ? `${show(a)} first is right — now the root word.` : `${show(a)} first is right — now an end part meaning ${quoted(meansIn(job, b))}.`;
    return job.family === 'more' ? `${show(a)} first is right — now make it more than one.` : `${show(a)} first is right — the meaning tells you the rest.`;
  }
  if (tried?.[1] === b) {
    if (job.band === 'tricky') return `${show(b)} second is right — now a part meaning ${quoted(meansIn(job, a))} first.`;
    if (job.band === 'medium') return FRONT.includes(a) ? `${show(b)} second is right — now a front part meaning ${quoted(meansIn(job, a))}.` : `${show(b)} at the end is right — now the root word.`;
    return `${show(b)} second is right — now the first part.`;
  }
  if (tried && (tried[0] === b || tried[1] === a)) {
    const p = tried[0] === b ? b : a;
    return `${show(p)} is in it — but ${p === a ? 'first' : 'second'}!`;
  }
  // One part, as the other bands' (UX review round 2: both meanings, printed on the tiles, was matching again).
  if (job.band === 'tricky') return `It starts with a part meaning ${quoted(meansIn(job, a))}.`;
  if (job.band === 'medium') {
    const affix = FRONT.includes(a) ? a : b;
    return `It ${affix === a ? 'starts' : 'ends'} with a part meaning ${quoted(meansIn(job, affix))}.`;
  }
  if (job.family === 'more') return `Start with ${quoted(a)}, then make it more than one.`;
  return `It starts with ${quoted(a)}.`;
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
  const astray = keep ? null : BACK.includes(x) && x !== b ? x : FRONT.includes(y) && y !== a ? y : null;
  if (astray) return { right: false, said: `${show(astray)} goes at the ${BACK.includes(astray) ? 'end' : 'front'}. ${hintFor(job, parts)}` };
  return { right: false, said: `${cap(made)} isn’t a word. ${hintFor(job, parts)}` };
}

/** The ticket: what to forge. */
export function jobWords(job: Job): string {
  return `Forge a word that means “${job.word.meaning}”: put two parts on the anvil, in order, and hammer!`;
}

/** How a word's built: "Telescope: tele (“far”) + scope (“look”)." — the reward recaps the round's three (UX review round 2: only the last). */
export function builtLine(job: Job): string {
  const [a, b] = job.word.parts;
  const built = job.band === 'tricky' ? `${a} (${quoted(PART_MEANS[a])}) + ${b} (${quoted(PART_MEANS[b])})` : `${partText(a, job.band)} + ${partText(b, job.band)}`;
  return `${cap(job.word.word)}: ${built}.`;
}

/** What a word teaches, for its card: how it's built, and its family's page. */
export function learnedLine(job: Job): string {
  return `${builtLine(job)} ${FAMILY_BY_ID[job.family].note}`;
}

export { cap as capitalise };
