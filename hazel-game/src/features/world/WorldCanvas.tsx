import { useEffect, useRef } from 'react';
import kaplay from 'kaplay';
import type { MutableRefObject } from 'react';
import { TILE, WALKABLE_CHARS, pathTargetId, gateFlag, zone } from '../../content/zones';
import { NPC_DEFS } from '../../content/npcs';
import { spawnEnemy } from '../../content/enemies';
import { EMBER_SPRITES, EMBER_MAP_SIZE, EMBER_SPRITE_IDS, type EmberStage } from '../../content/story';
import type { Avatar, BattleEnemy, PathTarget, ZoneId } from '../../types';
import { loadWorldSprites, worldFace } from './worldSprites';
import { resolveSprite } from '../../content/sprites';

/** Player hitbox half-size (smaller than a tile so corridors feel forgiving). */
const HALF = 11;
const SPEED = 170;
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
}

/**
 * Renders one zone of Lumina on a KaPlay canvas (#37, supersedes the #36
 * single-screen MVP). Tile-grid collision, bump-to-interact NPCs/gates/
 * chests/crystals, walk-into enemies to battle, edge exits between zones.
 * Placeholder "programmer art": colored tiles + emoji decorations.
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
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const kRef = useRef<ReturnType<typeof kaplay> | null>(null);
  // Re-running the scene effect for every prop change would rebuild the
  // world mid-walk; the latest callbacks/flags are read through refs instead.
  const cbRef = useRef(callbacks);
  const flagsRef = useRef(flags);
  const chestsRef = useRef(openedChests);
  useEffect(() => {
    cbRef.current = callbacks;
    flagsRef.current = flags;
    chestsRef.current = openedChests;
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

  const z = zone(zoneId);
  const cols = z.map[0].length;
  const rows = z.map.length;
  const W = cols * TILE;
  const H = rows * TILE;

  // --- Adopt the one shared KaPlay instance ----------------------------------
  // Created once for the whole session (all zones are the same 704×448 size);
  // on later mounts we just re-parent the existing canvas. Never re-init — see
  // the `sharedKaplay` note above. The scene effect repaints the ground.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    if (!sharedKaplay) {
      const k = kaplay({
        root: host,
        width: W,
        height: H,
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

    // Repaint the ground for this zone (init only set the first zone's color).
    k.add([k.rect(W, H), k.pos(0, 0), k.color(...z.ground), k.z(-100)]);

    // --- Tiles -------------------------------------------------------------
    const chestSprites = new Map<string, ReturnType<typeof k.add>>();
    const gateSprites = new Map<string, ReturnType<typeof k.add>>();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = z.map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (ch === '=') {
          k.add([k.rect(TILE, TILE), k.pos(px, py), k.color(...z.path)]);
        } else if (ch === '~') {
          k.add([k.rect(TILE, TILE), k.pos(px, py), k.color(70, 120, 200)]);
        } else if (ch === '#') {
          k.add([k.rect(TILE, TILE), k.pos(px, py), k.color(...z.ground)]);
          k.add([k.text(z.solidEmoji, { size: 26 }), k.pos(px + TILE / 2, py + TILE / 2), k.anchor('center')]);
        } else if (ch === ',') {
          k.add([k.text(z.decoEmoji, { size: 14 }), k.pos(px + TILE / 2, py + TILE / 2), k.anchor('center')]);
        } else if (ch === 'S') {
          k.add([k.text('💎', { size: 24 }), k.pos(px + TILE / 2, py + TILE / 2), k.anchor('center')]);
        } else if (ch === 'C') {
          const id = pathTargetId(zoneId, 'chest', x, y);
          const sprite = k.add([
            k.text(chestsRef.current.includes(id) ? '🎉' : '🎁', { size: 24 }),
            k.pos(px + TILE / 2, py + TILE / 2),
            k.anchor('center'),
          ]);
          chestSprites.set(id, sprite);
        } else if (ch === 'G') {
          const id = pathTargetId(zoneId, 'gate', x, y);
          if (!flagsRef.current[gateFlag(id)]) {
            const sprite = k.add([
              k.text('🚧', { size: 26 }),
              k.pos(px + TILE / 2, py + TILE / 2),
              k.anchor('center'),
            ]);
            gateSprites.set(id, sprite);
          }
        } else if (ch === 'E') {
          k.add([k.rect(TILE, TILE), k.pos(px, py), k.color(...z.path)]);
          k.add([
            k.text('✨', { size: 18 }),
            k.pos(px + TILE / 2, py + TILE / 2),
            k.anchor('center'),
          ]);
        }
      }
    }

    // --- Actors ------------------------------------------------------------
    interface Actor {
      x: number;
      y: number;
      kind: 'npc' | 'enemy';
      npcId?: string;
      enemy?: BattleEnemy;
    }
    const actors: Actor[] = [];

    for (const p of z.npcs) {
      const def = NPC_DEFS[p.defId];
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      if (!resolveSprite(def.spriteId, def.sprite).def?.world) {
        k.add([
          k.rect(30, 30, { radius: 6 }),
          k.color(255, 245, 215),
          k.outline(2, k.rgb(120, 90, 40)),
          k.pos(px, py),
          k.anchor('center'),
        ]);
      }
      worldFace(k, { spriteId: def.spriteId, emoji: def.sprite, x: px, y: py, size: 22 });
      k.add([
        k.text(def.name, { size: 10 }),
        k.pos(px, py + 24),
        k.anchor('center'),
        k.color(255, 255, 255),
      ]);
      actors.push({ x: px, y: py, kind: 'npc', npcId: def.id });
    }

    for (const p of z.enemies) {
      const enemy = spawnEnemy(p.defId, zoneId, `${p.defId}@${p.x},${p.y}`, age);
      // Bosses stay gone once their crystal is restored; regular enemies
      // stay gone for the session once beaten (they respawn next visit).
      if (enemy.isBoss && flagsRef.current[`crystal-${enemy.topic}-restored`]) continue;
      if (defeatedIds.includes(enemy.instanceId)) continue;
      const px = p.x * TILE + TILE / 2;
      const py = p.y * TILE + TILE / 2;
      const enemyHasSprite = !!resolveSprite(enemy.spriteId, enemy.sprite).def?.world;
      const body = enemyHasSprite
        ? null
        : k.add([
            k.rect(enemy.isBoss ? 42 : 32, enemy.isBoss ? 42 : 32, { radius: 8 }),
            k.color(60, 30, 50),
            k.outline(2, k.rgb(255, 120, 120)),
            k.pos(px, py),
            k.anchor('center'),
          ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const face: any = worldFace(k, {
        spriteId: enemy.spriteId,
        emoji: enemy.sprite,
        x: px,
        y: py,
        size: enemy.isBoss ? 30 : 24,
        z: 6,
      }).obj;
      k.add([
        k.text(`${enemy.isBoss ? '👑 ' : ''}Lv ${enemy.level}`, { size: 10 }),
        k.pos(px, py + (enemy.isBoss ? 32 : 26)),
        k.anchor('center'),
        k.color(255, 200, 200),
      ]);
      // Idle hover — visual only; the collision point stays at the spawn.
      let t = Math.random() * Math.PI * 2;
      face.onUpdate(() => {
        if (pausedRef.current) return;
        t += k.dt() * 2.4;
        const dy = Math.sin(t) * 3;
        if (body) body.pos.y = py + dy;
        face.pos.y = py + dy;
      });
      actors.push({ x: px, y: py, kind: 'enemy', enemy });
    }

    // --- Player ------------------------------------------------------------
    const spawn = startPos ?? {
      x: z.spawn.x * TILE + TILE / 2,
      y: z.spawn.y * TILE + TILE / 2,
    };
    const heroView = resolveSprite(avatar.spriteId, avatar.sprite).def?.world ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any;
    if (heroView && avatar.spriteId) {
      player = k.add([
        k.sprite(`w_${avatar.spriteId}`),
        k.pos(spawn.x, spawn.y),
        k.anchor('center'),
        k.z(10),
      ]);
      (player as unknown as { play: (n: string) => void }).play('idle');
    } else {
      player = k.add([
        k.rect(28, 28, { radius: 8 }),
        k.color(255, 220, 100),
        k.outline(2, k.rgb(120, 80, 0)),
        k.pos(spawn.x, spawn.y),
        k.anchor('center'),
        k.z(10),
      ]);
      player.add([k.text(avatar.sprite, { size: 20 }), k.anchor('center')]);
    }
    let curAnim = 'idle';

    // Ember trails the hero (no collision — dragons walk where they please).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ember: any = worldFace(k, {
      spriteId: EMBER_SPRITE_IDS[emberStage],
      emoji: EMBER_SPRITES[emberStage],
      x: spawn.x - 24,
      y: spawn.y + 8,
      size: EMBER_MAP_SIZE[emberStage],
      z: 9,
    }).obj;
    let lastDir = { x: 1, y: 0 };

    // --- Collision ---------------------------------------------------------
    const isOpenGate = (x: number, y: number) =>
      flagsRef.current[gateFlag(pathTargetId(zoneId, 'gate', x, y))] === true;

    /** What blocks the cell, if anything. */
    function blockerAt(cx: number, cy: number): { ch: string; x: number; y: number } | null {
      const ch = z.map[cy]?.[cx] ?? '#';
      if (WALKABLE_CHARS.has(ch)) return null;
      if (ch === 'G' && isOpenGate(cx, cy)) return null;
      return { ch, x: cx, y: cy };
    }

    function hitAt(px: number, py: number): { ch: string; x: number; y: number } | null {
      const corners: [number, number][] = [
        [px - HALF, py - HALF],
        [px + HALF, py - HALF],
        [px - HALF, py + HALF],
        [px + HALF, py + HALF],
      ];
      for (const [cx, cy] of corners) {
        const b = blockerAt(Math.floor(cx / TILE), Math.floor(cy / TILE));
        if (b) return b;
      }
      return null;
    }

    // --- Main loop ---------------------------------------------------------
    let wasPaused = false;
    let cooldown = 0;
    let triggered = false;
    let moveSaveTimer = 0;

    const loop = k.onUpdate(() => {
      if (triggered) return;
      if (pausedRef.current) {
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
        const want = moving && heroView.anims.walk ? 'walk' : 'idle';
        if (want !== curAnim) {
          curAnim = want;
          (player as unknown as { play: (n: string) => void }).play(want);
        }
        // Single-frame sprites (no 'walk' anim): a small squash-stretch hop.
        if (moving && !heroView.anims.walk) {
          const hop = 1 + Math.sin(k.time() * 16) * 0.06;
          (player as unknown as { scale: ReturnType<typeof k.vec2> }).scale = k.vec2(1, hop);
        } else if (!heroView.anims.walk) {
          (player as unknown as { scale: ReturnType<typeof k.vec2> }).scale = k.vec2(1, 1);
        }
        if (dx !== 0) {
          (player as unknown as { flipX: boolean }).flipX = dx < 0;
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
          const id = pathTargetId(zoneId, 'gate', bumped.x, bumped.y);
          cooldown = TRIGGER_COOLDOWN;
          cbRef.current.onPath({ kind: 'gate', id, topic: z.topic ?? 'math', zoneId });
        } else if (bumped.ch === 'C') {
          const id = pathTargetId(zoneId, 'chest', bumped.x, bumped.y);
          if (!chestsRef.current.includes(id)) {
            cooldown = TRIGGER_COOLDOWN;
            cbRef.current.onPath({ kind: 'chest', id, topic: z.topic ?? 'math', zoneId });
          }
        } else if (bumped.ch === 'S') {
          cooldown = 2;
          cbRef.current.onSaveCrystal();
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
              // Nudge back so closing the dialogue doesn't instantly re-bump.
              player.pos.x -= dx * 10;
              player.pos.y -= dy * 10;
              cooldown = TRIGGER_COOLDOWN;
              cbRef.current.onMove(player.pos.x, player.pos.y);
              cbRef.current.onTalk(a.npcId);
            } else if (a.kind === 'enemy' && a.enemy) {
              triggered = true;
              cbRef.current.onMove(player.pos.x - dx * 14, player.pos.y - dy * 14);
              cbRef.current.onEncounter(a.enemy);
            }
            break;
          }
        }
      }

      // Ember pads along behind the hero with a friendly bounce.
      const trail = k.vec2(
        player.pos.x - lastDir.x * 26,
        player.pos.y - lastDir.y * 26 + 8 + Math.sin(k.time() * 4) * 2,
      );
      ember.pos = ember.pos.lerp(trail, Math.min(1, dt * 5));

      // Open gates / opened chests update live (flag set while overlay open).
      for (const [id, sprite] of gateSprites) {
        if (flagsRef.current[gateFlag(id)]) {
          sprite.destroy();
          gateSprites.delete(id);
        }
      }
      for (const [id, sprite] of chestSprites) {
        if (chestsRef.current.includes(id) && sprite.exists()) {
          (sprite as unknown as { text: string }).text = '🎉';
          chestSprites.delete(id);
        }
      }

      // Zone exits.
      const cellX = Math.floor(player.pos.x / TILE);
      const cellY = Math.floor(player.pos.y / TILE);
      const exit = z.exits.find((e) => e.x === cellX && e.y === cellY);
      if (exit) {
        triggered = true;
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
    // Rebuild only on zone / ember change; the rest is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId, emberStage]);

  return (
    // Fills the parent's width; the 11:7 box keeps the zone's aspect ratio.
    // KaPlay sizes its <canvas> to a fixed 704×448 — `!w-full/!h-full` (with
    // `!`, since KaPlay uses inline styles) upscales it to fill, kept crisp by
    // `imageRendering: pixelated`. Internal render resolution is unchanged.
    <div
      ref={containerRef}
      className="w-full rounded-lg shadow-2xl border-2 border-white/20 overflow-hidden [&>canvas]:!block [&>canvas]:!w-full [&>canvas]:!h-full"
      style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }}
    />
  );
}
