import { plainErrorOr } from './familyErrors';
import { NETWORK_MESSAGE, OFFLINE_MESSAGE, sessionRanOut } from './errors';

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

/** A kid's PIN, locked (#124c): short and kind — a break, not a telling-off — and says who can help. */
export function kidLockedText(wait: string): string {
  return `That's a lot of tries! Take a break for ${wait}, or ask a grown-up.`;
}

/** The grown-up's PIN, locked: their password always works. */
export function grownUpLockedText(wait: string): string {
  return `Too many tries. Use your password instead, or wait ${wait}.`;
}

/** Said when a lock runs out. */
export const PIN_READY_TEXT = 'You can try again now.';

/** Said when the check itself didn't happen (not a wrong try). */
export const PIN_CHECK_FAILED = "We couldn't check that PIN just now. Please try again.";

/** A kid's pad when the family's sign-in has run out: a grown-up has to sign in again. */
export const KID_SIGNED_OUT = 'The sign-in ran out. Ask a grown-up to sign in again.';

/** Whose pad it is: a kid's words say who can help; a grown-up's are plain. */
export type PinPadFor = 'kid' | 'grown-up';

/**
 * Words for a PIN check that failed: the connection's or the server's trouble
 * when that's it, a run-out sign-in, else `PIN_CHECK_FAILED` — never the
 * database's own words. A kid is asked to fetch a grown-up for what only a
 * grown-up can fix (the internet, signing in). Log `errorMessage(err)` beside it.
 */
export function pinCheckMessage(err: unknown, who: PinPadFor = 'kid'): string {
  const words = plainErrorOr(err, PIN_CHECK_FAILED);
  if (who === 'grown-up') return words;
  if (sessionRanOut(err)) return KID_SIGNED_OUT;
  if (words === OFFLINE_MESSAGE) return "You're offline. Ask a grown-up to check the internet, then try again.";
  if (words === NETWORK_MESSAGE) return "We couldn't reach Hazel Quest. Ask a grown-up to check the internet, then try again.";
  return words;
}

/** Read out with a wrong try when few are left: "2 more tries, then a short break." */
export function triesLeftText(n: number): string {
  return `${n} more ${n === 1 ? 'try' : 'tries'}, then a short break.`;
}

/** What's locked right now, by the database's count (`pin_lock_status`, migration 0022): seconds left. */
export interface PinLocks {
  /** Each locked kid's id → seconds left (an unlocked kid isn't listed). */
  kids: Record<string, number>;
  /** Seconds left on the grown-up PIN (0: not locked). */
  grownUp: number;
}

/** `pin_lock_status`'s answer, read safely (junk reads as nothing locked). */
export function pinLocksFrom(data: unknown): PinLocks {
  const o = (typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const secs = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
  };
  const kids: Record<string, number> = {};
  if (typeof o.kids === 'object' && o.kids !== null && !Array.isArray(o.kids)) {
    for (const [id, v] of Object.entries(o.kids as Record<string, unknown>)) if (secs(v) > 0) kids[id] = secs(v);
  }
  return { kids, grownUp: secs(o.grown_up) };
}

/**
 * Locks this tab has heard about, by PIN (`kidLockKey` / `grownUpLockKey`),
 * so a pad opened again shows the wait at once instead of after a try. Only a
 * hint for the first moment: the database is what enforces it, and the pad
 * asks it again (`pin_lock_status`) — so a lock lifted on another device
 * never keeps the pad shut. A reload or a sign-out forgets these.
 */
const locks = new Map<string, number>();

export function kidLockKey(kidId: string): string {
  return `kid:${kidId}`;
}
/** The grown-up PIN's lock, per login: one grown-up's lock is never another's. */
export function grownUpLockKey(userId: string | null): string {
  return `grown-up:${userId ?? ''}`;
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

/** Signed out (or the account closed): no lock is remembered for the next login. */
export function forgetAllLocks(): void {
  locks.clear();
}
