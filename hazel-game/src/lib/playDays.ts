import { supabase } from './supabase';
import { errorMessage, friendlyMessage, NETWORK_MESSAGE, OFFLINE_MESSAGE } from './errors';

/**
 * The days each kid played, for 👪 Grown-ups → 📈 Progress (#29, migration
 * 0025). When a kid plays on a new day (`profileStore.recordActivity`, which
 * every XP the game pays runs through) that day — their device's own calendar
 * day, `YYYY-MM-DD` — is kept on the device first (localStorage, per kid; in
 * memory when storage can't be written) and sent to `note_play_days`; it
 * leaves the device once the database has it. So a day played offline, or
 * before 0025 is applied, is sent later (the database takes days from the
 * last week only, so an older backlog is simply dropped there). Never throws
 * and never holds up play: the dashboard can only be missing a day, never
 * shows one that wasn't played.
 *
 * When a send fails it backs off rather than trying after every round
 * (#29 review round 1): no such function (0025 not applied) → nothing more
 * is sent this session; offline or unreachable → again once the device is
 * back online, or after `RETRY_OFFLINE_MS`; any other refusal → again on the
 * kid's next new day or the next time their profile loads.
 */

const PREFIX = 'hazel-play-days-';

/** At most this many unsent days are kept on a device (the database takes a week back). */
export const PENDING_MAX = 8;

/** After a send that couldn't reach the server, a round's end tries again no sooner than this. */
export const RETRY_OFFLINE_MS = 10 * 60_000;

/** The localStorage key for a kid's unsent days. */
export function playDaysKey(kidId: string): string {
  return `${PREFIX}${kidId}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A kid's unsent days when this device can't write them to storage (private mode, quota): kept for this session. */
const unstored = new Map<string, string[]>();

function readPending(kidId: string): string[] {
  const held = unstored.get(kidId);
  if (held) return held;
  try {
    const raw = localStorage.getItem(playDaysKey(kidId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((d): d is string => typeof d === 'string' && ISO_DAY.test(d)) : [];
  } catch {
    return [];
  }
}

function writePending(kidId: string, days: string[]): void {
  try {
    if (days.length === 0) localStorage.removeItem(playDaysKey(kidId));
    else localStorage.setItem(playDaysKey(kidId), JSON.stringify(days));
    unstored.delete(kidId);
  } catch {
    // Private mode / quota: kept in memory instead, so the day is still sent —
    // this session, or not at all.
    if (days.length === 0) unstored.delete(kidId);
    else unstored.set(kidId, days);
  }
}

/** The unsent days kept for a kid (oldest first). */
export function pendingPlayDays(kidId: string): string[] {
  return readPending(kidId);
}

/** Forget a kid's unsent days (they were removed, or the family's copies leave this device). */
export function forgetPlayDays(kidId: string): void {
  writePending(kidId, []);
  retry.delete(kidId);
}

/** One send per kid at a time; a send asked for meanwhile runs after it. */
const inFlight = new Map<string, Promise<void>>();
/** 0025 isn't applied (no such function): nothing more is sent this session. */
let missing = false;
/** After a failed send: when a kid's days may go again without a new day or a profile load (ms), and whether coming back online should send them. */
const retry = new Map<string, { at: number; offline: boolean }>();
let listening = false;

/** Back online: the kids whose send couldn't reach the server try again now. */
function onOnline(): void {
  for (const [kidId, r] of [...retry]) {
    if (r.offline) void flushPlayDays(kidId, { now: true });
  }
}

/** Note a day a kid played, then send what's waiting (a new day always tries). Fire and forget. */
export function notePlayDay(kidId: string, day: string): Promise<void> {
  if (!ISO_DAY.test(day)) return Promise.resolve();
  const pending = readPending(kidId);
  if (!pending.includes(day)) writePending(kidId, [...pending, day].sort().slice(-PENDING_MAX));
  return flushPlayDays(kidId, { now: true });
}

/**
 * Send a kid's unsent days to the database; on success they leave the device.
 * Never rejects. Without `now` (a round's end) it respects the back-off after
 * a failed send; `now` (a new day, a profile load, back online) tries anyway —
 * unless the database has no such function, which stops it for the session.
 */
export function flushPlayDays(kidId: string, { now = false }: { now?: boolean } = {}): Promise<void> {
  const running = inFlight.get(kidId);
  if (running) return running.then(() => flushPlayDays(kidId, { now }));
  if (missing || readPending(kidId).length === 0) return Promise.resolve();
  if (!now && Date.now() < (retry.get(kidId)?.at ?? 0)) return Promise.resolve();
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
  retry.set(kidId, { at: offline ? Date.now() + RETRY_OFFLINE_MS : Number.POSITIVE_INFINITY, offline });
  if (offline && !listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('online', onOnline);
  }
  console.warn('Noting the days played failed (kept to send later):', errorMessage(err));
}

async function sendPending(kidId: string): Promise<void> {
  const days = readPending(kidId);
  try {
    const { error } = await supabase.rpc('note_play_days', { p_kid: kidId, p_days: days });
    if (error) {
      // Not this family's kid (removed elsewhere): those days can never be sent.
      if (/not your player/i.test(error.message ?? '')) {
        forgetPlayDays(kidId);
        return;
      }
      if (error.code === 'PGRST202' || error.code === '42883') {
        // Migration 0025 isn't applied: said once, and nothing more is sent this session.
        missing = true;
        console.warn('Noting the days played failed (kept to send later):', errorMessage(error));
        return;
      }
      backOff(kidId, error);
      return;
    }
    retry.delete(kidId);
    // Sent: drop exactly what went (a day noted meanwhile stays for the next send).
    writePending(kidId, readPending(kidId).filter((d) => !days.includes(d)));
  } catch (err) {
    backOff(kidId, err);
  }
}
