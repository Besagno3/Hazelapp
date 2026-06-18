import { create } from 'zustand';
import {
  type AudioSettings,
  readSettings,
  writeSettings,
} from '../lib/settings';

/**
 * Device audio settings (off by default — see `lib/settings.ts`). Write-through
 * to localStorage on every change. The audio engine (`lib/audio.ts`) reads this
 * store at call time, so toggling music/sfx takes effect immediately.
 */
interface SettingsStore extends AudioSettings {
  setMusic: (on: boolean) => void;
  setSfx: (on: boolean) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
}

function persist(set: (partial: Partial<AudioSettings>) => void) {
  return (partial: Partial<AudioSettings>) => {
    set(partial);
    writeSettings(useSettingsStore.getState());
  };
}

export const useSettingsStore = create<SettingsStore>((set) => {
  const save = persist(set);
  return {
    ...readSettings(),
    setMusic: (on) => save({ music: on }),
    setSfx: (on) => save({ sfx: on }),
    setMusicVolume: (v) => save({ musicVolume: v }),
    setSfxVolume: (v) => save({ sfxVolume: v }),
  };
});
