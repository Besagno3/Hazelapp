import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { nextStreak, todayIso } from '../lib/streak';
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

  loadProfile: async (userId) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, birth_year, birth_month, skill_levels, xp, power_ups, current_streak, longest_streak, last_played_on',
      )
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      set({ profile: fromRow(data as ProfileRow), loading: false });
      return;
    }
    // No row (trigger/migration not applied) or the read failed: fall back to a
    // working local profile so XP / level / power-ups function this session, and
    // best-effort create the row so progress persists going forward. Mirrors
    // saveStore's local-degradation behavior.
    const fallback = defaultProfile(userId);
    set({ profile: fallback, loading: false, error: error ? errorMessage(error) : null });
    void supabase
      .from('profiles')
      .upsert(toRow(fallback), { onConflict: 'id' })
      .then(({ error: upsertError }) => {
        if (upsertError) set({ error: errorMessage(upsertError) });
      });
  },

  setSkillLevel: async (topic, level) => {
    const profile = get().profile;
    if (!profile) return;
    const skillLevels = { ...profile.skillLevels, [topic]: level };
    set({ profile: { ...profile, skillLevels } }); // optimistic
    const { error } = await supabase
      .from('profiles')
      .update({ skill_levels: skillLevels, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ error: errorMessage(error) });
  },

  addXp: async (amount) => {
    const profile = get().profile;
    if (!profile || amount <= 0) return;
    const xp = profile.xp + amount;
    set({ profile: { ...profile, xp } }); // optimistic
    const { error } = await supabase
      .from('profiles')
      .update({ xp, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ error: errorMessage(error) });
  },

  addPowerUp: async (id) => {
    const profile = get().profile;
    if (!profile) return;
    const powerUps = { ...profile.powerUps, [id]: (profile.powerUps[id] ?? 0) + 1 };
    set({ profile: { ...profile, powerUps } }); // optimistic
    const { error } = await supabase
      .from('profiles')
      .update({ power_ups: powerUps, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) set({ error: errorMessage(error) });
  },

  recordActivity: async () => {
    const profile = get().profile;
    if (!profile) return;
    const today = todayIso();
    // Same-day no-op — don't write or even nudge the streak.
    if (profile.lastPlayedOn === today) return;
    const newCurrent = nextStreak(profile.currentStreak, profile.lastPlayedOn, today);
    const newLongest = Math.max(profile.longestStreak, newCurrent);
    set({
      profile: {
        ...profile,
        currentStreak: newCurrent,
        longestStreak: newLongest,
        lastPlayedOn: today,
      },
    });
    const { error } = await supabase
      .from('profiles')
      .update({
        current_streak: newCurrent,
        longest_streak: newLongest,
        last_played_on: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);
    if (error) set({ error: errorMessage(error) });
  },

  clearProfile: () => set({ profile: null, loading: false, error: null }),
}));
