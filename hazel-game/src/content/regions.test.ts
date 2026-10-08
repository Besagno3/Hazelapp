import { describe, it, expect } from 'vitest';
import {
  BASE_TIER,
  DANGER,
  REGIONS,
  WARN_AHEAD,
  arrivalWarning,
  dangerMarks,
  defeatTip,
  mapLabel,
  placementTier,
  toughCallout,
  zoneTier,
  type DangerTier,
} from './regions';
import { ZONES, ZONE_IDS } from './zones';
import { atTier, spawnEnemy, spawnPlaced } from './enemies';
import { enemyAttack, defeatXp } from '../lib/battleMath';
import { CHARGE_CHANCE, MERCY_AFTER, lossKey, mercyCallout, mercyFor, nextIntent } from '../lib/battleTurn';
import { nextObjective, roadTier } from '../lib/wayfinding';
import { useBattleStore } from '../store/battleStore';
import { TOPIC_REGISTRY, crystalFlag } from './topics';
import { GATE_KEYS, keyFlag, keyForZone } from './keys';
import type { ZoneId } from '../types';

const TIERS: DangerTier[] = [0, 1, 2, 3, 4];

describe('regions and danger tiers (#75 item 12)', () => {
  it('every zone is in exactly one region', () => {
    for (const id of ZONE_IDS) {
      const homes = REGIONS.filter((r) => r.zones.includes(id));
      expect(homes.map((r) => r.id), id).toHaveLength(1);
    }
    expect(REGIONS.flatMap((r) => r.zones).every((id) => (ZONE_IDS as readonly string[]).includes(id))).toBe(true);
  });

  it('tier 1 is the balance before regions; each tier after it is tougher and pays more', () => {
    const base = DANGER[BASE_TIER];
    expect([base.hp, base.attack, base.coins, base.xp]).toEqual([1, 1, 1, 1]);
    expect(base.chargeChance).toBe(CHARGE_CHANCE);
    for (let t = 1; t < TIERS.length; t++) {
      const [a, b] = [DANGER[TIERS[t - 1]], DANGER[TIERS[t]]];
      for (const k of ['hp', 'attack', 'chargeChance', 'coins', 'xp'] as const) {
        expect(b[k], `tier ${t} ${k}`).toBeGreaterThanOrEqual(a[k]);
      }
    }
  });

  it('the road the 🚩 sends you down never gets easier (the Spire is a question trial, not a fight)', () => {
    const flags: Record<string, boolean> = {};
    const tiers: [string, DangerTier][] = [];
    for (let i = 0; i < 20; i++) {
      const g = nextObjective(flags);
      if (g.kind === 'explore' || g.kind === 'spire') break;
      tiers.push([g.zoneId!, zoneTier(g.zoneId!)]);
      if (g.kind === 'crystal') {
        const t = TOPIC_REGISTRY.find((x) => x.zoneId === g.zoneId)!;
        const key = keyForZone(t.zoneId);
        if (key) flags[keyFlag(key.id)] = true;
        flags[crystalFlag(t.id)] = true;
      } else {
        flags[keyFlag(GATE_KEYS.find((k) => k.fromZone === g.zoneId)!.id)] = true;
      }
    }
    expect(tiers.map(([z]) => z)).toEqual([
      'numbria',
      'whispering-woods',
      'verdara',
      'clockwork-depths-b3',
      'gearfall',
      'starfall-coast',
      'chromaria',
    ]);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i][1], `${tiers[i][0]} after ${tiers[i - 1][0]}`).toBeGreaterThanOrEqual(tiers[i - 1][1]);
    }
    expect(tiers[0][1]).toBe(BASE_TIER); // the first crystal plays as it always did
  });

  it('an overworld critter marked with its own tier roams nearest a place of that tier; nothing else overrides', () => {
    let overrides = 0;
    for (const z of Object.values(ZONES)) {
      for (const p of z.enemies) {
        if (p.tier === undefined) continue;
        overrides++;
        expect(z.kind, `${z.id}: only overworld critters take a nearby region's tier`).toBe('overworld');
        const nearest = [...z.exits].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        expect(placementTier(z.id, p), `${p.defId} by ${nearest.to}`).toBe(zoneTier(nearest.to));
      }
    }
    expect(overrides).toBe(4); // one critter by each corner region
  });
});

describe('scaling a battle by tier — never its questions', () => {
  it('the question level is the same anywhere; HP and coins grow with the tier', () => {
    const at = (t: DangerTier) => spawnEnemy('count-bat', 'numbria', 'a', 8, { math: 4 }, t);
    expect(new Set(TIERS.map((t) => at(t).level)).size).toBe(1);
    for (let i = 1; i < TIERS.length; i++) {
      expect(at(TIERS[i]).maxHp).toBeGreaterThan(at(TIERS[i - 1]).maxHp);
      expect(at(TIERS[i]).coins).toBeGreaterThan(at(TIERS[i - 1]).coins);
    }
    // Tier 1 keeps the old numbers: 60 + level × 12 HP, 10 + level × 3 coins.
    const base = at(1);
    expect(base.maxHp).toBe(60 + base.level * 12);
    expect(base.coins).toBe(10 + base.level * 3);
    expect(at(4).tier).toBe(4);
  });

  it("an enemy takes its zone's tier unless told otherwise", () => {
    expect(spawnEnemy('dog-knight', 'chromaria', 'a', 9).tier).toBe(4);
    expect(spawnEnemy('sum-slime', 'numbria', 'a', 9).tier).toBe(1);
    const dawnreach = ZONES.dawnreach;
    const imp = dawnreach.enemies.find((p) => p.defId === 'doodle-imp')!;
    const spawned = spawnPlaced('dawnreach', imp, 9);
    expect(spawned.tier).toBe(4);
    expect(spawned.instanceId).toBe(`dawnreach:doodle-imp@${imp.x},${imp.y}`);
    const hare = dawnreach.enemies.find((p) => p.defId === 'thornhare')!;
    expect(placementTier('dawnreach', hare)).toBe(0);
  });

  it('blows, power moves and the win XP scale with the tier; bosses keep their rhythm', () => {
    expect(enemyAttack(4, false, 0)).toBe(16 + 4 * 3); // tier 1 = the old blow
    expect(enemyAttack(4, false, 0, 4)).toBeGreaterThan(enemyAttack(4, false, 0, 3));
    expect(enemyAttack(4, false, 0, 0)).toBeLessThan(enemyAttack(4, false, 0, 1));
    // A roll of 0.28 charges far from home, not near it.
    expect(nextIntent('attack', 2, false, 0.28, 1)).toBe('attack');
    expect(nextIntent('attack', 2, false, 0.28, 3)).toBe('charge');
    expect(nextIntent('attack', 2, false, 0.15, 0)).toBe('attack');
    for (const t of TIERS) {
      expect(nextIntent('attack', 2, true, 0, t)).toBe('charge'); // every 3rd turn
      expect(nextIntent('attack', 1, true, 0, t)).toBe('attack');
    }
    expect(defeatXp(100)).toBe(100);
    expect(defeatXp(100, 4)).toBe(145);
  });

  it('the map label shows the questions\' level and "!" marks for danger', () => {
    expect(TIERS.map((t) => dangerMarks(t))).toEqual(['', '', '!', '!!', '!!!']);
    expect(mapLabel(3, false, 0)).toBe('Lv 3');
    expect(mapLabel(4, false)).toBe('Lv 4');
    expect(mapLabel(4, false, 3)).toBe('Lv 4 !!');
    expect(mapLabel(5, true, 4)).toBe('👑 Lv 5 !!!');
  });

  it('every boss stands in a region of its own story leg', () => {
    const bosses: [ZoneId, string][] = [];
    for (const z of Object.values(ZONES)) {
      for (const p of z.enemies) {
        const e = spawnEnemy(p.defId, z.id, 'x', 9, {}, placementTier(z.id, p));
        if (e.isBoss) bosses.push([z.id, `${e.id}:${e.tier}`]);
      }
    }
    expect(Object.fromEntries(bosses)).toMatchObject({
      numbria: 'null-fiend:1',
      'whispering-woods': 'thicket-warden:1',
      verdara: 'smog-fiend:2',
      'clockwork-depths-b3': 'clockwork-titan:2',
      gearfall: 'rust-fiend:3',
      'starfall-coast': 'tide-colossus:3',
      chromaria: 'gray-fiend:4',
    });
  });
});

describe('mercy far from home, and what the danger says (#75 item 12 UX review)', () => {
  it('after MERCY_AFTER losses a far critter fights like a Numbria one; its questions ease as anywhere', () => {
    for (const t of [2, 3, 4] as DangerTier[]) {
      expect(mercyFor(MERCY_AFTER - 1, t)).toEqual({ levelDrop: 0, fightTier: t });
      expect(mercyFor(MERCY_AFTER, t)).toEqual({ levelDrop: 1, fightTier: BASE_TIER });
    }
  });

  it('an eased enemy fights at the gentler tier and keeps its questions; its losses still count where it roams', () => {
    const far = spawnEnemy('dog-knight', 'chromaria', 'a', 9);
    const near = spawnEnemy('dog-knight', 'chromaria', 'a', 9, {}, BASE_TIER);
    const eased = atTier(far, BASE_TIER);
    expect(eased).toMatchObject({ tier: 1, eased: 4, level: far.level, maxHp: near.maxHp, coins: near.coins });
    expect(eased.instanceId).toBe(far.instanceId); // beating it still clears it off the map
    expect(lossKey(far)).toBe('dog-knight@4');
    expect(lossKey(eased)).toBe(lossKey(far));
    expect(lossKey(near)).toBe('dog-knight@1');
    expect(atTier(far, 4)).toBe(far);
  });

  it('losses count per kind and tier; each tier\'s marks are explained once a session', () => {
    const s = useBattleStore.getState();
    s.reset();
    s.recordLoss('dog-knight@4');
    s.recordLoss('dog-knight@4');
    expect(useBattleStore.getState().losses).toEqual({ 'dog-knight@4': 2 });
    s.meetTough(3);
    s.meetTough(3);
    expect(useBattleStore.getState().toughMet).toEqual([3]);
    s.reset();
    expect(useBattleStore.getState().toughMet).toEqual([]);
  });

  it('the start-of-battle banners say what the marks and the mercy mean', () => {
    expect(toughCallout(3)).toBe('See the !! by its level? Critters with ! marks hit harder — but they drop more coins!');
    // The copy talks about the marks, not distance: the Coast is near home but tough.
    for (const t of TIERS) expect(toughCallout(t)).not.toMatch(/far|home/i);
    expect(mercyCallout({ name: 'Dog-Knight' })).toMatch(/questions will be a little easier/);
    expect(mercyCallout({ name: 'Dog-Knight', eased: 4 })).toMatch(/gentler hits and easier questions/);
  });

  it('a defeat far from home: off the 🚩 road it points back to it; on the road it says mercy is coming', () => {
    const imp = (tier: DangerTier, eased?: DangerTier) => ({ name: 'Doodle Imp', tier, eased });
    expect(defeatTip(imp(1), 1)).toBeNull();
    expect(defeatTip(imp(0), null)).toBeNull();
    expect(defeatTip(imp(4), 1)).toBe('Doodle Imp is extra tough (see its !!!). Open 📜 Menu — the 🚩 on the map shows where to go next!');
    // Eased, but still off the road: point the way without calling a gentle fight tough.
    expect(defeatTip(imp(1, 4), 1)).toBe('Open 📜 Menu — the 🚩 on the map shows where to go next!');
    expect(defeatTip(imp(2), 2)).toMatch(/couple of tries/);
    expect(defeatTip(imp(1, 2), 2)).toBeNull(); // mercy already eased it
    expect(defeatTip(imp(3), null)).toMatch(/couple of tries/); // the story is done: no road to point to
  });

  it(`arriving somewhere ${WARN_AHEAD} tiers past the 🚩's road warns; the road itself never does`, () => {
    expect(roadTier({})).toBe(zoneTier('numbria'));
    expect(arrivalWarning(zoneTier('starfall-coast'), roadTier({}))).toBe(
      '⚔️ Critters here are extra tough (see the !!)! Open 📜 Menu — the 🚩 on the map shows where to go next!',
    );
    expect(arrivalWarning(zoneTier('verdara'), roadTier({}))).toBeNull();
    expect(arrivalWarning(zoneTier('lumina-village'), roadTier({}))).toBeNull();
    expect(arrivalWarning(4, null)).toBeNull();
    const flags: Record<string, boolean> = {};
    for (let i = 0; i < 20; i++) {
      const g = nextObjective(flags);
      if (g.kind === 'explore' || g.kind === 'spire') break;
      expect(arrivalWarning(zoneTier(g.zoneId!), roadTier(flags)), g.zoneId!).toBeNull();
      if (g.kind === 'crystal') {
        const t = TOPIC_REGISTRY.find((x) => x.zoneId === g.zoneId)!;
        const key = keyForZone(t.zoneId);
        if (key) flags[keyFlag(key.id)] = true;
        flags[crystalFlag(t.id)] = true;
      } else {
        flags[keyFlag(GATE_KEYS.find((k) => k.fromZone === g.zoneId)!.id)] = true;
      }
    }
    expect(roadTier(flags)).toBeNull();
  });
});
