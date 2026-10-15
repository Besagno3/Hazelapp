import { describe, it, expect } from 'vitest';
import { LANDING_CHARS, ZONES, fogAt, darkAt, innWakeCell, tileAt, type ZoneId } from '../content/zones';
import { RETURN_TOWNS, returnLanding } from '../content/fieldSpells';
import { keyFlag, keyForBoss, keyForZone } from '../content/keys';
import { actOneJourney, actThreeJourney, actTwoJourney, advanceGoal, walkLeg, type BoatState, type Leg } from './journey';
import { BOAT_HOME, BOAT_MENDED } from '../content/boat';
import { NPC_DEFS, visibleLines } from '../content/npcs';
import { HALL_CALLED } from '../content/story';
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
    // Then Ember's flight to the Roost (#75 item 15b), flown on the bench (`bench … fly`).
    expect(nextObjective(after).kind).toBe('fly');
    // The Hall leg is met by Keeper Mnem's call (his last line sets hall-called, which plays the
    // dedication — WorldScreen.ending.test), not just by reaching him (code review round 2).
    const hall = act2.at(-1)!;
    const call = visibleLines(NPC_DEFS['hill-keeper'].lines, hall.flags).at(-1)!;
    expect(typeof call !== 'string' && call.setFlag).toBe(HALL_CALLED);
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

describe("Taleshore's Chorus Keys as legs (#75 item 15e, round 2)", () => {
  // The story played up to the Crystal of Voices: both Chorus Keys held (#75 item 15g).
  const CHORUS_BOTH: Record<string, boolean> = (() => {
    let f: Record<string, boolean> = {};
    for (let i = 0; i < 60; i++) {
      const g = nextObjective(f);
      if (g.kind === 'crystal' && g.zoneId === 'chorus-isle') return f;
      f = advanceGoal(g, f);
    }
    throw new Error('the story never reached the Crystal of Voices');
  })();
  const keyGoal = (bossId: string) => {
    const key = keyForBoss(bossId)!;
    return { kind: 'key' as const, title: `Win the ${key.name}`, why: '', zoneId: key.fromZone, key };
  };
  it('the Second Chorus Key is walked from Port Lantern: up the road, east, into the cove and out to the Leviathan', () => {
    const leg = walkLeg(keyGoal('riddle-leviathan'), {}, { zoneId: 'port-lantern', cell: { x: 32, y: 11 } });
    expect(walkable(leg), JSON.stringify(leg.hops.map((h) => [h.zoneId, !!h.path]))).toBe(true);
    expect(leg.hops.map((h) => h.zoneId)).toEqual(['port-lantern', 'taleshore', 'inkwell-cove']);
  });
  it('the First Chorus Key is walked from where Ember lands on the Wayfinder Isles', () => {
    const isles = ZONES['wayfinder-isles'];
    const leg = walkLeg(keyGoal('compass-golem'), {}, { zoneId: 'wayfinder-isles', cell: isles.spawn });
    expect(walkable(leg)).toBe(true);
  });
  it('the Crystal of Voices (#75 item 15g): walked from the landing to the Hush Fiend with both keys — never with one', () => {
    const isle = ZONES['chorus-isle'];
    const goal = nextObjective({ ...CHORUS_BOTH });
    expect(goal).toMatchObject({ kind: 'crystal', zoneId: 'chorus-isle' });
    const leg = walkLeg(goal, CHORUS_BOTH, { zoneId: 'chorus-isle', cell: isle.spawn });
    expect(walkable(leg)).toBe(true);
    const oneKey = { ...CHORUS_BOTH, [keyFlag('chorus-b')]: false };
    expect(walkable(walkLeg(goal, oneKey, { zoneId: 'chorus-isle', cell: isle.spawn }))).toBe(false);
  });
});

describe('Act III start to finish (#75 item 15h, the Phase 4 exit check)', () => {
  const act3 = actThreeJourney();
  it("walks every Act III goal inside its place, from Port Lantern to the Chartmaker", () => {
    expect(act3.map((l) => l.goal.title)).toEqual([
      'Fly to Port Lantern',
      'Meet Harbormaster Gale',
      'Win the First Chorus Key',
      'Win the Second Chorus Key',
      'Free the Crystal of Voices',
      'Visit the Chartmaker',
    ]);
    for (const leg of act3) expect(walkable(leg), leg.goal.title).toBe(true);
  });
  it('ends at the Chartmaker, in his study, and the story goes on to explore', () => {
    const last = act3.at(-1)!;
    expect(last.target).toMatchObject({ zoneId: 'chartmakers-rest' });
    const study = ZONES['chartmakers-rest'].buildings!.find((b) => b.id === 'chart-study')!;
    const end = last.hops.at(-1)!.path!.at(-1)!;
    expect(end.x >= study.x && end.x < study.x + study.w && end.y >= study.y && end.y < study.y + study.h).toBe(true);
    const flags = advanceGoal(last.goal, last.flags);
    expect(nextObjective(flags).kind).toBe('explore');
  });
});
