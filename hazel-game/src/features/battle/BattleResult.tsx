import { motion } from 'framer-motion';
import type { GateKey } from '../../content/keys';
import { CONSUMABLES, type ConsumableId } from '../../content/items';
import { BASE_TIER, dangerMarks } from '../../content/regions';
import type { BattleEnemy } from '../../types';
import { SEA_DEFEAT_LINE } from '../../content/boat';

/** The end-of-battle panel: victory spoils (crystal / key / coins / XP) or a gentle defeat. */
/** "a Count Bat", "an Oak Owl", "the Ringkeeper" — a name mid-sentence (#75 item 14f review: not "a The Ringkeeper"). */
function aName(name: string): string {
  if (name.startsWith('The ')) return `the ${name.slice(4)}`;
  return `${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name}`;
}

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
  shelter = null,
  tip = null,
  boatHome = false,
  onLeave,
}: {
  result: 'victory' | 'defeat';
  enemy: BattleEnemy;
  /** A warden boss (#58): the key it drops. */
  keyBoss?: GateKey;
  /** A crystal Fiend's last words. */
  fiendDefeatLine?: string;
  /** Set only for a Fiend (#75 item 14c): its crystal shines again. */
  crystalName?: string;
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
  /** Defeat somewhere with a shelter (#75 item 14f, Fen's Hollow): who looks after the hero, and where — over `wakeInn`. */
  shelter?: { line: string; place: string } | null;
  /** Defeat: a tip after losing to a critter with "!" marks (`defeatTip`, #75 item 12). */
  tip?: string | null;
  /** Defeat at sea (#75 item 14d): Old Marlow brought the boat home to his dock (`boatAfterDefeat`). */
  boatHome?: boolean;
  onLeave: () => void;
}) {
  const won = result === 'victory';
  // A critter with "!" marks pays more (#75 item 12) — say why the numbers are bigger.
  const farBonus = won && dangerMarks(enemy.tier ?? BASE_TIER) !== '';
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
                {keyBoss.emoji} You won the {keyBoss.name}!{' '}
                {keyBoss.unlocksZone ? `It unlocks ${keyBoss.fiendName}'s gate.` : keyBoss.opens}
              </p>
            </>
          )}
          {enemy.isBoss && !keyBoss && (
            <>
              {fiendDefeatLine && <p className="text-white/60 italic text-sm mb-1">"{fiendDefeatLine}"</p>}
              {/* Only a Fiend restores a crystal (#75 item 14c). */}
              {crystalName && <p className="text-emerald-300 font-bold mb-1">💎 The {crystalName} shines again!</p>}
            </>
          )}
          <p className="text-sm text-white/80">
            {correctCount} correct answers · 🪙 +{coins}
            {lucky ? ' 🍀' : ''} · ⭐ +{xp} XP
          </p>
          {farBonus && <p className="text-sm text-orange-200 font-semibold mt-1">💪 Tough-critter bonus: extra coins and XP!</p>}
          {firstWin && (
            <p className="text-sm text-yellow-200 font-semibold mt-1">⭐ First time beating {aName(enemy.name)} — bonus coins!</p>
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
            {shelter
              ? shelter.line
              : `Friendly hands carry you ${wakeInn ? `back to ${wakeInn}, where you last rested` : 'home to Lumina Village'}.`}{' '}
            You're safe, rested, and{' '}
            {correctCount > 0 ? `kept ${correctCount} answers' worth of XP!` : 'ready to try again!'}
          </p>
          {boatHome && <p className="text-sm text-sky-200 font-semibold mt-2">{SEA_DEFEAT_LINE}</p>}
          {/* Lost at sea, where the boat went comes first: with the tip too, a
              320×568 phone pushed the button off the screen. Nothing's lost —
              a critter that eases off says so in the battle itself (#114). */}
          {tip && !boatHome && <p className="text-sm text-amber-200 font-semibold mt-2">💡 {tip}</p>}
        </>
      )}
      <button
        onClick={onLeave}
        className="mt-4 bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-2.5"
      >
        {won ? 'Onward!' : shelter ? `To ${shelter.place}` : wakeInn ? 'To the inn' : 'Back home'}
      </button>
    </motion.div>
  );
}
