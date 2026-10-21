import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, errorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { useRetryWait, waitWords } from '../auth/useRetryWait';

/**
 * "Forgot it? Email me a reset link" for a grown-up who is signed in but
 * doesn't know the password — the 👪 gate and Close account (#124b review
 * round 2): sends the reset link to the login's own email, one at a time,
 * and counts a refusal's wait down (`useRetryWait`). It waits with
 * `aria-disabled`, so the keyboard keeps its place. What happened goes to
 * `onSent` / `onFailed` in plain words, for the screen's own status line;
 * `onStart` clears that line as it sends.
 */
export default function ResetLinkButton({
  email,
  onStart,
  onSent,
  onFailed,
  className,
}: {
  email: string;
  onStart?: () => void;
  onSent: (words: string) => void;
  onFailed: (words: string) => void;
  className?: string;
}) {
  const [sending, setSending] = useState(false);
  const wait = useRetryWait();
  const waiting = !sending && wait.left > 0;

  async function send() {
    // One link at a time, and none while a refusal's wait runs: the server would only refuse it.
    if (sending || wait.left > 0) return;
    setSending(true);
    onStart?.();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    setSending(false);
    if (error) {
      // Plain words on screen, the whole error in the console (#130 S6).
      console.warn('Sending a reset link failed:', errorMessage(error));
      onFailed(authErrorMessage(error, { where: 'forgot' }));
      wait.refused(error);
    } else onSent(`A reset link is on its way to ${email}.`);
  }

  return (
    <button
      type="button"
      onClick={() => void send()}
      aria-disabled={sending || waiting}
      aria-label={waiting ? `Email me a reset link ${waitWords(wait.left).said}` : undefined}
      className={cn('min-h-11 text-sm hover:underline aria-disabled:cursor-default aria-disabled:no-underline', className)}
    >
      {sending
        ? 'Sending a reset link…'
        : waiting
          ? `Email me a reset link ${waitWords(wait.left).shown}`
          : 'Forgot it? Email me a reset link'}
    </button>
  );
}
