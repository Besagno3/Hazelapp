import { motion } from 'framer-motion';
import { keyName, type GateKey } from '../../content/keys';
import { CONSUMABLES, type ConsumableId } from '../../content/items';
import { BASE_TIER, dangerMarks } from '../../content/regions';
import type { BattleEnemy } from '../../types';
import type { TypingBonus as Bonus } from '../../content/typing';
import { TypingBonus } from './TypingBonus';
import { kidXpWords, xpStartsLine, type KidXpResult } from '../../lib/kidXp';
import { useSettled } from '../../hooks/useSettled';

/** A co-op battle's Player 2 (#187): the XP they earned, and where it went — a sibling's to their own game (`lib/kidXp.ts`). */
export interface PartnerPay {
  name: string;
  icon: string;
  xp: number;
  /** A family kid: a guest earns nothing, and nothing is said. */
  family: boolean;
  /** Their world is open, so they earn XP (#122). */
  worldOpen: boolean;
  /** The write to their profile, when they earned some. */
  saving: Promise<KidXpResult> | null;
}

/** Player 2's XP under the team line: what they earned and that it's saved — or that XP starts once their world opens. */
function PartnerXp({ partner }: { partner: PartnerPay }) {
  const saved = useSettled(partner.saving);
  if (!partner.family) return null;
  return (
    <p className="text-xs text-amber-100 mt-1" data-testid="partner-xp" aria-live="polite">
      {partner.xp > 0 ? (
        <>
          <span className="font-semibold">
            <span aria-hidden="true">{partner.icon} </span>
            {partner.name}: ⭐ +{partner.xp} XP.
          </span>{' '}
          {kidXpWords(partner.name, saved)}
        </>
      ) : !partner.worldOpen ? (
        xpStartsLine(partner.name)
      ) : null}
    </p>
  );
}

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
  badge = null,
  wakeInn = null,
  shelter = null,
  tip = null,
  boatLine = null,
  bonus = null,
  holdRule = true,
  team = null,
  partner = null,
  onClaimBonus,
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
  /** A boss's own badge, won the first time (#75 item 14g: the Foglight Badge). */
  badge?: { name: string; emoji: string } | null;
  /** Defeat: the inn the hero wakes at ("the Square Root Inn in Numbria"), or null for home (#75 item 11). */
  wakeInn?: string | null;
  /** Defeat somewhere with a shelter (#75 item 14f, Fen's Hollow): who looks after the hero, and where — over `wakeInn`. */
  shelter?: { line: string; place: string } | null;
  /** Defeat: a tip after losing to a critter with "!" marks (`defeatTip`, #75 item 12). */
  tip?: string | null;
  /**
   * Defeat: where Old Marlow took the boat (`defeatBoatLine`) — home to his dock
   * from the sea (#75 item 14d), or round to an island town's beach (#114o).
   */
  boatLine?: string | null;
  /** Victory: the bonus scroll (#165 item 3) — a name to type for a little extra, when one was rolled. */
  bonus?: Bonus | null;
  /** The home-row hold, as the player has it set. */
  holdRule?: boolean;
  /** A co-op battle (#187): each player's right answers, the kid playing first (`correctCount` is theirs alone). */
  team?: { name: string; icon: string; right: number }[] | null;
  /** A co-op battle's Player 2: the XP they earned (a sibling's, saved to their own game). */
  partner?: PartnerPay | null;
  onClaimBonus?: (bonus: Bonus) => void;
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
                {keyBoss.emoji} You won {keyName(keyBoss)}!{' '}
                {keyBoss.opens ?? `It unlocks ${keyBoss.fiendName}'s ${keyBoss.door ?? 'gate'}.`}
              </p>
            </>
          )}
          {enemy.isBoss && !keyBoss && (
            <>
              {fiendDefeatLine && <p className="text-white/60 italic text-sm mb-1">"{fiendDefeatLine}"</p>}
              {/* Only a Fiend restores a crystal (#75 item 14c). */}
              {crystalName && <p className="text-emerald-300 font-bold mb-1">💎 The {crystalName} shines again!</p>}
              {badge && (
                <p className="text-amber-300 font-bold mb-1">
                  {badge.emoji} You won the {badge.name}! Find it on your 📜 Menu.
                </p>
              )}
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
          {bonus && onClaimBonus && <TypingBonus bonus={bonus} holdRule={holdRule} onClaim={() => onClaimBonus(bonus)} />}
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
          {boatLine && <p className="text-sm text-sky-200 font-semibold mt-2">{boatLine}</p>}
          {/* Lost at sea, where the boat went comes first: with the tip too, a
              320×568 phone pushed the button off the screen. Nothing's lost —
              a critter that eases off says so in the battle itself (#114). */}
          {tip && !boatLine && <p className="text-sm text-amber-200 font-semibold mt-2">💡 {tip}</p>}
        </>
      )}
      {team && (
        <p className="text-sm text-sky-100 font-semibold mt-2" data-testid="team-line">
          <span aria-hidden>🤝 </span>
          {team.map((p) => `${p.icon} ${p.name} ${p.right} right`).join(' · ')}
        </p>
      )}
      {partner && <PartnerXp partner={partner} />}
      <button
        onClick={onLeave}
        className="mt-4 bg-amber-400 hover:bg-amber-300 text-amber-950 font-bold rounded-xl px-6 py-2.5"
      >
        {won ? 'Onward!' : shelter ? `To ${shelter.place}` : wakeInn ? 'To the inn' : 'Back home'}
      </button>
    </motion.div>
  );
}
