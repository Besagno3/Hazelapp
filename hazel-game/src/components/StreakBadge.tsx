import { useProfileStore } from '../store/profileStore';

/**
 * Daily-streak badge — shown beneath the level medallion on every game screen
 * once the player has at least 1 day in their streak (#28). Renders nothing
 * before then so the first-ever round doesn't compete with the level UI.
 *
 * `inline` (the world screen's top bar, #75 item 14b / #102i): beside the
 * medallion instead of floating under it, and on a phone just "🔥 5" — the
 * words are read aloud (and shown from `sm` up).
 */
export default function StreakBadge({ inline = false }: { inline?: boolean }) {
  const profile = useProfileStore((s) => s.profile);
  if (!profile || profile.currentStreak <= 0) return null;

  const { currentStreak, longestStreak } = profile;
  const isRecord = currentStreak === longestStreak && longestStreak > 1;
  const days = `${currentStreak} day${currentStreak === 1 ? '' : 's'}`;

  return (
    <div
      className={`${inline ? 'shrink-0' : 'fixed top-16 left-3 z-50'} flex items-center gap-1.5 bg-black/35 backdrop-blur rounded-full pl-2 pr-3 py-1.5 text-white shadow-lg`}
      title={`Best: ${longestStreak} day${longestStreak === 1 ? '' : 's'}`}
    >
      <span className="text-lg leading-none" aria-hidden={inline || undefined}>
        🔥
      </span>
      {inline && (
        <>
          <span className="text-sm font-bold leading-none sm:hidden" aria-hidden>
            {currentStreak}
          </span>
          <span className="sr-only sm:hidden">
            {isRecord ? 'Best streak! ' : 'Streak: '}
            {days}
          </span>
        </>
      )}
      <div className={`leading-none ${inline ? 'hidden sm:block' : ''}`}>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-200">
          {isRecord ? 'Best streak!' : 'Streak'}
        </div>
        <div className="text-sm font-bold mt-0.5">{days}</div>
      </div>
    </div>
  );
}
