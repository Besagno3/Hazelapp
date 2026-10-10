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
   * Losses per enemy kind and tier this session (`lossKey`) — after a couple,
   * that enemy eases off (mercy). Deliberately session-only: a reload is a
   * fresh start.
   */
  losses: Record<string, number>;
  /**
   * Danger tiers already explained this session (#75 item 12): the first
   * battle against a critter with "!" marks says what they mean, once per tier.
   */
  toughMet: number[];
  /** The "💤 Sleepy critters let you pass…" hint has been said this session (#112e). */
  sleeperHintSaid: boolean;

  start: (enemy: BattleEnemy, playerHp: number, playerMaxHp: number) => void;
  applyCombat: (s: CombatState) => void;
  markDefeated: (instanceId: string) => void;
  recordLoss: (key: string) => void;
  meetTough: (tier: number) => void;
  saySleeperHint: () => void;
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
  toughMet: [],
  sleeperHintSaid: false,

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

  recordLoss: (key) => set((s) => ({ losses: { ...s.losses, [key]: (s.losses[key] ?? 0) + 1 } })),

  meetTough: (tier) => set((s) => (s.toughMet.includes(tier) ? s : { toughMet: [...s.toughMet, tier] })),

  saySleeperHint: () => set({ sleeperHintSaid: true }),

  endBattle: () => set({ enemy: null }),

  reset: () =>
    set({
      enemy: null,
      playerHp: 0,
      playerMaxHp: 0,
      enemyHp: 0,
      ...FRESH_COMBAT,
      defeatedIds: [],
      losses: {},
      toughMet: [],
      sleeperHintSaid: false,
    }),
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
