import { useProfileStore } from '../store/profileStore';
import { playerLevel, xpProgress } from '../lib/level';

/** Floating player-level badge with an XP progress bar. */
export default function LevelBadge() {
  const profile = useProfileStore((s) => s.profile);
  if (!profile) return null;

  const level = playerLevel(profile.xp);
  const { into, needed, fraction } = xpProgress(profile.xp);

  return (
    <div className="fixed top-3 left-3 z-50 bg-black/30 backdrop-blur rounded-lg px-3 py-1.5 text-white">
      <div className="text-xs font-semibold">⭐ Level {level}</div>
      <div className="mt-1 w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div className="h-full bg-yellow-400" style={{ width: `${fraction * 100}%` }} />
      </div>
      <div className="mt-0.5 text-[10px] text-white/70">
        {into}/{needed} XP
      </div>
    </div>
  );
}
