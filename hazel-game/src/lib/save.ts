import { COMPANION_IDS, type CompanionId } from '../content/companion';
import type { CrystalTopic, LibraryEntry, SaveData, ZoneId } from '../types';
import { HUB_ZONE, TILE, ZONES } from '../content/zones';
import { CONSUMABLE_IDS, LIBRARY_MAX, type ConsumableId } from '../content/items';

export const SAVE_VERSION = 2 as const;

/**
 * Versioned save-migration ladder (Wave 0.2, ROADMAP-4X). Each step upgrades
 * a raw persisted payload from version N to N+1 and runs BEFORE field-level
 * normalization (steps see raw unknown-shaped data — the old shape no longer
 * typechecks). To change the save shape:
 *   1. bump `SAVE_VERSION`,
 *   2. add `MIGRATIONS[oldVersion]` returning the upgraded raw payload,
 *   3. update `SaveData` / `defaultSave` / `normalizeSave` to the new shape,
 *   4. add a fixture test in save.test.ts feeding a real old-version payload.
 * Old saves then upgrade step-by-step on every load path (Supabase and
 * localStorage both come through `normalizeSave`).
 *
 *   5. nothing else: an older client never strips a newer save back to its
 *      own shape (the #61 data-loss class). On LOAD, `saveIsTooNew` makes it
 *      refuse the save; on SAVE, the server refuses any write that lowers a
 *      save's version (migration 0011's trigger, `SAVE_VERSION_CONFLICT`).
 *      Either way the store shows "refresh to update". The load check came
 *      with v2, so v1 clients don't have it — the server trigger still stops
 *      their saves, and `SAVE_V2_FLAG` covers a v1 copy that slips through.
 * save.test.ts's ladder tripwire catches a bumped version with a missing step.
 */
export type RawSave = Record<string, unknown>;
export type MigrationLadder = Record<number, (raw: RawSave) => RawSave>;

/**
 * Dawnreach grew from 64×48 to 80×60 tiles in #75 item 8, its old map now
 * sitting this many tiles in from the top-left — so a v1 position on it moves
 * by this much to stay on the same spot. Frozen: it describes that one change.
 */
export const DAWNREACH_GREW_BY = { x: 8, y: 6 } as const;

/**
 * Carried in `flags` by every v2-or-later save. A v1 client copies `flags`
 * through untouched, so if an old tab ever re-saves a v2 save stamped "v1",
 * this tells the v1 → v2 step the save is already v2-shaped — its Dawnreach
 * position must not move a second time (#101c).
 */
export const SAVE_V2_FLAG = 'save:v2';

/**
 * The four fog-pocket chests (#75 item 7) after Dawnreach grew and two of them
 * moved beside their regions (item 8), so an opened chest stays opened.
 */
export const MOVED_CHESTS: Record<string, string> = {
  'dawnreach:chest:13,9': 'dawnreach:chest:21,15', // math, by Numbria
  'dawnreach:chest:15,18': 'dawnreach:chest:18,49', // science, now by Verdara
  'dawnreach:chest:53,17': 'dawnreach:chest:70,14', // engineering, now in Gearfall Canyon
  'dawnreach:chest:48,37': 'dawnreach:chest:56,43', // creativity, by Chromaria
};

export const MIGRATIONS: MigrationLadder = {
  /**
   * v1 → v2 (#75 item 8, Act I re-staged on Dawnreach): Lumina Field retired
   * (a save there wakes on Lumina Village's plaza), Dawnreach grew (a save on
   * it keeps its spot; the pocket chests keep their opened state), and the
   * unused `sageEquipped` slot is gone (#53).
   */
  1: (raw) => {
    const out: RawSave = { ...raw };
    const flags = isRecord(raw.flags) ? raw.flags : {};
    // Already v2-shaped (an old tab re-saved it as "v1"): don't move it again.
    const alreadyV2 = flags[SAVE_V2_FLAG] === true;
    out.flags = { ...flags, [SAVE_V2_FLAG]: true };
    delete out.sageEquipped;
    if (raw.zoneId === 'lumina-field') {
      out.zoneId = 'lumina-village';
      out.pos = null;
    } else if (raw.zoneId === 'dawnreach' && isPos(raw.pos) && !alreadyV2) {
      out.pos = { x: raw.pos.x + DAWNREACH_GREW_BY.x * TILE, y: raw.pos.y + DAWNREACH_GREW_BY.y * TILE };
    }
    if (Array.isArray(raw.openedChests)) {
      out.openedChests = raw.openedChests.map((id) => (typeof id === 'string' ? (MOVED_CHESTS[id] ?? id) : id));
    }
    return out;
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPos(p: unknown): p is { x: number; y: number } {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as { x?: unknown }).x === 'number' &&
    typeof (p as { y?: unknown }).y === 'number'
  );
}

/** The version a raw persisted payload claims (v1 when it doesn't say). */
export function saveVersionOf(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 1;
  const v = (raw as RawSave).version;
  return typeof v === 'number' ? v : 1;
}

/**
 * A save written by a newer version of the game than this one: loading it
 * would strip what this version doesn't know and save it back older, so the
 * store refuses it and asks for a refresh instead.
 */
export function saveIsTooNew(raw: unknown): boolean {
  return saveVersionOf(raw) > SAVE_VERSION;
}

/**
 * The error the server raises when a save would overwrite one from a newer
 * version of the game (supabase/migrations/0011_save_version_guard.sql).
 */
export const SAVE_VERSION_CONFLICT = 'save_version_conflict';

/**
 * Walks `raw` up the ladder to `targetVersion`. A payload without a numeric
 * version is treated as v1 (the first JRPG shape). Stops early if a step is
 * missing — `normalizeSave`'s field defaulting is the safety net. Pure and
 * ladder-injectable for tests.
 */
export function runMigrations(
  raw: unknown,
  ladder: MigrationLadder = MIGRATIONS,
  targetVersion: number = SAVE_VERSION,
): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  let data = raw as RawSave;
  let version = typeof data.version === 'number' ? data.version : 1;
  while (version < targetVersion) {
    const step = ladder[version];
    if (!step) break;
    version += 1;
    data = { ...step(data), version };
  }
  return data;
}

/** localStorage key for a user's save (per-user — fixes #12). */
export function saveKey(userId: string): string {
  return `hazel-save-${userId}`;
}

/** The key the pre-JRPG gameStore persisted under (migrated, then ignored). */
export const LEGACY_KEY = 'hazel-game';

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    avatarId: null,
    zoneId: HUB_ZONE,
    pos: null,
    hp: null,
    coins: 0,
    items: { potion: 1, hint: 1, elixir: 0, spark: 0, ward: 0, clover: 0, tea: 0, snack: 0, coil: 0, mirror: 0 },
    badges: [],
    sages: [],
    flags: { [SAVE_V2_FLAG]: true },
    openedChests: [],
    kills: {},
    questItems: [],
    passedRounds: 0,
    worldUnlocked: false,
    library: [],
    companionId: 'ember',
    defendTimer: true,
  };
}

/**
 * Coerces arbitrary persisted JSON into a valid SaveData — every field is
 * individually defaulted so a corrupt or older payload degrades gracefully
 * instead of crashing the game.
 */
export function normalizeSave(raw: unknown): SaveData {
  const d = defaultSave();
  const migrated = runMigrations(raw);
  if (typeof migrated !== 'object' || migrated === null) return d;
  const r = migrated as Record<string, unknown>;

  const zoneKnown = typeof r.zoneId === 'string' && r.zoneId in ZONES;
  const zoneId = zoneKnown ? (r.zoneId as ZoneId) : d.zoneId;
  // A position only means something in its own zone: none when it fell back.
  const pos = zoneKnown && isPos(r.pos) ? { x: r.pos.x, y: r.pos.y } : null;
  // Every known consumable gets a count; ids added later (#73: elixir, spark,
  // ward) simply default in for older saves.
  const rawItems = typeof r.items === 'object' && r.items !== null ? (r.items as Record<string, unknown>) : {};
  const items = Object.fromEntries(
    CONSUMABLE_IDS.map((id) => [id, numberOr(rawItems[id], d.items[id])]),
  ) as Record<ConsumableId, number>;

  return {
    version: SAVE_VERSION,
    avatarId: typeof r.avatarId === 'string' ? r.avatarId : null,
    zoneId,
    pos,
    hp: typeof r.hp === 'number' && r.hp > 0 ? r.hp : null,
    coins: numberOr(r.coins, 0),
    items,
    badges: stringArray(r.badges),
    sages: stringArray(r.sages) as CrystalTopic[],
    // Every v2 save carries the marker (see SAVE_V2_FLAG), whatever it came with.
    flags: { ...(isRecord(r.flags) ? (r.flags as Record<string, boolean>) : {}), [SAVE_V2_FLAG]: true },
    openedChests: stringArray(r.openedChests),
    kills: killCounts(r.kills),
    questItems: stringArray(r.questItems),
    passedRounds: numberOr(r.passedRounds, 0),
    worldUnlocked: r.worldUnlocked === true,
    library: Array.isArray(r.library) ? (r.library as LibraryEntry[]).slice(0, LIBRARY_MAX) : [],
    // Added after v1 shipped: older saves (and unknown ids) default to Ember.
    companionId: (COMPANION_IDS as readonly string[]).includes(r.companionId as string)
      ? (r.companionId as CompanionId)
      : d.companionId,
    // Added after v1 shipped: only an explicit `false` turns the countdown off.
    defendTimer: r.defendTimer !== false,
  };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

function killCounts(v: unknown): Record<string, number> {
  if (typeof v !== 'object' || v === null) return {};
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
  }
  return out;
}

/**
 * One-time migration from the pre-JRPG localStorage shape (zustand-persist
 * `{state: {progress, avatar, …}}` under the fixed 'hazel-game' key). Carries
 * over the world unlock, passed-round count, and chosen avatar.
 */
export function migrateLegacy(rawJson: string | null): SaveData | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as {
      state?: {
        progress?: { completedRounds?: { passed?: boolean }[]; worldUnlocked?: boolean };
        avatar?: { id?: string } | null;
      };
    };
    const state = parsed?.state;
    if (!state) return null;
    const save = defaultSave();
    save.passedRounds = (state.progress?.completedRounds ?? []).filter((r) => r.passed).length;
    save.worldUnlocked = state.progress?.worldUnlocked === true;
    save.avatarId = state.avatar?.id ?? null;
    return save;
  } catch {
    return null;
  }
}

/** Appends missed questions to the Library queue (FIFO, capped). */
export function pushLibrary(library: LibraryEntry[], misses: LibraryEntry[]): LibraryEntry[] {
  // Don't queue the same question twice.
  const known = new Set(library.map((e) => e.question.id));
  const fresh = misses.filter((m) => !known.has(m.question.id));
  return [...library, ...fresh].slice(-LIBRARY_MAX);
}
