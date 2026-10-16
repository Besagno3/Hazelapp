import { create } from 'zustand';

/**
 * The Name finale's session state (#75 item 16e review round 1), never saved:
 * - `passed`: Umbra's questions were answered this session, so leaving at the
 *   name question doesn't mean answering them all again;
 * - `pendingXp`: what the finale earned once her name is said — paid as the
 *   name panels end, so a level-up never covers the story (WorldScreen).
 */
interface FinaleState {
  passed: boolean;
  pendingXp: number;
  pass: () => void;
  owe: (xp: number) => void;
  /** Takes what's owed (and forgets it). */
  takeXp: () => number;
  reset: () => void;
}

export const useFinaleStore = create<FinaleState>((set, get) => ({
  passed: false,
  pendingXp: 0,
  pass: () => set({ passed: true }),
  owe: (xp) => set({ pendingXp: get().pendingXp + xp }),
  takeXp: () => {
    const xp = get().pendingXp;
    set({ pendingXp: 0 });
    return xp;
  },
  reset: () => set({ passed: false, pendingXp: 0 }),
}));
