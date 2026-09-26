import { create } from 'zustand';
import type { BattleEnemy } from '../types';
import type { CompanionId } from '../content/companion';

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
  /** The companion fighting beside the hero (🔄 Swap); kept between fights this session. */
  companionId: CompanionId;
  /** Losses per enemy def this session — after a couple, that enemy eases off (mercy). */
  losses: Record<string, number>;

  start: (enemy: BattleEnemy, playerHp: number, playerMaxHp: number) => void;
  setHp: (playerHp: number, enemyHp: number) => void;
  markDefeated: (instanceId: string) => void;
  setCompanion: (id: CompanionId) => void;
  recordLoss: (defId: string) => void;
  endBattle: () => void;
  reset: () => void;
}

export const useBattleStore = create<BattleStore>((set) => ({
  enemy: null,
  playerHp: 0,
  playerMaxHp: 0,
  enemyHp: 0,
  defeatedIds: [],
  companionId: 'ember',
  losses: {},

  start: (enemy, playerHp, playerMaxHp) =>
    set({ enemy, playerHp, playerMaxHp, enemyHp: enemy.maxHp }),

  setHp: (playerHp, enemyHp) => set({ playerHp, enemyHp }),

  markDefeated: (instanceId) =>
    set((s) => ({ defeatedIds: [...s.defeatedIds, instanceId] })),

  setCompanion: (companionId) => set({ companionId }),

  recordLoss: (defId) => set((s) => ({ losses: { ...s.losses, [defId]: (s.losses[defId] ?? 0) + 1 } })),

  endBattle: () => set({ enemy: null }),

  reset: () =>
    set({
      enemy: null,
      playerHp: 0,
      playerMaxHp: 0,
      enemyHp: 0,
      defeatedIds: [],
      companionId: 'ember',
      losses: {},
    }),
}));
