import { useCallback, useEffect, useRef, useState } from 'react';
import kaplay from 'kaplay';
import type { MutableRefObject } from 'react';
import {
  TILE,
  VIEW_COLS,
  VIEW_ROWS,
  WALKABLE_CHARS,
  SEA_CHARS,
  ZONES,
  buildingAt,
  buildingInside,
  darkAt,
  fogAt,
  fogLifted,
  fogSeenFlag,
  chestTopicAt,
  pathTargetId,
  gateFlag,
  gateIdAt,
  litFlag,
  npcPresent,
  safeSpawn,
  tileAt,
  zone,
  type BuildingDef,
  type FogDef,
  type NpcPlacement,
} from '../../content/zones';
import { bossDefeated } from '../../content/keys';
import { secretAt, secretFlag } from '../../content/secrets';
import { NPC_DEFS, npcSpriteId } from '../../content/npcs';
import { spawnPlaced } from '../../content/enemies';
import { BASE_TIER, DANGER, mapLabel } from '../../content/regions';
import { EMBER_SPRITES, EMBER_MAP_SIZE, EMBER_SPRITE_IDS, type EmberStage } from '../../content/story';
import type { Avatar, BattleEnemy, BoatSpot, PathTarget, Topic, ZoneId } from '../../types';
import { BOAT_SPEED, canLand, seaCrossing } from '../../lib/travel';
import { ensureBlendSheets, loadWorldSprites, worldFace } from './worldSprites';
import { resolveSprite } from '../../content/sprites';
import { animFor, facingFor, type Facing } from '../../lib/facing';
import { camAxis, worldView } from '../../lib/camera';
import { FOG_OVERHANG, fogPuffs, placesInside, puffAt, revealOpacity, type FogPuff } from '../../lib/fog';
import { floorZone, SPIRE_FLOOR_MAPS, type SpireTheme } from '../../content/spire';
import { FADE_MS, SLIDE_MS, exitSide, needsArrivalLock, slideFrom, transitionFor, type ExitSide } from '../../lib/transition';
import {
  BOAT_FRAME,
  BOAT_KEY,
  OVERWORLD_FRAME,
  OVERWORLD_KEY,
  FOG_PUFF_KEY,
  PROPS_KEY,
  PROP_FRAME,
  ROOF_KEY,
  SPIRE_KEY,
  SPIRE_PROPS_KEY,
  SPIRE_PROP_FRAME,
  STAIRS_FRAME,
  STAIRS_KEY,
  TILE_FRAME,
  TOWN_FRAME,
  WATER_FPS,
  blendKey,
  namedTilesetKey,
  roofFrame,
  tilesetKey,
  townKey,
} from '../../content/tiles';
import {
  BLEND_OPS_PER_CORNER,
  NO_BLEND,
  NO_OVERLAY,
  WATER,
  blendLayer,
  blendsEdges,
  terrainLayers,
  visibleRange,
  waterFrame,
} from '../../lib/terrain';
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
/** Seconds after closing an overlay before bumps can trigger again. */
const TRIGGER_COOLDOWN = 0.8;
/** A dark place's circle of light (px): unlit — a few steps around you — and lit by Glow (#75 item 9). */
const DIM_RADIUS = 80;
const LIT_RADIUS = 330;
/** Critters fade to this while Calm is on, so you can see they'll let you pass. */
const CALM_OPACITY = 0.45;
/**
 * Critter level labels draw on their plates above characters (z 6) — but
 * under fog (z 8), which must keep hiding what's behind it, and the hero (z 10).
 */
const LABEL_Z = 7;
const LABEL_PLATE_OPACITY = 0.85;
/** Seconds after Calm wears off before a critter you're touching starts a battle. */
const CALM_GRACE = 1.5;
/**
 * Pitch dark (#75 item 9) as stacked layers, inset from the rectangle's edge
 * (px): a soft three-step rim around an opaque core, so on a dim floor (#75
 * item 10) it reads as darkness rather than a hole in the map.
 */
const PITCH_FEATHER = [
  { inset: 0, alpha: 0.35 },
  { inset: 10, alpha: 0.45 },
  { inset: 20, alpha: 0.6 },
  { inset: 30, alpha: 1 },
];
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
  /** Found a hidden secret (bumped its scenery or stepped on its spot). */
  onSecret?: (id: string) => void;
  /** Bumped a bank of the fog of Forgetting (#75) — show why it won't let you pass. */
  onFog?: (hint: string, id: string) => void;
  /** A lifted fog bank starts clearing on screen (#75 item 7): say what it uncovered. */
  onFogLift?: (fog: FogDef) => void;
  /** …and has been watched clearing: remember that, so it plays once. */
  onFogRevealed?: (id: string) => void;
  /** Bumped the pitch dark of an unlit dark place (#75 item 9). */
  onDark?: () => void;
  /** The whole seconds of Calm left changed (0 = it has worn off). */
  onCalmTick?: (secondsLeft: number) => void;
  /** Climbed into Marlow's boat (#75 item 14), now at (x, y) px on the sea. */
  onBoard?: (x: number, y: number) => void;
  /** Went ashore at (x, y) px, leaving the boat moored at `boat` (tiles). */
  onLand?: (boat: { x: number; y: number }, x: number, y: number) => void;
  /** Arrived "aboard" somewhere with no sea under them (a repainted map): back on foot. */
  onAshore?: () => void;
}

/** A Return (#75 item 9) waiting to be flown: where to, and the landing cell. */
export interface Travel {
  to: ZoneId;
  x: number;
  y: number;
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
  skillLevels,
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
  travelRef,
  calmRef,
  boat = null,
  aboard = false,
}: {
  zoneId: ZoneId;
  avatar: Avatar;
  age: number;
  /** The player's question level per topic — sets each enemy's level (spawnEnemy). */
  skillLevels: Partial<Record<Topic, number>>;
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
  /**
   * Field spells (#75 item 9): a Return to fly once the world is running
   * again (the menu sets it; the loop takes it and fades away)…
   */
  travelRef?: MutableRefObject<Travel | null>;
  /** …and the seconds of Calm left, counted down here while the world runs. */
  calmRef?: MutableRefObject<number>;
  /** Marlow's boat (#75 item 14): where it's moored, if it is (any map — drawn when it's this one)… */
  boat?: BoatSpot | null;
  /** …and whether the hero is sailing it (read when the zone builds; the canvas keeps it after). */
  aboard?: boolean;
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

  // --- Fade into / out of a place (#75 Phase 1) -------------------------------
  // Walking onto a town / cave / shrine on the overworld (or back out of one)
  // dips to black: a snapshot of the old screen darkens, the new zone builds
  // underneath, then the black lifts. The hero is frozen throughout. Each step
  // waits for the black overlay's own transition to finish (`onFadeStep`), not
  // a timer — on a slow device a timer could drop the snapshot before the
  // screen is black and the new zone would pop in.
  const [fade, setFade] = useState<{ src: string; dark: boolean; shown: boolean } | null>(null);
  const fadeStarted = !!fade;
  const endFade = useCallback(() => {
    slidingRef.current = false;
    setFade(null);
  }, []);
  useEffect(() => {
    if (!fadeStarted) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setFade((f) => (f ? { ...f, dark: true } : f)));
    });
    // Safety net: never leave the hero frozen if a transition event is lost.
    const safety = setTimeout(endFade, FADE_MS * 6);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [fadeStarted, endFade]);
  /** The black overlay finished a transition: black reached → lift it; lifted → done. */
  const onFadeStep = () => {
    if (!fade) return;
    if (fade.dark) setFade({ ...fade, shown: false, dark: false });
    else endFade();
  };
  // After a fade (or a reduced-motion cut) the hero arrives standing still and
  // waits for the movement keys to be let go — otherwise a held key could walk
  // you straight back out of an exit right beside where you land.
  const arrivalLockRef = useRef(false);

  const kRef = useRef<ReturnType<typeof kaplay> | null>(null);
  // Re-running the scene effect for every prop change would rebuild the
  // world mid-walk; the latest callbacks/flags are read through refs instead.
  const cbRef = useRef(callbacks);
  const flagsRef = useRef(flags);
  const chestsRef = useRef(openedChests);
  const brokenRef = useRef(spireBroken);
  const lightRef = useRef(spireLight);
  const darkRef = useRef<HTMLDivElement>(null);
  const boatRef = useRef(boat);
  const aboardRef = useRef(aboard);
  useEffect(() => {
    boatRef.current = boat;
    aboardRef.current = aboard;
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
  // Fresh presses — any key (not auto-repeats), click or tap, the d-pad
  // included: a fog reveal skips on one.
  const pressesRef = useRef(0);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!e.repeat) pressesRef.current += 1;
      const key = e.key.toLowerCase();
      if (!MOVE_KEYS.has(key)) return;
      e.preventDefault(); // stop arrow keys from scrolling the page
      keysRef.current.add(key);
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    const point = () => {
      pressesRef.current += 1;
    };
    // Releasing focus (alt-tab, devtools) could otherwise leave a key "stuck".
    const clear = () => keysRef.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('pointerdown', point);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('pointerdown', point);
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

    // --- Terrain (overworld Phase 0, #75) ------------------------------------
    // Ground / path / water / building tiles and the scenery / flower / exit
    // overlays are worked out once per build (`lib/terrain.ts`) and painted by
    // ONE object that draws only the cells in view each frame. The old
    // one-KaPlay-object-per-tile approach cost grew with the map (~0.5 fps on
    // a 160×112 map with a throttled CPU); this stays flat. Water animates
    // from the clock.
    const tiles = z.tileset ? namedTilesetKey(z.tileset) : tilesetKey(zoneId);
    const layers = terrainLayers(z);
    // Rounded coasts / beaches / road edges (#71b): tiles on the corners where
    // terrain meets, drawn between the base tiles and the overlays.
    const blend = blendsEdges(z) ? blendLayer(z) : null;
    const blendSprite = blendKey(zoneId);
    if (blend) ensureBlendSheets(k, z);
    // Until this zone's blend sheet has loaded, draw plain square edges: the
    // corner tiles would be skipped, and the cells they cover (a one-tile road
    // is all such cells) would vanish.
    let blendReady = false;
    const sheetKeys = layers.sheets.map((s) => (s === 'zone' ? tiles : s === 'overworld' ? OVERWORLD_KEY : townKey(s)));
    const builtAt = k.time();
    // The camera's view in world pixels — larger than the canvas if it's ever
    // zoomed out, so culling and edge clamping never assume a 1:1 camera.
    const view = () => worldView(VIEW_W, VIEW_H, k.getCamScale());
    k.add([
      k.pos(0, 0),
      k.z(-50),
      {
        id: 'terrain',
        draw() {
          const cam = k.getCamPos();
          const v = view();
          const r = visibleRange(cam.x, cam.y, v.w, v.h, cols, rows, TILE);
          const water = waterFrame(k.time() - builtAt, WATER_FPS);
          if (blend && !blendReady) blendReady = k.getSprite(blendSprite)?.loaded === true;
          // Base tiles, one sheet at a time so same-texture quads batch.
          for (let s = 0; s < sheetKeys.length; s++) {
            for (let y = r.y0; y < r.y1; y++) {
              for (let x = r.x0; x < r.x1; x++) {
                const i = y * cols + x;
                if (layers.baseSheet[i] !== s || (blendReady && blend?.hidden[i])) continue;
                const f = layers.baseFrame[i];
                k.drawSprite({ sprite: sheetKeys[s], frame: f === WATER ? water : f, pos: k.vec2(x * TILE, y * TILE) });
              }
            }
          }
          // Edge blending: one tile centred on each corner where terrain meets.
          if (blend && blendReady) {
            const secondWater = water !== TILE_FRAME.water[0];
            for (let vy = r.y0; vy <= r.y1; vy++) {
              for (let vx = r.x0; vx <= r.x1; vx++) {
                const o = (vy * blend.vcols + vx) * BLEND_OPS_PER_CORNER;
                if (blend.ops[o] === NO_BLEND) continue;
                const pos = k.vec2(vx * TILE - TILE / 2, vy * TILE - TILE / 2);
                for (let j = o; j < o + BLEND_OPS_PER_CORNER && blend.ops[j] !== NO_BLEND; j++) {
                  const frame = blend.ops[j] + (secondWater ? blend.waterStep[j] : 0);
                  k.drawSprite({ sprite: blendSprite, frame, pos });
                }
              }
            }
          }
          // Scenery / flower / exit / mountain overlays on top, again by sheet.
          for (let s = 0; s < sheetKeys.length; s++) {
            for (let y = r.y0; y < r.y1; y++) {
              for (let x = r.x0; x < r.x1; x++) {
                const i = y * cols + x;
                const f = layers.overFrame[i];
                if (f === NO_OVERLAY || layers.overSheet[i] !== s) continue;
                k.drawSprite({ sprite: sheetKeys[s], frame: f, pos: k.vec2(x * TILE, y * TILE) });
              }
            }
          }
        },
      },
    ]);

    // --- Props: the few tiles that change or animate on their own -----------
    // (save crystals, chests, gates, Spire seals / stairs / throne) stay live
    // objects on top of the terrain.
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
        if (ch === 'S') {
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
        } else if (ch === '>' || ch === '<') {
          // Dungeon stairs (#75 item 10): an exit to the floor below / above.
          k.add([k.sprite(STAIRS_KEY, { frame: STAIRS_FRAME[ch] }), k.pos(px, py), k.z(-10)]);
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

    // --- Secrets: a faint twinkle marks each one not yet found ----------
    // Drawn under the roofs (z 12 < 15), so indoor secrets only show inside.
    const twinkles = new Map<string, { opacity: number; destroy: () => void }>();
    for (const sec of z.secrets ?? []) {
      if (flagsRef.current[secretFlag(sec.id)]) continue;
      const t = k.add([
        k.text('✦', { size: 12 }),
        k.pos(sec.x * TILE + TILE - 7, sec.y * TILE + 7),
        k.anchor('center'),
        k.color(255, 250, 200),
        k.opacity(0),
        k.z(12),
      ]);
      twinkles.set(sec.id, t as unknown as { opacity: number; destroy: () => void });
    }

    // --- Overworld places (#75 Phase 1): an icon + name on each 'P' tile ------
    // Walking onto one is a zone exit (see `exits`); this just draws it.
    // Each place's pieces (and how opaque each is normally) are kept, so a
    // place inside a fog bank can hide behind it and fade in as it lifts.
    type Faded = { opacity: number };
    const placeParts = new Map<string, { obj: Faded; opacity: number }[]>();
    for (const p of z.places ?? []) {
      const cx = p.x * TILE + TILE / 2;
      const cy = p.y * TILE + TILE / 2;
      const parts: { obj: Faded; opacity: number }[] = [];
      if (p.icon === 'tower') {
        // The Spire is the landmark: the tall tower sprite, base on its tile.
        // Drawn under fog (z 8): hidden in its ring of clouds until they lift.
        const tower = k.add([k.sprite(SPIRE_KEY), k.pos(cx, cy - 16), k.anchor('center'), k.opacity(1), k.z(7)]);
        parts.push({ obj: tower as unknown as Faded, opacity: 1 });
      } else {
        const icon = k.add([
          k.sprite(OVERWORLD_KEY, { frame: OVERWORLD_FRAME.icon[p.icon] }),
          k.pos(cx, cy),
          k.anchor('center'),
          k.opacity(1),
          k.z(-10),
        ]);
        parts.push({ obj: icon as unknown as Faded, opacity: 1 });
      }
      // Same size as building names (they name somewhere you can go in, too).
      const name = k.add([
        k.text(p.name, { size: 11 }),
        k.pos(cx, cy + 24),
        k.anchor('center'),
        k.color(255, 252, 235),
        k.opacity(1),
        k.z(13),
      ]) as unknown as Faded & { width?: number; height?: number };
      const plate = k.add([
        k.rect((name.width ?? p.name.length * 7) + 8, (name.height ?? 12) + 4, { radius: 3 }),
        k.pos(cx, cy + 24),
        k.anchor('center'),
        k.color(20, 16, 36),
        k.opacity(0.55),
        k.z(12),
      ]);
      parts.push({ obj: name, opacity: 1 }, { obj: plate as unknown as Faded, opacity: 0.55 });
      placeParts.set(`${p.x},${p.y}`, parts);
    }

    // --- Fog of Forgetting (#75): drifting banks that lift for good ---------
    // Each bank is a cluster of soft puffs that overlap past its edge (round,
    // wispy outline) and drift around each other (`lib/fog.ts`); collision is
    // still the bank's rectangle (`fogAt`). A bank stays on screen until its
    // lifting has been shown (item 7): one that lifted while you were away
    // clears in front of you when you arrive.
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    type PuffObj = {
      pos: { x: number; y: number };
      scale: { x: number; y: number };
      opacity: number;
      hidden: boolean;
      destroy: () => void;
    };
    type Bank = {
      def: FogDef;
      puffs: { p: FogPuff; obj: PuffObj }[];
      centre: { x: number; y: number };
      /** 0 → 1 while it lifts on screen. */
      lift: number;
      shown: boolean;
      /** Off screen: its puffs are hidden and not moved (they're many). */
      offscreen: boolean;
      /** Places inside the bank (the Spire in its ring): hidden until it lifts. */
      hides: { obj: Faded; opacity: number }[];
    };
    const fogBanks: Bank[] = [];
    const lifted = (f: FogDef) => fogLifted(f, flagsRef.current);
    for (const f of z.fogs ?? []) {
      if (lifted(f) && flagsRef.current[fogSeenFlag(f.id)]) continue;
      const puffs = fogPuffs(f).map((p) => ({
        p,
        obj: k.add([
          k.sprite(FOG_PUFF_KEY, { frame: p.frame }),
          k.pos(p.x, p.y),
          k.anchor('center'),
          k.scale(p.scale),
          k.opacity(p.opacity),
          k.z(8),
        ]) as unknown as PuffObj,
      }));
      fogBanks.push({
        def: f,
        puffs,
        centre: { x: (f.x + f.w / 2) * TILE, y: (f.y + f.h / 2) * TILE },
        lift: 0,
        shown: false,
        offscreen: false,
        hides: placesInside(f, z.places ?? []).flatMap((p) => placeParts.get(`${p.x},${p.y}`) ?? []),
      });
      // Hidden from the first frame (the drift updater keeps it that way).
      for (const h of fogBanks[fogBanks.length - 1].hides) h.obj.opacity = 0;
    }
    if (fogBanks.length) {
      // One updater drifts every puff (an object, so it goes with the scene).
      // It runs while the world is paused too: fog keeps drifting behind a menu.
      k.add([k.pos(0, 0)]).onUpdate(() => {
        const t = k.time();
        const cam = k.getCamPos();
        const v = view();
        for (const bank of fogBanks) {
          // A place hidden in the bank fades in only as the clouds clear.
          const seen = bank.puffs.length === 0 ? 1 : revealOpacity(bank.lift);
          for (const h of bank.hides) h.obj.opacity = h.opacity * seen;
          // Skip a bank that's off screen (with room for its drifting puffs,
          // and a tile more since the camera may move after this runs).
          const f = bank.def;
          const m = FOG_OVERHANG + TILE;
          const off =
            (f.x + f.w) * TILE + m < cam.x - v.w / 2 ||
            f.x * TILE - m > cam.x + v.w / 2 ||
            (f.y + f.h) * TILE + m < cam.y - v.h / 2 ||
            f.y * TILE - m > cam.y + v.h / 2;
          if (off !== bank.offscreen) {
            bank.offscreen = off;
            for (const { obj } of bank.puffs) obj.hidden = off;
          }
          if (off) continue;
          for (const { p, obj } of bank.puffs) {
            const at = puffAt(p, t, bank.lift, bank.centre, reducedMotion);
            obj.pos.x = at.x;
            obj.pos.y = at.y;
            obj.scale.x = at.scale;
            obj.scale.y = at.scale;
            obj.opacity = at.opacity;
          }
        }
      });
    }

    // --- Buildings (#72): signs + roofs ---------------------------------
    // Outside, a roof hides every row but the facade so the building reads as
    // enclosed; stepping inside fades that building's roof (and name) away.
    // Each roof is one object drawing its nine-slice tiles (not one per tile).
    type Fader = { opacity: number };
    const roofs: { b: BuildingDef; parts: Fader[]; opacity: number }[] = [];
    for (const b of z.buildings ?? []) {
      const roofRows = b.h - 1; // the facade row stays visible
      const cells: { frame: number; pos: ReturnType<typeof k.vec2> }[] = [];
      for (let ry = 0; ry < roofRows; ry++) {
        for (let rx = 0; rx < b.w; rx++) {
          cells.push({ frame: roofFrame(b.roof, rx, ry, b.w, roofRows), pos: k.vec2((b.x + rx) * TILE, (b.y + ry) * TILE) });
        }
      }
      const roof: Fader = { opacity: 1 };
      k.add([
        k.pos(0, 0),
        k.z(15),
        {
          id: 'roof',
          draw() {
            if (roof.opacity <= 0) return;
            for (const c of cells) k.drawSprite({ sprite: ROOF_KEY, frame: c.frame, pos: c.pos, opacity: roof.opacity });
          },
        },
      ]);
      const label = k.add([
        k.text(b.name, { size: 11 }),
        k.pos((b.x + b.w / 2) * TILE, (b.y + roofRows / 2) * TILE),
        k.anchor('center'),
        k.color(255, 248, 225),
        k.opacity(1),
        k.z(16),
      ]) as unknown as Fader;
      roofs.push({ b, parts: [roof, label], opacity: 1 });
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
    // A fog bank is clearing on screen (#75 item 7): the world holds still.
    let cinematic = false;

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
        if (pausedRef.current || triggered || cinematic) return;
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
          hitBox(c.x, c.y, WANDER_WALL_HALF, true) ||
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

    /** Puts an NPC in the world; `remove()` takes them out again. */
    function spawnNpc(p: NpcPlacement): { remove: () => void } {
      const def = NPC_DEFS[p.defId];
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      // All visual pieces move together when the NPC wanders.
      const parts: Part[] = [];
      const pieces: { destroy: () => void }[] = [];
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
        pieces.push(token);
      }
      const face = worldFace(k, { spriteId, emoji: def.sprite, x: px, y: py, size: 22 })
        .obj as unknown as WorldActor;
      parts.push(face);
      pieces.push(face);
      const label = k.add([
        k.text(def.name, { size: 10 }),
        k.pos(px, py + 24),
        k.anchor('center'),
        k.color(255, 255, 255),
      ]);
      parts.push(label as unknown as Part);
      pieces.push(label);
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
      return {
        remove: () => {
          const i = actors.indexOf(actor);
          if (i >= 0) actors.splice(i, 1);
          for (const piece of pieces) piece.destroy();
        },
      };
    }
    // Most NPCs simply stand in the world. A few come and go with the story
    // (#75 item 8: Elder Lumen greets a new hero on the plaza, then keeps the
    // Library); the main loop keeps those in step with the flags.
    const comings = z.npcs
      .filter((p) => p.ifFlag || p.unlessFlag)
      .map((p) => ({ p, here: null as { remove: () => void } | null }));
    for (const p of z.npcs) if (!p.ifFlag && !p.unlessFlag) spawnNpc(p);
    for (const c of comings) if (npcPresent(c.p, flagsRef.current)) c.here = spawnNpc(c.p);

    const critters: { obj: { opacity: number }; opacity: number }[] = [];
    for (const p of z.enemies) {
      const enemy = spawnPlaced(zoneId, p, age, skillLevels);
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
      // The level is its questions'; "!" marks and a warmer colour say how hard it fights (#75 item 12).
      // It sits on a dark plate like a place name's, above every character (they're z 6), so the
      // warm colours read on any ground and a passing critter never hides another's marks.
      const labelText = mapLabel(enemy.level, enemy.isBoss, enemy.tier);
      const labelY = py + (enemy.isBoss ? 32 : 26);
      const label = k.add([
        k.text(labelText, { size: 11 }),
        k.pos(px, labelY),
        k.anchor('center'),
        k.color(...DANGER[enemy.tier ?? BASE_TIER].mapColor),
        k.z(LABEL_Z + 0.5),
      ]) as unknown as Part & { width?: number; height?: number };
      const labelPlate = k.add([
        k.rect((label.width ?? labelText.length * 7) + 8, (label.height ?? 12) + 4, { radius: 3 }),
        k.pos(px, labelY),
        k.anchor('center'),
        k.color(20, 16, 36),
        k.opacity(LABEL_PLATE_OPACITY),
        k.z(LABEL_Z),
      ]) as unknown as Part;
      parts.push(label, labelPlate);
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
        // Regular critters roam their patch (slightly wider leash than NPCs),
        // and fade while Calm is on (#75 item 9).
        for (const part of parts) {
          const base = part === labelPlate ? LABEL_PLATE_OPACITY : 1;
          if (part !== labelPlate) (part as unknown as { use: (c: unknown) => void }).use(k.opacity(1));
          critters.push({ obj: part as unknown as { opacity: number }, opacity: base });
        }
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
      // He stands guard in front of the throne (his idle anim does the rest).
      worldFace(k, { spriteId: 'umbra', emoji: '🌑', x: ux, y: uy, size: 56, z: 6 });
      actors.push({ x: ux, y: uy, kind: 'umbra', radius: ACTOR_RADIUS.giant });
    }

    // --- Player ------------------------------------------------------------
    // A saved position that no longer fits the map (e.g. a save from before a
    // zone was redrawn) falls back to the zone spawn instead of a wall.
    // In Marlow's boat (#75 item 14) the hero spawns afloat — on open sea.
    const spawn = safeSpawn(z, startPos, flagsRef.current, aboardRef.current ? 'boat' : 'foot');
    let aboard =
      aboardRef.current && SEA_CHARS.has(tileAt(z, Math.floor(spawn.x / TILE), Math.floor(spawn.y / TILE)));
    if (aboardRef.current && !aboard) cbRef.current.onAshore?.();
    const followCam = (x: number, y: number) => {
      const v = view();
      k.setCamPos(camAxis(x, W, v.w), camAxis(y, H, v.h));
    };
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

    // --- Marlow's boat (#75 item 14) ---------------------------------------
    // One sprite: moored at its spot when that's on this map, under the hero
    // while they sail, hidden otherwise. Bump it to climb in; sail into a
    // beach or a dock to go ashore, leaving it moored where you were.
    const mooredHere = (): { x: number; y: number } | null => {
      const b = boatRef.current;
      return !aboard && b && b.zoneId === zoneId ? { x: b.x, y: b.y } : null;
    };
    let mooring = mooredHere();
    type BoatPart = { pos: { x: number; y: number }; frame: number; flipX: boolean; opacity: number };
    const boatPart = (z: number) =>
      k.add([k.sprite(BOAT_KEY, { frame: 0 }), k.pos(spawn.x, spawn.y), k.anchor('center'), k.opacity(0), k.z(z)]) as unknown as BoatPart;
    // The boat under the hero (z 9), and the front of its hull over them (z 11)
    // so they sit in it rather than stand on it.
    const boatSprite = boatPart(9);
    const hullFront = boatPart(11);
    const placeBoat = () => {
      const bob = Math.sin(k.time() * 2.2) * 1.5;
      const f = Math.floor(k.time() * 1.6) % 2;
      boatSprite.frame = BOAT_FRAME.whole[f];
      hullFront.frame = BOAT_FRAME.hullFront[f];
      if (aboard) {
        boatSprite.opacity = hullFront.opacity = 1;
        boatSprite.pos = hullFront.pos = k.vec2(player.pos.x, player.pos.y + 7 + bob);
        if (lastDir.x !== 0) boatSprite.flipX = hullFront.flipX = lastDir.x < 0;
      } else if (mooring) {
        boatSprite.opacity = 1;
        hullFront.opacity = 0;
        boatSprite.pos = k.vec2(mooring.x * TILE + TILE / 2, mooring.y * TILE + TILE / 2 + 4 + bob);
      } else {
        boatSprite.opacity = hullFront.opacity = 0;
      }
    };

    // --- Collision ---------------------------------------------------------
    const isOpenGate = (x: number, y: number) =>
      flagsRef.current[gateFlag(gateIdAt(zoneId, z.map, x, y))] === true;

    /**
     * What blocks the cell, if anything. Hidden passages block `strict` movers
     * (wanderers); afloat (#75 item 14) everything but open sea does.
     */
    function blockerAt(cx: number, cy: number, strict = false, afloat = false): { ch: string; x: number; y: number } | null {
      if (fogAt(z, cx, cy, flagsRef.current)) return { ch: 'fog', x: cx, y: cy };
      if (darkAt(z, cx, cy, flagsRef.current)) return { ch: 'dark', x: cx, y: cy };
      const ch = z.map[cy]?.[cx] ?? '#';
      if (afloat) return SEA_CHARS.has(ch) ? null : { ch, x: cx, y: cy };
      if (strict && ch === 'H') return { ch, x: cx, y: cy };
      if (WALKABLE_CHARS.has(ch)) return null;
      if (ch === 'G' && isOpenGate(cx, cy)) return null;
      return { ch, x: cx, y: cy };
    }

    /** Does a `half`-sized box centered at (px,py) overlap any blocked tile? */
    function hitBox(
      px: number,
      py: number,
      half: number,
      strict = false,
      afloat = false,
    ): { ch: string; x: number; y: number } | null {
      const corners: [number, number][] = [
        [px - half, py - half],
        [px + half, py - half],
        [px - half, py + half],
        [px + half, py + half],
      ];
      for (const [cx, cy] of corners) {
        const b = blockerAt(Math.floor(cx / TILE), Math.floor(cy / TILE), strict, afloat);
        if (b) return b;
      }
      return null;
    }

    const hitAt = (px: number, py: number) => hitBox(px, py, HALF);
    /** The hero's own collision: on foot, or afloat while in the boat (#75 item 14). */
    const heroHit = (px: number, py: number) => hitBox(px, py, HALF, false, aboard);

    // --- Fog reveal (#75 item 7) ------------------------------------------
    // A bank that has lifted but not been watched clearing gets a moment of
    // its own: the hero holds still, the camera glides to the fog, the fog
    // peels away (with a line saying what it uncovered), and the camera
    // glides back. Several banks play one after another. Reduced motion cuts
    // the camera instead of gliding.
    const PAN_S = reducedMotion ? 0 : 1.1;
    const LIFT_S = 1.6;
    // A bank hiding a place (the Spire) clears slowly, so it emerges gradually.
    const LIFT_HIDING_S = 3.2;
    const HOLD_S = 0.7;
    // A beat after arriving before the camera moves, so you see where you are first.
    let revealWait = 0.8;
    // …and never before the map and the fog are drawn: on a slow first load the
    // camera would otherwise glide over blank ground to fog that isn't there.
    let artReady = false;
    const artLoaded = () => [tiles, OVERWORLD_KEY, FOG_PUFF_KEY].every((key) => k.getSprite(key)?.loaded === true);
    type Reveal = {
      banks: (typeof fogBanks)[number][];
      i: number;
      phase: 'to' | 'lift' | 'hold' | 'back';
      t: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
      /** Presses so far when it started: a newer one skips it. */
      presses: number;
      /** "Tap or press a key to skip", pinned to the screen while it plays. */
      hint: { destroy: () => void }[];
    };
    let reveal: Reveal | null = null;
    const camFor = (x: number, y: number) => {
      const v = view();
      return { x: camAxis(x, W, v.w), y: camAxis(y, H, v.h) };
    };
    const camNow = () => {
      const c = k.getCamPos();
      return { x: c.x, y: c.y };
    };
    const bankCam = (f: FogDef) => camFor((f.x + f.w / 2) * TILE, (f.y + f.h / 2) * TILE);
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    /**
     * Skip the rest of a reveal: every bank left clears at once (the one in
     * view still says what it uncovered, if it hadn't yet) and is remembered
     * as seen, and the camera cuts back to the hero.
     */
    function skipReveal(r: Reveal) {
      for (let i = r.i; i < r.banks.length; i++) {
        const bank = r.banks[i];
        if (bank.shown) continue;
        if (i === r.i && r.phase === 'to') cbRef.current.onFogLift?.(bank.def);
        for (const { obj } of bank.puffs) obj.destroy();
        bank.puffs = [];
        bank.lift = 1;
        bank.shown = true;
        cbRef.current.onFogRevealed?.(bank.def.id);
      }
      const home = camFor(player.pos.x, player.pos.y);
      k.setCamPos(home.x, home.y);
    }
    /** The skip hint: a small pill at the top of the screen. */
    function skipHint(): { destroy: () => void }[] {
      const label = 'Tap or press a key to skip ⏩';
      const text = k.add([
        k.text(label, { size: 11 }),
        k.pos(VIEW_W / 2, 16),
        k.anchor('center'),
        k.color(255, 252, 235),
        k.fixed(),
        k.z(30),
      ]) as unknown as { width?: number; destroy: () => void };
      const pill = k.add([
        k.rect((text.width ?? label.length * 6) + 14, 20, { radius: 6 }),
        k.pos(VIEW_W / 2, 16),
        k.anchor('center'),
        k.color(20, 16, 36),
        k.opacity(0.6),
        k.fixed(),
        k.z(29),
      ]);
      return [text, pill];
    }

    /** Advance the reveal by `dt`; false once it's over. */
    function stepReveal(r: Reveal, dt: number): boolean {
      r.t += dt;
      const bank = r.banks[r.i];
      if (r.phase === 'to' || r.phase === 'back') {
        const u = PAN_S === 0 ? 1 : Math.min(1, r.t / PAN_S);
        const e = easeInOut(u);
        k.setCamPos(r.from.x + (r.to.x - r.from.x) * e, r.from.y + (r.to.y - r.from.y) * e);
        if (u < 1) return true;
        if (r.phase === 'back') return false;
        r.phase = 'lift';
        r.t = 0;
        cbRef.current.onFogLift?.(bank.def);
        return true;
      }
      if (r.phase === 'lift') {
        // The puffs spread out, rise and thin away (the drift updater draws it).
        bank.lift = Math.min(1, r.t / (bank.hides.length ? LIFT_HIDING_S : LIFT_S));
        if (bank.lift < 1) return true;
        for (const { obj } of bank.puffs) obj.destroy();
        bank.puffs = [];
        bank.shown = true;
        cbRef.current.onFogRevealed?.(bank.def.id);
        r.phase = 'hold';
        r.t = 0;
        return true;
      }
      // hold: let the kid see what was hiding, then on to the next bank or home.
      if (r.t < HOLD_S) return true;
      r.from = camNow();
      r.t = 0;
      if (r.i + 1 < r.banks.length) {
        r.i += 1;
        r.phase = 'to';
        r.to = bankCam(r.banks[r.i].def);
      } else {
        r.phase = 'back';
        r.to = camFor(player.pos.x, player.pos.y);
      }
      return true;
    }

    // --- Field spells (#75 item 9) -----------------------------------------
    // Pitch dark: solid black over the tunnels no light reaches, until Glow
    // lights the place for good — then it fades away. (The hero's circle of
    // light is the DOM overlay, drawn in the loop.)
    // Each rectangle is drawn as stepped layers (PITCH_FEATHER), so its edge
    // fades into the dim around it instead of showing as a hard black box.
    type Shade = { obj: { opacity: number; destroy: () => void }; base: number };
    const pitch: Shade[] =
      z.dark && !flagsRef.current[litFlag(zoneId)]
        ? z.dark.pitch.flatMap((r) => {
            // A small rectangle skips the inner layers; its innermost is still opaque.
            const fits = PITCH_FEATHER.filter(({ inset }) => r.w * TILE > 2 * inset && r.h * TILE > 2 * inset);
            return fits.map(({ inset, alpha }, i) => {
              const base = i === fits.length - 1 ? 1 : alpha;
              return {
                obj: k.add([
                  k.rect(r.w * TILE - 2 * inset, r.h * TILE - 2 * inset),
                  k.pos(r.x * TILE + inset, r.y * TILE + inset),
                  k.color(4, 2, 10),
                  k.opacity(base),
                  k.z(30),
                ]) as unknown as Shade['obj'],
                base,
              };
            });
          })
        : [];
    let pitchFade = 1;
    let calmShown = Math.ceil(calmRef?.current ?? 0);
    let critterOpacity = 1;

    // Darkness everywhere but a flickering circle of light round the hero:
    // the Spire's candle-light (#74), or a dark place (#75 item 9) — a few
    // steps' worth until Glow lights it, then the old lamps' wide glow.
    // Centred where the hero is on screen, so it follows a scrolled camera
    // (#78). Painted every frame — paused and mid-fade too, so a dark place
    // is dark as it fades in, and the next place isn't as it fades out.
    function paintDark() {
      const light = lightRef.current;
      const dark = darkRef.current;
      if (dark) {
        const flicker = Math.sin(k.time() * 7) * 3 + Math.sin(k.time() * 13) * 2;
        const lit = !!z.dark && flagsRef.current[litFlag(zoneId)] === true;
        // Spooky but readable for kids: the candle glow narrows per lost candle.
        const r = light
          ? 150 + 45 * Math.max(0, light.lives)
          : z.dark
            ? lit
              ? LIT_RADIUS
              : (z.dark.dim ?? DIM_RADIUS)
            : null;
        if (r !== null) {
          const at = k.toScreen(player.pos);
          const cx = (at.x / VIEW_W) * 100;
          const cy = (at.y / VIEW_H) * 100;
          // A dim floor (#75 item 10) is spooky, not black: its edge is lighter.
          // Elsewhere unlit is near-black, so a pitch doorway blends in (#102h).
          const edge = light ? 0.72 : lit ? 0.55 : z.dark?.dim ? 0.8 : 0.95;
          dark.style.background = `radial-gradient(ellipse ${((r + flicker) / VIEW_W) * 100}% ${((r + flicker) / VIEW_H) * 100}% at ${cx}% ${cy}%, rgba(8,4,20,0) 0%, rgba(8,4,20,0.15) 50%, rgba(8,4,20,${edge}) 100%)`;
          dark.style.opacity = '1';
        } else {
          dark.style.opacity = '0';
        }
      }
    }
    paintDark();
    placeBoat();

    // --- Main loop ---------------------------------------------------------
    let wasPaused = false;
    // Arrived by a fade or a cut: hold still until the movement keys are let go.
    let needsRelease = arrivalLockRef.current;
    arrivalLockRef.current = false;
    let cooldown = 0;
    let moveSaveTimer = 0;

    const loop = k.onUpdate(() => {
      paintDark();
      if (triggered) return;
      if (pausedRef.current || slidingRef.current) {
        // Pausing for a menu / dialogue / cutscene: save where the hero really
        // is. Walking only saves every 1.5 s, so otherwise the world map's star
        // (and a refresh) could be up to ~8 tiles behind. (Encounters save their
        // own step-back position and return above, via `triggered`.)
        if (!wasPaused && pausedRef.current) cbRef.current.onMove(player.pos.x, player.pos.y);
        wasPaused = true;
        return;
      }
      if (wasPaused) {
        wasPaused = false;
        cooldown = TRIGGER_COOLDOWN;
      }
      const dt = k.dt();
      cooldown = Math.max(0, cooldown - dt);

      if (!reveal) {
        const due = fogBanks.filter((b) => !b.shown && b.puffs.length > 0 && lifted(b.def));
        if (due.length && !artReady) artReady = artLoaded();
        revealWait = due.length && artReady ? revealWait - dt : 0.8;
        if (due.length && revealWait <= 0) {
          // Nearest first, so the camera never zig-zags across the map.
          const d = (b: (typeof due)[number]) =>
            Math.hypot((b.def.x + b.def.w / 2) * TILE - player.pos.x, (b.def.y + b.def.h / 2) * TILE - player.pos.y);
          due.sort((a, b) => d(a) - d(b));
          reveal = {
            banks: due,
            i: 0,
            phase: 'to',
            t: 0,
            from: camNow(),
            to: bankCam(due[0].def),
            presses: pressesRef.current,
            hint: skipHint(),
          };
          cinematic = true;
          if (heroView) {
            curAnim = animFor(heroFacing, false, heroView.anims);
            player.play(curAnim);
          }
        }
      }
      if (reveal) {
        // Skip on a fresh key press, click or tap (the d-pad too) — never on a
        // key or the d-pad already held when it began.
        if (pressesRef.current > reveal.presses) skipReveal(reveal);
        else if (stepReveal(reveal, dt)) return;
        for (const part of reveal.hint) part.destroy();
        reveal = null;
        cinematic = false;
        cooldown = TRIGGER_COOLDOWN;
        needsRelease = true; // a key held through the reveal doesn't walk off at once
      }

      // Return (#75 item 9): cast from the menu, flown once the world runs —
      // a fade to the town, landing just inside its door.
      const travel = travelRef?.current;
      if (travel && travelRef) {
        travelRef.current = null;
        // Flying off mid-voyage leaves the boat moored where it floats (the
        // screen saved that before setting the trip).
        if (aboard) {
          aboard = false;
          mooring = mooredHere();
        }
        if (travel.to === zoneId) {
          // Already here (the menu doesn't offer it): just step to the landing.
          player.pos = k.vec2(travel.x * TILE + TILE / 2, travel.y * TILE + TILE / 2);
          followCam(player.pos.x, player.pos.y);
          cbRef.current.onMove(player.pos.x, player.pos.y);
        } else {
          triggered = true;
          const reduceMotion =
            typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
          if (!reduceMotion) {
            slidingRef.current = true;
            setFade({ src: k.screenshot(), dark: false, shown: true });
          }
          arrivalLockRef.current = true;
          cbRef.current.onExit(travel.to, travel.x, travel.y);
          return;
        }
      }

      // Calm (#75 item 9) runs down only while the hero is free to walk.
      if (calmRef && calmRef.current > 0) {
        calmRef.current = Math.max(0, calmRef.current - dt);
        const whole = Math.ceil(calmRef.current);
        if (whole !== calmShown) {
          calmShown = whole;
          cbRef.current.onCalmTick?.(whole);
          // Worn off: a moment to step away from a critter you're standing on.
          if (whole === 0) cooldown = Math.max(cooldown, CALM_GRACE);
        }
      }
      const calm = (calmRef?.current ?? 0) > 0;
      const wantOpacity = calm ? CALM_OPACITY : 1;
      if (wantOpacity !== critterOpacity) {
        critterOpacity = wantOpacity;
        for (const c of critters) c.obj.opacity = c.opacity * wantOpacity;
      }

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
      if (needsRelease) {
        if (dx !== 0 || dy !== 0) {
          dx = 0;
          dy = 0;
        } else {
          needsRelease = false;
        }
      }

      if (dx !== 0 || dy !== 0) lastDir = { x: dx, y: dy };

      // Sitting in the boat, the hero doesn't walk — the boat does the moving.
      const moving = (dx !== 0 || dy !== 0) && !aboard;
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
      const speed = SPEED * (aboard ? BOAT_SPEED : 1);
      if (dx !== 0) {
        const nx = player.pos.x + dx * speed * dt;
        const hit = heroHit(nx, player.pos.y);
        if (!hit) player.pos.x = nx;
        else bumped = hit;
      }
      if (dy !== 0) {
        const ny = player.pos.y + dy * speed * dt;
        const hit = heroHit(player.pos.x, ny);
        if (!hit) player.pos.y = ny;
        else bumped = bumped ?? hit;
      }

      // Marlow's boat (#75 item 14): bump it to climb in; sail into a beach or
      // a dock to go ashore there, leaving it moored where it floats.
      if (bumped && cooldown === 0 && !aboard && mooring && bumped.x === mooring.x && bumped.y === mooring.y) {
        aboard = true;
        mooring = null;
        player.pos = k.vec2(bumped.x * TILE + TILE / 2, bumped.y * TILE + TILE / 2);
        cooldown = TRIGGER_COOLDOWN;
        cbRef.current.onBoard?.(player.pos.x, player.pos.y);
        bumped = null;
      } else if (bumped && cooldown === 0 && aboard && canLand(bumped.ch) && !fogAt(z, bumped.x, bumped.y, flagsRef.current)) {
        const at = { x: Math.floor(player.pos.x / TILE), y: Math.floor(player.pos.y / TILE) };
        aboard = false;
        mooring = at;
        player.pos = k.vec2(bumped.x * TILE + TILE / 2, bumped.y * TILE + TILE / 2);
        cooldown = TRIGGER_COOLDOWN;
        needsRelease = true; // don't sail straight back into the boat
        cbRef.current.onLand?.(at, player.pos.x, player.pos.y);
        bumped = null;
      }

      // Bump interactions (secret / gate / chest / save crystal).
      const bumpedSecret = bumped ? secretAt(z, bumped.x, bumped.y) : undefined;
      if (bumped && cooldown === 0) {
        if (bumpedSecret && !flagsRef.current[secretFlag(bumpedSecret.id)]) {
          cooldown = TRIGGER_COOLDOWN;
          cbRef.current.onMove(player.pos.x, player.pos.y);
          cbRef.current.onSecret?.(bumpedSecret.id);
        } else if (bumped.ch === 'G') {
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
            cbRef.current.onPath({ kind: 'chest', id, topic: chestTopicAt(z, bumped.x, bumped.y), zoneId });
          }
        } else if (bumped.ch === 'S') {
          cooldown = 2;
          cbRef.current.onSaveCrystal();
        } else if (bumped.ch === 'fog') {
          const fog = fogAt(z, bumped.x, bumped.y, flagsRef.current);
          cooldown = 2;
          if (fog) cbRef.current.onFog?.(fog.hint, fog.id);
        } else if (bumped.ch === 'dark') {
          cooldown = 2;
          cbRef.current.onDark?.();
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
          // Calm: roaming critters let the hero pass (bosses don't).
          if (calm && a.kind === 'enemy' && !a.enemy?.isBoss) continue;
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
      placeBoat();

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

      // Glow has lit this place: the pitch dark fades away.
      if (pitch.length && flagsRef.current[litFlag(zoneId)]) {
        pitchFade = Math.max(0, pitchFade - dt / 1.2);
        for (const shade of pitch) shade.obj.opacity = shade.base * pitchFade;
        if (pitchFade === 0) {
          for (const shade of pitch) shade.obj.destroy();
          pitch.length = 0;
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

      // NPCs who come and go with the story (a flag set in a conversation).
      for (const c of comings) {
        const present = npcPresent(c.p, flagsRef.current);
        if (present && !c.here) c.here = spawnNpc(c.p);
        else if (!present && c.here) {
          c.here.remove();
          c.here = null;
        }
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

      // Secrets: twinkle now and then; vanish once found.
      for (const [id, t] of twinkles) {
        if (flagsRef.current[secretFlag(id)]) {
          t.destroy();
          twinkles.delete(id);
          continue;
        }
        const phase = (k.time() + (id.length % 7) * 0.45) % 3.2;
        t.opacity = phase < 0.8 ? Math.sin((phase / 0.8) * Math.PI) * 0.9 : 0;
      }

      // Zone exits.
      const cellX = Math.floor(player.pos.x / TILE);
      const cellY = Math.floor(player.pos.y / TILE);
      // A secret on open ground is found by stepping onto its spot.
      const underfoot = secretAt(z, cellX, cellY);
      if (underfoot && cooldown === 0 && !flagsRef.current[secretFlag(underfoot.id)]) {
        cooldown = TRIGGER_COOLDOWN;
        cbRef.current.onMove(player.pos.x, player.pos.y);
        cbRef.current.onSecret?.(underfoot.id);
      }
      // Sailing off an edge onto the next stretch of sea (#75 item 14).
      const crossing = aboard ? seaCrossing(z, cellX, cellY, ZONES) : null;
      if (crossing) {
        triggered = true;
        const reduceMotion =
          typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
        if (transitionFor(crossing.side, z.kind, zone(crossing.to).kind, reduceMotion) === 'slide') {
          slidingRef.current = true;
          setSlide({ src: k.screenshot(), side: crossing.side, from: zoneId, running: false });
        }
        cbRef.current.onExit(crossing.to, crossing.x, crossing.y);
        return;
      }
      const exit = z.exits.find((e) => e.x === cellX && e.y === cellY);
      if (exit) {
        triggered = true;
        const side = exitSide(exit.x, exit.y, cols, rows);
        const reduceMotion =
          typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
        const toKind = zone(exit.to).kind;
        const how = transitionFor(side, z.kind, toKind, reduceMotion);
        // Snapshot the outgoing screen (the canvas keeps its last frame), then
        // switch zones underneath it.
        if (how === 'slide' && side) {
          slidingRef.current = true;
          setSlide({ src: k.screenshot(), side, from: zoneId, running: false });
        } else if (how === 'fade') {
          slidingRef.current = true;
          setFade({ src: k.screenshot(), dark: false, shown: true });
        }
        // Only where you land beside a way back out (places) — never between
        // edge-joined screens, even when reduced motion makes the slide a cut.
        if (needsArrivalLock(side, z.kind, toKind)) arrivalLockRef.current = true;
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
      {/* Spire candle-light (#74) / a dark place (#75 item 9): updated per frame from the game loop. */}
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
      {/* Fade into / out of a place (#75): old screen → black → new zone. */}
      {fade?.shown && (
        <img
          src={fade.src}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      {fade && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-black"
          style={{ opacity: fade.dark ? 1 : 0, transition: `opacity ${FADE_MS / 2}ms ease-in-out` }}
          onTransitionEnd={onFadeStep}
        />
      )}
    </div>
  );
}
