import { describe, it, expect } from 'vitest';
import {
  BASE_TIER,
  DANGER,
  MAX_MARKS,
  REGIONS,
  WARN_AHEAD,
  arrivalWarning,
  dangerMarks,
  defeatTip,
  mapLabel,
  placementTier,
  toughCallout,
  toughKey,
  VERY_TOUGH_TIER,
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

const TIERS: DangerTier[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** sRGB channel (0–255) → linear light, and back. */
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const unlin = (c: number) => 255 * (Math.max(0, Math.min(1, c)) <= 0.0031308 ? 12.92 * Math.max(0, c) : 1.055 * Math.min(1, c) ** (1 / 2.4) - 0.055);
const luminance = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** CIELAB (D65) of an sRGB colour. */
function lab(rgb: number[]): number[] {
  const [r, g, b] = rgb.map(lin);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

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

  it('past "!!!" the colour tells the tiers apart, violet → magenta → pink (#75 item 14c)', () => {
    expect(dangerMarks(7)).toBe('!'.repeat(MAX_MARKS));
    const colours = ([4, 5, 6, 7] as const).map((t) => DANGER[t].mapColor.join());
    expect(new Set(colours).size).toBe(4);
    for (const t of [5, 6, 7] as const) {
      const [, g, b] = DANGER[t].mapColor;
      expect(b, `tier ${t} is violet–magenta–pink`).toBeGreaterThan(g);
      // Readable on the map's dark plate and the battle panel (WCAG AA for text).
      expect(contrast(DANGER[t].mapColor, [20, 18, 24]), `tier ${t} on the plate`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(DANGER[t].mapColor, [30, 27, 75]), `tier ${t} on the panel`).toBeGreaterThanOrEqual(4.5);
    }
    // Tier 5 is a real purple, not near-white: the 💪 line calls it purple (#75 item 14f review).
    expect(lab(DANGER[5].mapColor)[0]).toBeLessThan(75);
  });

  it('tiers 4–7 stay apart for colour-blind kids too (#75 item 14f review)', () => {
    // Machado et al. (2009) at full strength; ΔE76 in CIELAB, 15+ apart.
    const DEU = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]];
    const PRO = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
    const TRI = [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3049]];
    const see = (rgb: number[], m: number[][] | null) => {
      if (!m) return rgb;
      const l = rgb.map(lin);
      return m.map((row) => unlin(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]));
    };
    const tiers = [4, 5, 6, 7] as const;
    for (const m of [null, DEU, PRO, TRI]) {
      for (let i = 0; i < tiers.length; i++) {
        for (let j = i + 1; j < tiers.length; j++) {
          const [a, b] = [see(DANGER[tiers[i]].mapColor, m), see(DANGER[tiers[j]].mapColor, m)];
          const de = Math.hypot(...lab(a).map((v, k) => v - lab(b)[k]));
          expect(de, `tiers ${tiers[i]} and ${tiers[j]}`).toBeGreaterThan(15);
        }
      }
    }
  });

  it('tiers 5–7 share one 💪 line that says what the colour means; tiers up to 4 keep theirs (#75 item 14c)', () => {
    expect(VERY_TOUGH_TIER).toBe(5);
    const veryTough = ([5, 6, 7] as const).map((t) => toughCallout(t));
    expect(new Set(veryTough).size).toBe(1);
    expect(veryTough[0]).toMatch(/purple !!!.*very tough.*harder than a red !!!/);
    expect(toughCallout(4)).toBe('See the !!! by its level? Critters with ! marks hit harder — but they drop more coins!');
    // A boss at those tiers is called one (#75 item 14f review: the Ringkeeper).
    expect(toughCallout(5, true)).toMatch(/A very tough boss — /);
    expect(toughCallout(5)).toMatch(/A very tough critter — /);
    expect(TIERS.map((t) => toughKey(t))).toEqual([0, 1, 2, 3, 4, 5, 5, 5]);
  });

  it('the Silver Shallows is tier 5, the first past Act I (#105g, #108d)', () => {
    expect(zoneTier('silver-shallows')).toBe(5);
    expect(Math.max(...REGIONS.filter((r) => r.id !== 'shallows').map((r) => r.tier))).toBe(4);
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
    expect(TIERS.map((t) => dangerMarks(t))).toEqual(['', '', '!', '!!', '!!!', '!!!', '!!!', '!!!']);
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
