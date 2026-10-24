import type { Band } from '../../content/minigames';

/**
 * 🎵 Echo's Call (docs/DESIGN-MINIGAMES.md §5.5): pitch, melody and reading
 * notes, with Bard Lyra in Chromaria's Music House. Five coloured chimes, C D
 * E F G from low to high. Lyra plays the opening of an old tune; the kid says
 * whether it ended higher, lower or the same as it started, then plays it
 * back. Gentle has three chimes (C D E) and 2–4 notes; Medium all five and 4–6;
 * Tricky reads the tune from a staff, or spots the note Lyra played wrong, with
 * 5–7. Three tunes a round, each a note longer than the last; each echoed is a
 * page of Lyra's songbook. Everything works with the sound off: a chime lights
 * up as it plays, with its colour, its letter and its name. Pure: the chimes,
 * the tunes, the echoes, the checks and the words.
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
export const CHIMES: Record<Band, readonly Note[]> = {
  gentle: ['C', 'D', 'E'],
  medium: NOTES,
  tricky: NOTES,
};

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
export const playable = (band: Band, t: Tune, length: number) => t.opening.slice(0, length).every((n) => CHIMES[band].includes(n));

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
const LENGTHS: Record<Band, readonly [number, number, number]> = {
  gentle: [2, 3, 4],
  medium: [4, 5, 6],
  tricky: [5, 6, 7],
};

/** Tricky's echoes in turn: read one, spot one, read one. */
const TRICKY_MODES: readonly Mode[] = ['staff', 'wrong', 'staff'];

/**
 * Which tunes come up in a round: those not in the songbook yet first (so
 * every round can fill pages), then the rest in turn from where the round
 * would have them — only tunes the band can play at its longest.
 */
export function roundQueue(band: Band, known: (id: TuneId) => boolean, round: number): TuneId[] {
  const can = TUNES.filter((t) => playable(band, t, LENGTHS[band][2])).map((t) => t.id);
  const start = (round * ECHOES_PER_ROUND) % can.length;
  const turn = [...can.slice(start), ...can.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/** The `i`th echo of a round: its tune from the `queue`, its length by its place, its mode by the band. */
export function echoFor(band: Band, round: number, i: number, queue?: readonly TuneId[]): Echo {
  const q = queue ?? roundQueue(band, () => false, round);
  const t = TUNE_BY_ID[q[i % q.length]];
  const notes = t.opening.slice(0, LENGTHS[band][i]);
  const mode: Mode = band === 'tricky' ? TRICKY_MODES[i] : 'ear';
  if (mode !== 'wrong') return { tune: t.id, mode, notes, played: notes, wrongAt: null, chimes: CHIMES[band] };
  // A note in the middle changed by a step — up, unless it's at the top — so the shape around it gives it away.
  const at = 1 + ((round + i) % (notes.length - 2));
  const was = height(notes[at]);
  const now = was === NOTES.length - 1 ? was - 1 : was + 1;
  const played = notes.map((n, k) => (k === at ? NOTES[now] : n));
  return { tune: t.id, mode: 'wrong', notes, played, wrongAt: at, chimes: CHIMES[band] };
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

/** The job, as its ticket says it. */
export function echoWords(echo: Echo): string {
  const n = NUM[echo.notes.length];
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

/** What an echo teaches, for the reward. */
export function learnedLine(echo: Echo): string {
  const t = TUNE_BY_ID[echo.tune];
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
