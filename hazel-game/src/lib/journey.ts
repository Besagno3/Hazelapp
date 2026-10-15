import { HUB_ZONE, ZONES, gateIdAt, innWakeCell, npcPresent, type TravelMode, type ZoneDef, type ZoneId } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { ENEMY_DEFS, fiendFor } from '../content/enemies';
import { GATE_KEYS, bossDefeated, holdsKeysFor, keyFlag } from '../content/keys';
import { crystalFlag } from '../content/topics';
import { ACT2_SEEN, SPIRE_CLEARED } from '../content/story';
import { BOAT_HOME, BOAT_MENDED, BOAT_QUEST_ID, hasBoat } from '../content/boat';
import { QUESTS, questOfferedFlag, stepFlag } from '../content/quests';
import { visitedFlag } from '../content/fieldSpells';
import { nextObjective, npcHome, routeTo, type Objective } from './wayfinding';
import { passable as tilePassable, seaCrossing } from './travel';
import { npcWanders } from './wander';
import { reachPath, type Cell, type ReachOptions, type Step } from './reach';
import { defaultSave } from './save';

/**
 * Act I as a journey (#75 item 14b, the Phase 2 exit check): the story's legs
 * as the 🚩 hands them out — free Numbria's crystal, win the Verdant Key, …,
 * climb the Spire — each walked on the real maps from where the last one
 * ended. A leg is the zones the 🚩's route crosses (`routeTo`) and, in each,
 * the way from where you arrive to the exit onward, then to whoever the leg
 * is for. The rules are a player's: gatekeepers' questions get answered, a
 * warden's key gate opens only with its key, fog and dark stand until the
 * story lifts them, nobody walks through a secret passage, a place icon or a
 * person standing in the way.
 *
 * Test- and bench-only (`journey.test.ts`, `bench/`): the app never imports it.
 */

/** The goal kinds of Act I's story. */
const ACT_ONE: readonly Objective['kind'][] = ['crystal', 'key', 'spire'];

/** Does what a goal asks — the way a player would — and returns the flags it leads to. */
export function advanceGoal(g: Objective, flags: Record<string, boolean>): Record<string, boolean> {
  const next = { ...flags };
  if (g.kind === 'crystal') next[crystalFlag(g.crystal!.id)] = true;
  else if (g.kind === 'key') next[keyFlag(GATE_KEYS.find((k) => k.fromZone === g.zoneId)!.id)] = true;
  // Beating Umbra ends in a night at the inn and Act II's morning (act2-seen), which lifts the Grove-road fog.
  else if (g.kind === 'spire') Object.assign(next, { [SPIRE_CLEARED]: true, [ACT2_SEEN]: true });
  else if (g.kind === 'sail') next[visitedFlag('silver-shallows')] = true;
  else if (g.kind === 'visit') next[g.doneFlag ?? visitedFlag(g.zoneId!)] = true;
  else if (g.kind === 'fly') next[visitedFlag(g.zoneId!)] = true;
  else if (g.kind === 'boat') {
    const quest = QUESTS.find((q) => q.id === BOAT_QUEST_ID)!;
    const step = quest.steps.find((st) => !next[stepFlag(st.id)]);
    if (!next[questOfferedFlag(quest)]) next[questOfferedFlag(quest)] = true;
    else if (step) next[stepFlag(step.id)] = true;
    else next[BOAT_MENDED] = true;
  }
  return next;
}

/**
 * Where a goal is met: the boss to beat (on its own cell), the Spire, the
 * person to talk to (Act II: Marlow's friends, Keeper Mnem) — or, with no
 * cell, just arriving in the zone (sailing the Shallows, visiting the Hill).
 */
export function goalTarget(g: Objective): { zoneId: ZoneId; cell: Cell | null } {
  if (g.kind === 'spire') return { zoneId: 'crystal-spire', cell: ZONES['crystal-spire'].spire! };
  if (g.kind === 'boat') {
    const quest = QUESTS.find((q) => q.id === BOAT_QUEST_ID)!;
    const npc = g.zoneId === quest.zoneId ? quest.giverNpcId : quest.steps.find((st) => st.npc && npcHome(ZONES, st.npc.id)?.zoneId === g.zoneId)?.npc?.id;
    const home = npc ? npcHome(ZONES, npc) : null;
    if (!home) throw new Error(`nobody to talk to in ${g.zoneId}`);
    return { zoneId: home.zoneId, cell: { x: home.x, y: home.y } };
  }
  if (g.kind === 'sail' || g.kind === 'fly' || (g.kind === 'visit' && !g.doneFlag)) return { zoneId: g.zoneId!, cell: null };
  if (g.kind === 'visit') {
    // Someone to meet: Keeper Mnem calls you in for the Hall's dedication
    // (#75 item 14i); Harbormaster Gale says hello in Port Lantern (15c).
    const who = npcHome(ZONES, g.npc ?? 'hill-keeper')!;
    return { zoneId: who.zoneId, cell: { x: who.x, y: who.y } };
  }
  const zoneId = g.kind === 'key' ? g.key!.fromZone : g.zoneId!;
  const bossId = g.kind === 'key' ? g.key!.bossId : fiendFor(g.crystal!.id).id;
  const at = ZONES[zoneId].enemies.find((p) => p.defId === bossId);
  if (!at) throw new Error(`${bossId} isn't placed in ${zoneId}`);
  return { zoneId, cell: { x: at.x, y: at.y } };
}

/**
 * How a player gets about a zone with these story flags: every gatekeeper
 * answered, the key gate only with its key, no secret passages ('H'), not
 * through a place or stairs (`exits: 'stop'`), around people who stand still
 * and bosses not yet beaten (but not `target`).
 */
export function playerRules(z: ZoneDef, flags: Record<string, boolean>, target?: Cell): ReachOptions {
  const keyGate = z.keyGate ? gateIdAt(z.id, z.map, z.keyGate.x, z.keyGate.y) : null;
  const standing = new Set<string>();
  for (const p of z.npcs) {
    const def = NPC_DEFS[p.defId];
    if (def && !npcWanders(def) && npcPresent(p, flags)) standing.add(`${p.x},${p.y}`);
  }
  for (const p of z.enemies) {
    const def = ENEMY_DEFS[p.defId];
    if (!def?.isBoss || bossDefeated(def, flags)) continue;
    if (target && p.x === target.x && p.y === target.y) continue;
    standing.add(`${p.x},${p.y}`);
  }
  return {
    flags,
    exits: 'stop',
    gates: (gateId) => gateId !== keyGate || holdsKeysFor(z.id, flags),
    passable: (ch, mode) => ch !== 'H' && tilePassable(ch, mode),
    blocked: (x, y) => standing.has(`${x},${y}`),
  };
}

/** One zone of a leg: where you came in, the way across (null: there's none), and where it led. */
export interface Hop {
  zoneId: ZoneId;
  from: Cell;
  /** The zone the way leads to, or null for the last hop (the way to the target). */
  to: ZoneId | null;
  path: Step[] | null;
}

export interface Leg {
  goal: Objective;
  /** The story flags while the leg is walked (before its goal is met). */
  flags: Record<string, boolean>;
  target: { zoneId: ZoneId; cell: Cell | null };
  hops: Hop[];
  /** Where the leg ended: in the boat, or on foot with the boat moored here (null: no boat yet). */
  boat: BoatState;
}

/** Where Marlow's boat is as the hero walks (#75 item 14i): with them, or moored on a map. */
export type BoatState = { aboard: boolean; zoneId?: ZoneId; cell?: Cell } | null;

/** Is (x, y) the target or beside it (a boss is bumped, not stood on)? */
const atOrBeside = (t: Cell) => (x: number, y: number) => Math.abs(x - t.x) + Math.abs(y - t.y) <= 1;

/**
 * How a hop ends for the boat: sailed off the map (still aboard), or ashore
 * with the boat moored where the hero last sat in it.
 */
function boatAfter(path: Step[], zoneId: ZoneId, before: BoatState): BoatState {
  const last = path.at(-1)!;
  if (last.mode === 'boat') return { aboard: true };
  const sat = path.findLastIndex((st) => st.mode === 'boat');
  if (sat < 0) return before;
  return { aboard: false, zoneId, cell: { x: path[sat].x, y: path[sat].y } };
}

/**
 * Walk one goal from `from` with these flags: every zone the 🚩's route
 * crosses, then the target. With Marlow's boat (`boat`, Act II, #75 item
 * 14i) a hop may sail: climb in where it's moored, sail off a linked edge of
 * the sea onto the next map, go ashore on a beach or a dock — the boat stays
 * where the hero got out.
 */
export function walkLeg(goal: Objective, flags: Record<string, boolean>, from: { zoneId: ZoneId; cell: Cell }, boat: BoatState = null): Leg {
  const target = goalTarget(goal);
  const route = routeTo(ZONES, from.zoneId, target.zoneId);
  const hops: Hop[] = [];
  let here = from;
  const sailing = (z: ZoneDef): ReachOptions => {
    if (!boat || !hasBoat(flags)) return {};
    const modes: TravelMode[] = ['foot', 'boat'];
    if (boat.aboard) return { aboard: true, modes };
    return { modes, boat: boat.zoneId === z.id ? boat.cell : null };
  };
  for (const step of route ?? []) {
    const z = ZONES[here.zoneId];
    const onward = z.exits.filter((e) => e.to === step.exit.to);
    const sails = !z.exits.includes(step.exit);
    const goalCell = sails
      ? (x: number, y: number) => seaCrossing(z, x, y, ZONES, flags)?.to === step.exit.to
      : (x: number, y: number) => onward.some((e) => e.x === x && e.y === y);
    const path = reachPath(z, goalCell, { ...playerRules(z, flags), ...sailing(z), from: here.cell });
    hops.push({ zoneId: here.zoneId, from: here.cell, to: step.exit.to, path });
    const end = path?.at(-1);
    if (path) boat = boatAfter(path, z.id, boat);
    if (sails) {
      // Off the edge: the boat comes out one cell in on the next map.
      const out = end ? seaCrossing(z, end.x, end.y, ZONES, flags) : null;
      here = { zoneId: step.exit.to, cell: out ? { x: out.x, y: out.y } : { x: step.exit.spawnX, y: step.exit.spawnY } };
      continue;
    }
    // Out of the exit you reached (or, with no way, the one the route meant) into the next zone.
    const out = onward.find((e) => end && e.x === end.x && e.y === end.y) ?? step.exit;
    here = { zoneId: step.exit.to, cell: { x: out.spawnX, y: out.spawnY } };
  }
  if (route) {
    const z = ZONES[here.zoneId];
    const arrived = target.cell === null;
    const path = arrived
      ? [{ ...here.cell, mode: (boat?.aboard ? 'boat' : 'foot') as TravelMode }]
      : reachPath(z, atOrBeside(target.cell!), { ...playerRules(z, flags, target.cell!), ...sailing(z), from: here.cell });
    if (path && !arrived) boat = boatAfter(path, z.id, boat);
    hops.push({ zoneId: here.zoneId, from: here.cell, to: null, path });
  } else {
    hops.push({ zoneId: here.zoneId, from: here.cell, to: target.zoneId, path: null });
  }
  return { goal, flags, target, hops, boat };
}

/**
 * Act I from a brand-new save: every leg the 🚩 gives, in order, each from
 * where the last one ended (beside the boss just beaten), until the story
 * moves past the Spire.
 */
export function actOneJourney(): Leg[] {
  let flags: Record<string, boolean> = { ...defaultSave().flags };
  let at: { zoneId: ZoneId; cell: Cell } = { zoneId: HUB_ZONE, cell: ZONES[HUB_ZONE].spawn };
  const legs: Leg[] = [];
  for (let goal = nextObjective(flags); ACT_ONE.includes(goal.kind); goal = nextObjective(flags)) {
    if (legs.length >= 12) throw new Error('Act I never ends');
    const leg = walkLeg(goal, flags, at);
    legs.push(leg);
    const end = leg.hops.at(-1)?.path?.at(-1);
    at = { zoneId: leg.target.zoneId, cell: end ? { x: end.x, y: end.y } : leg.target.cell! };
    flags = advanceGoal(goal, flags);
  }
  return legs;
}

/**
 * Act II from the morning after the Spire (#75 item 14i, the Phase 3 exit):
 * the hero wakes at the Sleepy Sheep Inn with Act I done, and walks every leg
 * the 🚩 gives — Marlow's friends, then (with his boat, moored at his dock)
 * the Shallows, Remembrance Hill, Eldergrove, the Sunken Archive and the Hall
 * of Names — each from where the last one ended, sailing where a leg crosses
 * the sea, until the 🚩 says "Explore".
 */
export function actTwoJourney(): Leg[] {
  let flags: Record<string, boolean> = {};
  for (const leg of actOneJourney()) flags = advanceGoal(leg.goal, leg.flags);
  let at: { zoneId: ZoneId; cell: Cell } = { zoneId: HUB_ZONE, cell: innWakeCell(ZONES[HUB_ZONE])! };
  let boat: BoatState = null;
  const legs: Leg[] = [];
  // Act II ends where flying begins: the Roost leg is flown, which `bench … fly` walks (#75 item 15b).
  for (let goal = nextObjective(flags); goal.kind !== 'explore' && goal.kind !== 'fly'; goal = nextObjective(flags)) {
    if (legs.length >= 16) throw new Error('Act II never ends');
    // The boat is mended at Marlow's dock.
    if (!boat && hasBoat(flags)) boat = { aboard: false, zoneId: BOAT_HOME.zoneId, cell: { x: BOAT_HOME.x, y: BOAT_HOME.y } };
    const leg = walkLeg(goal, flags, at, boat);
    legs.push(leg);
    const last = leg.hops.at(-1)!;
    const end = last.path?.at(-1);
    at = { zoneId: leg.target.zoneId, cell: end ? { x: end.x, y: end.y } : last.from };
    boat = leg.boat;
    flags = advanceGoal(goal, flags);
  }
  return legs;
}

/**
 * Act III, the Phase 4 exit check (#75 item 15h): the story from where Act II
 * ends — the Roost and Taleshore flown to — through both Chorus Keys, the
 * Crystal of Voices and the Chartmaker, to "Explore". Ember flies from place to
 * place over the Starfall Sea (`bench … fly` walks the flying), so each leg is
 * walked inside its own place, from where you come in to whoever or whatever
 * the 🚩 points at.
 */
export function actThreeJourney(): Leg[] {
  let flags: Record<string, boolean> = {};
  for (const leg of actOneJourney()) flags = advanceGoal(leg.goal, leg.flags);
  for (const leg of actTwoJourney()) flags = advanceGoal(leg.goal, leg.flags);
  const legs: Leg[] = [];
  for (let goal = nextObjective(flags); goal.kind !== 'explore'; goal = nextObjective(flags)) {
    if (legs.length >= 12) throw new Error('Act III never ends');
    const target = goalTarget(goal);
    // The Roost is Act II's last flight, not a place of Act III's.
    if (goal.zoneId !== 'dragon-roost') {
      legs.push(walkLeg(goal, flags, { zoneId: target.zoneId, cell: ZONES[target.zoneId].spawn }));
    }
    flags = advanceGoal(goal, flags);
  }
  return legs;
}
