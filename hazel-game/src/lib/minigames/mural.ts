import type { Band } from '../../content/minigames';

/**
 * 🪞 Mirror Mural (docs/DESIGN-MINIGAMES.md §5.4): symmetry and colour mixing,
 * with Madame Hue in Chromaria's Grand Gallery. Half of a pixel picture is
 * painted; the kid mixes the paint it needs from two pots, paints the rest,
 * and holds up the mirror to check. Gentle mirrors across one line (left to
 * right) and mixes red and blue; Medium mirrors across or down and mixes the
 * secondary colours; Tricky mirrors four ways (two lines), turns it half
 * round, or mirrors each colour as its opposite, and mixes tints with white.
 * Three pictures make a round; each finished is a page of the Gallery. Then a
 * free canvas: the kid paints the left half and the mirror paints the rest,
 * and it hangs in the Gallery (one at a time, in their own save). Pure: the
 * colours, the pictures, the jobs, the check and the words.
 */

/** Squares across and down. */
export const SIZE = 6;
const HALF = SIZE / 2;

/** The paints. A colour always shows with its name (§2.4). */
export const COLOURS = ['red', 'yellow', 'blue', 'white', 'orange', 'green', 'purple', 'pink', 'sky', 'cream', 'brown'] as const;
export type Colour = (typeof COLOURS)[number];

export const HEX: Record<Colour, string> = {
  red: '#e8483f',
  yellow: '#f2c233',
  blue: '#3b6fd8',
  white: '#ffffff',
  orange: '#f28a2e',
  green: '#3fa34d',
  purple: '#8e44c9',
  pink: '#f4a3b4',
  sky: '#9cc7f2',
  cream: '#f7e7a6',
  brown: '#8a5a3b',
};

/** How a colour is said: "sky blue", "purple". */
export const NAME: Record<Colour, string> = { ...(Object.fromEntries(COLOURS.map((c) => [c, c])) as Record<Colour, string>), sky: 'sky blue' };

/**
 * A colour's letter, drawn on every square painted with it and on its paint
 * (review round 1): the picture reads without telling colours apart — purple
 * from blue, red from green, cream from bare wall.
 */
export const GLYPH: Record<Colour, string> = { red: 'R', yellow: 'Y', blue: 'B', white: 'W', orange: 'O', green: 'G', purple: 'P', pink: 'Pk', sky: 'Sk', cream: 'Cr', brown: 'Br' };

/** The pots a kid mixes from, by band. */
export type Pot = 'red' | 'yellow' | 'blue' | 'white';
export const POTS: Record<Band, readonly Pot[]> = {
  gentle: ['red', 'yellow', 'blue'],
  medium: ['red', 'yellow', 'blue'],
  tricky: ['red', 'yellow', 'blue', 'white'],
};

/** Pots in a painter's order, so a recipe reads "red and blue". */
const POT_ORDER: readonly Pot[] = ['red', 'yellow', 'blue', 'white'];
const pair = (a: Pot, b: Pot) => [a, b].sort((x, y) => POT_ORDER.indexOf(x) - POT_ORDER.indexOf(y)).join('+');
const MIXES: Record<string, Colour> = {
  [pair('red', 'blue')]: 'purple',
  [pair('red', 'yellow')]: 'orange',
  [pair('yellow', 'blue')]: 'green',
  [pair('red', 'white')]: 'pink',
  [pair('blue', 'white')]: 'sky',
  [pair('yellow', 'white')]: 'cream',
};

/** Two pots mixed — paint, not light: red and blue make purple. A pot with itself is itself. */
export function mix(a: Pot, b: Pot): Colour {
  return a === b ? a : MIXES[pair(a, b)];
}

/** The two pots that make a colour, or null (a pot's own colour, or one no two pots make). */
export function recipe(c: Colour): [Pot, Pot] | null {
  const found = Object.entries(MIXES).find(([, v]) => v === c);
  return found ? (found[0].split('+') as [Pot, Pot]) : null;
}

/** Opposite colours, across the colour wheel: side by side they're brightest, mixed they make brown. */
export const OPPOSITE: Partial<Record<Colour, Colour>> = {
  red: 'green',
  green: 'red',
  yellow: 'purple',
  purple: 'yellow',
  blue: 'orange',
  orange: 'blue',
};

/** A square of a picture: a colour, or bare wall. */
export type Cell = Colour | null;
export type Grid = readonly (readonly Cell[])[];

/** How the painted part makes the rest. */
export type Kind = 'across' | 'down' | 'four' | 'turn' | 'opposite';

/**
 * The square (r, c) is a copy of. `across`: the left half mirrored to the
 * right; `down`: the top half mirrored to the bottom; `four`: the top-left
 * quarter mirrored both ways; `turn`: the top half turned half round onto the
 * bottom; `opposite`: like `across`, each colour its opposite.
 */
export function source(kind: Kind, r: number, c: number): [number, number] {
  const m = SIZE - 1;
  switch (kind) {
    case 'across':
    case 'opposite':
      return [r, c < HALF ? c : m - c];
    case 'down':
      return [r < HALF ? r : m - r, c];
    case 'four':
      return [r < HALF ? r : m - r, c < HALF ? c : m - c];
    case 'turn':
      return r < HALF ? [r, c] : [m - r, m - c];
  }
}

/** Is (r, c) painted already (given), or the kid's to paint? */
export function given(kind: Kind, r: number, c: number): boolean {
  const [sr, sc] = source(kind, r, c);
  return sr === r && sc === c;
}

/**
 * The gallery's nine patterns (the collection, §5.4): 6×6 tiles, each the
 * same across and down (so every kind of mirror fits it), drawn in two colour
 * slots — `a` and `b` — and `.` for bare wall.
 */
export const PATTERN_IDS = ['butterfly', 'window', 'flower', 'diamond', 'snowflake', 'lantern', 'castle', 'star', 'bloom'] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

export interface Pattern {
  id: PatternId;
  name: string;
  /** Its card in the Gallery: a true thing about symmetry or colour. */
  note: string;
  rows: readonly string[];
}

export const PATTERNS: readonly Pattern[] = [
  { id: 'butterfly', name: 'Butterfly', note: 'A butterfly’s two wings are mirror images: fold a wet painting in half and one side prints on the other.', rows: ['a.bb.a', 'aabbaa', '.abba.', '.abba.', 'aabbaa', 'a.bb.a'] },
  { id: 'window', name: 'Window', note: 'Most animals, people too, are nearly the same on their left and right. That’s called bilateral symmetry.', rows: ['.a..a.', 'abaaba', 'abbbba', 'abbbba', 'abaaba', '.a..a.'] },
  { id: 'flower', name: 'Flower', note: 'Many flowers have their petals in a ring, the same all the way round. A buttercup has five.', rows: ['.a..a.', 'aabbaa', '.bbbb.', '.bbbb.', 'aabbaa', '.a..a.'] },
  { id: 'diamond', name: 'Diamond', note: 'A square has four mirror lines: across, down, and corner to corner both ways.', rows: ['..aa..', '.abba.', 'abbbba', 'abbbba', '.abba.', '..aa..'] },
  { id: 'snowflake', name: 'Snowflake', note: 'Every snowflake has six arms, each a copy of the others: it grows the same way in every direction.', rows: ['b.aa.b', '.abba.', 'ab..ba', 'ab..ba', '.abba.', 'b.aa.b'] },
  { id: 'lantern', name: 'Lantern', note: 'Red, yellow and blue are the painter’s primary colours: mixing them makes all sorts of others.', rows: ['..bb..', '.aaaa.', 'abaaba', 'abaaba', '.aaaa.', '..bb..'] },
  { id: 'castle', name: 'Castle', note: 'Opposite colours, like red and green, look brightest side by side — and mixed together they make brown.', rows: ['a.aa.a', 'abbbba', 'ab..ba', 'ab..ba', 'abbbba', 'a.aa.a'] },
  { id: 'star', name: 'Star', note: 'Add white to a colour and you get a tint: red and white make pink, blue and white make sky blue.', rows: ['b.aa.b', '.baab.', 'aabbaa', 'aabbaa', '.baab.', 'b.aa.b'] },
  { id: 'bloom', name: 'Bloom', note: 'A shape that looks the same after half a turn has rotational symmetry — like the letters S, N and Z.', rows: ['..aa..', '.abba.', 'abaaba', 'abaaba', '.abba.', '..aa..'] },
];

export const PATTERN_BY_ID = Object.fromEntries(PATTERNS.map((p) => [p.id, p])) as Record<PatternId, Pattern>;

/** A pattern painted in two colours. */
export function paint(p: Pattern, a: Colour, b: Colour): Grid {
  return p.rows.map((row) => [...row].map((ch) => (ch === 'a' ? a : ch === 'b' ? b : null)));
}

/** One job: a picture, how it's mirrored, and the paints. */
export interface Job {
  pattern: PatternId;
  kind: Kind;
  /** The whole picture as it should end (the given part, and the kid's). */
  goal: Grid;
  /** The paint to mix first: one the kid paints with. */
  mixColour: Colour;
  /** The paints in the palette once it's mixed (the mixed one first). */
  palette: readonly Colour[];
}

type Ask = { kind: Kind; a: Colour; b: Colour };
/**
 * What each band asks for, in turn: the kind of mirror and the picture's two
 * colours — never two a colour-blind eye mixes up (purple and blue, red and
 * green: review round 1), except where opposites are the lesson.
 */
const ASKS: Record<Band, readonly Ask[]> = {
  gentle: [
    { kind: 'across', a: 'purple', b: 'red' },
    { kind: 'across', a: 'purple', b: 'orange' },
    { kind: 'across', a: 'purple', b: 'yellow' },
    { kind: 'across', a: 'purple', b: 'red' },
  ],
  medium: [
    { kind: 'across', a: 'orange', b: 'blue' },
    { kind: 'down', a: 'green', b: 'yellow' },
    { kind: 'across', a: 'purple', b: 'yellow' },
    { kind: 'down', a: 'orange', b: 'purple' },
    { kind: 'across', a: 'green', b: 'blue' },
  ],
  tricky: [
    { kind: 'four', a: 'pink', b: 'purple' },
    { kind: 'turn', a: 'sky', b: 'orange' },
    { kind: 'opposite', a: 'green', b: 'blue' },
    { kind: 'four', a: 'cream', b: 'green' },
    { kind: 'turn', a: 'pink', b: 'blue' },
    { kind: 'opposite', a: 'orange', b: 'red' },
    { kind: 'four', a: 'sky', b: 'red' },
  ],
};

/** The paints for an opposite mirror: all six of the colour wheel, so the kid picks each opposite. */
const WHEEL: readonly Colour[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

export const JOBS_PER_ROUND = 3;

/**
 * Which pictures come up in a round: those not in the Gallery yet first, so
 * every round can fill pages, then the rest in turn from where the round
 * would have them.
 */
export function roundQueue(known: (id: PatternId) => boolean, round: number): PatternId[] {
  const start = (round * JOBS_PER_ROUND) % PATTERN_IDS.length;
  const turn = [...PATTERN_IDS.slice(start), ...PATTERN_IDS.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** The `i`th job of a round: which picture from the `queue`; how it's mirrored and its colours by the slot. */
export function jobFor(band: Band, round: number, i: number, queue?: readonly PatternId[]): Job {
  const slot = round * JOBS_PER_ROUND + i;
  const ask = ASKS[band][slot % ASKS[band].length];
  const pattern = queue?.[i] ?? PATTERN_IDS[slot % PATTERN_IDS.length];
  // Every pattern is its own mirror, so a half turn of one is the top half flipped down too (review round 1): for a
  // turn, the top-right quarter's two colours swap — a pinwheel, the same after half a turn but not in a mirror.
  const base = paint(PATTERN_BY_ID[pattern], ask.a, ask.b).map((row, r) =>
    row.map((v, c) => (ask.kind === 'turn' && r < HALF && c >= HALF && v ? (v === ask.a ? ask.b : ask.a) : v)),
  );
  const goal = base.map((row, r) =>
    row.map((_, c) => {
      const [sr, sc] = source(ask.kind, r, c);
      const v = base[sr][sc];
      return ask.kind === 'opposite' && c >= HALF && v ? (OPPOSITE[v] ?? v) : v;
    }),
  );
  if (ask.kind === 'opposite') {
    const need = [OPPOSITE[ask.a]!, OPPOSITE[ask.b]!];
    const mixColour = need.find((c) => recipe(c)) ?? need[0];
    return { pattern, kind: ask.kind, goal, mixColour, palette: [mixColour, ...WHEEL.filter((c) => c !== mixColour)] };
  }
  return { pattern, kind: ask.kind, goal, mixColour: ask.a, palette: [ask.a, ask.b] };
}

/** The squares the kid paints, in reading order. */
export function toPaint(kind: Kind): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!given(kind, r, c)) out.push([r, c]);
  return out;
}

/** The picture as it starts: the given part painted, the rest bare. */
export function start(job: Job): Cell[][] {
  return job.goal.map((row, r) => row.map((v, c) => (given(job.kind, r, c) ? v : null)));
}

/** The kid's squares that don't match yet. */
export function mismatches(job: Job, painted: Grid): [number, number][] {
  return toPaint(job.kind).filter(([r, c]) => painted[r][c] !== job.goal[r][c]);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n: number) => NUM[n] ?? String(n);

const MIRROR_WORDS: Record<Kind, string> = {
  across: 'Paint the right half as the left half’s mirror.',
  down: 'Paint the bottom half as the top half’s mirror.',
  four: 'Two mirrors: paint the other three quarters so it matches across and down.',
  turn: 'Turn it half round: paint the bottom half as the top half upside down.',
  opposite: 'Paint the right half as the left half’s mirror — in each colour’s opposite.',
};

/** How a kind of mirror is said: "Paint the right half as the left half’s mirror." */
export function mirrorWords(kind: Kind): string {
  return MIRROR_WORDS[kind];
}

/** The job, as its ticket says it. */
export function jobWords(job: Job): string {
  return `${MIRROR_WORDS[job.kind]} Mix ${NAME[job.mixColour]} first.`;
}

/** After two pots are mixed: what they made, against what's needed. Never scolded. */
export function mixWords(a: Pot, b: Pot, need: Colour): string {
  if (a === b) return `That’s just ${a} — mix two different pots.`;
  const got = mix(a, b);
  if (got === need) return `${cap(a)} and ${b} make ${NAME[got]}!`;
  return `${cap(a)} and ${b} make ${NAME[got]} — the picture needs ${NAME[need]}. Try two others!`;
}

/** After the mirror's held up. */
export function checkWords(job: Job, painted: Grid): string {
  const n = mismatches(job, painted).length;
  if (n === 0) return 'A perfect match!';
  return `${cap(num(n))} square${n === 1 ? ' doesn’t match yet — it’s' : 's don’t match yet — they’re'} marked. Look at the square the mirror copies.`;
}

/** What a finished picture teaches, for the reward. */
export function learnedLine(job: Job): string {
  const r = recipe(job.mixColour);
  const made = r ? `${cap(r[0])} and ${r[1]} make ${NAME[job.mixColour]}` : `${cap(NAME[job.mixColour])} is a pot of its own`;
  const why: Record<Kind, string> = {
    across: 'a mirror line down the middle makes the right half the left half flipped',
    down: 'a mirror line across the middle makes the bottom half the top half flipped',
    four: 'two mirror lines make four matching quarters',
    turn: 'half a turn puts the top half upside down at the bottom — that’s rotational symmetry',
    opposite: 'opposite colours sit across the colour wheel: red and green, yellow and purple, blue and orange',
  };
  return `${made}; ${why[job.kind]}.`;
}

/** Paints for the free canvas. */
export const FREE_PALETTE: readonly Colour[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'sky'];

/**
 * The kid's own picture, kept in their save as the name of one flag (§3.5):
 * the left half of the grid, a letter a square (`-` for bare), mirrored to
 * show. Nothing they type; a small grid of colours, shown only to them.
 */
const LETTER: Record<Colour, string> = { red: 'r', yellow: 'y', blue: 'b', white: 'w', orange: 'o', green: 'g', purple: 'p', pink: 'k', sky: 's', cream: 'c', brown: 'n' };
const FROM_LETTER = Object.fromEntries(Object.entries(LETTER).map(([c, l]) => [l, c])) as Record<string, Colour>;

export function encodeMine(picture: Grid): string {
  return picture.map((row) => row.slice(0, HALF).map((v) => (v ? LETTER[v] : '-')).join('')).join('');
}

/** The whole picture from its code, mirrored — or null if it isn't one. */
export function decodeMine(code: string): Grid | null {
  if (code.length !== SIZE * HALF || /[^-rybwogpkscn]/.test(code)) return null;
  const left = Array.from({ length: SIZE }, (_, r) => [...code.slice(r * HALF, (r + 1) * HALF)].map((l) => (l === '-' ? null : FROM_LETTER[l])));
  return left.map((row) => [...row, ...[...row].reverse()]);
}

/** A free canvas: the left half as painted, the right half its mirror. */
export function mirrored(picture: Grid): Cell[][] {
  return picture.map((row) => {
    const left = row.slice(0, HALF);
    return [...left, ...[...left].reverse()];
  });
}
