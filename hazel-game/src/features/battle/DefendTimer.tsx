import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../../lib/audio';

/** Seconds left at which the countdown turns red and starts ticking. */
const URGENT_SECONDS = 5;
const TICK_SECONDS = 3;

/**
 * Countdown for a defend question: answer before it runs out or the enemy's
 * blow lands (as if answered wrong). Shows the prompt `label`, the seconds
 * left and a shrinking bar; turns red for the last few seconds and soft-ticks
 * for the last three. Stops the moment `stopped` is set (an answer was picked).
 * `paused` holds it where it is (a Forget-Me-Knot's second try, #75 item 14e):
 * no ticking, no running out, until it's answered.
 *
 * Time only runs while the page is visible — switching tabs or locking the
 * phone pauses it, so a kid can't lose a turn to something off-screen.
 * `onExpire` fires at most once.
 */
export function DefendTimer({
  durationMs,
  stopped,
  onExpire,
  label,
  paused = false,
}: {
  durationMs: number;
  stopped: boolean;
  paused?: boolean;
  onExpire: () => void;
  label: ReactNode;
}) {
  const [left, setLeft] = useState(durationMs);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const held = stopped || paused;
  useEffect(() => {
    if (held) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (document.visibilityState !== 'visible') return; // paused while hidden
      setLeft((l) => Math.max(0, l - dt));
    }, 100);
    return () => clearInterval(id);
  }, [held]);

  useEffect(() => {
    if (left > 0 || held || expired.current) return;
    expired.current = true;
    onExpireRef.current();
  }, [left, held]);

  const secs = Math.ceil(left / 1000);
  useEffect(() => {
    if (!held && secs > 0 && secs <= TICK_SECONDS) sfx('select');
  }, [secs, held]);

  const urgent = !held && secs <= URGENT_SECONDS;
  const pct = (left / durationMs) * 100;
  return (
    <div
      className="mb-2"
      role="timer"
      aria-label={stopped ? 'Answered in time' : paused ? 'Timer paused — take your time' : `${secs} seconds left to block`}
    >
      <div className="flex items-center justify-between gap-2 text-white font-bold text-sm uppercase tracking-widest">
        <span className="min-w-0">{label}</span>
        <span
          className={`shrink-0 tabular-nums rounded-md px-2 py-0.5 normal-case tracking-normal ${
            stopped
              ? 'bg-emerald-500/30 text-emerald-100'
              : paused
                ? 'bg-violet-500/40 text-violet-50'
                : urgent
                  ? 'bg-red-500/40 text-red-100 animate-pulse'
                  : 'bg-white/20'
          }`}
        >
          {stopped ? '✓ In time!' : paused ? '⏸ Paused' : `⏳ ${secs}s`}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-black/30 overflow-hidden">
        <div
          className={`h-full rounded-full ${stopped ? 'bg-emerald-400' : paused ? 'bg-violet-300' : urgent ? 'bg-red-400' : 'bg-amber-300'}`}
          style={{ width: `${pct}%`, transition: 'width 100ms linear' }}
        />
      </div>
    </div>
  );
}
