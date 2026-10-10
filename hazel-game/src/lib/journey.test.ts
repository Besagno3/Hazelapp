import { describe, it, expect } from 'vitest';
import { ZONES, fogAt, darkAt, innWakeCell, tileAt, type ZoneId } from '../content/zones';
import { RETURN_TOWNS, returnLanding } from '../content/fieldSpells';
import { keyFlag, keyForZone } from '../content/keys';
import { actOneJourney, advanceGoal, walkLeg, type Leg } from './journey';
import { nextObjective } from './wayfinding';

const legs = actOneJourney();

/** Towns the journey has passed through before leg `i` (home always counts). */
function townsBefore(i: number): ZoneId[] {
  const seen = new Set<ZoneId>(['lumina-village']);
  for (const leg of legs.slice(0, i)) for (const h of leg.hops) if (RETURN_TOWNS.includes(h.zoneId)) seen.add(h.zoneId);
  return [...seen];
}
const walkable = (leg: Leg) => leg.hops.every((h) => h.path !== null);

describe('Act I as a journey (#75 item 14b, the Phase 2 exit check)', () => {
  it('the 🚩 hands out four crystals, three keys and the Spire, in order — then Act II', () => {
    expect(legs.map((l) => `${l.goal.kind}:${l.target.zoneId}`)).toEqual([
      'crystal:numbria',
      'key:whispering-woods',
      'crystal:verdara',
      'key:clockwork-depths-b3',
      'crystal:gearfall',
      'key:starfall-coast',
      'crystal:chromaria',
      'spire:crystal-spire',
    ]);
    const after = legs.reduce((f, l) => advanceGoal(l.goal, f), legs[0].flags);
    expect(nextObjective(after).kind).toBe('boat');
  });

  it('every leg walks, zone by zone, from where the last one ended to the boss (or the Spire)', () => {
    for (const leg of legs) {
      for (const h of leg.hops) expect(h.path, `${leg.goal.title}: across ${h.zoneId} to ${h.to ?? 'the target'}`).not.toBeNull();
      const last = leg.hops.at(-1)!;
      expect(last.zoneId).toBe(leg.target.zoneId);
      const end = last.path!.at(-1)!;
      expect(Math.abs(end.x - leg.target.cell.x) + Math.abs(end.y - leg.target.cell.y), leg.goal.title).toBeLessThanOrEqual(1);
    }
  });

  it("no step crosses fog, pitch dark, a secret passage or another place's door", () => {
    for (const leg of legs) {
      for (const h of leg.hops) {
        const z = ZONES[h.zoneId];
        h.path!.forEach((c, i) => {
          const where = `${leg.goal.title} in ${h.zoneId} at ${c.x},${c.y}`;
          expect(fogAt(z, c.x, c.y, leg.flags), where).toBeNull();
          expect(darkAt(z, c.x, c.y, leg.flags), where).toBe(false);
          expect(tileAt(z, c.x, c.y), where).not.toBe('H');
          // Only the hop's last step may be an exit — the one it's heading for.
          if (i < h.path!.length - 1 && i > 0) expect(z.exits.some((e) => e.x === c.x && e.y === c.y), where).toBe(false);
        });
      }
    }
  });

  it("a warden's key gate really guards its Fiend: without the key there's no way to it", () => {
    const guarded = legs.filter((l) => l.goal.kind === 'crystal' && keyForZone(l.target.zoneId) && ZONES[l.target.zoneId].keyGate);
    expect(guarded.map((l) => l.target.zoneId)).toEqual(['verdara', 'gearfall', 'chromaria']);
    for (const leg of guarded) {
      const key = keyForZone(leg.target.zoneId)!;
      const last = leg.hops.at(-1)!;
      const without = walkLeg(leg.goal, { ...leg.flags, [keyFlag(key.id)]: false }, { zoneId: last.zoneId, cell: last.from });
      expect(without.hops.at(-1)!.path, `${leg.target.zoneId} without the ${key.name}`).toBeNull();
    }
  });

  it('no softlock after Return or a defeat: every leg still walks from each town visited so far — its Return landing and its inn', () => {
    legs.forEach((leg, i) => {
      for (const town of townsBefore(i)) {
        const starts = [returnLanding(ZONES, town), innWakeCell(ZONES[town])].filter((c) => c !== null);
        for (const cell of starts) {
          const again = walkLeg(leg.goal, leg.flags, { zoneId: town, cell });
          expect(walkable(again), `${leg.goal.title} from ${town} (${cell.x},${cell.y})`).toBe(true);
        }
      }
    });
  });
});
