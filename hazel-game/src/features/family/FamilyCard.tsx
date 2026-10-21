import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * The white card on the purple sky that every family screen sits in (#124), like sign-in.
 * `focusTitle`: a screen that replaces another (a kid's PIN pad, Close account)
 * opens at the top with its title focused, so a keyboard or screen-reader user
 * starts where the screen does — not on the page, or halfway down it
 * (#124 review). On a short screen (a phone on its side) the card is wider
 * and tighter, so what's in it fits beside rather than below. `extraWide`
 * (📈 Progress, #29) gives a page of numbers more room from 640 px up.
 * `refocus`: bump it to move the focus to the title again — after "Try
 * again" loaded the page and the button that had the focus is gone (#29
 * review round 1).
 */
export default function FamilyCard({
  title,
  subtitle,
  wide = false,
  extraWide = false,
  focusTitle = false,
  refocus,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  extraWide?: boolean;
  focusTitle?: boolean;
  refocus?: number;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (refocus) heading.current?.focus();
  }, [refocus]);

  useEffect(() => {
    if (!focusTitle) return;
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
    // A new title is a new screen (the same card can carry several in turn).
  }, [focusTitle, title]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500 p-4 [@media(max-height:500px)]:p-2">
      <div
        className={cn(
          'bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full [@media(max-height:500px)]:p-4',
          extraWide ? 'max-w-lg sm:max-w-2xl' : wide ? 'max-w-lg' : 'max-w-sm [@media(max-height:500px)]:max-w-xl',
        )}
      >
        <h1
          ref={heading}
          tabIndex={focusTitle || refocus !== undefined ? -1 : undefined}
          className={cn(
            'text-2xl font-bold text-center text-purple-700 focus:outline-none [@media(max-height:500px)]:text-xl',
            subtitle ? 'mb-1' : 'mb-5 [@media(max-height:500px)]:mb-3',
          )}
        >
          {title}
        </h1>
        {subtitle && <p className="text-center text-gray-500 mb-5 text-sm [@media(max-height:500px)]:mb-3">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
