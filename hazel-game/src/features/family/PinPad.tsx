import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage, sessionRanOut } from '../../lib/errors';
import { PIN_LENGTH } from '../../content/family';
import { cn } from '../../lib/utils';
import {
  forgetLock,
  KID_LOCKED_TEXT,
  lockLeft,
  pinCheckMessage,
  pinVerdict,
  PIN_READY_TEXT,
  rememberLock,
  triesLeftText,
  waitLength,
  type PinPadFor,
  type PinVerdict,
} from '../../lib/pinLock';
import { useLiveMessage } from '../auth/useLiveMessage';
import SignInAgainButton from './SignInAgainButton';

/** Wrong PINs in a row before a rest, when the database counts nothing (before migration 0022). */
export const PIN_TRIES = 5;
/** How long that rest lasts. */
export const PIN_BREAK_MS = 30_000;
/**
 * While the database has a PIN locked, how often the pad asks it again
 * (as well as on opening and whenever the tab comes back into view): a new
 * PIN set on another device lifts the lock, and the pad must not outlive it.
 */
export const LOCK_RECHECK_MS = 15_000;
/**
 * A tap on a locked pad asks the database again, at most this often: the
 * grown-up may have just unlocked it on their phone and said "try now"
 * (#124c review round 2).
 */
export const TAP_RECHECK_MS = 3_000;
/**
 * Opened on a lock it remembered, the pad asks the database before it shows
 * (or says) the lock, so a lock lifted elsewhere just opens — it shows the
 * lock it remembers if no answer comes in this long.
 */
export const CONFIRM_LOCK_MS = 1_500;
/** Say how many tries are left once this few remain. */
const WARN_AT = 2;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Four dots and a big number pad (#124): how a kid opens their profile, and a
 * grown-up 👪 Grown-ups. The last digit sends the PIN to `onSubmit`, which
 * answers with the database's verdict (`PinVerdict`, #124c) or a plain
 * true / false; right = the screen moves on. A wrong one clears the dots and
 * says so (`wrongText`, then `forgotText` — or, with two or fewer tries left,
 * how many remain instead).
 *
 * The database locks a PIN after 5 wrong tries in a row (1, then 5, then 15
 * minutes, then an hour — migration 0022): the pad then says so in plain
 * words (`lockedText`, with no time in it), counts the wait down in words
 * ("5 minutes" — the one place the time is said), and takes no digits until
 * it's over. `lockKey` remembers the lock for this tab, but the database
 * decides: opened again on a remembered lock, the pad asks it first
 * (`checkLock`, "Checking…") and shows the lock only if it still holds; it
 * asks again when the tab comes back, every `LOCK_RECHECK_MS` and when a
 * locked key is tapped (`TAP_RECHECK_MS`), and a lock lifted elsewhere (a
 * grown-up setting the PIN again on their phone) opens the pad. Against an
 * older database (a bare true / false) the pad keeps its own brake: 5 wrong
 * in a row rests it for 30 s. A check that fails because the sign-in ran out
 * offers "Sign in again" (on a kid's pad, for a grown-up). Typing digits on a
 * keyboard works too; keys wait with `aria-disabled`, so the keyboard keeps
 * its place, and while locked they leave the Tab order. On a phone on its
 * side the pad and its words sit side by side, keys 44 px tall.
 */
export default function PinPad({
  onSubmit,
  wrongText = 'Not quite — try again!',
  forgotText,
  lockedText = KID_LOCKED_TEXT,
  lockedHelp,
  lockKey,
  checkLock,
  who = 'kid',
  onLockedChange,
  beside,
}: {
  onSubmit: (pin: string) => Promise<boolean | PinVerdict>;
  wrongText?: string;
  /** Said after `wrongText` on a wrong try, unless the tries-left warning takes its place. */
  forgotText?: string;
  /** The words for a locked PIN (the countdown under them says how long). */
  lockedText?: string;
  /** A smaller line under the countdown while locked (who can help). */
  lockedHelp?: string;
  /** Which PIN this is (`kidLockKey(id)` / `grownUpLockKey(userId)`), to remember a lock. */
  lockKey?: string;
  /** Seconds left on this PIN's lock by the database's count (0: open), or null when it can't say. */
  checkLock?: () => Promise<number | null>;
  /** Whose pad: a kid's words ask a grown-up for what only a grown-up can fix. */
  who?: PinPadFor;
  /** Told when the pad locks and opens, so the screen around it can say so too. */
  onLockedChange?: (locked: boolean) => void;
  /**
   * The screen's own buttons (another way in, the way out), under the pad's
   * words: below the pad on a tall screen, and on a short one (a phone on its
   * side) in the column beside it, so they're on screen with it
   * (#167 review round 1).
   */
  beside?: ReactNode;
}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrongs, setWrongs] = useState(0);
  // When the lock this pad knows about ends (ms), and the clock it counts down by.
  const [lockUntil, setLockUntil] = useState<number | null>(() => {
    const left = lockKey ? lockLeft(lockKey) : 0;
    return left > 0 ? Date.now() + left * 1000 : null;
  });
  // The lock came from the database (a remembered one always did), so the database can lift it.
  const [serverLock, setServerLock] = useState(() => lockUntil !== null);
  // Opened on a lock it remembered: the database is asked before the lock is shown or said.
  const [confirming, setConfirming] = useState(() => lockUntil !== null && checkLock !== undefined);
  const [now, setNow] = useState(() => Date.now());
  const left = lockUntil === null ? 0 : Math.max(0, Math.ceil((lockUntil - now) / 1000));
  const locked = left > 0;
  // What the pad shows: the lock, once it's known to hold.
  const shownLock = locked && !confirming;
  // Keyed, so the same words said twice ("Not quite…") are read out twice. It
  // starts empty: a live region doesn't read what it opens with.
  const [message, setMessage] = useLiveMessage();
  // The check failed because the sign-in ran out: offer the way back in.
  const [signedOut, setSignedOut] = useState(false);
  // The latest callbacks, for effects that shouldn't re-run when a parent passes new ones.
  const checkLockRef = useRef(checkLock);
  const onLockedChangeRef = useRef(onLockedChange);
  const confirmingRef = useRef(confirming);
  useEffect(() => {
    checkLockRef.current = checkLock;
    onLockedChangeRef.current = onLockedChange;
    confirmingRef.current = confirming;
  });
  // When the database was last asked, so taps on a locked pad ask it only so often.
  const lastAsked = useRef(0);
  // The running re-check's own ask, for a tap on a locked key.
  const askSoon = useRef<(() => void) | null>(null);
  const opening = useRef(shownLock ? lockedText : null);

  // Opened on a lock it remembered (and nobody to ask): say so as it opens, so a screen reader hears it.
  useEffect(() => {
    if (opening.current) setMessage(opening.current);
  }, [setMessage]);

  useEffect(() => {
    onLockedChangeRef.current?.(shownLock);
  }, [shownLock]);

  /** The database still holds the remembered lock (or can't say, or took too long): show it now. */
  function showLock() {
    confirmingRef.current = false;
    setConfirming(false);
    setMessage(lockedText);
  }

  function openPad() {
    setLockUntil(null);
    setServerLock(false);
    setConfirming(false);
    setWrongs(0);
    if (lockKey) forgetLock(lockKey);
    setMessage(PIN_READY_TEXT);
  }

  // No answer in time: the lock it remembers shows (a later answer can still open it).
  useEffect(() => {
    if (!confirming || !locked) return;
    const t = window.setTimeout(showLock, CONFIRM_LOCK_MS);
    return () => window.clearTimeout(t);
    // showLock is this pad's own; the waiting is what re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, locked]);

  // Count the lock down, and open the pad again when it's over.
  useEffect(() => {
    if (lockUntil === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const open = window.setTimeout(
      () => {
        setLockUntil(null);
        setServerLock(false);
        setConfirming(false);
        setWrongs(0);
        setMessage(PIN_READY_TEXT);
      },
      Math.max(0, lockUntil - Date.now()),
    );
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(open);
    };
  }, [lockUntil, setMessage]);

  // While the database holds this PIN locked, ask it again: now, whenever the
  // tab comes back, every LOCK_RECHECK_MS and when a locked key is tapped. A
  // remembered deadline never outlives the database's own answer.
  useEffect(() => {
    if (!locked || !serverLock) return;
    let live = true;
    const ask = async () => {
      const check = checkLockRef.current;
      if (!check) return;
      lastAsked.current = Date.now();
      const secs = await check().catch(() => null);
      if (!live) return;
      if (secs !== null && secs <= 0) {
        openPad();
        return;
      }
      if (secs !== null) {
        const at = Date.now();
        setNow(at);
        setLockUntil(at + secs * 1000);
        if (lockKey) rememberLock(lockKey, secs, at);
      }
      if (confirmingRef.current) showLock();
    };
    askSoon.current = () => {
      if (Date.now() - lastAsked.current >= TAP_RECHECK_MS) void ask();
    };
    void ask();
    const every = window.setInterval(() => void ask(), LOCK_RECHECK_MS);
    const back = () => {
      if (document.visibilityState === 'visible') void ask();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      live = false;
      askSoon.current = null;
      window.clearInterval(every);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
    // openPad / showLock / lockKey are this pad's own; the lock's state is what re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, serverLock]);

  function lockFor(secs: number, fromServer: boolean) {
    const at = Date.now();
    setNow(at);
    setLockUntil(at + secs * 1000);
    setServerLock(fromServer);
    if (fromServer && lockKey) rememberLock(lockKey, secs, at);
    setMessage(lockedText);
  }

  function wrongWords(triesLeft: number | null): string {
    if (triesLeft !== null && triesLeft > 0 && triesLeft <= WARN_AT) return `${wrongText} ${triesLeftText(triesLeft)}`;
    return forgotText ? `${wrongText} ${forgotText}` : wrongText;
  }

  async function press(d: string) {
    // A tap on a locked pad: maybe it was just unlocked elsewhere — ask (now and then).
    if (locked) askSoon.current?.();
    if (busy || locked) return;
    const next = (digits + d).slice(0, PIN_LENGTH);
    setDigits(next);
    if (next.length < PIN_LENGTH) return;
    setMessage(null);
    setSignedOut(false);
    setBusy(true);
    try {
      const answer = await onSubmit(next);
      const verdict = typeof answer === 'boolean' ? pinVerdict(answer) : answer;
      if (verdict.ok) return;
      if (verdict.waitSeconds > 0) {
        lockFor(verdict.waitSeconds, true);
      } else if (verdict.limited) {
        setMessage(wrongWords(verdict.triesLeft));
      } else {
        // An older database counts nothing: the pad's own brake.
        const n = wrongs + 1;
        setWrongs(n);
        if (n >= PIN_TRIES) lockFor(PIN_BREAK_MS / 1000, false);
        else setMessage(wrongWords(null));
      }
    } catch (err) {
      // Not a wrong try: the check didn't happen.
      console.warn('Checking a PIN failed:', errorMessage(err));
      setSignedOut(sessionRanOut(err));
      setMessage(pinCheckMessage(err, who));
    } finally {
      setBusy(false);
      setDigits('');
    }
  }

  function back() {
    if (locked) askSoon.current?.();
    if (!busy && !locked) setDigits((d) => d.slice(0, -1));
  }

  // Digits from a keyboard (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) void press(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="[@media(max-height:500px)]:flex [@media(max-height:500px)]:items-center [@media(max-height:500px)]:gap-5">
      <div className="[@media(max-height:500px)]:w-56 [@media(max-height:500px)]:shrink-0">
        <div className="flex justify-center gap-3 mb-4 [@media(max-height:500px)]:mb-1" role="img" aria-label={`${digits.length} of ${PIN_LENGTH} digits`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-4 w-4 rounded-full border-2 border-purple-500 transition',
                i < digits.length ? 'bg-purple-500' : 'bg-transparent',
                shownLock && 'border-gray-300',
              )}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 max-w-[16rem] mx-auto [@media(max-height:500px)]:gap-1.5">
          {KEYS.map((k, i) =>
            k === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => (k === '⌫' ? back() : void press(k))}
                aria-disabled={busy || locked}
                // Locked for minutes: the keyboard goes straight past them (one already focused keeps its place).
                tabIndex={shownLock ? -1 : undefined}
                aria-label={k === '⌫' ? 'Delete' : k}
                className="h-14 [@media(max-height:500px)]:h-11 rounded-2xl bg-purple-50 hover:bg-purple-100 text-2xl font-semibold text-purple-800 transition aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-purple-50"
              >
                {k}
              </button>
            ),
          )}
        </div>
      </div>
      <div className="[@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1">
        {/* Always there, so each message is read out as it appears. */}
        <div role="status" className="mt-3 min-h-10 text-center text-sm text-amber-800 [@media(max-height:500px)]:mt-0">
          {busy || confirming ? <p>Checking…</p> : message && <p key={message.key}>{message.text}</p>}
        </div>
        {signedOut && !busy && (
          // A kid can't sign in: the button says whose job it is.
          <SignInAgainButton label={who === 'kid' ? 'Grown-ups: sign in again' : 'Sign in again'} />
        )}
        {shownLock && (
          // Not a live region: a screen reader would read every second.
          <div className="text-center" data-testid="pin-lock">
            <p className="text-lg font-bold text-purple-800">
              <span aria-hidden="true">🔒 </span>Try again in {waitLength(left)}
            </p>
            {lockedHelp && <p className="mt-1 text-xs text-gray-600">{lockedHelp}</p>}
          </div>
        )}
        {beside}
      </div>
    </div>
  );
}
