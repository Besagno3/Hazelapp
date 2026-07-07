import type { CrystalTopic, LibraryEntry, SaveData, ZoneId } from '../types';
import { HUB_ZONE, ZONES } from '../content/zones';
import { LIBRARY_MAX } from '../content/items';

export const SAVE_VERSION = 1 as const;

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
 * ⚠️ The FIRST version bump must also add a stale-client guard: today
 * `normalizeSave` stamps `version: SAVE_VERSION` unconditionally, so once v2
 * exists, a cached v1 client opening a v2 save would field-strip it and
 * re-persist it as v1 (the #61 silent-data-loss class). Harmless while only
 * v1 exists — treat "refuse to load versions above SAVE_VERSION" as step 5
 * of the checklist above. save.test.ts's ladder tripwire separately catches
 * a bumped version with a missing step.
 */
export type RawSave = Record<string, unknown>;
export type MigrationLadder = Record<number, (raw: RawSave) => RawSave>;

export const MIGRATIONS: MigrationLadder = {
  // 1: (raw) => ({ ...raw, party: [] }),   ← example: v1 → v2
};

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
    items: { potion: 1, hint: 1 },
    badges: [],
    sages: [],
    sageEquipped: null,
    flags: {},
    openedChests: [],
    kills: {},
    questItems: [],
    passedRounds: 0,
    worldUnlocked: false,
    library: [],
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

  const zoneId =
    typeof r.zoneId === 'string' && r.zoneId in ZONES ? (r.zoneId as ZoneId) : d.zoneId;
  const pos =
    typeof r.pos === 'object' && r.pos !== null &&
    typeof (r.pos as { x?: unknown }).x === 'number' &&
    typeof (r.pos as { y?: unknown }).y === 'number'
      ? { x: (r.pos as { x: number }).x, y: (r.pos as { y: number }).y }
      : null;
  const items =
    typeof r.items === 'object' && r.items !== null
      ? {
          potion: numberOr((r.items as Record<string, unknown>).potion, d.items.potion),
          hint: numberOr((r.items as Record<string, unknown>).hint, d.items.hint),
        }
      : d.items;

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
    sageEquipped: typeof r.sageEquipped === 'string' ? (r.sageEquipped as CrystalTopic) : null,
    flags: typeof r.flags === 'object' && r.flags !== null ? (r.flags as Record<string, boolean>) : {},
    openedChests: stringArray(r.openedChests),
    kills: killCounts(r.kills),
    questItems: stringArray(r.questItems),
    passedRounds: numberOr(r.passedRounds, 0),
    worldUnlocked: r.worldUnlocked === true,
    library: Array.isArray(r.library) ? (r.library as LibraryEntry[]).slice(0, LIBRARY_MAX) : [],
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
