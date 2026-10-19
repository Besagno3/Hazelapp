import type { TypingProgress } from '../../lib/typing';
import { cn } from '../../lib/utils';

/**
 * The line being typed (#159): what's done in green, the next character on a
 * glowing tile, the rest waiting. Spaces show as a visible gap tile.
 */
export function TypingLine({ progress, shake = false, big = false }: { progress: TypingProgress; shake?: boolean; big?: boolean }) {
  return (
    <p
      className={cn('flex flex-wrap justify-center gap-y-1 font-mono font-bold leading-none', big ? 'text-2xl' : 'text-xl', shake && 'hq-shake')}
      aria-label={`Type: ${progress.text}`}
    >
      {[...progress.text].map((ch, i) => {
        const state = i < progress.index ? 'done' : i === progress.index ? 'next' : 'later';
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              'inline-flex items-center justify-center rounded-md min-w-[1.4ch] px-0.5 py-1 mx-px',
              state === 'done' && 'text-emerald-300',
              state === 'next' && 'bg-amber-300 text-indigo-950 scale-110 shadow-[0_0_12px_rgba(252,211,77,0.9)]',
              state === 'later' && 'text-white/50',
              ch === ' ' && state !== 'done' && 'border-b-2 border-current',
            )}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        );
      })}
    </p>
  );
}
