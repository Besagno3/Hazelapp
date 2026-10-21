import { supabase } from './supabase';
import { errorMessage } from './errors';

/**
 * The days each kid played, for 👪 Grown-ups → 📈 Progress (#29, migration
 * 0025). When a kid plays on a new day (`profileStore.recordActivity`) that
 * day — their device's own calendar day, `YYYY-MM-DD` — is kept on the device
 * first (localStorage, per kid) and sent to `note_play_days`; it leaves the
 * device once the database has it. So a day played offline, or before 0025 is
 * applied, is sent the next time the kid plays or their profile loads (the
 * database takes days from the last week only, so an older backlog is simply
 * dropped there). Never throws and never holds up play: the dashboard can only
 * be missing a day, never shows one that wasn't played.
 */

const PREFIX = 'hazel-play-days-';

/** At most this many unsent days are kept on a device (the database takes a week back). */
export const PENDING_MAX = 8;

/** The localStorage key for a kid's unsent days. */
export function playDaysKey(kidId: string): string {
  return `${PREFIX}${kidId}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function readPending(kidId: string): string[] {
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
  } catch {
    // Private mode / quota: the day is sent now or not at all.
  }
}

/** The unsent days kept for a kid (oldest first). */
export function pendingPlayDays(kidId: string): string[] {
  return readPending(kidId);
}

/** Forget a kid's unsent days (they were removed, or the family's copies leave this device). */
export function forgetPlayDays(kidId: string): void {
  writePending(kidId, []);
}

/** One send per kid at a time; a send asked for meanwhile runs after it. */
const inFlight = new Map<string, Promise<void>>();
/** A missing function (0025 not applied) is said once a session, not on every new day. */
let saidMissing = false;

/** Note a day a kid played, then try to send what's waiting. Fire and forget. */
export function notePlayDay(kidId: string, day: string): Promise<void> {
  if (!ISO_DAY.test(day)) return Promise.resolve();
  const pending = readPending(kidId);
  if (!pending.includes(day)) writePending(kidId, [...pending, day].sort().slice(-PENDING_MAX));
  return flushPlayDays(kidId);
}

/** Send a kid's unsent days to the database; on success they leave the device. Never rejects. */
export function flushPlayDays(kidId: string): Promise<void> {
  const running = inFlight.get(kidId);
  if (running) return running.then(() => flushPlayDays(kidId));
  if (readPending(kidId).length === 0) return Promise.resolve();
  const send = sendPending(kidId).finally(() => inFlight.delete(kidId));
  inFlight.set(kidId, send);
  return send;
}

async function sendPending(kidId: string): Promise<void> {
  const days = readPending(kidId);
  try {
    const { error } = await supabase.rpc('note_play_days', { p_kid: kidId, p_days: days });
    if (error) {
      // Not this family's kid (removed elsewhere): those days can never be sent.
      if (/not your player/i.test(error.message ?? '')) {
        writePending(kidId, []);
        return;
      }
      const missing = error.code === 'PGRST202' || error.code === '42883';
      if (!missing || !saidMissing) console.warn('Noting the days played failed (kept to send later):', errorMessage(error));
      if (missing) saidMissing = true;
      return;
    }
    // Sent: drop exactly what went (a day noted meanwhile stays for the next send).
    writePending(kidId, readPending(kidId).filter((d) => !days.includes(d)));
  } catch (err) {
    console.warn('Noting the days played failed (kept to send later):', errorMessage(err));
  }
}
