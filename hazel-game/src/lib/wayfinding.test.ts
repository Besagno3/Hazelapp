import { describe, expect, it } from 'vitest';
import { ZONES, type ZoneDef, type ZoneId } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { TOPIC_REGISTRY, crystalFlag } from '../content/topics';
import { GATE_KEYS, keyFlag, keyForZone } from '../content/keys';
import { SPIRE_CLEARED } from '../content/story';
import {
  compass,
  exitSide,
  goalDirections,
  nextObjective,
  npcHome,
  placeName,
  routeSteps,
  routeTo,
  sentence,
  signpostLines,
  wayfindingLines,
  type Objective,
} from './wayfinding';

const dawn = ZONES.dawnreach;
const ALL_ZONES = Object.keys(ZONES) as ZoneId[];
const allCrystals = Object.fromEntries(TOPIC_REGISTRY.map((t) => [crystalFlag(t.id), true]));

describe('compass', () => {
  it('names all eight directions (y grows southward)', () => {
    expect(compass(0, -5)).toBe('north');
    expect(compass(5, -5)).toBe('north-east');
    expect(compass(5, 0)).toBe('east');
    expect(compass(5, 5)).toBe('south-east');
    expect(compass(0, 5)).toBe('south');
    expect(compass(-5, 5)).toBe('south-west');
    expect(compass(-5, 0)).toBe('west');
    expect(compass(-5, -5)).toBe('north-west');
  });
  it('calls a mostly-north step north', () => {
    expect(compass(2, -10)).toBe('north');
  });
  it('has no direction for a tile or less away', () => {
    expect(compass(0, 0)).toBeNull();
    expect(compass(1, -1)).toBeNull();
  });
});

describe('placeName', () => {
  it('reads right mid-sentence', () => {
    expect(placeName(ZONES.numbria)).toBe('Numbria');
    expect(placeName(ZONES['whispering-woods'])).toBe('the Whispering Woods');
    expect(placeName(ZONES['crystal-spire'])).toBe('the Crystal Spire');
  });
});

describe('nextObjective', () => {
  it('starts with Numbria: its crystal is the one with no gate', () => {
    expect(nextObjective({})).toMatchObject({ kind: 'crystal', zoneId: 'numbria', title: 'Free the Crystal of Numbers' });
  });
  it("then the warden holding the first locked crystal's key", () => {
    const g = nextObjective({ [crystalFlag('math')]: true });
    expect(g).toMatchObject({ kind: 'key', zoneId: 'whispering-woods', title: 'Win the Verdant Key' });
  });
  it('a crystal you hold the key for comes before a key you still have to win', () => {
    const g = nextObjective({ [crystalFlag('math')]: true, [keyFlag('chromaria-key')]: true });
    expect(g).toMatchObject({ kind: 'crystal', zoneId: 'chromaria' });
    expect(g.why).toContain('Prism Key');
  });
  it('once every crystal shines: the Spire, then the open world', () => {
    expect(nextObjective(allCrystals)).toMatchObject({ kind: 'spire', zoneId: 'crystal-spire' });
    expect(nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true })).toMatchObject({ kind: 'explore', zoneId: null });
  });

  // Doing what it says must finish the story: every step is one the hero can
  // take right then, it never repeats, and it ends at "explore".
  it('walked from a fresh save, leads through the whole story and ends', () => {
    const flags: Record<string, boolean> = {};
    const seen: Objective[] = [];
    for (let i = 0; i < 20; i++) {
      const g = nextObjective(flags);
      seen.push(g);
      if (g.kind === 'explore') break;
      if (g.kind === 'crystal') {
        const t = TOPIC_REGISTRY.find((x) => x.zoneId === g.zoneId)!;
        const key = keyForZone(t.zoneId);
        if (key) expect(flags[keyFlag(key.id)], `${g.title} needs ${key.name}`).toBe(true);
        flags[crystalFlag(t.id)] = true;
      } else if (g.kind === 'key') {
        const key = GATE_KEYS.find((k) => k.fromZone === g.zoneId)!;
        flags[keyFlag(key.id)] = true;
      } else {
        flags[SPIRE_CLEARED] = true;
      }
    }
    expect(seen.at(-1)?.kind).toBe('explore');
    expect(seen).toHaveLength(TOPIC_REGISTRY.length + GATE_KEYS.length + 2);
    expect(new Set(seen.map((g) => g.title)).size).toBe(seen.length);
    // …and every place it sends you can be reached from anywhere in the world.
    for (const g of seen) {
      if (!g.zoneId) continue;
      for (const from of ALL_ZONES) expect(routeTo(ZONES, from, g.zoneId), `${from} → ${g.zoneId}`).not.toBeNull();
    }
  });
});

describe('routeTo', () => {
  it('is empty when you are already there', () => {
    expect(routeTo(ZONES, 'numbria', 'numbria')).toEqual([]);
  });
  it('goes through the fewest zones', () => {
    const hops = routeTo(ZONES, 'lumina-village', 'numbria')!;
    expect(hops.map((h) => `${h.from}→${h.exit.to}`)).toEqual([
      'lumina-village→dawnreach',
      'dawnreach→lumina-field',
      'lumina-field→numbria',
    ]);
  });
  it('is null when there is no way', () => {
    const island = { ...ZONES.numbria, id: 'numbria', exits: [] } as ZoneDef;
    expect(routeTo({ ...ZONES, numbria: island }, 'numbria', 'verdara')).toBeNull();
  });
});

describe('exitSide', () => {
  it('finds the edge an exit is on, or none for a place on the map', () => {
    const field = ZONES['lumina-field'];
    expect(exitSide(field, field.exits.find((e) => e.to === 'numbria')!)).toBe('west');
    expect(exitSide(field, field.exits.find((e) => e.to === 'verdara')!)).toBe('north');
    expect(exitSide(dawn, dawn.exits[0])).toBeNull();
  });
});

describe('routeSteps and goalDirections', () => {
  const numbria = nextObjective({});
  it('from next door: just the path to take', () => {
    expect(goalDirections(ZONES, numbria, 'lumina-field')).toBe('Take the west path to Numbria.');
  });
  it('across the overworld: the way to the place, then the path', () => {
    expect(goalDirections(ZONES, numbria, 'lumina-village')).toBe(
      'Go north to Lumina Field, then take the west path to Numbria.',
    );
  });
  it("on the overworld, measured from where you stand", () => {
    const woods = dawn.places!.find((p) => p.name === 'Whispering Woods')!;
    expect(routeSteps(ZONES, 'dawnreach', 'whispering-woods', { x: woods.x, y: woods.y + 10 })).toEqual([
      'go north to the Whispering Woods',
    ]);
    expect(routeSteps(ZONES, 'dawnreach', 'whispering-woods', { x: woods.x + 10, y: woods.y })).toEqual([
      'go west to the Whispering Woods',
    ]);
    expect(routeSteps(ZONES, 'dawnreach', 'whispering-woods', { x: woods.x + 1, y: woods.y })).toEqual([
      'step into the Whispering Woods',
    ]);
  });
  it("says so when you're already there, and nothing once the story's done", () => {
    expect(goalDirections(ZONES, numbria, 'numbria')).toBe("It's right here in Numbria!");
    expect(goalDirections(ZONES, nextObjective({ ...allCrystals, [SPIRE_CLEARED]: true }), 'numbria')).toBe('');
  });
  it('gives directions to every story goal from every zone', () => {
    const goals = [nextObjective({}), nextObjective({ [crystalFlag('math')]: true }), nextObjective(allCrystals)];
    for (const g of goals) {
      for (const from of ALL_ZONES) expect(goalDirections(ZONES, g, from), `${from} → ${g.zoneId}`).toMatch(/^[A-Z].+[.!]$/);
    }
  });
  it('sentence joins steps', () => {
    expect(sentence(['go north to A', 'take the west path to B'])).toBe('Go north to A, then take the west path to B.');
    expect(sentence([])).toBe('');
  });
});

describe('signpostLines', () => {
  it('names every place once, by direction, clockwise from north, nearest first', () => {
    const lines = signpostLines(dawn, 36, 25);
    const names = lines.flatMap((l) => l.replace(/^\S+ /, '').split(' · '));
    expect(names.sort()).toEqual(dawn.places!.map((p) => p.name).sort());
    expect(lines[0]).toBe('⬆️ Lumina Field');
    expect(lines.find((l) => l.startsWith('⬅️'))).toBe('⬅️ Lumina Village · Whispering Woods');
  });
  it("leaves out a place you're standing beside", () => {
    const village = dawn.places!.find((p) => p.name === 'Lumina Village')!;
    expect(signpostLines(dawn, village.x, village.y - 1).join('\n')).not.toContain('Lumina Village');
  });
});

describe('guides and signposts', () => {
  const wayfinders = Object.values(NPC_DEFS).filter((n) => n.guide || n.signpost);

  it('Elder Lumen, Grandmother Wick and Scout Tamsin are guides; the crossroads have signposts', () => {
    expect(wayfinders.filter((n) => n.guide).map((n) => n.id).sort()).toEqual(
      ['dawnreach-scout', 'elder-lumen', 'village-elder'].sort(),
    );
    expect(wayfinders.filter((n) => n.signpost).length).toBeGreaterThanOrEqual(2);
  });
  it('every guide and signpost stands somewhere in the world', () => {
    for (const n of wayfinders) expect(npcHome(ZONES, n.id), n.id).not.toBeNull();
  });
  it('a guide ends on where to go next, from where they stand', () => {
    expect(wayfindingLines(ZONES, NPC_DEFS['elder-lumen'], {})).toEqual([
      'Where to next? The Null Fiend hoards the Crystal of Numbers. Take the west path to Numbria.',
    ]);
    expect(wayfindingLines(ZONES, NPC_DEFS['village-elder'], {})[0]).toContain('Go north to Lumina Field');
  });
  it("after the story, a guide just cheers you on", () => {
    const done = { ...allCrystals, [SPIRE_CLEARED]: true };
    expect(wayfindingLines(ZONES, NPC_DEFS['elder-lumen'], done)).toEqual([nextObjective(done).why]);
  });
  it('a signpost reads out the places around it, then the way to the next goal', () => {
    for (const n of wayfinders.filter((w) => w.signpost)) {
      expect(n.lines, n.id).toEqual([]);
      const [read, next] = wayfindingLines(ZONES, n, {});
      expect(read.split('\n').length, n.id).toBeGreaterThanOrEqual(4);
      expect(next, n.id).toMatch(/^🚩 Next: Free the Crystal of Numbers\. Go /);
    }
  });
  it('everyone else says nothing extra', () => {
    expect(wayfindingLines(ZONES, NPC_DEFS['hub-kid'], {})).toEqual([]);
  });

  // A signpost belongs at a crossroads: beside a road tile where 3+ roads
  // meet, and not on the road itself (it would block it).
  it('every signpost stands beside a crossroads, off the road', () => {
    const road = (z: ZoneDef, x: number, y: number) => '=P'.includes(z.map[y]?.[x] ?? '#');
    for (const n of wayfinders.filter((w) => w.signpost)) {
      const home = npcHome(ZONES, n.id)!;
      const z = ZONES[home.zoneId];
      expect(z.kind, n.id).toBe('overworld');
      expect(road(z, home.x, home.y), `${n.id} is on the road`).toBe(false);
      const near = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [home.x + dx, home.y + dy]));
      const atCrossroads = near.some(
        ([x, y]) =>
          road(z, x, y) &&
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].filter(([dx, dy]) => road(z, x + dx, y + dy)).length >= 3,
      );
      expect(atCrossroads, `${n.id} at ${home.x},${home.y}`).toBe(true);
    }
  });
});
