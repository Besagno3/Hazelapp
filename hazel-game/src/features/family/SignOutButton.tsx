import { useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { signOutGrownUp } from '../../store/familyStore';

/**
 * A grown-up's "Sign out" (👪 Grown-ups and the setup screens): 👪 Grown-ups
 * is shut first, which can take a moment (`signOutGrownUp`, up to
 * `LOCK_BEFORE_SIGN_OUT_MS`), so the button says it's on its way and waits
 * with `aria-disabled` — a second tap does nothing rather than signing out
 * twice (#167 review round 1). If the sign-out fails it's ready again.
 * `onBusyChange` lets the screen hold its other ways out meanwhile (👪's
 * "Done", #167 review round 2).
 */
export default function SignOutButton({
  label = 'Sign out',
  className,
  onBusyChange,
}: {
  label?: string;
  className?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await signOutGrownUp();
    } catch (err) {
      console.warn('Signing out failed:', errorMessage(err));
    } finally {
      // Usually gone by now (the sign-in page replaces this screen).
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-disabled={busy}
      className={cn(
        'w-full min-h-11 text-center text-sm text-gray-500 hover:underline aria-disabled:cursor-default aria-disabled:no-underline aria-disabled:opacity-60',
        className,
      )}
    >
      {busy ? 'Signing out…' : label}
    </button>
  );
}
