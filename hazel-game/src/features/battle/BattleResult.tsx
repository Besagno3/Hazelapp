import { motion } from 'framer-motion';
import type { GateKey } from '../../content/keys';
import { CONSUMABLES, type ConsumableId } from '../../content/items';
import type { BattleEnemy } from '../../types';

/** The end-of-battle panel: victory spoils (crystal / key / coins / XP) or a gentle defeat. */
export function BattleResult({
  result,
  enemy,
  keyBoss,
  fiendDefeatLine,
  crystalName,
  correctCount,
  xp,
  coins,
  lucky,
  firstWin,
  drop,
  wakeInn = null,
  onLeave,
}: {
  result: 'victory' | 'defeat';
  enemy: BattleEnemy;
  /** A warden boss (#58): the key it drops. */
  keyBoss?: GateKey;
  /** A crystal Fiend's last words. */
  fiendDefeatLine?: string;
  crystalName: string;
  correctCount: number;
  /** XP awarded for the whole fight. */
  xp: number;
  /** Coins actually paid out (Lucky Clover multiplies them). */
  coins: number;
  /** Won under a Lucky Clover (#80) — shown with a 🍀. */
  lucky: boolean;
  /** The first time this kind of enemy was beaten (coins include the bonus). */
  firstWin: boolean;
  /** The item the enemy dropped, if any. */
  drop: ConsumableId | null;
  /** Defeat: the inn the hero wakes at ("the Square Root Inn in Numbria"), or null for home (#75 item 11). */
  wakeInn?: string | null;
  onLeave: () => void;
}) {
  const won = result === 'victory';
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="bg-indigo-950/95 border-4 border-amber-300 rounded-2xl p-6 w-full max-w-xl text-white text-center shadow-2xl"
    >
      {won ? (
        <>
          <div className="text-5xl mb-2">🏆</div>
          <h2 className="text-xl font-extrabold text-amber-300 mb-1">Victory!</h2>
          {enemy.isBoss && keyBoss && (
            <>
              <p className="text-white/60 italic text-sm mb-1">"{keyBoss.bossDefeat}"</p>
              <p className="text-amber-300 font-bold mb-1">
                {keyBoss.emoji} You won the {keyBoss.name}! It unlocks {keyBoss.fiendName}'s gate.
              </p>
            </>
          )}
          {enemy.isBoss && !keyBoss && (
            <>
              {fiendDefeatLine && <p className="text-white/60 italic text-sm mb-1">"{fiendDefeatLine}"</p>}
              <p className="text-emerald-300 font-bold mb-1">💎 The {crystalName} shines again!</p>
            </>
          )}
          <p className="text-sm text-white/80">
            {correctCount} correct answers · 🪙 +{coins}
            {lucky ? ' 🍀' : ''} · ⭐ +{xp} XP
          </p>
          {firstWin && (
            <p className="text-sm text-yellow-200 font-semibold mt-1">⭐ First time beating a {enemy.name} — bonus coins!</p>
          )}
          {drop && (
            <p className="text-sm text-emerald-200 font-semibold mt-1">
              🎁 It dropped a {CONSUMABLES[drop].emoji} {CONSUMABLES[drop].name}!
            </p>
          )}
        </>
      ) : (
        <>
          <div className="text-5xl mb-2">😴</div>
          <h2 className="text-xl font-extrabold mb-1">Whew — that was close!</h2>
          <p className="text-sm text-white/80">
            Friendly hands carry you {wakeInn ? `back to ${wakeInn}, where you last rested` : 'home to Lumina Village'}.
            You're safe, rested, and{' '}
            {correctCount > 0 ? `kept ${correctCount} answers' worth of XP!` : 'ready to try again!'}
          </p>
        </>
      )}
      <button
        onClick={onLeave}
        className="mt-4 bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-2.5"
      >
        {won ? 'Onward!' : wakeInn ? 'To the inn' : 'Back home'}
      </button>
    </motion.div>
  );
}
