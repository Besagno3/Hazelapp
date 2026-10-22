import { CRYSTAL_TOPIC_IDS, EXTRA_TOPIC_IDS, type PowerUps, type Profile, type SkillLevels, type Topic, type TopicStart } from '../types';
import { furthestLevel, levelState } from './level';
import { clampLevel, MAX_PLAYER_AGE, MAX_SKILL_LEVEL, MIN_SKILL_LEVEL, MIN_START_AGE } from './age';
import { isRealDay } from './streak';

/**
 * Local durability for the player profile (XP / skill levels / power-ups /
 * streak). The profile used to live ONLY in Supabase, so any failed write —
 * or a reload that read back an empty row — reset the player to Level 1 and
 * lost their XP. This mirrors `saveStore`'s localStorage write-through: every
 * profile change is cached locally, and on load we reconcile the remote row
 * with the local copy, keeping whichever has more progress. Pure logic here;
 * the store wires it to Supabase.
 */

const PREFIX = 'hazel-profile-';

export function profileKey(userId: string): string {
  return `${PREFIX}${userId}`;
}

export function readLocalProfile(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(profileKey(userId));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function writeLocalProfile(profile: Profile): void {
  try {
    localStorage.setItem(profileKey(profile.id), JSON.stringify(profile));
  } catch {
    // Private mode / quota — in-memory play still works this session.
  }
}

const TOPIC_IDS: readonly string[] = [...CRYSTAL_TOPIC_IDS, ...EXTRA_TOPIC_IDS];

/**
 * The level steps a kid played while their row couldn't be read (#176),
 * kept beside the cached profile (#180): the copy holds the levels played
 * to, and a load merges it with the row by the higher — so after a reload a
 * step down was lost. With these, the copy's levels are taken back to where
 * they stood before the steps, and the steps go on from the row's once it's
 * read. `starts`: the topics first played meanwhile (not in the copy), each
 * with the start it was played from. Every tab of the kid on this device
 * adds its steps to what's kept (`addUnreadStep`), and the first to read the
 * row takes them all (`takeUnreadSteps`, inside `withStepsLock`) — so a step
 * is put on once, never by two tabs (#180 review). `xp`: the XP earned
 * meanwhile, kept the same way (#180 review's also-noted: after a reload
 * the copy's XP, merged by the higher, lost it whenever another device had
 * moved the row's XP), and `from`, the copy's XP, level and XP into it
 * before the first of it. Cleared then, and with the cached profile
 * (`forgetLocalProfile`).
 */
export interface UnreadSteps {
  steps: Partial<Record<Topic, number>>;
  starts: Partial<Record<Topic, TopicStart>>;
  xp?: number;
  from?: XpState;
}

/** A profile's XP, level and XP into that level. */
export interface XpState {
  xp: number;
  level: number;
  levelXp: number;
}

const wholeAtLeast = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;

const stepsKey = (userId: string) => `hazel-profile-steps-${userId}`;

/** The most a topic's level can move, up or down: a step kept is never more. */
const MAX_STEP = MAX_SKILL_LEVEL - MIN_SKILL_LEVEL;

/** A kid's kept steps (known topics, whole steps of at most 9), or null when there are none. */
export function readUnreadSteps(userId: string): UnreadSteps | null {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(stepsKey(userId)) ?? 'null');
    if (typeof kept !== 'object' || kept === null) return null;
    const { steps, starts, xp, from } = kept as Record<string, unknown>;
    const out: UnreadSteps = { steps: {}, starts: skillStartsFrom(starts) };
    for (const [topic, n] of Object.entries(typeof steps === 'object' && steps !== null ? steps : {})) {
      if (TOPIC_IDS.includes(topic) && Number.isInteger(n) && Math.abs(n as number) <= MAX_STEP) out.steps[topic as Topic] = n as number;
    }
    const f = typeof from === 'object' && from !== null ? (from as Record<string, unknown>) : {};
    if (wholeAtLeast(xp, 1) && wholeAtLeast(f.xp, 0) && wholeAtLeast(f.level, 1) && wholeAtLeast(f.levelXp, 0)) {
      out.xp = xp;
      out.from = { xp: f.xp, level: f.level, levelXp: f.levelXp };
    }
    return Object.keys(out.steps).length > 0 || out.xp ? out : null;
  } catch {
    return null;
  }
}

/** Keep a kid's steps (false when storage can't be written). */
export function writeUnreadSteps(userId: string, kept: UnreadSteps): boolean {
  try {
    localStorage.setItem(stepsKey(userId), JSON.stringify(kept));
    return true;
  } catch {
    // Private mode / quota — the steps still go on this session.
    return false;
  }
}

/**
 * One more level step played while the row is unread, added to what's kept
 * for the kid (#180) — whichever tab of the kid kept that, so the steps kept
 * are every tab's not yet taken up; `start`, the start a first-played topic
 * was played from (the first one kept stays). False when it couldn't be
 * kept (storage can't be written): that tab then puts its own steps on.
 */
export function addUnreadStep(userId: string, topic: Topic, step: number, start?: TopicStart): boolean {
  const kept = readUnreadSteps(userId) ?? { steps: {}, starts: {} };
  kept.steps[topic] = Math.max(-MAX_STEP, Math.min(MAX_STEP, (kept.steps[topic] ?? 0) + step));
  if (start && !kept.starts[topic]) kept.starts[topic] = start;
  return writeUnreadSteps(userId, kept);
}

/**
 * XP earned while the row is unread, added to what's kept for the kid (#180
 * review), whichever tab kept it; `from`, this tab's XP state before it —
 * kept only with the first XP kept. False when it couldn't be kept.
 */
export function addUnreadXp(userId: string, amount: number, from: XpState): boolean {
  const kept = readUnreadSteps(userId) ?? { steps: {}, starts: {} };
  kept.xp = (kept.xp ?? 0) + Math.round(amount);
  kept.from ??= from;
  return writeUnreadSteps(userId, kept);
}

/**
 * Take the kid's kept steps to put them on the row (#180): read and removed
 * in one synchronous step, so a tab of the kid that takes them after finds
 * them gone and puts on none. Call it inside `withStepsLock`.
 */
export function takeUnreadSteps(userId: string): UnreadSteps | null {
  const kept = readUnreadSteps(userId);
  forgetUnreadSteps(userId);
  return kept;
}

/**
 * Run `take` holding this kid's steps lock (#180 review): with the Web Locks
 * API one tab of the browser at a time — two tabs that read the row together
 * take the steps one after the other, and the second finds them gone. A
 * browser without it (or one that refuses the lock) runs `take` at once:
 * the take still reads and removes in one synchronous step, so only two tabs
 * reading in the very same instant could both have the steps — best effort.
 */
export async function withStepsLock<T>(userId: string, take: () => T): Promise<T> {
  const locks = (globalThis.navigator as { locks?: Pick<LockManager, 'request'> } | undefined)?.locks;
  if (locks && typeof locks.request === 'function') {
    let ran = false;
    try {
      return await locks.request(stepsKey(userId), () => {
        ran = true;
        return take();
      });
    } catch (err) {
      if (ran) throw err;
      // Refused (an insecure page, a sandboxed frame): the take without it, below.
    }
  }
  return take();
}

export function forgetUnreadSteps(userId: string): void {
  try {
    localStorage.removeItem(stepsKey(userId));
  } catch {
    // Storage unavailable — nothing was kept.
  }
}

/** This device's copy of a kid's profile, and the steps kept with it, leave the device (removed, signed out). */
export function forgetLocalProfile(userId: string): void {
  try {
    localStorage.removeItem(profileKey(userId));
  } catch {
    // Storage unavailable — nothing was kept.
  }
  forgetUnreadSteps(userId);
}

/**
 * The copy as it was before what was played unread (#180): each stepped
 * topic back where it stood, one first played meanwhile left out, and its
 * XP as it was before the XP kept (`from`).
 */
export function withoutSteps(copy: Profile, { steps, starts, xp, from }: UnreadSteps): Profile {
  const skillLevels: SkillLevels = { ...copy.skillLevels };
  for (const topic of Object.keys(steps) as Topic[]) {
    const here = skillLevels[topic];
    if (starts[topic] || here === undefined) delete skillLevels[topic];
    else skillLevels[topic] = clampLevel(here - (steps[topic] ?? 0));
  }
  return { ...copy, skillLevels, ...(xp && from ? from : {}) };
}

/**
 * A kid's topic starts as read from `profiles.skill_starts` (migration 0026,
 * #174): only known topics (own keys — never `constructor`), each a whole
 * level 1–10 and a whole age 3–18, as the database keeps them, with the day
 * it was noted when it's a real one (`on`, #183); anything else is left
 * out, so the page makes no claim on it.
 */
export function skillStartsFrom(raw: unknown): Partial<Record<Topic, TopicStart>> {
  const out: Partial<Record<Topic, TopicStart>> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [topic, v] of Object.entries(raw)) {
    if (!TOPIC_IDS.includes(topic) || typeof v !== 'object' || v === null) continue;
    const { level, age, on } = v as Record<string, unknown>;
    if (!Number.isInteger(level) || !Number.isInteger(age)) continue;
    const [l, a] = [level as number, age as number];
    if (l < MIN_SKILL_LEVEL || l > MAX_SKILL_LEVEL || a < MIN_START_AGE || a > MAX_PLAYER_AGE) continue;
    out[topic as Topic] = isRealDay(on) ? { level: l, age: a, on } : { level: l, age: a };
  }
  return out;
}

function maxByKey<T extends Record<string, number>>(a: T, b: T): T {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out as T;
}

/**
 * Reconcile a freshly-read remote profile with the local cache, keeping the
 * higher progress on each axis. This is what protects a kid whose remote writes
 * are silently failing (e.g. an RLS policy not applied): their real progress is
 * in the local cache, so a remote row stuck at 0 won't wipe it on reload.
 */
export function mergeProfiles(remote: Profile, local: Profile | null): Profile {
  if (!local || local.id !== remote.id) return remote;
  const { level, levelXp } = furthestLevel(levelState(remote), levelState(local));
  // The streak and the day it ended on come from the same copy — whichever
  // played last (the longer streak on the same day): taken apart, a cached
  // "5 days, last 10 Oct" and the server's "1 day, last 20 Oct" made "5 days,
  // last 20 Oct", days nobody played — which 📈 Progress's week now shows (#171).
  const lastLocal = local.lastPlayedOn ?? '';
  const lastRemote = remote.lastPlayedOn ?? '';
  const streakFrom =
    lastLocal > lastRemote || (lastLocal === lastRemote && local.currentStreak > remote.currentStreak) ? local : remote;
  return {
    ...remote,
    xp: Math.max(remote.xp, local.xp),
    level,
    levelXp,
    skillLevels: maxByKey<SkillLevels & Record<string, number>>(
      remote.skillLevels as SkillLevels & Record<string, number>,
      local.skillLevels as SkillLevels & Record<string, number>,
    ),
    powerUps: maxByKey<PowerUps & Record<string, number>>(
      remote.powerUps as PowerUps & Record<string, number>,
      local.powerUps as PowerUps & Record<string, number>,
    ),
    currentStreak: streakFrom.currentStreak,
    longestStreak: Math.max(remote.longestStreak, local.longestStreak),
    lastPlayedOn: streakFrom.lastPlayedOn,
    // Where each topic started (#174): every start either copy noted (this
    // device's checked, as it's read back from storage); on a clash the
    // server's, which keeps the first one written.
    ...(remote.skillStarts || local.skillStarts
      ? { skillStarts: { ...skillStartsFrom(local.skillStarts), ...remote.skillStarts } }
      : {}),
  };
}
