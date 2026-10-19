import type { TypingProgress } from '../../lib/typing';
import { cn } from '../../lib/utils';

/**
 * The line being typed (#159): what's done in green, the next character on a
 * glowing tile, the rest waiting. Spaces show as a visible gap tile. Words
 * stay whole when the line wraps (review round 1: "jum / p" split a reader's
 * word), and a screen reader hears the whole line.
 */
export function TypingLine({ progress, shake = false, big = false }: { progress: TypingProgress; shake?: boolean; big?: boolean }) {
  const chars = [...progress.text];
  // Groups of characters that wrap as one: a word, or a single space.
  const groups: { start: number; chars: string[] }[] = [];
  chars.forEach((ch, i) => {
    const last = groups[groups.length - 1];
    if (ch !== ' ' && last && last.chars[last.chars.length - 1] !== ' ') last.chars.push(ch);
    else groups.push({ start: i, chars: [ch] });
  });
  return (
    <p
      role="group"
      // The group's label is the one reading of the line (review round 4: a hidden copy read it twice more); the
      // big size steps up from `sm` so a twelve-letter foe word fits a 320 px card.
      className={cn('flex flex-wrap justify-center gap-y-1 font-mono font-bold leading-none', big ? 'text-xl sm:text-2xl' : 'text-xl', shake && 'hq-shake')}
      aria-label={`Type: ${progress.text}`}
    >
      {groups.map((g) => (
        <span key={g.start} aria-hidden="true" className="inline-flex whitespace-nowrap">
          {g.chars.map((ch, j) => {
            const i = g.start + j;
            const state = i < progress.index ? 'done' : i === progress.index ? 'next' : 'later';
            return (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center justify-center rounded-md min-w-[1.4ch] px-0.5 py-1 mx-px',
                  state === 'done' && 'text-emerald-300',
                  state === 'next' && 'bg-amber-300 text-indigo-950 scale-110 shadow-[0_0_12px_rgba(252,211,77,0.9)]',
                  state === 'later' && 'text-white/50',
                  ch === ' ' && state !== 'done' && 'border-b-2 border-current',
                )}
              >
                {ch === ' ' ? ' ' : ch}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}
