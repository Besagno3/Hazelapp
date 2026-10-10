import { HUB_ZONE, ZONES, gateIdAt, npcPresent, type ZoneDef, type ZoneId } from '../content/zones';
import { NPC_DEFS } from '../content/npcs';
import { ENEMY_DEFS, fiendFor } from '../content/enemies';
import { GATE_KEYS, bossDefeated, keyFlag, keyForZone } from '../content/keys';
import { TOPIC_REGISTRY, crystalFlag } from '../content/topics';
import { SPIRE_CLEARED } from '../content/story';
import { BOAT_MENDED, BOAT_QUEST_ID } from '../content/boat';
import { QUESTS, questOfferedFlag, stepFlag } from '../content/quests';
import { visitedFlag } from '../content/fieldSpells';
import { nextObjective, routeTo, type Objective } from './wayfinding';
import { passable as tilePassable } from './travel';
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
  if (g.kind === 'crystal') next[crystalFlag(TOPIC_REGISTRY.find((t) => t.zoneId === g.zoneId)!.id)] = true;
  else if (g.kind === 'key') next[keyFlag(GATE_KEYS.find((k) => k.fromZone === g.zoneId)!.id)] = true;
  else if (g.kind === 'spire') next[SPIRE_CLEARED] = true;
  else if (g.kind === 'sail') next[visitedFlag('silver-shallows')] = true;
  else if (g.kind === 'boat') {
    const quest = QUESTS.find((q) => q.id === BOAT_QUEST_ID)!;
    const step = quest.steps.find((st) => !next[stepFlag(st.id)]);
    if (!next[questOfferedFlag(quest)]) next[questOfferedFlag(quest)] = true;
    else if (step) next[stepFlag(step.id)] = true;
    else next[BOAT_MENDED] = true;
  }
  return next;
}

/** Where a goal is met: the boss to beat (on its own cell), or the Spire. */
export function goalTarget(g: Objective): { zoneId: ZoneId; cell: Cell } {
  if (g.kind === 'spire') return { zoneId: 'crystal-spire', cell: ZONES['crystal-spire'].spire! };
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
  const key = keyForZone(z.id);
  const standing = new Set<string>();
  for (const p of z.npcs) {
    const def = NPC_DEFS[p.defId];
    if (def && !npcWanders(def) && npcPresent(p, flags)) standing.add(`${p.x},${p.y}`);
  }
  for (const p of z.enemies) {
    const def = ENEMY_DEFS[p.defId];
    if (!def?.isBoss || bossDefeated(def.id, def.topic, flags)) continue;
    if (target && p.x === target.x && p.y === target.y) continue;
    standing.add(`${p.x},${p.y}`);
  }
  return {
    flags,
    exits: 'stop',
    gates: (gateId) => gateId !== keyGate || (!!key && !!flags[keyFlag(key.id)]),
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
  target: { zoneId: ZoneId; cell: Cell };
  hops: Hop[];
}

/** Is (x, y) the target or beside it (a boss is bumped, not stood on)? */
const atOrBeside = (t: Cell) => (x: number, y: number) => Math.abs(x - t.x) + Math.abs(y - t.y) <= 1;

/** Walk one goal from `from` with these flags: every zone the 🚩's route crosses, then the target. */
export function walkLeg(goal: Objective, flags: Record<string, boolean>, from: { zoneId: ZoneId; cell: Cell }): Leg {
  const target = goalTarget(goal);
  const route = routeTo(ZONES, from.zoneId, target.zoneId);
  const hops: Hop[] = [];
  let here = from;
  for (const step of route ?? []) {
    const z = ZONES[here.zoneId];
    const onward = z.exits.filter((e) => e.to === step.exit.to);
    const path = reachPath(z, (x, y) => onward.some((e) => e.x === x && e.y === y), { ...playerRules(z, flags), from: here.cell });
    hops.push({ zoneId: here.zoneId, from: here.cell, to: step.exit.to, path });
    // Out of the exit you reached (or, with no way, the one the route meant) into the next zone.
    const end = path?.at(-1);
    const out = onward.find((e) => end && e.x === end.x && e.y === end.y) ?? step.exit;
    here = { zoneId: step.exit.to, cell: { x: out.spawnX, y: out.spawnY } };
  }
  if (route) {
    const z = ZONES[here.zoneId];
    const path = reachPath(z, atOrBeside(target.cell), { ...playerRules(z, flags, target.cell), from: here.cell });
    hops.push({ zoneId: here.zoneId, from: here.cell, to: null, path });
  } else {
    hops.push({ zoneId: here.zoneId, from: here.cell, to: target.zoneId, path: null });
  }
  return { goal, flags, target, hops };
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
    at = { zoneId: leg.target.zoneId, cell: end ? { x: end.x, y: end.y } : leg.target.cell };
    flags = advanceGoal(goal, flags);
  }
  return legs;
}
