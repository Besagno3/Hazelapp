import { supabase } from './supabase';
import { errorMessage, friendlyMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE } from './errors';
import { isoOffset, todayIso } from './streak';
import type { PlayDayRecord, TopicTally } from '../types';

/**
 * The days each kid played, and their play on each day — the XP earned
 * (#169), the active minutes (#172) and the answers per topic (#173) — for
 * 👪 Grown-ups → 📈 Progress (#29, migrations 0025 and 0026). Each day is a
 * `PlayDayRecord` kept on the device first (localStorage, per kid; in memory
 * when storage can't be written) and grows as the kid plays; it's sent to
 * `note_play_history`, which keeps the larger total for a day (and per topic
 * the tally with more answers). So **today's record stays on the device after
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
 * this device's to send too once it has play of its own: the database keeps
 * the larger of the two, so this device's play is never left out of 📈.
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
 * The records have their own storage key (review round 1, #178): a tab still
 * running a build from before them reads and writes `hazel-play-days-<kid>`
 * as a list of bare days, and would have written over the records. Days such
 * a tab leaves there are folded in here (as days played, nothing else
 * known) and the old key is cleared, so neither build writes over the other.
 *
 * When a send fails it backs off rather than trying after every round
 * (#29 review round 1): no `note_play_history` (0026 not applied) → the days
 * alone go to `note_play_days` as before, and the rest of each record stays
 * on the device until 0026 is found (while it's within the week); neither
 * function (0025 not applied either) → nothing more is sent. Either is
 * asked about again after `MISSING_RECHECK_MS` and on the next profile load
 * (`recheckPlayFunctions`; review round 2: remembered for the tab's whole
 * life, a family tablet left open across the deploy kept sending days alone
 * and dropped a week of play); offline or unreachable → again once the
 * device is back online, or after `RETRY_OFFLINE_MS`; any other refusal →
 * again on the kid's next new day or the next time their profile loads.
 */

const PREFIX = 'hazel-play-history-';

/** Where a build from before the day records keeps a kid's unsent days (bare `YYYY-MM-DD`s): read and folded in, never written. */
const OLD_PREFIX = 'hazel-play-days-';

/** At most this many days are kept on a device (today and the week the database takes back). */
export const PENDING_MAX = 8;

/** After a send that couldn't reach the server, a round's end tries again no sooner than this. */
export const RETRY_OFFLINE_MS = 10 * 60_000;

/** After a send, the next one asked for without `now` waits at least this long (not one call per answer). */
export const SEND_EVERY_MS = 2 * 60_000;

/** A note function the database didn't have (a migration not applied yet) is asked for again after this long (review round 2). */
export const MISSING_RECHECK_MS = 10 * 60_000;

/** The database's limits on a day (migration 0026): what a record is clamped to here too. */
const MAX_XP = 100_000;
const MAX_MINUTES = 1_440;
const MAX_ANSWERS = 10_000;
const MAX_TOPICS = 16;
const TOPIC_KEY = /^[a-z]{1,24}$/;

/** The localStorage key for a kid's kept days. */
export function playDaysKey(kidId: string): string {
  return `${PREFIX}${kidId}`;
}

/** The key a build from before the day records keeps a kid's unsent days under (#29, migration 0025). */
export function oldPlayDaysKey(kidId: string): string {
  return `${OLD_PREFIX}${kidId}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day as this device keeps it: the record, whether the day counts as
 * played (only then is it sent), and what the database has of it — nothing,
 * the day alone (`note_play_days`, before 0026), or all of it as it stands.
 */
interface Kept extends PlayDayRecord {
  played?: true;
  sent?: 'day' | 'all';
}

/** A kid's kept days when this device can't write them to storage (private mode, quota): kept for this session. */
const unstored = new Map<string, Kept[]>();

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0);
const isLevel = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 10;

/** A topic's tally as stored, or null when it's junk. */
function tallyFrom(v: unknown): TopicTally | null {
  if (!isRecord(v)) return null;
  const a = count(v.a, MAX_ANSWERS);
  const tally: TopicTally = { a, r: Math.min(a, count(v.r, MAX_ANSWERS)) };
  if (isLevel(v.l)) tally.l = v.l;
  return tally;
}

/** One stored day: a bare day (the format before 0026 — a day played, nothing sent) or a record; anything else is null. */
function keptFrom(v: unknown): Kept | null {
  if (typeof v === 'string') return ISO_DAY.test(v) ? { day: v, xp: 0, minutes: 0, topics: {}, played: true } : null;
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
 * under the old key folded in: each a day played (the rest of a record kept
 * here stays as it is).
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
    else if (kept.played) had.played = true;
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/**
 * Keep a kid's days: oldest first; a day the database won't take any more
 * (older than 7 back), a past day it has as it stands, and a day more than
 * one ahead (a device clock that was set ahead: the database never takes it,
 * and it would hold one of the `PENDING_MAX` places for good — review round
 * 2) leave; at most `PENDING_MAX`.
 */
function writeKept(kidId: string, list: Kept[]): void {
  const today = todayIso();
  const oldest = isoOffset(today, -7);
  const newest = isoOffset(today, 1);
  const days = list
    .filter((r) => r.day >= oldest && r.day <= newest && !(r.sent === 'all' && r.day < today))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-PENDING_MAX);
  try {
    if (days.length === 0) localStorage.removeItem(playDaysKey(kidId));
    else localStorage.setItem(playDaysKey(kidId), JSON.stringify(days));
    // An older build's days were read in with the rest (`readKept`): they're here now.
    localStorage.removeItem(oldPlayDaysKey(kidId));
    unstored.delete(kidId);
  } catch {
    // Private mode / quota: kept in memory instead, so the day is still sent —
    // this session, or not at all.
    if (days.length === 0) unstored.delete(kidId);
    else unstored.set(kidId, days);
  }
}

/** The part of a record the database keeps. */
const contents = (r: PlayDayRecord): string => JSON.stringify([r.xp, r.minutes, r.topics]);
const recordOf = ({ day, xp, minutes, topics }: Kept): PlayDayRecord => ({ day, xp, minutes, topics });

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

/** The days kept for a kid with something still to send (oldest first). */
export function pendingPlayDays(kidId: string): string[] {
  return readKept(kidId)
    .filter((r) => r.played && r.sent !== 'all')
    .map((r) => r.day);
}

/** The records kept on this device for a kid (oldest first) — sent or not. */
export function playDayRecords(kidId: string): PlayDayRecord[] {
  return readKept(kidId).map(recordOf);
}

/** Forget a kid's kept days, under either key (they were removed, or the family's copies leave this device). */
export function forgetPlayDays(kidId: string): void {
  writeKept(kidId, []);
  wait.delete(kidId);
}

/** One send per kid at a time; a send asked for meanwhile runs after it. */
const inFlight = new Map<string, Promise<void>>();
/** Until when (ms) neither function is asked for (0025 isn't applied): nothing is sent meanwhile. */
let missingUntil = 0;
/** Until when (ms) `note_play_history` isn't asked for (0026 isn't applied): the days alone go to `note_play_days` meanwhile. */
let historyMissingUntil = 0;
const missing = () => Date.now() < missingUntil;
const historyMissing = () => Date.now() < historyMissingUntil;

/**
 * Ask the database for the note functions again on the next send, though a
 * send found one missing a while ago (a profile load does — review round 2:
 * a migration applied since is found at once, not only after
 * `MISSING_RECHECK_MS`).
 */
export function recheckPlayFunctions(): void {
  missingUntil = 0;
  historyMissingUntil = 0;
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
  const list = readKept(kidId);
  if (!list.some((r) => !r.played && played(r.day))) return;
  writeKept(kidId, list.map((r) => (!r.played && played(r.day) ? { ...r, played: true as const } : r)));
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

/** What's waiting to go for a kid: played days the database doesn't have as they stand (or, before 0026, the days themselves). */
function toSend(kidId: string): Kept[] {
  return readKept(kidId).filter((r) => r.played && (historyMissing() ? !r.sent : r.sent !== 'all'));
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
  if (missing() || toSend(kidId).length === 0) return Promise.resolve();
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
 * its day, at least, is there.
 */
function settle(kidId: string, sent: Kept[], what: 'day' | 'all'): void {
  const list = readKept(kidId).map((r) => {
    const was = sent.find((s) => s.day === r.day);
    if (!was) return r;
    if (what === 'all' && contents(r) === contents(was)) return { ...r, sent: 'all' as const };
    return r.sent ? r : { ...r, sent: 'day' as const };
  });
  writeKept(kidId, list);
  wait.set(kidId, { at: Date.now() + SEND_EVERY_MS, failed: false, offline: false });
}

async function sendPending(kidId: string): Promise<void> {
  const records = toSend(kidId);
  try {
    if (!historyMissing()) {
      const { error } = await supabase.rpc('note_play_history', { p_kid: kidId, p_days: records.map(recordOf) });
      if (!error) return settle(kidId, records, 'all');
      if (notYours(error)) return forgetPlayDays(kidId);
      if (!noFunction(error)) return backOff(kidId, error);
      // Migration 0026 isn't applied (yet): the days alone, as before it; the rest waits on the device.
      historyMissingUntil = Date.now() + MISSING_RECHECK_MS;
      console.warn('Noting play history needs migration 0026 — the days alone are sent:', errorMessage(error));
    }
    const days = records.filter((r) => !r.sent);
    if (days.length === 0) return;
    const { error } = await supabase.rpc('note_play_days', { p_kid: kidId, p_days: days.map((r) => r.day) });
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
    settle(kidId, days, 'day');
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
