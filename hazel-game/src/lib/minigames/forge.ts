import type { Band } from '../../content/minigames';

/**
 * 🔨 Word Forge (docs/DESIGN-MINIGAMES.md §5.10): how words are built, with
 * Scrivener Dot at Inkwell Cove. Dot reads out a meaning ("full of help"); the
 * kid puts two word parts from the tray on the anvil, in order, and hammers
 * them into a word — the real one meant goes on Dot's word wall. Gentle joins
 * two words into one (sun + flower) and makes more than one (fox + es); Medium
 * builds on a root word with parts at its front and back (un-, re-, pre-;
 * -ful, -less, -er, -est); Tricky joins Greek and Latin roots, each tile
 * saying what it means (tele "far" + scope "look"). Three words a round; each
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

export const FAMILIES: readonly Family[] = [
  {
    id: 'sun',
    name: 'Sun words',
    note: 'Two words joined into one make a compound word. Its meaning comes from both: sun + flower = sunflower.',
    words: [w('sunflower', 'sun', 'flower', 'a tall flower that turns to face the sun'), w('sunshine', 'sun', 'shine', 'the light that shines from the sun'), w('sunrise', 'sun', 'rise', 'when the sun comes up in the morning')],
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
    words: [w('helpful', 'help', 'ful', 'always ready to help — full of help'), w('helpless', 'help', 'less', 'not able to help yourself — without help'), w('helper', 'help', 'er', 'someone who helps')],
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
    words: [w('telescope', 'tele', 'scope', 'a tube for looking at things far away'), w('telephone', 'tele', 'phone', 'a way to hear a voice from far away'), w('television', 'tele', 'vision', 'a way to see pictures sent from far away')],
  },
  {
    id: 'micro',
    name: 'Micro, “small”',
    note: 'Micro comes from Greek and means small: microscope (small + look), microphone (small + sound), microwave (small + wave).',
    words: [w('microscope', 'micro', 'scope', 'a tool for looking at very small things'), w('microphone', 'micro', 'phone', 'it picks up small sounds and makes them louder'), w('microwave', 'micro', 'wave', 'an oven that cooks with tiny waves')],
  },
  {
    id: 'graph',
    name: 'Graph, “write”',
    note: 'Graph comes from Greek and means write or draw: photograph (light + write), autograph (self + write), biography (life + writing).',
    words: [w('photograph', 'photo', 'graph', 'a picture made with light'), w('autograph', 'auto', 'graph', 'your own name, written by yourself'), w('biography', 'bio', 'graphy', 'the story of someone’s life, written down')],
  },
];

export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<FamilyId, Family>;

/** The families each band forges (pages come from every band, §3.3). */
export const BAND_FAMILIES: Record<Band, readonly FamilyId[]> = {
  gentle: ['sun', 'rain', 'more'],
  medium: ['help', 'kind', 'view'],
  tricky: ['tele', 'micro', 'graph'],
};

/** What a word part means — said on Tricky's tiles, and in Medium's and Tricky's hints. */
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

/** Words the tiles can make that aren't asked for, said so when they're made. */
const ALSO: Record<string, string> = {
  telegraph: 'a way to send writing far away',
};

export const JOBS_PER_ROUND = 3;

export interface Job {
  band: Band;
  family: FamilyId;
  word: Word;
  /** The tray: the word's parts and some others, in a fixed shuffle. */
  tiles: readonly string[];
}

/** Which families come up in a round: those not on the wall first, then the rest in turn. */
export function roundQueue(band: Band, known: (id: FamilyId) => boolean, round: number): FamilyId[] {
  const can = BAND_FAMILIES[band];
  const start = (round * JOBS_PER_ROUND) % can.length;
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

/** The `i`th word of a round: the family's word for the round, and a tray of its parts and the band's others. */
export function jobFor(band: Band, round: number, i: number, queue?: readonly FamilyId[]): Job {
  const q = queue ?? roundQueue(band, () => false, round);
  const family = FAMILY_BY_ID[q[i % q.length]];
  const word = family.words[round % family.words.length];
  const r = rand(round * JOBS_PER_ROUND + i + 1);
  const pool = [...new Set(BAND_FAMILIES[band].flatMap((id) => FAMILY_BY_ID[id].words.flatMap((x) => x.parts)))].filter((p) => !word.parts.includes(p));
  const others: string[] = [];
  while (others.length < OTHERS[band] && pool.length) others.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  const tiles = [...word.parts, ...others];
  for (let k = tiles.length - 1; k > 0; k--) {
    const j = Math.floor(r() * (k + 1));
    [tiles[k], tiles[j]] = [tiles[j], tiles[k]];
  }
  return { band, family: family.id, word, tiles };
}

/** Every word the forge knows, by its spelling. */
const KNOWN: Record<string, string> = { ...Object.fromEntries(FAMILIES.flatMap((f) => f.words.map((x) => [x.word, x.meaning]))), ...ALSO };

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const quoted = (p: string) => `“${p}”`;

/** A hint for the word: which parts to look for. */
export function hintFor(job: Job): string {
  const [a, b] = job.word.parts;
  if (job.band === 'tricky') return `You need a part meaning ${quoted(PART_MEANS[a])} and one meaning ${quoted(PART_MEANS[b])}.`;
  if (job.band === 'medium') {
    const affix = PART_MEANS[a] ? a : b;
    const where = affix === a ? 'starts' : 'ends';
    return PART_MEANS[affix] ? `It ${where} with a part meaning ${quoted(PART_MEANS[affix])}.` : `It ${where} with -${affix}.`;
  }
  if (job.family === 'more') return `Start with ${quoted(a)}, then make it more than one.`;
  return `It starts with ${quoted(a)}.`;
}

/**
 * The anvil's two parts hammered: right, or why not — the other way round, a
 * real word meaning something else, -s for -es, or no word at all — with a
 * hint. Never scolded.
 */
export function forgeWords(job: Job, parts: readonly [string, string]): { right: boolean; said: string } {
  const made = parts.join('');
  if (made === job.word.word) return { right: true, said: `${cap(made)}! ${cap(job.word.meaning)}.` };
  if (parts[1] + parts[0] === job.word.word) return { right: false, said: `${cap(made)} isn’t a word — try them the other way round!` };
  if (KNOWN[made]) return { right: false, said: `${cap(made)} is a real word — it means ${KNOWN[made]}. Dot wants ${quoted(job.word.meaning)}.` };
  if (job.family === 'more' && (parts[1] === 's' || parts[1] === 'es') && parts[0] === job.word.parts[0]) {
    const end = /(ch|sh|s|x|z)$/.exec(parts[0])?.[1];
    return { right: false, said: end ? `After ${quoted(end)} it’s -es — easier to say: ${parts[0]}es.` : `Just -s here: ${parts[0]}s.` };
  }
  return { right: false, said: `${cap(made)} isn’t a word. ${hintFor(job)}` };
}

/** The ticket: what to forge. */
export function jobWords(job: Job): string {
  return `Forge a word that means ${quoted(job.word.meaning)}: put two parts on the anvil, in order, and hammer!`;
}

/** What a word teaches, for its card and the reward: how it's built, and its family's page. */
export function learnedLine(job: Job): string {
  const [a, b] = job.word.parts;
  const built = job.band === 'tricky' ? `${a} (${quoted(PART_MEANS[a])}) + ${b} (${quoted(PART_MEANS[b])})` : `${a} + ${b}`;
  return `${cap(job.word.word)}: ${built}. ${FAMILY_BY_ID[job.family].note}`;
}

export { cap as capitalise };
