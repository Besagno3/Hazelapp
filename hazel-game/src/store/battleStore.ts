import { create } from 'zustand';
import type { BattleEnemy } from '../types';

/**
 * Ephemeral battle-session state (#37). Deliberately NOT persisted — a
 * reload mid-battle resumes in the world (the save file is the durable
 * record). Replaces the old persisted `gameStore.battle`.
 */
interface BattleStore {
  enemy: BattleEnemy | null;
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  /** Enemy instances beaten this session — kept off the map until reload. */
  defeatedIds: string[];

  start: (enemy: BattleEnemy, playerHp: number, playerMaxHp: number) => void;
  setHp: (playerHp: number, enemyHp: number) => void;
  markDefeated: (instanceId: string) => void;
  endBattle: () => void;
  reset: () => void;
}

export const useBattleStore = create<BattleStore>((set) => ({
  enemy: null,
  playerHp: 0,
  playerMaxHp: 0,
  enemyHp: 0,
  defeatedIds: [],

  start: (enemy, playerHp, playerMaxHp) =>
    set({ enemy, playerHp, playerMaxHp, enemyHp: enemy.maxHp }),

  setHp: (playerHp, enemyHp) => set({ playerHp, enemyHp }),

  markDefeated: (instanceId) =>
    set((s) => ({ defeatedIds: [...s.defeatedIds, instanceId] })),

  endBattle: () => set({ enemy: null }),

  reset: () =>
    set({ enemy: null, playerHp: 0, playerMaxHp: 0, enemyHp: 0, defeatedIds: [] }),
}));
