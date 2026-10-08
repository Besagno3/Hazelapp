import { describe, it, expect } from 'vitest';
import { BASE_TIER, DANGER, REGIONS, dangerMarks, mapLabel, placementTier, zoneTier, type DangerTier } from './regions';
import { ZONES, ZONE_IDS } from './zones';
import { spawnEnemy } from './enemies';
import { enemyAttack, defeatXp } from '../lib/battleMath';
import { CHARGE_CHANCE, nextIntent } from '../lib/battleTurn';
import { nextObjective } from '../lib/wayfinding';
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
    // A word in battle only where it matters: away from home ground and the first region.
    expect(TIERS.map((t) => DANGER[t].label)).toEqual([null, null, 'Tough', 'Fierce', 'Mighty']);
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
    expect(spawnEnemy(imp.defId, 'dawnreach', 'a', 9, {}, placementTier('dawnreach', imp)).tier).toBe(4);
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
