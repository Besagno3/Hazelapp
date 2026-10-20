import { KEY_BY_CODE, TYPING_LESSONS, anchorsFor, keysTaughtBy, typingLessonFlag } from '../content/typing';
import { IGNORED_CODES, type TypingPress } from './typing';

/**
 * 🍂 Falling Leaves (#165, item 7): a typing game in the Library. Letters
 * drift down on leaves; type a letter before its leaf touches the ground to
 * catch it. Three leaves on the ground end the round, and so does the clock.
 * Accuracy first: nothing hurries the kid but the leaves themselves, which
 * fall a little faster the more are caught. Only keys the lessons have
 * taught so far appear (`leafPool`). Pure and table-tested; the screen
 * (`features/typing/FallingLeaves.tsx`) drives it with a timer and the keys.
 */
export interface Leaf {
  id: number;
  /** The character on it, and its physical key. */
  ch: string;
  code: string;
  /** Across the field, 0–100 (%). */
  x: number;
  /** How far it has fallen, 0 (the top) to 1 (the ground). */
  y: number;
}

export interface LeavesState {
  leaves: Leaf[];
  caught: number;
  /** Leaves that reached the ground. */
  missed: number;
  /** Keys pressed with no such leaf falling. */
  wrong: number;
  elapsedMs: number;
  sinceSpawnMs: number;
  nextId: number;
  over: boolean;
}

export interface LeafKey {
  ch: string;
  code: string;
}

export const LEAVES_TUNING = {
  /** The screen's tick. */
  tickMs: 50,
  /** A round's length. */
  roundMs: 60_000,
  /** How long a leaf takes to fall at the start, and at the fastest. */
  fallMs: 7_000,
  fallMinMs: 3_500,
  /** Each leaf caught takes this much off the next leaf's fall. */
  fallStepMs: 70,
  /** How often a new leaf starts, at the start and at the fastest. */
  spawnMs: 1_800,
  spawnMinMs: 900,
  spawnStepMs: 20,
  /** Leaves on the ground that end the round. */
  maxMissed: 3,
  /** Leaves in the air at once, at most. */
  maxLeaves: 5,
} as const;

/** Catch this many in one round for its badge flag and XP, once each. */
export const LEAF_MILESTONES = [10, 25, 50] as const;
export const LEAVES_XP = 20;

export function leavesFlag(milestone: number): string {
  return `leaves:${milestone}`;
}

/** The milestones a round's catch reaches that this player hadn't before. */
export function newMilestones(caught: number, flags: Record<string, boolean>): number[] {
  return LEAF_MILESTONES.filter((m) => caught >= m && flags[leavesFlag(m)] !== true);
}

/**
 * The letters that can fall: the plain character of every key the lessons
 * cleared so far (in order, up to the first not cleared) have taught — never
 * the space bar or Shift. Lesson 1 alone gives f and j.
 */
export function leafPool(flags: Record<string, boolean>): LeafKey[] {
  let last = TYPING_LESSONS[0].id;
  for (const lesson of TYPING_LESSONS) {
    if (flags[typingLessonFlag(lesson.id)] !== true) break;
    last = lesson.id;
  }
  const pool: LeafKey[] = [];
  for (const code of keysTaughtBy(last)) {
    const ch = KEY_BY_CODE[code]?.chars[0] ?? '';
    if (ch && ch !== ' ') pool.push({ ch, code });
  }
  return pool;
}

export function startLeaves(): LeavesState {
  return { leaves: [], caught: 0, missed: 0, wrong: 0, elapsedMs: 0, sinceSpawnMs: 0, nextId: 1, over: false };
}

/** How long a leaf takes to fall now, and how often one starts: quicker the more are caught. */
export function leafPace(caught: number): { fallMs: number; spawnMs: number } {
  const t = LEAVES_TUNING;
  return {
    fallMs: Math.max(t.fallMinMs, t.fallMs - caught * t.fallStepMs),
    spawnMs: Math.max(t.spawnMinMs, t.spawnMs - caught * t.spawnStepMs),
  };
}

/**
 * Time passes: every leaf falls, a leaf that reaches the ground is missed,
 * a new leaf starts when it's time (a character not already falling, from
 * `pool`; `rng` picks it and where). The round ends on the third miss or the
 * clock.
 */
export function stepLeaves(state: LeavesState, dtMs: number, pool: readonly LeafKey[], rng: () => number = Math.random): LeavesState {
  if (state.over) return state;
  const { fallMs, spawnMs } = leafPace(state.caught);
  const fallen: Leaf[] = [];
  const leaves: Leaf[] = [];
  for (const leaf of state.leaves) {
    const y = leaf.y + dtMs / fallMs;
    if (y >= 1) fallen.push(leaf);
    else leaves.push({ ...leaf, y });
  }
  let { nextId, sinceSpawnMs } = state;
  sinceSpawnMs += dtMs;
  if (sinceSpawnMs >= spawnMs && leaves.length < LEAVES_TUNING.maxLeaves) {
    sinceSpawnMs = 0;
    const falling = new Set(leaves.map((l) => l.ch));
    const free = pool.filter((k) => !falling.has(k.ch));
    if (free.length > 0) {
      const pick = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
      leaves.push({ id: nextId++, ch: pick.ch, code: pick.code, x: 8 + Math.floor(rng() * 85), y: 0 });
    }
  }
  const missed = state.missed + fallen.length;
  const elapsedMs = state.elapsedMs + dtMs;
  const over = missed >= LEAVES_TUNING.maxMissed || elapsedMs >= LEAVES_TUNING.roundMs;
  return { ...state, leaves, missed, elapsedMs, sinceSpawnMs, nextId, over };
}

export type LeafEvent = 'caught' | 'hold' | 'caps' | 'wrong' | 'none';

/** The leaf nearest the ground with this character, if one is falling. */
export function lowestLeaf(state: LeavesState, ch?: string): Leaf | null {
  let best: Leaf | null = null;
  for (const leaf of state.leaves) {
    if (ch !== undefined && leaf.ch !== ch) continue;
    if (!best || leaf.y > best.y) best = leaf;
  }
  return best;
}

/**
 * A key press: the leaf nearest the ground with that character is caught —
 * with the home-row hold on, only while the other hand holds its bump key
 * (else a nudge, as in a lesson). A capital of a falling letter is a caps
 * nudge (Caps Lock, or a Shift held from the capitals lesson — review round
 * 2), never a wrong key. A character with no leaf is a wrong key; a space,
 * or anything that isn't a character, does nothing.
 */
export function pressLeaf(state: LeavesState, press: TypingPress): { next: LeavesState; event: LeafEvent; leaf: Leaf | null } {
  if (state.over || IGNORED_CODES.has(press.code) || press.key === ' ' || [...press.key].length !== 1) return { next: state, event: 'none', leaf: null };
  const leaf = lowestLeaf(state, press.key);
  if (!leaf) {
    const small = press.key.toLowerCase();
    if (small !== press.key) {
      const wanted = lowestLeaf(state, small);
      if (wanted) return { next: state, event: 'caps', leaf: wanted };
    }
    // The other hand's bump key going down is anchoring, not a wrong key.
    if (press.holdRule && state.leaves.some((l) => anchorsFor(l.ch).includes(press.code))) return { next: state, event: 'none', leaf: null };
    return { next: { ...state, wrong: state.wrong + 1 }, event: 'wrong', leaf: null };
  }
  if (press.holdRule) {
    const anchors = anchorsFor(leaf.ch);
    if (anchors.length > 0 && !anchors.some((a) => press.held.has(a))) {
      // f and j always fall, so a bare F or J is most often the other hand going
      // home for the lowest leaf (review round 1) — anchoring, not a wrong-hand nudge.
      const lowest = lowestLeaf(state);
      if (lowest && lowest.id !== leaf.id && anchorsFor(lowest.ch).includes(press.code)) return { next: state, event: 'none', leaf: null };
      return { next: state, event: 'hold', leaf };
    }
  }
  return { next: { ...state, leaves: state.leaves.filter((l) => l.id !== leaf.id), caught: state.caught + 1 }, event: 'caught', leaf };
}

/** Keys right out of all keys pressed (1 with none pressed). */
export function leavesAccuracy(state: LeavesState): number {
  const total = state.caught + state.wrong;
  return total === 0 ? 1 : state.caught / total;
}
