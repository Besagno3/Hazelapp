import { signInAgain } from '../../store/familyStore';
import { cn } from '../../lib/utils';

/**
 * The button that goes with words saying the sign-in ran out (#130 S6): a
 * sign-out on this device (`signInAgain`), then the sign-in page. On a kid's
 * screen its label says it's a grown-up's job.
 */
export default function SignInAgainButton({ label = 'Sign in again', className }: { label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void signInAgain()}
      className={cn('mt-2 w-full min-h-11 rounded-lg bg-purple-600 font-semibold text-white transition hover:bg-purple-700', className)}
    >
      {label}
    </button>
  );
}
