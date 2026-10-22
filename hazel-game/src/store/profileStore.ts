import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { nextStreak, todayIso } from '../lib/streak';
import { mergeProfiles, readLocalProfile, writeLocalProfile } from '../lib/profile';
import { useAuthStore } from './authStore';
import { gainXp, levelState } from '../lib/level';
import { flushPlayDays, notePlayDay } from '../lib/playDays';
import { takeOwedXp } from '../lib/kidXp';
import { ageToStartLevel, playerAge } from '../lib/age';
import { withTopicStart } from '../lib/save';
import { useSaveStore } from './saveStore';
import type { PowerUpId, PowerUps, Profile, SkillLevels, Topic } from '../types';

/** Shape of a row in the Supabase `profiles` table (snake_case). */
interface ProfileRow {
  id: string;
  birth_year: number;
  birth_month: number;
  skill_levels: SkillLevels | null;
  xp: number | null;
  level: number | null;
  level_xp: number | null;
  power_ups: PowerUps | null;
  current_streak: number | null;
  longest_streak: number | null;
  last_played_on: string | null;
}

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    birthYear: row.birth_year,
    birthMonth: row.birth_month,
    skillLevels: row.skill_levels ?? {},
    xp: row.xp ?? 0,
    // Null until migration 0012 backfills it — levelState falls back to xp.
    ...(row.level != null && row.level_xp != null ? { level: row.level, levelXp: row.level_xp } : {}),
    powerUps: row.power_ups ?? {},
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastPlayedOn: row.last_played_on ?? null,
  };
}

function toRow(p: Profile): ProfileRow {
  const { level, levelXp } = levelState(p);
  return {
    id: p.id,
    birth_year: p.birthYear,
    birth_month: p.birthMonth,
    skill_levels: p.skillLevels,
    xp: p.xp,
    level,
    level_xp: levelXp,
    power_ups: p.powerUps,
    current_streak: p.currentStreak,
    longest_streak: p.longestStreak,
    last_played_on: p.lastPlayedOn,
  };
}

type Birth = Pick<Profile, 'birthYear' | 'birthMonth'>;

/** `amount` more XP, the level and the XP into it following. */
function withXp(p: Profile, amount: number): Profile {
  const { level, levelXp } = gainXp(levelState(p), amount);
  return { ...p, xp: p.xp + amount, level, levelXp };
}

/** `today` played: the streak moves on (or starts again), the best follows. */
function withDayPlayed(p: Profile, today: string): Profile {
  const currentStreak = nextStreak(p.currentStreak, p.lastPlayedOn, today);
  return { ...p, currentStreak, longestStreak: Math.max(p.longestStreak, currentStreak), lastPlayedOn: today };
}

/** How long after a failed read the next change asks for the kid's row again. */
export const RETRY_READ_MS = 15_000;

/**
 * The kid's `profiles` row couldn't be read (#29 review round 3): the profile
 * in memory is this device's copy (`base`), or — with none — a made-up start
 * (level 1, no topics). Nothing is written to the row until it is read (a
 * made-up or stale profile written back wiped real XP, levels and streaks —
 * #61's class — and noted a topic's start wrongly); play goes on in memory,
 * and the next change after `RETRY_READ_MS` asks again. `xp`: earned since,
 * added to the real total once it's read.
 */
export interface Unread {
  base: Profile | null;
  xp: number;
  triedAt: number;
}

/** This device's copy may take a change: always once the row is read; while it isn't, only if the profile came from that copy (never a made-up start). */
function held(unread: Unread | null): boolean {
  return !unread || unread.base !== null;
}

/** One read of a kid's row. */
function readRow(userId: string) {
  return supabase
    .from('profiles')
    .select(
      'id, birth_year, birth_month, skill_levels, xp, level, level_xp, power_ups, current_streak, longest_streak, last_played_on',
    )
    .eq('id', userId)
    .maybeSingle();
}

/** Bumped on every load and clear: a read that answers after the kid changed is dropped. */
let readGen = 0;
let reading = false;

/**
 * A working profile to use when the Supabase `profiles` row is missing (the
 * auto-create trigger never ran, the migration isn't applied, or we're
 * offline). Birth date comes from the kid's family row (or an old account's
 * sign-up metadata) so age-based difficulty stays correct; everything else
 * starts fresh. Without this, a missing row left `profile` null and silently
 * dropped all XP — the level gauge never moved.
 */
function defaultProfile(userId: string, birth?: Birth): Profile {
  const meta = useAuthStore.getState().session?.user?.user_metadata as
    | { birth_year?: number; birth_month?: number }
    | undefined;
  return {
    id: userId,
    birthYear: birth?.birthYear ?? meta?.birth_year ?? new Date().getFullYear() - 10,
    birthMonth: birth?.birthMonth ?? meta?.birth_month ?? 1,
    skillLevels: {},
    xp: 0,
    level: 1,
    levelXp: 0,
    powerUps: {},
    currentStreak: 0,
    longestStreak: 0,
    lastPlayedOn: null,
  };
}

interface ProfileStore {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** Set when remote persistence is failing (local progress still works). */
  remoteError: string | null;
  /** Set while the kid's row hasn't been read (the read failed): nothing is written to it meanwhile (#29 review round 3). */
  unread: Unread | null;
  /** Fetch a kid's profile row; `birth` seeds a fresh profile if the read fails. */
  loadProfile: (userId: string, birth?: Birth) => Promise<void>;
  /** After a failed read: read the row again (at most one at a time, `RETRY_READ_MS` apart) and take it up with what was played since. */
  retryRead: () => Promise<void>;
  /**
   * Persist a new skill level for one topic (optimistic update). The first
   * time a topic's level is saved, where it started — the level for the kid's
   * age now, the one the round began from — is noted in their save
   * (`topicStarts`, #29 review round 2) — only once the row has been read:
   * "no level here" in a profile that wasn't read says nothing (round 3).
   */
  setSkillLevel: (topic: Topic, level: number) => Promise<void>;
  /** Add experience points (optimistic update). Any XP earned is play, so it counts the day too (`recordActivity`). */
  addXp: (amount: number) => Promise<void>;
  /** Record a power-up chosen on level-up (optimistic update). */
  addPowerUp: (id: PowerUpId) => Promise<void>;
  /** Advance the daily streak and note the day played (#28, #29): after a round, a battle, and any XP earned. */
  recordActivity: () => Promise<void>;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: null,
  loading: false,
  error: null,
  remoteError: null,
  unread: null,

  loadProfile: async (userId, birth) => {
    const gen = ++readGen;
    set({ loading: true, error: null });
    const local = readLocalProfile(userId);
    const { data, error } = await readRow(userId);
    if (gen !== readGen) return; // another kid was picked (or the game put away) meanwhile
    // XP they earned as Player 2 on this device that couldn't be saved then (`lib/kidXp.ts`).
    const owed = takeOwedXp(userId);

    if (data) {
      // Reconcile the remote row with any local progress, keeping the higher of
      // each — this protects a player whose remote writes are silently failing
      // (e.g. an RLS policy not applied on the live DB) from being reset to
      // Level 1 by a remote row stuck at 0.
      let merged = mergeProfiles(fromRow(data as ProfileRow), local);
      if (owed > 0) merged = withXp(merged, owed);
      set({ profile: merged, loading: false, remoteError: null, unread: null });
      // Days played while offline (or before migration 0025) go up now (#29),
      // even after a failed send this session (unless 0025 isn't there).
      void flushPlayDays(userId, { now: true });
      writeLocalProfile(merged);
      // If the local cache was ahead, best-effort push the merge back up.
      const remote = fromRow(data as ProfileRow);
      const remoteLevel = levelState(remote);
      const mergedLevel = levelState(merged);
      // Also push when the row has no saved level yet (migration 0012 not run
      // when it was last written) or the local cache's level is ahead.
      if (
        owed > 0 ||
        (local && merged.xp > remote.xp) ||
        remote.level == null ||
        mergedLevel.level !== remoteLevel.level ||
        mergedLevel.levelXp !== remoteLevel.levelXp
      ) {
        void supabase
          .from('profiles')
          .update({ ...toRow(merged), updated_at: new Date().toISOString() })
          .eq('id', userId)
          .then(({ error: e }) => {
            if (e) set({ remoteError: errorMessage(e) });
          });
      }
      return;
    }

    if (error) {
      // The read FAILED — never overwrite the remote row with a zeroed default
      // (the old bug that destroyed XP). Fall back to the local cache if we have
      // one, else an in-memory default; surface the failure. Nothing is written
      // to the row until it's read (`unread`, #29 review round 3), and a
      // made-up default never becomes this device's copy.
      const profile = local ?? defaultProfile(userId, birth);
      set({ profile, loading: false, remoteError: errorMessage(error), unread: { base: local, xp: 0, triedAt: Date.now() } });
      if (owed > 0) void get().addXp(owed); // held until the row is read, like any XP
      return;
    }

    // Genuinely no row. Seed from local progress if we have any, and create it
    // with DO-NOTHING-on-conflict so a racing/existing row is never clobbered.
    const seed = owed > 0 ? withXp(local ?? defaultProfile(userId, birth), owed) : (local ?? defaultProfile(userId, birth));
    set({ profile: seed, loading: false, remoteError: null, unread: null });
    writeLocalProfile(seed);
    void supabase
      .from('profiles')
      .upsert(toRow(seed), { onConflict: 'id', ignoreDuplicates: true })
      .then(({ error: upsertError }) => {
        if (upsertError) set({ remoteError: errorMessage(upsertError) });
      });
  },

  retryRead: async () => {
    const { profile, unread } = get();
    if (!profile || !unread || reading || Date.now() - unread.triedAt < RETRY_READ_MS) return;
    const gen = readGen;
    const userId = profile.id;
    reading = true;
    set({ unread: { ...unread, triedAt: Date.now() } });
    let got: Awaited<ReturnType<typeof readRow>>;
    try {
      got = await readRow(userId);
    } finally {
      reading = false;
    }
    const now = get();
    if (gen !== readGen || !now.profile || !now.unread) return; // another kid, or the game put away, meanwhile
    if (got.error) {
      set({ remoteError: errorMessage(got.error) });
      return;
    }
    const today = todayIso();
    const played = now.profile.lastPlayedOn === today;
    let merged: Profile;
    if (got.data) {
      // As if the page had loaded with the copy this device had — then what
      // was played since: its XP added, today counted on the real streak.
      // Levels and power-ups moved since count (the higher wins, as always)
      // only from a real copy, never from a made-up start.
      merged = mergeProfiles(fromRow(got.data as ProfileRow), now.unread.base);
      if (now.unread.base) {
        merged = mergeProfiles(merged, { ...merged, skillLevels: now.profile.skillLevels, powerUps: now.profile.powerUps });
      }
      if (now.unread.xp > 0) merged = withXp(merged, now.unread.xp);
      if (played && merged.lastPlayedOn !== today) merged = withDayPlayed(merged, today);
    } else {
      // No row after all (a new kid): what's in memory is all there is.
      merged = now.profile;
    }
    set({ profile: merged, remoteError: null, unread: null });
    writeLocalProfile(merged);
    const write = got.data
      ? supabase.from('profiles').update({ ...toRow(merged), updated_at: new Date().toISOString() }).eq('id', userId)
      : supabase.from('profiles').upsert(toRow(merged), { onConflict: 'id', ignoreDuplicates: true });
    const { error } = await write;
    if (error) set({ remoteError: errorMessage(error) });
  },

  setSkillLevel: async (topic, level) => {
    const { profile, unread } = get();
    if (!profile) return;
    // Its first saved level: until now the topic stood at the start for the
    // kid's age (`skillLevelFor`) — note that start, and the age, for good.
    // Only from a profile that was read: one that wasn't has no levels to go on.
    const saves = useSaveStore.getState();
    if (!unread && profile.skillLevels[topic] === undefined && saves.userId === profile.id) {
      const age = playerAge(profile);
      saves.update((s) => withTopicStart(s, topic, { level: ageToStartLevel(age), age }));
    }
    const skillLevels = { ...profile.skillLevels, [topic]: level };
    const updated = { ...profile, skillLevels };
    set({ profile: updated }); // optimistic
    if (held(unread)) writeLocalProfile(updated); // durable locally even if the remote write fails
    if (unread) {
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ skill_levels: skillLevels, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  addXp: async (amount) => {
    const { profile, unread } = get();
    if (!profile || amount <= 0) return;
    const updated = withXp(profile, amount);
    set({ profile: updated, ...(unread ? { unread: { ...unread, xp: unread.xp + amount } } : {}) }); // optimistic
    if (held(unread)) writeLocalProfile(updated);
    // Every XP the game pays — typing lessons, the Library, a shrine, the
    // Scriptorium, not only rounds and battles — is a day played (#29 review
    // round 1): the streak, "last played" and 📈 Progress's week agree.
    void get().recordActivity();
    if (unread) {
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ xp: updated.xp, level: updated.level, level_xp: updated.levelXp, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  addPowerUp: async (id) => {
    const { profile, unread } = get();
    if (!profile) return;
    const powerUps = { ...profile.powerUps, [id]: (profile.powerUps[id] ?? 0) + 1 };
    const updated = { ...profile, powerUps };
    set({ profile: updated }); // optimistic
    if (held(unread)) writeLocalProfile(updated);
    if (unread) {
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ power_ups: powerUps, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  recordActivity: async () => {
    const { profile, unread } = get();
    if (!profile) return;
    const today = todayIso();
    // Same-day no-op — don't write or even nudge the streak. A day still
    // waiting on this device is sent, unless a send just failed: then it
    // waits (back online, a few minutes, or the next day — lib/playDays, #29).
    if (profile.lastPlayedOn === today) {
      void flushPlayDays(profile.id);
      return;
    }
    const updated = withDayPlayed(profile, today);
    set({ profile: updated });
    if (held(unread)) writeLocalProfile(updated);
    // A new day played: kept for 👪 Grown-ups → 📈 Progress (#29, migration 0025)
    // — the day itself, true whatever the profile holds.
    void notePlayDay(profile.id, today);
    if (unread) {
      void get().retryRead(); // the row first: nothing is written over it unread
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        current_streak: updated.currentStreak,
        longest_streak: updated.longestStreak,
        last_played_on: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  clearProfile: () => {
    readGen += 1;
    set({ profile: null, loading: false, error: null, remoteError: null, unread: null });
  },
}));
