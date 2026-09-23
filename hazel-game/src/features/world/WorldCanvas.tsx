import { useEffect, useRef, useState } from 'react';
import kaplay from 'kaplay';
import type { MutableRefObject } from 'react';
import {
  TILE,
  VIEW_COLS,
  VIEW_ROWS,
  WALKABLE_CHARS,
  buildingAt,
  buildingInside,
  pathTargetId,
  gateFlag,
  gateIdAt,
  safeSpawn,
  zone,
  type BuildingDef,
} from '../../content/zones';
import { bossDefeated } from '../../content/keys';
import { NPC_DEFS, npcSpriteId } from '../../content/npcs';
import { spawnEnemy } from '../../content/enemies';
import { EMBER_SPRITES, EMBER_MAP_SIZE, EMBER_SPRITE_IDS, type EmberStage } from '../../content/story';
import type { Avatar, BattleEnemy, PathTarget, ZoneId } from '../../types';
import { loadWorldSprites, worldFace } from './worldSprites';
import { resolveSprite } from '../../content/sprites';
import { animFor, facingFor, type Facing } from '../../lib/facing';
import { camAxis } from '../../lib/camera';
import { floorZone, SPIRE_FLOOR_MAPS, type SpireTheme } from '../../content/spire';
import { SLIDE_MS, exitSide, slideFrom, type ExitSide } from '../../lib/transition';
import {
  PROPS_KEY,
  PROP_FRAME,
  ROOF_KEY,
  SPIRE_KEY,
  SPIRE_PROPS_KEY,
  SPIRE_PROP_FRAME,
  TILE_FRAME,
  TOWN_FRAME,
  groundVariant,
  namedTilesetKey,
  roofFrame,
  tilesetKey,
  townKey,
} from '../../content/tiles';
import {
  npcWanders,
  pickWanderDir,
  clampToLeash,
  withinLeash,
  pickAmbientLine,
  approachBlocked,
  WANDER_TUNING,
  AMBIENT_TUNING,
  ACTOR_RADIUS,
  WANDER_WALL_HALF,
} from '../../lib/wander';

/** Player hitbox half-size (smaller than a tile so corridors feel forgiving). */
const HALF = 11;
const SPEED = 170;
/** The canvas is one screen; larger maps scroll under a following camera. */
const VIEW_W = VIEW_COLS * TILE;
const VIEW_H = VIEW_ROWS * TILE;
/** Roof fade speed (per second) when the hero steps in / out of a building. */
const ROOF_FADE = 10;
/** Building-interior chars → town tile frame. */
const TOWN_TILE: Record<string, number> = {
  D: TOWN_FRAME.door,
  F: TOWN_FRAME.floor,
  K: TOWN_FRAME.counter,
  B: TOWN_FRAME.shelf,
  T: TOWN_FRAME.table,
  Z: TOWN_FRAME.bed,
};
/** Seconds after closing an overlay before bumps can trigger again. */
const TRIGGER_COOLDOWN = 0.8;
/** Movement keys we own at the window level (see the keyboard effect). */
const MOVE_KEYS = new Set([
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'a',
  'd',
  'w',
  's',
]);

/**
 * KaPlay's app state (`a`) is a process-wide singleton and `quit()` is deferred
 * to frame-end while never clearing the singleton. So calling `kaplay()` a
 * second time — e.g. when the world screen remounts after a battle — makes the
 * *previous* instance's pending quit() tear down the *new* canvas (the "black
 * line / dead canvas"). The cure is to call `kaplay()` exactly ONCE per session
 * and re-parent its canvas on every world mount. (#43 follow-up.)
 */
let sharedKaplay: { k: ReturnType<typeof kaplay>; canvas: HTMLCanvasElement } | null = null;

export interface WorldCanvasCallbacks {
  onTalk: (npcId: string) => void;
  onEncounter: (enemy: BattleEnemy) => void;
  onPath: (target: PathTarget) => void;
  onExit: (to: ZoneId, spawnX: number, spawnY: number) => void;
  onSaveCrystal: () => void;
  onMove: (x: number, y: number) => void;
  /** Bumped the Spire entrance icon (Crystal Spire zone only, #55). */
  onSpire: () => void;
  /** Spire floors (#74): bumped an unbroken rune seal / the stairs / Umbra. */
  onWard?: (id: string) => void;
  onStairs?: () => void;
  onUmbra?: () => void;
}

/**
 * Renders one zone of Lumina on a KaPlay canvas (#37, supersedes the #36
 * single-screen MVP). Tile-grid collision, bump-to-interact NPCs/gates/
 * chests/crystals, walk-into enemies to battle, edge exits between zones.
 * 16-bit tile art from the zone's generated tileset (`content/tiles.ts`).
 *
 * KaPlay teardown is fragile: its app state (`a`) is a module-level singleton,
 * and `quit()` is deferred to frame-end and never clears the singleton. So
 * remounting the instance per zone made the *outgoing* zone's deferred quit()
 * tear down the *incoming* zone's canvas — the "black line / dead canvas" on a
 * screen change (#43 follow-up). Instead we init KaPlay ONCE (every zone is the
 * same 704×448 size) and rebuild the scene on zone/ember change; `pausedRef`
 * freezes the simulation while a DOM overlay is open above it.
 */
export default function WorldCanvas({
  zoneId,
  avatar,
  age,
  emberStage,
  startPos,
  flags,
  openedChests,
  defeatedIds,
  pausedRef,
  touchDirRef,
  callbacks,
  spireFloor = null,
  spireBroken = [],
  spireLight = null,
}: {
  zoneId: ZoneId;
  avatar: Avatar;
  age: number;
  /** Ember the dragon's growth stage — drawn trailing the hero. */
  emberStage: EmberStage;
  /** Pixel position to spawn at, or null for the zone default. */
  startPos: { x: number; y: number } | null;
  flags: Record<string, boolean>;
  openedChests: string[];
  defeatedIds: string[];
  pausedRef: MutableRefObject<boolean>;
  touchDirRef: MutableRefObject<{ dx: number; dy: number }>;
  callbacks: WorldCanvasCallbacks;
  /** Spire climb (#74): draw this floor's map instead of the zone. */
  spireFloor?: SpireTheme | null;
  /** Rune seals already broken on the floor (read live through a ref). */
  spireBroken?: string[];
  /** Candle-lights left — the hero's circle of light shrinks as they go out. */
  spireLight?: { lives: number; max: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Zelda-style screen slide between zones --------------------------------
  // On an edge exit we snapshot the outgoing screen; the new zone builds in the
  // (hidden, off-screen) canvas, then both slide together and the hero stays
  // frozen until the new screen has settled.
  const [slide, setSlide] = useState<{ src: string; side: ExitSide; from: ZoneId; running: boolean } | null>(null);
  const slidingRef = useRef(false);
  useEffect(() => {
    if (!slide || slide.running || slide.from === zoneId) return;
    // The new zone was built on this render; give it a frame to draw, then go.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setSlide((s) => (s ? { ...s, running: true } : s)));
    });
    return () => cancelAnimationFrame(raf);
  }, [slide, zoneId]);
  // Safety net: if the zone never changes (or a frame never comes), drop the
  // snapshot and unfreeze rather than leave the hero stuck mid-slide.
  const slideStarted = !!slide;
  useEffect(() => {
    if (!slideStarted) return;
    const t = setTimeout(() => {
      slidingRef.current = false;
      setSlide(null);
    }, SLIDE_MS + 1000);
    return () => clearTimeout(t);
  }, [slideStarted]);
  useEffect(() => {
    if (!slide?.running) return;
    const t = setTimeout(() => {
      slidingRef.current = false;
      setSlide(null);
    }, SLIDE_MS + 30);
    return () => clearTimeout(t);
  }, [slide?.running]);
  const kRef = useRef<ReturnType<typeof kaplay> | null>(null);
  // Re-running the scene effect for every prop change would rebuild the
  // world mid-walk; the latest callbacks/flags are read through refs instead.
  const cbRef = useRef(callbacks);
  const flagsRef = useRef(flags);
  const chestsRef = useRef(openedChests);
  const brokenRef = useRef(spireBroken);
  const lightRef = useRef(spireLight);
  const darkRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    cbRef.current = callbacks;
    flagsRef.current = flags;
    chestsRef.current = openedChests;
    brokenRef.current = spireBroken;
    lightRef.current = spireLight;
  });

  // Held movement keys, tracked at the window level so the player moves
  // whenever the browser window has focus — no need to click the canvas first
  // (KaPlay binds keys to the canvas element, which we run with focus:false).
  const keysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!MOVE_KEYS.has(key)) return;
      e.preventDefault(); // stop arrow keys from scrolling the page
      keysRef.current.add(key);
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    // Releasing focus (alt-tab, devtools) could otherwise leave a key "stuck".
    const clear = () => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  // A Spire floor (#74) borrows the Spire zone's id but brings its own map.
  const z = spireFloor ? floorZone(spireFloor) : zone(zoneId);
  const cols = z.map[0].length;
  const rows = z.map.length;
  const W = cols * TILE;
  const H = rows * TILE;

  // --- Adopt the one shared KaPlay instance ----------------------------------
  // Created once for the whole session at a fixed one-screen viewport (bigger
  // maps scroll under the camera instead of resizing the canvas);
  // on later mounts we just re-parent the existing canvas. Never re-init — see
  // the `sharedKaplay` note above. The scene effect repaints the ground.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    if (!sharedKaplay) {
      const k = kaplay({
        root: host,
        width: VIEW_W,
        height: VIEW_H,
        background: z.ground,
        global: false,
        crisp: true,
        focus: false,
        loadingScreen: false,
        debug: false,
      });
      const canvas = host.querySelector('canvas');
      if (!canvas) return; // should never happen — kaplay() just made it
      sharedKaplay = { k, canvas };
      loadWorldSprites(k);
    } else {
      // Reuse the live instance: move its canvas into this mount's container.
      host.appendChild(sharedKaplay.canvas);
    }
    kRef.current = sharedKaplay.k;
    return () => {
      // Detach (don't quit) so the next world entry can re-adopt the canvas.
      sharedKaplay?.canvas.remove();
      kRef.current = null;
    };
    // One instance per session; zone size never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Build (and rebuild) the scene per zone / ember stage -------------------
  useEffect(() => {
    const k = kRef.current;
    if (!k) return;
    // Clear the previous zone's objects before drawing this one ("*" = all).
    k.destroyAll('*');

    // Ground fill under everything (also covers any sub-pixel canvas edge).
    k.add([k.rect(W, H), k.pos(0, 0), k.color(...z.ground), k.z(-100)]);

    // --- Tiles -------------------------------------------------------------
    // Every cell gets an opaque base (ground / path / water), then overlays
    // (scenery, flowers, exits, props) are layered on top. Frame indices come
    // from `TILE_FRAME` / `PROP_FRAME` so the generator and renderer agree.
    const tiles = z.tileset ? namedTilesetKey(z.tileset) : tilesetKey(zoneId);
    const tile = (frame: number, px: number, py: number, z = -50) =>
      k.add([k.sprite(tiles, { frame }), k.pos(px, py), k.z(z)]);
    const prop = (frame: number, px: number, py: number) =>
      k.add([k.sprite(PROPS_KEY, { frame }), k.pos(px, py), k.z(-10)]);
    const chestSprites = new Map<string, ReturnType<typeof k.add>>();
    // Spire floors (#74): live seal sprites (by id) + the stairs up.
    const wardSprites = new Map<string, ReturnType<typeof k.add>>();
    const stairSprites: ReturnType<typeof k.add>[] = [];
    const spireProp = (frame: number, px: number, py: number) =>
      k.add([k.sprite(SPIRE_PROPS_KEY, { frame }), k.pos(px, py), k.z(-10)]);
    const gateSprites = new Map<string, ReturnType<typeof k.add>[]>();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = z.map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        const home = buildingAt(z, x, y);
        // Building tiles draw in that building's architecture style (#73).
        const townTiles = townKey(home?.style ?? 'timber');
        if (ch === 'W') {
          // Facade (a building's street-facing bottom row) vs. wall tops.
          const b = home;
          const facade = b && y === b.y + b.h - 1;
          const nearDoor = z.map[y][x - 1] === 'D' || z.map[y][x + 1] === 'D';
          const frame = !facade
            ? TOWN_FRAME.wallTop
            : (x - (b?.x ?? 0)) % 2 === 1 && !nearDoor
              ? TOWN_FRAME.facadeWindow
              : TOWN_FRAME.facade;
          k.add([k.sprite(townTiles, { frame }), k.pos(px, py), k.z(-50)]);
          continue;
        } else if (ch in TOWN_TILE) {
          k.add([k.sprite(townTiles, { frame: TOWN_TILE[ch] }), k.pos(px, py), k.z(-50)]);
          continue;
        } else if (ch === '=' || ch === 'E') {
          tile(TILE_FRAME.path, px, py);
        } else if (ch === '~') {
          const water = tile(TILE_FRAME.water[0], px, py);
          (water as unknown as { play: (n: string) => void }).play('water');
        } else {
          tile(groundVariant(x, y), px, py);
        }
        if (ch === '#') {
          tile(TILE_FRAME.solid, px, py, -40);
        } else if (ch === ',') {
          tile(TILE_FRAME.deco, px, py, -40);
        } else if (ch === 'E') {
          tile(TILE_FRAME.exit, px, py, -40);
        } else if (ch === 'S') {
          const crystal = prop(PROP_FRAME.crystal[0], px, py);
          (crystal as unknown as { play: (n: string) => void }).play('glow');
        } else if (ch === 'C') {
          const id = pathTargetId(zoneId, 'chest', x, y);
          const sprite = prop(chestsRef.current.includes(id) ? PROP_FRAME.chestOpen : PROP_FRAME.chestClosed, px, py);
          chestSprites.set(id, sprite);
        } else if (ch === 'Q') {
          const id = `${x},${y}`;
          if (brokenRef.current.includes(id)) {
            spireProp(SPIRE_PROP_FRAME.wardBroken, px, py);
          } else {
            const ward = spireProp(SPIRE_PROP_FRAME.ward[0], px, py);
            (ward as unknown as { play: (n: string) => void }).play('glow');
            wardSprites.set(id, ward);
          }
        } else if (ch === 'U') {
          stairSprites.push(spireProp(SPIRE_PROP_FRAME.stairsSealed, px, py));
        } else if (ch === 'Y') {
          const left = z.map[y][x - 1] !== 'Y';
          spireProp(left ? SPIRE_PROP_FRAME.throne[0] : SPIRE_PROP_FRAME.throne[1], px, py);
        } else if (ch === 'G') {
          const id = gateIdAt(zoneId, z.map, x, y);
          if (!flagsRef.current[gateFlag(id)]) {
            const sprite = prop(PROP_FRAME.gate, px, py);
            const group = gateSprites.get(id);
            if (group) group.push(sprite);
            else gateSprites.set(id, [sprite]);
          }
        }
      }
    }

    // --- Buildings (#72): signs + roofs ---------------------------------
    // Outside, a roof hides every row but the facade so the building reads as
    // enclosed; stepping inside fades that building's roof (and name) away.
    type Fader = { opacity: number };
    const roofs: { b: BuildingDef; parts: Fader[]; opacity: number }[] = [];
    for (const b of z.buildings ?? []) {
      const parts: Fader[] = [];
      const roofRows = b.h - 1; // the facade row stays visible
      for (let ry = 0; ry < roofRows; ry++) {
        for (let rx = 0; rx < b.w; rx++) {
          parts.push(
            k.add([
              k.sprite(ROOF_KEY, { frame: roofFrame(b.roof, rx, ry, b.w, roofRows) }),
              k.pos((b.x + rx) * TILE, (b.y + ry) * TILE),
              k.opacity(1),
              k.z(15),
            ]) as unknown as Fader,
          );
        }
      }
      parts.push(
        k.add([
          k.text(b.name, { size: 11 }),
          k.pos((b.x + b.w / 2) * TILE, (b.y + roofRows / 2) * TILE),
          k.anchor('center'),
          k.color(255, 248, 225),
          k.opacity(1),
          k.z(16),
        ]) as unknown as Fader,
      );
      roofs.push({ b, parts, opacity: 1 });
      if (b.sign) {
        // Hang the sign on the facade beside the door (right side if free).
        const fy = b.y + b.h - 1;
        const door = z.map[fy].indexOf('D', b.x);
        const sx = door + 1 < b.x + b.w - 1 ? door + 1 : door - 1;
        k.add([k.sprite(townKey(b.style), { frame: TOWN_FRAME.sign[b.sign] }), k.pos(sx * TILE, fy * TILE), k.z(-40)]);
      }
    }

    // KaPlay's add()/worldFace() return a generic GameObj that erases component
    // types, so we declare the minimal shapes the world actors actually use. This
    // keeps the movement loop's .pos math type-checked instead of falling back to `any`.
    type WorldVec = ReturnType<typeof k.vec2>;
    type WorldActor = {
      pos: WorldVec;
      onUpdate: (cb: () => void) => void;
      add: (comps: unknown[]) => unknown;
      destroy: () => void;
    };
    type HeroActor = WorldActor & {
      play: (n: string) => void;
      flipX: boolean;
      scale: WorldVec;
    };

    // --- Actors ------------------------------------------------------------
    interface Actor {
      x: number;
      y: number;
      kind: 'npc' | 'enemy' | 'spire' | 'umbra';
      npcId?: string;
      enemy?: BattleEnemy;
      /** Sprite pieces — moved together when a wanderer is pushed off the player. */
      parts?: { pos: WorldVec }[];
      /** Footprint radius (px) for actor↔actor overlap avoidance. */
      radius: number;
    }
    const actors: Actor[] = [];

    // Set true once a battle/exit fires; freezes all ambient motion too.
    // Declared here (not by the main loop) so wander controllers can read it.
    let triggered = false;

    // --- Ambient life: wandering actors + idle speech bubbles --------------
    // Contact/collision reads each actor's live x/y every frame (see the main
    // loop below), so a wanderer only has to keep its x/y in lockstep with its
    // sprites. Pure decision math lives in `lib/wander.ts`; this closure wires
    // it to KaPlay (collision via the hoisted `hitAt`, freeze via `pausedRef`).
    type Part = { pos: WorldVec };
    interface WanderOpts {
      actor: Actor;
      parts: Part[];
      homeX: number;
      homeY: number;
      leash: number;
      speed: number;
      /** The anchor's sprite anims (omit for emoji faces — no animation). */
      anims?: Record<string, unknown>;
    }
    function attachWander(anchor: WorldActor, o: WanderOpts) {
      let dir = { x: 0, y: 0 };
      let timer = 0.3 + Math.random() * 1.2;
      // Sprite wanderers play their walk cycle and face their heading (4-way).
      const spr = o.anims ? (anchor as unknown as { play: (n: string) => void; flipX: boolean }) : null;
      let facing: Facing = 'down';
      let curAnim = '';
      const homeBuilding = buildingAt(z, Math.floor(o.homeX / TILE), Math.floor(o.homeY / TILE));
      const animate = (moving: boolean) => {
        if (!spr || !o.anims) return;
        const want = animFor(facing, moving, o.anims);
        if (want === curAnim) return;
        curAnim = want;
        spr.play(want);
      };
      animate(false);
      anchor.onUpdate(() => {
        if (pausedRef.current || triggered) return;
        const dt = k.dt();
        timer -= dt;
        if (timer <= 0) {
          // Steer back when near the leash edge; otherwise wander freely.
          if (!withinLeash(o.actor.x, o.actor.y, o.homeX, o.homeY, o.leash * 0.85)) {
            const len = Math.hypot(o.homeX - o.actor.x, o.homeY - o.actor.y) || 1;
            dir = { x: (o.homeX - o.actor.x) / len, y: (o.homeY - o.actor.y) / len };
          } else {
            dir = pickWanderDir(Math.random);
          }
          timer = dir.x || dir.y ? 0.6 + Math.random() : 0.7 + Math.random() * 1.6;
          facing = facingFor(dir.x, dir.y, facing);
          if (spr && facing === 'side') spr.flipX = dir.x < 0;
          animate(!!(dir.x || dir.y));
        }
        if (!dir.x && !dir.y) return;
        const nx = o.actor.x + dir.x * o.speed * dt;
        const ny = o.actor.y + dir.y * o.speed * dt;
        // Clamp to the leash first, then collision-test the *final* cell so a
        // steer-home/leash correction can never seat the sprite inside a wall.
        const c = clampToLeash(nx, ny, o.homeX, o.homeY, o.leash);
        // Walls (full sprite footprint) and every *other* character (other
        // wanderers, stationary NPCs, the boss, the Spire — not the player or
        // Ember) block the step; on a bump, stop and repick a direction.
        if (
          hitBox(c.x, c.y, WANDER_WALL_HALF) ||
          // Townsfolk stay on their side of a building wall (no strolling in
          // or out of shops through the door).
          buildingAt(z, Math.floor(c.x / TILE), Math.floor(c.y / TILE)) !== homeBuilding ||
          actors.some(
            (other) =>
              other !== o.actor &&
              approachBlocked(o.actor.x, o.actor.y, c.x, c.y, other.x, other.y, o.actor.radius + other.radius),
          )
        ) {
          dir = { x: 0, y: 0 };
          timer = 0.2 + Math.random() * 0.5;
          animate(false);
          return;
        }
        const ddx = c.x - o.actor.x;
        const ddy = c.y - o.actor.y;
        o.actor.x = c.x;
        o.actor.y = c.y;
        for (const part of o.parts) {
          part.pos.x += ddx;
          part.pos.y += ddy;
        }
      });
    }

    type Bubble = WorldActor & {
      opacity: number;
      width?: number;
      height?: number;
      exists: () => boolean;
    };
    function attachAmbient(parent: WorldActor, lines: string[]) {
      let timer = AMBIENT_TUNING.firstMin + Math.random() * AMBIENT_TUNING.firstSpan;
      parent.onUpdate(() => {
        if (pausedRef.current || triggered) return;
        timer -= k.dt();
        if (timer > 0) return;
        timer = AMBIENT_TUNING.gapMin + Math.random() * AMBIENT_TUNING.gapSpan;
        const line = pickAmbientLine(lines, Math.random);
        if (!line) return;
        // A light pill behind dark text so bubbles read on any ground; both are
        // children of the NPC so they ride along as it moves, fade + rise, and
        // die together. The text is added first so KaPlay measures it.
        const label = parent.add([
          k.text(line, { size: 9 }),
          k.pos(0, -22),
          k.anchor('center'),
          k.color(45, 35, 65),
          k.opacity(1),
          k.z(21),
        ]) as unknown as Bubble;
        const w = (label.width ?? line.length * 6) + 8;
        const h = (label.height ?? 11) + 5;
        const pill = parent.add([
          k.rect(w, h, { radius: 4 }),
          k.pos(0, -22),
          k.anchor('center'),
          k.color(248, 245, 255),
          k.outline(1, k.rgb(130, 120, 150)),
          k.opacity(0.9),
          k.z(20),
        ]) as unknown as Bubble;
        let life = AMBIENT_TUNING.life;
        label.onUpdate(() => {
          if (pausedRef.current) return;
          life -= k.dt();
          const o = Math.max(0, life / AMBIENT_TUNING.life);
          const rise = k.dt() * 6;
          label.pos.y -= rise;
          pill.pos.y -= rise;
          label.opacity = o;
          pill.opacity = o * 0.9;
          if (life <= 0) {
            if (pill.exists()) pill.destroy();
            if (label.exists()) label.destroy();
          }
        });
      });
    }

    // The Spire entrance icon (#55) — a tall glowing tower; bump it to climb.
    if (z.spire) {
      const px = z.spire.x * TILE + TILE / 2;
      const py = z.spire.y * TILE + TILE / 2;
      // 32×64 tower sprite: its base sits on the Spire tile, the crystal floats.
      const tower = k.add([k.sprite(SPIRE_KEY), k.pos(px, py - 16), k.anchor('center'), k.z(7)]);
      tower.onUpdate(() => {
        if (pausedRef.current) return;
        (tower as unknown as { pos: { y: number } }).pos.y = py - 16 + Math.sin(k.time() * 2) * 1.5;
      });
      k.add([
        k.text('The Spire', { size: 10 }),
        k.pos(px, py + 22),
        k.anchor('center'),
        k.color(255, 240, 200),
      ]);
      actors.push({ x: px, y: py, kind: 'spire', radius: ACTOR_RADIUS.spire });
    }

    for (const p of z.npcs) {
      const def = NPC_DEFS[p.defId];
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      // All visual pieces move together when the NPC wanders.
      const parts: Part[] = [];
      const spriteId = npcSpriteId(def);
      const npcView = resolveSprite(spriteId, def.sprite).def?.world;
      if (!npcView) {
        const token = k.add([
          k.rect(30, 30, { radius: 6 }),
          k.color(255, 245, 215),
          k.outline(2, k.rgb(120, 90, 40)),
          k.pos(px, py),
          k.anchor('center'),
        ]);
        parts.push(token as unknown as Part);
      }
      const face = worldFace(k, { spriteId, emoji: def.sprite, x: px, y: py, size: 22 })
        .obj as unknown as WorldActor;
      parts.push(face);
      const label = k.add([
        k.text(def.name, { size: 10 }),
        k.pos(px, py + 24),
        k.anchor('center'),
        k.color(255, 255, 255),
      ]);
      parts.push(label as unknown as Part);
      const actor: Actor = {
        x: px,
        y: py,
        kind: 'npc',
        npcId: def.id,
        parts,
        radius: ACTOR_RADIUS.npc,
      };
      actors.push(actor);
      // Pure-flavor villagers roam; services / quest-givers / story NPCs stay.
      if (npcWanders(def)) {
        attachWander(face, {
          actor,
          parts,
          homeX: px,
          homeY: py,
          leash: TILE * WANDER_TUNING.npc.leashTiles,
          speed: WANDER_TUNING.npc.speed,
          anims: npcView?.anims,
        });
      }
      if (def.ambient?.length) attachAmbient(face, def.ambient);
    }

    for (const p of z.enemies) {
      const enemy = spawnEnemy(p.defId, zoneId, `${p.defId}@${p.x},${p.y}`, age);
      // Bosses stay gone once beaten (crystal restored / warden's key held);
      // regular enemies stay gone for the session (they respawn next visit).
      if (enemy.isBoss && bossDefeated(enemy.id, enemy.topic, flagsRef.current)) continue;
      if (defeatedIds.includes(enemy.instanceId)) continue;
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      const enemyView = resolveSprite(enemy.spriteId, enemy.sprite).def?.world;
      const enemyHasSprite = !!enemyView;
      const parts: Part[] = [];
      const body = enemyHasSprite
        ? null
        : k.add([
            k.rect(enemy.isBoss ? 42 : 32, enemy.isBoss ? 42 : 32, { radius: 8 }),
            k.color(60, 30, 50),
            k.outline(2, k.rgb(255, 120, 120)),
            k.pos(px, py),
            k.anchor('center'),
          ]);
      if (body) parts.push(body as unknown as Part);
      const face = worldFace(k, {
        spriteId: enemy.spriteId,
        emoji: enemy.sprite,
        x: px,
        y: py,
        size: enemy.isBoss ? 30 : 24,
        z: 6,
      }).obj as unknown as WorldActor;
      parts.push(face);
      const label = k.add([
        k.text(`${enemy.isBoss ? '👑 ' : ''}Lv ${enemy.level}`, { size: 10 }),
        k.pos(px, py + (enemy.isBoss ? 32 : 26)),
        k.anchor('center'),
        k.color(255, 200, 200),
      ]);
      parts.push(label as unknown as Part);
      const actor: Actor = {
        x: px,
        y: py,
        kind: 'enemy',
        enemy,
        parts,
        radius: enemy.isBoss ? ACTOR_RADIUS.boss : ACTOR_RADIUS.enemy,
      };
      actors.push(actor);
      if (enemy.isBoss) {
        // Bosses hold their ground — gentle idle hover only (collision fixed).
        let t = Math.random() * Math.PI * 2;
        face.onUpdate(() => {
          if (pausedRef.current) return;
          t += k.dt() * 2.4;
          const dy = Math.sin(t) * 3;
          if (body) (body as unknown as Part).pos.y = py + dy;
          face.pos.y = py + dy;
        });
      } else {
        // Regular critters roam their patch (slightly wider leash than NPCs).
        attachWander(face, {
          actor,
          parts,
          homeX: px,
          homeY: py,
          leash: TILE * WANDER_TUNING.enemy.leashTiles,
          speed: WANDER_TUNING.enemy.speed,
          anims: enemyView?.anims,
        });
      }
    }

    // Umbra, the Forgotten One, waits on the throne floor (#74).
    const umbraAt = spireFloor ? SPIRE_FLOOR_MAPS[spireFloor].umbra : undefined;
    if (umbraAt) {
      const ux = (umbraAt.x + 1) * TILE; // centred on the two-tile carpet
      const uy = umbraAt.y * TILE + TILE / 2;
      const face = worldFace(k, { spriteId: 'umbra', emoji: '🌑', x: ux, y: uy, size: 34, z: 6 })
        .obj as unknown as WorldActor;
      let t = 0;
      face.onUpdate(() => {
        if (pausedRef.current) return;
        t += k.dt() * 2;
        face.pos.y = uy + Math.sin(t) * 3; // a slow, menacing hover
      });
      actors.push({ x: ux, y: uy, kind: 'umbra', radius: ACTOR_RADIUS.boss });
    }

    // --- Player ------------------------------------------------------------
    // A saved position that no longer fits the map (e.g. a save from before a
    // zone was redrawn) falls back to the zone spawn instead of a wall.
    const spawn = safeSpawn(z, startPos);
    const followCam = (x: number, y: number) => k.setCamPos(camAxis(x, W, VIEW_W), camAxis(y, H, VIEW_H));
    followCam(spawn.x, spawn.y);
    const heroView = resolveSprite(avatar.spriteId, avatar.sprite).def?.world ?? null;
    let player: HeroActor;
    if (heroView && avatar.spriteId) {
      player = k.add([
        k.sprite(`w_${avatar.spriteId}`),
        k.pos(spawn.x, spawn.y),
        k.anchor('center'),
        k.z(10),
      ]) as unknown as HeroActor;
      player.play(animFor('down', false, heroView.anims)); // spawn facing the camera
    } else {
      player = k.add([
        k.rect(28, 28, { radius: 8 }),
        k.color(255, 220, 100),
        k.outline(2, k.rgb(120, 80, 0)),
        k.pos(spawn.x, spawn.y),
        k.anchor('center'),
        k.z(10),
      ]) as unknown as HeroActor;
      player.add([k.text(avatar.sprite, { size: 20 }), k.anchor('center')]);
    }
    let curAnim = heroView ? animFor('down', false, heroView.anims) : 'idle';
    let heroFacing: Facing = 'down';

    // Ember trails the hero (no collision — dragons walk where they please).
    const ember = worldFace(k, {
      spriteId: EMBER_SPRITE_IDS[emberStage],
      emoji: EMBER_SPRITES[emberStage],
      x: spawn.x - 24,
      y: spawn.y + 8,
      size: EMBER_MAP_SIZE[emberStage],
      z: 9,
    }).obj as unknown as WorldActor;
    const emberView = resolveSprite(EMBER_SPRITE_IDS[emberStage], EMBER_SPRITES[emberStage]).def?.world ?? null;
    const emberSprite = ember as unknown as { play: (n: string) => void; flipX: boolean };
    let emberAnim = '';
    let lastDir = { x: 0, y: 1 };

    // --- Collision ---------------------------------------------------------
    const isOpenGate = (x: number, y: number) =>
      flagsRef.current[gateFlag(gateIdAt(zoneId, z.map, x, y))] === true;

    /** What blocks the cell, if anything. */
    function blockerAt(cx: number, cy: number): { ch: string; x: number; y: number } | null {
      const ch = z.map[cy]?.[cx] ?? '#';
      if (WALKABLE_CHARS.has(ch)) return null;
      if (ch === 'G' && isOpenGate(cx, cy)) return null;
      return { ch, x: cx, y: cy };
    }

    /** Does a `half`-sized box centered at (px,py) overlap any blocked tile? */
    function hitBox(px: number, py: number, half: number): { ch: string; x: number; y: number } | null {
      const corners: [number, number][] = [
        [px - half, py - half],
        [px + half, py - half],
        [px - half, py + half],
        [px + half, py + half],
      ];
      for (const [cx, cy] of corners) {
        const b = blockerAt(Math.floor(cx / TILE), Math.floor(cy / TILE));
        if (b) return b;
      }
      return null;
    }

    const hitAt = (px: number, py: number) => hitBox(px, py, HALF);

    // --- Main loop ---------------------------------------------------------
    let wasPaused = false;
    let cooldown = 0;
    let moveSaveTimer = 0;

    const loop = k.onUpdate(() => {
      if (triggered) return;
      if (pausedRef.current || slidingRef.current) {
        wasPaused = true;
        return;
      }
      if (wasPaused) {
        wasPaused = false;
        cooldown = TRIGGER_COOLDOWN;
      }
      const dt = k.dt();
      cooldown = Math.max(0, cooldown - dt);

      const keys = keysRef.current;
      let dx = touchDirRef.current.dx;
      let dy = touchDirRef.current.dy;
      if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
      if (keys.has('arrowright') || keys.has('d')) dx += 1;
      if (keys.has('arrowup') || keys.has('w')) dy -= 1;
      if (keys.has('arrowdown') || keys.has('s')) dy += 1;
      dx = Math.max(-1, Math.min(1, dx));
      dy = Math.max(-1, Math.min(1, dy));
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.sqrt(2);
        dx *= inv;
        dy *= inv;
      }

      if (dx !== 0 || dy !== 0) lastDir = { x: dx, y: dy };

      const moving = dx !== 0 || dy !== 0;
      if (heroView) {
        heroFacing = facingFor(dx, dy, heroFacing);
        const want = animFor(heroFacing, moving, heroView.anims);
        if (want !== curAnim) {
          curAnim = want;
          player.play(want);
        }
        // Single-frame sprites (no 'walk' anim): a small squash-stretch hop.
        if (moving && !heroView.anims.walk) {
          const hop = 1 + Math.sin(k.time() * 16) * 0.06;
          player.scale = k.vec2(1, hop);
        } else if (!heroView.anims.walk) {
          player.scale = k.vec2(1, 1);
        }
        // Side frames face right; mirror for left. Up/down views are symmetric.
        if (heroFacing === 'side' && dx !== 0) {
          player.flipX = dx < 0;
        }
      }

      // Axis-separated movement for wall sliding; remember what we bumped.
      let bumped: { ch: string; x: number; y: number } | null = null;
      if (dx !== 0) {
        const nx = player.pos.x + dx * SPEED * dt;
        const hit = hitAt(nx, player.pos.y);
        if (!hit) player.pos.x = nx;
        else bumped = hit;
      }
      if (dy !== 0) {
        const ny = player.pos.y + dy * SPEED * dt;
        const hit = hitAt(player.pos.x, ny);
        if (!hit) player.pos.y = ny;
        else bumped = bumped ?? hit;
      }

      // Bump interactions (gate / chest / save crystal).
      if (bumped && cooldown === 0) {
        if (bumped.ch === 'G') {
          const id = gateIdAt(zoneId, z.map, bumped.x, bumped.y);
          cooldown = TRIGGER_COOLDOWN;
          // A warden-keyed Fiend gate checks a key instead of asking a question (#58).
          // Match on the gate group so either tile of a double-wide gate counts.
          const keyed = z.keyGate && gateIdAt(zoneId, z.map, z.keyGate.x, z.keyGate.y) === id;
          cbRef.current.onPath({ kind: keyed ? 'keygate' : 'gate', id, topic: z.topic ?? 'math', zoneId });
        } else if (bumped.ch === 'C') {
          const id = pathTargetId(zoneId, 'chest', bumped.x, bumped.y);
          if (!chestsRef.current.includes(id)) {
            cooldown = TRIGGER_COOLDOWN;
            cbRef.current.onPath({ kind: 'chest', id, topic: z.topic ?? 'math', zoneId });
          }
        } else if (bumped.ch === 'S') {
          cooldown = 2;
          cbRef.current.onSaveCrystal();
        } else if (bumped.ch === 'Q') {
          // A rune seal on a Spire floor (#74): face its question.
          const id = `${bumped.x},${bumped.y}`;
          if (!brokenRef.current.includes(id)) {
            cooldown = TRIGGER_COOLDOWN;
            cbRef.current.onWard?.(id);
          }
        } else if (bumped.ch === 'U') {
          cooldown = TRIGGER_COOLDOWN;
          cbRef.current.onStairs?.();
        } else if (bumped.ch === 'K') {
          // Talk across a shop counter to whoever stands behind it (#72).
          const cx = bumped.x * TILE + TILE / 2;
          const cy = bumped.y * TILE + TILE / 2;
          const clerk = actors.find(
            (a) => a.kind === 'npc' && a.npcId && Math.hypot(a.x - cx, a.y - cy) < TILE * 1.6,
          );
          if (clerk?.npcId) {
            player.pos.x -= dx * 10;
            player.pos.y -= dy * 10;
            cooldown = TRIGGER_COOLDOWN;
            cbRef.current.onMove(player.pos.x, player.pos.y);
            cbRef.current.onTalk(clerk.npcId);
          }
        }
      }

      // Actor contact: NPCs talk, enemies start battles.
      if (cooldown === 0) {
        for (const a of actors) {
          const r = a.kind === 'enemy' && a.enemy?.isBoss ? 34 : 28;
          const dxa = player.pos.x - a.x;
          const dya = player.pos.y - a.y;
          if (dxa * dxa + dya * dya < r * r) {
            if (a.kind === 'npc' && a.npcId) {
              // Push a *wandering* NPC clear of the contact radius (along the
              // player→NPC axis) so it can't re-open dialogue on a standing
              // player after the cooldown; the player nudge alone is a no-op
              // when the NPC walked into a motionless hero (dx/dy = 0).
              const dist = Math.sqrt(dxa * dxa + dya * dya) || 1;
              const need = r + 8 - dist;
              if (need > 0 && a.parts) {
                const ax = a.x - (dxa / dist) * need;
                const ay = a.y - (dya / dist) * need;
                if (!hitAt(ax, ay)) {
                  for (const part of a.parts) {
                    part.pos.x += ax - a.x;
                    part.pos.y += ay - a.y;
                  }
                  a.x = ax;
                  a.y = ay;
                }
              }
              // Nudge back so closing the dialogue doesn't instantly re-bump.
              player.pos.x -= dx * 10;
              player.pos.y -= dy * 10;
              cooldown = TRIGGER_COOLDOWN;
              cbRef.current.onMove(player.pos.x, player.pos.y);
              cbRef.current.onTalk(a.npcId);
            } else if (a.kind === 'spire') {
              player.pos.x -= dx * 10;
              player.pos.y -= dy * 10;
              cooldown = TRIGGER_COOLDOWN;
              cbRef.current.onMove(player.pos.x, player.pos.y);
              cbRef.current.onSpire();
            } else if (a.kind === 'umbra') {
              player.pos.x -= dx * 10;
              player.pos.y -= dy * 10;
              cooldown = TRIGGER_COOLDOWN;
              cbRef.current.onUmbra?.();
            } else if (a.kind === 'enemy' && a.enemy) {
              triggered = true;
              cbRef.current.onMove(player.pos.x - dx * 14, player.pos.y - dy * 14);
              cbRef.current.onEncounter(a.enemy);
            }
            break;
          }
        }
      }

      // Camera follows the hero on maps bigger than one screen.
      followCam(player.pos.x, player.pos.y);

      // Spire floors: seals dim as they break; the stairs open once all are.
      if (wardSprites.size) {
        for (const [id, sprite] of wardSprites) {
          if (brokenRef.current.includes(id)) {
            (sprite as unknown as { frame: number; stop?: () => void }).stop?.();
            (sprite as unknown as { frame: number }).frame = SPIRE_PROP_FRAME.wardBroken;
            wardSprites.delete(id);
          }
        }
        if (wardSprites.size === 0) {
          for (const s of stairSprites) (s as unknown as { frame: number }).frame = SPIRE_PROP_FRAME.stairsOpen;
        }
      }

      // Candle-light: darkness everywhere but a flickering circle round the hero.
      const light = lightRef.current;
      const dark = darkRef.current;
      if (dark) {
        if (light) {
          // Spooky but readable for kids: a wide glow that narrows per lost candle.
          const r = 150 + 45 * Math.max(0, light.lives) + Math.sin(k.time() * 7) * 3 + Math.sin(k.time() * 13) * 2;
          const cx = (player.pos.x / VIEW_W) * 100;
          const cy = (player.pos.y / VIEW_H) * 100;
          dark.style.background = `radial-gradient(ellipse ${(r / VIEW_W) * 100}% ${(r / VIEW_H) * 100}% at ${cx}% ${cy}%, rgba(8,4,20,0) 0%, rgba(8,4,20,0.15) 50%, rgba(8,4,20,0.72) 100%)`;
          dark.style.opacity = '1';
        } else {
          dark.style.opacity = '0';
        }
      }

      // Roofs: clear the one over the building the hero is standing in.
      const indoors = buildingInside(z, Math.floor(player.pos.x / TILE), Math.floor(player.pos.y / TILE));
      for (const r of roofs) {
        const target = indoors?.id === r.b.id ? 0 : 1;
        if (r.opacity === target) continue;
        const step = Math.min(1, dt * ROOF_FADE);
        r.opacity = Math.abs(target - r.opacity) < 0.02 ? target : r.opacity + (target - r.opacity) * step;
        for (const part of r.parts) part.opacity = r.opacity;
      }

      // Ember pads along behind the hero with a friendly bounce.
      const trail = k.vec2(
        player.pos.x - lastDir.x * 26,
        player.pos.y - lastDir.y * 26 + 8 + Math.sin(k.time() * 4) * 2,
      );
      const emberGap = Math.hypot(trail.x - ember.pos.x, trail.y - ember.pos.y);
      ember.pos = ember.pos.lerp(trail, Math.min(1, dt * 5));
      if (emberView) {
        // Ember faces the way the hero is heading and walks while catching up.
        const f = facingFor(lastDir.x, lastDir.y, 'down');
        const want = animFor(f, emberGap > 4, emberView.anims);
        if (want !== emberAnim) {
          emberAnim = want;
          emberSprite.play(want);
        }
        if (f === 'side') emberSprite.flipX = lastDir.x < 0;
      }

      // Open gates / opened chests update live (flag set while overlay open).
      for (const [id, sprites] of gateSprites) {
        if (flagsRef.current[gateFlag(id)]) {
          for (const sprite of sprites) sprite.destroy();
          gateSprites.delete(id);
        }
      }
      for (const [id, sprite] of chestSprites) {
        if (chestsRef.current.includes(id) && sprite.exists()) {
          (sprite as unknown as { frame: number }).frame = PROP_FRAME.chestOpen;
          chestSprites.delete(id);
        }
      }

      // Zone exits.
      const cellX = Math.floor(player.pos.x / TILE);
      const cellY = Math.floor(player.pos.y / TILE);
      const exit = z.exits.find((e) => e.x === cellX && e.y === cellY);
      if (exit) {
        triggered = true;
        const side = exitSide(exit.x, exit.y, cols, rows);
        const reduceMotion =
          typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (side && !reduceMotion) {
          // Snapshot the outgoing screen (the canvas keeps its last frame) for
          // the slide, then switch zones underneath it.
          slidingRef.current = true;
          setSlide({ src: k.screenshot(), side, from: zoneId, running: false });
        }
        cbRef.current.onExit(exit.to, exit.spawnX, exit.spawnY);
        return;
      }

      // Persist position lazily while walking (local write-through is cheap).
      if (dx !== 0 || dy !== 0) {
        moveSaveTimer += dt;
        if (moveSaveTimer > 1.5) {
          moveSaveTimer = 0;
          cbRef.current.onMove(player.pos.x, player.pos.y);
        }
      }
    });

    return () => {
      // Drop this zone's update loop; the next build calls destroyAll().
      loop.cancel();
    };
    // Rebuild only on zone / ember / Spire-floor change; the rest is read
    // through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, emberStage, spireFloor]);

  // Slide transforms: the new screen starts one viewport away (`slideFrom`)
  // and the snapshot of the old one leaves by the same amount the other way.
  const v = slide ? slideFrom(slide.side) : { x: 0, y: 0 };
  const shift = (f: number) => `translate(${v.x * f * 100}%, ${v.y * f * 100}%)`;
  const motion = slide?.running ? `transform ${SLIDE_MS}ms linear` : 'none';

  return (
    // Fills the parent's width; the 11:7 box keeps the viewport's aspect ratio.
    // KaPlay sizes its <canvas> to a fixed 704×448 — `!w-full/!h-full` (with
    // `!`, since KaPlay uses inline styles) upscales it to fill, kept crisp by
    // `imageRendering: pixelated`. Internal render resolution is unchanged.
    <div
      className="relative w-full rounded-lg shadow-2xl border-2 border-white/20 overflow-hidden"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, imageRendering: 'pixelated' }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 [&>canvas]:!block [&>canvas]:!w-full [&>canvas]:!h-full"
        style={{ transform: slide && !slide.running ? shift(1) : 'none', transition: motion }}
      />
      {/* Spire candle-light (#74): updated per frame from the game loop. */}
      <div ref={darkRef} aria-hidden className="absolute inset-0 pointer-events-none" style={{ opacity: 0 }} />
      {slide && (
        <img
          src={slide.src}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: slide.running ? shift(-1) : 'none',
            transition: motion,
            imageRendering: 'pixelated',
          }}
        />
      )}
    </div>
  );
}
