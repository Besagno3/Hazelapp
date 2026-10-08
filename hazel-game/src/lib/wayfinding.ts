import { HUB_ZONE, MET_ELDER, reachableOnFoot, type ZoneDef, type ZoneExit, type ZoneId } from '../content/zones';
import { NPC_DEFS, type WorldNpcDef } from '../content/npcs';
import { FIELD_SPELLS, FIELD_SPELL_IDS, knowsFieldSpell, type FieldSpell } from '../content/fieldSpells';
import { TOPIC_REGISTRY, crystalFlag, type CrystalTopicInfo } from '../content/topics';
import { keyFlag, keyForZone, type GateKey } from '../content/keys';
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
  /** The crystal this goal is about (a crystal, or the key to its gate). */
  crystal?: CrystalTopicInfo;
  /** The warden's key involved: the one to win, or the one you hold. */
  key?: GateKey;
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
      crystal: open,
      key,
    };
  }
  // Every crystal left is behind a gate (only Numbria's has none).
  const key = keyForZone(left[0].zoneId)!;
  return {
    kind: 'key',
    title: `Win the ${key.name}`,
    why: `${key.bossName} guards the ${key.name}. It opens ${key.fiendName}'s gate.`,
    zoneId: key.fromZone,
    crystal: left[0],
    key,
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

/** Steps as one sentence: "Go west to the Whispering Woods, then take the east path to …" — or just "Go north-west to Numbria." */
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

// --- The mentor (Elder Lumen, #75 item 8) ------------------------------------------

/** A name as it starts a sentence: "the Smog Fiend" → "The Smog Fiend". */
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** A name as it reads mid-sentence: "The Null Fiend" → "the Null Fiend". */
function midSentence(name: string): string {
  return name.startsWith('The ') ? `the ${name.slice(4)}` : name;
}

/** Which way a zone's place on the overworld lies from home ("north-west"), if both are on it. */
function bearingFromHome(zones: Record<ZoneId, ZoneDef>, to: ZoneId): string | null {
  const world = Object.values(zones).find((z) => z.kind === 'overworld');
  const home = world?.exits.find((e) => e.to === HUB_ZONE);
  const there = world?.exits.find((e) => e.to === to);
  return home && there ? compass(there.x - home.x, there.y - home.y) : null;
}

/**
 * The first field spell (#75 item 9) not learned yet whose shrine you can walk
 * to right now (the Shrine of First Light waits behind fog for a crystal).
 */
export function shrineToVisit(zones: Record<ZoneId, ZoneDef>, flags: Record<string, boolean>): FieldSpell | null {
  const world = Object.values(zones).find((z) => z.kind === 'overworld');
  if (!world) return null;
  const open = reachableOnFoot(world, flags);
  for (const id of FIELD_SPELL_IDS) {
    const spell = FIELD_SPELLS[id];
    const door = world.exits.find((e) => e.to === spell.shrine);
    if (!knowsFieldSpell(id, flags) && door && open.has(`${door.x},${door.y}`)) return spell;
  }
  return null;
}

/**
 * Elder Lumen's tips (#75 item 8): the big picture of what to do next — the
 * plan for this stage of the story, in a sentence or two, and one practical
 * tip. Not the road to take (the 🚩 map, Grandmother Wick, Scout Tamsin and
 * the signposts do that). Pure: worked out from the story flags and the map.
 */
export function mentorTips(zones: Record<ZoneId, ZoneDef>, flags: Record<string, boolean>): [string, string] {
  const goal = nextObjective(flags);
  const restored = TOPIC_REGISTRY.filter((t) => flags[crystalFlag(t.id)]).length;
  const place = (id: ZoneId) => {
    const dir = bearingFromHome(zones, id);
    return `${placeName(zones[id])}${dir ? `, to the ${dir}` : ''}`;
  };
  let plan: string;
  if (goal.kind === 'crystal' && goal.crystal && !goal.key) {
    plan = `Here is the plan: four Fiends hold the crystals, one at each far corner of Dawnreach. Start with ${midSentence(goal.crystal.fiendName)} in ${place(goal.crystal.zoneId)} — its gate needs no key, only brave answers.`;
  } else if (goal.kind === 'crystal' && goal.crystal && goal.key) {
    plan = `You hold the ${goal.key.name}! It opens ${midSentence(goal.key.fiendName)}'s gate in ${place(goal.crystal.zoneId)}. Free the ${goal.crystal.crystalName} there!`;
  } else if (goal.kind === 'key' && goal.key) {
    const keeper = `${midSentence(goal.key.bossName)} in ${place(goal.key.fromZone)}`;
    plan =
      restored === 1
        ? `The other three Fiends hide behind locked gates, and a warden out in the wild guards each key. Start with ${keeper} — win the ${goal.key.name}!`
        : `${capitalize(goal.key.fiendName)} still hides behind a locked gate. Its key is guarded by ${keeper} — win the ${goal.key.name}!`;
  } else if (goal.kind === 'spire') {
    plan = `All four crystals shine again! Now the Crystal Spire stands open, to the ${bearingFromHome(zones, 'crystal-spire') ?? 'south'} of our village. Climb it, floor by floor, and face what waits at the top.`;
  } else {
    plan = 'Lumina is safe, thanks to you! But there are still secrets ✦ hidden in every town, and friends who would love your help.';
  }
  let tip: string;
  if (goal.kind === 'spire') {
    tip = 'Rest at the Sleepy Sheep Inn before you climb. In the Spire, every wrong answer snuffs a candle.';
  } else if (goal.kind === 'explore') {
    tip = 'Many townsfolk have little quests for you. Talk to everyone — and look for twinkles ✦!';
  } else if (restored === 0) {
    tip = "Before you set out, buy Berry Potions at Maple's Trading Post, beside the Library. And whenever you're hurt, rest at the Sleepy Sheep Inn by the plaza.";
  } else if (shrineToVisit(zones, flags)) {
    // A field spell (#75 item 9) waiting at a shrine you can reach.
    const spell = shrineToVisit(zones, flags)!;
    const keeper = NPC_DEFS[spell.keeper]?.name ?? 'A shrine keeper';
    tip = `${keeper} teaches a field spell at ${place(spell.shrine)}: ${spell.emoji} ${spell.name}. ${spell.description}`;
  } else {
    tip = [
      'Every crystal you restore lifts a bank of fog on Dawnreach. Open your 📜 Menu map to see what each crystal will uncover!',
      'Each crystal town has a Sage who can teach you a spell. Spells hit hard — but their questions are extra tricky!',
      'The Librarian keeps every question you missed — try them again in the Library any time!',
    ][(restored - 1) % 3];
  }
  return [plan, tip];
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
 * places around it, then the way to the next goal; the mentor gives the big
 * picture (`mentorTips`) and, on first meeting, where to find him again.
 */
export function wayfindingLines(
  zones: Record<ZoneId, ZoneDef>,
  npc: Pick<WorldNpcDef, 'id' | 'guide' | 'signpost' | 'mentor'>,
  flags: Record<string, boolean>,
): string[] {
  // The mentor: the big picture, then (first meeting only) where to find him again.
  if (npc.mentor) return [...mentorTips(zones, flags), ...(flags[MET_ELDER] ? [] : [npc.mentor.invite])];
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
