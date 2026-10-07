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
  /** Battle-item buffs (Mirror Charm / Focus Tea / Lucky Clover), per fight. */
  mirrored: boolean;
  focused: boolean;
  lucky: boolean;
  /** Enemy instances beaten this session — kept off the map until reload. */
  defeatedIds: string[];
  /**
   * Losses per enemy def this session — after a couple, that enemy's questions
   * get easier (mercy). Deliberately session-only: a reload is a fresh start.
   */
  losses: Record<string, number>;

  start: (enemy: BattleEnemy, playerHp: number, playerMaxHp: number) => void;
  applyCombat: (s: CombatState) => void;
  markDefeated: (instanceId: string) => void;
  recordLoss: (defId: string) => void;
  endBattle: () => void;
  reset: () => void;
}

const FRESH_COMBAT = {
  charge: 0,
  guarded: false,
  enemyShielded: false,
  lastPhase: 0,
  mirrored: false,
  focused: false,
  lucky: false,
};

export const useBattleStore = create<BattleStore>((set) => ({
  enemy: null,
  playerHp: 0,
  playerMaxHp: 0,
  enemyHp: 0,
  ...FRESH_COMBAT,
  defeatedIds: [],
  losses: {},

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
      mirrored: s.mirrored,
      focused: s.focused,
      lucky: s.lucky,
    }),

  markDefeated: (instanceId) =>
    set((s) => ({ defeatedIds: [...s.defeatedIds, instanceId] })),

  recordLoss: (defId) => set((s) => ({ losses: { ...s.losses, [defId]: (s.losses[defId] ?? 0) + 1 } })),

  endBattle: () => set({ enemy: null }),

  reset: () =>
    set({ enemy: null, playerHp: 0, playerMaxHp: 0, enemyHp: 0, ...FRESH_COMBAT, defeatedIds: [], losses: {} }),
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
    mirrored: s.mirrored,
    focused: s.focused,
    lucky: s.lucky,
  };
}
