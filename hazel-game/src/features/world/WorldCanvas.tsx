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
  nearestCell,
  npcPresent,
  tileAt,
  zone,
  type BuildingDef,
  type FogDef,
  type NpcPlacement,
  type TravelMode,
} from '../../content/zones';
import { bossDefeated } from '../../content/keys';
import { reachPath, safeSpawn } from '../../lib/reach';
import { secretAt, secretFlag } from '../../content/secrets';
import { NPC_DEFS, isThing, npcEmoji, npcSpriteId } from '../../content/npcs';
import { habitatOf, spawnPlaced } from '../../content/enemies';
import { BASE_TIER, DANGER, mapLabel } from '../../content/regions';
import { EMBER_SPRITES, EMBER_MAP_SIZE, EMBER_SPRITE_IDS, type EmberStage } from '../../content/story';
import type { Avatar, BattleEnemy, BoatSpot, PathTarget, Topic, ZoneId } from '../../types';
import { canBoard, canFlyOver, canLand, edgeCrossing, landable, landingMooring, meetsHero, nearestSea, seaCrossing, travelSpeed } from '../../lib/travel';
import { canFly } from '../../content/story';
import { arrived, cameBack, dropCrumb, startEscort, stepEscort, stuckBehind, type EscortState } from '../../lib/escort';
import { contactRadius, graceOf, idleReach, meetFoe, restOf, standDown, staysDown, touching, type Rest } from '../../lib/encounter';
import {
  EMBER_COST,
  FOE_FACE,
  HERO_AFLOAT_BOX,
  HERO_BOX,
  HERO_COST,
  HERO_ROOM_COST,
  LEVEL_TEXT_PX,
  ZZ_PATHS,
  edgeBoxes,
  emberSpot,
  glyphBox,
  overlaps,
  patchBox,
  roofBoxes,
  zzPath,
  type Box,
  type Mark,
  type ZzPath,
} from '../../lib/sleepMark';
import { BOAT_REMOOR_REACH } from '../../content/boat';
import { ensureBlendSheets, loadWorldSprites, worldFace, worldKey } from './worldSprites';
import { resolveSprite } from '../../content/sprites';
import { animFor, facingFor, type Facing } from '../../lib/facing';
import { camAxis, worldView } from '../../lib/camera';
import { FOG_OVERHANG, fogPuffs, placesInside, puffAt, revealOpacity, type FogPuff } from '../../lib/fog';
import { floorZone, SPIRE_FLOOR_MAPS, type SpireTheme } from '../../content/spire';
import { FADE_MS, SLIDE_MS, exitSide, needsArrivalLock, slideFrom, transitionFor, type ExitSide } from '../../lib/transition';
import {
  BOAT_FRAME,
  BOAT_KEY,
  LIGHTHOUSE_KEY,
  LIGHTHOUSE_LAMP,
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
  nextWanderDir,
  clampToLeash,
  pickAmbientLine,
  approachBlocked,
  WANDER_TUNING,
  AMBIENT_TUNING,
  ACTOR_RADIUS,
  WANDER_WALL_HALF,
} from '../../lib/wander';
import {
  SCOOT_AFTER_S,
  SCOOT_SPEED,
  COUNTER_CHARS,
  TALK_REACH,
  acrossCounter,
  cornerTarget,
  inFront,
  isInteractKey,
  ownsKeys,
  probeDirs,
  probePoints,
  promptText,
  pushOn,
  pushTarget,
  scootPath,
  slideStep,
  type Dir,
  type Push,
} from '../../lib/interact';

/** Player hitbox half-size (smaller than a tile so corridors feel forgiving). */
const HALF = 11;
const SPEED = 170;
/** The canvas is one screen; larger maps scroll under a following camera. */
const VIEW_W = VIEW_COLS * TILE;
const VIEW_H = VIEW_ROWS * TILE;
/** Roof fade speed (per second) when the hero steps in / out of a building. */
const ROOF_FADE = 10;
/** How faint a place's name gets with the hero standing under it. */
const LABEL_UNDER_OPACITY = 0.2;
/** How much bigger than Ember her dark rim is drawn while flying. */
const EMBER_RIM = 1.1;
/** Seconds after closing an overlay before a bump (a secret, fog) can trigger again, or a critter beside you fight. */
const TRIGGER_COOLDOWN = 0.8;
/** Flying, Ember is drawn this much bigger, so she shows round the hero on her back (#75 item 15b review). */
const EMBER_FLY_SCALE = 1.7;
/** The "Space: Open chest" prompt over what the hero would use (#127): over everyone's bubbles (20–21), under nothing. */
const PROMPT_Z = 22;
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
/**
 * A sleeping critter (#114e) is drawn a little faded (less than under Calm,
 * so it's still seen), its level hidden, with a little "z" and "Z" rising from
 * its head and fading, over and over (held still under reduced motion) — by
 * the way up clear of everyone else's face and label (`zzPath`), so they read
 * as its own; drawn over the hero, Ember and the boat (`ZZ_Z`, under place
 * names and roofs). While they cross anyone after all (the hero, a villager
 * wandering by) they fade right down (`ZZ_CROSSING`) — by an awake critter
 * they hide, or it looks asleep — and with the hero standing on the sleeper
 * they hide: there's nothing of it to see.
 */
const SLEEP_OPACITY = 0.7;
const ZZ_Z = 11.5;
const ZZ_LOOP_S = 1.8;
const ZZ_CROSSING = 0.25;
/** How fast a letter eases to a new fade (per second), so a wanderer passing doesn't make it flicker. */
const ZZ_EASE = 8;
/** How near (px) a hero walking by a sleeper is when the "💤" hint shows. */
const SLEEPER_HINT_PX = 44;
/** The ripples under a sea critter (#75 item 14d): faint, so the critter reads first. */
const RIPPLE_OPACITY = 0.35;
/**
 * Seconds of cooldown as Calm wears off: a critter the hero is standing in
 * then lets them step away from it (`spared`) — walking on into it fights,
 * like any foe — and people and places wait it out.
 */
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
  /** Bumped a sleeping critter (`resting`, #114e): say how to wake it — true once said (once a scene). */
  onSleeper?: () => boolean;
  /** The whole seconds of Calm left changed (0 = it has worn off). */
  onCalmTick?: (secondsLeft: number) => void;
  /** Climbed into Marlow's boat (#75 item 14), now at (x, y) px on the sea. */
  onBoard?: (x: number, y: number) => void;
  /** Went ashore at (x, y) px, leaving the boat moored at `boat` (tiles). */
  onLand?: (boat: { x: number; y: number }, x: number, y: number) => void;
  /**
   * Arrived "aboard" somewhere with no open sea near them (a repainted map):
   * back on foot, the boat moored at `boat` (tiles) beside them — null if
   * there's no sea that close either.
   */
  onAshore?: (boat: { x: number; y: number } | null) => void;
  /** Ember took off with the hero (#75 item 15b) from (x, y) px. */
  onTakeOff?: (x: number, y: number) => void;
  /** Ember set the hero down at (x, y) px. */
  onTouchDown?: (x: number, y: number) => void;
  /** Asked to land where there's no open ground below. */
  onNoLanding?: () => void;
  /**
   * What pressing Space / Enter / ✋ would do now — "Open chest", "Talk" — or
   * null with nothing to use (#127); called when it changes, for the ✋ button.
   */
  onPrompt?: (label: string | null) => void;
  /**
   * An escort (#75 item 14g, Posy) has been waiting a moment: a critter is near
   * them. `near`: the hero walked away during this wait and has come back (say why now).
   */
  onEscortWait?: (near?: boolean) => boolean | void;
  /** …walks on again (the critter went): a "why she stopped" line is out of date. */
  onEscortGo?: () => void;
  /** …stops for a critter (again). */
  onEscortStop?: () => void;
  /** …the hero reached their goal without them. */
  onEscortBehind?: () => void;
  /** …moved on — where they stand now (px), kept so a battle mid-walk leaves them there. */
  onEscortMove?: (x: number, y: number) => void;
  /** …reached their goal. */
  onEscortArrive?: () => void;
}

/**
 * A walk under way here (#75 item 14g): who follows the hero, the cell they're
 * heading for, and where they last stood (a battle mid-walk), or null to start
 * where they wait.
 */
export interface EscortWalk {
  npcId: string;
  goal: { x: number; y: number };
  from: { x: number; y: number } | null;
}

/** A Return (#75 item 9) waiting to be flown: where to, and the landing cell. */
export interface Travel {
  to: ZoneId;
  x: number;
  y: number;
}

/**
 * Renders one zone of Lumina on a KaPlay canvas (#37, supersedes the #36
 * single-screen MVP). Tile-grid collision, press-to-use people / gates /
 * chests / crystals (#127 — they used to go off on a bump), walk-into enemies
 * to battle, edge exits between zones.
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
  actionRef,
  boat = null,
  aboard = false,
  flying = false,
  flightRef,
  escort = null,
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
  /** Presses of the on-screen ✋ button, counted by the parent (#127): each uses what the hero faces. */
  actionRef?: MutableRefObject<number>;
  /** Marlow's boat (#75 item 14): where it's moored, if it is (any map — drawn when it's this one)… */
  boat?: BoatSpot | null;
  /** …and whether the hero is sailing it (read when the zone builds; the canvas keeps it after). */
  aboard?: boolean;
  /** Flying on Ember (#75 item 15b) — read when the zone builds, like `aboard`. */
  flying?: boolean;
  /** 🐉 Fly / 🛬 Land from the HUD (#75 item 15b): taken by the loop once the world runs. */
  flightRef?: MutableRefObject<'fly' | 'land' | null>;
  /** An escort's walk under way here (#75 item 14g), read live. */
  escort?: EscortWalk | null;
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
  const flyingRef = useRef(flying);
  const escortRef = useRef(escort);
  useEffect(() => {
    escortRef.current = escort;
    boatRef.current = boat;
    aboardRef.current = aboard;
    flyingRef.current = flying;
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
  // Fresh presses of Space or Enter, and clicks or taps on the world (#127):
  // each uses what the hero faces. Counted only while the world runs and no
  // modal layer has made it inert (the level-up doesn't pause it) — the Enter
  // that closes a dialogue must not open it again — and never when a focused
  // button or field takes the key itself.
  const usesRef = useRef(0);
  // Where on the world the last click or tap landed, as a fraction of the view — a click on
  // someone (or a chest) uses them, if the hero can from where they stand.
  const clickRef = useRef<{ fx: number; fy: number } | null>(null);
  useEffect(() => {
    const worldLive = () => !pausedRef.current && !slidingRef.current && !containerRef.current?.closest('[inert]');
    const down = (e: KeyboardEvent) => {
      if (!e.repeat) pressesRef.current += 1;
      if (isInteractKey(e)) {
        if (e.repeat || ownsKeys(e.target) || !worldLive()) return;
        e.preventDefault(); // Space would scroll the page
        clickRef.current = null;
        usesRef.current += 1;
        return;
      }
      const key = e.key.toLowerCase();
      if (!MOVE_KEYS.has(key)) return;
      e.preventDefault(); // stop arrow keys from scrolling the page
      keysRef.current.add(key);
      // Walking, the keys are the world's: a button left focused (📜 Menu,
      // after closing it) would otherwise take the next Space for itself.
      const focused = document.activeElement;
      if (worldLive() && focused instanceof HTMLElement && focused.matches('button, a[href], [role="button"]')) focused.blur();
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
    // The parent's ref never changes.
  }, [pausedRef]);
  /** A click or tap on the world uses what the hero faces, as Space does (#127). */
  const onWorldPointer = (e: React.PointerEvent) => {
    if (e.button !== 0 || pausedRef.current || slidingRef.current) return;
    // The canvas itself, not the wrapper and its 2 px border.
    const r = (containerRef.current?.querySelector('canvas') ?? e.currentTarget).getBoundingClientRect();
    clickRef.current = r.width && r.height ? { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height } : null;
    usesRef.current += 1;
  };

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
      // KaPlay makes its canvas focusable (tabindex 0), and its key handler
      // swallows Tab — a keyboard player who landed on it could never Tab out.
      // Movement keys are read from `window`, so the canvas never needs focus
      // (#75 item 14b review).
      canvas.removeAttribute('tabindex');
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
    // `seen` is how far a fog bank in front has cleared (1 with none), `near`
    // fades a name off a hero standing under it (#75 item 15b review): the
    // fog updater and the main loop both write `opacity × seen × near`.
    type PlacePart = { obj: Faded; opacity: number; seen?: number; near?: number };
    const placeParts = new Map<string, PlacePart[]>();
    const placeLabels: { x: number; y: number; halfW: number; parts: PlacePart[] }[] = [];
    for (const p of z.places ?? []) {
      const cx = p.x * TILE + TILE / 2;
      const cy = p.y * TILE + TILE / 2;
      const parts: PlacePart[] = [];
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
      const label: PlacePart[] = [
        { obj: name, opacity: 1 },
        { obj: plate as unknown as Faded, opacity: 0.55 },
      ];
      parts.push(...label);
      placeParts.set(`${p.x},${p.y}`, parts);
      placeLabels.push({ x: cx, y: cy + 24, halfW: ((name.width ?? p.name.length * 7) + 8) / 2, parts: label });
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
      hides: PlacePart[];
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
      for (const h of fogBanks[fogBanks.length - 1].hides) {
        h.seen = 0;
        h.obj.opacity = 0;
      }
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
          for (const h of bank.hides) {
            h.seen = seen;
            h.obj.opacity = h.opacity * seen * (h.near ?? 1);
          }
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
      /** Where an enemy roams from (it rests by its home, `resting`). */
      home?: { x: number; y: number };
      /** Sprite pieces — moved together when a wanderer is pushed off the player. */
      parts?: { pos: WorldVec }[];
      /** Footprint radius (px) for actor↔actor overlap avoidance. */
      radius: number;
      /** How far (px) above its centre its head is — the "Space: Talk" prompt floats just over it (#127). */
      top?: number;
      /** Walking with the hero (#75 item 14g, an escort): never bumped into to talk. */
      follower?: boolean;
    }
    const actors: Actor[] = [];
    // People stepping out of the hero's way (#127): the cells' centres (px)
    // they're walking through, and how far along they are. A wanderer holds
    // its stroll meanwhile, then roams round where it stopped.
    const scoots = new Map<Actor, { path: { x: number; y: number }[]; i: number }>();
    /** A character's facing (`turn`, to a heading) and walk cycle or idle (`play`, `animFor`). */
    type Animator = { turn: (dx: number, dy: number) => void; play: (moving: boolean) => void };
    const animators = new Map<Actor, Animator>();
    /** A wanderer's leash, moved to wherever it stepped aside to. */
    const rehomes = new Map<Actor, (x: number, y: number) => void>();

    // Set true once a battle/exit fires; freezes all ambient motion too.
    // Declared here (not by the main loop) so wander controllers can read it.
    let triggered = false;
    // A fog bank is clearing on screen (#75 item 7): the world holds still.
    let cinematic = false;

    // --- Ambient life: wandering actors + idle speech bubbles --------------
    // Contact/collision reads each actor's live x/y every frame (see the main
    // loop below), so a wanderer only has to keep its x/y in lockstep with its
    // sprites. Pure decision math lives in `lib/wander.ts`; this closure wires
    // it to KaPlay (collision via the hoisted `hitBox`, freeze via `pausedRef`).
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
      /** How fast its walk cycle plays — a slow wanderer's slower, so it never treads water (#75 item 14f, Dawdle). */
      animSpeed?: number;
      /** A sea critter (#75 item 14d): it swims open sea only. */
      afloat?: boolean;
      /** Holds still while this says so — a resting critter is asleep (`resting`, #114e). */
      asleep?: () => boolean;
      /** A person (#127): never walks into the hero, who can't walk through them either. */
      avoidHero?: boolean;
    }
    /** Plays a sprite character's walk cycle / idle, facing its heading (4-way); emoji faces have none. */
    function makeAnimator(anchor: WorldActor, anims?: Record<string, unknown>, animSpeed?: number): Animator {
      const spr = anims ? (anchor as unknown as { play: (n: string) => void; flipX: boolean; animSpeed: number }) : null;
      if (spr && animSpeed) spr.animSpeed = animSpeed;
      let facing: Facing = 'down';
      let curAnim = '';
      return {
        turn(dx, dy) {
          facing = facingFor(dx, dy, facing);
          if (spr && facing === 'side') spr.flipX = dx < 0;
        },
        play(moving) {
          if (!spr || !anims) return;
          const want = animFor(facing, moving, anims);
          if (want === curAnim) return;
          curAnim = want;
          spr.play(want);
        },
      };
    }
    function attachWander(anchor: WorldActor, o: WanderOpts) {
      let dir = { x: 0, y: 0 };
      let timer = 0.3 + Math.random() * 1.2;
      // Blocked last step: wander the next one rather than steer home again —
      // the straight way home past a wall or the shore would stop it for good.
      let bumped = false;
      // Sprite wanderers play their walk cycle and face their heading (4-way).
      const anim = makeAnimator(anchor, o.anims, o.animSpeed);
      animators.set(o.actor, anim);
      const homeBuilding = buildingAt(z, Math.floor(o.homeX / TILE), Math.floor(o.homeY / TILE));
      const animate = (moving: boolean) => anim.play(moving);
      animate(false);
      // Stepped aside for the hero (#127): roam round where it stopped.
      rehomes.set(o.actor, (x, y) => {
        o.homeX = x;
        o.homeY = y;
        dir = { x: 0, y: 0 };
        timer = 0.7 + Math.random() * 1.6;
        bumped = false;
      });
      anchor.onUpdate(() => {
        if (pausedRef.current || triggered || cinematic || scoots.has(o.actor)) return;
        if (o.asleep?.()) {
          dir = { x: 0, y: 0 };
          animate(false);
          return;
        }
        const dt = k.dt();
        timer -= dt;
        if (timer <= 0) {
          // Steer back when near the leash edge; otherwise — or just blocked — wander freely.
          dir = nextWanderDir({ x: o.actor.x, y: o.actor.y, homeX: o.homeX, homeY: o.homeY, leash: o.leash, bumped }, Math.random);
          bumped = false;
          timer = dir.x || dir.y ? 0.6 + Math.random() : 0.7 + Math.random() * 1.6;
          anim.turn(dir.x, dir.y);
          animate(!!(dir.x || dir.y));
        }
        if (!dir.x && !dir.y) return;
        const nx = o.actor.x + dir.x * o.speed * dt;
        const ny = o.actor.y + dir.y * o.speed * dt;
        // Clamp to the leash first, then collision-test the *final* cell so a
        // steer-home/leash correction can never seat the sprite inside a wall.
        const c = clampToLeash(nx, ny, o.homeX, o.homeY, o.leash);
        // Walls (full sprite footprint) and every *other* character (other
        // wanderers, stationary NPCs, the boss, the Spire — not Ember, and the
        // hero only for people: critters walk into them to fight) block the
        // step; on a bump, stop and repick a direction.
        if (
          // A sea critter's whole box stays on open sea (#75 item 14d).
          hitBox(c.x, c.y, WANDER_WALL_HALF, true, o.afloat) ||
          // Townsfolk stay on their side of a building wall (no strolling in
          // or out of shops through the door).
          buildingAt(z, Math.floor(c.x / TILE), Math.floor(c.y / TILE)) !== homeBuilding ||
          (o.avoidHero && approachBlocked(o.actor.x, o.actor.y, c.x, c.y, player.pos.x, player.pos.y, o.actor.radius + HALF)) ||
          actors.some(
            (other) =>
              other !== o.actor &&
              approachBlocked(o.actor.x, o.actor.y, c.x, c.y, other.x, other.y, o.actor.radius + other.radius),
          )
        ) {
          dir = { x: 0, y: 0 };
          bumped = true;
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

    // A lighthouse (#75 item 14): the tower stands on its 2×2 rock and rises
    // two tiles above it — over anyone walking or sailing behind it, under
    // roofs and name plates. Its lamp pulses, glows, and sweeps two soft beams
    // round (held still under reduced motion).
    if (z.lighthouse) {
      const lx = (z.lighthouse.x + 1) * TILE; // the middle of the rock
      const ly = (z.lighthouse.y + 2) * TILE; // the rock's foot
      const tower = k.add([k.sprite(LIGHTHOUSE_KEY, { frame: 0 }), k.pos(lx, ly), k.anchor('bot'), k.z(14)]);
      if (!reducedMotion) (tower as unknown as { play: (n: string) => void }).play('shine');
      // The sprite is 2 tiles wide and 4 tall, anchored at its foot.
      const lamp = k.vec2(lx - TILE + LIGHTHOUSE_LAMP.x, ly - 4 * TILE + LIGHTHOUSE_LAMP.y);
      const BEAM = 3.5 * TILE;
      const SPREAD = 0.16;
      k.add([
        k.pos(0, 0),
        k.z(14.5),
        {
          id: 'lighthouse-light',
          draw() {
            const t = reducedMotion ? 0 : k.time();
            const turn = reducedMotion ? -0.6 : t * 0.7;
            for (const a of [turn, turn + Math.PI]) {
              const tip = (da: number) => k.vec2(lamp.x + Math.cos(a + da) * BEAM, lamp.y + Math.sin(a + da) * BEAM * 0.6);
              k.drawTriangle({ p1: lamp, p2: tip(-SPREAD), p3: tip(SPREAD), color: k.rgb(255, 244, 180), opacity: 0.18 });
            }
            const pulse = reducedMotion ? 0 : Math.sin(t * 3) * 0.06;
            k.drawCircle({ pos: lamp, radius: 15, color: k.rgb(255, 236, 150), opacity: 0.22 + pulse });
            k.drawCircle({ pos: lamp, radius: 8, color: k.rgb(255, 250, 210), opacity: 0.3 + pulse });
          },
        },
      ]);
    }

    // Everyone's face and label (a person's name, an enemy's level), round
    // where they stand: a sleeper's "z Z" rise clear of them (`zzPath`) and
    // fade while crossing them (#114e).
    const looks = new Map<Actor, { face: number; label: { dy: number; w: number; h: number } }>();
    /** Puts an NPC in the world (at `at` px, else its cell); `remove()` takes them out again. */
    function spawnNpc(
      p: NpcPlacement,
      at?: { x: number; y: number },
    ): { remove: () => void; actor: Actor; face: WorldActor; anims: Record<string, unknown> | undefined } {
      const def = NPC_DEFS[p.defId];
      const px = at?.x ?? p.x * TILE + TILE / 2;
      const py = at?.y ?? p.y * TILE + TILE / 2;
      // All visual pieces move together when the NPC wanders.
      const parts: Part[] = [];
      const pieces: { destroy: () => void }[] = [];
      const spriteId = npcSpriteId(def, flagsRef.current);
      const npcView = resolveSprite(spriteId, npcEmoji(def, flagsRef.current)).def?.world;
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
      const face = worldFace(k, { spriteId, emoji: npcEmoji(def, flagsRef.current), x: px, y: py, size: 22 })
        .obj as unknown as WorldActor;
      parts.push(face);
      pieces.push(face);
      // Under its feet: a sprite taller than a tile (Old Ringwood, #75 item 14f) pushes it down.
      const label = k.add([
        k.text(def.name, { size: 10 }),
        k.pos(px, py + 24 + Math.max(0, (npcView?.frameH ?? TILE) - TILE) / 2),
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
        top: (npcView?.frameH ?? TILE) / 2,
      };
      actors.push(actor);
      const nameW = (label as unknown as { width?: number }).width ?? def.name.length * 6;
      looks.set(actor, { face: 32, label: { dy: 24, w: nameW + 4, h: 12 } });
      // Pure-flavor villagers roam; services / quest-givers / story NPCs stay.
      if (npcWanders(def) && !at) {
        attachWander(face, {
          actor,
          parts,
          homeX: px,
          homeY: py,
          leash: TILE * WANDER_TUNING.npc.leashTiles,
          speed: WANDER_TUNING.npc.speed * (def.pace ?? 1),
          anims: npcView?.anims,
          animSpeed: def.pace,
          avoidHero: true,
        });
      } else {
        // Ready for stepping out of the hero's way (#127); untouched until then.
        animators.set(actor, makeAnimator(face, npcView?.anims));
      }
      if (def.ambient?.length) attachAmbient(face, def.ambient);
      return {
        actor,
        face,
        anims: npcView?.anims,
        remove: () => {
          const i = actors.indexOf(actor);
          if (i >= 0) actors.splice(i, 1);
          looks.delete(actor);
          scoots.delete(actor);
          animators.delete(actor);
          rehomes.delete(actor);
          for (const piece of pieces) piece.destroy();
        },
      };
    }
    // Most NPCs simply stand in the world. A few come and go with the story
    // (#75 item 8: Elder Lumen greets a new hero on the plaza, then keeps the
    // Library); the main loop keeps those in step with the flags.
    // Someone with a new face to come (#75 item 16a: Wisp) is kept in step too.
    const comesAndGoes = (p: NpcPlacement) => !!(p.ifFlag || p.unlessFlag || NPC_DEFS[p.defId].face);
    const lookOf = (p: NpcPlacement) => npcSpriteId(NPC_DEFS[p.defId], flagsRef.current);
    const comings = z.npcs
      .filter(comesAndGoes)
      .map((p) => ({ p, here: null as { remove: () => void; actor: Actor } | null, look: lookOf(p) }));
    for (const p of z.npcs) if (!comesAndGoes(p)) spawnNpc(p);
    // Someone walking with the hero (#75 item 14g) isn't also standing where they wait.
    const standsHere = (p: NpcPlacement) => npcPresent(p, flagsRef.current) && p.defId !== escortRef.current?.npcId;
    for (const c of comings) if (standsHere(c.p)) c.here = spawnNpc(c.p);

    // An escort walking with the hero (#75 item 14g): drawn like anyone else,
    // moved by the main loop, a worried "!" over them while they wait.
    type Follower = { remove: () => void; place: (at: { x: number; y: number }, dx: number, dy: number, waiting: boolean) => void };
    function spawnFollower(defId: string, at: { x: number; y: number }): Follower {
      const here = spawnNpc({ defId, x: Math.floor(at.x / TILE), y: Math.floor(at.y / TILE) }, at);
      here.actor.follower = true;
      // Big enough to see on a phone (the map shrinks to ~0.4×): an orange "!" on a light bubble — not a dark plate like a critter's level (#75 item 14g reviews).
      type Mark = { pos: WorldVec; opacity: number; destroy: () => void };
      const plate = k.add([k.rect(22, 28, { radius: 6 }), k.pos(at.x, at.y - 36), k.anchor('center'), k.color(255, 250, 235), k.outline(2, k.rgb(240, 150, 40)), k.opacity(0), k.z(21)]) as unknown as Mark;
      const bang = k.add([k.text('!', { size: 24 }), k.pos(at.x, at.y - 36), k.anchor('center'), k.color(225, 110, 20), k.opacity(0), k.z(22)]) as unknown as Mark;
      const spr = here.anims ? (here.face as unknown as { play: (n: string) => void; flipX: boolean }) : null;
      let facing: Facing = 'down';
      let anim = '';
      return {
        remove: () => {
          here.remove();
          plate.destroy();
          bang.destroy();
        },
        place: (to, dx, dy, waiting) => {
          const mx = to.x - here.actor.x;
          const my = to.y - here.actor.y;
          here.actor.x = to.x;
          here.actor.y = to.y;
          for (const part of here.actor.parts ?? []) {
            part.pos.x += mx;
            part.pos.y += my;
          }
          const bob = reducedMotion ? 0 : Math.sin(k.time() * 6) * 2;
          plate.pos = bang.pos = k.vec2(to.x, to.y - 36 + bob);
          plate.opacity = waiting ? 0.9 : 0;
          bang.opacity = waiting ? 1 : 0;
          if (!spr || !here.anims) return;
          const moving = Math.hypot(dx, dy) > 0.01;
          facing = facingFor(dx, dy, facing);
          if (facing === 'side' && dx !== 0) spr.flipX = dx < 0;
          const want = animFor(facing, moving, here.anims);
          if (want !== anim) {
            anim = want;
            spr.play(want);
          }
        },
      };
    }
    let follower: Follower | null = null;
    let escortState: EscortState | null = null;
    let escortArrived = false;
    let escortSaid = { x: -1e9, y: -1e9 };
    // How long they've been waiting this stop, and when the hero at the goal without them was last said.
    let escortWaitFor = 0;
    let escortBehindAt = -1e9;
    let escortWaitAskedAt = -1e9;
    let escortWentAway = false;
    let escortReroutedAt = '';

    // Each roaming critter's parts, with their own full opacity — faded under
    // Calm, and less while it sleeps (`resting`, #75 item 14d). Bosses never
    // fade: neither Calm nor resting lets the hero past one.
    const critters: { obj: { opacity: number }; opacity: number; actor: Actor }[] = [];
    // …and while it sleeps it holds still, its level hidden and "z Z" rising
    // from its head (`ZZ_Z`): a critter that lets you pass is asleep, not a
    // ghost (#114e).
    type Glyph = { pos: WorldVec; opacity: number; hidden: boolean };
    const sleepers: {
      level: { hidden: boolean }[];
      // Each letter in white over a dark shadow, for any ground.
      glyphs: { white: Glyph; shadow: Glyph }[];
      // How faded each letter is now (1 = not at all), eased (`ZZ_EASE`).
      fades: number[];
      path: ZzPath;
      actor: Actor;
    }[] = [];
    for (const p of z.enemies) {
      const enemy = spawnPlaced(zoneId, p, age, skillLevels);
      // Bosses stay gone once beaten (crystal restored / warden's key held);
      // regular enemies stay gone for the session (they respawn next visit).
      if (enemy.isBoss && bossDefeated(enemy, flagsRef.current)) continue;
      if (defeatedIds.includes(enemy.instanceId)) continue;
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      const enemyView = resolveSprite(enemy.spriteId, enemy.sprite).def?.world;
      const enemyHasSprite = !!enemyView;
      const parts: Part[] = [];
      // A sea critter (#75 item 14d) swims: a soft ring of ripples on the water under it.
      const afloat = habitatOf(enemy) === 'sea';
      const ripple = afloat
        ? (k.add([
            k.rect(28, 8, { radius: 4 }),
            k.pos(px, py + 11),
            k.anchor('center'),
            k.color(225, 245, 255),
            k.opacity(RIPPLE_OPACITY),
            k.z(5),
          ]) as unknown as Part)
        : null;
      if (ripple) parts.push(ripple);
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
        k.text(labelText, { size: LEVEL_TEXT_PX }),
        k.pos(px, labelY),
        k.anchor('center'),
        k.color(...DANGER[enemy.tier ?? BASE_TIER].mapColor),
        k.z(LABEL_Z + 0.5),
      ]) as unknown as Part & { width?: number; height?: number };
      const labelPlate = k.add([
        k.rect((label.width ?? labelText.length * 7) + 8, (label.height ?? LEVEL_TEXT_PX) + 4, { radius: 3 }),
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
        home: { x: px, y: py },
        parts,
        radius: enemy.isBoss ? ACTOR_RADIUS.boss : ACTOR_RADIUS.enemy,
      };
      actors.push(actor);
      const plate = labelPlate as unknown as { width: number; height: number };
      looks.set(actor, { face: enemy.isBoss ? 48 : 32, label: { dy: labelY - py, w: plate.width, h: plate.height } });
      if (!enemy.isBoss) {
        // Every part fades with the critter (`critters`).
        for (const part of parts) {
          const base = part === labelPlate ? LABEL_PLATE_OPACITY : part === ripple ? RIPPLE_OPACITY : 1;
          if (part !== labelPlate && part !== ripple) (part as unknown as { use: (c: unknown) => void }).use(k.opacity(1));
          critters.push({ obj: part as unknown as { opacity: number }, opacity: base, actor });
        }
        const letter = (text: string, size: number, color: [number, number, number], z: number) => {
          const o = k.add([k.text(text, { size }), k.pos(px, py), k.anchor('center'), k.color(...color), k.opacity(1), k.z(z)]) as unknown as Glyph;
          o.hidden = true;
          return o;
        };
        // Every way up has the same two letters; which one is picked below.
        sleepers.push({
          level: [label, labelPlate] as unknown as { hidden: boolean }[],
          glyphs: ZZ_PATHS[0].glyphs.map((g) => ({
            shadow: letter(g.text, g.size, [20, 16, 36], ZZ_Z),
            white: letter(g.text, g.size, [255, 255, 255], ZZ_Z + 0.1),
          })),
          fades: ZZ_PATHS[0].glyphs.map(() => 1),
          path: ZZ_PATHS[0],
          actor,
        });
      }
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
          afloat,
          asleep: () => resting.has(actor),
        });
      }
    }

    // A critter asleep (`resting`, below): its level is hidden.
    const asleepNow = (a: Actor) => !!a.enemy && !a.enemy.isBoss && resting.has(a);
    // Everyone's face but `who`'s, as points — an awake critter's weighs more: a letter by it could make it look asleep (#114e).
    const lookFaces = (who: Actor) =>
      [...looks.keys()].filter((a) => a !== who).map((a) => ({ x: a.x, y: a.y, weight: a.enemy && !asleepNow(a) ? FOE_FACE : 1 }));
    // Where everyone's face and shown label are now, and whose (#114e).
    const lookBoxes = (): (Box & { who: Actor; boss?: boolean; face?: boolean })[] =>
      [...looks].flatMap(([a, l]) => [
        { x: a.x, y: a.y, w: l.face, h: l.face, who: a, boss: a.enemy?.isBoss, face: true },
        ...(asleepNow(a) ? [] : [{ x: a.x, y: a.y + l.label.dy, w: l.label.w, h: l.label.h, who: a, boss: a.enemy?.isBoss }]),
      ]);

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
    // On Ember (#75 item 15b) the hero arrives in the air — only over a map she flies over.
    let flying = flyingRef.current && canFlyOver(z);
    const spawn = safeSpawn(z, startPos, flagsRef.current, flying ? 'ember' : aboardRef.current ? 'boat' : 'foot');
    // Asked to arrive flying where she can't fly: down on firm ground.
    if (flyingRef.current && !flying) cbRef.current.onTouchDown?.(spawn.x, spawn.y);
    // Arriving indoors — waking at an inn after a defeat or the walk home from
    // the Spire — the roof over you is off from the first frame, not faded
    // away once the world runs (it stays paused while the morning fades in).
    const startIndoors = buildingInside(z, Math.floor(spawn.x / TILE), Math.floor(spawn.y / TILE));
    for (const r of roofs) {
      if (startIndoors?.id !== r.b.id) continue;
      r.opacity = 0;
      for (const part of r.parts) part.opacity = 0;
    }
    let aboard =
      aboardRef.current && SEA_CHARS.has(tileAt(z, Math.floor(spawn.x / TILE), Math.floor(spawn.y / TILE)));
    // Couldn't stay afloat: ashore at the spawn, the boat on the sea nearest it.
    let ashoreMooring: { x: number; y: number } | null = null;
    if (aboardRef.current && !aboard) {
      const open = (x: number, y: number) => !fogAt(z, x, y, flagsRef.current);
      ashoreMooring = z.seaLinks?.length
        ? nearestSea(z, Math.floor(spawn.x / TILE), Math.floor(spawn.y / TILE), BOAT_REMOOR_REACH, open)
        : null;
      cbRef.current.onAshore?.(ashoreMooring);
    }
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
    // Enemies that could reach the hero standing where they start — back from
    // a Flee (the critter respawns at home, maybe right beside them), a
    // reload, an arrival, a neighbour's patch — rest: a critter falls asleep
    // ("z Z" rising from its head, a little faded, holding still) and like Calm lets the hero
    // pass, until the hero has left its patch; a boss, drawn as ever, only
    // holds back while they stand still, back away or step aside — it fights
    // if they head past it (`staysDown`, #114e). Only those that could fight
    // the hero as they travel now; landing or climbing aboard asks again, for
    // the new way of getting about, from where the hero is.
    const leash = TILE * WANDER_TUNING.enemy.leashTiles;
    const resting = new Map<Actor, Rest>();
    let restings = 0; // bumped on every change, so `fadeCritters` redraws
    /** The hero's box — with the boat round them when sailing. */
    const heroSize = () => (aboard ? HERO_AFLOAT_BOX : HERO_BOX);
    // The way the hero last went: Ember trails behind it (and the boat faces it).
    let lastDir = { x: 0, y: 1 };
    // Back beside a sleeper (a Flee, a reload, a landing), Ember starts — and
    // trails — on its far side, rather than over it (#114e): or, if that's
    // sea, rock, under a roof or on someone, on a side instead; else where she
    // trails anyway (`emberSpot`). The letters are planned round that spot.
    const emberStart = (hero: { x: number; y: number }) => {
      const near = sleepers
        .filter((s) => resting.has(s.actor))
        .sort((a, b) => Math.hypot(a.actor.x - hero.x, a.actor.y - hero.y) - Math.hypot(b.actor.x - hero.x, b.actor.y - hero.y))[0];
      const indoors = buildingInside(z, Math.floor(hero.x / TILE), Math.floor(hero.y / TILE));
      const ground = (x: number, y: number) => {
        const cx = Math.floor(x / TILE);
        const cy = Math.floor(y / TILE);
        const ch = tileAt(z, cx, cy);
        const roof = buildingAt(z, cx, cy);
        return (aboard ? SEA_CHARS.has(ch) : WALKABLE_CHARS.has(ch)) && !fogAt(z, cx, cy, flagsRef.current) && (!roof || roof.id === indoors?.id);
      };
      return emberSpot(hero, near?.actor ?? null, ground, lookBoxes(), lastDir);
    };
    // The lighthouse tower draws over everything round its rock, like a roof.
    const towerBox: Mark[] = z.lighthouse
      ? [{ x: (z.lighthouse.x + 1) * TILE, y: z.lighthouse.y * TILE, w: 2 * TILE, h: 4 * TILE }]
      : [];
    // Past the map's edges letters are cut off, so they're kept in, like from under a roof.
    const mapEdges = edgeBoxes(z.map[0].length, z.map.length, TILE);
    const restAround = (hero: { x: number; y: number }, mode: TravelMode) => {
      resting.clear();
      const foes = actors.flatMap((a) => (a.enemy && a.home && meetsHero(a.enemy.habitat, mode) ? [{ a, ...a.home }] : []));
      for (const f of standDown(foes, (f) => idleReach(f.a.enemy!, leash), hero)) {
        resting.set(f.a, restOf(f.a.enemy!, f.a.home!, hero, leash));
      }
      // Each sleeper's "z Z" take the way up that reads most surely as its own
      // (`zzPath`, #114e): clear of everyone else and of where awake critters
      // roam, with room round the hero and where Ember will stand, and nearer
      // its own face than theirs.
      const em = emberStart(hero).at;
      const inside = buildingInside(z, Math.floor(hero.x / TILE), Math.floor(hero.y / TILE));
      const crowd: (Mark & { who?: Actor })[] = [
        ...lookBoxes(),
        ...roofBoxes(z.buildings ?? [], inside?.id, TILE),
        ...towerBox,
        ...mapEdges,
        ...actors.flatMap((a) => (a.enemy && a.home && !a.enemy.isBoss && !resting.has(a) ? [patchBox(a.home, leash)] : [])),
        { x: hero.x, y: hero.y, ...heroSize(), weight: HERO_COST },
        { x: hero.x, y: hero.y, w: heroSize().w + 24, h: heroSize().h + 24, weight: HERO_ROOM_COST },
        { x: em.x, y: em.y, ...HERO_BOX, weight: EMBER_COST },
      ];
      for (const s of sleepers) {
        if (!resting.has(s.actor)) continue;
        const others = crowd.filter((o) => !('who' in o) || o.who !== s.actor);
        s.path = zzPath(s.actor, others, { faces: [...lookFaces(s.actor), hero, em], away: hero });
      }
      restings += 1;
    };
    restAround(spawn, flying ? 'ember' : aboard ? 'boat' : 'foot');
    // Faded critters let you pass: under Calm, and any asleep.
    let critterFade = '';
    const fadeCritters = (calm: boolean) => {
      const key = `${calm}|${restings}`;
      if (key === critterFade) return;
      critterFade = key;
      for (const c of critters) {
        c.obj.opacity = c.opacity * (resting.has(c.actor) ? SLEEP_OPACITY : calm ? CALM_OPACITY : 1);
      }
      for (const s of sleepers) {
        const asleep = resting.has(s.actor);
        for (const part of s.level) part.hidden = asleep;
        for (const { white, shadow } of s.glyphs) white.hidden = shadow.hidden = !asleep;
      }
    };
    // The letters rise and fade on a loop, each half a loop behind the other;
    // over anyone in `crowd` (the hero, Ember, everyone's face and label but
    // the sleeper's own), or nearer anyone's face than their own sleeper's,
    // they fade right down — by an awake critter (or a boss) they hide — so
    // they never read as someone else's; with the hero (or the boat) on the
    // sleeper they hide.
    const awake = (a?: Actor) => !!a?.enemy && !asleepNow(a);
    let zzClock = 0;
    const riseSleepMarks = (dt: number, crowd: () => (Box & { who?: Actor; face?: boolean })[]) => {
      zzClock += dt;
      let others: (Box & { who?: Actor; face?: boolean })[] | null = null;
      for (const s of sleepers) {
        if (!resting.has(s.actor)) continue;
        others ??= crowd();
        const under = touching(s.actor, player.pos, aboard ? 28 : 16);
        s.path.glyphs.forEach((g, i) => {
          const { white, shadow } = s.glyphs[i];
          const p = reducedMotion ? 0.5 : (zzClock / ZZ_LOOP_S + i / 2) % 1;
          const box = glyphBox(s.actor, g, s.path.drift, p);
          // Crossing someone, or nearer anyone's face than its own sleeper's,
          // it could read as theirs: faded right down — hidden by an awake critter.
          const own = Math.hypot(box.x - s.actor.x, box.y - s.actor.y);
          let fade = 1;
          for (const o of others!) {
            if (o.who === s.actor || !(overlaps(box, o) || (o.face && Math.hypot(box.x - o.x, box.y - o.y) < own))) continue;
            fade = awake(o.who) ? 0 : ZZ_CROSSING;
            if (fade === 0) break;
          }
          s.fades[i] += (fade - s.fades[i]) * Math.min(1, dt * ZZ_EASE);
          white.pos = k.vec2(box.x, box.y);
          shadow.pos = k.vec2(box.x + 1, box.y + 1);
          white.opacity = under ? 0 : (reducedMotion ? 1 : Math.sin(Math.PI * p)) * s.fades[i];
          shadow.opacity = white.opacity * 0.8;
        });
      }
    };
    const heroBox = () => ({ x: player.pos.x, y: player.pos.y, ...heroSize(), face: true });
    // From the first frame — even while the world waits (a level-up, a slide).
    fadeCritters((calmRef?.current ?? 0) > 0);
    riseSleepMarks(ZZ_LOOP_S / 4, () => [heroBox(), ...lookBoxes()]);

    // Ember trails the hero (no collision — dragons walk where they please),
    // starting clear of a sleeper (`emberStart`).
    const emberAt = emberStart(spawn);
    const ember = worldFace(k, {
      spriteId: EMBER_SPRITE_IDS[emberStage],
      emoji: EMBER_SPRITES[emberStage],
      x: emberAt.at.x,
      y: emberAt.at.y,
      size: EMBER_MAP_SIZE[emberStage],
      z: 9,
    }).obj as unknown as WorldActor;
    const emberView = resolveSprite(EMBER_SPRITE_IDS[emberStage], EMBER_SPRITES[emberStage]).def?.world ?? null;
    const emberSprite = ember as unknown as { play: (n: string) => void; flipX: boolean };
    // Flying, Ember is drawn bigger than the hero riding her (#75 item 15b review).
    (ember as unknown as { use: (c: unknown) => void }).use(k.scale(1));
    const emberScale = ember as unknown as { scale: WorldVec };
    // A dark rim round her while she flies, so a rider in red still reads as
    // sitting on a dragon at phone size (#75 item 15b review round 3).
    type Rim = { pos: WorldVec; scale: WorldVec; frame: number; flipX: boolean; hidden: boolean };
    const emberRim = emberView
      ? (k.add([
          k.sprite(worldKey(EMBER_SPRITE_IDS[emberStage])),
          k.pos(ember.pos),
          k.anchor('center'),
          k.scale(1),
          k.color(30, 16, 44),
          k.opacity(0.8),
          k.z(16.9),
        ]) as unknown as Rim)
      : null;
    if (emberRim) emberRim.hidden = true;
    let emberAnim = '';
    lastDir = emberAt.dir;

    // --- Marlow's boat (#75 item 14) ---------------------------------------
    // One sprite: moored at its spot when that's on this map, under the hero
    // while they sail, hidden otherwise. Bump it to climb in; sail into a
    // beach or a dock to go ashore, leaving it moored where you were.
    const mooredHere = (): { x: number; y: number } | null => {
      const b = boatRef.current;
      return !aboard && b && b.zoneId === zoneId ? { x: b.x, y: b.y } : null;
    };
    let mooring = ashoreMooring ?? mooredHere();
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

    /** The hero's own collision: on foot, or afloat while in the boat (#75 item 14). */
    const heroHit = (px: number, py: number) => {
      // Flying (#75 item 15b): only the map's edges stop Ember.
      if (flying) return px < HALF || py < HALF || px > cols * TILE - HALF || py > rows * TILE - HALF ? { ch: 'edge', x: -1, y: -1 } : null;
      return hitBox(px, py, HALF, false, aboard);
    };
    /** How far off the line (px) a corner can be clipped and still slid round. */
    const CORNER_SLIDE_PX = 4;
    // --- People are solid; things wait to be used (#127) -------------------
    // People (and the Spire, and Umbra) stop the hero like a wall — walking
    // into someone no longer talks to them — and everything the hero can use
    // waits for Space / Enter / a click or tap on the world / ✋, with a
    // "Space: Open chest" prompt over the thing they face.
    // An escort walking with the hero (#75 item 14g) is never in their way, nor talked to.
    const solid = (a: Actor) =>
      (a.kind === 'npc' ? !!a.npcId && !a.follower : a.kind === 'spire' || a.kind === 'umbra') && !scoots.has(a);
    /**
     * Who a step to (px, py) would walk into (`approachBlocked`: never stuck on
     * someone already overlapping). Never kept more than a tile off, so the
     * hero can always stand in the cell beside someone big (Umbra).
     */
    function personHit(px: number, py: number): Actor | null {
      if (flying) return null; // Ember flies over everyone
      for (const a of actors) {
        if (solid(a) && approachBlocked(player.pos.x, player.pos.y, px, py, a.x, a.y, Math.min(a.radius + HALF, TILE))) return a;
      }
      return null;
    }
    /**
     * Walking straight into a wall with an opening just to one side — a door,
     * a gate, a corridor a few pixels off — slide over into it (`cornerTarget`).
     * `at` is where the blocked step would have put the hero along `axis`;
     * never towards a hidden passage (`strict`), which would give it away.
     */
    function assistCorner(axis: 'x' | 'y', at: number, sign: number, max: number) {
      const p = player.pos;
      const line = Math.floor((at + sign * HALF) / TILE); // the column / row they walked into
      if (axis === 'x') {
        const t = cornerTarget(p.y, (row) => !blockerAt(line, row, true, aboard), TILE);
        const step = t === null ? 0 : slideStep(p.y, t, max);
        if (step && !heroHit(p.x, p.y + step) && !personHit(p.x, p.y + step)) p.y += step;
      } else {
        const t = cornerTarget(p.x, (col) => !blockerAt(col, line, true, aboard), TILE);
        const step = t === null ? 0 : slideStep(p.x, t, max);
        if (step && !heroHit(p.x + step, p.y) && !personHit(p.x + step, p.y)) p.x += step;
      }
    }

    /** Something the hero can use: what the prompt over it says, where it floats, and what using it does. */
    type Use = {
      label: string;
      at: { x: number; y: number };
      act: () => void;
      hit: (x: number, y: number) => boolean;
      /** Drawn faint: it can be pressed, but only says why not (landing over water). */
      faint?: boolean;
    };
    /** Is (x, y) on the cell (cx, cy)? */
    const onCell = (cx: number, cy: number) => (x: number, y: number) => Math.floor(x / TILE) === cx && Math.floor(y / TILE) === cy;
    /** Talking to someone — clicked on, or on the counter or desk between you (`via`). */
    const talkTo = (a: Actor, via?: { x: number; y: number }): Use => ({
      label: 'Talk',
      at: { x: a.x, y: a.y - (a.top ?? TILE / 2) - 10 },
      hit: (x, y) => Math.hypot(x - a.x, y - a.y) < 20 || (!!via && onCell(via.x, via.y)(x, y)),
      act: () => {
        arm(TRIGGER_COOLDOWN);
        cbRef.current.onMove(player.pos.x, player.pos.y);
        cbRef.current.onTalk(a.npcId!);
      },
    });
    /** Using a person, the Spire's door, Umbra. */
    function personUse(a: Actor): Use | null {
      if (a.kind === 'npc' && a.npcId) return talkTo(a);
      if (a.kind === 'spire') {
        return {
          label: 'Enter the Spire',
          at: { x: a.x, y: a.y - 56 }, // over the tower
          hit: (x, y) => Math.abs(x - a.x) < 18 && y > a.y - 48 && y < a.y + 18,
          act: () => {
            arm(TRIGGER_COOLDOWN);
            cbRef.current.onMove(player.pos.x, player.pos.y);
            cbRef.current.onSpire();
          },
        };
      }
      if (a.kind === 'umbra') {
        return {
          label: 'Face Umbra',
          at: { x: a.x, y: a.y - 40 },
          hit: (x, y) => Math.hypot(x - a.x, y - a.y) < 30,
          act: () => {
            arm(TRIGGER_COOLDOWN);
            cbRef.current.onUmbra?.();
          },
        };
      }
      return null;
    }
    /** Using the tile at (cx, cy): a chest, a gate, the save crystal, a Spire seal or its stairs, a shop counter. */
    function tileUse(cx: number, cy: number): Use | null {
      if (fogAt(z, cx, cy, flagsRef.current) || darkAt(z, cx, cy, flagsRef.current)) return null;
      const usable = (label: string, act: () => void): Use => ({ label, at: { x: cx * TILE + TILE / 2, y: cy * TILE - 6 }, act, hit: onCell(cx, cy) });
      const ch = tileAt(z, cx, cy);
      if (COUNTER_CHARS.has(ch)) {
        // Talk across a shop counter (#72), or a desk or table (#127), to whoever stands behind it.
        const people = actors.filter((a) => a.kind === 'npc' && a.npcId && !a.follower && !scoots.has(a));
        const i = acrossCounter({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 }, player.pos, people, TILE);
        return i >= 0 ? talkTo(people[i], { x: cx, y: cy }) : null;
      }
      switch (ch) {
        case 'C': {
          const id = pathTargetId(zoneId, 'chest', cx, cy);
          if (chestsRef.current.includes(id)) return null;
          return usable('Open chest', () => {
            arm(TRIGGER_COOLDOWN);
            cbRef.current.onPath({ kind: 'chest', id, topic: chestTopicAt(z, cx, cy), zoneId });
          });
        }
        case 'G': {
          if (isOpenGate(cx, cy)) return null;
          const id = gateIdAt(zoneId, z.map, cx, cy);
          // A warden-keyed Fiend gate checks a key instead of asking a question (#58).
          // Match on the gate group so either tile of a double-wide gate counts.
          const keyed = !!z.keyGate && gateIdAt(zoneId, z.map, z.keyGate.x, z.keyGate.y) === id;
          return usable(keyed ? 'Unlock gate' : 'Open gate', () => {
            arm(TRIGGER_COOLDOWN);
            cbRef.current.onPath({ kind: keyed ? 'keygate' : 'gate', id, topic: z.topic ?? 'math', zoneId });
          });
        }
        case 'S':
          return usable('Save game', () => {
            // A hero standing still isn't walked into for as long as "💎 Game
            // saved!" takes to read (~2.9 s, `toastMs`).
            arm(2, 3);
            cbRef.current.onSaveCrystal();
          });
        case 'Q': {
          // A rune seal on a Spire floor (#74): face its question.
          const id = `${cx},${cy}`;
          if (brokenRef.current.includes(id)) return null;
          return usable('Break seal', () => {
            arm(TRIGGER_COOLDOWN);
            cbRef.current.onWard?.(id);
          });
        }
        case 'U':
          return usable('Climb stairs', () => {
            arm(TRIGGER_COOLDOWN);
            cbRef.current.onStairs?.();
          });
      }
      return null;
    }
    /**
     * Everything the hero could use from where they stand, best first: what
     * they face — a person before a tile — then what's beside, then behind
     * them. Space uses the first; a click uses the one clicked on, if any.
     */
    function targetsNow(): Use[] {
      const hero = { x: player.pos.x, y: player.pos.y };
      const away = (a: Actor) => Math.hypot(a.x - hero.x, a.y - hero.y);
      const found: Use[] = [];
      for (const dir of probeDirs(lastDir)) {
        let near: Actor | null = null;
        for (const a of actors) {
          if (!solid(a) || !inFront(hero, a, dir, a.radius + HALF + TALK_REACH)) continue;
          if (!near || away(a) < away(near)) near = a;
        }
        const person = near ? personUse(near) : null;
        if (person) found.push(person);
        for (const p of probePoints(hero.x, hero.y, dir, HALF)) {
          const thing = tileUse(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
          if (thing) found.push(thing);
        }
      }
      return found;
    }

    // The prompt, rebuilt only when its words change (KaPlay measures text as it's made), kept on the map.
    const touchScreen = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
    type PromptPart = { pos: WorldVec; destroy: () => void };
    let prompt: { words: string; w: number; faint: boolean; parts: PromptPart[] } | null = null;
    // What ✋ was last told — unset at first, so a new scene always tells it (the last one's may be stale).
    let promptSaid: string | null | undefined;
    function showPrompt(use: Use | null) {
      const words = use ? promptText(use.label, touchScreen) : null;
      const faint = use?.faint === true;
      if (prompt && (prompt.words !== words || prompt.faint !== faint)) {
        for (const part of prompt.parts) part.destroy();
        prompt = null;
      }
      if (use && words) {
        if (!prompt) {
          const text = k.add([
            k.text(words, { size: 10 }),
            k.pos(0, 0),
            k.anchor('center'),
            k.color(45, 35, 65),
            k.opacity(faint ? 0.5 : 1),
            k.z(PROMPT_Z + 0.5),
          ]) as unknown as PromptPart & { width?: number; height?: number };
          const w = (text.width ?? words.length * 6) + 10;
          const pill = k.add([
            k.rect(w, (text.height ?? 11) + 6, { radius: 5 }),
            k.pos(0, 0),
            k.anchor('center'),
            k.color(255, 236, 160),
            k.outline(1, k.rgb(150, 110, 40)),
            k.opacity(faint ? 0.45 : 1),
            k.z(PROMPT_Z),
          ]) as unknown as PromptPart;
          prompt = { words, w, faint, parts: [pill, text] };
        }
        const bob = reducedMotion ? 0 : Math.sin(k.time() * 4) * 1.5;
        const x = Math.min(Math.max(use.at.x, prompt.w / 2 + 2), W - prompt.w / 2 - 2);
        const y = Math.max(use.at.y, 12) + bob;
        for (const part of prompt.parts) part.pos = k.vec2(x, y);
      }
      const said = use?.label ?? null;
      if (said !== promptSaid) {
        promptSaid = said;
        cbRef.current.onPrompt?.(said);
      }
    }

    /** Walked into someone long enough: they step a few cells out of the way, quickly (`scootPath`). */
    function scoot(a: Actor, push: Dir) {
      const cellOf = (x: number, y: number) => ({ x: Math.floor(x / TILE), y: Math.floor(y / TILE) });
      const at = player.pos;
      const heroCells = [-HALF, HALF].flatMap((ox) => [-HALF, HALF].map((oy) => cellOf(at.x + ox, at.y + oy)));
      const others = new Set(
        actors
          .filter((o) => o !== a)
          .map((o) => {
            const c = cellOf(o.x, o.y);
            return `${c.x},${c.y}`;
          }),
      );
      const path = scootPath(z, {
        from: cellOf(a.x, a.y),
        hero: cellOf(at.x, at.y),
        heroCells,
        push,
        flags: flagsRef.current,
        blocked: (x, y) => others.has(`${x},${y}`),
      });
      if (path) scoots.set(a, { path: path.map((c) => ({ x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 })), i: 0 });
    }
    /** Carry everyone stepping aside along their way; at its end a wanderer roams from there. */
    function stepScoots(dt: number) {
      for (const [a, s] of scoots) {
        let left = SCOOT_SPEED * dt;
        let mx = 0;
        let my = 0;
        while (left > 0 && s.i < s.path.length) {
          const gx = s.path[s.i].x - (a.x + mx);
          const gy = s.path[s.i].y - (a.y + my);
          const d = Math.hypot(gx, gy);
          if (d <= left) {
            mx += gx;
            my += gy;
            left -= d;
            s.i += 1;
          } else {
            mx += (gx / d) * left;
            my += (gy / d) * left;
            left = 0;
          }
        }
        a.x += mx;
        a.y += my;
        for (const part of a.parts ?? []) {
          part.pos.x += mx;
          part.pos.y += my;
        }
        const anim = animators.get(a);
        if (s.i < s.path.length) {
          if (mx || my) anim?.turn(mx, my);
          anim?.play(true);
        } else {
          scoots.delete(a);
          anim?.play(false);
          rehomes.get(a)?.(a.x, a.y);
        }
      }
    }

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
    // Critters that don't fight the hero while they're touching them, until
    // they step clear (never a boss, #114t): those touching the hero as a
    // cooldown is armed (`graceOf` — a menu closed, a chest, the save crystal,
    // a landing, Calm wearing off), and any that comes onto a hero standing
    // still while one runs (reading "💎 Game saved!") — even once it's over.
    const spared = new Set<Actor>();
    // …and none fights for the two frames after one's armed, while the menu,
    // talk or chest it came with takes the world's pause (a battle sent then
    // would be dropped, and the world would wait for it forever).
    let held = 0;
    // How long a hero standing still isn't walked into (`meetFoe`'s
    // `guarded`): the cooldown's length, or longer (the save crystal's toast).
    let guard = 0;
    // Never shortens one already running (a menu closed just after saving).
    const arm = (seconds: number, guardFor = seconds) => {
      cooldown = Math.max(cooldown, seconds);
      guard = Math.max(guard, guardFor);
      for (const a of graceOf(actors, player.pos)) spared.add(a);
      held = 2;
    };
    let sleeperHinted = false;
    let moveSaveTimer = 0;
    // Presses that use things (#127): the keyboard's and the world's, and the ✋ button's.
    const uses = () => usesRef.current + (actionRef?.current ?? 0);
    let usesSeen = uses();
    // Who the hero has been walking into, and for how long (`SCOOT_AFTER_S`).
    let push: Push<Actor> = null;

    // --- Flying on Ember (#75 item 15b) -------------------------------------
    // 🐉 Fly from the HUD lifts off anywhere on an overworld map once she can
    // fly; 🛬 Land (or Space / a tap / ✋ while flying) sets down on open ground
    // only. Flying, nothing is used, met or entered — only map edges stop her.
    const cellUnder = () => ({ x: Math.floor(player.pos.x / TILE), y: Math.floor(player.pos.y / TILE) });
    /**
     * Where Ember would set the hero down: the open ground below, else the
     * nearest open ground a step away — so flying onto a place's icon, or
     * just past the edge of a little plateau, still lands beside it (#75 item
     * 15b review). Null over water, mountains or fog.
     */
    const landingCell = () => {
      const c = cellUnder();
      const taken = (x: number, y: number) =>
        actors.some((a) => a.kind === 'npc' && !a.follower && Math.floor(a.x / TILE) === x && Math.floor(a.y / TILE) === y);
      const ok = (x: number, y: number) => landable(tileAt(z, x, y)) && !fogAt(z, x, y, flagsRef.current) && !taken(x, y);
      return ok(c.x, c.y) ? c : nearestCell(c.x, c.y, 1, ok);
    };
    function takeOff() {
      if (flying || aboard || !canFlyOver(z) || !canFly(flagsRef.current)) return;
      flying = true;
      push = null;
      // Nothing below can meet a flying hero, so nobody needs to sleep (as on arriving flying).
      resting.clear();
      cbRef.current.onTakeOff?.(player.pos.x, player.pos.y);
    }
    function touchDown() {
      if (!flying) return;
      const c = landingCell();
      if (!c) {
        cbRef.current.onNoLanding?.();
        return;
      }
      flying = false;
      player.pos = k.vec2(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2);
      arm(TRIGGER_COOLDOWN);
      needsRelease = true; // a held key doesn't walk off at once
      cbRef.current.onTouchDown?.(player.pos.x, player.pos.y);
      restAround(player.pos, 'foot');
      lastDir = emberStart(player.pos).dir;
    }
    /**
     * Flying: the one thing to "use" is the ground below, so ✋ always says
     * "Land here" (the HUD's 🛬 is "Land") — over water or mountains its
     * prompt is faint, and a press says why not (#75 item 15b reviews).
     */
    function landingUse(): Use[] {
      const faint = !landingCell();
      return [{ label: 'Land here', at: { x: player.pos.x, y: player.pos.y - 40 }, hit: () => true, act: touchDown, faint }];
    }
    // Her shadow on the ground while she flies.
    const shadow = k.add([
      k.rect(46, 14, { radius: 7 }),
      k.color(0, 0, 0),
      k.pos(spawn.x, spawn.y),
      k.anchor('center'),
      k.opacity(0),
      k.z(2.5),
    ]) as unknown as { pos: WorldVec; opacity: number };

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
        usesSeen = uses(); // a ✋ tapped mid-slide uses nothing
        clickRef.current = null;
        // …nor does an F / 🐉 pressed mid-slide fly on the next map (#75 item 15b review).
        // (A pause keeps it: "🐉 Let's fly!" closes the tutorial and asks at once.)
        if (slidingRef.current && flightRef) flightRef.current = null;
        showPrompt(null);
        push = null;
        return;
      }
      if (wasPaused) {
        wasPaused = false;
        arm(TRIGGER_COOLDOWN);
      }
      const dt = k.dt();
      cooldown = Math.max(0, cooldown - dt);
      guard = Math.max(0, guard - dt);

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
          showPrompt(null);
          push = null;
          if (heroView) {
            curAnim = animFor(heroFacing, false, heroView.anims);
            player.play(curAnim);
          }
        }
      }
      if (reveal) {
        // The F or 🐉 that skips a reveal skips it — it doesn't also fly or land.
        if (flightRef) flightRef.current = null;
        // Skip on a fresh key press, click or tap (the d-pad too) — never on a
        // key or the d-pad already held when it began.
        if (pressesRef.current > reveal.presses) skipReveal(reveal);
        else if (stepReveal(reveal, dt)) return;
        for (const part of reveal.hint) part.destroy();
        reveal = null;
        cinematic = false;
        arm(TRIGGER_COOLDOWN);
        needsRelease = true; // a key held through the reveal doesn't walk off at once
        usesSeen = uses(); // nor does the Space that skipped it use anything
        clickRef.current = null;
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
        flying = false; // Return lands you at the town
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
          if (whole === 0) arm(CALM_GRACE);
        }
      }
      // 🐉 Fly / 🛬 Land (#75 item 15b), asked for from the HUD (or Space, flying).
      const ask = flightRef?.current;
      if (ask && flightRef) {
        flightRef.current = null;
        if (ask === 'fly') takeOff();
        else touchDown();
      }

      const calm = (calmRef?.current ?? 0) > 0;
      fadeCritters(calm);
      riseSleepMarks(dt, () => [heroBox(), { x: ember.pos.x, y: ember.pos.y, ...HERO_BOX, face: true }, ...lookBoxes()]);

      // Standing still is not moving this frame — a thumb left on the d-pad
      // against a wall or the save crystal is still.
      const was = { x: player.pos.x, y: player.pos.y };
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
      const moving = (dx !== 0 || dy !== 0) && !aboard && !flying;
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

      // Axis-separated movement for wall sliding; remember what we bumped —
      // and who: people stop the hero too (#127). Walking straight into a
      // wall beside a doorway slides them over into it (`assistCorner`).
      let bumped: { ch: string; x: number; y: number } | null = null;
      let into: Actor | null = null;
      let intoDir: Dir = { x: 0, y: 0 };
      const speed = SPEED * travelSpeed(flying ? 'ember' : aboard ? 'boat' : 'foot');
      // Clipping a corner by a few px (walking straight past a building's corner,
      // a touch off the row) slides round it rather than stopping dead (#75 item 14g UX review).
      const slide = (tryAt: (o: number) => boolean) => {
        for (let o = 1; o <= CORNER_SLIDE_PX; o++) {
          for (const sgn of [1, -1]) if (tryAt(sgn * o)) return sgn * Math.min(o, speed * dt);
        }
        return 0;
      };
      if (dx !== 0) {
        const nx = player.pos.x + dx * speed * dt;
        const hit = heroHit(nx, player.pos.y);
        const who = hit ? null : personHit(nx, player.pos.y);
        if (!hit && !who) player.pos.x = nx;
        else if (hit) {
          const off = dy === 0 ? slide((o) => !heroHit(player.pos.x, player.pos.y + o) && !heroHit(nx, player.pos.y + o)) : 0;
          if (off) player.pos.y += off;
          else {
            bumped = hit;
            if (dy === 0) assistCorner('x', nx, Math.sign(dx), speed * dt);
          }
        } else {
          into = who;
          intoDir = { x: Math.sign(dx), y: 0 };
        }
      }
      if (dy !== 0) {
        const ny = player.pos.y + dy * speed * dt;
        const hit = heroHit(player.pos.x, ny);
        const who = hit ? null : personHit(player.pos.x, ny);
        if (!hit && !who) player.pos.y = ny;
        else if (hit) {
          const off = dx === 0 ? slide((o) => !heroHit(player.pos.x + o, player.pos.y) && !heroHit(player.pos.x + o, ny)) : 0;
          if (off) player.pos.x += off;
          else {
            bumped = bumped ?? hit;
            if (dx === 0) assistCorner('y', ny, Math.sign(dy), speed * dt);
          }
        } else if (!into) {
          into = who;
          intoDir = { x: 0, y: Math.sign(dy) };
        }
      }
      // Kept walking into someone in the way: they step aside (#127).
      // …never a thing (a quest board, a lantern, a signpost — 15c review).
      push = pushOn(push, pushTarget(into, (id) => isThing(NPC_DEFS[id])), dt);
      if (push && push.t >= SCOOT_AFTER_S) {
        scoot(push.who, intoDir);
        push = null;
      }
      stepScoots(dt);

      // Marlow's boat (#75 item 14): bump the water by it to climb in (from
      // beside it, corners too — `canBoard`); sail into a beach or a dock to
      // go ashore there, leaving it moored beside that shore (`landingMooring`
      // — never only corner to corner, where nobody could climb back in).
      const heroCell = { x: Math.floor(player.pos.x / TILE), y: Math.floor(player.pos.y / TILE) };
      const landAt =
        bumped && cooldown === 0 && aboard && canLand(bumped.ch) && !fogAt(z, bumped.x, bumped.y, flagsRef.current)
          ? landingMooring(z, heroCell, bumped, (x, y) => !fogAt(z, x, y, flagsRef.current))
          : null;
      if (bumped && cooldown === 0 && !aboard && mooring && SEA_CHARS.has(bumped.ch) && canBoard(heroCell, bumped, mooring)) {
        aboard = true;
        player.pos = k.vec2(mooring.x * TILE + TILE / 2, mooring.y * TILE + TILE / 2);
        mooring = null;
        arm(TRIGGER_COOLDOWN);
        cbRef.current.onBoard?.(player.pos.x, player.pos.y);
        restAround(player.pos, 'boat');
        lastDir = emberStart(player.pos).dir; // Ember goes where its letters were planned round
        bumped = null;
      } else if (bumped && landAt) {
        aboard = false;
        mooring = landAt;
        player.pos = k.vec2(bumped.x * TILE + TILE / 2, bumped.y * TILE + TILE / 2);
        arm(TRIGGER_COOLDOWN);
        needsRelease = true; // don't sail straight back into the boat
        cbRef.current.onLand?.(landAt, player.pos.x, player.pos.y);
        restAround(player.pos, 'foot');
        lastDir = emberStart(player.pos).dir;
        bumped = null;
      }

      // Bumps that still go off on their own: a secret found in the scenery,
      // and why fog or the dark won't let you on. (Chests, gates, the save
      // crystal and the rest wait to be used — below, #127.)
      const bumpedSecret = bumped ? secretAt(z, bumped.x, bumped.y) : undefined;
      if (bumped && cooldown === 0) {
        if (bumpedSecret && !flagsRef.current[secretFlag(bumpedSecret.id)]) {
          arm(TRIGGER_COOLDOWN);
          cbRef.current.onMove(player.pos.x, player.pos.y);
          cbRef.current.onSecret?.(bumpedSecret.id);
        } else if (bumped.ch === 'fog') {
          const fog = fogAt(z, bumped.x, bumped.y, flagsRef.current);
          arm(2);
          if (fog) cbRef.current.onFog?.(fog.hint, fog.id);
        } else if (bumped.ch === 'dark') {
          arm(2);
          cbRef.current.onDark?.();
        }
      }

      // Using things (#127): a fresh Space / Enter / click / tap / ✋ uses
      // what the hero faces — never in the two frames after something else
      // was armed, while its menu or talk takes the world's pause.
      // Flying (#75 item 15b): nothing to use below — Space, a tap or ✋ lands, over open ground.
      const targets = flying ? landingUse() : targetsNow();
      showPrompt(targets[0] ?? null);
      // A press in the two frames after an arm waits them out rather than being lost.
      const pressed = uses() !== usesSeen && held === 0;
      if (pressed) {
        usesSeen = uses();
        // A click on something usable from here uses it (a shopkeeper across
        // the counter, say); anywhere else, what the hero faces. A click
        // counts for its own press only — never a later ✋.
        const click = clickRef.current;
        clickRef.current = null;
        const at = click ? k.toWorld(k.vec2(click.fx * VIEW_W, click.fy * VIEW_H)) : null;
        const target = (at && targets.find((t) => t.hit(at.x, at.y))) || targets[0];
        if (target) {
          push = null;
          target.act();
        }
      }

      // A resting enemy wakes once the hero has left its patch (a boss: or
      // headed past it) — checked every frame, a bump cooling down or not.
      for (const [a, rest] of resting) {
        if (staysDown(rest, player.pos)) continue;
        resting.delete(a);
        restings += 1;
      }

      // A cooldown spares only `spared` — never one the hero walks into, a
      // boss least of all: it used to let a hero walk through anything (#114t).
      const still = player.pos.x === was.x && player.pos.y === was.y;
      const stepX = player.pos.x - was.x;
      const stepY = player.pos.y - was.y;
      const holding = held > 0;
      held = Math.max(0, held - 1);

      // Walking into a foe starts a battle. (People, the Spire and Umbra are
      // used, not bumped — above, #127.)
      for (const a of actors) {
        if (a.follower) continue; // walking with the hero, not in their way
        if (a.kind === 'enemy' && a.enemy) {
          const onHero = touching(a, player.pos, contactRadius(a.enemy));
          const asleep = resting.has(a);
          // Heading up to a sleeping critter — while it's still there to see,
          // not under them — says why it lets them pass (#114e).
          const towards = dx * (a.x - player.pos.x) + dy * (a.y - player.pos.y) > 0;
          if (asleep && !flying && !holding && !sleeperHinted && !a.enemy.isBoss && towards && touching(a, player.pos, SLEEPER_HINT_PX)) {
            sleeperHinted = cbRef.current.onSleeper?.() ?? true;
          }
          // Fight, pass, or spare (`meetFoe`, #114e, #114t).
          const met = meetFoe(a.enemy, {
            onHero,
            held: holding,
            resting: asleep,
            spared: spared.has(a),
            guarded: guard > 0,
            still,
            closing: !still && stepX * (a.x - was.x) + stepY * (a.y - was.y) > 0,
            mode: flying ? 'ember' : aboard ? 'boat' : 'foot',
            calm,
          });
          if (met.spared) spared.add(a);
          else spared.delete(a);
          if (!met.fight) continue;
          if (onHero) {
            triggered = true;
            cbRef.current.onMove(player.pos.x - dx * 14, player.pos.y - dy * 14);
            cbRef.current.onEncounter(a.enemy);
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

      // A place's name fades to a ghost while the hero stands on it, so it
      // never hides them (the Roost's plateau is right under its label).
      for (const l of placeLabels) {
        // Flying, Ember is drawn below the rider (to ~44 px down): her too (round 3 review).
        const dy = l.y - player.pos.y;
        const over = Math.abs(player.pos.x - l.x) < l.halfW + HALF && (flying ? dy > -TILE * 0.75 && dy < 52 : Math.abs(dy) < TILE * 0.75);
        const target = over ? LABEL_UNDER_OPACITY : 1;
        const cur = l.parts[0].near ?? 1;
        if (cur === target) continue;
        const step = Math.min(1, dt * ROOF_FADE);
        const near = Math.abs(target - cur) < 0.02 ? target : cur + (target - cur) * step;
        for (const part of l.parts) {
          part.near = near;
          part.obj.opacity = part.opacity * (part.seen ?? 1) * near;
        }
      }

      // Ember pads along behind the hero with a friendly bounce — or, flying
      // (#75 item 15b), carries them: the hero on her back, both over the fog
      // and the place names, her shadow on the ground below.
      // Big enough that her wings and head show round the rider; the shadow
      // well below reads as height (#75 item 15b review).
      const lift = flying && !reducedMotion ? Math.sin(k.time() * 3) * 2 : 0;
      (player as unknown as { z: number }).z = flying ? 17.5 : 10;
      (ember as unknown as { z: number }).z = flying ? 17 : 9;
      emberScale.scale = k.vec2(flying ? EMBER_FLY_SCALE : 1);
      shadow.opacity = flying ? 0.35 : 0;
      if (flying) shadow.pos = k.vec2(player.pos.x, player.pos.y + 48);
      const trail = flying
        ? k.vec2(player.pos.x, player.pos.y + 10 + lift)
        : k.vec2(player.pos.x - lastDir.x * 26, player.pos.y - lastDir.y * 26 + 8 + Math.sin(k.time() * 4) * 2);
      const emberGap = Math.hypot(trail.x - ember.pos.x, trail.y - ember.pos.y);
      ember.pos = flying ? trail : ember.pos.lerp(trail, Math.min(1, dt * 5));
      if (emberView) {
        // Ember faces the way the hero is heading and walks while catching up.
        const f = facingFor(lastDir.x, lastDir.y, 'down');
        const want = animFor(f, flying || emberGap > 4, emberView.anims);
        if (want !== emberAnim) {
          emberAnim = want;
          emberSprite.play(want);
        }
        if (f === 'side') emberSprite.flipX = lastDir.x < 0;
      }
      if (emberRim) {
        emberRim.hidden = !flying;
        if (flying) {
          emberRim.pos = ember.pos;
          emberRim.scale = k.vec2(EMBER_FLY_SCALE * EMBER_RIM);
          emberRim.frame = (ember as unknown as { frame: number }).frame;
          emberRim.flipX = emberSprite.flipX;
        }
      }

      // --- An escort's walk (#75 item 14g) ------------------------------------
      // Talked to where they wait, they step out and follow the hero's
      // footsteps (`lib/escort.ts`), waiting while an awake critter is near.
      const walk = escortRef.current;
      if (walk && !follower && !escortArrived) {
        // From where a battle left them, else from where they stood waiting.
        const waitingHere = actors.find((a) => a.kind === 'npc' && a.npcId === walk.npcId && !a.follower);
        const from = walk.from ?? (waitingHere ? { x: waitingHere.x, y: waitingHere.y } : { x: player.pos.x, y: player.pos.y });
        follower = spawnFollower(walk.npcId, from);
        escortState = startEscort(from);
        // Back from a battle: her footsteps to the hero are gone — walk her a way
        // round on the map, never straight across a pool (#75 item 14g review).
        if (walk.from) {
          const cell = (p: { x: number; y: number }) => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
          const hero = cell(player.pos);
          const way = reachPath(z, (x, y) => x === hero.x && y === hero.y, { from: cell(from), flags: flagsRef.current });
          if (way) escortState = { ...escortState, crumbs: way.slice(1).map((c) => ({ x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 })) };
        }
      } else if (!walk && follower) {
        follower.remove();
        follower = null;
        escortState = null;
      }
      if (walk && follower && escortState && !escortArrived) {
        escortState = dropCrumb(escortState, player.pos);
        // The hero came back for them: walk to the hero from here, a way round on the
        // map, not back out along the old footsteps and past them (#75 item 14g UX review).
        // Once per return: not again until the hero has moved a tile (equal ways round can't flip her about).
        // (The latch lasts one return: cleared once she no longer needs it, so a second return reroutes too.)
        const heroCell = `${Math.floor(player.pos.x / TILE)},${Math.floor(player.pos.y / TILE)}`;
        const isBack = cameBack(escortState, player.pos, TILE);
        if (!isBack) escortReroutedAt = '';
        if (isBack && heroCell !== escortReroutedAt) {
          escortReroutedAt = heroCell;
          const cell = (p: { x: number; y: number }) => ({ x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) });
          const hero = cell(player.pos);
          const way = reachPath(z, (x, y) => x === hero.x && y === hero.y, { from: cell(escortState.at), flags: flagsRef.current });
          // No way round found: keep the footsteps (never a straight line across a pool).
          if (way) escortState = { ...escortState, crumbs: way.slice(1).map((c) => ({ x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2 })) };
        }
        // Awake critters that could fight someone on foot — not sleepers, not under Calm.
        const threats = calm
          ? []
          : actors.flatMap((a) =>
              // Not a boss: it never moves, so waiting for it would be waiting for ever (#75 item 14g review).
              a.enemy && !a.enemy.isBoss && !resting.has(a) && meetsHero(a.enemy.habitat, 'foot') ? [{ x: a.x, y: a.y }] : [],
            );
        const wasWaiting = escortState.waiting;
        const before = escortState.at;
        escortState = stepEscort(escortState, player.pos, threats, dt);
        follower.place(escortState.at, escortState.at.x - before.x, escortState.at.y - before.y, escortState.waiting);
        // A stop says why once it's lasted a moment (a passer-by doesn't make it
        // chatter) — asked again each second while it lasts, so a toast already
        // up doesn't swallow it (`WorldScreen` keeps it to one every 15 s).
        escortWaitFor = escortState.waiting ? escortWaitFor + dt : 0;
        if (!escortState.waiting) escortWentAway = false;
        else if (Math.hypot(player.pos.x - escortState.at.x, player.pos.y - escortState.at.y) > TILE * 3) escortWentAway = true;
        if (escortState.waiting && wasWaiting && escortWaitFor >= 1.5 && k.time() - escortWaitAskedAt >= 1) {
          escortWaitAskedAt = k.time();
          // Came back to them after walking off: say why at once (#75 item 14g UX review) —
          // once; standing beside them all along keeps the usual 15 s (review round 7).
          const back = escortWentAway && Math.hypot(player.pos.x - escortState.at.x, player.pos.y - escortState.at.y) < TILE * 2.5;
          // Spent only once it's said (another toast up keeps it for the next ask — review round 8).
          if (cbRef.current.onEscortWait?.(back) !== false && back) escortWentAway = false;
        }
        if (wasWaiting && !escortState.waiting) cbRef.current.onEscortGo?.();
        if (!wasWaiting && escortState.waiting) cbRef.current.onEscortStop?.();
        // The hero at the goal, them held up far behind: say where they are.
        if (stuckBehind(escortState, player.pos, walk.goal, TILE) && k.time() - escortBehindAt > 8) {
          escortBehindAt = k.time();
          cbRef.current.onEscortBehind?.();
        }
        if (Math.hypot(escortState.at.x - escortSaid.x, escortState.at.y - escortSaid.y) > TILE / 2) {
          escortSaid = escortState.at;
          cbRef.current.onEscortMove?.(escortState.at.x, escortState.at.y);
        }
        if (arrived(escortState.at, walk.goal, TILE, player.pos, escortState.waiting)) {
          escortArrived = true;
          cbRef.current.onEscortArrive?.();
        }
      }

      // NPCs who come and go with the story (a flag set in a conversation).
      for (const c of comings) {
        const present = standsHere(c.p);
        const look = lookOf(c.p);
        // A new face: drawn again, right where they stand (#75 item 16a).
        let at: { x: number; y: number } | undefined;
        if (c.here && look !== c.look) {
          at = { x: c.here.actor.x, y: c.here.actor.y };
          c.here.remove();
          c.here = null;
        }
        c.look = look;
        if (present && !c.here) c.here = spawnNpc(c.p, at);
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
      if (underfoot && !flying && cooldown === 0 && !flagsRef.current[secretFlag(underfoot.id)]) {
        arm(TRIGGER_COOLDOWN);
        cbRef.current.onMove(player.pos.x, player.pos.y);
        cbRef.current.onSecret?.(underfoot.id);
      }
      // Sailing off an edge onto the next stretch of sea (#75 item 14).
      // Flying off a linked edge too, over land or sea (#75 item 15b).
      const crossing = aboard ? seaCrossing(z, cellX, cellY, ZONES, flagsRef.current) : flying ? edgeCrossing(z, cellX, cellY, ZONES, 'ember') : null;
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
      // No places while flying: a place icon is just more ground below.
      const exit = flying ? undefined : z.exits.find((e) => e.x === cellX && e.y === cellY);
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
      onPointerDown={onWorldPointer}
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
