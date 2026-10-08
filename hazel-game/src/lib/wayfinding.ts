import { HUB_ZONE, MET_ELDER, ZONES, reachableOnFoot, type ZoneDef, type ZoneExit, type ZoneId } from '../content/zones';
import { NPC_DEFS, type WorldNpcDef } from '../content/npcs';
import { FIELD_SPELLS, FIELD_SPELL_IDS, knowsFieldSpell, visitedFlag, type FieldSpell } from '../content/fieldSpells';
import { QUESTS, questOfferedFlag, stepFlag } from '../content/quests';
import { BOAT_HOME, BOAT_QUEST_ID, hasBoat } from '../content/boat';
import { oppositeSide, seaEntryCell } from './travel';
import { dungeonEntrance } from '../content/dungeons';
import { TOPIC_REGISTRY, crystalFlag, type CrystalTopicInfo } from '../content/topics';
import { keyFlag, keyForZone, type GateKey } from '../content/keys';
import { SPIRE_CLEARED } from '../content/story';
import { zoneTier, type DangerTier } from '../content/regions';

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
  /** Act II adds `boat` (help Old Marlow mend his boat) and `sail` (take it to the Silver Shallows), #75 item 14. */
  kind: 'crystal' | 'key' | 'spire' | 'boat' | 'sail' | 'explore';
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
  /**
   * A spot on an overworld to flag instead of `zoneId`'s place — where a
   * goal across the sea starts (Marlow's dock for the Silver Shallows).
   */
  at?: { zoneId: ZoneId; x: number; y: number };
}

/** The 🚩 title for each step of Marlow's quest (#75 item 14). */
const BOAT_STEP_TITLES: Record<string, string> = {
  'boat-sail': "Find a sail for Marlow's boat",
  'boat-compass': "Fetch Marlow's compass",
  'boat-rudder': "Get a rudder built for Marlow's boat",
};

/**
 * Act II's next step (#75 item 14), once the Spire is cleared: help Old Marlow
 * mend his boat (step by step — each step's friend is the goal), then sail it
 * to the Silver Shallows. Null once you've been there (explore from then on).
 */
function actTwoObjective(flags: Record<string, boolean>): Objective | null {
  if (!hasBoat(flags)) {
    const quest = QUESTS.find((q) => q.id === BOAT_QUEST_ID)!;
    if (!flags[questOfferedFlag(quest)]) {
      return {
        kind: 'boat',
        title: 'Help Old Marlow',
        why: 'Old Marlow on Starfall Coast used to be a sailor — but his boat is in pieces. Ask him how to help!',
        zoneId: quest.zoneId,
      };
    }
    const step = quest.steps.find((st) => st.npc && !flags[stepFlag(st.id)]);
    const home = step?.npc ? npcHome(ZONES, step.npc.id) : null;
    if (step && home) {
      return {
        kind: 'boat',
        title: BOAT_STEP_TITLES[step.id] ?? quest.title,
        why: typeof step.hint === 'string' ? step.hint : quest.title,
        zoneId: home.zoneId,
      };
    }
    return {
      kind: 'boat',
      title: 'Tell Old Marlow his boat is ready',
      why: "Old Marlow's boat has everything it needs. Tell him on Starfall Coast!",
      zoneId: quest.zoneId,
    };
  }
  if (!flags[visitedFlag('silver-shallows')]) {
    return {
      kind: 'sail',
      title: 'Sail the Silver Shallows',
      why: "Marlow's boat waits at his dock, just east of Starfall Coast. Climb in and sail east, off the edge of the sea!",
      zoneId: 'silver-shallows',
      at: { zoneId: BOAT_HOME.zoneId, x: BOAT_HOME.x - 1, y: BOAT_HOME.y },
    };
  }
  return null;
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
      const actTwo = actTwoObjective(flags);
      if (actTwo) return actTwo;
      return {
        kind: 'explore',
        title: 'Explore Lumina',
        why: flags[visitedFlag('silver-shallows')]
          ? 'Lumina is safe, thanks to you! Sail the Silver Shallows, hunt for secrets ✨ and help everyone you meet.'
          : 'Lumina is safe, thanks to you! Hunt for secrets ✨ and help everyone you meet.',
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

/**
 * The danger tier of the road the 🚩 points down (#75 item 12): its goal's
 * place's — or null once every crystal is free (the Spire is a question
 * trial, and after it everywhere is fair game).
 */
export function roadTier(flags: Record<string, boolean>): DangerTier | null {
  const goal = nextObjective(flags);
  // After the Act I crystals (the Spire, then Act II's errands) everywhere is fair game.
  if ((goal.kind !== 'crystal' && goal.kind !== 'key') || !goal.zoneId) return null;
  return zoneTier(goal.zoneId);
}

// --- Routes ----------------------------------------------------------------------

/** One step of a route: take `exit` out of zone `from`. */
export interface Hop {
  from: ZoneId;
  exit: ZoneExit;
}

/**
 * A zone's ways out: its exits, plus — for a sea (#75 item 14) — one crossing
 * per sea link, as if it were an exit on that edge, landing where a boat
 * comes in on the far side.
 */
function waysOut(zones: Record<ZoneId, ZoneDef>, z: ZoneDef): ZoneExit[] {
  const sea = (z.seaLinks ?? []).flatMap((l) => {
    const landing = seaEntryCell(zones[l.to], oppositeSide(l.side));
    if (!landing) return [];
    const shift = l.shift ?? 0;
    const cols = z.map[0].length;
    const rows = z.map.length;
    const x = l.side === 'east' ? cols - 1 : l.side === 'west' ? 0 : landing.x - shift;
    const y = l.side === 'south' ? rows - 1 : l.side === 'north' ? 0 : landing.y - shift;
    return [{ x, y, to: l.to, spawnX: landing.x, spawnY: landing.y }];
  });
  return [...z.exits, ...sea];
}

/** Does this exit sail across a sea link rather than walk out of a gate? */
function sails(zones: Record<ZoneId, ZoneDef>, from: ZoneDef, exit: ZoneExit): boolean {
  return !from.exits.includes(exit) && zones[exit.to].kind === 'overworld';
}

/** The exits to take from one zone to another, through the fewest zones; [] when already there, null when there's no way. */
export function routeTo(zones: Record<ZoneId, ZoneDef>, from: ZoneId, to: ZoneId): Hop[] | null {
  if (from === to) return [];
  const cameBy = new Map<ZoneId, Hop>();
  const queue: ZoneId[] = [from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const exit of waysOut(zones, zones[id])) {
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
  // A run of stairs the same way is one step: "take the stairs down two floors to …".
  let stairsRun: { way: 'down' | 'up'; floors: number } | null = null;
  for (const { from: id, exit } of route) {
    const z = zones[id];
    const dest = zones[exit.to];
    if (z.kind === 'overworld' && sails(zones, z, exit)) {
      // Across the sea (#75 item 14): off the edge the boat sails over.
      steps.push(`sail ${exitSide(z, exit) ?? 'on'} to ${placeName(dest)}`);
    } else if (z.kind === 'overworld') {
      const o = origin ?? z.spawn;
      const dir = compass(exit.x - o.x, exit.y - o.y);
      steps.push(dir ? `go ${dir} to ${placeName(dest)}` : `step into ${placeName(dest)}`);
    } else if (dest.kind !== 'overworld') {
      const stairs = z.map[exit.y]?.[exit.x];
      const side = exitSide(z, exit);
      // Dungeon stairs (#75 item 10) lead down ('>') or up ('<') a floor.
      if (stairs === '>' || stairs === '<') {
        const way = stairs === '>' ? 'down' : 'up';
        const run = stairsRun?.way === way ? stairsRun.floors + 1 : 1;
        if (run > 1) steps.pop();
        const floors = run > 1 ? ` ${FLOOR_COUNT[run] ?? run} floors` : '';
        steps.push(`take the stairs ${way}${floors} to ${placeName(dest)}`);
        stairsRun = { way, floors: run };
        origin = { x: exit.spawnX, y: exit.spawnY };
        continue;
      }
      steps.push(side ? `take the ${side} path to ${placeName(dest)}` : `go on to ${placeName(dest)}`);
    }
    stairsRun = null;
    origin = { x: exit.spawnX, y: exit.spawnY };
  }
  return steps;
}

const FLOOR_COUNT = ['', 'one', 'two', 'three', 'four', 'five'];

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
  // A goal across the sea (#75 item 14): the way to where it starts, then sail.
  if (goal.at) {
    const steps = routeSteps(zones, here, goal.at.zoneId, at) ?? [];
    const route = routeTo(zones, here, goal.at.zoneId) ?? [];
    const last = route.length ? route[route.length - 1].exit : null;
    const from = here === goal.at.zoneId ? (at ?? zones[here].spawn) : last ? { x: last.spawnX, y: last.spawnY } : null;
    const dir = from ? compass(goal.at.x - from.x, goal.at.y - from.y) : null;
    steps.push(`${dir ? `go ${dir} ` : 'go '}to Marlow's dock and sail east`);
    return sentence(steps);
  }
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
  // Home's own overworld (there's more than one since the Silver Shallows, #75 item 14).
  const world = zones.dawnreach;
  const home = world?.exits.find((e) => e.to === HUB_ZONE);
  const there = world?.exits.find((e) => e.to === to);
  return home && there ? compass(there.x - home.x, there.y - home.y) : null;
}

/**
 * The first field spell (#75 item 9) not learned yet whose shrine you can walk
 * to right now (the Shrine of First Light waits behind fog for a crystal).
 */
export function shrineToVisit(zones: Record<ZoneId, ZoneDef>, flags: Record<string, boolean>): FieldSpell | null {
  const world = zones.dawnreach;
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
    // A floor deep in a dungeon (#75 item 10) is found by its entrance.
    const entrance = dungeonEntrance(id);
    const dir = bearingFromHome(zones, entrance);
    const where = entrance === id ? placeName(zones[id]) : `${placeName(zones[id])}, deep in ${placeName(zones[entrance])}`;
    return `${where}${dir ? `, to the ${dir}` : ''}`;
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
  } else if (goal.kind === 'boat') {
    plan = 'The Spire is cleared, and Lumina is remembering! Old Marlow on Starfall Coast remembers he was a sailor. Help him mend his boat, and the Silver Shallows — islands the world forgot — will be yours to explore.';
  } else if (goal.kind === 'sail') {
    plan = "Marlow's boat is mended! Out past his dock lie the Silver Shallows, islands nobody has seen since the fog. Go and see them — and tell me everything!";
  } else if (goal.kind === 'spire') {
    plan = `All four crystals shine again! Now the Crystal Spire stands open, to the ${bearingFromHome(zones, 'crystal-spire') ?? 'south'} of our village. Climb it, floor by floor, and face what waits at the top.`;
  } else {
    plan = 'Lumina is safe, thanks to you! But there are still secrets ✦ hidden in every town, and friends who would love your help.';
  }
  let tip: string;
  if (goal.kind === 'spire') {
    tip = 'Rest at the Sleepy Sheep Inn before you climb. In the Spire, every wrong answer snuffs a candle.';
  } else if (goal.kind === 'boat') {
    tip = knowsFieldSpell('return', flags)
      ? "🏠 Return flies you to any town you've been to — handy for gathering what Marlow's boat needs!"
      : 'Many townsfolk have little quests for you. Talk to everyone — and look for twinkles ✦!';
  } else if (goal.kind === 'sail') {
    tip = 'In the boat, bump into a beach or a dock to go ashore. The boat waits right where you leave it — and Old Marlow can always row it home.';
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
