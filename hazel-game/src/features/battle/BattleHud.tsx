import { motion } from 'framer-motion';
import { CHARGE_MAX } from '../../content/abilities';
import { CharacterPortrait } from '../../components/CharacterPortrait';
import { STREAK_START } from '../../lib/battleTurn';
import { BASE_TIER, VERY_TOUGH_TIER, dangerMarks, type DangerTier } from '../../content/regions';
import type { Avatar, BattleEnemy } from '../../types';

const hpPct = (hp: number, max: number) => `${Math.max(0, (hp / max) * 100)}%`;

/** ◆ pips for the spell-charge gauge. */
export function ChargePips({ charge }: { charge: number }) {
  return (
    <>
      {Array.from({ length: CHARGE_MAX }).map((_, i) => (
        <span key={i} className={i < charge ? 'text-amber-300' : 'text-white/25'}>
          ◆
        </span>
      ))}
    </>
  );
}

const PANEL =
  'bg-indigo-950/90 border-2 border-white/70 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 text-white w-60 min-w-0';
const TITLE_ROW = 'flex justify-between items-baseline gap-2 text-[13px] sm:text-sm font-bold';

/**
 * The "!" marks' colour, warmer the tougher — matching its label on the map
 * (#75 item 12, `DANGER.mapColor`); past "!!!" it goes on, violet → magenta.
 */
const DANGER_TEXT: Record<DangerTier, string> = {
  0: '',
  1: '',
  2: 'text-yellow-200',
  3: 'text-orange-300',
  4: 'text-red-300',
  5: 'text-violet-400',
  6: 'text-fuchsia-300',
  7: 'text-[#ff66b8]', // DANGER[7].mapColor
};

/**
 * FF-style status boxes: enemy (left) and hero with charge gauge (right).
 * HP values are the *displayed* ones — they catch up when a blow lands (the
 * store already holds the real numbers, #70). Names truncate on phones so
 * "Lv 5" never wraps.
 */
export function BattleHud({
  enemy,
  enemyHp,
  enemyShielded,
  speedBoost,
  powerMoveNext,
  avatar,
  playerHp,
  playerMaxHp,
  charge,
  streak,
}: {
  enemy: BattleEnemy;
  enemyHp: number;
  enemyShielded: boolean;
  /** Levels the speed trigger raised this battle's questions by (⚡+N). */
  speedBoost: number;
  /** The enemy's charged power move landing next turn, if any. */
  powerMoveNext: string | null;
  avatar: Avatar;
  playerHp: number;
  playerMaxHp: number;
  charge: number;
  /** Correct answers in a row. */
  streak: number;
}) {
  return (
    <div className="relative z-10 flex justify-between gap-2 p-2 sm:gap-4 sm:p-4">
      <div className={PANEL}>
        <div className={TITLE_ROW}>
          <span className="min-w-0 truncate" title={enemy.name}>
            {enemy.isBoss && '👑 '}
            {enemyShielded && '🛡️ '}
            {enemy.name}
          </span>
          <span className="shrink-0 whitespace-nowrap text-white/70">
            Lv {enemy.level}
            {enemy.eased !== undefined ? <EasedMark /> : <DangerMarks tier={enemy.tier ?? BASE_TIER} boss={!!enemy.isBoss} />}
            {speedBoost > 0 && (
              <span className="ml-1 text-yellow-300" title="Questions raised by quick answers">
                ⚡+{speedBoost}
              </span>
            )}
          </span>
        </div>
        <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
          <motion.div className="h-full bg-red-400 rounded-full" animate={{ width: hpPct(enemyHp, enemy.maxHp) }} />
        </div>
        <div className="flex justify-between gap-2 text-xs mt-0.5">
          <span className="text-amber-300 font-bold animate-pulse">{powerMoveNext && `💢 ${powerMoveNext} next!`}</span>
          <span className="text-white/60">
            {enemyHp}/{enemy.maxHp}
          </span>
        </div>
      </div>
      <div className={PANEL}>
        <div className={TITLE_ROW}>
          <span className="min-w-0 truncate">
            <CharacterPortrait
              spriteId={avatar.spriteId}
              emoji={avatar.sprite}
              scale={0.75}
              className="inline-block align-middle mr-1"
            />
            {avatar.name}
          </span>
          <span className="shrink-0 flex gap-0.5 items-center" title="Special charge">
            <ChargePips charge={charge} />
          </span>
        </div>
        <div className="w-full bg-white/15 rounded-full h-3 mt-1 overflow-hidden">
          <motion.div className="h-full bg-green-400 rounded-full" animate={{ width: hpPct(playerHp, playerMaxHp) }} />
        </div>
        <div className="flex justify-between gap-2 text-xs mt-0.5">
          <span className="text-orange-300 font-bold" title="Answers in a row">
            {streak >= STREAK_START && `🔥×${streak} streak`}
          </span>
          <span className="text-white/60">
            {playerHp}/{playerMaxHp}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Its "!" marks beside its level, as on the map (#75 item 12): it fights
 * harder than the critters near home — its questions are still the player's
 * own level. Nothing near home.
 */
function DangerMarks({ tier, boss = false }: { tier: DangerTier; boss?: boolean }) {
  const marks = dangerMarks(tier);
  if (!marks) return null;
  // The marks stop at "!!!" (`MAX_MARKS`), so the words say what the colour does —
  // and a warden like the Ringkeeper is a boss, not a critter (#75 item 14f review).
  const says = `${tier >= VERY_TOUGH_TIER ? 'Very tough' : 'Tough'} ${boss ? 'boss' : 'critter'}: it hits harder — and drops more coins`;
  return (
    <span className={`ml-1 font-extrabold ${DANGER_TEXT[tier]}`} title={says}>
      <span aria-hidden="true">{marks}</span>
      <span className="sr-only">{says}</span>
    </span>
  );
}

/** Where its marks were, once mercy has eased the fight (#75 item 12): it's going easier on you. */
function EasedMark() {
  const says = 'Going easier on you';
  return (
    <span className="ml-1" title={says}>
      <span aria-hidden="true">💛</span>
      <span className="sr-only">{says}</span>
    </span>
  );
}
