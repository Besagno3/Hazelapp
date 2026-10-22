import type { Band } from '../../content/minigames';

/**
 * ⚙️ Clocktower Gears (docs/DESIGN-MINIGAMES.md §5.3): gear trains. A board of
 * pegs lies between a crank and one of the Clocktower's machines; the kid puts
 * gears on pegs and turns the crank. Gears that touch turn opposite ways, so
 * the number of gears between the crank and the machine decides which way it
 * turns; a ring of gears that pushes itself both ways jams; and only the
 * crank's gear and the machine's decide how fast it turns (a big gear turning
 * a small one makes it go faster — the gears between change only the way).
 * Three machines make a round; each brought back to life is a page. Pure: the
 * boards, the jobs, the run and the words.
 *
 * The pegs sit on a hex grid ("odd-r": odd rows sit half a peg to the right),
 * one peg apart, so a gear on a peg touches a gear on each of its six
 * neighbours. Distances are in pegs; a 16-tooth gear's radius is half a peg.
 * The crank sits left of the board's entry peg and the machine right of its
 * exit peg, each sliding on its axle so that its gear (8, 16 or 24 teeth)
 * touches that peg's gear and no other.
 */

/** Which way something turns, seen from the front. The crank always turns clockwise. */
export type Turn = 'cw' | 'ccw';

export const TEETH = [8, 16, 24] as const;
export type Teeth = (typeof TEETH)[number];

/** A gear's radius, in pegs: its teeth are all the same size, so it grows with them. */
export const radius = (teeth: number) => teeth / 32;

export interface Peg {
  c: number;
  r: number;
}

export interface Board {
  pegs: readonly Peg[];
  /** The peg whose gear the crank turns. */
  entry: number;
  /** The peg whose gear turns the machine. */
  exit: number;
}

/**
 * A board from rows of text: `o` a peg, `E` the entry peg, `X` the exit peg,
 * `.` none. Odd rows (the second) are drawn half a peg to the right.
 */
export function board(rows: readonly string[]): Board {
  const pegs: Peg[] = [];
  let entry = -1;
  let exit = -1;
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      if (ch === 'E') entry = pegs.length;
      if (ch === 'X') exit = pegs.length;
      pegs.push({ c, r });
    }),
  );
  return { pegs, entry, exit };
}

/** Where a peg is, in pegs. */
export function pegAt({ c, r }: Peg): { x: number; y: number } {
  return { x: c + (r % 2) * 0.5, y: (r * Math.sqrt(3)) / 2 };
}

/** Do gears on these two pegs touch? (Hex neighbours.) */
export function touching(a: Peg, b: Peg): boolean {
  const pa = pegAt(a);
  const pb = pegAt(b);
  return Math.abs(Math.hypot(pa.x - pb.x, pa.y - pb.y) - 1) < 1e-6;
}

/** Where the crank and the machine sit for their gears' sizes. */
export function ends(b: Board, crank: number, machine: number): { crank: { x: number; y: number }; machine: { x: number; y: number } } {
  const e = pegAt(b.pegs[b.entry]);
  const x = pegAt(b.pegs[b.exit]);
  return {
    crank: { x: e.x - radius(crank) - radius(16), y: e.y },
    machine: { x: x.x + radius(machine) + radius(16), y: x.y },
  };
}

/** What happens when the crank is turned. */
export type Run =
  /** The machine turns: which way, how many gears between, and how fast against the crank. */
  | { kind: 'turns'; turn: Turn; between: number; speed: number; turning: ReadonlyMap<number, Turn> }
  /** The gears touching the crank turn, but they don't reach the machine. */
  | { kind: 'not-joined'; turning: ReadonlyMap<number, Turn> }
  /** Two touching gears are pushed the same way: nothing can turn. */
  | { kind: 'jammed'; stuck: readonly [number, number] }
  /** No gear touches the crank. */
  | { kind: 'empty' };

const flip = (t: Turn): Turn => (t === 'cw' ? 'ccw' : 'cw');

/**
 * Turn the crank (clockwise) with gears on the pegs in `placed`. Every gear
 * the crank reaches turns the other way from the one turning it; a gear
 * pushed both ways jams the lot. Speed only depends on the crank's gear and
 * the machine's: speed = crank teeth ÷ machine teeth.
 */
export function run(b: Board, placed: ReadonlySet<number>, crank: number, machine: number): Run {
  if (!placed.has(b.entry)) return { kind: 'empty' };
  const turning = new Map<number, Turn>([[b.entry, 'ccw']]);
  const depth = new Map<number, number>([[b.entry, 1]]);
  const queue = [b.entry];
  while (queue.length) {
    const at = queue.shift()!;
    const way = turning.get(at)!;
    for (const next of placed) {
      if (next === at || !touching(b.pegs[at], b.pegs[next])) continue;
      const seen = turning.get(next);
      if (seen === undefined) {
        turning.set(next, flip(way));
        depth.set(next, depth.get(at)! + 1);
        queue.push(next);
      } else if (seen === way) return { kind: 'jammed', stuck: [at, next] };
    }
  }
  const last = turning.get(b.exit);
  if (last === undefined) return { kind: 'not-joined', turning };
  return { kind: 'turns', turn: flip(last), between: depth.get(b.exit)!, speed: crank / machine, turning };
}

/** The Clocktower's machines (the collection, §5.3). */
export const MACHINE_IDS = ['hands', 'bell', 'cuckoo', 'vane', 'moon', 'drum', 'chain', 'orrery', 'mill'] as const;
export type MachineId = (typeof MACHINE_IDS)[number];

export interface Machine {
  id: MachineId;
  /** "the Great Hands" — said in a sentence. */
  name: string;
  /** On its button and its page. */
  short: string;
  emoji: string;
  /** Its page: a true thing about real machines. */
  note: string;
}

export const MACHINES: readonly Machine[] = [
  { id: 'hands', name: 'the Great Hands', short: 'Great Hands', emoji: '🕰️', note: 'In a clock, gears make the minute hand go round twelve times while the hour hand goes round once.' },
  { id: 'bell', name: 'the Hour Bell', short: 'Hour Bell', emoji: '🔔', note: 'Big Ben is the name of the great bell in London’s clock tower — not the tower.' },
  { id: 'cuckoo', name: 'the Cuckoo Door', short: 'Cuckoo Door', emoji: '🐦', note: 'Cuckoo clocks have been made in Germany’s Black Forest for nearly 300 years.' },
  { id: 'vane', name: 'the Weathervane', short: 'Weathervane', emoji: '🧭', note: 'A weathervane’s arrow points to where the wind is coming from.' },
  { id: 'moon', name: 'the Moon Dial', short: 'Moon Dial', emoji: '🌙', note: 'The Moon goes from full to full again in about 29 and a half days. Some old clocks show it on a moon dial.' },
  { id: 'drum', name: 'the Music Drum', short: 'Music Drum', emoji: '🎶', note: 'A music box plays when little pins on a turning drum pluck the teeth of a metal comb.' },
  { id: 'chain', name: 'the Chain Lift', short: 'Chain Lift', emoji: '🚲', note: 'A bike’s chain joins two gears far apart, so the back wheel turns when you pedal.' },
  { id: 'orrery', name: 'the Star Wheel', short: 'Star Wheel', emoji: '🪐', note: 'An orrery is a clockwork model of the planets: turn its handle and they go round the Sun.' },
  { id: 'mill', name: 'the Mill Sails', short: 'Mill Sails', emoji: '🌾', note: 'A windmill’s sails turn big wooden gears, and the gears turn the heavy millstones.' },
];

export const MACHINE_BY_ID = Object.fromEntries(MACHINES.map((m) => [m.id, m])) as Record<MachineId, Machine>;

/** One job: a board, and what the machine must do. */
export interface Job {
  machine: MachineId;
  board: Board;
  /** The way it must turn (Medium and Tricky). */
  turn?: Turn;
  /** Tricky: the machine's gear, and how fast it must turn against the crank. */
  teeth: Teeth;
  speed?: number;
}

/** The boards, by band. Gentle's never make a ring (nothing can jam); the others offer routes of both lengths. */
const BOARDS: Record<Band, readonly Board[]> = {
  gentle: [
    board(['....', 'EooX', '....']),
    board(['.ooo', 'E..X', '....']),
    board(['....', 'Eo.X', '..oo']),
  ],
  medium: [
    board(['.ooo', 'EooX', '....']),
    board(['....', 'EooX', '.ooo']),
    board(['.oo.', 'EooX', '.oo.']),
  ],
  tricky: [
    board(['.ooo', 'EooX', '....']),
    board(['.oo.', 'EooX', '.oo.']),
    board(['....', 'EooX', '.ooo']),
  ],
};

/** What each band asks for, in turn. */
type Ask = { turn?: Turn; teeth?: Teeth; speed?: number };
const ASKS: Record<Band, readonly Ask[]> = {
  gentle: [{}, {}, {}],
  medium: [{ turn: 'cw' }, { turn: 'ccw' }, { turn: 'cw' }, { turn: 'cw' }, { turn: 'ccw' }],
  tricky: [
    { turn: 'cw', teeth: 8, speed: 2 },
    { turn: 'ccw', teeth: 16, speed: 1 / 2 },
    { turn: 'cw', teeth: 8, speed: 3 },
    { turn: 'ccw', teeth: 24, speed: 1 / 3 },
    { turn: 'ccw', teeth: 8, speed: 2 },
    { turn: 'cw', teeth: 16, speed: 1 / 2 },
  ],
};

/** Machines in a round. */
export const JOBS_PER_ROUND = 3;

/**
 * Which machines have stopped, in a round: those not in the book yet first,
 * so every round can fill pages (the stage starts each visit at round 0),
 * then the rest, in turn from where the round would have them.
 */
export function roundQueue(known: (id: MachineId) => boolean, round: number): MachineId[] {
  const start = (round * JOBS_PER_ROUND) % MACHINE_IDS.length;
  const turn = [...MACHINE_IDS.slice(start), ...MACHINE_IDS.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/**
 * The `i`th job of the kid's `round`th round at a band: the board and what's
 * asked go by the slot; which machine, by the round's `queue` (`roundQueue`)
 * or, without one, in turn (three rounds fix all nine).
 */
export function jobFor(band: Band, round: number, i: number, queue?: readonly MachineId[]): Job {
  const slot = round * JOBS_PER_ROUND + i;
  const ask = ASKS[band][slot % ASKS[band].length];
  return {
    machine: queue?.[i] ?? MACHINE_IDS[slot % MACHINE_IDS.length],
    board: BOARDS[band][slot % BOARDS[band].length],
    turn: ask.turn,
    teeth: ask.teeth ?? 16,
    speed: ask.speed,
  };
}

/** The crank's gear sizes a band offers (only Tricky changes it). */
export const CRANK_TEETH: Record<Band, readonly Teeth[]> = { gentle: [16], medium: [16], tricky: TEETH };

/** What a run did, against the job. */
export type Verdict = 'right' | 'empty' | 'not-joined' | 'jammed' | 'wrong-way' | 'too-fast' | 'too-slow';

export function check(job: Job, r: Run): Verdict {
  if (r.kind !== 'turns') return r.kind;
  if (job.turn && r.turn !== job.turn) return 'wrong-way';
  if (job.speed !== undefined && Math.abs(r.speed - job.speed) > 1e-9) return r.speed > job.speed ? 'too-fast' : 'too-slow';
  return 'right';
}

export const turnWords = (t: Turn) => (t === 'cw' ? 'clockwise ↻' : 'anticlockwise ↺');

/** "twice as fast", "half as fast", "the same speed". */
export function speedWords(speed: number): string {
  const s = Math.round(speed * 1000) / 1000;
  if (s === 1) return 'the same speed as the crank';
  if (s === 2) return 'twice as fast as the crank';
  if (s === 3) return 'three times as fast as the crank';
  if (s === 1.5) return 'one and a half times as fast as the crank';
  if (s === 0.5) return 'half as fast as the crank';
  if (Math.abs(s - 1 / 3) < 1e-3) return 'a third as fast as the crank';
  if (Math.abs(s - 2 / 3) < 1e-3) return 'two thirds as fast as the crank';
  return `${s} times as fast as the crank`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The job, as its ticket says it: "Make the Hour Bell turn clockwise ↻, twice as fast as the crank." */
export function jobWords(job: Job): string {
  const m = MACHINE_BY_ID[job.machine];
  if (!job.turn) return `Join the crank to ${m.name} so it turns.`;
  const way = `Make ${m.name} turn ${turnWords(job.turn)}`;
  return job.speed === undefined ? `${way}.` : `${way}, ${speedWords(job.speed)}.`;
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n: number) => NUM[n] ?? String(n);
const gears = (n: number) => `${num(n)} gear${n === 1 ? '' : 's'}`;

/** After a run that isn't right: what happened, in a kid's words — never scolded. */
export function verdictWords(job: Job, r: Run, v: Verdict): string {
  const m = MACHINE_BY_ID[job.machine];
  switch (v) {
    case 'empty':
      return 'Nothing turned — put a gear on the peg next to the crank first.';
    case 'not-joined':
      return `The gears turned, but they don’t reach ${m.name} yet. Gears only turn each other when they touch.`;
    case 'jammed':
      return 'Clunk — jammed! Three gears that all touch push each other both ways at once. Take one of the shaking gears out.';
    case 'wrong-way':
      return r.kind === 'turns'
        ? `${cap(m.name)} turned ${turnWords(r.turn)} — ${gears(r.between)} between. Try one gear more, or one fewer, on the way.`
        : '';
    case 'too-fast':
    case 'too-slow':
      return r.kind === 'turns'
        ? `${cap(m.name)} turned ${speedWords(r.speed)}. ${v === 'too-fast' ? 'Too fast! A smaller gear on the crank turns it slower.' : 'Too slow! A bigger gear on the crank turns it faster.'}`
        : '';
    default:
      return '';
  }
}

/**
 * What a right run teaches, for the reward: gears that touch turn opposite
 * ways (Gentle), odd and even (Medium), big turning small (Tricky).
 */
export function learnedLine(job: Job, r: Run, crank: number): string {
  if (r.kind !== 'turns') return '';
  const m = MACHINE_BY_ID[job.machine];
  if (job.speed !== undefined) {
    const how = crank > job.teeth ? `A big gear turning a small one makes it go faster` : crank < job.teeth ? `A small gear turning a big one makes it go slower` : 'Two gears the same size turn at the same speed';
    return `${how}: ${crank} teeth turning ${job.teeth} made ${m.name} turn ${speedWords(r.speed)}. The gears between change only the way.`;
  }
  if (job.turn) {
    const odd = r.between % 2 === 1;
    return `${cap(gears(r.between))} between the crank and ${m.name}: ${odd ? 'an odd number, so it turns the same way as the crank' : 'an even number, so it turns the other way'}.`;
  }
  return 'Each gear turns the other way from the gear it touches.';
}

/** How each peg should be filled to do the job (the smallest such set), or null: for tests and hints. */
export function solve(job: Job): { placed: Set<number>; crank: Teeth } | null {
  const n = job.board.pegs.length;
  let best: { placed: Set<number>; crank: Teeth } | null = null;
  for (const crank of job.speed === undefined ? [16 as Teeth] : TEETH) {
    for (let mask = 0; mask < 1 << n; mask++) {
      const placed = new Set<number>();
      for (let k = 0; k < n; k++) if (mask & (1 << k)) placed.add(k);
      if (best && placed.size >= best.placed.size) continue;
      if (check(job, run(job.board, placed, crank, job.teeth)) === 'right') best = { placed, crank };
    }
  }
  return best;
}
