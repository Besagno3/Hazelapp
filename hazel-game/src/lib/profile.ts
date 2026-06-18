import type { PowerUps, Profile, SkillLevels } from '../types';

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
  return {
    ...remote,
    xp: Math.max(remote.xp, local.xp),
    skillLevels: maxByKey<SkillLevels & Record<string, number>>(
      remote.skillLevels as SkillLevels & Record<string, number>,
      local.skillLevels as SkillLevels & Record<string, number>,
    ),
    powerUps: maxByKey<PowerUps & Record<string, number>>(
      remote.powerUps as PowerUps & Record<string, number>,
      local.powerUps as PowerUps & Record<string, number>,
    ),
    currentStreak: Math.max(remote.currentStreak, local.currentStreak),
    longestStreak: Math.max(remote.longestStreak, local.longestStreak),
    lastPlayedOn:
      (local.lastPlayedOn ?? '') > (remote.lastPlayedOn ?? '')
        ? local.lastPlayedOn
        : remote.lastPlayedOn,
  };
}
