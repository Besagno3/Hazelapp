import type { Band, PlayBand } from '../../content/minigames';

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
 * and it hangs in the Gallery (one at a time, in their own save). Expert
 * (§8.5) is transformations on a coordinate grid: the kid names the move from
 * a point and its image, then paints the image — reflected in x = 3, y = 3 or
 * y = x, rotated 180° or 90° about (3, 3), or translated by (3, 0); no paint to
 * mix. Pure: the colours, the pictures, the jobs, the check and the words.
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
// Every pair of the four pots is here, so `mix` is total (tested).
const MIXES: Partial<Record<string, Colour>> = {
  [pair('red', 'blue')]: 'purple',
  [pair('red', 'yellow')]: 'orange',
  [pair('yellow', 'blue')]: 'green',
  [pair('red', 'white')]: 'pink',
  [pair('blue', 'white')]: 'sky',
  [pair('yellow', 'white')]: 'cream',
};

/** Two pots mixed — paint, not light: red and blue make purple. A pot with itself is itself. */
export function mix(a: Pot, b: Pot): Colour {
  return a === b ? a : (MIXES[pair(a, b)] ?? a);
}

/** The two pots that make a colour, or null (a pot's own colour, or one no two pots make). */
export function recipe(c: Colour): [Pot, Pot] | null {
  const found = Object.entries(MIXES).find(([, v]) => v === c);
  return found ? (found[0].split('+') as [Pot, Pot]) : null;
}

/** The colour wheel's six. */
export type Wheel = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

/** Opposite colours, across the colour wheel: side by side they're brightest, mixed they make brown. */
export const OPPOSITE: Record<Wheel, Wheel> = {
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

/**
 * How the painted part makes the rest. Expert's moves (§8.5) are its own six:
 * `diag` (a reflection in y = x), `quarter` (quarter turns) and `shift` (a
 * translation) besides `across`, `down` and `turn`.
 */
export type Kind = 'across' | 'down' | 'four' | 'turn' | 'opposite' | 'diag' | 'quarter' | 'shift';
export type Move = Extract<Kind, 'across' | 'down' | 'diag' | 'turn' | 'quarter' | 'shift'>;
/** Expert's moves, in the order its buttons show them (the same every picture). */
export const MOVES: readonly Move[] = ['across', 'down', 'diag', 'turn', 'quarter', 'shift'];

/**
 * The square (r, c) is a copy of. `across`: the left half mirrored to the
 * right; `down`: the top half mirrored to the bottom; `four`: the top-left
 * quarter mirrored both ways; `turn`: the top half turned half round onto the
 * bottom; `opposite`: like `across`, each colour its opposite. Expert's: `diag`:
 * the top-left triangle reflected in the corner-to-corner line y = x (the
 * squares on it are their own); `quarter`: the top-left quarter turned a
 * quarter, a half and three quarters clockwise; `shift`: the left half moved
 * three squares right.
 */
export function source(kind: Kind, r: number, c: number): [number, number] {
  const m = SIZE - 1;
  switch (kind) {
    case 'diag':
      return r + c <= m ? [r, c] : [m - c, m - r];
    case 'quarter':
      if (r < HALF) return c < HALF ? [r, c] : [m - c, r];
      return c < HALF ? [c, m - r] : [m - r, m - c];
    case 'shift':
      return [r, c < HALF ? c : c - HALF];
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
  /** Expert (§8.5): coordinates, no mixing — the move's named from `p` and its image first. */
  expert: boolean;
  /** Expert's A: a point in the painted part whose image says which move it is (each of the six takes it somewhere else). */
  p: Point;
}

/** A point on the canvas's grid: x across, y up, from its bottom-left corner (0 to 6). */
export type Point = readonly [number, number];

/** Where a move takes a point. */
export function mapPoint(move: Move, [x, y]: Point): Point {
  switch (move) {
    case 'across':
      return [SIZE - x, y];
    case 'down':
      return [x, SIZE - y];
    case 'diag':
      return [y, x];
    case 'turn':
      return [SIZE - x, SIZE - y];
    case 'quarter':
      return [y, SIZE - x];
    case 'shift':
      return [x + HALF, y];
  }
}

/** Expert's As, in turn: inside every move's painted part, off every line, and each move takes them somewhere else (tested). */
const POINTS: readonly Point[] = [
  [1, 4],
  [2, 5],
];

/**
 * Keeps an expression on one line (UX review round 1, PR 14: "x / = 3" and
 * "(3, / 3)" broke across lines): no-break spaces round =, − and +, and
 * after a comma inside brackets.
 */
export const tie = (s: string) => s.replace(/ ([=−+]) /g, '\u00a0$1\u00a0').replace(/\([^()]*\)/g, (m) => m.replace(/, /g, ',\u00a0'));

/** A point, said: "(1, 4)", on one line. */
export const pointWords = ([x, y]: Point) => `(${x},\u00a0${y})`;

/** A colour's opposite, if it has one (the wheel's six). */
export const opposite = (c: Colour): Colour | null => (c in OPPOSITE ? OPPOSITE[c as Wheel] : null);

/** An opposite mirror's two colours are the wheel's, so each has its opposite. */
type Ask = { kind: Exclude<Kind, 'opposite'>; a: Colour; b: Colour } | { kind: 'opposite'; a: Wheel; b: Wheel };
/**
 * What each band asks for, in turn: the kind of mirror and the picture's two
 * colours — never two a colour-blind eye mixes up (purple and blue, red and
 * green, red and orange: review rounds 1 and 2), nor green and blue (rarer).
 * An opposite mirror paints the other two of a pair beside them.
 */
const ASKS: Record<PlayBand, readonly Ask[]> = {
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
    { kind: 'across', a: 'green', b: 'purple' },
  ],
  tricky: [
    { kind: 'four', a: 'pink', b: 'purple' },
    { kind: 'turn', a: 'sky', b: 'orange' },
    { kind: 'opposite', a: 'yellow', b: 'blue' },
    { kind: 'four', a: 'cream', b: 'green' },
    { kind: 'turn', a: 'pink', b: 'blue' },
    { kind: 'opposite', a: 'red', b: 'yellow' },
    { kind: 'four', a: 'sky', b: 'red' },
  ],
  // Expert's six moves (§8.5), two rounds of three: the reflections in x = 3 and y = x and the quarter turns, then the
  // translation, the half turn and the reflection in y = 3.
  expert: [
    { kind: 'across', a: 'purple', b: 'yellow' },
    { kind: 'diag', a: 'sky', b: 'orange' },
    { kind: 'quarter', a: 'cream', b: 'purple' },
    { kind: 'shift', a: 'orange', b: 'blue' },
    { kind: 'turn', a: 'pink', b: 'blue' },
    { kind: 'down', a: 'green', b: 'yellow' },
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
export function jobFor(band: PlayBand, round: number, i: number, queue?: readonly PatternId[]): Job {
  const slot = round * JOBS_PER_ROUND + i;
  const expert = band === 'expert';
  // On Expert each pair of rounds turns the order of a round's three moves on one, and gives each move the other A
  // (UX review rounds 1 and 2: from the third round, the picture's number and A gave the move away).
  const k = slot % ASKS[band].length;
  const pair = Math.floor(slot / ASKS.expert.length);
  const at = expert ? k - (k % JOBS_PER_ROUND) + (((k % JOBS_PER_ROUND) + pair) % JOBS_PER_ROUND) : k;
  const p = POINTS[(at + pair) % POINTS.length];
  const ask = ASKS[band][at];
  const pattern = queue?.[i] ?? PATTERN_IDS[slot % PATTERN_IDS.length];
  // Every pattern is its own mirror, so a half turn of one is the top half flipped down too (review round 1): for a
  // turn, the top-right quarter's two colours swap — a pinwheel, the same after half a turn but not in a mirror.
  const painted = paint(PATTERN_BY_ID[pattern], ask.a, ask.b).map((row, r) =>
    row.map((v, c) => (ask.kind === 'turn' && r < HALF && c >= HALF && v ? (v === ask.a ? ask.b : ask.a) : v)),
  );
  const made = (base: Grid): Cell[][] =>
    base.map((row, r) =>
      row.map((_, c) => {
        const [sr, sc] = source(ask.kind, r, c);
        const v = base[sr][sc];
        return ask.kind === 'opposite' && c >= HALF && v ? (opposite(v) ?? v) : v;
      }),
    );
  // On Expert the move is the lesson: a picture no other move paints right (code review round 1).
  const goal = expert ? unfaked(ask.kind, painted, ask.a, ask.b, made) : made(painted);
  if (ask.kind === 'opposite') {
    const need = [OPPOSITE[ask.a], OPPOSITE[ask.b]];
    const mixColour = need.find((c) => recipe(c)) ?? need[0];
    return { pattern, kind: ask.kind, goal, mixColour, palette: [mixColour, ...WHEEL.filter((c) => c !== mixColour)], expert, p };
  }
  return { pattern, kind: ask.kind, goal, mixColour: ask.a, palette: [ask.a, ask.b], expert, p };
}

/** A square to the one it's copied from — the ways a given part could be copied onto the rest. */
type SourceMap = (r: number, c: number) => readonly [number, number];
const M = SIZE - 1;
const OTHER_MAPS: readonly SourceMap[] = [
  ...(['across', 'down', 'four', 'turn', 'diag', 'quarter', 'shift'] as const).map((k): SourceMap => (r, c) => source(k, r, c)),
  // The square's turns and mirrors, whole.
  (r, c) => [c, M - r],
  (r, c) => [M - r, M - c],
  (r, c) => [M - c, r],
  (r, c) => [r, M - c],
  (r, c) => [M - r, c],
  (r, c) => [c, r],
  (r, c) => [M - c, M - r],
  // Slid across, or down.
  (r, c) => [r, c - HALF],
  (r, c) => [r - HALF, c],
  // The quarter turned the wrong way in place: anticlockwise into the top right, clockwise into the bottom left (code
  // review round 2: it pointed into the bottom right). Turned the other way about (3, 3), the picture's the same.
  (r, c) => (r < HALF ? (c < HALF ? [r, c] : [c - HALF, M - HALF - r]) : c < HALF ? [M - HALF - c, r - HALF] : [M - r, M - c]),
];

/**
 * How many other ways of copying the given part onto the kid's paint `goal`
 * too — a reflection where a rotation's asked, or two mirrors for quarter
 * turns (code review round 1, PR 14: every pattern is the same across and
 * down, five corner to corner too). None on Expert (tested).
 */
export function fakes(kind: Kind, goal: Grid): number {
  const kid = toPaint(kind);
  return OTHER_MAPS.filter((f) => {
    let other = false;
    for (const [r, c] of kid) {
      const [sr, sc] = f(r, c);
      if (sr < 0 || sc < 0 || sr >= SIZE || sc >= SIZE || !given(kind, sr, sc) || goal[sr][sc] !== goal[r][c]) return false;
      const [kr, kc] = source(kind, r, c);
      if (sr !== kr || sc !== kc) other = true;
    }
    return other;
  }).length;
}

/** Colour swaps in the given part, tried in turn on Expert: none, the top-left quarter, one side of the diagonal or the other, the top row, the left column. */
const SWAPS: readonly ((r: number, c: number) => boolean)[] = [() => false, (r, c) => r < HALF && c < HALF, (r, c) => r < c, (r, c) => r > c, (r) => r === 0, (_, c) => c === 0];

/** Expert's picture: the first swap of its given part's two colours that leaves both in it and no other move painting it right. */
function unfaked(kind: Kind, base: Grid, a: Colour, b: Colour, made: (g: Grid) => Cell[][]): Cell[][] {
  let last = made(base);
  for (const swap of SWAPS) {
    const g = base.map((row, r) => row.map((v, c) => (given(kind, r, c) && swap(r, c) && v ? (v === a ? b : a) : v)));
    const shown = new Set(g.flatMap((row, r) => row.filter((v, c) => v && given(kind, r, c))));
    last = made(g);
    if (shown.size === 2 && fakes(kind, last) === 0) return last;
  }
  return last;
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
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty'];
/** A count said in words, up to the 27 squares a kid paints: "fourteen", "twenty-one". */
export const num = (n: number) => NUM[n] ?? (n < 40 ? `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${NUM[n % 10]}` : ''}` : String(n));

const MIRROR_WORDS: Record<Kind, string> = {
  across: 'Paint the right half as the left half’s mirror.',
  down: 'Paint the bottom half as the top half’s mirror.',
  four: 'Two mirrors: paint the other three quarters so it matches across and down.',
  turn: 'Turn it half round: paint the bottom half as the top half upside down.',
  opposite: 'Paint the right half as the left half’s mirror — in each colour’s opposite.',
  diag: 'Paint the bottom-right triangle as the top-left one’s mirror, across the corner-to-corner line.',
  quarter: 'Turn the top-left quarter: paint it a quarter turn, a half turn and three quarters round.',
  shift: 'Paint the right half as a copy of the left half, slid across.',
};

/** Each of a table's words kept on one line where they're an expression (`tie`). */
const tied = <K extends string>(t: Record<K, string>) => Object.fromEntries(Object.entries<string>(t).map(([k, v]) => [k, tie(v)])) as Record<K, string>;

/** Expert's moves as its job says them (§8.5): in coordinates, x across and y up from the bottom-left corner. */
const MOVE_WORDS: Record<Move, string> = tied({
  across: 'Reflect the left half in the line x = 3.',
  down: 'Reflect the top half in the line y = 3.',
  diag: 'Reflect the top-left triangle in the line y = x.',
  turn: 'Rotate the top half 180° about the point (3, 3).',
  quarter: 'Rotate the top-left quarter 90°, 180° and 270° clockwise about (3, 3).',
  shift: 'Translate the left half by the vector (3, 0).',
});

/** Expert's moves, as their buttons name them. */
export const MOVE_NAME: Record<Move, string> = tied({
  across: 'Reflect in x = 3',
  down: 'Reflect in y = 3',
  diag: 'Reflect in y = x',
  turn: 'Rotate 180° about (3, 3)',
  quarter: 'Rotate 90° clockwise about (3, 3)',
  shift: 'Translate by (3, 0)',
});

/** Expert's rule for a move, given after a miss (§8.3: a hint after a miss, not a label before). */
const RULE: Record<Move, string> = tied({
  across: 'A reflection in x = 3 takes (x, y) to (6 − x, y).',
  down: 'A reflection in y = 3 takes (x, y) to (x, 6 − y).',
  diag: 'A reflection in y = x swaps the coordinates: (x, y) goes to (y, x).',
  turn: 'A rotation of 180° about (3, 3) takes (x, y) to (6 − x, 6 − y).',
  quarter: 'A quarter turn clockwise about (3, 3) takes (x, y) to (y, 6 − x); do it again for 180° and 270°.',
  shift: 'A translation by (3, 0) takes (x, y) to (x + 3, y).',
});

const isMove = (k: Kind): k is Move => (MOVES as readonly Kind[]).includes(k);

/** How a kind of mirror is said: "Paint the right half as the left half’s mirror." — on Expert, the move. */
export function mirrorWords(kind: Kind, expert = false): string {
  return expert && isMove(kind) ? MOVE_WORDS[kind] : MIRROR_WORDS[kind];
}

/** Expert's rule for a move, after a miss. */
export function ruleWords(kind: Kind): string {
  return isMove(kind) ? RULE[kind] : '';
}

/** A′: where the job's move takes A. */
export const pImage = (job: Job): Point => (isMove(job.kind) ? mapPoint(job.kind, job.p) : job.p);

/** Expert's ask before the move's named: A and its image, A′ — each kept with its point (UX review round 2). */
export function nameAsk(job: Job): string {
  return `A\u00a0${pointWords(job.p)} maps to A′\u00a0${pointWords(pImage(job))}.`;
}

/** The job, as its ticket says it — on Expert, A and A′ till the move's named, then the move. */
export function jobWords(job: Job, named = true): string {
  if (job.expert) return named ? mirrorWords(job.kind, true) : `${nameAsk(job)} Name the move, then paint the image.`;
  return `${MIRROR_WORDS[job.kind]} Mix ${NAME[job.mixColour]} first.`;
}

/** After a move's picked on Expert: where it takes A — and, if that isn't A′, that it isn't. Never scolded. */
export function nameWords(job: Job, picked: Move): string {
  const to = pointWords(mapPoint(picked, job.p));
  if (picked === job.kind) return `${MOVE_NAME[picked]}: A goes to ${to}.`;
  return `${MOVE_NAME[picked]}: A goes to ${to}, not ${pointWords(pImage(job))}. Try another.`;
}

/** After two pots are mixed: what they made, against what's needed. Never scolded. */
export function mixWords(a: Pot, b: Pot, need: Colour): string {
  if (a === b) return `That’s just ${a} — mix two different pots.`;
  const got = mix(a, b);
  if (got === need) return `${cap(a)} and ${b} make ${NAME[got]}!`;
  return `${cap(a)} and ${b} make ${NAME[got]} — the picture needs ${NAME[need]}. Try two others!`;
}

/** The mirror's marks, said: "Two squares don't match yet — they're marked. …" — on Expert, with the move's rule. */
export function markWords(n: number, job?: Job): string {
  const after = job?.expert ? ruleWords(job.kind) : 'Look at the square the mirror copies.';
  return `${cap(num(n))} square${n === 1 ? ' doesn’t match yet — it’s' : 's don’t match yet — they’re'} marked. ${after}`;
}

/** After the mirror's held up. */
export function checkWords(job: Job, painted: Grid): string {
  const n = mismatches(job, painted).length;
  return n === 0 ? 'A perfect match!' : markWords(n, job);
}

const PART: Record<Kind, string> = {
  across: 'the right half',
  down: 'the bottom half',
  four: 'the other three quarters',
  turn: 'the bottom half',
  opposite: 'the right half',
  diag: 'the bottom-right triangle',
  quarter: 'the other three quarters',
  shift: 'the right half',
};

/** The mirror held up before a square is painted (review round 2: it marked them all) — on Expert, plainly. */
export function paintFirstWords(kind: Kind, expert = false): string {
  return expert ? `Paint the image first — ${PART[kind]} — then check it.` : `Paint ${PART[kind]} first, darling — then hold up the mirror!`;
}

/** What Expert's move teaches, for the reward: its rule, and one thing more. */
const MOVE_LEARNED: Record<Move, string> = tied({
  across: 'A reflection in x = 3 takes (x, y) to (6 − x, y): each point lands as far on the other side of the line, straight across.',
  down: 'A reflection in y = 3 takes (x, y) to (x, 6 − y): the line y = 3 is the perpendicular bisector of the segment from each point to its image.',
  diag: 'A reflection in y = x swaps the coordinates: (x, y) goes to (y, x), so the points on the line stay put.',
  turn: 'A rotation of 180° about (3, 3) takes (x, y) to (6 − x, 6 − y) — the same as reflecting in x = 3 and then in y = 3.',
  quarter: 'A quarter turn clockwise about (3, 3) takes (x, y) to (y, 6 − x); the picture looks the same after each quarter turn — rotational symmetry of order 4.',
  shift: 'A translation by (3, 0) adds the vector to every point: (x, y) goes to (x + 3, y), and nothing turns or flips.',
});

/** What a finished picture teaches, for the reward. */
export function learnedLine(job: Job): string {
  if (job.expert && isMove(job.kind)) return MOVE_LEARNED[job.kind];
  const r = recipe(job.mixColour);
  const made = r ? `${cap(r[0])} and ${r[1]} make ${NAME[job.mixColour]}` : `${cap(NAME[job.mixColour])} is a pot of its own`;
  const why: Record<Kind, string> = {
    across: 'a mirror line down the middle makes the right half the left half flipped',
    down: 'a mirror line across the middle makes the bottom half the top half flipped',
    four: 'two mirror lines make four matching quarters',
    turn: 'half a turn puts the top half upside down at the bottom — that’s rotational symmetry',
    opposite: 'opposite colours sit across the colour wheel: red and green, yellow and purple, blue and orange',
    diag: 'a mirror line from corner to corner makes one triangle the other flipped',
    quarter: 'four quarter turns make a whole turn, so each quarter is the one before turned',
    shift: 'sliding a shape moves it without turning or flipping it',
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
