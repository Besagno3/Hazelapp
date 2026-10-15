import { HUB_ZONE, MET_ELDER, WALKABLE_CHARS, ZONES, gateFlag, gateIdAt, placeKnown, type ZoneDef, type ZoneExit, type ZoneId } from '../content/zones';
import { HALL_DEDICATED } from '../content/spells';
import { reach, touches } from './reach';
import { NPC_DEFS, type WorldNpcDef } from '../content/npcs';
import { FIELD_SPELLS, FIELD_SPELL_IDS, knowsFieldSpell, visitedFlag, type FieldSpell } from '../content/fieldSpells';
import { QUESTS, handedOverFlag, questOfferedFlag, stepFlag } from '../content/quests';
import { BLANK_CHART_HELD, BLANK_CHART_QUEST } from '../content/questFlags';
import { BOAT_HOME, BOAT_QUEST_ID, hasBoat } from '../content/boat';
import { flownLink, oppositeSide, seaEntryCell } from './travel';
import { dungeonEntrance } from '../content/dungeons';
import { actComplete, actCrystals, actRestored, crystalFlag, type CrystalTopicInfo } from '../content/topics';
import { keyFlag, keyForBoss, keyForZone, type GateKey } from '../content/keys';
import { MET_GALE, SPIRE_CLEARED, canFly, emberStatus } from '../content/story';
import { zoneTier, type DangerTier } from '../content/regions';
import { overworldOf } from './worldMap';

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
  /**
   * Act II adds `boat` (help Old Marlow mend his boat) and `sail` (take it to
   * the Silver Shallows), #75 item 14, and `visit` (go and see a place the
   * world has just remembered — Remembrance Hill, #75 item 14e). `fly`: ride
   * Ember to the Dragon's Roost, once she can fly (#75 item 15b).
   */
  kind: 'crystal' | 'key' | 'spire' | 'boat' | 'sail' | 'visit' | 'fly' | 'explore';
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
   * goal across the sea starts (Marlow's dock for the Silver Shallows). Out
   * on the goal's own sea (Eldergrove, #75 item 14f) its place is flagged
   * and the way goes there as usual.
   */
  at?: { zoneId: ZoneId; x: number; y: number; name: string };
  /**
   * The story flag that meets a `visit` goal, when going there isn't enough —
   * the Hall of Names' dedication (#75 item 14i). Default: having been there.
   */
  doneFlag?: string;
  /** Where in the place to look, once you're there (Chorus Isle's gate up the road, 15g review). */
  inside?: string;
  /**
   * Who to talk to for a `visit` goal met by a flag (Keeper Mnem by default;
   * Harbormaster Gale in Port Lantern, #75 item 15c review).
   */
  npc?: string;
}

/**
 * The 🚩 for each step of Marlow's quest (#75 item 14): its title, and the why
 * a guide or the map gives — said about Marlow, not in his voice (the quest
 * log's hints are his), and without directions (the route says those).
 */
const BOAT_STEPS: Record<string, { title: string; why: string }> = {
  'boat-sail': {
    title: "Find a sail for Marlow's boat",
    why: "Innkeeper Willow in Verdara weaves the toughest sails — ask her for one for Marlow's boat.",
  },
  'boat-compass': {
    title: "Fetch Marlow's compass",
    why: "Old Marlow lent his star-compass to Mapmaker Atlas, who's drawing maps by the Rainbow Quilt Inn in Chromaria.",
  },
  'boat-rudder': {
    title: "Get a rudder built for Marlow's boat",
    why: "Sage Cog in Gearfall Canyon can build Marlow a clockwork rudder.",
  },
};

/** Where a voyage starts (#75 item 14): the end of Marlow's dock, flagged on Dawnreach's map. */
const MARLOWS_DOCK = { zoneId: BOAT_HOME.zoneId, x: BOAT_HOME.x - 1, y: BOAT_HOME.y, name: "Marlow's dock" };

/**
 * Act II's next step (#75 item 14), once the Spire is cleared: help Old Marlow
 * mend his boat (step by step — each step's friend is the goal), sail it to
 * the Silver Shallows, then visit Remembrance Hill (#75 item 14e), then win
 * the Memoria Key from Eldergrove's Ringkeeper (#75 item 14f). Null after
 * that — explore from then on, until Act II's next places exist.
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
        title: BOAT_STEPS[step.id]?.title ?? quest.title,
        why: BOAT_STEPS[step.id]?.why ?? quest.title,
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
      at: MARLOWS_DOCK,
    };
  }
  if (!flags[visitedFlag('remembrance-hill')]) {
    return {
      kind: 'visit',
      title: 'Visit Remembrance Hill',
      why: 'Lumina is remembering! Where the old fog sat past Moonwell Grove, a road nobody remembered has appeared. It leads to a town called Remembrance Hill.',
      zoneId: 'remembrance-hill',
    };
  }
  // Eldergrove's warden (#75 item 14f): its key opens the Sunken Archive's
  // silver door, where Act II's crystal waits (#75 item 14h).
  const memoria = keyForBoss('ringkeeper')!;
  if (!flags[keyFlag(memoria.id)]) {
    return {
      kind: 'key',
      title: `Win the ${memoria.name}`,
      why: `On Eldergrove, an island of ancient ring-trees out in the Silver Shallows, ${midSentence(memoria.bossName)} guards the ${memoria.name}. They say it opens a door the whole world forgot.`,
      zoneId: memoria.fromZone,
      key: memoria,
      // Off the Shallows the way starts at the boat (14f review).
      at: MARLOWS_DOCK,
    };
  }
  // Act II's crystal (#75 item 14h): the Crystal of Memory, behind the silver door.
  const crystal = actCrystals(2).find((t) => !flags[crystalFlag(t.id)]);
  if (crystal) {
    const key = keyForZone(crystal.zoneId)!;
    return {
      kind: 'crystal',
      title: `Free the ${crystal.crystalName}`,
      // Short: guides add the way there after it (#75 item 14h review).
      why: `Your ${key.name} opens its ${key.door ?? 'gate'}!`,
      zoneId: crystal.zoneId,
      crystal,
      key,
      at: MARLOWS_DOCK,
    };
  }
  // The Hall of Names' dedication (#75 item 14i): Memory's plaque lights itself.
  if (!flags[HALL_DEDICATED]) {
    return {
      kind: 'visit',
      title: 'See the new plaque',
      why: 'Something new is happening in the Hall of Names on Remembrance Hill!',
      zoneId: 'remembrance-hill',
      doneFlag: HALL_DEDICATED,
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
  // Act I's crystals (#75 item 14c): a later act's crystal never jumps the queue.
  // Its goal joins Act II's flow with the crystal itself (sub-item 14h).
  const left = actCrystals(1).filter((t) => !flags[crystalFlag(t.id)]);
  if (left.length === 0) {
    if (flags[SPIRE_CLEARED]) {
      const actTwo = actTwoObjective(flags);
      if (actTwo) return actTwo;
      // Ember flies (#75 item 15b): her first trip is home, to the Dragon's Roost.
      if (canFly(flags) && !flags[visitedFlag('dragon-roost')]) {
        return {
          kind: 'fly',
          title: "Fly to the Dragon's Roost",
          why: "Ember can fly! Tap 🐉 Fly and ride her to the Dragon's Roost, a lonely peak no path climbs, just east of Lumina Village.",
          zoneId: 'dragon-roost',
        };
      }
      // …then east, over the Great Fogbank, to Taleshore (#75 item 15c).
      if (canFly(flags) && !flags[visitedFlag('port-lantern')]) {
        return {
          kind: 'fly',
          title: 'Fly to Port Lantern',
          why: 'Past the Great Fogbank lies Taleshore, a land the fog never reached. Ride Ember over the fog to Port Lantern, its harbor town.',
          zoneId: 'port-lantern',
        };
      }
      // In Port Lantern, the harbormaster says hello first (15c review).
      if (canFly(flags) && !flags[MET_GALE]) {
        return {
          kind: 'visit',
          title: 'Meet Harbormaster Gale',
          why: `Harbormaster Gale knows everyone in Port Lantern. Say hello — Gale waits by the road into town!${knowsFieldSpell('return', flags) ? ' 🏠 Return flies you straight there.' : ''}`,
          zoneId: 'port-lantern',
          doneFlag: MET_GALE,
          npc: 'port-harbormaster',
        };
      }
      // Taleshore I (#75 item 15d): the Compass Golem's key, one of two to Chorus Isle's gate.
      const chorusA = keyForBoss('compass-golem')!;
      if (canFly(flags) && !flags[keyFlag(chorusA.id)]) {
        return {
          kind: 'key',
          title: `Win the ${chorusA.name}`,
          why: `${capitalize(midSentence(chorusA.bossName))} on the Wayfinder Isles guards the ${chorusA.name}!`,
          zoneId: chorusA.fromZone,
          key: chorusA,
        };
      }
      // Taleshore II (#75 item 15e): the Riddle Leviathan's key, the other of the two.
      const chorusB = keyForBoss('riddle-leviathan')!;
      if (canFly(flags) && !flags[keyFlag(chorusB.id)]) {
        return {
          kind: 'key',
          title: `Win the ${chorusB.name}`,
          why: `${capitalize(midSentence(chorusB.bossName))} in Inkwell Cove guards the ${chorusB.name}. It talks only in riddles!`,
          zoneId: chorusB.fromZone,
          key: chorusB,
        };
      }
      // Act III's crystal (#75 item 15g): the Crystal of Voices, behind the Hush Fiend's double gate.
      const voices = actCrystals(3).find((t) => !flags[crystalFlag(t.id)]);
      if (canFly(flags) && voices) {
        return {
          kind: 'crystal',
          title: `Free the ${voices.crystalName}`,
          why: "Both Chorus Keys together open the Hush Fiend's gate on Chorus Isle, an island far out west of Port Lantern!",
          zoneId: voices.zoneId,
          crystal: voices,
          key: keyForZone(voices.zoneId),
          // Once its gate is open, the way in needs no telling (15g review round 3).
          inside: flags[CHORUS_GATE_FLAG] ? undefined : "The Hush Fiend's gate is at the top of the road, past Old Cadence.",
        };
      }
      // Act III's last step (#75 item 15h): the Chartmaker, who knows every place's name but one.
      if (canFly(flags) && actComplete(flags, 3) && !flags[BLANK_CHART_HELD]) {
        return {
          kind: 'visit',
          title: 'Visit the Chartmaker',
          why: "The Chartmaker has drawn every place in Lumina but one. His little island is out at sea, at the top of Taleshore's map. Fly there on Ember!",
          zoneId: 'chartmakers-rest',
          doneFlag: BLANK_CHART_HELD,
          npc: 'chart-chartmaker',
          inside: chartInside(flags),
        };
      }
      return {
        kind: 'explore',
        title: flags[MET_GALE] ? 'Explore Taleshore' : 'Explore Lumina',
        why: flags[BLANK_CHART_HELD]
          ? "The Blank Chart shows one place nobody remembers, under the Crystal Spire — a mystery for another day. Check 📜 Menu for quests you haven't finished!"
          : canFly(flags)
          ? 'Ember can fly! Soar anywhere over Lumina, hunt for secrets ✨ and help everyone you meet.'
          : actComplete(flags, 2)
          ? 'The Crystal of Memory shines! Hunt for secrets ✨ and help everyone you meet.'
          : flags[visitedFlag('silver-shallows')]
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
        ? `Your ${key.name} opens ${key.fiendName}'s ${key.door ?? 'gate'}. Free the ${open.crystalName}!`
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
    why: `${key.bossName} guards the ${key.name}. It opens ${key.fiendName}'s ${key.door ?? 'gate'}.`,
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
  // After the Act I crystals (the Spire, then Act II's errands — the Memoria
  // Key, #75 item 14f, and Act II's crystal, 14h, too) everywhere is fair game.
  if ((goal.kind !== 'crystal' && goal.kind !== 'key') || !goal.zoneId || !goal.crystal || goal.crystal.act !== 1) return null;
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

/** Chorus Isle's double gate, open (15g review round 3). */
const CHORUS_GATE_FLAG = (() => {
  const isle = ZONES['chorus-isle'];
  return gateFlag(gateIdAt('chorus-isle', isle.map, isle.keyGate!.x, isle.keyGate!.y));
})();

/** Islands you're "on", not "in" (15g review). */
/**
 * Where to look on Chartmaker's Rest (15h review round 1): the Chartmaker
 * until he has asked, then whatever his quest needs next — Pen's nest, Inka,
 * and back to him — so the 🚩 never sends you round in circles.
 */
function chartInside(flags: Record<string, boolean>): string {
  const quest = QUESTS.find((q) => q.id === BLANK_CHART_QUEST)!;
  if (!flags[questOfferedFlag(quest)]) return 'The Chartmaker is in his study, the blue-roofed house.';
  // The find step has no flag of its own (it's what you carry); Inka's step says the quill is inked.
  if (!flags[stepFlag(quest.steps[1].id)] && !flags[handedOverFlag('compass-quill')]) {
    return "Get the quill from Pen's 🎁 nest (the chest right of the study), then take it to Inka on the left (west) side.";
  }
  return 'Take the Starlit Quill back to the Chartmaker, in his study.';
}

const ON_PLACES: ReadonlySet<ZoneId> = new Set<ZoneId>(['chartmakers-rest', 'chorus-isle', 'gale-atoll', 'wayfinder-isles']);

/** Places named as many ("land beside them") — not every name ending in s (the Shrine of Quiet Paws, 15d review). */
const PLURAL_PLACES: ReadonlySet<ZoneId> = new Set<ZoneId>(['wayfinder-isles', 'whispering-woods', 'clockwork-depths']);

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
  /** The story flags: once the Great Fogbank lifts (15g), Taleshore is sailed to (`flownLink`). */
  flags: Record<string, boolean> | null = null,
  /** Sailing Marlow's boat right now (15g review round 3): a way off Taleshore is sailed, not flown. */
  aboard = false,
): string[] | null {
  const route = routeTo(zones, from, to);
  if (!route) return null;
  const steps: string[] = [];
  let origin = at ?? null;
  // Starting on ground cut off from the mainland round a place only Ember
  // reaches (an island, the Roost's plateau): every step from here is flown,
  // the sea too — there's no boat up there (15d review round 4).
  const start = zones[from];
  const stranded =
    !!at &&
    start.kind === 'overworld' &&
    !!start.places?.some((pl) => pl.byAir) &&
    WALKABLE_CHARS.has(start.map[at.y]?.[at.x] ?? '#') &&
    !reach(start, { from: at, flags: null }).has(`${start.spawn.x},${start.spawn.y}`);
  // A run of stairs the same way is one step: "take the stairs down two floors to …".
  let stairsRun: { way: 'down' | 'up'; floors: number } | null = null;
  // A route over the Great Fogbank is flown all the way, on Ember: the seas
  // before and after it too — no boat waits on Taleshore (15c review).
  // Leaving Taleshore by sea is flown even once the fog thins (15g review round
  // 2): Ember brought the hero there, and the boat waits at Marlow's dock. (A
  // hero who sailed over can still fly home — Taleshore is only reached on Ember.)
  const offTaleshore = overworldOf(zones, from).id === 'taleshore' && !aboard;
  const flying = stranded || offTaleshore || route.some(({ from: id, exit }) => zones[id].kind === 'overworld' && sails(zones, zones[id], exit) && flownLink(id, exit.to, flags));
  for (const { from: id, exit } of route) {
    const z = zones[id];
    const dest = zones[exit.to];
    if (z.kind === 'overworld' && sails(zones, z, exit)) {
      // Across the sea (#75 item 14): off the edge the boat sails over — or
      // Ember flies, past the Great Fogbank (15c review).
      steps.push(`${flying ? 'fly' : 'sail'} ${exitSide(z, exit) ?? 'on'} to ${placeName(dest)}`);
    } else if (z.kind === 'overworld') {
      const o = origin ?? z.spawn;
      const dir = compass(exit.x - o.x, exit.y - o.y);
      // Still on Ember over Taleshore (15c review round 4), or a place only
      // Ember reaches (an island out at sea, #75 item 15d): say to land and walk in.
      const byAir = z.places?.some((pl) => pl.x === exit.x && pl.y === exit.y && pl.byAir);
      // Starting anywhere on the ground round a place only Ember reaches (an
      // island, the Roost's plateau) with no walk to where you're going: you fly
      // off it (15d review rounds 1–2).
      // (Only on a map with such places — the Shallows' islands are sailed between.)
      // From dry ground only: arriving off the sea, you sail or fly on as you came.
      const ashore = WALKABLE_CHARS.has(z.map[o.y]?.[o.x] ?? '#');
      const around = ashore && z.places?.some((pl) => pl.byAir) ? reach(z, { from: o, flags: null }) : null;
      const walkable = !!around && touches(around, exit.x, exit.y);
      const offIsland = !!around && !walkable;
      // "the Wayfinder Isles": land beside them (15d review).
      const them = PLURAL_PLACES.has(dest.id) ? 'them' : 'it';
      if (dir && !walkable && (flying || byAir || offIsland)) steps.push(`fly ${dir} to ${placeName(dest)}, then land beside ${them} and walk in`);
      else steps.push(dir ? `go ${dir} to ${placeName(dest)}` : `step into ${placeName(dest)}`);
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
  flags: Record<string, boolean> | null = null,
  /** Sailing the boat right now (15g review round 3). */
  aboard = false,
): string {
  if (!goal.zoneId) return '';
  if (goal.zoneId === here) {
    const where = `It's right here ${ON_PLACES.has(here) ? 'on' : 'in'} ${placeName(zones[here])}!`;
    return goal.inside ? `${where} ${goal.inside}` : where;
  }
  // A goal across the sea (#75 item 14): the way to where it starts, then sail
  // — unless you're already out on its sea (Eldergrove's, #75 item 14f).
  const sea = overworldOf(zones, goal.zoneId);
  if (goal.at && (sea.id === goal.zoneId || overworldOf(zones, here).id !== sea.id)) {
    // Past the dock: just "sail east" to the sea itself, or on to a place out there.
    const beyond = routeSteps(zones, goal.at.zoneId, goal.zoneId, goal.at, flags) ?? [];
    const sail = beyond.length > 1 ? beyond.join(', then ') : 'sail east';
    const steps = routeSteps(zones, here, goal.at.zoneId, at, flags, aboard) ?? [];
    const route = routeTo(zones, here, goal.at.zoneId) ?? [];
    const last = route.length ? route[route.length - 1].exit : null;
    const from = here === goal.at.zoneId ? (at ?? zones[here].spawn) : last ? { x: last.spawnX, y: last.spawnY } : null;
    // Already on the dock (or right by it): just climb in.
    if (here === goal.at.zoneId && from && Math.max(Math.abs(goal.at.x - from.x), Math.abs(goal.at.y - from.y)) <= 1) {
      return sentence([`climb into Marlow's boat at the end of the dock and ${sail}`]);
    }
    const dir = from ? compass(goal.at.x - from.x, goal.at.y - from.y) : null;
    steps.push(`${dir ? `go ${dir} ` : 'go '}to Marlow's dock and ${sail}`);
    return sentence(steps);
  }
  const steps = routeSteps(zones, here, goal.zoneId, at, flags, aboard) ?? [];
  // On Ember, the sea is flown over, not sailed (#75 item 15b).
  // …unless the hero is sailing right now (15g review round 4).
  return sentence(goal.kind === 'fly' && !aboard ? steps.map((st) => st.replace(/^sail /, 'fly ')) : steps);
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
  const open = reach(world, { flags });
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
  const restored = actRestored(flags, 1);
  // Every crystal shining so far, in words — a skipped Act II step can come after Voices (15g review round 4).
  const shining = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'][emberStatus(flags).crystals] ?? String(emberStatus(flags).crystals);
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
  } else if (goal.kind === 'crystal' && goal.crystal && goal.crystal.act === 3) {
    // Act III's crystal (#75 item 15g): a double gate, on an island only Ember reaches.
    plan = `You hold both Chorus Keys! Together they open ${midSentence(goal.crystal.fiendName)}'s gate on Chorus Isle, far out at sea west of Port Lantern. Fly there, and free the ${goal.crystal.crystalName}!`;
  } else if (goal.kind === 'crystal' && goal.crystal && goal.key) {
    plan = `You hold the ${goal.key.name}! It opens ${midSentence(goal.key.fiendName)}'s ${goal.key.door ?? 'gate'} in ${place(goal.crystal.zoneId)}. Free the ${goal.crystal.crystalName} there!`;
  } else if (goal.kind === 'key' && goal.key?.id === 'chorus-a') {
    plan = `On the Wayfinder Isles, out at sea north-west of Port Lantern, ${midSentence(goal.key.bossName)} guards the ${goal.key.name}. It knows every place in the world. Show it you do too!`;
  } else if (goal.kind === 'key' && goal.key?.id === 'chorus-b') {
    plan = `You have the First Chorus Key! ${capitalize(midSentence(goal.key.bossName))} guards the second in Inkwell Cove. Follow the road east from Port Lantern, then north. Take the first road east!`;
  } else if (goal.kind === 'key' && goal.key && !goal.crystal) {
    // Act II's key (#75 item 14f): no Fiend to name yet.
    plan = `Out in the Silver Shallows lies ${placeName(zones[goal.key.fromZone])}, an island of trees older than anyone remembers. ${capitalize(midSentence(goal.key.bossName))} there guards the ${goal.key.name} — a key to a door the whole world forgot. Win it!`;
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
  } else if (goal.kind === 'visit' && goal.doneFlag === MET_GALE) {
    plan = "You made it to Taleshore! In Port Lantern, Harbormaster Gale knows everyone. Go and say hello — and tell Gale I said hello too.";
  } else if (goal.kind === 'visit' && goal.doneFlag === BLANK_CHART_HELD) {
    plan = `${shining} crystals shine! Now fly to the Chartmaker's little island, at the very top of Taleshore's map, north of Port Lantern. He's drawn every place but one. Which one? Go and ask!`;
  } else if (goal.kind === 'visit' && goal.doneFlag === HALL_DEDICATED) {
    plan = `${shining} crystals shine now! And they say something new is happening in the Hall of Names, on Remembrance Hill. Go and see!`;
  } else if (goal.kind === 'visit') {
    plan = `Lumina is remembering more every day! An old road has opened past Moonwell Grove, to a town called ${place('remembrance-hill')}. They say a keeper there never forgets a name.`;
  } else if (goal.kind === 'spire') {
    plan = `All four crystals shine again! Now the Crystal Spire stands open, to the ${bearingFromHome(zones, 'crystal-spire') ?? 'south'} of our village. Climb it, floor by floor, and face what waits at the top.`;
  } else if (goal.kind === 'fly' && goal.zoneId === 'dragon-roost') {
    plan = `${shining} crystals shine now — and Ember can fly! Ride her up to the Dragon's Roost, the peak just east of our village. No path climbs it, but wings don't need one.`;
  } else if (goal.kind === 'fly' && goal.zoneId === 'port-lantern') {
    plan = "No boat gets past the Great Fogbank — but Ember can fly over it! Fly east over the Silver Shallows to Taleshore, and find Port Lantern, its harbor town.";
  } else if (flags[BLANK_CHART_HELD]) {
    plan = 'You hold the Blank Chart! Its empty spot is right under the Crystal Spire. That puzzle can wait — for now, help the folk of Taleshore. Check 📜 Menu!';
  } else if (canFly(flags)) {
    plan = 'Five crystals shine now, and Ember can fly! Soar over Lumina, and help everyone you meet.';
  } else if (actComplete(flags, 2)) {
    plan = 'Five crystals shine now! Help everyone you meet.';
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
  } else if (goal.kind === 'crystal' && goal.crystal && goal.crystal.act === 2) {
    // The Sunken Archive (#75 item 14h): swift critters, and the spell that stops one.
    tip = "In the Archive, Quill Imps are so quick they strike first. Sage Chronicle's ⏳ Time Ripple makes an enemy lose its next turn!";
  } else if (goal.kind === 'crystal' && goal.crystal && goal.crystal.act === 3) {
    tip = "Maestro Brio's inn on Chorus Isle is a fine place to rest first. Sage Aria there teaches 🎶 Chorus Call — it sings a ◆ back to you!";
  } else if (goal.kind === 'key' && goal.key?.id === 'chorus-a') {
    tip = "Rest at the Driftlight Inn in Port Lantern first. On the isles, Latitude Cats muddle Hint Feathers — try a Glimmer Candle!";
  } else if (goal.kind === 'key' && goal.key?.id === 'chorus-b') {
    tip = "Barnacle Bess sells Hint Feathers in Inkwell Cove. In the cove, Cuttle-Scribes heal themselves — hit them hard!";
  } else if (goal.kind === 'key' && !goal.crystal) {
    tip = "Critters with a purple !!! hit very hard. Rest at an inn first — and Trader Knack's Forget-Me-Knot gives you a second try at a wrong answer!";
  } else if (goal.kind === 'visit' && goal.doneFlag === MET_GALE) {
    tip = "Port Lantern has an inn, the Driftlight. Rest there, and if a battle ever goes badly, that's where you'll wake up.";
  } else if (goal.kind === 'visit' && goal.doneFlag === BLANK_CHART_HELD) {
    tip = "Nobody fights on the Chartmaker's island — it's a quiet place. Talk to everyone there. Pen the seabird loves shiny things!";
  } else if (goal.kind === 'visit' && goal.doneFlag === HALL_DEDICATED) {
    tip = 'Keeper Mnem stands inside the Hall of Names — the biggest building on Remembrance Hill, with the purple roof. Talk to him!';
  } else if (goal.kind === 'visit') {
    tip = "Every town has an inn. Rest at a new one, and if a battle goes badly, that's where you'll wake up.";
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
export function signpostLines(z: ZoneDef, x: number, y: number, flags: Record<string, boolean> = {}): string[] {
  const byDir = new Map<Compass, { name: string; d: number }[]>();
  // A place nobody remembers yet isn't on any sign (#75 item 14e).
  for (const p of (z.places ?? []).filter((pl) => placeKnown(pl, flags))) {
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
  let goal = nextObjective(flags);
  // A guide who IS the goal ("Meet Harbormaster Gale") points past it: by the
  // time their lines end, you've met them.
  if (goal.npc === npc.id && goal.doneFlag) goal = nextObjective({ ...flags, [goal.doneFlag]: true });
  const how = goalDirections(zones, goal, home.zoneId, home, flags);
  if (npc.signpost) {
    const read = signpostLines(zones[home.zoneId], home.x, home.y, flags).join('\n');
    return [read, goal.zoneId ? `🚩 Next: ${goal.title}. ${how}`.trim() : `🎉 ${goal.why}`];
  }
  return [goal.zoneId ? `Where to next? ${goal.why} ${how}`.trim() : goal.why];
}
