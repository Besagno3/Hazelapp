/**
 * KaPlay world sprite helpers.
 *
 * - `loadWorldSprites` MUST be called right after the kaplay() instance
 *   is created (before any scene is built) to register all sprite sheets —
 *   except the per-zone edge-blend sheets, which `ensureBlendSheets` loads
 *   as zones are built (each zone's own plus its neighbours').
 * - `worldFace` returns `isSprite` so callers can skip the placeholder token
 *   box behind emoji fallbacks (the coloured rect is only needed for sprites).
 */
import kaplay from 'kaplay';
import type { SpriteAnim } from '../../lib/spriteAnim';
import { SPRITES, resolveSprite } from '../../content/sprites';
import { BUILDING_STYLES, ZONE_IDS, type ZoneDef, type ZoneId } from '../../content/zones';
import { blendsEdges } from '../../lib/terrain';
import { SPIRE_THEMES } from '../../content/spire';
import {
  BLEND_COLS,
  BLEND_ROWS,
  OVERWORLD_FRAME,
  OVERWORLD_FRAMES,
  OVERWORLD_KEY,
  OVERWORLD_SHEET,
  FOG_PUFF_FRAMES,
  FOG_PUFF_KEY,
  FOG_PUFF_SHEET,
  PROPS_FRAMES,
  PROPS_KEY,
  PROPS_SHEET,
  PROP_FRAME,
  SPIRE_PROPS_FRAMES,
  SPIRE_PROPS_KEY,
  SPIRE_PROPS_SHEET,
  SPIRE_PROP_FRAME,
  STAIRS_FRAMES,
  BOAT_FRAMES,
  BOAT_KEY,
  BOAT_SHEET,
  LIGHTHOUSE_FRAMES,
  LIGHTHOUSE_KEY,
  LIGHTHOUSE_SHEET,
  STAIRS_KEY,
  STAIRS_SHEET,
  blendKey,
  blendSheet,
  namedTilesetKey,
  namedTilesetSheet,
  ROOF_FRAMES,
  ROOF_KEY,
  ROOF_SHEET,
  SPIRE_KEY,
  SPIRE_SHEET,
  TILESET_FRAMES,
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

/**
 * The edge-blend sheets to have ready while in zone `z` (#71b): its own and
 * those of every zone an exit leads to, so walking on rarely meets a sheet
 * still loading. Sheets load on demand rather than all up front (they are
 * ~20 KB each — 13 of them would triple the tile art fetched on first entry).
 * None for maps that don't blend (the Spire's floors).
 */
export function blendSheetsFor(z: ZoneDef): ZoneId[] {
  if (!blendsEdges(z)) return [];
  return [...new Set([z.id, ...z.exits.map((e) => e.to)])];
}

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
 * Call this immediately after `kaplay()` is created, before any scene is
 * drawn. A sheet KaPlay already has is left alone, so after a hot reload
 * (the instance handed across, `WorldCanvas`) a second call loads only what's
 * new — a sprite added mid-session (#159 r1).
 */
export function loadWorldSprites(k: KaplayCtx): void {
  const load = (key: string, src: string, opt?: Parameters<KaplayCtx['loadSprite']>[2]) => {
    if (!k.getSprite(key)) k.loadSprite(key, src, opt);
  };
  for (const [id, def] of Object.entries(SPRITES)) {
    if (!def.world) continue;
    load(worldKey(id), def.world.sheet, {
      sliceX: def.world.frames,
      sliceY: 1,
      anims: toKaplayAnims(def.world.anims),
    });
  }
  // 16-bit environment art: one tileset strip per zone + shared props.
  // (Water animates in the terrain renderer — `lib/terrain.ts` — not as a sprite anim.)
  for (const id of ZONE_IDS) {
    load(tilesetKey(id), tilesetSheet(id), {
      sliceX: TILESET_FRAMES,
      sliceY: 1,
    });
  }
  load(PROPS_KEY, PROPS_SHEET, {
    sliceX: PROPS_FRAMES,
    sliceY: 1,
    anims: { glow: { from: PROP_FRAME.crystal[0], to: PROP_FRAME.crystal[1], loop: true, speed: 2 } },
  });
  load(SPIRE_KEY, SPIRE_SHEET);
  // Overworld (#75 Phase 1): mountains, sand, drifting fog, place icons.
  load(OVERWORLD_KEY, OVERWORLD_SHEET, {
    sliceX: OVERWORLD_FRAMES,
    sliceY: 1,
    anims: { drift: { from: OVERWORLD_FRAME.fog[0], to: OVERWORLD_FRAME.fog[1], loop: true, speed: 1.5 } },
  });
  // Fog banks (#75 item 7): soft puffs that drift around each other.
  load(FOG_PUFF_KEY, FOG_PUFF_SHEET, { sliceX: FOG_PUFF_FRAMES, sliceY: 1 });
  // The Spire's floor maps (#74): one tileset per floor theme + shared props.
  for (const theme of SPIRE_THEMES) {
    const name = `spire-${theme}`;
    load(namedTilesetKey(name), namedTilesetSheet(name), {
      sliceX: TILESET_FRAMES,
      sliceY: 1,
    });
  }
  load(STAIRS_KEY, STAIRS_SHEET, { sliceX: STAIRS_FRAMES, sliceY: 1 });
  load(BOAT_KEY, BOAT_SHEET, { sliceX: BOAT_FRAMES, sliceY: 1 });
  load(LIGHTHOUSE_KEY, LIGHTHOUSE_SHEET, {
    sliceX: LIGHTHOUSE_FRAMES,
    sliceY: 1,
    anims: { shine: { from: 0, to: LIGHTHOUSE_FRAMES - 1, loop: true, speed: 3 } },
  });
  load(SPIRE_PROPS_KEY, SPIRE_PROPS_SHEET, {
    sliceX: SPIRE_PROPS_FRAMES,
    sliceY: 1,
    anims: { glow: { from: SPIRE_PROP_FRAME.ward[0], to: SPIRE_PROP_FRAME.ward[1], loop: true, speed: 3 } },
  });
  for (const style of BUILDING_STYLES) {
    load(townKey(style), townSheet(style), { sliceX: TOWN_FRAMES, sliceY: 1 });
  }
  load(ROOF_KEY, ROOF_SHEET, { sliceX: ROOF_FRAMES, sliceY: 1 });
}

/** Start loading `z`'s edge-blend sheets (and its neighbours') if not already loading. */
export function ensureBlendSheets(k: KaplayCtx, z: ZoneDef): void {
  for (const id of blendSheetsFor(z)) {
    if (!k.getSprite(blendKey(id))) k.loadSprite(blendKey(id), blendSheet(id), { sliceX: BLEND_COLS, sliceY: BLEND_ROWS });
  }
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

/** A sprite object's sheet has failed to load (a 404, a bad file): it would draw nothing. */
export function sheetFailed(k: KaplayCtx, key: string): boolean {
  return !!k.getSprite(key)?.error;
}

/**
 * Wait on a sprite object's sheet (sprite review B1, B3). Once it has loaded,
 * `ready` runs — only if the object still exists: a quick zone change
 * (`destroyAll`) can take it away while the sheet is still on its way, and
 * KaPlay would otherwise play on the destroyed object. If the sheet fails to
 * load, the emoji is drawn on the object instead, so the character never goes
 * invisible. A sheet already loaded runs `ready` at once.
 */
export function whenSheetLoads(
  k: KaplayCtx,
  key: string,
  obj: KaplayObj,
  { ready, emoji, size }: { ready: () => void; emoji: string; size: number },
): void {
  const sheet = k.getSprite(key);
  const fallBack = () => {
    if (obj.exists()) obj.add([k.text(emoji, { size }), k.anchor('center')]);
  };
  if (!sheet) return ready(); // not registered (`worldFace` never asks then): nothing to wait on
  if (sheet.error) return fallBack();
  if (sheet.data) return ready();
  // Still loading. (Only while loading: a loaded sheet would keep these for good.)
  sheet.onLoad(() => {
    if (obj.exists()) ready();
  });
  sheet.onError(fallBack);
}

/**
 * Add a character face to the world — either a real sprite (if the manifest
 * has a `world` view for `spriteId`) or an emoji text object. A sheet that
 * has already failed to load gets the emoji (B1).
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

  // A sheet KaPlay was never told of (a sprite added since the hot reload) gets
  // the emoji too: a sprite of an unknown key throws inside KaPlay (#159 r1).
  if (def?.world && spriteId && k.getSprite(worldKey(spriteId)) && !sheetFailed(k, worldKey(spriteId))) {
    const obj = k.add([k.sprite(worldKey(spriteId)), k.pos(x, y), k.anchor('center'), k.z(z)]);
    // KaPlay's sprite component exposes `play` at runtime but the inferred
    // add() return type doesn't include it — cast narrowly.
    const play = () => (obj as unknown as { play: (n: string) => void }).play('idle');
    whenSheetLoads(k, worldKey(spriteId), obj, { ready: play, emoji, size });
    return { obj, isSprite: true };
  }

  const obj = k.add([k.text(emoji, { size }), k.pos(x, y), k.anchor('center'), k.z(z)]);
  return { obj, isSprite: false };
}
