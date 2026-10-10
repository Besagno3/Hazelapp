/* eslint-disable react-refresh/only-export-components -- a standalone entry page, never hot-swapped */
/**
 * Dev-only world renderer bench (overworld Phase 0, #75). Not part of the app
 * build — Vite serves it at /bench/world.html in dev. Mounts the real
 * `WorldCanvas` on either a real zone or a generated big map, and exposes
 * frame-time stats + screenshot metadata on `window.__bench` for
 * `bench/run-world-bench.cjs`.
 *
 * Query params:
 *   zone=stress (default) | <ZoneId>   cols / rows size the stress map (160×112)
 *   floor=<SpireTheme>                 draw a Spire floor (with zone=crystal-spire)
 *   at=x,y                             start cell (else the zone spawn)
 *   paused=1                           freeze the world (deterministic screenshots)
 *   flags=a,b                          story flags to set (e.g. a crystal, to lift fog);
 *                                      `__bench.setFlag(f)` sets one later, as a conversation would
 *   boat=zone,x,y                      Marlow's boat moored there (#75 item 14)
 *   aboard=1                           start in the boat (with `at` on open sea)
 *   fled=<instanceId>                  just fled from this enemy ("silver-shallows:bubble-puffer@17,28"):
 *                                      it stands down until the hero moves off (#75 item 14d review)
 *   leg=<n>                            Act I's leg n (`lib/journey.ts`): its zone, start
 *                                      cell and story flags; `__bench.walkLeg()` walks it
 *   walk=1                             (with floor=…) `__bench.walkFloor()` walks the Spire
 *                                      floor: every seal, then the stairs (or Umbra)
 *
 * `__bench.pause(true|false)` pauses the world the way a menu or dialogue does.
 * `__bench.travel(zone, x, y)` casts Return and `__bench.calm(seconds)` casts
 * Calm (#75 item 9); `state()` counts encounters, pitch-dark bumps and the
 * Calm seconds left.
 *
 * Exits really change zones (so a script can walk through slides, fades and
 * the arrival lock); `window.__bench.state()` reports where the hero is (how
 * many times it has bumped a fog bank, who it has talked to, and which fog
 * banks it has watched clear). Bumping a gatekeeper's gate opens it, as an
 * answered question would; a warden's key gate opens only with its key flag.
 *
 * The walker (#75 item 14b, `bench/walker.ts`, the runner's `journey` mode)
 * steers the real hero along the journey's paths through the touch pad.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WorldCanvas, { type Travel } from '../src/features/world/WorldCanvas';
import { ZONES, ZONE_IDS, TILE, VIEW_COLS, VIEW_ROWS, buildingInside, type ZoneDef, type ZoneId } from '../src/content/zones';
import type { BoatSpot } from '../src/types';
import { SPIRE_FLOOR_MAPS, SPIRE_THEMES, floorSpawnPx, floorZone, type SpireTheme } from '../src/content/spire';
import { avatarById } from '../src/content/avatars';
import { camAxis } from '../src/lib/camera';
import { BLEND_OPS_PER_CORNER, blendLayer, blendsEdges } from '../src/lib/terrain';
import { FOG_OVERHANG } from '../src/lib/fog';
import { fogLifted, fogSeenFlag, gateFlag } from '../src/content/zones';
import { keyFlag, keyForZone } from '../src/content/keys';
import { actOneJourney, goalTarget } from '../src/lib/journey';
import { reachPath, type Cell } from '../src/lib/reach';
import { floorWards } from '../src/content/spire';
import { makeWalker, type HopReport } from './walker';
import '../src/index.css';

const q = new URLSearchParams(location.search);
const zoneParam = q.get('zone') ?? 'stress';
const floor = q.get('floor') as SpireTheme | null;
const paused = q.get('paused') === '1';
/** `leg=<n>`: one of Act I's legs, walked by `__bench.walkLeg()` (#75 item 14b). */
const leg = q.has('leg') ? actOneJourney()[Number(q.get('leg'))] ?? null : null;

/** mulberry32 — a tiny deterministic PRNG so the stress map is identical every run. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An overworld-like test map: an island continent (~half the map is sea),
 * forest clumps, flowers, a few lakes, and a cross of roads through the
 * centre where the hero spawns.
 */
function stressZone(cols: number, rows: number): ZoneDef {
  const rand = rng(75);
  const cx = cols / 2;
  const cy = rows / 2;
  const map: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) {
      const nx = (x - cx) / (cols * 0.42);
      const ny = (y - cy) / (rows * 0.4);
      const wobble = 0.08 * Math.sin(x * 0.21) + 0.07 * Math.sin(y * 0.17 + 1) + 0.05 * Math.sin((x + y) * 0.11);
      const land = Math.hypot(nx, ny) + wobble < 1;
      let ch = '~';
      if (land) {
        const lake = Math.sin(x * 0.13 + 2) * Math.cos(y * 0.19) > 0.93;
        const forest = Math.sin(x * 0.3) * Math.cos(y * 0.27) + rand() * 0.5 > 0.95;
        ch = lake ? '~' : forest ? '#' : rand() < 0.04 ? ',' : '.';
        if (y === Math.floor(cy) || x === Math.floor(cx)) ch = '=';
      }
      row += ch;
    }
    map.push(row);
  }
  // Borrows the overworld's tileset (and id), as an overworld-like map should.
  const base = ZONES.dawnreach;
  return {
    ...base,
    name: `Stress ${cols}×${rows}`,
    map,
    spawn: { x: Math.floor(cx), y: Math.floor(cy) },
    buildings: [],
    places: [],
    fogs: [],
    // A few villagers off the roads (they wander + collide, like a real map).
    npcs: ['hub-kid', 'village-friend', 'woods-sprite', 'grove-firefly', 'grove-otter', 'coast-fisher']
      .map((defId, i) => ({ defId, x: Math.floor(cx) - 9 + i * 3, y: Math.floor(cy) + 3 }))
      .filter((p) => map[p.y][p.x] === '.' || map[p.y][p.x] === ','),
    enemies: [],
    exits: [],
  };
}

let zoneId: ZoneId;
if (leg) {
  zoneId = leg.hops[0].zoneId;
} else if (zoneParam === 'stress') {
  ZONES.dawnreach = stressZone(Number(q.get('cols') ?? 160), Number(q.get('rows') ?? 112));
  zoneId = 'dawnreach';
} else {
  zoneId = zoneParam as ZoneId;
}
const z = floor ? floorZone(floor) : ZONES[zoneId];
const cols = z.map[0].length;
const rows = z.map.length;

/** `boat=zone,x,y` — where Marlow's boat is moored (#75 item 14). */
const boatParam: BoatSpot | null = (() => {
  const [z, x, y] = (q.get('boat') ?? '').split(',');
  return z && z in ZONES ? { zoneId: z as ZoneId, x: Number(x), y: Number(y) } : null;
})();
const atParam = leg ? `${leg.hops[0].from.x},${leg.hops[0].from.y}` : q.get('at');
const startPos = atParam
  ? (() => {
      const [x, y] = atParam.split(',').map(Number);
      return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
    })()
  : floor
    ? floorSpawnPx(floor, TILE)
    : null;

/** One outdoor, walkable start cell near the centre of each screen of the map. */
function screenCells(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const ok = (x: number, y: number) => '.,='.includes(z.map[y]?.[x] ?? '#') && !buildingInside(z, x, y);
  for (let by = 0; by < Math.ceil(rows / VIEW_ROWS); by++) {
    for (let bx = 0; bx < Math.ceil(cols / VIEW_COLS); bx++) {
      const tx = Math.min(cols - 1, bx * VIEW_COLS + Math.floor(VIEW_COLS / 2));
      const ty = Math.min(rows - 1, by * VIEW_ROWS + Math.floor(VIEW_ROWS / 2));
      let best: { x: number; y: number } | null = null;
      for (let r = 0; r < 12 && !best; r++) {
        for (let dy = -r; dy <= r && !best; dy++) {
          for (let dx = -r; dx <= r && !best; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) === r && ok(tx + dx, ty + dy)) best = { x: tx + dx, y: ty + dy };
          }
        }
      }
      if (best) out.push(best);
    }
  }
  return out;
}

/**
 * Screen-pixel rects of things that animate even while paused — water, the
 * save crystal, Spire seals, and every character's idle cycle (villagers,
 * critters, bosses, Umbra, the hero, Ember). A before/after screenshot diff
 * ignores these, since their frame depends on exact timing.
 */
function animatedRects(): [number, number, number, number][] {
  const W = cols * TILE;
  const H = rows * TILE;
  const VW = VIEW_COLS * TILE;
  const VH = VIEW_ROWS * TILE;
  const px = startPos ?? { x: z.spawn.x * TILE + TILE / 2, y: z.spawn.y * TILE + TILE / 2 };
  const ox = camAxis(px.x, W, VW) - VW / 2;
  const oy = camAxis(px.y, H, VH) - VH / 2;
  const rects: [number, number, number, number][] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if ('~SQ'.includes(z.map[y][x])) rects.push([x * TILE - ox, y * TILE - oy, TILE, TILE]);
    }
  }
  // Shoreline corner tiles (edge blending, #71b) animate their water too, half a
  // tile off the water cells — mask them, or every coast screen "differs".
  if (blendsEdges(z)) {
    const L = blendLayer(z);
    for (let vy = 0; vy < L.vrows; vy++) {
      for (let vx = 0; vx < L.vcols; vx++) {
        if (L.waterStep[(vy * L.vcols + vx) * BLEND_OPS_PER_CORNER] > 0) {
          rects.push([vx * TILE - TILE / 2 - ox, vy * TILE - TILE / 2 - oy, TILE, TILE]);
        }
      }
    }
  }
  // Fog banks drift (#75): their puffs orbit and swell.
  // Fog puffs drift past the bank's rectangle by up to FOG_OVERHANG.
  const m = FOG_OVERHANG;
  for (const f of z.fogs ?? []) rects.push([f.x * TILE - ox - m, f.y * TILE - oy - m, f.w * TILE + 2 * m, f.h * TILE + 2 * m]);
  // Character sprites: a generous box around each one's start point.
  const box = (cx: number, cy: number, half: number) => rects.push([cx - half - ox, cy - half - oy, half * 2, half * 2]);
  for (const p of [...z.npcs, ...z.enemies]) box(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, 30);
  const umbra = floor ? SPIRE_FLOOR_MAPS[floor].umbra : undefined;
  if (umbra) box((umbra.x + 1) * TILE, umbra.y * TILE + TILE / 2, 34);
  box(px.x, px.y, 24); // hero
  box(px.x - 24, px.y + 8, 24); // Ember, trailing
  return rects.filter(([x, y, w, h]) => x > -w && y > -h && x < VW && y < VH);
}

// Frame-time sampler (rAF deltas), read by the runner. Bounded, with a
// running max — a tab left open for ages can't grow it forever or overflow
// `Math.max(...deltas)` (#77).
const MAX_SAMPLES = 10_000;
const deltas: number[] = [];
let maxDelta = 0;
let last = 0;
const tick = (t: number) => {
  if (last) {
    const d = t - last;
    deltas.push(d);
    if (deltas.length > MAX_SAMPLES) deltas.shift();
    maxDelta = Math.max(maxDelta, d);
  }
  last = t;
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
/** The world's pause switch — module-level so `__bench.pause()` can flip it. */
const benchPaused = { current: paused };
/** Field spells (#75 item 9): a Return to fly (`__bench.travel`) and Calm seconds (`__bench.calm`). */
const benchTravel: { current: Travel | null } = { current: null };
// A walk (#75 item 14b) runs under Calm from the first frame: a critter wandering into the
// hero while the page loads would start a battle and stop the world.
const benchCalm = { current: q.has('leg') || q.get('walk') === '1' ? 1e9 : 0 };
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
(window as unknown as { __bench: unknown }).__bench = {
  reset: () => {
    deltas.length = 0;
    maxDelta = 0;
  },
  stats: () => ({
    frames: deltas.length,
    fps: deltas.length ? 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0,
    p50: pct(deltas, 0.5),
    p95: pct(deltas, 0.95),
    max: maxDelta,
  }),
  state: () => ({ ...live, talks: [...live.talks], fogReveals: [...live.fogReveals] }),
  /** Pause / resume the world, as a menu or dialogue would. */
  pause: (on: boolean) => {
    benchPaused.current = on;
  },
  /** Cast Return (#75 item 9): fly to `to`, landing on cell (x, y). */
  travel: (to: ZoneId, x: number, y: number) => {
    benchTravel.current = { to, x, y };
  },
  /** Cast Calm (#75 item 9) for this many seconds. */
  calm: (seconds: number) => {
    benchCalm.current = seconds;
  },
  info: () => ({
    zoneId,
    floor,
    cols,
    rows,
    screens: screenCells(),
    animated: animatedRects(),
    zoneIds: ZONE_IDS,
    spireThemes: SPIRE_THEMES,
  }),
};

const flags: Record<string, boolean> = Object.fromEntries(
  (q.get('flags') ?? '')
    .split(',')
    .filter(Boolean)
    .map((f) => [f, true]),
);
if (leg) {
  // The leg's story so far — and every fog it has lifted already watched clearing,
  // so no camera pan holds the walk up.
  Object.assign(flags, leg.flags);
  for (const zz of Object.values(ZONES)) for (const f of zz.fogs ?? []) if (fogLifted(f, flags)) flags[fogSeenFlag(f.id)] = true;
}
/** The flags the world sees now (gates opened since load included). */
const benchFlagsRef: { current: Record<string, boolean> } = { current: flags };
/** Sets a story flag mid-run (`__bench.setFlag`), as a conversation would. */
const setFlagRef: { current: ((flag: string) => void) | null } = { current: null };
(window as unknown as { __bench: Record<string, unknown> }).__bench.setFlag = (flag: string) => setFlagRef.current?.(flag);
/** Live position, read by the runner / scripts. */
const live: {
  zoneId: ZoneId;
  exits: number;
  pos: { x: number; y: number } | null;
  fogBumps: number;
  /** Everyone the hero has talked to, in order (NPC def ids). */
  talks: string[];
  /** Fog banks seen clearing on screen, in order (#75 item 7). */
  fogReveals: string[];
  /** Battles the hero walked into, and pitch-dark bumps (#75 item 9). */
  encounters: number;
  darkBumps: number;
  /** The last whole seconds of Calm the world reported. */
  calmLeft: number;
  /** Marlow's boat (#75 item 14): sailing it, where it's moored, and how often you climbed in / went ashore. */
  aboard: boolean;
  boat: BoatSpot | null;
  boardings: number;
  landings: number;
  /** Position reports from the canvas (the walker's probe waits for a fresh one). */
  moves: number;
  /** Who the hero walked into (enemy def ids), the Spire icon, seals, stairs, Umbra (#75 item 14b). */
  battles: string[];
  spire: number;
  wards: string[];
  stairs: number;
  umbra: number;
} = {
  zoneId,
  exits: 0,
  pos: startPos,
  fogBumps: 0,
  talks: [],
  fogReveals: [],
  encounters: 0,
  darkBumps: 0,
  calmLeft: 0,
  aboard: q.get('aboard') === '1',
  boat: boatParam,
  boardings: 0,
  landings: 0,
  moves: 0,
  battles: [],
  spire: 0,
  wards: [],
  stairs: 0,
  umbra: 0,
};

/** The direction held — the touch pad's, so the walker can steer the hero. */
const benchTouch = { current: { dx: 0, dy: 0 } };
const walker = makeWalker({
  touch: benchTouch,
  pause: (on) => {
    benchPaused.current = on;
  },
  where: () => ({ zoneId: live.zoneId, pos: live.pos, moves: live.moves }),
  zone: (id) => (floor ? z : ZONES[id]),
});
const bench = (window as unknown as { __bench: Record<string, unknown> }).__bench;
/** Act I's legs, by title (the runner walks each on its own page). */
bench.legs = () => actOneJourney().map((l) => l.goal.title);
/** Walk this page's Act I leg (`leg=<n>`): every hop, then into its boss (or the Spire). */
bench.walkLeg = async () => {
  if (!leg) throw new Error('no leg= param');
  if (!(await walker.ready())) return { title: leg.goal.title, ok: false, hops: [], seconds: 0, talks: 0, error: 'the world never started' };
  const t0 = performance.now();
  const target = goalTarget(leg.goal);
  const bossId = leg.goal.kind === 'spire' ? null : ZONES[target.zoneId].enemies.find((e) => e.x === target.cell.x && e.y === target.cell.y)!.defId;
  const hops: HopReport[] = [];
  for (const h of leg.hops) {
    if (live.zoneId !== h.zoneId) {
      hops.push({ zoneId: h.zoneId, cells: 0, ms: 0, ok: false, stuck: { reason: `in ${live.zoneId}, not ${h.zoneId}`, at: null, step: 0 }, tightTurns: [] });
      break;
    }
    if (!h.path) {
      hops.push({ zoneId: h.zoneId, cells: 0, ms: 0, ok: false, stuck: { reason: 'no path', at: h.from, step: 0 }, tightTurns: [] });
      break;
    }
    const touched = () => (bossId ? live.battles.includes(bossId) : live.spire > 0);
    const r = await walker.walk(h.path, h.to ? { to: h.to } : { target: target.cell, touched });
    hops.push(r);
    if (!r.ok) break;
  }
  return {
    title: leg.goal.title,
    ok: hops.length === leg.hops.length && hops.every((h) => h.ok),
    hops,
    seconds: Math.round((performance.now() - t0) / 100) / 10,
    talks: live.talks.length,
  };
};
/** Walk this page's Spire floor (`floor=…&walk=1`): every seal, then the stairs — or up to Umbra. */
bench.walkFloor = async () => {
  if (!floor) throw new Error('no floor= param');
  if (!(await walker.ready())) return { title: floor, ok: false, hops: [], seconds: 0, error: 'the world never started' };
  const t0 = performance.now();
  const hops: HopReport[] = [];
  let here: Cell = SPIRE_FLOOR_MAPS[floor].spawn;
  const dist = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  // Each goal: the cells it covers (the stairs are two wide, Umbra stands on a two-tile carpet).
  const goals: { cells: Cell[]; touched: () => boolean }[] = floorWards(floor).map((w) => ({
    cells: [w],
    touched: () => live.wards.includes(w.id),
  }));
  const umbra = SPIRE_FLOOR_MAPS[floor].umbra;
  if (umbra) goals.push({ cells: [umbra, { x: umbra.x + 1, y: umbra.y }], touched: () => live.umbra > 0 });
  else goals.push({ cells: z.map.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === 'U' ? [{ x, y }] : []))), touched: () => live.stairs > 0 });
  for (const g of goals) {
    const path = reachPath(z, (x, y) => g.cells.some((c) => dist(c, { x, y }) <= 1), { from: here, flags: null });
    if (!path) {
      hops.push({ zoneId: 'crystal-spire', cells: 0, ms: 0, ok: false, stuck: { reason: 'no path', at: g.cells[0], step: 0 }, tightTurns: [] });
      break;
    }
    // Push into the goal cell the path ends beside.
    const end = path[path.length - 1];
    const at = g.cells.find((c) => dist(c, end) <= 1) ?? g.cells[0];
    const r = await walker.walk(path, { target: at, touched: g.touched });
    hops.push(r);
    if (!r.ok) break;
    here = path[path.length - 1];
  }
  return { title: floor, ok: hops.length === goals.length && hops.every((h) => h.ok), hops, seconds: Math.round((performance.now() - t0) / 100) / 10 };
};

function Bench() {
  const [benchFlags, setBenchFlags] = useState<Record<string, boolean>>(flags);
  useEffect(() => {
    benchFlagsRef.current = benchFlags;
  }, [benchFlags]);
  useEffect(() => {
    setFlagRef.current = (flag) => setBenchFlags((f) => ({ ...f, [flag]: true }));
  }, []);
  const [where, setWhere] = useState<{ zoneId: ZoneId; pos: { x: number; y: number } | null }>({
    zoneId,
    pos: startPos,
  });
  const [boat, setBoat] = useState<{ aboard: boolean; spot: BoatSpot | null }>({ aboard: live.aboard, spot: live.boat });
  const noop = () => {};
  return (
    // +4px for the stage's 2px border, so the canvas shows at its native 704×448
    // (no resampling — screenshots compare pixel-for-pixel).
    <div style={{ width: VIEW_COLS * TILE + 4 }}>
      <WorldCanvas
        zoneId={where.zoneId}
        avatar={avatarById('a1')!}
        age={9}
        skillLevels={{}}
        emberStage="hatchling"
        startPos={where.pos}
        flags={benchFlags}
        openedChests={[]}
        defeatedIds={[]}
        pausedRef={benchPaused}
        touchDirRef={benchTouch}
        callbacks={{
          onTalk: (id) => {
            live.talks.push(id);
          },
          onEncounter: (enemy) => {
            live.encounters += 1;
            live.battles.push(enemy.id);
          },
          onDark: () => {
            live.darkBumps += 1;
          },
          onCalmTick: (left) => {
            live.calmLeft = left;
          },
          onPath: (t) => {
            // A gatekeeper's question, answered; a warden's key gate opens only with its key (#58).
            if (t.kind === 'gate') setFlagRef.current?.(gateFlag(t.id));
            else if (t.kind === 'keygate') {
              const key = keyForZone(t.zoneId);
              if (key && benchFlagsRef.current[keyFlag(key.id)]) setFlagRef.current?.(gateFlag(t.id));
            }
          },
          onExit: (to, sx, sy) => {
            const pos = { x: sx * TILE + TILE / 2, y: sy * TILE + TILE / 2 };
            live.zoneId = to;
            live.exits += 1;
            live.pos = pos;
            setWhere({ zoneId: to, pos });
          },
          onSaveCrystal: noop,
          onMove: (x, y) => {
            live.pos = { x, y };
            live.moves += 1;
          },
          onSpire: () => {
            live.spire += 1;
          },
          onWard: (id) => {
            live.wards.push(id);
          },
          onStairs: () => {
            live.stairs += 1;
          },
          onUmbra: () => {
            live.umbra += 1;
          },
          onFog: () => {
            live.fogBumps += 1;
          },
          onFogRevealed: (id) => {
            live.fogReveals.push(id);
          },
          onBoard: (x, y) => {
            live.aboard = true;
            live.boardings += 1;
            live.pos = { x, y };
            setBoat({ aboard: true, spot: null });
          },
          onLand: (spot, x, y) => {
            live.aboard = false;
            live.landings += 1;
            live.pos = { x, y };
            live.boat = { zoneId: live.zoneId, ...spot };
            setBoat({ aboard: false, spot: live.boat });
          },
        }}
        spireFloor={floor}
        spireBroken={[]}
        spireLight={null}
        travelRef={benchTravel}
        calmRef={benchCalm}
        boat={boat.aboard ? null : boat.spot}
        aboard={boat.aboard}
        fledFrom={q.get('fled')}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Bench />);
