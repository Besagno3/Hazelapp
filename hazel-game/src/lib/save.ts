import type { LibraryEntry, SaveData, Topic, ZoneId } from '../types';
import { HUB_ZONE, ZONES } from '../content/zones';
import { LIBRARY_MAX } from '../content/items';

export const SAVE_VERSION = 1 as const;

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
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;

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
    sages: stringArray(r.sages) as Topic[],
    sageEquipped: typeof r.sageEquipped === 'string' ? (r.sageEquipped as Topic) : null,
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
