import { create } from 'zustand';
import { fromPhysicalKeyboard } from '../lib/typing';

/**
 * Whether a real keyboard has been seen this session (#159). Touch typing
 * can't be taught on a phone's glass keyboard, so the ✍️ scribe bursts and
 * the name bonus only appear once a physical key has been pressed; the
 * Library's lessons ask for one first. Session-only on purpose: a tablet
 * may have its keyboard one day and not the next.
 */
interface KeyboardStore {
  present: boolean;
  /** A key from a physical keyboard was pressed. */
  seen: () => void;
  reset: () => void;
}

export const useKeyboardStore = create<KeyboardStore>((set) => ({
  present: false,
  seen: () => set({ present: true }),
  reset: () => set({ present: false }),
}));

/**
 * Listens for the first press from a physical keyboard (wired once, in
 * `App`). Returns the unsubscribe.
 */
export function watchKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (fromPhysicalKeyboard(e)) useKeyboardStore.getState().seen();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
