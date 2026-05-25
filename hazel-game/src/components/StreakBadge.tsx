import { useProfileStore } from '../store/profileStore';

/**
 * Daily-streak badge — shown beneath the level medallion on every game screen
 * once the player has at least 1 day in their streak (#28). Renders nothing
 * before then so the first-ever round doesn't compete with the level UI.
 */
export default function StreakBadge() {
  const profile = useProfileStore((s) => s.profile);
  if (!profile || profile.currentStreak <= 0) return null;

  const { currentStreak, longestStreak } = profile;
  const isRecord = currentStreak === longestStreak && longestStreak > 1;

  return (
    <div
      className="fixed top-16 left-3 z-50 flex items-center gap-1.5 bg-black/35 backdrop-blur rounded-full pl-2 pr-3 py-1.5 text-white shadow-lg"
      title={`Best: ${longestStreak} day${longestStreak === 1 ? '' : 's'}`}
    >
      <span className="text-lg leading-none">🔥</span>
      <div className="leading-none">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-200">
          {isRecord ? 'Best streak!' : 'Streak'}
        </div>
        <div className="text-sm font-bold mt-0.5">
          {currentStreak} day{currentStreak === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}
