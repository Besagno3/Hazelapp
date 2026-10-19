import { useCallback, useEffect, useState } from 'react';
import { authRetryAfter } from '../../lib/errors';

/**
 * How long before asking Supabase to send an email again can work (#146), as
 * whole seconds left that tick down — shared by "📨 Send the link again",
 * "Send reset link" and the 👪 gate's "Forgot it?", so every mail button
 * counts down the wait a refusal named instead of inviting a tap the server
 * would only refuse again. `wait(secs)` starts a wait; `refused(err)` starts
 * the one a rate limit named (none for anything else — the hourly email cap
 * included, which a countdown would only promise falsely).
 */
export function useRetryWait() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const left = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));

  useEffect(() => {
    if (left <= 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [left]);

  const wait = useCallback((secs: number) => {
    const at = Date.now();
    setUntil(at + secs * 1000);
    setNow(at);
  }, []);

  const refused = useCallback(
    (err: unknown) => {
      const secs = authRetryAfter(err);
      if (secs !== null) wait(secs);
    },
    [wait],
  );

  return { left, wait, refused };
}

/** "in 12s" on screen, "in 12 seconds" read out ("12s" can be read as "twelve s"). */
export function waitWords(left: number): { shown: string; said: string } {
  return { shown: `in ${left}s`, said: `in ${left} ${left === 1 ? 'second' : 'seconds'}` };
}
