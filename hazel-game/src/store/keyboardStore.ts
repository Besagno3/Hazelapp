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

/** The physical keys down right now (review round 6): a run that starts mid-press (an anchor held through a line's beat) reads them. */
const down = new Set<string>();
export function keysDown(): ReadonlySet<string> {
  return down;
}

/**
 * Listens for the first press from a physical keyboard (wired once, in
 * `App`), and keeps `keysDown` current — in the capture phase, so a typing
 * run's own listener sees it already written. Returns the unsubscribe.
 */
export function watchKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!fromPhysicalKeyboard(e)) return;
    // A chord's key is never an anchor, and macOS sends no keyup for a key pressed under ⌘ (round 7).
    if (!e.ctrlKey && !e.metaKey && !e.altKey) down.add(e.code);
    // Written once (review round 2: every key, WASD's auto-repeat included, wrote the store).
    if (!useKeyboardStore.getState().present) useKeyboardStore.getState().seen();
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const onBlur = () => down.clear();
  const onHidden = () => {
    if (document.visibilityState === 'hidden') down.clear();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onUp, true);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onHidden);
  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onUp, true);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onHidden);
    down.clear();
  };
}
