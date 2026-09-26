import { create } from 'zustand';
import type { BattleEnemy } from '../types';
import type { CombatState } from '../lib/battleTurn';

/**
 * Ephemeral battle-session state (#37). Deliberately NOT persisted — a
 * reload mid-battle resumes in the world (the save file is the durable
 * record). Replaces the old persisted `gameStore.battle`.
 *
 * It is also the single, synchronous source of truth for the fight's numbers
 * (#70): `BattleArena` reads `combatState()` at the moment a command resolves
 * and writes the result straight back with `applyCombat`, so no delayed or
 * render-captured write can clobber another.
 */
interface BattleStore {
  enemy: BattleEnemy | null;
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  /** Spell charge (◆). */
  charge: number;
  /** The hero's next incoming hit is fully blocked. */
  guarded: boolean;
  /** Shielded archetype: the first landed hit breaks the shield. */
  enemyShielded: boolean;
  /** Highest boss enrage phase already announced. */
  lastPhase: number;
  /** Enemy instances beaten this session — kept off the map until reload. */
  defeatedIds: string[];

  start: (enemy: BattleEnemy, playerHp: number, playerMaxHp: number) => void;
  applyCombat: (s: CombatState) => void;
  markDefeated: (instanceId: string) => void;
  endBattle: () => void;
  reset: () => void;
}

const FRESH_COMBAT = { charge: 0, guarded: false, enemyShielded: false, lastPhase: 0 };

export const useBattleStore = create<BattleStore>((set) => ({
  enemy: null,
  playerHp: 0,
  playerMaxHp: 0,
  enemyHp: 0,
  ...FRESH_COMBAT,
  defeatedIds: [],

  start: (enemy, playerHp, playerMaxHp) =>
    set({
      enemy,
      playerHp,
      playerMaxHp,
      enemyHp: enemy.maxHp,
      ...FRESH_COMBAT,
      enemyShielded: enemy.behavior === 'shielded',
    }),

  applyCombat: (s) =>
    set({
      playerHp: s.playerHp,
      enemyHp: s.enemyHp,
      charge: s.charge,
      guarded: s.guarded,
      enemyShielded: s.enemyShielded,
      lastPhase: s.lastPhase,
    }),

  markDefeated: (instanceId) =>
    set((s) => ({ defeatedIds: [...s.defeatedIds, instanceId] })),

  endBattle: () => set({ enemy: null }),

  reset: () =>
    set({ enemy: null, playerHp: 0, playerMaxHp: 0, enemyHp: 0, ...FRESH_COMBAT, defeatedIds: [] }),
}));

/** The live combat numbers, read synchronously (never from a stale render). */
export function combatState(): CombatState {
  const s = useBattleStore.getState();
  return {
    playerHp: s.playerHp,
    playerMaxHp: s.playerMaxHp,
    enemyHp: s.enemyHp,
    enemyMaxHp: s.enemy?.maxHp ?? s.enemyHp,
    charge: s.charge,
    guarded: s.guarded,
    enemyShielded: s.enemyShielded,
    lastPhase: s.lastPhase,
  };
}
