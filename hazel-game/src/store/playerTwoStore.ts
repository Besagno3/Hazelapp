import { create } from 'zustand';
import { readKidLevels, type GuestPace, type PlayerTwo } from '../lib/playerTwo';
import type { Kid } from '../types';

/**
 * Player 2 for this session (#177, `lib/playerTwo.ts`): picked once, kept for
 * the next 🆚 Quiz Duel, and put away with the game (Switch player, sign-out —
 * `putAwayGame`). Deliberately not persisted: a new session asks again.
 */
interface PlayerTwoStore {
  playerTwo: PlayerTwo | null;
  /** A kid's levels are being read (the kid is picked already). */
  loading: boolean;
  /** A family kid as Player 2; their levels are read in the background. */
  chooseKid: (kid: Kid) => Promise<void>;
  chooseGuest: (name: string, pace: GuestPace) => void;
  clear: () => void;
}

/** Bumped on every choice: levels that come back after another pick are dropped. */
let pickGen = 0;

export const usePlayerTwoStore = create<PlayerTwoStore>((set) => ({
  playerTwo: null,
  loading: false,

  chooseKid: async (kid) => {
    const gen = ++pickGen;
    const base = {
      kind: 'kid' as const,
      id: kid.id,
      name: kid.name?.trim() || 'Player 2',
      icon: kid.icon,
      birthYear: kid.birthYear,
      birthMonth: kid.birthMonth,
    };
    set({ playerTwo: { ...base, skillLevels: {} }, loading: true });
    const skillLevels = await readKidLevels(kid.id);
    if (gen !== pickGen) return;
    set({ playerTwo: { ...base, skillLevels }, loading: false });
  },

  chooseGuest: (name, pace) => {
    pickGen++;
    set({ playerTwo: { kind: 'guest', name, pace }, loading: false });
  },

  clear: () => {
    pickGen++;
    set({ playerTwo: null, loading: false });
  },
}));
