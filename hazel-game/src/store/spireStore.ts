import { create } from 'zustand';
import { SPIRE_LIVES } from '../content/spire';

/**
 * Live state of a Spire climb (#74) — the bridge between the walkable floor
 * map (`WorldCanvas`, via `WorldScreen`) and the climb's rules + question
 * panels (`SpireOverlay`). Ephemeral: never saved; a new climb starts fresh.
 *
 * The canvas only *reports* bumps (`bump`); the overlay decides what they
 * mean (a question, a sealed-stairs line, Umbra's challenge) and clears them.
 */
export type SpireBump = { kind: 'ward'; id: string } | { kind: 'stairs' } | { kind: 'umbra' };

interface SpireState {
  /** Index into SPIRE_FLOORS while a floor map is shown; null before/after. */
  floor: number | null;
  /** True while the hero is free to walk the floor (no panel open). */
  exploring: boolean;
  /** Candle-lights left (also sizes the hero's circle of light). */
  lives: number;
  /** Rune seals broken on the current floor (ids "x,y"). */
  broken: string[];
  /** The latest unhandled bump from the map, for the overlay to resolve. */
  pending: SpireBump | null;

  reset: () => void;
  enterFloor: (index: number) => void;
  setExploring: (exploring: boolean) => void;
  setLives: (lives: number) => void;
  breakWard: (id: string) => void;
  /** Report a bump — ignored while another is pending or a panel is open. */
  bump: (b: SpireBump) => void;
  clearPending: () => void;
}

const initial = { floor: null, exploring: false, lives: SPIRE_LIVES, broken: [], pending: null };

export const useSpireStore = create<SpireState>((set, get) => ({
  ...initial,
  reset: () => set({ ...initial }),
  enterFloor: (index) => set({ floor: index, broken: [], pending: null, exploring: false }),
  setExploring: (exploring) => set({ exploring }),
  setLives: (lives) => set({ lives }),
  breakWard: (id) => set((s) => (s.broken.includes(id) ? s : { broken: [...s.broken, id] })),
  bump: (b) => {
    const s = get();
    if (!s.exploring || s.pending) return;
    if (b.kind === 'ward' && s.broken.includes(b.id)) return;
    set({ pending: b, exploring: false });
  },
  clearPending: () => set({ pending: null }),
}));
