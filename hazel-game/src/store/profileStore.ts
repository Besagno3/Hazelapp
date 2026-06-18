import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { nextStreak, todayIso } from '../lib/streak';
import { mergeProfiles, readLocalProfile, writeLocalProfile } from '../lib/profile';
import { useAuthStore } from './authStore';
import type { PowerUpId, PowerUps, Profile, SkillLevels, Topic } from '../types';

/** Shape of a row in the Supabase `profiles` table (snake_case). */
interface ProfileRow {
  id: string;
  birth_year: number;
  birth_month: number;
  skill_levels: SkillLevels | null;
  xp: number | null;
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
    powerUps: row.power_ups ?? {},
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastPlayedOn: row.last_played_on ?? null,
  };
}

function toRow(p: Profile): ProfileRow {
  return {
    id: p.id,
    birth_year: p.birthYear,
    birth_month: p.birthMonth,
    skill_levels: p.skillLevels,
    xp: p.xp,
    power_ups: p.powerUps,
    current_streak: p.currentStreak,
    longest_streak: p.longestStreak,
    last_played_on: p.lastPlayedOn,
  };
}

/**
 * A working profile to use when the Supabase `profiles` row is missing (the
 * auto-create trigger never ran, the migration isn't applied, or we're
 * offline). Birth date comes from the auth user's sign-up metadata so age-based
 * difficulty stays correct; everything else starts fresh. Without this, a
 * missing row left `profile` null and silently dropped all XP — the level gauge
 * never moved.
 */
function defaultProfile(userId: string): Profile {
  const meta = useAuthStore.getState().session?.user?.user_metadata as
    | { birth_year?: number; birth_month?: number }
    | undefined;
  return {
    id: userId,
    birthYear: meta?.birth_year ?? new Date().getFullYear() - 10,
    birthMonth: meta?.birth_month ?? 1,
    skillLevels: {},
    xp: 0,
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
  /** Fetch the signed-in user's profile row. */
  loadProfile: (userId: string) => Promise<void>;
  /** Persist a new skill level for one topic (optimistic update). */
  setSkillLevel: (topic: Topic, level: number) => Promise<void>;
  /** Add experience points (optimistic update). */
  addXp: (amount: number) => Promise<void>;
  /** Record a power-up chosen on level-up (optimistic update). */
  addPowerUp: (id: PowerUpId) => Promise<void>;
  /** Advance the daily streak after a round / battle (#28). */
  recordActivity: () => Promise<void>;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  profile: null,
  loading: false,
  error: null,
  remoteError: null,

  loadProfile: async (userId) => {
    set({ loading: true, error: null });
    const local = readLocalProfile(userId);
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, birth_year, birth_month, skill_levels, xp, power_ups, current_streak, longest_streak, last_played_on',
      )
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      // Reconcile the remote row with any local progress, keeping the higher of
      // each — this protects a player whose remote writes are silently failing
      // (e.g. an RLS policy not applied on the live DB) from being reset to
      // Level 1 by a remote row stuck at 0.
      const merged = mergeProfiles(fromRow(data as ProfileRow), local);
      set({ profile: merged, loading: false, remoteError: null });
      writeLocalProfile(merged);
      // If the local cache was ahead, best-effort push the merge back up.
      if (local && merged.xp > (fromRow(data as ProfileRow).xp ?? 0)) {
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
      // one, else an in-memory default; surface the failure.
      const profile = local ?? defaultProfile(userId);
      set({ profile, loading: false, remoteError: errorMessage(error) });
      writeLocalProfile(profile);
      return;
    }

    // Genuinely no row. Seed from local progress if we have any, and create it
    // with DO-NOTHING-on-conflict so a racing/existing row is never clobbered.
    const seed = local ?? defaultProfile(userId);
    set({ profile: seed, loading: false, remoteError: null });
    writeLocalProfile(seed);
    void supabase
      .from('profiles')
      .upsert(toRow(seed), { onConflict: 'id', ignoreDuplicates: true })
      .then(({ error: upsertError }) => {
        if (upsertError) set({ remoteError: errorMessage(upsertError) });
      });
  },

  setSkillLevel: async (topic, level) => {
    const profile = get().profile;
    if (!profile) return;
    const skillLevels = { ...profile.skillLevels, [topic]: level };
    const updated = { ...profile, skillLevels };
    set({ profile: updated }); // optimistic
    writeLocalProfile(updated); // durable locally even if the remote write fails
    const { error } = await supabase
      .from('profiles')
      .update({ skill_levels: skillLevels, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  addXp: async (amount) => {
    const profile = get().profile;
    if (!profile || amount <= 0) return;
    const updated = { ...profile, xp: profile.xp + amount };
    set({ profile: updated }); // optimistic
    writeLocalProfile(updated);
    const { error } = await supabase
      .from('profiles')
      .update({ xp: updated.xp, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  addPowerUp: async (id) => {
    const profile = get().profile;
    if (!profile) return;
    const powerUps = { ...profile.powerUps, [id]: (profile.powerUps[id] ?? 0) + 1 };
    const updated = { ...profile, powerUps };
    set({ profile: updated }); // optimistic
    writeLocalProfile(updated);
    const { error } = await supabase
      .from('profiles')
      .update({ power_ups: powerUps, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  recordActivity: async () => {
    const profile = get().profile;
    if (!profile) return;
    const today = todayIso();
    // Same-day no-op — don't write or even nudge the streak.
    if (profile.lastPlayedOn === today) return;
    const newCurrent = nextStreak(profile.currentStreak, profile.lastPlayedOn, today);
    const newLongest = Math.max(profile.longestStreak, newCurrent);
    const updated = {
      ...profile,
      currentStreak: newCurrent,
      longestStreak: newLongest,
      lastPlayedOn: today,
    };
    set({ profile: updated });
    writeLocalProfile(updated);
    const { error } = await supabase
      .from('profiles')
      .update({
        current_streak: newCurrent,
        longest_streak: newLongest,
        last_played_on: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);
    if (error) set({ remoteError: errorMessage(error) });
  },

  clearProfile: () => set({ profile: null, loading: false, error: null, remoteError: null }),
}));
