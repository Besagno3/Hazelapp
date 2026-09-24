/**
 * KaPlay world sprite helpers.
 *
 * - `loadWorldSprites` MUST be called ONCE right after the kaplay() instance
 *   is created (before any scene is built) to register all sprite sheets.
 * - `worldFace` returns `isSprite` so callers can skip the placeholder token
 *   box behind emoji fallbacks (the coloured rect is only needed for sprites).
 */
import kaplay from 'kaplay';
import type { SpriteAnim } from '../../lib/spriteAnim';
import { SPRITES, resolveSprite } from '../../content/sprites';
import { BUILDING_STYLES, ZONE_IDS } from '../../content/zones';
import { SPIRE_THEMES } from '../../content/spire';
import {
  PROPS_FRAMES,
  PROPS_KEY,
  PROPS_SHEET,
  PROP_FRAME,
  SPIRE_PROPS_FRAMES,
  SPIRE_PROPS_KEY,
  SPIRE_PROPS_SHEET,
  SPIRE_PROP_FRAME,
  namedTilesetKey,
  namedTilesetSheet,
  ROOF_FRAMES,
  ROOF_KEY,
  ROOF_SHEET,
  SPIRE_KEY,
  SPIRE_SHEET,
  TILESET_FRAMES,
  TILE_FRAME,
  TOWN_FRAMES,
  tilesetKey,
  townKey,
  townSheet,
  tilesetSheet,
} from '../../content/tiles';

/** Derive KaPlay context / object types without relying on named exports. */
type KaplayCtx = ReturnType<typeof kaplay>;
type KaplayObj = ReturnType<KaplayCtx['add']>;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Namespace a sprite ID for the KaPlay world layer (avoids clashes with battle sheets). */
export const worldKey = (spriteId: string) => `w_${spriteId}`;

/**
 * Convert our `SpriteAnim` map to KaPlay's `loadSprite` `anims` shape.
 *
 * Our `fps` → KaPlay's `speed`; `loop` defaults to `true` when omitted.
 */
export function toKaplayAnims(
  anims: Record<string, SpriteAnim>,
): Record<string, { from: number; to: number; loop: boolean; speed: number }> {
  const out: Record<string, { from: number; to: number; loop: boolean; speed: number }> = {};
  for (const [name, a] of Object.entries(anims)) {
    out[name] = { from: a.from, to: a.to, loop: a.loop !== false, speed: a.fps };
  }
  return out;
}

// ─── KaPlay wrappers ──────────────────────────────────────────────────────────

/**
 * Register every sprite sheet in the SPRITES manifest, plus the zone
 * tilesets / props / Spire tower, with KaPlay.
 * Call this exactly once, immediately after `kaplay()` is created, before any
 * scene is drawn.
 */
export function loadWorldSprites(k: KaplayCtx): void {
  for (const [id, def] of Object.entries(SPRITES)) {
    if (!def.world) continue;
    k.loadSprite(worldKey(id), def.world.sheet, {
      sliceX: def.world.frames,
      sliceY: 1,
      anims: toKaplayAnims(def.world.anims),
    });
  }
  // 16-bit environment art: one tileset strip per zone + shared props.
  for (const id of ZONE_IDS) {
    k.loadSprite(tilesetKey(id), tilesetSheet(id), {
      sliceX: TILESET_FRAMES,
      sliceY: 1,
      anims: { water: { from: TILE_FRAME.water[0], to: TILE_FRAME.water[1], loop: true, speed: 2 } },
    });
  }
  k.loadSprite(PROPS_KEY, PROPS_SHEET, {
    sliceX: PROPS_FRAMES,
    sliceY: 1,
    anims: { glow: { from: PROP_FRAME.crystal[0], to: PROP_FRAME.crystal[1], loop: true, speed: 2 } },
  });
  k.loadSprite(SPIRE_KEY, SPIRE_SHEET);
  // The Spire's floor maps (#74): one tileset per floor theme + shared props.
  for (const theme of SPIRE_THEMES) {
    const name = `spire-${theme}`;
    k.loadSprite(namedTilesetKey(name), namedTilesetSheet(name), {
      sliceX: TILESET_FRAMES,
      sliceY: 1,
      anims: { water: { from: TILE_FRAME.water[0], to: TILE_FRAME.water[1], loop: true, speed: 2 } },
    });
  }
  k.loadSprite(SPIRE_PROPS_KEY, SPIRE_PROPS_SHEET, {
    sliceX: SPIRE_PROPS_FRAMES,
    sliceY: 1,
    anims: { glow: { from: SPIRE_PROP_FRAME.ward[0], to: SPIRE_PROP_FRAME.ward[1], loop: true, speed: 3 } },
  });
  for (const style of BUILDING_STYLES) {
    k.loadSprite(townKey(style), townSheet(style), { sliceX: TOWN_FRAMES, sliceY: 1 });
  }
  k.loadSprite(ROOF_KEY, ROOF_SHEET, { sliceX: ROOF_FRAMES, sliceY: 1 });
}

/** Options for `worldFace`. */
export interface WorldFaceOpts {
  /** Sprite manifest key (omit or leave undefined to use emoji). */
  spriteId?: string;
  /** Emoji shown when no world sprite is available. */
  emoji: string;
  x: number;
  y: number;
  /** Font / sprite display size in pixels (default 22). */
  size?: number;
  /** KaPlay z-layer (default 5). */
  z?: number;
}

/**
 * Add a character face to the world — either a real sprite (if the manifest
 * has a `world` view for `spriteId`) or an emoji text object.
 *
 * Returns `isSprite: true` when a sprite was used, so callers know whether to
 * skip rendering the placeholder coloured-rect token behind it.
 */
export function worldFace(
  k: KaplayCtx,
  opts: WorldFaceOpts,
): { obj: KaplayObj; isSprite: boolean } {
  const { spriteId, emoji, x, y, size = 22, z = 5 } = opts;
  const { def } = resolveSprite(spriteId, emoji);

  if (def?.world && spriteId) {
    const obj = k.add([k.sprite(worldKey(spriteId)), k.pos(x, y), k.anchor('center'), k.z(z)]);
    // KaPlay's sprite component exposes `play` at runtime but the inferred
    // add() return type doesn't include it — cast narrowly.
    (obj as unknown as { play: (n: string) => void }).play('idle');
    return { obj, isSprite: true };
  }

  const obj = k.add([k.text(emoji, { size }), k.pos(x, y), k.anchor('center'), k.z(z)]);
  return { obj, isSprite: false };
}
