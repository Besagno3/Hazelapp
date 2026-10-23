import type { PlayBand } from '../../content/minigames';

/**
 * 🎵 Echo's Call (docs/DESIGN-MINIGAMES.md §5.5): pitch, melody and reading
 * notes, with Bard Lyra in Chromaria's Music House. Five coloured chimes, C D
 * E F G from low to high. Lyra plays the opening of an old tune; the kid says
 * whether it ended higher, lower or the same as it started, then plays it
 * back. Gentle has three chimes (C D E) and 2–4 notes; Medium all five and 4–6;
 * Tricky reads the tune from a staff, or spots the note Lyra played wrong, with
 * 5–7. Expert (§8.5) reads or hears 5–7 and names the interval between two of
 * its notes — a minor or major 2nd or 3rd, a perfect 4th or 5th — instead of
 * its shape. Three tunes a round, each a note longer than the last; each
 * echoed is a page of Lyra's songbook. Everything works with the sound off: a
 * chime lights up as it plays, with its colour, its letter and its name. Pure:
 * the chimes, the tunes, the echoes, the intervals, the checks and the words.
 */

/** The chimes, low to high. */
export const NOTES = ['C', 'D', 'E', 'F', 'G'] as const;
export type Note = (typeof NOTES)[number];

/** A chime's colour (red low to blue high, like a rainbow) — always shown with its letter and name. */
export const CHIME: Record<Note, { colour: string; name: string; hz: number }> = {
  C: { colour: '#e8483f', name: 'red', hz: 261.63 },
  D: { colour: '#f28a2e', name: 'orange', hz: 293.66 },
  E: { colour: '#f2c233', name: 'yellow', hz: 329.63 },
  F: { colour: '#3fa34d', name: 'green', hz: 349.23 },
  G: { colour: '#3b6fd8', name: 'blue', hz: 392.0 },
};

/** How high a note is: C 0 … G 4. */
export const height = (n: Note) => NOTES.indexOf(n);

/** The chimes a band plays on. */
export const CHIMES: Record<PlayBand, readonly Note[]> = {
  gentle: ['C', 'D', 'E'],
  medium: NOTES,
  tricky: NOTES,
  expert: NOTES,
};

/** Semitones up from C, as a piano's keys count them: E to F is the one step with no black key between. */
export const SEMITONES: Record<Note, number> = { C: 0, D: 2, E: 4, F: 5, G: 7 };

/** The intervals two of the chimes make (Expert, §8.5), in the order their buttons show them. */
export const INTERVALS = ['m2', 'M2', 'm3', 'M3', 'P4', 'P5'] as const;
export type Interval = (typeof INTERVALS)[number];

/** An interval, said: "a minor 3rd". */
export const INTERVAL_NAME: Record<Interval, string> = {
  m2: 'minor 2nd',
  M2: 'major 2nd',
  m3: 'minor 3rd',
  M3: 'major 3rd',
  P4: 'perfect 4th',
  P5: 'perfect 5th',
};

/** The interval from one note to another (either way), or null for the same note. */
export function intervalOf(a: Note, b: Note): Interval | null {
  const span = Math.abs(height(a) - height(b)) + 1;
  const semis = Math.abs(SEMITONES[a] - SEMITONES[b]);
  if (span === 1) return null;
  if (span === 2) return semis === 1 ? 'm2' : 'M2';
  if (span === 3) return semis === 3 ? 'm3' : 'M3';
  return span === 4 ? 'P4' : 'P5';
}

/**
 * Lyra's songbook (the collection, §5.5): the openings of eight old tunes, all
 * long out of copyright, each on the five chimes. Each page has a true thing
 * about it.
 */
export const TUNE_IDS = ['hot-cross-buns', 'mary', 'frere-jacques', 'au-clair', 'aunt-rhody', 'ode-to-joy', 'old-macdonald', 'lightly-row'] as const;
export type TuneId = (typeof TUNE_IDS)[number];

export interface Tune {
  id: TuneId;
  name: string;
  /** Its songbook page. */
  note: string;
  /** Its opening, seven notes. */
  opening: readonly Note[];
}

const tune = (id: TuneId, name: string, notes: string, note: string): Tune => ({ id, name, note, opening: notes.split(' ') as Note[] });

export const TUNES: readonly Tune[] = [
  tune('hot-cross-buns', 'Hot Cross Buns', 'E D C E D C C', 'Long ago, bakers sang it in the street to sell their buns: three notes, each a step lower.'),
  tune('mary', 'Mary Had a Little Lamb', 'E D C D E E E', 'It starts with the same three notes as Hot Cross Buns — then climbs back up.'),
  tune('frere-jacques', 'Frère Jacques', 'C D E C C D E', 'A round: one group starts, and a second starts the same tune a little later. They fit!'),
  tune('au-clair', 'Au Clair de la Lune', 'C C C D E D C', 'A French song about the light of the moon, sung for more than two hundred years.'),
  tune('aunt-rhody', 'Go Tell Aunt Rhody', 'E E D C C D D', 'An old American folk song. Its tune comes from an opera by Jean-Jacques Rousseau, written in 1752.'),
  tune('ode-to-joy', 'Ode to Joy', 'E E F G G F E', 'Beethoven wrote it when he was almost completely deaf. Its notes mostly move one step at a time.'),
  tune('old-macdonald', 'Old MacDonald', 'G G G D E E D', 'A farm song that can go on and on: every verse adds an animal and its noise.'),
  tune('lightly-row', 'Lightly Row', 'G E E F D D C', 'A boating song, often one of the first tunes people learn on a new instrument.'),
];

export const TUNE_BY_ID = Object.fromEntries(TUNES.map((t) => [t.id, t])) as Record<TuneId, Tune>;

/** Can a band play this many notes of a tune on its chimes? */
export const playable = (band: PlayBand, t: Tune, length: number) => t.opening.slice(0, length).every((n) => CHIMES[band].includes(n));

/** How each echo works. `ear`: listen and play it back. `staff`: read it from the staff. `wrong`: Lyra plays one note wrong — which? */
export type Mode = 'ear' | 'staff' | 'wrong';

/** Where a tune ends against where it starts. */
export type Shape = 'higher' | 'lower' | 'same';

interface EchoBase {
  tune: TuneId;
  /** The notes to play back. */
  notes: readonly Note[];
  /** What Lyra plays: the notes — on `wrong`, with one changed. */
  played: readonly Note[];
  /** The band's chimes. */
  chimes: readonly Note[];
  /** Expert: the two notes (0-based, in order) whose interval is asked, instead of the tune's shape. */
  pair: readonly [number, number] | null;
}

/** An echo; on `wrong`, which note Lyra changed (0-based). */
export type Echo = (EchoBase & { mode: 'ear' | 'staff'; wrongAt: null }) | (EchoBase & { mode: 'wrong'; wrongAt: number });

/** Where a note sits on the (treble) staff, said — its place, not its name: reading it is Tricky's job. */
export const PLACE: Record<Note, string> = {
  C: 'on a little line below the staff',
  D: 'just under the staff',
  E: 'on the bottom line',
  F: 'in the bottom space',
  G: 'on the second line',
};

/** The (treble) staff's five lines, top to bottom, as a staff column draws them (C's ledger line under them at 80). */
export const STAFF_LINES = [20, 32, 44, 56, 68] as const;

/** Where a note's head sits on the staff: C on a ledger line under it, each note a half-step (a line to a space) higher. */
export const staffY = (n: Note) => 80 - height(n) * 6;

export const ECHOES_PER_ROUND = 3;

/** Each echo of a round a note longer. */
const LENGTHS: Record<PlayBand, readonly [number, number, number]> = {
  gentle: [2, 3, 4],
  medium: [4, 5, 6],
  tricky: [5, 6, 7],
  expert: [5, 6, 7],
};

/** Tricky's echoes in turn: read one, spot one, read one. Expert's: read one, hear one, read one. */
const TRICKY_MODES: readonly Mode[] = ['staff', 'wrong', 'staff'];
const EXPERT_MODES: readonly Mode[] = ['staff', 'ear', 'staff'];

/**
 * The intervals each tune's Expert echo asks, in turn round by round — ones
 * its first five notes make (tested): most tunes here make only 2nds and
 * 3rds; Ode to Joy has a minor 2nd and 3rd, Old MacDonald a perfect 4th,
 * Lightly Row a 4th, a minor 2nd and 3rd — and, at seven notes, a perfect 5th,
 * always asked where it's there.
 */
export const EXPERT_ASKS: Record<TuneId, readonly Interval[]> = {
  'hot-cross-buns': ['M3', 'M2'],
  mary: ['M2', 'M3'],
  'frere-jacques': ['M3', 'M2'],
  'au-clair': ['M2', 'M3'],
  'aunt-rhody': ['M3', 'M2'],
  'ode-to-joy': ['m2', 'm3'],
  'old-macdonald': ['P4', 'm3'],
  'lightly-row': ['m2', 'P4', 'm3'],
};

/** The first two of the notes (in order) that make an interval, or null. */
export function pairMaking(notes: readonly Note[], want: Interval): [number, number] | null {
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) if (intervalOf(notes[i], notes[j]) === want) return [i, j];
  return null;
}

/** The pair of notes an Expert echo asks about: a perfect 5th where the notes make one, else the tune's turn's. */
export function pairFor(tune: TuneId, notes: readonly Note[], round: number): [number, number] {
  const asks = EXPERT_ASKS[tune];
  return pairMaking(notes, 'P5') ?? pairMaking(notes, asks[round % asks.length]) ?? [0, notes.length - 1];
}

/**
 * Which tunes come up in a round: those not in the songbook yet first (so
 * every round can fill pages), then the rest in turn from where the round
 * would have them — only tunes the band can play at its longest.
 */
export function roundQueue(band: PlayBand, known: (id: TuneId) => boolean, round: number): TuneId[] {
  const can = TUNES.filter((t) => playable(band, t, LENGTHS[band][2])).map((t) => t.id);
  const start = (round * ECHOES_PER_ROUND) % can.length;
  const turn = [...can.slice(start), ...can.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** The `i`th echo of a round: its tune from the `queue`, its length by its place, its mode by the band. */
export function echoFor(band: PlayBand, round: number, i: number, queue?: readonly TuneId[]): Echo {
  const q = queue ?? roundQueue(band, () => false, round);
  const t = TUNE_BY_ID[q[i % q.length]];
  const notes = t.opening.slice(0, LENGTHS[band][i]);
  const mode: Mode = band === 'tricky' ? TRICKY_MODES[i] : band === 'expert' ? EXPERT_MODES[i] : 'ear';
  const pair = band === 'expert' ? pairFor(t.id, notes, round) : null;
  if (mode !== 'wrong') return { tune: t.id, mode, notes, played: notes, wrongAt: null, chimes: CHIMES[band], pair };
  // A note in the middle changed by a step — up, unless it's at the top — so the shape around it gives it away.
  const at = 1 + ((round + i) % (notes.length - 2));
  const was = height(notes[at]);
  const now = was === NOTES.length - 1 ? was - 1 : was + 1;
  const played = notes.map((n, k) => (k === at ? NOTES[now] : n));
  return { tune: t.id, mode: 'wrong', notes, played, wrongAt: at, chimes: CHIMES[band], pair };
}

/** Where a run of notes ends against where it starts. */
export function shape(notes: readonly Note[]): Shape {
  const d = height(notes[notes.length - 1]) - height(notes[0]);
  return d > 0 ? 'higher' : d < 0 ? 'lower' : 'same';
}

/** A chime tapped as the `i`th note of the echo: right, or how the right one sits from it. */
export function judge(echo: Echo, i: number, n: Note): 'right' | Shape {
  const want = echo.notes[i];
  if (n === want) return 'right';
  return height(want) > height(n) ? 'higher' : 'lower';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];

/** A note, said: "E (yellow)". */
export const noteWords = (n: Note) => `${n} (${CHIME[n].name})`;

const ORDINAL_NUM = ['', '', '2nd', '3rd', '4th', '5th'];

/** The interval an Expert echo asks: its two notes, and what they make. */
export function asked(echo: Echo): { a: Note; b: Note; at: readonly [number, number]; interval: Interval } | null {
  if (!echo.pair) return null;
  const [i, j] = echo.pair;
  const interval = intervalOf(echo.notes[i], echo.notes[j]);
  return interval ? { a: echo.notes[i], b: echo.notes[j], at: echo.pair, interval } : null;
}

/** Expert's question: which two notes — by their place in the tune, not their names (finding those is the job). */
export function intervalQuestion(echo: Echo): string {
  const q = asked(echo);
  if (!q) return '';
  const how = echo.mode === 'staff' ? 'Count the lines and spaces from one to the other.' : 'Count the chimes from one to the other.';
  return `From note ${q.at[0] + 1} to note ${q.at[1] + 1}: what interval? ${how}`;
}

/**
 * After the interval's named — the method either way: the letter names
 * counted give the number, the semitones between make it major or minor
 * ("E up to G: 3 letter names, E F G — a 3rd; 3 semitones — minor."). Plain.
 */
export function intervalWords(echo: Echo, said: Interval): string {
  const q = asked(echo);
  if (!q) return '';
  const lo = height(q.a) < height(q.b) ? q.a : q.b;
  const hi = lo === q.a ? q.b : q.a;
  const letters = NOTES.slice(height(lo), height(hi) + 1);
  const semis = Math.abs(SEMITONES[q.a] - SEMITONES[q.b]);
  const way = height(q.b) > height(q.a) ? 'up' : 'down';
  const span = ORDINAL_NUM[letters.length];
  const quality = q.interval.startsWith('m') ? ' — minor' : q.interval.startsWith('M') ? ' — major' : '';
  const method = `${q.a} ${way} to ${q.b}: ${letters.length} letter names, ${letters.join(' ')} — a ${span}; ${semis} semitone${semis === 1 ? '' : 's'}${quality}.`;
  return said === q.interval ? `Yes, a ${INTERVAL_NAME[q.interval]}. ${method}` : `Not a ${INTERVAL_NAME[said]}. ${method} A ${INTERVAL_NAME[q.interval]}.`;
}

/** The job, as its ticket says it. */
export function echoWords(echo: Echo): string {
  const n = NUM[echo.notes.length];
  if (echo.pair && echo.mode === 'staff') return `Read the ${n} notes on the staff: name the interval Lyra asks about, then play them on the chimes.`;
  if (echo.pair) return `Listen to Lyra’s ${n} notes: name the interval she asks about, then play them back.`;
  if (echo.mode === 'staff') return `Read the ${n} notes on the staff, then play them on the chimes.`;
  if (echo.mode === 'wrong') return `Lyra plays ${n} notes — one of them isn’t what the staff says. Which one? Then play it right.`;
  return `Listen to Lyra’s ${n} notes, then play them back on the chimes.`;
}

/** The question about the tune's shape (it may be watched, not heard: the sound's off by default). */
export function shapeQuestion(echo: Echo): string {
  return echo.mode === 'staff'
    ? 'Read the staff: does the last note sit higher, lower or the same as the first?'
    : 'Did the tune end higher, lower or the same as it started? Higher notes are shorter chimes, further right.';
}

/**
 * After the shape's answered. Never scolded. On the staff, the notes are said by their place: reading them is the job.
 * By ear, which way the chimes went (a higher note's a shorter chime, further right — it can look "lower").
 */
export function shapeWords(echo: Echo, said: Shape): string {
  const is = shape(echo.notes);
  const first = echo.notes[0];
  const last = echo.notes[echo.notes.length - 1];
  const staff = echo.mode === 'staff';
  const say = (n: Note) => (staff ? PLACE[n] : `on ${n}`);
  const way = staff ? (is === 'higher' ? ', higher up' : ', lower down') : is === 'higher' ? ' — a shorter chime, further right' : ' — a longer chime, further left';
  const how = is === 'same' ? `it starts and ends ${say(first)}` : `it starts ${say(first)} and ends ${say(last)}${way}`;
  if (said === is) return `Yes — ${is === 'same' ? 'the same' : is}: ${how}.`;
  return `Not quite: ${how}. ${is === 'same' ? 'The same note' : cap(is)}!`;
}

/** After a note on the staff is picked as the wrong one (a wrong-note echo). */
export function spotWords(echo: Echo & { mode: 'wrong' }, at: number): string {
  const w = echo.wrongAt;
  if (at === w) return `Yes — the ${ORDINAL[w]} note! Lyra played ${echo.played[w]}, but the staff says ${echo.notes[w]}.`;
  return `The ${ORDINAL[at]} note was right: the staff says ${echo.notes[at]}, and Lyra played ${echo.played[at]}. Watch the chimes again!`;
}

/** After a chime tapped as the `i`th note: right, or where the right one is — a shorter chime to the right, or a longer one to the left. */
export function tapWords(echo: Echo, i: number, n: Note): string {
  const j = judge(echo, i, n);
  // Counted, so two of the same note in a row are each said (a reader hears a line only when it changes).
  if (j === 'right') return i + 1 === echo.notes.length ? 'That’s the whole tune!' : `${n} — yes! ${i + 1} of ${echo.notes.length}.`;
  return `That was ${n}. The ${ORDINAL[i]} note is ${j} — ${j === 'higher' ? 'a shorter chime, further right' : 'a longer chime, further left'}.`;
}

/** What an echo teaches, for the reward — on Expert, its interval and how it's counted. */
export function learnedLine(echo: Echo): string {
  const t = TUNE_BY_ID[echo.tune];
  const q = asked(echo);
  if (q) {
    const semis = Math.abs(SEMITONES[q.a] - SEMITONES[q.b]);
    const why: Record<Interval, string> = {
      m2: 'a 2nd of 1 semitone is minor (E to F has no black key between)',
      M2: 'a 2nd of 2 semitones is major',
      m3: 'a 3rd of 3 semitones is minor; of 4, major',
      M3: 'a 3rd of 4 semitones is major; of 3, minor',
      P4: 'a 4th of 5 semitones is perfect',
      P5: 'a 5th of 7 semitones is perfect — the first and fifth notes of the scale',
    };
    return `${t.name} starts ${echo.notes.join(' ')}: ${q.a} to ${q.b} is a ${INTERVAL_NAME[q.interval]}, ${semis} semitone${semis === 1 ? '' : 's'} — ${why[q.interval]}.`;
  }
  const s = shape(echo.notes);
  const notes = echo.notes.join(' ');
  if (echo.mode === 'staff') return `${t.name} starts ${notes}. On the treble staff, E sits on the bottom line, F in the space above, G on the next line.`;
  if (echo.mode === 'wrong') {
    const w = echo.wrongAt;
    return `${t.name} starts ${notes}: Lyra’s ${ORDINAL[w]} note was ${echo.played[w]}, a step ${height(echo.played[w]) > height(echo.notes[w]) ? 'too high' : 'too low'}.`;
  }
  const end = s === 'same' ? 'ends on the note it started on' : `ends ${s} than it starts`;
  return `${t.name} starts ${notes}: it ${end}. A higher note is a shorter chime.`;
}
