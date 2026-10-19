import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { PIN_LENGTH } from '../../content/family';
import { cn } from '../../lib/utils';
import {
  countdownClock,
  kidLockedText,
  lockLeft,
  pinCheckMessage,
  pinVerdict,
  PIN_READY_TEXT,
  rememberLock,
  triesLeftText,
  waitLength,
  type PinVerdict,
} from '../../lib/pinLock';
import { useLiveMessage } from '../auth/useLiveMessage';

/** Wrong PINs in a row before a rest, when the database counts nothing (before migration 0022). */
export const PIN_TRIES = 5;
/** How long that rest lasts. */
export const PIN_BREAK_MS = 30_000;
/** Say how many tries are left once this few remain. */
const WARN_AT = 2;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Four dots and a big number pad (#124): how a kid opens their profile, and a
 * grown-up 👪 Grown-ups. The last digit sends the PIN to `onSubmit`, which
 * answers with the database's verdict (`PinVerdict`, #124c) or a plain
 * true / false; right = the screen moves on. A wrong one clears the dots and
 * says so (and, with two or fewer left, how many tries remain).
 *
 * The database locks a PIN after 5 wrong tries in a row (1, then 5, then 15
 * minutes, then an hour — migration 0022): the pad then says so in plain
 * words (`lockedText`), counts the wait down, and takes no digits until it's
 * over. `lockKey` remembers the lock for this tab, so opening the pad again
 * shows the wait at once. Against an older database (a bare true / false)
 * the pad keeps its own brake: 5 wrong in a row rests it for 30 s. Typing
 * digits on a keyboard works too. Keys wait with `aria-disabled`, so the
 * keyboard keeps its place.
 */
export default function PinPad({
  onSubmit,
  wrongText = 'Not quite — try again!',
  lockedText = kidLockedText,
  lockedHelp,
  lockKey,
}: {
  onSubmit: (pin: string) => Promise<boolean | PinVerdict>;
  wrongText?: string;
  /** The words for a locked PIN, given how long to wait ("5 minutes"). */
  lockedText?: (wait: string) => string;
  /** A smaller line under the countdown while locked (who can help). */
  lockedHelp?: string;
  /** Which PIN this is (`kidLockKey(id)` / `GROWN_UP_LOCK`), to remember a lock. */
  lockKey?: string;
}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrongs, setWrongs] = useState(0);
  // When the lock this pad knows about ends (ms), and the clock it counts down by.
  const [lockUntil, setLockUntil] = useState<number | null>(() => {
    const left = lockKey ? lockLeft(lockKey) : 0;
    return left > 0 ? Date.now() + left * 1000 : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const left = lockUntil === null ? 0 : Math.max(0, Math.ceil((lockUntil - now) / 1000));
  const locked = left > 0;
  // Keyed, so the same words said twice ("Not quite…") are read out twice.
  const [message, setMessage] = useLiveMessage(locked ? lockedText(waitLength(left)) : null);

  // Count the lock down, and open the pad again when it's over.
  useEffect(() => {
    if (lockUntil === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const open = window.setTimeout(
      () => {
        setLockUntil(null);
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

  function lockFor(secs: number, remember: boolean) {
    const at = Date.now();
    setNow(at);
    setLockUntil(at + secs * 1000);
    if (remember && lockKey) rememberLock(lockKey, secs, at);
    setMessage(lockedText(waitLength(secs)));
  }

  async function press(d: string) {
    if (busy || locked) return;
    const next = (digits + d).slice(0, PIN_LENGTH);
    setDigits(next);
    if (next.length < PIN_LENGTH) return;
    setMessage(null);
    setBusy(true);
    try {
      const answer = await onSubmit(next);
      const verdict = typeof answer === 'boolean' ? pinVerdict(answer) : answer;
      if (verdict.ok) return;
      if (verdict.waitSeconds > 0) {
        lockFor(verdict.waitSeconds, true);
      } else if (verdict.limited) {
        const n = verdict.triesLeft;
        setMessage(n !== null && n > 0 && n <= WARN_AT ? `${wrongText} ${triesLeftText(n)}` : wrongText);
      } else {
        // An older database counts nothing: the pad's own brake.
        const n = wrongs + 1;
        setWrongs(n);
        if (n >= PIN_TRIES) lockFor(PIN_BREAK_MS / 1000, false);
        else setMessage(wrongText);
      }
    } catch (err) {
      // Not a wrong try: the check didn't happen.
      console.warn('Checking a PIN failed:', errorMessage(err));
      setMessage(pinCheckMessage(err));
    } finally {
      setBusy(false);
      setDigits('');
    }
  }

  function back() {
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
    <div>
      <div className="flex justify-center gap-3 mb-4" role="img" aria-label={`${digits.length} of ${PIN_LENGTH} digits`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-4 w-4 rounded-full border-2 border-purple-500 transition',
              i < digits.length ? 'bg-purple-500' : 'bg-transparent',
              locked && 'border-gray-300',
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-[16rem] mx-auto">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => (k === '⌫' ? back() : void press(k))}
              aria-disabled={busy || locked}
              aria-label={k === '⌫' ? 'Delete' : k}
              className="h-14 rounded-2xl bg-purple-50 hover:bg-purple-100 text-2xl font-semibold text-purple-800 transition aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-purple-50"
            >
              {k}
            </button>
          ),
        )}
      </div>
      {/* Always there, so each message is read out as it appears. */}
      <div role="status" className="mt-3 min-h-10 text-center text-sm text-amber-800">
        {busy ? <p>Checking…</p> : message && <p key={message.key}>{message.text}</p>}
      </div>
      {locked && (
        // Not a live region: a screen reader would read every second.
        <div className="text-center" data-testid="pin-lock">
          <p className="text-lg font-bold text-purple-800 tabular-nums">
            <span aria-hidden="true">🔒 </span>Try again in {countdownClock(left)}
          </p>
          {lockedHelp && <p className="mt-1 text-xs text-gray-600">{lockedHelp}</p>}
        </div>
      )}
    </div>
  );
}
