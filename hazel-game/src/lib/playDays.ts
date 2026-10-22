import { supabase } from './supabase';
import { errorMessage, friendlyMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE } from './errors';
import { isoOffset, todayIso } from './streak';
import { MAX_SKILL_LEVEL, MIN_SKILL_LEVEL } from './age';
import type { PlayDayRecord, TopicTally } from '../types';

/**
 * The days each kid played, and their play on each day — the XP earned
 * (#169), the active minutes (#172) and the answers per topic (#173) — for
 * 👪 Grown-ups → 📈 Progress (#29, migrations 0025–0027). Each day is a
 * `PlayDayRecord` kept on the device first (localStorage, per kid; in memory
 * when storage can't be written) and grows as the kid plays; it's sent to
 * `note_device_play` as this browser's part of the day, which the database
 * keeps the larger of (per topic the tally with more answers) and adds to
 * other devices' parts (below). So **today's record stays on the device after
 * a send** and goes again, whole, once it has grown; a past day leaves once
 * the database has it as it stands; a day older than the database takes (7
 * back) is dropped. A day is sent only once it counts as played
 * (`notePlayDay`, from `profileStore.recordActivity`, or the profile already
 * counts it — below), so the week, the 🔥
 * streak and "last played" still agree: minutes or answers on a day nothing
 * else counted wait on the device, and go if the day is played. Never throws
 * and never holds up play: the dashboard can only be missing play, never
 * shows play that didn't happen.
 *
 * A day the profile already counts as played — on another device or
 * browser, earlier today, or a day inside the live streak it proves — is
 * this device's to send too once it has play of its own: it's this device's
 * part of the day, added to the others', so it's never left out of 📈.
 * Play noted for such a day marks it played as it's noted (`played`, review
 * round 2 — round 1 marked only the records kept when a profile loaded, so
 * minutes and wrong answers noted afterwards never went), and a profile
 * read marks every kept day it proves (`markPlayDays`).
 *
 * Not one call per answer: a send asked for without `now` (a round's end,
 * XP, a minute, an answer) goes at most every `SEND_EVERY_MS`; a new day, a
 * profile load and coming back online send at once, and so does the tab
 * being hidden (`watchPlayDays`) unless a send just failed.
 *
 * Each browser's day is its own part of the kid's day (migration 0027,
 * #179): days go to `note_device_play` with this browser's device id
 * (`deviceId`, `hazel-device-id` — the tabs of one browser share it, as they
 * share these records), and the database adds the devices' parts up, so a
 * kid on a tablet and a laptop the same day has both counted, while each
 * device re-sending its whole day never counts it twice. Where a record goes
 * — this browser's part, or the day's 'legacy' part through
 * `note_play_history` (no 0027 yet) — is decided once and stored on it
 * (`part`) BEFORE its first send, and every later send of it goes there
 * (#179 review round 1): a send whose answer never came back, or two tabs
 * sending at once across the 0027 switch, can't put one record in two parts.
 * Only "no such function" — a sure answer that nothing has it — moves a
 * record just given this browser's part to the legacy one (stored before
 * that call too); a record already in a device's part then waits for 0027
 * (sent the old way as well, it would count twice).
 *
 * Three builds' records, three keys (each build adds play only under its own):
 *   * this build's: `hazel-play-parts-<kid>` (`playDaysKey`) — the play it
 *     notes, and nothing else;
 *   * the #89 build's: `hazel-play-history-<kid>` (`legacyPlayDaysKey`) — read
 *     as a legacy-only source (#179 review round 1): each of its records is
 *     sent as it is through `note_play_history`, into the day's legacy part,
 *     which keeps the larger per day — so this tab and a #89 tab still open
 *     sending the same record never add it up — and this build never adds
 *     play to one (it marks one played, or sent, as that build would). It
 *     used to share that key, so a #89 tab rewrote this build's record and
 *     sent it, play and all, to the legacy part: the day counted twice. A
 *     day there leaves once it's sent and past; today's stays for a #89 tab
 *     that may still be writing it;
 *   * main's from before the records (#88): `hazel-play-days-<kid>`
 *     (`oldPlayDaysKey`), a list of bare days — folded into this build's
 *     records as days played, nothing else known, and cleared (review round
 *     1, #178). Such a day is `bare` (#181): that build earned XP on it that
 *     was never noted, so it goes without `noted` — the database then leaves
 *     `noted_play` as it was and 📈 keeps "played, XP not recorded" for it,
 *     never a "0 XP" it didn't earn. It stays bare once this device adds play
 *     of its own to that day: the old build's XP for it is still missing.
 * A day either build's record counts as played is played on this device, so
 * both records go; the minutes of both count towards five (#177).
 *
 * When a send fails it backs off rather than trying after every round
 * (#29 review round 1): no `note_device_play` (0027 not applied) → the days
 * go to `note_play_history` as before (a record already in a device's part
 * waits for 0027); no `note_play_history` either (0026 not applied) → the
 * days alone go to `note_play_days`, and the rest of each record stays on
 * the device until 0026 is found (while it's within the week); none of them
 * (0025 not applied either) → nothing more is sent. Each is asked about
 * again after `MISSING_RECHECK_MS` and on the next profile load
 * (`recheckPlayFunctions`; review round 2: remembered for the tab's whole
 * life, a family tablet left open across the deploy kept sending days alone
 * and dropped a week of play); offline or unreachable → again once the
 * device is back online, or after `RETRY_OFFLINE_MS`; any other refusal →
 * again on the kid's next new day or the next time their profile loads.
 */

const PREFIX = 'hazel-play-parts-';

/** Where the #89 build keeps its day records: sent as they are to the legacy part, never added to (#179 review round 1). */
const LEGACY_PREFIX = 'hazel-play-history-';

/** Where a build from before the day records (#88) keeps a kid's unsent days (bare `YYYY-MM-DD`s): read and folded in, never written. */
const OLD_PREFIX = 'hazel-play-days-';

/** At most this many days are kept on a device (today and the week the database takes back). */
export const PENDING_MAX = 8;

/** After a send that couldn't reach the server, a round's end tries again no sooner than this. */
export const RETRY_OFFLINE_MS = 10 * 60_000;

/** After a send, the next one asked for without `now` waits at least this long (not one call per answer). */
export const SEND_EVERY_MS = 2 * 60_000;

/** A note function the database didn't have (a migration not applied yet) is asked for again after this long (review round 2). */
export const MISSING_RECHECK_MS = 10 * 60_000;

/*
 * The database's limits on a day (migration 0026, `note_play_history`, and
 * 0027's `note_device_play`, which take a day the same way): what a record is
 * clamped to here too, and the days kept for sending. Repeated from the
 * migrations — `playDays.limits.test` reads them and holds the two together
 * (#182): drifted apart, the server would skip or clamp quietly. A level is
 * 1–10 (`MIN_SKILL_LEVEL` / `MAX_SKILL_LEVEL`), and a send of at most
 * `PENDING_MAX` days stays under the 31 a call.
 */
export const MAX_XP = 100_000;
export const MAX_MINUTES = 1_440;
export const MAX_ANSWERS = 10_000;
export const MAX_TOPICS = 16;
export const TOPIC_KEY = /^[a-z]{1,24}$/;
/** The days the database takes: from this many before its date… */
export const DAYS_BACK = 7;
/** …to this many after it. */
export const DAYS_AHEAD = 1;

/** Where this browser keeps its device id (#179): made once, shared by its tabs. */
export const DEVICE_KEY = 'hazel-device-id';

/** A device id the database takes (0027's `note_device_play`): 1–64 letters, digits or dashes — and never `LEGACY_PART`. */
export const DEVICE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** The part of a day the database keeps for a write that names no device (`note_play_history`, an older build's). */
export const LEGACY_PART = 'legacy';

const isDevice = (v: unknown): v is string => typeof v === 'string' && DEVICE_ID.test(v) && v.toLowerCase() !== LEGACY_PART;

/** A new random device id: a UUID (32 hex digits and 4 dashes) — `crypto.randomUUID` needs a secure page, `getRandomValues` doesn't. */
function newDeviceId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** This session's device id once known (kept in memory when storage can't be written). */
let sessionDevice: string | null = null;

/**
 * This browser's device id (#179): read from storage, or made once and kept
 * there — for this session only when storage can't be written. A random id,
 * tied to nothing else; it tells the database which part of a kid's day this
 * browser's play is.
 */
export function deviceId(): string {
  try {
    const kept = localStorage.getItem(DEVICE_KEY);
    if (isDevice(kept)) return (sessionDevice = kept);
  } catch {
    // Can't read storage: this session's id.
  }
  sessionDevice ??= newDeviceId();
  try {
    localStorage.setItem(DEVICE_KEY, sessionDevice);
  } catch {
    // Private mode / quota: kept for this session.
  }
  return sessionDevice;
}

/** The localStorage key for a kid's day records — this build's own (#179 review round 1). */
export function playDaysKey(kidId: string): string {
  return `${PREFIX}${kidId}`;
}

/** The key the #89 build keeps a kid's day records under: a legacy-only source here (#179 review round 1). */
export function legacyPlayDaysKey(kidId: string): string {
  return `${LEGACY_PREFIX}${kidId}`;
}

/** The key a build from before the day records keeps a kid's unsent days under (#29, migration 0025). */
export function oldPlayDaysKey(kidId: string): string {
  return `${OLD_PREFIX}${kidId}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day as this device keeps it: the record, whether the day counts as
 * played (only then is it sent), what the database has of it — nothing,
 * the day alone (`note_play_days`, before 0026), or all of it as it stands —
 * whether an older build played it too (`bare`, #181: its play there was
 * never noted, so this record isn't all of the day's), and where it goes
 * (`part`, #179: this browser's device id, or `LEGACY_PART` — stored before
 * its first send; none yet for a record never sent; a #89 build's record
 * never has one: it goes to the legacy part).
 */
interface Kept extends PlayDayRecord {
  played?: true;
  sent?: 'day' | 'all';
  bare?: true;
  part?: string;
}

/**
 * A day as it's sent to `note_device_play` (0027) or `note_play_history`
 * (0026): the record, and
 * `noted: true` when it's all of the day's play this device knows of — the
 * database then marks the day `noted_play` (#181). A `bare` day goes
 * without it, so the flag stays as it was.
 */
interface SentDay extends PlayDayRecord {
  noted?: true;
}

/** A kid's kept days when this device can't write them to storage (private mode, quota): kept for this session. */
const unstored = new Map<string, Kept[]>();
/** …and the #89 build's records, as this build last marked them, when that key can't be written. */
const legacyUnstored = new Map<string, Kept[]>();

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
const isLevel = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= MIN_SKILL_LEVEL && (v as number) <= MAX_SKILL_LEVEL;

/** A topic's tally as stored, or null when it's junk. */
function tallyFrom(v: unknown): TopicTally | null {
  if (!isRecord(v)) return null;
  const a = count(v.a, MAX_ANSWERS);
  const tally: TopicTally = { a, r: Math.min(a, count(v.r, MAX_ANSWERS)) };
  if (isLevel(v.l)) tally.l = v.l;
  return tally;
}

/**
 * One stored day: a bare day (the format before 0026 — a day an older build
 * played, nothing sent, its play unknown: `bare`) or a record; anything
 * else is null. `mine`: one of this build's, with its part (a record sent
 * with none — never this build's — goes on to the legacy part); a #89
 * build's has none.
 */
function keptFrom(v: unknown, mine = true): Kept | null {
  if (typeof v === 'string') return ISO_DAY.test(v) ? { day: v, xp: 0, minutes: 0, topics: {}, played: true, bare: true } : null;
  if (!isRecord(v) || typeof v.day !== 'string' || !ISO_DAY.test(v.day)) return null;
  const topics: Record<string, TopicTally> = {};
  if (isRecord(v.topics)) {
    for (const [topic, t] of Object.entries(v.topics)) {
      const tally = TOPIC_KEY.test(topic) ? tallyFrom(t) : null;
      if (tally && Object.keys(topics).length < MAX_TOPICS) topics[topic] = tally;
    }
  }
  const kept: Kept = { day: v.day, xp: count(v.xp, MAX_XP), minutes: count(v.minutes, MAX_MINUTES), topics };
  if (v.played === true) kept.played = true;
  if (v.sent === 'day' || v.sent === 'all') kept.sent = v.sent;
  if (v.bare === true) kept.bare = true;
  if (!mine) return kept;
  if (isDevice(v.part) || v.part === LEGACY_PART) kept.part = v.part;
  else if (kept.sent) kept.part = LEGACY_PART;
  return kept;
}

/** A stored list, or nothing (missing, not JSON, not a list). */
function storedList(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * A kid's kept days, oldest first — with the days an older build's tab left
 * under the old key folded in: each a day played, and `bare` (#181) — the
 * rest of a record kept here for it stays as it is, but it isn't the whole
 * day's play any more (that build's XP for it was never noted).
 */
function readKept(kidId: string): Kept[] {
  const held = unstored.get(kidId);
  if (held) return held;
  const byDay = new Map<string, Kept>();
  for (const v of storedList(playDaysKey(kidId))) {
    const kept = keptFrom(v);
    if (kept) byDay.set(kept.day, kept);
  }
  for (const v of storedList(oldPlayDaysKey(kidId))) {
    const kept = keptFrom(v);
    if (!kept) continue;
    const had = byDay.get(kept.day);
    if (!had) byDay.set(kept.day, kept);
    else if (kept.played) {
      had.played = true;
      had.bare = true;
    }
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** The #89 build's records for a kid, oldest first (#179 review round 1) — never with a part. */
function readLegacy(kidId: string): Kept[] {
  const held = legacyUnstored.get(kidId);
  if (held) return held;
  const byDay = new Map<string, Kept>();
  for (const v of storedList(legacyPlayDaysKey(kidId))) {
    const kept = keptFrom(v, false);
    if (kept) byDay.set(kept.day, kept);
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/**
 * The days worth keeping: oldest first; a day the database won't take any
 * more (older than 7 back), a past day it has as it stands, and a day more
 * than one ahead (a device clock that was set ahead: the database never
 * takes it, and it would hold one of the `PENDING_MAX` places for good —
 * review round 2) leave; at most `PENDING_MAX`.
 */
function keeping(list: Kept[]): Kept[] {
  const today = todayIso();
  const oldest = isoOffset(today, -DAYS_BACK);
  const newest = isoOffset(today, DAYS_AHEAD);
  return list
    .filter((r) => r.day >= oldest && r.day <= newest && !(r.sent === 'all' && r.day < today))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-PENDING_MAX);
}

/** Write a kid's days under `key`; in `held` instead (this session) when storage can't be written. */
function store(key: string, held: Map<string, Kept[]>, kidId: string, days: Kept[], then?: () => void): void {
  try {
    if (days.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(days));
    then?.();
    held.delete(kidId);
  } catch {
    // Private mode / quota: kept in memory instead, so the day is still sent —
    // this session, or not at all.
    if (days.length === 0) held.delete(kidId);
    else held.set(kidId, days);
  }
}

/** Keep a kid's days (this build's records — `keeping`). */
function writeKept(kidId: string, list: Kept[]): void {
  // An older build's days were read in with the rest (`readKept`): they're here now.
  store(playDaysKey(kidId), unstored, kidId, keeping(list), () => localStorage.removeItem(oldPlayDaysKey(kidId)));
}

/**
 * Keep the #89 build's records as this build marked them (played, sent) —
 * their play as it was: a day leaves once it's sent and past (`keeping`;
 * today's stays for a #89 tab that may still be writing it).
 */
function writeLegacy(kidId: string, list: Kept[]): void {
  store(legacyPlayDaysKey(kidId), legacyUnstored, kidId, keeping(list));
}

/** The part of a record the database keeps. */
const contents = (r: PlayDayRecord): string => JSON.stringify([r.xp, r.minutes, r.topics]);
const recordOf = ({ day, xp, minutes, topics }: Kept): PlayDayRecord => ({ day, xp, minutes, topics });
/** What goes to the database for a kept day: `noted` unless an older build played it too (#181). */
const sentOf = (r: Kept): SentDay => (r.bare ? recordOf(r) : { ...recordOf(r), noted: true });

/**
 * How play is noted. `played`: the profile already counts the day as played
 * (its last day played, or a day its live streak proves — `profileStore`
 * says), so the record goes like any played day's (review round 2).
 */
export interface Noting {
  played?: boolean;
}

/**
 * Change a kid's record for `day` (made if it isn't kept yet). A record the
 * database had as it stood has more to send once it changes.
 */
function change(kidId: string, day: string, edit: (r: Kept) => void, { played = false }: Noting = {}): boolean {
  if (!ISO_DAY.test(day)) return false;
  try {
    const list = readKept(kidId).map((r) => ({ ...r, topics: { ...r.topics } }));
    let rec = list.find((r) => r.day === day);
    if (!rec) {
      rec = { day, xp: 0, minutes: 0, topics: {} };
      list.push(rec);
    }
    const before = contents(rec);
    edit(rec);
    if (played) rec.played = true;
    if (rec.sent === 'all' && contents(rec) !== before) rec.sent = 'day';
    writeKept(kidId, list);
    return true;
  } catch {
    return false;
  }
}

/**
 * A kid's records with something to send, both builds' (`which` says what's
 * still to send of a record): those of a day played on this device — a day
 * either build's record counts as played (the #89 build's play on this
 * device is this device's too, and so is this build's on a day it counted).
 */
function waiting(kidId: string, which: (r: Kept) => boolean): { mine: Kept[]; legacy: Kept[] } {
  const mine = readKept(kidId);
  const legacy = readLegacy(kidId);
  const played = new Set([...mine, ...legacy].filter((r) => r.played).map((r) => r.day));
  const sendable = (r: Kept) => played.has(r.day) && which(r);
  return { mine: mine.filter(sendable), legacy: legacy.filter(sendable) };
}

/** The days kept for a kid with something still to send (oldest first), either build's. */
export function pendingPlayDays(kidId: string): string[] {
  const { mine, legacy } = waiting(kidId, (r) => r.sent !== 'all');
  return [...new Set([...mine, ...legacy].map((r) => r.day))].sort();
}

/**
 * This device's minutes on a kid's day and whether the day counts as played
 * here (#177: five active minutes count it) — null when nothing is kept for
 * it. Both builds' records: minutes a #89 tab counted here earlier that day
 * count too.
 */
export function keptDay(kidId: string, day: string): { minutes: number; played: boolean } | null {
  const both = [...readKept(kidId), ...readLegacy(kidId)].filter((k) => k.day === day);
  if (both.length === 0) return null;
  return { minutes: both.reduce((n, k) => n + k.minutes, 0), played: both.some((k) => k.played) };
}

/** This build's records kept on this device for a kid (oldest first) — sent or not. */
export function playDayRecords(kidId: string): PlayDayRecord[] {
  return readKept(kidId).map(recordOf);
}

/** Forget a kid's kept days, under every key (they were removed, or the family's copies leave this device). */
export function forgetPlayDays(kidId: string): void {
  writeKept(kidId, []);
  writeLegacy(kidId, []);
  wait.delete(kidId);
}

/** One send per kid at a time; a send asked for meanwhile runs after it. */
const inFlight = new Map<string, Promise<void>>();
/** Until when (ms) neither function is asked for (0025 isn't applied): nothing is sent meanwhile. */
let missingUntil = 0;
/** Until when (ms) `note_play_history` isn't asked for (0026 isn't applied): the days alone go to `note_play_days` meanwhile. */
let historyMissingUntil = 0;
/** Until when (ms) `note_device_play` isn't asked for (0027 isn't applied): the days go to `note_play_history` meanwhile. */
let deviceMissingUntil = 0;
const missing = () => Date.now() < missingUntil;
const historyMissing = () => Date.now() < historyMissingUntil;
const deviceMissing = () => Date.now() < deviceMissingUntil;

/**
 * Ask the database for the note functions again on the next send, though a
 * send found one missing a while ago (a profile load does — review round 2:
 * a migration applied since is found at once, not only after
 * `MISSING_RECHECK_MS`).
 */
export function recheckPlayFunctions(): void {
  missingUntil = 0;
  historyMissingUntil = 0;
  deviceMissingUntil = 0;
}
/**
 * When a kid's days may go again without `now` (ms): `SEND_EVERY_MS` after a
 * send, or the back-off after a failed one (`failed`) — and whether coming
 * back online should send them.
 */
const wait = new Map<string, { at: number; failed: boolean; offline: boolean }>();
let listening = false;

/** Back online: the kids whose send couldn't reach the server try again now. */
function onOnline(): void {
  for (const [kidId, w] of [...wait]) {
    if (w.offline) void flushPlayDays(kidId, { now: true });
  }
}

/** Note a day a kid played, then send what's waiting (a new day always tries). Fire and forget. */
export function notePlayDay(kidId: string, day: string): Promise<void> {
  if (!change(kidId, day, (r) => (r.played = true))) return Promise.resolve();
  return flushPlayDays(kidId, { now: true });
}

/**
 * The days `played` says count as played (the profile says so — another
 * device or browser played them, or the live streak proves them; review
 * rounds 1–2): this device's records of them, where it keeps any, are sent
 * like any played day's — the database keeps the larger of the two. Nothing
 * is made for a day this device has no play on, and nothing is sent here:
 * the caller's own send (throttled, or a load's at once) takes them.
 */
export function markPlayDays(kidId: string, played: (day: string) => boolean): void {
  const mark = (list: Kept[]) => (list.some((r) => !r.played && played(r.day)) ? list.map((r) => (!r.played && played(r.day) ? { ...r, played: true as const } : r)) : null);
  const mine = mark(readKept(kidId));
  if (mine) writeKept(kidId, mine);
  // The #89 build's records too (that build would mark them so on a profile load): played isn't play.
  const legacy = mark(readLegacy(kidId));
  if (legacy) writeLegacy(kidId, legacy);
}

/** `amount` XP earned on `day` (#169): added to the day's total, sent within a couple of minutes. */
export function addDayXp(kidId: string, day: string, amount: number, noting?: Noting): Promise<void> {
  if (!(amount > 0) || !Number.isFinite(amount)) return Promise.resolve();
  if (!change(kidId, day, (r) => (r.xp = Math.min(MAX_XP, r.xp + Math.round(amount))), noting)) return Promise.resolve();
  return flushPlayDays(kidId);
}

/** One more active minute played on `day` (#172, `lib/activeMinutes`). */
export function addDayMinute(kidId: string, day: string, noting?: Noting): Promise<void> {
  if (!change(kidId, day, (r) => (r.minutes = Math.min(MAX_MINUTES, r.minutes + 1)), noting)) return Promise.resolve();
  return flushPlayDays(kidId);
}

/** The tally for `topic` on a record, made if there's room (at most `MAX_TOPICS` a day). */
function tallyFor(r: Kept, topic: string): TopicTally | null {
  if (!TOPIC_KEY.test(topic)) return null;
  const had = r.topics[topic];
  if (had) return (r.topics[topic] = { ...had });
  if (Object.keys(r.topics).length >= MAX_TOPICS) return null;
  return (r.topics[topic] = { a: 0, r: 0 });
}

/**
 * A question of `topic` answered on `day` (#173) — bank questions only, the
 * final pick (`profileStore.noteAnswer` decides). `level`: the topic's level
 * as it was answered, when it's known (not from a profile that wasn't read).
 */
export function noteDayAnswer(kidId: string, day: string, topic: string, correct: boolean, level?: number, noting?: Noting): Promise<void> {
  if (!TOPIC_KEY.test(topic)) return Promise.resolve();
  const noted = change(
    kidId,
    day,
    (r) => {
      const t = tallyFor(r, topic);
      if (!t || t.a >= MAX_ANSWERS) return;
      t.a += 1;
      if (correct) t.r += 1;
      if (isLevel(level)) t.l = level;
    },
    noting,
  );
  return noted ? flushPlayDays(kidId) : Promise.resolve();
}

/** `topic`'s level was saved on `day` (#173): the day's level for it, the last one saved that day. */
export function noteDayLevel(kidId: string, day: string, topic: string, level: number, noting?: Noting): Promise<void> {
  if (!isLevel(level) || !TOPIC_KEY.test(topic)) return Promise.resolve();
  const noted = change(
    kidId,
    day,
    (r) => {
      const t = tallyFor(r, topic);
      if (t) t.l = level;
    },
    noting,
  );
  return noted ? flushPlayDays(kidId) : Promise.resolve();
}

/** What's waiting to go for a kid, either build's: played days the database doesn't have as they stand (or, before 0026, the days themselves). */
function toSend(kidId: string): { mine: Kept[]; legacy: Kept[] } {
  return waiting(kidId, (r) => (historyMissing() ? !r.sent : r.sent !== 'all'));
}

/** The #89 build's past days that are sent leave its key (#179 review round 1) — today's stays for a #89 tab still writing it. */
function tidyLegacy(kidId: string): void {
  const list = readLegacy(kidId);
  if (keeping(list).length !== list.length) writeLegacy(kidId, list);
}

/**
 * Send a kid's waiting days to the database. Never rejects. Without `now`
 * (a round's end, XP, a minute, an answer) it waits `SEND_EVERY_MS` after a
 * send and respects the back-off after a failed one; `hidden` (the tab going
 * out of view) skips the first wait but not the second; `now` (a new day, a
 * profile load, back online) tries anyway — unless the database has neither
 * function, which stops it until they're asked for again.
 */
export function flushPlayDays(kidId: string, { now = false, hidden = false }: { now?: boolean; hidden?: boolean } = {}): Promise<void> {
  const running = inFlight.get(kidId);
  if (running) return running.then(() => flushPlayDays(kidId, { now, hidden }));
  tidyLegacy(kidId);
  const { mine, legacy } = toSend(kidId);
  if (missing() || mine.length + legacy.length === 0) return Promise.resolve();
  const w = wait.get(kidId);
  if (!now && w && Date.now() < w.at && (w.failed || !hidden)) return Promise.resolve();
  const send = sendPending(kidId).finally(() => inFlight.delete(kidId));
  inFlight.set(kidId, send);
  return send;
}

/** The send couldn't reach the server (offline, a dropped connection), so it's worth trying again soon. */
function unreachable(err: unknown): boolean {
  const words = friendlyMessage(err);
  return words === NETWORK_MESSAGE || words === OFFLINE_MESSAGE;
}

function backOff(kidId: string, err: unknown): void {
  const offline = unreachable(err);
  // Offline: soon, or as soon as the device is back. Otherwise not before the kid's next day or profile load.
  wait.set(kidId, { at: offline ? Date.now() + RETRY_OFFLINE_MS : Number.POSITIVE_INFINITY, failed: true, offline });
  if (offline && !listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('online', onOnline);
  }
  console.warn('Noting the days played failed (kept to send later):', errorMessage(err));
}

/** The database has no such function (a migration isn't applied). */
const noFunction = (error: { code?: string }): boolean => error.code === 'PGRST202' || error.code === '42883';
/** Not this family's kid (removed elsewhere): their days can never be sent. */
const notYours = (error: { message?: string }): boolean => /not your player/i.test(error.message ?? '');

/**
 * The database has what was sent: a record unchanged since is done (`all`;
 * a past day then leaves the device), one that grew meanwhile goes again —
 * its day, at least, is there. `legacy`: the #89 build's records — marked
 * so in its key, as that build marks what it sent (and played: a day played
 * here), their play left as it was.
 */
function settle(kidId: string, sent: Kept[], what: 'day' | 'all', legacy = false): void {
  if (sent.length === 0) return;
  const done = (r: Kept): Kept => {
    const was = sent.find((s) => s.day === r.day);
    if (!was) return r;
    const marked: Kept = legacy ? { ...r, played: true } : r;
    if (what === 'all' && contents(r) === contents(was)) return { ...marked, sent: 'all' };
    return r.sent ? marked : { ...marked, sent: 'day' };
  };
  if (legacy) writeLegacy(kidId, readLegacy(kidId).map(done));
  else writeKept(kidId, readKept(kidId).map(done));
  wait.set(kidId, { at: Date.now() + SEND_EVERY_MS, failed: false, offline: false });
}

/**
 * Where each of these records goes, decided once and stored BEFORE the call
 * (#179 review round 1): one that has a part keeps it — stored by an earlier
 * send, or a moment ago by another tab of this browser; one that has none
 * gets this browser's part, or the legacy part while `note_device_play` is
 * known to be missing. So a send whose answer is lost (the database has it,
 * the device never heard) or a race at the 0027 switch can't put one record
 * in two parts. Returns the records as stored, and the days given a part now.
 */
function claimParts(kidId: string, records: Kept[]): { claimed: Kept[]; chosen: Set<string> } {
  const want = new Set(records.map((r) => r.day));
  const chosen = new Set<string>();
  const list = readKept(kidId).map((r) => {
    if (!want.has(r.day) || r.part) return r;
    chosen.add(r.day);
    return { ...r, part: deviceMissing() ? LEGACY_PART : deviceId() };
  });
  if (chosen.size > 0) writeKept(kidId, list);
  return { claimed: list.filter((r) => want.has(r.day)), chosen };
}

/**
 * `note_device_play` isn't there after all (0027 not applied — a sure
 * answer: nothing was written): the records this send had just given
 * `part` go to the legacy part instead, stored before that call too — each
 * only if it's still `part`'s and still unsent here. Returns them.
 */
function toLegacy(kidId: string, records: Kept[], part: string): Kept[] {
  const want = new Set(records.map((r) => r.day));
  const moved: Kept[] = [];
  const list = readKept(kidId).map((r) => {
    if (!want.has(r.day) || r.part !== part || r.sent) return r;
    const legacy = { ...r, part: LEGACY_PART };
    moved.push(legacy);
    return legacy;
  });
  if (moved.length > 0) writeKept(kidId, list);
  return moved;
}

const byDay = (a: Kept, b: Kept) => (a.day < b.day ? -1 : 1);

async function sendPending(kidId: string): Promise<void> {
  try {
    const { mine, legacy } = toSend(kidId);
    const { claimed, chosen } = claimParts(kidId, mine);
    // Each device part's days to note_device_play (0027); the rest — the
    // legacy part's (no 0027 when first sent), and the #89 build's records —
    // to note_play_history below.
    const parts = new Map<string, Kept[]>();
    const rest: Kept[] = [];
    for (const r of claimed) {
      if (r.part === LEGACY_PART) rest.push(r);
      else if (r.part) parts.set(r.part, [...(parts.get(r.part) ?? []), r]);
    }
    for (const [part, days] of parts) {
      if (!deviceMissing()) {
        const { error } = await supabase.rpc('note_device_play', { p_kid: kidId, p_device: part, p_days: days.map(sentOf) });
        if (!error) {
          settle(kidId, days, 'all');
          continue;
        }
        if (notYours(error)) return forgetPlayDays(kidId);
        if (!noFunction(error)) return backOff(kidId, error);
        // Migration 0027 isn't applied (yet): the days go as before it.
        deviceMissingUntil = Date.now() + MISSING_RECHECK_MS;
        console.warn('Noting play per device needs migration 0027 — sent as before:', errorMessage(error));
      }
      // A record given this part just now goes the old way (its part is the
      // legacy one from now on); one already in a device's part waits for
      // 0027 — sent the old way as well, it would count twice.
      rest.push(...toLegacy(kidId, days.filter((r) => chosen.has(r.day)), part));
    }
    const all = [...rest, ...legacy].sort(byDay);
    if (all.length === 0) return;
    if (!historyMissing()) {
      const { error } = await supabase.rpc('note_play_history', { p_kid: kidId, p_days: all.map(sentOf) });
      if (!error) {
        settle(kidId, rest, 'all');
        return settle(kidId, legacy, 'all', true);
      }
      if (notYours(error)) return forgetPlayDays(kidId);
      if (!noFunction(error)) return backOff(kidId, error);
      // Migration 0026 isn't applied (yet): the days alone, as before it; the rest waits on the device.
      historyMissingUntil = Date.now() + MISSING_RECHECK_MS;
      console.warn('Noting play history needs migration 0026 — the days alone are sent:', errorMessage(error));
    }
    const fresh = (list: Kept[]) => list.filter((r) => !r.sent);
    const days = [...new Set(fresh(all).map((r) => r.day))].sort();
    if (days.length === 0) return;
    const { error } = await supabase.rpc('note_play_days', { p_kid: kidId, p_days: days });
    if (error) {
      if (notYours(error)) return forgetPlayDays(kidId);
      if (noFunction(error)) {
        // Migration 0025 isn't applied either: said, and nothing more is sent until it's asked for again.
        missingUntil = Date.now() + MISSING_RECHECK_MS;
        console.warn('Noting the days played failed (kept to send later):', errorMessage(error));
        return;
      }
      return backOff(kidId, error);
    }
    settle(kidId, fresh(rest), 'day');
    settle(kidId, fresh(legacy), 'day', true);
  } catch (err) {
    backOff(kidId, err);
  }
}

/**
 * The tab going out of view sends the kid's waiting days at once (a closing
 * tab included), unless a send just failed. Returns the clean-up.
 */
export function watchPlayDays(kid: () => string | null, win: Window = window): () => void {
  const doc = win.document;
  const onHidden = () => {
    const id = kid();
    if (id && doc.visibilityState === 'hidden') void flushPlayDays(id, { hidden: true });
  };
  doc.addEventListener('visibilitychange', onHidden);
  return () => doc.removeEventListener('visibilitychange', onHidden);
}
