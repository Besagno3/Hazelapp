import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { PIN_LENGTH } from '../../content/family';
import { cn } from '../../lib/utils';

/** Wrong PINs in a row before a break. */
export const PIN_TRIES = 5;
/** How long the break lasts. */
export const PIN_BREAK_MS = 30_000;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Four dots and a big number pad (#118): how a kid opens their profile, and a
 * grown-up 👪 Grown-ups. The last digit sends the PIN to `onSubmit` (true =
 * right; the screen moves on). A wrong one clears the dots and says so; after
 * PIN_TRIES wrong in a row the pad rests for PIN_BREAK_MS — a brake on a
 * sibling guessing (all 10,000 would take ~17 hours), not security: the count
 * lives in this screen, so a reload starts it over. Typing digits on a
 * keyboard works too.
 */
export default function PinPad({
  onSubmit,
  wrongText = 'Not quite — try again!',
}: {
  onSubmit: (pin: string) => Promise<boolean>;
  wrongText?: string;
}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [wrongs, setWrongs] = useState(0);
  const [resting, setResting] = useState(false);

  useEffect(() => {
    if (!resting) return;
    const t = setTimeout(() => {
      setResting(false);
      setWrongs(0);
      setMessage('');
    }, PIN_BREAK_MS);
    return () => clearTimeout(t);
  }, [resting]);

  async function press(d: string) {
    if (busy || resting) return;
    const next = (digits + d).slice(0, PIN_LENGTH);
    setDigits(next);
    setMessage('');
    if (next.length < PIN_LENGTH) return;
    setBusy(true);
    try {
      if (await onSubmit(next)) return;
      const n = wrongs + 1;
      setWrongs(n);
      if (n >= PIN_TRIES) {
        setResting(true);
        setMessage('Too many tries — take a little break, then try again.');
      } else {
        setMessage(wrongText);
      }
    } catch (err) {
      setMessage(errorMessage(err)); // not a wrong try: the check didn't happen
    } finally {
      setBusy(false);
      setDigits('');
    }
  }

  function back() {
    if (!busy) setDigits((d) => d.slice(0, -1));
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
              disabled={busy || resting}
              aria-label={k === '⌫' ? 'Delete' : k}
              className="h-14 rounded-2xl bg-purple-50 hover:bg-purple-100 text-2xl font-semibold text-purple-800 transition disabled:opacity-40"
            >
              {k}
            </button>
          ),
        )}
      </div>
      <p role="status" className="mt-3 min-h-10 text-center text-sm text-amber-700">
        {busy ? 'Checking…' : message}
      </p>
    </div>
  );
}
