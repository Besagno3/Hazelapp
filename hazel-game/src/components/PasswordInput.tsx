import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '../lib/utils';

/**
 * A password field with an eye button that shows what's been typed (#117) —
 * a kid who mistypes a password can see why sign-in fails. Shown, it is plain
 * text with phone autocorrect and capitals off, so the keyboard can't change
 * the password. Sending the form hides it again first, so browsers don't keep
 * the password in their plain-text autofill history.
 */
export default function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    // On the form itself, so it runs before React's onSubmit (delegated at the root).
    const hide = () => flushSync(() => setShown(false));
    form.addEventListener('submit', hide);
    return () => form.removeEventListener('submit', hide);
  }, []);

  const label = shown ? 'Hide password' : 'Show password';
  return (
    <div className="relative">
      <input
        {...props}
        ref={input}
        type={shown ? 'text' : 'password'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(className, 'pr-12')}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        // Keeps the caret, and a phone's keyboard, in the field.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={label}
        title={label}
        className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-lg rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
      >
        <span aria-hidden>{shown ? '🙈' : '👁️'}</span>
      </button>
    </div>
  );
}
