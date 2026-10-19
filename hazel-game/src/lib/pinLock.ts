import { plainErrorOr } from './familyErrors';

/**
 * A PIN try, as the database answers it (#124c, migration 0022): `try_kid_pin`
 * / `try_parent_pin` count wrong tries and lock a PIN after 5 in a row — for
 * 1 minute, then 5, then 15, then an hour — so the pad can say how long to
 * wait and count it down. An older database (before 0022) answers a bare
 * true / false from `check_kid_pin` / `check_parent_pin`; the pad then keeps
 * its own short rest, as before.
 */

export interface PinVerdict {
  /** The PIN was right. */
  ok: boolean;
  /** Wrong tries left before the next lock (null: nothing was counted). */
  triesLeft: number | null;
  /** Seconds until the PIN can be tried again (0: not locked). */
  waitSeconds: number;
  /** The database counted this try (0022 is applied); false for a bare true / false. */
  limited: boolean;
}

/** What `try_kid_pin` / `try_parent_pin` (or the old boolean checks) returned, read safely. */
export function pinVerdict(data: unknown): PinVerdict {
  if (typeof data === 'boolean') return { ok: data, triesLeft: null, waitSeconds: 0, limited: false };
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const wait = Number(o.wait_seconds);
    const tries = o.tries_left;
    return {
      ok: o.ok === true,
      triesLeft: typeof tries === 'number' && Number.isFinite(tries) ? Math.max(0, Math.floor(tries)) : null,
      waitSeconds: Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 0,
      limited: true,
    };
  }
  return { ok: false, triesLeft: null, waitSeconds: 0, limited: false };
}

/** The database has no such function (its migration isn't applied yet): PostgREST's code, or Postgres's. */
export function functionMissing(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const o = err as Record<string, unknown>;
  return o.code === 'PGRST202' || o.code === '42883' || /could not find the function/i.test(String(o.message ?? ''));
}

/** A wait in words a kid knows, rounded up: "45 seconds", "1 minute", "5 minutes", "1 hour". */
export function waitLength(secs: number): string {
  const s = Math.max(1, Math.ceil(secs));
  if (s < 60) return `${s} ${s === 1 ? 'second' : 'seconds'}`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  const h = Math.ceil(m / 60);
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** The countdown on the pad: "4:05", "0:09". */
export function countdownClock(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A kid's PIN, locked (#124c): short and kind, and says who can help. */
export function kidLockedText(wait: string): string {
  return `Too many tries — ask a grown-up, or wait ${wait}.`;
}

/** The grown-up's PIN, locked: their password always works. */
export function grownUpLockedText(wait: string): string {
  return `Too many tries. Use your password instead, or wait ${wait}.`;
}

/** Said when a lock runs out. */
export const PIN_READY_TEXT = 'You can try again now.';

/** Said when the check itself didn't happen (not a wrong try). */
export const PIN_CHECK_FAILED = "We couldn't check that PIN just now. Please try again.";

/**
 * Words for a PIN check that failed: the connection's or the server's trouble
 * when that's it, a run-out sign-in, else `PIN_CHECK_FAILED` — never the
 * database's own words. Log `errorMessage(err)` beside it.
 */
export function pinCheckMessage(err: unknown): string {
  return plainErrorOr(err, PIN_CHECK_FAILED);
}

/** Read out with a wrong try when few are left: "2 more tries before a rest." */
export function triesLeftText(n: number): string {
  return `${n} more ${n === 1 ? 'try' : 'tries'} before a rest.`;
}

/**
 * Locks this tab has heard about, by PIN (`kidLockKey` / `GROWN_UP_LOCK`), so
 * a pad opened again shows the wait at once instead of after a try. Only a
 * convenience: the database is what enforces it, and a reload forgets these.
 */
const locks = new Map<string, number>();

export const GROWN_UP_LOCK = 'grown-up';
export function kidLockKey(kidId: string): string {
  return `kid:${kidId}`;
}

export function rememberLock(key: string, waitSeconds: number, now = Date.now()): void {
  if (waitSeconds > 0) locks.set(key, now + waitSeconds * 1000);
}

/** Whole seconds left on a remembered lock (0 when none, or it has run out). */
export function lockLeft(key: string, now = Date.now()): number {
  const until = locks.get(key);
  if (until === undefined) return 0;
  const left = Math.ceil((until - now) / 1000);
  if (left <= 0) locks.delete(key);
  return Math.max(0, left);
}

/** A new PIN unlocks it (the database clears its count too). */
export function forgetLock(key: string): void {
  locks.delete(key);
}

export function forgetAllLocks(): void {
  locks.clear();
}
