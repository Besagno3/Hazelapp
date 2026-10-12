import { describe, it, expect } from 'vitest';
import { LANDING_CHARS, ZONES, fogAt, darkAt, innWakeCell, tileAt, type ZoneId } from '../content/zones';
import { RETURN_TOWNS, returnLanding } from '../content/fieldSpells';
import { keyFlag, keyForZone } from '../content/keys';
import { actOneJourney, actTwoJourney, advanceGoal, walkLeg, type BoatState, type Leg } from './journey';
import { BOAT_HOME, BOAT_MENDED } from '../content/boat';
import { reach, touches } from './reach';
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

describe('Act II as a journey (#75 item 14i, the Phase 3 exit check)', () => {
  const act2 = actTwoJourney();

  it('the 🚩 leads from Old Marlow to the Hall of Names, in order — then "Explore"', () => {
    expect(act2.map((l) => `${l.goal.kind}:${l.target.zoneId}`)).toEqual([
      'boat:starfall-coast',
      'boat:verdara',
      'boat:chromaria',
      'boat:gearfall',
      'boat:starfall-coast',
      'sail:silver-shallows',
      'visit:remembrance-hill',
      'key:eldergrove',
      'crystal:sunken-archive',
      'visit:remembrance-hill',
    ]);
    const after = act2.reduce((f, l) => advanceGoal(l.goal, f), act2[0].flags);
    expect(nextObjective(after).kind).toBe('explore');
  });

  it('every leg walks — or sails — from where the last one ended to whoever it is for', () => {
    for (const leg of act2) {
      for (const h of leg.hops) expect(h.path, `${leg.goal.title}: across ${h.zoneId} to ${h.to ?? 'the target'}`).not.toBeNull();
      expect(leg.hops.at(-1)!.zoneId, leg.goal.title).toBe(leg.target.zoneId);
    }
  });

  it('per travel mode (roadmap §4.7): Act I and Marlow\'s errands on foot; the boat only once it\'s mended', () => {
    const sails = (leg: Leg) => leg.hops.some((h) => h.path!.some((st) => st.mode === 'boat'));
    // Even with the boat mended and moored at Marlow's dock, Act I and Marlow's errands are walked:
    // every place they need is on Dawnreach, on foot (code review: a check without the boat couldn't fail).
    const docked: BoatState = { aboard: false, zoneId: BOAT_HOME.zoneId, cell: { x: BOAT_HOME.x, y: BOAT_HOME.y } };
    for (const leg of [...legs, ...act2.filter((l) => l.goal.kind === 'boat')]) {
      const start = leg.hops[0];
      const withBoat = walkLeg(leg.goal, { ...leg.flags, [BOAT_MENDED]: true }, { zoneId: start.zoneId, cell: start.from }, docked);
      expect(walkable(withBoat), leg.goal.title).toBe(true);
      expect(sails(withBoat), leg.goal.title).toBe(false);
    }
    // The islands are only ever reached by boat; Remembrance Hill is on Dawnreach, so it walks without one.
    for (const leg of act2.filter((l) => l.goal.kind === 'key' || l.goal.kind === 'crystal')) expect(sails(leg), leg.goal.title).toBe(true);
    const hill = act2.find((l) => l.goal.title === 'Visit Remembrance Hill')!;
    const onFoot = walkLeg(hill.goal, hill.flags, { zoneId: 'lumina-village', cell: ZONES['lumina-village'].spawn }, null);
    expect(walkable(onFoot)).toBe(true);
  });

  it('never stranded on the Shallows: every place and landmark island is reached from the boat, and walks back to a beach', () => {
    const z = ZONES['silver-shallows'];
    const entry = z.map.findIndex((row) => row[0] === '~');
    const sailed = reach(z, { from: { x: 0, y: entry }, aboard: true, modes: ['boat', 'foot'], flags: {} });
    const beachSpots = [...sailed].map((k) => k.split(',').map(Number)).filter(([x, y]) => LANDING_CHARS.has(tileAt(z, x, y)));
    for (const e of z.exits) {
      expect(touches(sailed, e.x, e.y) || sailed.has(`${e.x},${e.y}`), `${e.to} reached`).toBe(true);
      // Back out of the place, on foot: some beach the boat could have landed on is in walking reach.
      const back = reach(z, { from: { x: e.x, y: e.y }, exits: 'stop', flags: {} });
      expect(beachSpots.some(([x, y]) => back.has(`${x},${y}`)), `a beach from ${e.to}`).toBe(true);
    }
    for (const m of z.landmarks ?? []) expect(touches(sailed, m.x, m.y), `${m.name} reached`).toBe(true);
    for (const c of [...(z.keyChests ?? [])]) expect(touches(sailed, c.x, c.y), `chest at ${c.x},${c.y}`).toBe(true);
  });
});
