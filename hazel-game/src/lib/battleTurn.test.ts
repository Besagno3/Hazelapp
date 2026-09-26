import { describe, it, expect, beforeEach } from 'vitest';
import {
  chargeAfterAnswer,
  itemBlocked,
  resolveEnemyTurn,
  resolveHeroHit,
  resolveItem,
  resolveSpell,
  type CombatState,
} from './battleTurn';
import { defendReduction, enemyAttack, healerRegen } from './battleMath';
import { CHARGE_MAX } from '../content/abilities';
import { POTION_HEAL, SPARK_CHARGE } from '../content/items';
import { AEGIS, EMBER_BREATH, MEND } from '../content/spells';
import { combatState, useBattleStore } from '../store/battleStore';
import type { BattleEnemy } from '../types';

const base: CombatState = {
  playerHp: 100,
  playerMaxHp: 150,
  enemyHp: 90,
  enemyMaxHp: 90,
  charge: 0,
  guarded: false,
  enemyShielded: false,
  lastPhase: 0,
};

const enemyInput = {
  wasCorrect: false,
  level: 3,
  isBoss: false,
  style: 'balanced' as const,
  powerUps: {},
};

describe('chargeAfterAnswer', () => {
  it('fills one ◆ per correct answer, capped at CHARGE_MAX', () => {
    expect(chargeAfterAnswer(0, true)).toBe(1);
    expect(chargeAfterAnswer(CHARGE_MAX, true)).toBe(CHARGE_MAX);
    expect(chargeAfterAnswer(2, false)).toBe(2);
  });
});

describe('resolveHeroHit', () => {
  it('deals damage and reports a plain hit', () => {
    const r = resolveHeroHit(base, 30, { isBoss: false });
    expect(r.outcome).toBe('hit');
    expect(r.state.enemyHp).toBe(60);
    expect(r.dealt).toBe(30);
  });

  it('never drops enemy HP below zero and reports defeat', () => {
    const r = resolveHeroHit(base, 500, { isBoss: false });
    expect(r.outcome).toBe('defeated');
    expect(r.state.enemyHp).toBe(0);
    expect(r.dealt).toBe(90);
  });

  it('a shield absorbs the first landed hit, then is gone', () => {
    const r = resolveHeroHit({ ...base, enemyShielded: true }, 30, { isBoss: false });
    expect(r.outcome).toBe('shield-broken');
    expect(r.state.enemyHp).toBe(90);
    expect(r.state.enemyShielded).toBe(false);
    expect(resolveHeroHit(r.state, 30, { isBoss: false }).state.enemyHp).toBe(60);
  });

  it('a shield-absorbed spell refunds its charge (effort never punished)', () => {
    const r = resolveHeroHit({ ...base, enemyShielded: true, charge: 0 }, 80, { isBoss: false, refundCharge: 3 });
    expect(r.refunded).toBe(3);
    expect(r.state.charge).toBe(3);
  });

  it('announces each boss enrage phase exactly once', () => {
    const first = resolveHeroHit(base, 40, { isBoss: true }); // 50/90 → phase 1
    expect(first.newPhase).toBe(1);
    const again = resolveHeroHit(first.state, 1, { isBoss: true }); // still phase 1
    expect(again.newPhase).toBeNull();
    const furious = resolveHeroHit(again.state, 25, { isBoss: true }); // 24/90 → phase 2
    expect(furious.newPhase).toBe(2);
  });

  it('never announces phases for regular enemies', () => {
    expect(resolveHeroHit(base, 80, { isBoss: false }).newPhase).toBeNull();
  });
});

describe('resolveEnemyTurn', () => {
  it('a standing guard blocks the hit completely and is spent', () => {
    const r = resolveEnemyTurn({ ...base, guarded: true }, enemyInput);
    expect(r.dmg).toBe(0);
    expect(r.state.playerHp).toBe(100);
    expect(r.state.guarded).toBe(false);
  });

  it('a correct defend answer softens the hit', () => {
    const miss = resolveEnemyTurn(base, enemyInput);
    const block = resolveEnemyTurn(base, { ...enemyInput, wasCorrect: true });
    expect(miss.dmg).toBe(enemyAttack(3, false, 0) - defendReduction(false, 'balanced', {}));
    expect(block.dmg).toBeLessThan(miss.dmg);
  });

  it('reports the hero going down (HP floors at zero)', () => {
    const r = resolveEnemyTurn({ ...base, playerHp: 1 }, enemyInput);
    expect(r.state.playerHp).toBe(0);
    expect(r.heroDown).toBe(true);
  });

  it('a hurt healer mends itself; a healthy one does not', () => {
    const hurt = resolveEnemyTurn({ ...base, enemyHp: 30 }, { ...enemyInput, behavior: 'healer' });
    expect(hurt.mended).toBe(healerRegen(90));
    expect(hurt.state.enemyHp).toBe(30 + healerRegen(90));
    expect(resolveEnemyTurn(base, { ...enemyInput, behavior: 'healer' }).mended).toBe(0);
  });

  it('boss damage uses the enrage phase at the moment it swings', () => {
    const calm = resolveEnemyTurn(base, { ...enemyInput, isBoss: true });
    const furious = resolveEnemyTurn({ ...base, enemyHp: 10 }, { ...enemyInput, isBoss: true });
    expect(furious.dmg).toBeGreaterThan(calm.dmg);
  });
});

describe('resolveSpell', () => {
  it('a miss fizzles and keeps the charge', () => {
    const r = resolveSpell({ ...base, charge: 4 }, MEND, false);
    expect(r.kind).toBe('fizzle');
    expect(r.state.charge).toBe(4);
  });

  it('Mend spends its cost and heals, capped at max HP', () => {
    const r = resolveSpell({ ...base, charge: 4, playerHp: 140 }, MEND, true);
    expect(r.kind).toBe('heal');
    expect(r.state.charge).toBe(4 - MEND.cost);
    expect(r.state.playerHp).toBe(150);
  });

  it('Aegis raises the guard', () => {
    const r = resolveSpell({ ...base, charge: 4 }, AEGIS, true);
    expect(r.kind).toBe('shield');
    expect(r.state.guarded).toBe(true);
  });

  it('an offensive spell spends its cost and hands back the multiplier', () => {
    const r = resolveSpell({ ...base, charge: 4 }, EMBER_BREATH, true);
    expect(r.kind).toBe('strike');
    expect(r.state.charge).toBe(4 - EMBER_BREATH.cost);
  });
});

describe('battle items', () => {
  it('blocks items that would do nothing', () => {
    expect(itemBlocked(base, 'potion', 0)).toBe('None left');
    expect(itemBlocked({ ...base, playerHp: 150 }, 'potion', 1)).toBe('HP is full');
    expect(itemBlocked({ ...base, charge: CHARGE_MAX }, 'spark', 1)).toBe('Charge is full');
    expect(itemBlocked({ ...base, guarded: true }, 'ward', 1)).toBe('Already warded');
    expect(itemBlocked(base, 'potion', 1)).toBeNull();
  });

  it('potion heals POTION_HEAL, elixir heals to full', () => {
    expect(resolveItem({ ...base, playerHp: 10 }, 'potion').healed).toBe(POTION_HEAL);
    expect(resolveItem(base, 'elixir').state.playerHp).toBe(150);
  });

  it('spark adds charge, ward raises the guard', () => {
    expect(resolveItem(base, 'spark').chargeGained).toBe(SPARK_CHARGE);
    expect(resolveItem(base, 'ward').state.guarded).toBe(true);
  });
});

describe('battleStore combat state (#70 tap-race)', () => {
  const enemy = {
    id: 'relic-golem',
    instanceId: 'x1',
    name: 'Relic Golem',
    sprite: '🗿',
    level: 3,
    maxHp: 90,
    topic: 'math',
    zoneId: 'numbria',
    isBoss: false,
    coins: 10,
    behavior: 'shielded',
  } as BattleEnemy;

  beforeEach(() => useBattleStore.getState().reset());

  it('start() resets combat and derives the shield from the archetype', () => {
    useBattleStore.getState().applyCombat({ ...base, charge: 3, guarded: true });
    useBattleStore.getState().start(enemy, 100, 150);
    const s = combatState();
    expect(s).toMatchObject({ playerHp: 100, enemyHp: 90, charge: 0, guarded: false, enemyShielded: true });
    useBattleStore.getState().start({ ...enemy, instanceId: 'x2', behavior: undefined }, 100, 150);
    expect(combatState().enemyShielded).toBe(false);
  });

  it('an enemy hit followed at once by a potion keeps BOTH effects', () => {
    useBattleStore.getState().start({ ...enemy, behavior: undefined }, 100, 150);
    const { applyCombat } = useBattleStore.getState();
    // Enemy turn resolves and is written immediately…
    const hit = resolveEnemyTurn(combatState(), enemyInput);
    applyCombat(hit.state);
    // …so a potion tapped straight after reads the post-hit HP.
    applyCombat(resolveItem(combatState(), 'potion').state);
    expect(combatState().playerHp).toBe(Math.min(150, 100 - hit.dmg + POTION_HEAL));
  });
});
