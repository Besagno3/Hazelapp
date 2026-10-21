import { CRYSTAL_TOPIC_IDS, EXTRA_TOPIC_IDS, type PowerUps, type Profile, type SkillLevels, type Topic, type TopicStart } from '../types';
import { furthestLevel, levelState } from './level';

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
 * A kid's topic starts as read from `profiles.skill_starts` (migration 0026,
 * #174): only known topics (own keys — never `constructor`), each a whole
 * level 1–10 and a whole age 3–18, as the database keeps them; anything else
 * is left out, so the page makes no claim on it.
 */
export function skillStartsFrom(raw: unknown): Partial<Record<Topic, TopicStart>> {
  const out: Partial<Record<Topic, TopicStart>> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [topic, v] of Object.entries(raw)) {
    if (!TOPIC_IDS.includes(topic) || typeof v !== 'object' || v === null) continue;
    const { level, age } = v as Record<string, unknown>;
    if (!Number.isInteger(level) || !Number.isInteger(age)) continue;
    if ((level as number) < 1 || (level as number) > 10 || (age as number) < 3 || (age as number) > 18) continue;
    out[topic as Topic] = { level: level as number, age: age as number };
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
