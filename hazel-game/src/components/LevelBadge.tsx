import { useProfileStore } from '../store/profileStore';
import { playerLevel, xpProgress } from '../lib/level';

/**
 * Where the medallion sits. Battle uses top-center to clear the combatant
 * status panels; most screens float it top-left; the world screen puts it in
 * its own top bar (`inline`, #75 item 14b / #102i), so it never covers the
 * place name and every overlay draws over it.
 */
type Placement = 'top-left' | 'top-center' | 'inline';

const PLACEMENT: Record<Placement, string> = {
  'top-left': 'fixed top-3 left-3 z-50',
  'top-center': 'fixed top-3 left-1/2 -translate-x-1/2 z-50',
  inline: 'shrink-0',
};

/**
 * Level medallion + XP progress bar, shown on every game screen (including
 * the overworld). Falls back to level 1 / 0 XP while the player's profile is
 * still loading or unavailable, so the medallion is always visible. Inline it
 * is smaller — at most 44 px tall, the XP numbers read aloud (and on hover)
 * rather than shown — to fit a phone's top bar beside the streak and Sign out.
 */
export default function LevelBadge({ placement = 'top-left' }: { placement?: Placement }) {
  const profile = useProfileStore((s) => s.profile);
  const xp = profile?.xp ?? 0;

  const level = playerLevel(xp);
  const { into, needed, fraction } = xpProgress(xp);
  const inline = placement === 'inline';

  return (
    <div
      className={`${PLACEMENT[placement]} flex items-center gap-2 bg-black/35 backdrop-blur rounded-full pl-1.5 pr-3 py-1.5 text-white shadow-lg`}
      title={inline ? `${into}/${needed} XP` : undefined}
    >
      {/* Circular level medallion */}
      <div
        className={`grid place-items-center ${inline ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-gradient-to-br from-amber-300 to-yellow-600 ring-2 ring-yellow-200 shadow-inner`}
      >
        <span className="text-base font-extrabold leading-none text-yellow-950" aria-hidden>
          {level}
        </span>
      </div>
      <div className={inline ? 'min-w-[4rem]' : 'min-w-[5.5rem]'}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-yellow-200">
          Level {level}
        </div>
        <div className="mt-1 w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-yellow-400 transition-all"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <div className={inline ? 'sr-only' : 'mt-0.5 text-[10px] text-white/70'}>
          {into}/{needed} XP
        </div>
      </div>
    </div>
  );
}
