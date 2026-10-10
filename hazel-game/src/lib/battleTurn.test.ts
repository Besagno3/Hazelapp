import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyFocus,
  chargeAfterAnswer,
  DEFEND_MAX_MS,
  DEFEND_MERCY_BONUS_MS,
  DEFEND_MIN_MS,
  defendTimeMs,
  fastAnswerMs,
  FAST_STREAK,
  heroOpening,
  itemBlocked,
  NO_OPENING,
  MAX_SPEED_BOOST,
  MERCY_AFTER,
  mercyFor,
  nextIntent,
  POWER_MULTIPLIER,
  powerMoveName,
  rollDrop,
  skillAfterBattle,
  SPARK_START_CHARGE,
  speedStep,
  STREAK_MAX,
  STREAK_START,
  streakMultiplier,
  victoryCoins,
  resolveEnemyTurn,
  resolveHeroHit,
  resolveItem,
  resolveSpell,
  type CombatState,
} from './battleTurn';
import { counterDamage, defendReduction, enemyAttack, healerRegen } from './battleMath';
import { CHARGE_MAX } from '../content/abilities';
import { POTION_HEAL, SNACK_HEAL, SPARK_CHARGE, TEA_DAMAGE_MULT } from '../content/items';
import { AEGIS, EMBER_BREATH, MEND } from '../content/spells';
import { combatState, useBattleStore } from '../store/battleStore';
import { ENEMY_DEFS } from '../content/enemies';
import { CONSUMABLE_IDS } from '../content/items';
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
  mirrored: false,
  focused: false,
  lucky: false,
  knotted: false,
  freeHint: false,
  secondWind: false,
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

describe('resolveEnemyTurn — telegraphed power blows', () => {
  it('a power blow hits POWER_MULTIPLIER× as hard', () => {
    const normal = resolveEnemyTurn(base, enemyInput).dmg;
    expect(resolveEnemyTurn(base, { ...enemyInput, intent: 'power' }).dmg).toBe(normal * POWER_MULTIPLIER);
  });

  it('a guard still blocks a power blow completely', () => {
    expect(resolveEnemyTurn({ ...base, guarded: true }, { ...enemyInput, intent: 'power' }).dmg).toBe(0);
  });

  it('a Mirror Charm bounces the full power blow', () => {
    const normal = resolveEnemyTurn(base, enemyInput).dmg;
    const r = resolveEnemyTurn({ ...base, mirrored: true }, { ...enemyInput, intent: 'power' });
    expect(r.reflected).toBe(Math.min(base.enemyHp, normal * POWER_MULTIPLIER));
  });
});

describe('nextIntent', () => {
  it('never charges on the first enemy turn', () => {
    expect(nextIntent(null, 0, false, 0)).toBe('attack');
    expect(nextIntent(null, 0, true, 0)).toBe('attack');
  });

  it('a charge is always followed by its power blow, then a normal turn', () => {
    expect(nextIntent('charge', 5, false, 0.99)).toBe('power');
    expect(nextIntent('power', 6, false, 0)).toBe('attack');
  });

  it('regular enemies charge on a low roll; bosses on a fixed rhythm', () => {
    expect(nextIntent('attack', 1, false, 0.1)).toBe('charge');
    expect(nextIntent('attack', 1, false, 0.5)).toBe('attack');
    expect(nextIntent('attack', 2, true, 0.99)).toBe('charge');
    expect(nextIntent('attack', 1, true, 0)).toBe('attack');
  });

  it('every boss has its own signature move name', () => {
    const bosses = Object.values(ENEMY_DEFS).filter((d) => d.isBoss);
    const names = bosses.map((b) => powerMoveName(b.id));
    expect(names).not.toContain('Mighty Blow');
    expect(new Set(names).size).toBe(bosses.length);
    expect(powerMoveName('sum-slime')).toBe('Mighty Blow');
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

describe('village-expansion items (#80)', () => {
  it('Mirror Charm blocks the hit, bounces it back, keeps a standing guard', () => {
    const r = resolveEnemyTurn({ ...base, mirrored: true, guarded: true }, enemyInput);
    expect(r.dmg).toBe(0);
    expect(r.reflected).toBe(enemyAttack(3, false, 0));
    expect(r.state.enemyHp).toBe(90 - r.reflected);
    expect(r.state.mirrored).toBe(false);
    expect(r.state.guarded).toBe(true);
  });

  it('a bounce onto a shielded foe shatters the shield instead of hurting it', () => {
    const r = resolveEnemyTurn({ ...base, mirrored: true, enemyShielded: true }, enemyInput);
    expect(r.shieldShattered).toBe(true);
    expect(r.reflected).toBe(0);
    expect(r.state.enemyShielded).toBe(false);
    expect(r.state.enemyHp).toBe(90);
  });

  it('a bounce can win the battle, and a beaten healer does not mend', () => {
    const r = resolveEnemyTurn({ ...base, mirrored: true, enemyHp: 5 }, { ...enemyInput, behavior: 'healer' });
    expect(r.enemyDown).toBe(true);
    expect(r.mended).toBe(0);
    expect(r.state.enemyHp).toBe(0);
  });

  it('a bounce announces a boss enrage phase', () => {
    const r = resolveEnemyTurn({ ...base, mirrored: true, enemyHp: 70 }, { ...enemyInput, isBoss: true });
    expect(r.newPhase).toBe(1);
    expect(r.state.lastPhase).toBe(1);
  });

  it('Focus Tea multiplies a landed hit once, but waits while a shield is up', () => {
    const f = applyFocus({ ...base, focused: true }, 30);
    expect(f.dmg).toBe(30 * TEA_DAMAGE_MULT);
    expect(f.state.focused).toBe(false);
    const held = applyFocus({ ...base, focused: true, enemyShielded: true }, 30);
    expect(held.dmg).toBe(30);
    expect(held.state.focused).toBe(true);
    expect(applyFocus(base, 30).dmg).toBe(30);
  });

  it('snack heals + charges; coil fills charge; buffs set their flags', () => {
    const snack = resolveItem({ ...base, playerHp: 10 }, 'snack');
    expect(snack.healed).toBe(SNACK_HEAL);
    expect(snack.chargeGained).toBe(1);
    expect(resolveItem(base, 'coil').state.charge).toBe(CHARGE_MAX);
    expect(resolveItem(base, 'mirror').state.mirrored).toBe(true);
    expect(resolveItem(base, 'tea').state.focused).toBe(true);
    expect(resolveItem(base, 'clover').state.lucky).toBe(true);
  });

  it('new items are greyed out when they would do nothing', () => {
    expect(itemBlocked({ ...base, playerHp: 150, charge: CHARGE_MAX }, 'snack', 1)).toBe('HP and charge are full');
    expect(itemBlocked({ ...base, charge: CHARGE_MAX }, 'coil', 1)).toBe('Charge is full');
    expect(itemBlocked({ ...base, mirrored: true }, 'mirror', 1)).toBe('Mirror is up');
    expect(itemBlocked({ ...base, focused: true }, 'tea', 1)).toBe('Already focused');
    expect(itemBlocked({ ...base, lucky: true }, 'clover', 1)).toBe('Already lucky');
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
    useBattleStore.getState().applyCombat({ ...base, charge: 3, guarded: true, mirrored: true, focused: true, lucky: true });
    useBattleStore.getState().start(enemy, 100, 150);
    const s = combatState();
    expect(s).toMatchObject({ playerHp: 100, enemyHp: 90, charge: 0, guarded: false, enemyShielded: true });
    // Item buffs belong to one fight too.
    expect(s).toMatchObject({ mirrored: false, focused: false, lucky: false });
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

describe('streaks, mercy, rewards', () => {
  it('the streak bonus starts at STREAK_START and caps at STREAK_MAX', () => {
    expect(streakMultiplier(STREAK_START - 1)).toBe(1);
    expect(streakMultiplier(STREAK_START)).toBeGreaterThan(1);
    expect(streakMultiplier(STREAK_MAX)).toBeGreaterThan(streakMultiplier(STREAK_START));
    expect(streakMultiplier(STREAK_MAX + 10)).toBe(streakMultiplier(STREAK_MAX));
  });

  it('near home, mercy makes questions easier after MERCY_AFTER losses — and nothing else', () => {
    expect(mercyFor(MERCY_AFTER - 1)).toEqual({ levelDrop: 0, fightTier: 1 });
    expect(mercyFor(MERCY_AFTER)).toEqual({ levelDrop: 1, fightTier: 1 });
    expect(mercyFor(MERCY_AFTER, 0)).toEqual({ levelDrop: 1, fightTier: 0 }); // home ground stays gentler still
  });

  it('the first win over an enemy kind pays a coin bonus', () => {
    expect(victoryCoins(10, 0)).toBeGreaterThan(10);
    expect(victoryCoins(10, 3)).toBe(10);
  });

  it('bosses always drop; regular drops are real consumables or nothing', () => {
    expect(rollDrop(true, 0.99)).toBe('elixir');
    const seen = new Set([0, 0.1, 0.2, 0.3, 0.5, 0.99].map((r) => rollDrop(false, r)));
    expect(seen.has(null)).toBe(true);
    for (const d of seen) if (d) expect(CONSUMABLE_IDS).toContain(d);
  });
});

describe('defendTimeMs', () => {
  it('younger kids get more time', () => {
    expect(defendTimeMs(6)).toBeGreaterThan(defendTimeMs(9));
    expect(defendTimeMs(9)).toBeGreaterThan(defendTimeMs(13));
  });

  it('a young reader (5–8) always gets more than 15s', () => {
    for (const age of [5, 6, 7, 8]) expect(defendTimeMs(age)).toBeGreaterThan(15_000);
  });

  it('is clamped to 10–25s', () => {
    expect(defendTimeMs(18)).toBe(DEFEND_MIN_MS);
    expect(defendTimeMs(3)).toBe(DEFEND_MAX_MS);
  });

  it('mercy adds a few seconds on top', () => {
    expect(defendTimeMs(10, true)).toBe(defendTimeMs(10) + DEFEND_MERCY_BONUS_MS);
  });
});

describe('speed trigger', () => {
  const age = 9;
  const quick = fastAnswerMs(age) - 1;

  it('"quick" is half the age countdown — more time for younger kids', () => {
    expect(fastAnswerMs(age)).toBe(defendTimeMs(age) / 2);
    expect(fastAnswerMs(6)).toBeGreaterThan(fastAnswerMs(12));
  });

  it(`${FAST_STREAK} quick correct answers in a row raise the level`, () => {
    let run = 0;
    let boosted = false;
    for (let i = 0; i < FAST_STREAK; i++) ({ run, boosted } = speedStep(run, true, quick, age, 0));
    expect(boosted).toBe(true);
    expect(run).toBe(0); // the next step needs another full streak
  });

  it('a slow answer, a wrong answer, or a hinted answer (Infinity) breaks the run', () => {
    expect(speedStep(4, true, fastAnswerMs(age) + 1, age, 0)).toEqual({ run: 0, boosted: false });
    expect(speedStep(4, false, quick, age, 0)).toEqual({ run: 0, boosted: false });
    expect(speedStep(4, true, Infinity, age, 0)).toEqual({ run: 0, boosted: false });
  });

  it(`never raises more than ${MAX_SPEED_BOOST} in one battle`, () => {
    expect(speedStep(FAST_STREAK - 1, true, quick, age, MAX_SPEED_BOOST).boosted).toBe(false);
  });

  it('the saved level after a battle keeps what speed earned, and never drops', () => {
    expect(skillAfterBattle(4, [true, false, false, false], 1)).toBe(5);
    expect(skillAfterBattle(4, [false, false], 0)).toBe(4);
    expect(skillAfterBattle(4, Array(6).fill(true), 1)).toBeGreaterThanOrEqual(5);
    expect(skillAfterBattle(10, Array(6).fill(true), 2)).toBe(10);
  });

  it('fleeing (no ramp answers) still keeps the speed boost', () => {
    expect(skillAfterBattle(4, [], 1)).toBe(5);
    expect(skillAfterBattle(4, [], 0)).toBe(4);
  });
});

describe('the Forget-Me-Knot (#75 item 14e)', () => {
  it('ties on once, and only while it is not already tied', () => {
    expect(resolveItem(base, 'knot').state.knotted).toBe(true);
    expect(itemBlocked(base, 'knot', 1)).toBeNull();
    expect(itemBlocked({ ...base, knotted: true }, 'knot', 1)).toBe('Already tied on');
    expect(itemBlocked(base, 'knot', 0)).toBe('None left');
  });
});

describe('hero types: Kira (swift) and Selene (mystic)', () => {
  const skye = { ...enemyInput, wasCorrect: true, style: 'swift' as const, counter: counterDamage('swift', {}) };

  it('each hero type opens a fight with its own perk, and only that one', () => {
    const none = { charge: 0, freeHint: false, focused: false, guarded: false, secondWind: false };
    // No hero, no perk (WorldScreen's fallback — not the balanced type's Second Wind).
    expect(NO_OPENING).toEqual(none);
    expect(heroOpening('mystic')).toEqual({ ...none, charge: SPARK_START_CHARGE });
    expect(heroOpening('swift')).toEqual({ ...none, freeHint: true });
    expect(heroOpening('aggressive')).toEqual({ ...none, focused: true });
    expect(heroOpening('defensive')).toEqual({ ...none, guarded: true });
    expect(heroOpening('balanced')).toEqual({ ...none, secondWind: true });
  });

  it('start() applies the opening; with none it is a fresh fight as before', () => {
    const enemy = { id: 'count-bat', instanceId: 'o1', name: 'Count Bat', sprite: '🦇', level: 3, maxHp: 90, topic: 'math', zoneId: 'numbria', isBoss: false, coins: 10 } as BattleEnemy;
    useBattleStore.getState().start(enemy, 100, 110, heroOpening('mystic'));
    expect(combatState()).toMatchObject({ charge: SPARK_START_CHARGE, freeHint: false });
    useBattleStore.getState().start({ ...enemy, instanceId: 'o2' }, 100, 100, heroOpening('swift'));
    expect(combatState()).toMatchObject({ charge: 0, freeHint: true });
    useBattleStore.getState().start({ ...enemy, instanceId: 'o3' }, 100, 100);
    expect(combatState()).toMatchObject({ charge: 0, freeHint: false, focused: false, guarded: false, secondWind: false });
    useBattleStore.getState().start({ ...enemy, instanceId: 'o4' }, 100, 140, heroOpening('defensive'));
    expect(combatState()).toMatchObject({ guarded: true });
  });

  it('only a swift hero counters, and the counter is a share of her attack', () => {
    expect(counterDamage('swift', {})).toBeGreaterThan(0);
    expect(counterDamage('swift', { attack: 3 })).toBeGreaterThan(counterDamage('swift', {}));
    for (const style of ['aggressive', 'defensive', 'balanced', 'mystic'] as const) expect(counterDamage(style, {})).toBe(0);
  });

  it('a right defend answer strikes back; a wrong one (or a timeout) does not', () => {
    const hit = resolveEnemyTurn(base, skye);
    expect(hit.countered).toBe(skye.counter);
    expect(hit.state.enemyHp).toBe(base.enemyHp - skye.counter);
    expect(hit.dmg).toBe(resolveEnemyTurn(base, { ...skye, counter: 0 }).dmg);
    const miss = resolveEnemyTurn(base, { ...skye, wasCorrect: false });
    expect(miss.countered).toBe(0);
    expect(miss.state.enemyHp).toBe(base.enemyHp);
  });

  it('she counters a power blow, and past a standing guard', () => {
    expect(resolveEnemyTurn(base, { ...skye, intent: 'power' }).countered).toBe(skye.counter);
    const guarded = resolveEnemyTurn({ ...base, guarded: true }, skye);
    expect(guarded.dmg).toBe(0);
    expect(guarded.countered).toBe(skye.counter);
  });

  it('a counter shatters a stony shield instead of hurting', () => {
    const r = resolveEnemyTurn({ ...base, enemyShielded: true }, skye);
    expect(r.counterShattered).toBe(true);
    expect(r.countered).toBe(0);
    expect(r.state.enemyShielded).toBe(false);
    expect(r.state.enemyHp).toBe(base.enemyHp);
  });

  it('a counter can win the battle — and a knocked-out hero never counters', () => {
    const win = resolveEnemyTurn({ ...base, enemyHp: 5 }, skye);
    expect(win.enemyDown).toBe(true);
    expect(win.countered).toBe(5);
    const down = resolveEnemyTurn({ ...base, playerHp: 1 }, { ...skye, intent: 'power', wasCorrect: true, style: 'swift' });
    expect(down.heroDown).toBe(true);
    expect(down.countered).toBe(0);
  });

  it('a counter can tip a healer below half, and it mends after it', () => {
    const r = resolveEnemyTurn({ ...base, enemyHp: 50 }, { ...skye, behavior: 'healer' });
    expect(r.countered).toBe(skye.counter);
    expect(r.mended).toBe(healerRegen(base.enemyMaxHp));
  });

  it('a counter crossing a boss phase announces it', () => {
    const r = resolveEnemyTurn({ ...base, enemyHp: 61 }, { ...skye, isBoss: true });
    expect(r.newPhase).toBe(1);
  });
});

describe('signature abilities: Valor, Bastion, Talon', () => {
  it("Battle Cry (Valor): his opening focus doubles the first landed Attack, then it's spent", () => {
    const open = { ...base, focused: heroOpening('aggressive').focused };
    const first = applyFocus(open, 40);
    expect(first.dmg).toBe(40 * TEA_DAMAGE_MULT);
    expect(applyFocus(first.state, 40).dmg).toBe(40);
  });

  it("Shell Up (Bastion): the first blow is fully blocked, the next isn't", () => {
    const first = resolveEnemyTurn({ ...base, guarded: heroOpening('defensive').guarded }, { ...enemyInput, style: 'defensive' });
    expect(first.dmg).toBe(0);
    expect(resolveEnemyTurn(first.state, { ...enemyInput, intent: 'power', style: 'defensive' }).dmg).toBeGreaterThan(0);
  });

  it('Second Wind (Talon): a knockout blow leaves 1 HP once a fight; the next knockout is real', () => {
    const blow = { ...enemyInput, intent: 'power' as const };
    const caught = resolveEnemyTurn({ ...base, playerHp: 5, secondWind: true }, blow);
    expect(caught).toMatchObject({ secondWind: true, heroDown: false });
    expect(caught.state).toMatchObject({ playerHp: 1, secondWind: false });
    const next = resolveEnemyTurn(caught.state, blow);
    expect(next).toMatchObject({ secondWind: false, heroDown: true });
    // A blow that doesn't knock out never spends it.
    const light = resolveEnemyTurn({ ...base, secondWind: true }, enemyInput);
    expect(light.secondWind).toBe(false);
    expect(light.state.secondWind).toBe(true);
  });
});
