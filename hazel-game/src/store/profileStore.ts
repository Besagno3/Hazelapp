import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import type { PowerUpId, PowerUps, Profile, SkillLevels, Topic } from '../types';

/** Shape of a row in the Supabase `profiles` table (snake_case). */
interface ProfileRow {
  id: string;
  birth_year: number;
  birth_month: number;
  skill_levels: SkillLevels | null;
  xp: number | null;
  power_ups: PowerUps | null;
}

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    birthYear: row.birth_year,
    birthMonth: row.birth_month,
    skillLevels: row.skill_levels ?? {},
    xp: row.xp ?? 0,
    powerUps: row.power_ups ?? {},
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
      .select('id, birth_year, birth_month, skill_levels, xp, power_ups')
      .eq('id', userId)
      .single();
    if (error) {
      set({ loading: false, error: errorMessage(error) });
      return;
    }
    set({ profile: fromRow(data as ProfileRow), loading: false });
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

  clearProfile: () => set({ profile: null, loading: false, error: null }),
}));
