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
 *   flags=a,b                          story flags to set (e.g. a crystal, to lift fog)
 *
 * `__bench.pause(true|false)` pauses the world the way a menu or dialogue does.
 *
 * Exits really change zones (so a script can walk through slides, fades and
 * the arrival lock); `window.__bench.state()` reports where the hero is (how
 * many times it has bumped a fog bank, who it has talked to, and which fog
 * banks it has watched clear).
 */
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WorldCanvas from '../src/features/world/WorldCanvas';
import { ZONES, ZONE_IDS, TILE, VIEW_COLS, VIEW_ROWS, buildingInside, type ZoneDef, type ZoneId } from '../src/content/zones';
import { SPIRE_FLOOR_MAPS, SPIRE_THEMES, floorSpawnPx, floorZone, type SpireTheme } from '../src/content/spire';
import { avatarById } from '../src/content/avatars';
import { camAxis } from '../src/lib/camera';
import { BLEND_OPS_PER_CORNER, blendLayer, blendsEdges } from '../src/lib/terrain';
import { FOG_OVERHANG } from '../src/lib/fog';
import '../src/index.css';

const q = new URLSearchParams(location.search);
const zoneParam = q.get('zone') ?? 'stress';
const floor = q.get('floor') as SpireTheme | null;
const paused = q.get('paused') === '1';

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
  const base = ZONES['lumina-field'];
  return {
    ...base,
    name: `Stress ${cols}×${rows}`,
    map,
    spawn: { x: Math.floor(cx), y: Math.floor(cy) },
    buildings: [],
    // A few villagers off the roads (they wander + collide, like a real map).
    npcs: ['hub-kid', 'village-friend', 'woods-sprite', 'grove-firefly', 'grove-otter', 'coast-fisher']
      .map((defId, i) => ({ defId, x: Math.floor(cx) - 9 + i * 3, y: Math.floor(cy) + 3 }))
      .filter((p) => map[p.y][p.x] === '.' || map[p.y][p.x] === ','),
    enemies: [],
    exits: [],
  };
}

let zoneId: ZoneId;
if (zoneParam === 'stress') {
  ZONES['lumina-field'] = stressZone(Number(q.get('cols') ?? 160), Number(q.get('rows') ?? 112));
  zoneId = 'lumina-field';
} else {
  zoneId = zoneParam as ZoneId;
}
const z = floor ? floorZone(floor) : ZONES[zoneId];
const cols = z.map[0].length;
const rows = z.map.length;

const atParam = q.get('at');
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

const flags = Object.fromEntries(
  (q.get('flags') ?? '')
    .split(',')
    .filter(Boolean)
    .map((f) => [f, true]),
);
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
} = {
  zoneId,
  exits: 0,
  pos: startPos,
  fogBumps: 0,
  talks: [],
  fogReveals: [],
};

function Bench() {
  const touchDirRef = useRef({ dx: 0, dy: 0 });
  const [where, setWhere] = useState<{ zoneId: ZoneId; pos: { x: number; y: number } | null }>({
    zoneId,
    pos: startPos,
  });
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
        flags={flags}
        openedChests={[]}
        defeatedIds={[]}
        pausedRef={benchPaused}
        touchDirRef={touchDirRef}
        callbacks={{
          onTalk: (id) => {
            live.talks.push(id);
          },
          onEncounter: noop,
          onPath: noop,
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
          },
          onSpire: noop,
          onFog: () => {
            live.fogBumps += 1;
          },
          onFogRevealed: (id) => {
            live.fogReveals.push(id);
          },
        }}
        spireFloor={floor}
        spireBroken={[]}
        spireLight={null}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Bench />);
