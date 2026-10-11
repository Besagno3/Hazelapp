/**
 * Device-level player settings (audio for now). Unlike the save file these
 * are NOT per-user and NOT synced to Supabase — they describe how this device
 * should behave, so they live only in localStorage. Pure read/normalize logic
 * here; the React-facing store is `store/settingsStore.ts`.
 *
 * Music ships ON by default, so the sign-in screen greets everyone with its
 * intro (from their first tap or key — browsers hold sound until then) and
 * the game's music follows. Sound effects ship OFF. Both are switched in the
 * in-game menu, and a choice sticks: whoever turned music off keeps it off.
 */

export interface AudioSettings {
  /** Background music on? */
  music: boolean;
  /** Sound effects on? */
  sfx: boolean;
  /** Music level, 0..1. */
  musicVolume: number;
  /** SFX level, 0..1. */
  sfxVolume: number;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  music: true,
  sfx: false,
  musicVolume: 0.4,
  sfxVolume: 0.7,
};

export const SETTINGS_KEY = 'hazel-settings';

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function clamp01(n: unknown, fallback: number): number {
  return typeof n === 'number' && n >= 0 && n <= 1 ? n : fallback;
}

/** Coerce anything (legacy / partial / corrupt JSON) into valid settings. */
export function normalizeSettings(raw: unknown): AudioSettings {
  const r = (raw ?? {}) as Partial<AudioSettings>;
  return {
    music: bool(r.music, DEFAULT_SETTINGS.music), // an explicit "off" is kept
    sfx: bool(r.sfx, DEFAULT_SETTINGS.sfx),
    musicVolume: clamp01(r.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxVolume: clamp01(r.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
  };
}

export function readSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Private-mode / quota — settings just won't persist this session.
  }
}
