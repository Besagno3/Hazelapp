import { COMPANION_IDS, type CompanionId } from '../content/companion';
import { escortsBack } from '../content/questFlags';
import type { CrystalTopic, LibraryEntry, SaveData, ZoneId } from '../types';
import { HUB_ZONE, TILE, ZONES, innOf, innWakeCell, isZoneId, shelterOf } from '../content/zones';
import { BOAT_SPAWN_REACH, safeSpawn } from './reach';
import { canFlyOver } from './travel';
import { BOAT_REMOOR_REACH, hasBoat, seaBeside, validMooring } from '../content/boat';
import { CONSUMABLE_IDS, LIBRARY_MAX, type ConsumableId } from '../content/items';
import { ACT2_SEEN, SPIRE_VICTORY_SEEN, canFly } from '../content/story';
import { withSecretsBadge } from '../content/secrets';

export const SAVE_VERSION = 3 as const;

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
  /**
   * v2 → v3 (#75 item 15b, roadmap decision 15): Ember can fly, so how the
   * hero gets about is one field, `vehicle`, not the boat's `aboard`. The same
   * step adopts `lastRest` and `boat` as part of the save (#104a) — they were
   * added to v2 without a bump and already have their shape.
   */
  2: (raw) => {
    const out: RawSave = { ...raw, vehicle: raw.aboard === true ? 'boat' : 'foot' };
    delete out.aboard;
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
  if (saveVersionOf(raw) > SAVE_VERSION) return true;
  // A place added after this code was built (15h review, #142n): new zones
  // don't change the save's shape, so they don't bump SAVE_VERSION — but an
  // old tab would move a hero standing there home and save that. A current
  // save naming a place-shaped id this code doesn't know is newer than it.
  if (saveVersionOf(raw) < SAVE_VERSION || typeof raw !== 'object' || raw === null) return false;
  const r = raw as RawSave;
  return unknownPlace(r.zoneId) || unknownPlace(r.lastRest);
}

/** A zone id from a newer build: shaped like one (`chartmakers-rest`), but not ours — and not a prototype key. */
function unknownPlace(id: unknown): boolean {
  return typeof id === 'string' && /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id) && !isZoneId(id) && !(id in Object.prototype);
}

/**
 * The error the server raises when a save would overwrite one from a newer
 * version of the game (supabase/migrations/0011_save_version_guard.sql) — and,
 * since migration 0020 (#151), a newer copy of the save (a higher revision).
 */
export const SAVE_VERSION_CONFLICT = 'save_version_conflict';

/**
 * Carried in the detail of a `SAVE_VERSION_CONFLICT` raised because the
 * server holds a newer *copy* of the save (migration 0020), not a save from a
 * newer version of the game: the player played on in another tab or device.
 */
export const SAVE_REVISION_CONFLICT = 'save_revision_conflict';

/**
 * A raw save's revision (#151) — a whole number of at most 15 digits — or null
 * when it has none (a save from before revisions) or a junk one. The same rule
 * as migration 0020's trigger, so the app and the server agree on what counts.
 */
export function revisionOf(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = (raw as RawSave).revision;
  return typeof r === 'number' && Number.isInteger(r) && r >= 0 && r < 1e15 ? r : null;
}

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
    revision: 0,
    avatarId: null,
    zoneId: HUB_ZONE,
    pos: null,
    hp: null,
    coins: 0,
    items: { potion: 1, hint: 1, elixir: 0, spark: 0, ward: 0, clover: 0, tea: 0, snack: 0, coil: 0, mirror: 0, knot: 0, candle: 0 },
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
    typingAnchor: true,
    lastRest: null,
    boat: null,
    vehicle: 'foot',
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

  const zoneKnown = isZoneId(r.zoneId);
  const zoneId = zoneKnown ? (r.zoneId as ZoneId) : d.zoneId;
  // A position only means something in its own zone: none when it fell back.
  const savedPos = zoneKnown && isPos(r.pos) ? { x: r.pos.x, y: r.pos.y } : null;
  // Every known consumable gets a count; ids added later (#73: elixir, spark,
  // ward) simply default in for older saves.
  // An escort's walk is never kept (#75 item 14g): reloaded, they wait at the start again — and the world says so.
  const flags = escortsBack({ ...(isRecord(r.flags) ? (r.flags as Record<string, boolean>) : {}), [SAVE_V2_FLAG]: true });
  const rawItems = typeof r.items === 'object' && r.items !== null ? (r.items as Record<string, unknown>) : {};
  const items = Object.fromEntries(
    CONSUMABLE_IDS.map((id) => [id, numberOr(rawItems[id], d.items[id])]),
  ) as Record<ConsumableId, number>;
  // Marlow's boat (#75 item 14). A hero saved afloat stays afloat: where they
  // were, or — on a map repainted (or fogged) under them — the nearest open
  // sea. With no sea that close they go ashore, and the boat waits on the sea
  // nearest them rather than wherever they last climbed in, so a hero is
  // never left on an island without it.
  const cell = savedPos ? { x: Math.floor(savedPos.x / TILE), y: Math.floor(savedPos.y / TILE) } : null;
  const wasAboard = r.vehicle === 'boat' && hasBoat(flags) && cell !== null;
  const afloat = wasAboard ? seaBeside(zoneId, cell.x, cell.y, flags, BOAT_SPAWN_REACH) : null;
  // Where they'll stand instead — that spot, or the zone's spawn (`safeSpawn`).
  const stand = wasAboard && !afloat ? safeSpawn(ZONES[zoneId], savedPos, flags) : null;
  const beside = stand ? seaBeside(zoneId, Math.floor(stand.x / TILE), Math.floor(stand.y / TILE), flags, BOAT_REMOOR_REACH) : null;
  const moved = afloat && (afloat.x !== cell?.x || afloat.y !== cell?.y);
  const pos = moved ? { x: afloat.x * TILE + TILE / 2, y: afloat.y * TILE + TILE / 2 } : savedPos;

  // On Ember (#75 item 15b): she flies over any overworld map, so a hero saved
  // in the air stays there — on a map she flies over, once she can fly.
  // Anywhere else they're on foot (the canvas finds them firm ground).
  const flying = r.vehicle === 'ember' && savedPos !== null && canFly(flags) && canFlyOver(ZONES[zoneId]);

  const save: SaveData = {
    version: SAVE_VERSION,
    // Added with #151 — additive: a save from before it (or a junk one) is 0.
    revision: revisionOf(r) ?? 0,
    avatarId: typeof r.avatarId === 'string' ? r.avatarId : null,
    zoneId,
    pos,
    hp: typeof r.hp === 'number' && r.hp > 0 ? r.hp : null,
    coins: numberOr(r.coins, 0),
    items,
    badges: stringArray(r.badges),
    sages: stringArray(r.sages) as CrystalTopic[],
    // Every v2-or-later save carries the marker (see SAVE_V2_FLAG), whatever it came with.
    flags,
    openedChests: stringArray(r.openedChests),
    kills: killCounts(r.kills),
    questItems: stringArray(r.questItems),
    passedRounds: numberOr(r.passedRounds, 0),
    worldUnlocked: r.worldUnlocked === true,
    // Oldest first, like `pushLibrary`: an over-long queue keeps its newest
    // misses (it kept the oldest, which 📈 Progress then listed as the newest — #29 review round 1).
    library: Array.isArray(r.library) ? (r.library as LibraryEntry[]).slice(-LIBRARY_MAX) : [],
    // Added after v1 shipped: older saves (and unknown ids) default to Ember.
    companionId: (COMPANION_IDS as readonly string[]).includes(r.companionId as string)
      ? (r.companionId as CompanionId)
      : d.companionId,
    // Added after v1 shipped: only an explicit `false` turns the countdown off.
    defendTimer: r.defendTimer !== false,
    // The home-row hold in typing (#165) — additive the same way: on unless turned off.
    typingAnchor: r.typingAnchor !== false,
    // Added with an inn in every town (#75 item 11) — additive, like the two
    // above: older saves (or a town without an inn) wake at home.
    lastRest: isZoneId(r.lastRest) && innOf(ZONES[r.lastRest]) ? r.lastRest : null,
    // Marlow's boat (#75 item 14) — additive too (see above). A mooring that
    // isn't afloat (a map repainted under it, a pond, fog) goes back to his dock.
    boat: beside
      ? { zoneId, ...beside }
      : validMooring(r.boat, flags)
        ? { zoneId: r.boat.zoneId, x: r.boat.x, y: r.boat.y }
        : null,
    vehicle: afloat !== null ? 'boat' : flying ? 'ember' : 'foot',
  };
  // Between the Spire's finale and Act II the hero is asleep at the Sleepy
  // Sheep Inn (#75 item 14) — Act II opens "You wake to sunshine at the Sleepy
  // Sheep Inn". A save that beat the Spire before the walk home existed (or
  // was reloaded mid-morning) is put to bed there too, so that's true.
  // Every secret found before the Secret Seeker trophy existed: it's on the shelf (#80b).
  const trophied = withSecretsBadge(save);
  return trophied.flags[SPIRE_VICTORY_SEEN] && !trophied.flags[ACT2_SEEN] ? { ...trophied, ...restAtHomeInn() } : trophied;
}

/**
 * The shelter that looks after a hero beaten in this zone: its own, or the one
 * it points to (`shelterIn`, #75 item 16b: Lumina-That-Was → the Dream Root Door).
 */
function shelterFor(zoneId: string | undefined): { zoneId: ZoneId; shelter: NonNullable<ReturnType<typeof shelterOf>> } | null {
  if (!zoneId || !isZoneId(zoneId)) return null;
  const z = ZONES[zoneId];
  const home = z.shelterIn ?? zoneId;
  const shelter = shelterOf(ZONES[home]);
  return shelter ? { zoneId: home, shelter } : null;
}

/** The inn a defeated hero wakes at — "the Square Root Inn in Numbria" — or null for home. */
/**
 * What the defeat screen says when a shelter looks after the hero (#75 item
 * 14f): "Fen the Forager finds you and tucks you up in Fen's Hollow." and the
 * place for its button — null anywhere else (they wake at their inn,
 * `wakeInnName`).
 */
export function wakeShelter(save: Partial<Pick<SaveData, 'zoneId'>>): { line: string; place: string } | null {
  const shelter = shelterFor(save.zoneId)?.shelter ?? null;
  if (!shelter) return null;
  // "Fen's Hollow" stands alone; "the Quiet Shelf Inn" (#75 item 14h) needs its "the".
  const name = shelter.building.name;
  const place = /'s /.test(name) ? name : `the ${name}`;
  // The button: an inn that's also a shelter is "the inn", as after any rest at an inn (#75 item 14h review).
  return { line: `${shelter.host} finds you and tucks you up in ${place}.`, place: shelter.building.sign === 'inn' ? 'the inn' : place };
}

export function wakeInnName(save: Pick<SaveData, 'lastRest'>): string | null {
  const z = save.lastRest ? ZONES[save.lastRest] : null;
  const inn = z ? innOf(z) : undefined;
  // "at the Dream Root Door" — nobody sleeps IN a door (16a UX review round 4).
  const prep = z?.kind === 'dungeon' ? 'at' : 'in';
  return z && inn ? `the ${inn.name.replace(/^The /, '')} ${prep} ${z.the ? 'the ' : ''}${z.name}` : null;
}

/**
 * Where a defeated hero wakes, healed (#75 item 11): just inside the door of
 * the last inn they rested at, or home on Lumina Village's plaza — unless
 * they were beaten somewhere with a shelter (#75 item 14f, Eldergrove: Fen's
 * Hollow), which looks after them right there.
 */
export function wakeAfterDefeat(save: Pick<SaveData, 'lastRest'> & Partial<Pick<SaveData, 'zoneId'>>): {
  zoneId: ZoneId;
  pos: { x: number; y: number } | null;
} {
  const found = shelterFor(save.zoneId);
  if (found) return { zoneId: found.zoneId, pos: { x: found.shelter.cell.x * TILE + TILE / 2, y: found.shelter.cell.y * TILE + TILE / 2 } };
  const cell = save.lastRest ? innWakeCell(ZONES[save.lastRest]) : null;
  if (!save.lastRest || !cell) return { zoneId: HUB_ZONE, pos: null };
  return { zoneId: save.lastRest, pos: { x: cell.x * TILE + TILE / 2, y: cell.y * TILE + TILE / 2 } };
}

/**
 * Home to bed after the Spire (#75 item 14): the hero sleeps at the Sleepy
 * Sheep Inn in Lumina Village — healed, on its floor just inside the door,
 * and it's the inn they last rested at. Spread into the save.
 */
export function restAtHomeInn(): Pick<SaveData, 'zoneId' | 'pos' | 'hp' | 'lastRest' | 'vehicle'> {
  return { ...wakeAfterDefeat({ lastRest: HUB_ZONE }), hp: null, lastRest: HUB_ZONE, vehicle: 'foot' };
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
