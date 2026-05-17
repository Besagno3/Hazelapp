import { useProfileStore } from '../store/profileStore';
import { playerLevel, xpProgress } from '../lib/level';

/**
 * Floating level medallion + XP progress bar, shown on every game screen.
 * Renders nothing until the player's profile has loaded.
 */
export default function LevelBadge() {
  const profile = useProfileStore((s) => s.profile);
  if (!profile) return null;

  const level = playerLevel(profile.xp);
  const { into, needed, fraction } = xpProgress(profile.xp);

  return (
    <div className="fixed top-3 left-3 z-50 flex items-center gap-2 bg-black/35 backdrop-blur rounded-full pl-1.5 pr-3 py-1.5 text-white shadow-lg">
      {/* Circular level medallion */}
      <div className="grid place-items-center w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-yellow-600 ring-2 ring-yellow-200 shadow-inner">
        <span className="text-base font-extrabold leading-none text-yellow-950">{level}</span>
      </div>
      <div className="min-w-[5.5rem]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-yellow-200">
          Level {level}
        </div>
        <div className="mt-1 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 transition-all"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <div className="mt-0.5 text-[10px] text-white/70">
          {into}/{needed} XP
        </div>
      </div>
    </div>
  );
}
