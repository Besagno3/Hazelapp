import type { ZoneDef, ZoneExit, ZoneId } from '../content/zones';
import type { WorldNpcDef } from '../content/npcs';
import { TOPIC_REGISTRY, crystalFlag } from '../content/topics';
import { keyFlag, keyForZone } from '../content/keys';
import { SPIRE_CLEARED } from '../content/story';

/**
 * Wayfinding (#75 roadmap item 6), so a kid can always answer "where do I
 * go?". The world map's 🚩, the guides' "where next?" lines (Elder Lumen,
 * Grandmother Wick, Scout Tamsin) and the signposts all read from here. Pure:
 * everything is worked out from the story flags and the maps, so it stays
 * right when a map is repainted.
 */

export type Compass =
  | 'north'
  | 'north-east'
  | 'east'
  | 'south-east'
  | 'south'
  | 'south-west'
  | 'west'
  | 'north-west';

/** Clockwise from north: the order a signpost lists its arrows in. */
export const COMPASS: Compass[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export const COMPASS_ARROW: Record<Compass, string> = {
  north: '⬆️',
  'north-east': '↗️',
  east: '➡️',
  'south-east': '↘️',
  south: '⬇️',
  'south-west': '↙️',
  west: '⬅️',
  'north-west': '↖️',
};

/** The compass direction of a step of (dx, dy) tiles (y grows southward); null when it's a tile or less. */
export function compass(dx: number, dy: number): Compass | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) return null;
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = north, 90 = east
  return COMPASS[Math.round(((deg + 360) % 360) / 45) % 8];
}

/** A zone's name as it reads mid-sentence: "the Whispering Woods", "the Crystal Spire", "Numbria". */
export function placeName(z: ZoneDef): string {
  if (z.name.startsWith('The ')) return `the ${z.name.slice(4)}`;
  return z.the ? `the ${z.name}` : z.name;
}

// --- The next goal ---------------------------------------------------------------

export interface Objective {
  kind: 'crystal' | 'key' | 'spire' | 'explore';
  /** Short, for the map and signposts: "Free the Crystal of Numbers". */
  title: string;
  /** One or two sentences for the guides. Never says where: the route does. */
  why: string;
  /** Where to go; null once the story is done. */
  zoneId: ZoneId | null;
}

/**
 * The main story's next step. A crystal you can free right now comes first
 * (Numbria's is always open; the others once you hold their warden's key),
 * in the usual crystal order; failing that, the key for the first crystal
 * still locked. Then the Spire; then the whole world is yours to explore.
 */
export function nextObjective(flags: Record<string, boolean>): Objective {
  const left = TOPIC_REGISTRY.filter((t) => !flags[crystalFlag(t.id)]);
  if (left.length === 0) {
    if (flags[SPIRE_CLEARED]) {
      return {
        kind: 'explore',
        title: 'Explore Lumina',
        why: 'Lumina is safe, thanks to you! Hunt for secrets ✨ and help everyone you meet.',
        zoneId: null,
      };
    }
    return {
      kind: 'spire',
      title: 'Climb the Crystal Spire',
      why: 'All the crystals shine again! Now the Crystal Spire is open. Climb it and face what waits at the top.',
      zoneId: 'crystal-spire',
    };
  }
  const open = left.find((t) => {
    const key = keyForZone(t.zoneId);
    return !key || flags[keyFlag(key.id)];
  });
  if (open) {
    const key = keyForZone(open.zoneId);
    return {
      kind: 'crystal',
      title: `Free the ${open.crystalName}`,
      why: key
        ? `Your ${key.name} opens ${key.fiendName}'s gate. Free the ${open.crystalName}!`
        : `${open.fiendName} hoards the ${open.crystalName}.`,
      zoneId: open.zoneId,
    };
  }
  // Every crystal left is behind a gate (only Numbria's has none).
  const key = keyForZone(left[0].zoneId)!;
  return {
    kind: 'key',
    title: `Win the ${key.name}`,
    why: `${key.bossName} guards the ${key.name}. It opens ${key.fiendName}'s gate.`,
    zoneId: key.fromZone,
  };
}

// --- Routes ----------------------------------------------------------------------

/** One step of a route: take `exit` out of zone `from`. */
export interface Hop {
  from: ZoneId;
  exit: ZoneExit;
}

/** The exits to take from one zone to another, through the fewest zones; [] when already there, null when there's no way. */
export function routeTo(zones: Record<ZoneId, ZoneDef>, from: ZoneId, to: ZoneId): Hop[] | null {
  if (from === to) return [];
  const cameBy = new Map<ZoneId, Hop>();
  const queue: ZoneId[] = [from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const exit of zones[id].exits) {
      if (exit.to === from || cameBy.has(exit.to)) continue;
      cameBy.set(exit.to, { from: id, exit });
      if (exit.to === to) {
        const hops: Hop[] = [];
        for (let z: ZoneId = to; z !== from; z = cameBy.get(z)!.from) hops.unshift(cameBy.get(z)!);
        return hops;
      }
      queue.push(exit.to);
    }
  }
  return null;
}

/** Which edge of its zone an exit sits on; null for an exit inside the map (a place, a door). */
export function exitSide(z: ZoneDef, e: { x: number; y: number }): Compass | null {
  if (e.y === 0) return 'north';
  if (e.y === z.map.length - 1) return 'south';
  if (e.x === 0) return 'west';
  if (e.x === z.map[0].length - 1) return 'east';
  return null;
}

/**
 * How to get from one zone to another, as short phrases: "go north to Lumina
 * Field", "take the west path to Numbria". On an overworld the direction is
 * measured from `at` (a tile; where the hero or a signpost stands) when the
 * route starts there, else from where the last exit set you down. Walking out
 * of a place onto the overworld needs no words. Null when there's no way.
 */
export function routeSteps(
  zones: Record<ZoneId, ZoneDef>,
  from: ZoneId,
  to: ZoneId,
  at?: { x: number; y: number },
): string[] | null {
  const route = routeTo(zones, from, to);
  if (!route) return null;
  const steps: string[] = [];
  let origin = at ?? null;
  for (const { from: id, exit } of route) {
    const z = zones[id];
    const dest = zones[exit.to];
    if (z.kind === 'overworld') {
      const o = origin ?? z.spawn;
      const dir = compass(exit.x - o.x, exit.y - o.y);
      steps.push(dir ? `go ${dir} to ${placeName(dest)}` : `step into ${placeName(dest)}`);
    } else if (dest.kind !== 'overworld') {
      const side = exitSide(z, exit);
      steps.push(side ? `take the ${side} path to ${placeName(dest)}` : `go on to ${placeName(dest)}`);
    }
    origin = { x: exit.spawnX, y: exit.spawnY };
  }
  return steps;
}

/** Steps as one sentence: "Go north to Lumina Field, then take the west path to Numbria." */
export function sentence(steps: string[]): string {
  const s = steps.join(', then ');
  return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : '';
}

/**
 * The way to a goal from `here`, as a sentence: the route, or "It's right
 * here in Numbria!" when you're already there. Empty for a goal with nowhere
 * to go (the story's done).
 */
export function goalDirections(
  zones: Record<ZoneId, ZoneDef>,
  goal: Objective,
  here: ZoneId,
  at?: { x: number; y: number },
): string {
  if (!goal.zoneId) return '';
  if (goal.zoneId === here) return `It's right here in ${placeName(zones[here])}!`;
  return sentence(routeSteps(zones, here, goal.zoneId, at) ?? []);
}

// --- Signposts and guides --------------------------------------------------------

/**
 * What a signpost at tile (x, y) of an overworld reads: one line per
 * direction, clockwise from north, each naming the places that way (nearest
 * first). A place right beside the sign isn't listed.
 */
export function signpostLines(z: ZoneDef, x: number, y: number): string[] {
  const byDir = new Map<Compass, { name: string; d: number }[]>();
  for (const p of z.places ?? []) {
    const dir = compass(p.x - x, p.y - y);
    if (!dir) continue;
    byDir.set(dir, [...(byDir.get(dir) ?? []), { name: p.name, d: Math.hypot(p.x - x, p.y - y) }]);
  }
  return COMPASS.filter((c) => byDir.has(c)).map(
    (c) =>
      `${COMPASS_ARROW[c]} ${byDir
        .get(c)!
        .sort((a, b) => a.d - b.d)
        .map((p) => p.name)
        .join(' · ')}`,
  );
}

/** Where an NPC stands in the world (each is placed once — zones.test.ts). */
export function npcHome(zones: Record<ZoneId, ZoneDef>, defId: string): { zoneId: ZoneId; x: number; y: number } | null {
  for (const z of Object.values(zones)) {
    const p = z.npcs.find((n) => n.defId === defId);
    if (p) return { zoneId: z.id, x: p.x, y: p.y };
  }
  return null;
}

/**
 * The wayfinding lines an NPC adds after their own (none for most). A guide
 * says where to go next, from where they stand; a signpost reads out the
 * places around it, then the way to the next goal.
 */
export function wayfindingLines(
  zones: Record<ZoneId, ZoneDef>,
  npc: Pick<WorldNpcDef, 'id' | 'guide' | 'signpost'>,
  flags: Record<string, boolean>,
): string[] {
  if (!npc.guide && !npc.signpost) return [];
  const home = npcHome(zones, npc.id);
  if (!home) return [];
  const goal = nextObjective(flags);
  const how = goalDirections(zones, goal, home.zoneId, home);
  if (npc.signpost) {
    const read = signpostLines(zones[home.zoneId], home.x, home.y).join('\n');
    return [read, goal.zoneId ? `🚩 Next: ${goal.title}. ${how}`.trim() : `🎉 ${goal.why}`];
  }
  return [goal.zoneId ? `Where to next? ${goal.why} ${how}`.trim() : goal.why];
}
