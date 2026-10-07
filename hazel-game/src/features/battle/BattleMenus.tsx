import { CHARGE_MAX } from '../../content/abilities';
import { BATTLE_ITEMS, CONSUMABLES, type ConsumableId } from '../../content/items';
import type { Spell } from '../../content/spells';
import type { Topic } from '../../types';
import { COMPANIONS, COMPANION_IDS, type CompanionDef, type CompanionId, type PairAttack } from '../../content/companion';
import { ChargePips } from './BattleHud';

const PANEL = 'bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-4 w-full max-w-xl text-white shadow-2xl';
/**
 * Sub-menus (Swap / Items / Companion / Spells): on phones a long list scrolls
 * inside the panel and ← Back stays pinned, instead of pushing past the screen.
 */
const SUBMENU = `${PANEL} max-h-[64dvh] overflow-y-auto overscroll-contain sm:max-h-none sm:overflow-visible`;
const OPTION =
  'bg-white/10 hover:bg-white/20 disabled:opacity-60 disabled:hover:bg-white/10 rounded-xl px-3 py-2 text-left transition';
const HEADER = 'text-xs text-white/60 uppercase tracking-widest';

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="sticky bottom-0 mt-3 w-full min-h-[44px] bg-indigo-800 hover:bg-indigo-700 rounded-lg py-2.5 text-sm font-semibold shadow-[0_-8px_12px_rgba(30,27,75,0.9)] sm:static sm:shadow-none"
    >
      ← Back
    </button>
  );
}

function ChargeRow({ charge }: { charge: number }) {
  return (
    <p className="text-xs text-white/70 mb-3">
      Charge: <ChargePips charge={charge} />
    </p>
  );
}

/** Why a charge move is greyed out — "not yet", not "broken". */
function NeedMore({ cost, charge, loading }: { cost: number; charge: number; loading: boolean }) {
  if (loading) return <span className="block text-xs font-semibold text-amber-200/90 mt-0.5">Getting ready…</span>;
  if (charge >= cost) return null;
  return <span className="block text-xs font-semibold text-amber-200/90 mt-0.5">Need {cost - charge} more ◆</span>;
}

function CommandButton({
  emoji,
  label,
  hint,
  disabled,
  highlight,
  onClick,
}: {
  emoji: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** Pulse to draw the eye (e.g. Guard while a power move is coming). */
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${OPTION} py-2.5 ${highlight ? '!bg-amber-400/25 ring-2 ring-amber-300 animate-pulse' : ''}`}
    >
      <span className="text-lg mr-1.5">{emoji}</span>
      <span className="font-bold text-sm">{label}</span>
      {hint && <span className="block text-xs text-white/70 mt-0.5">{hint}</span>}
    </button>
  );
}

/** The top-level command box: Attack / Spells / companion / Guard / Items / Swap / Flee. */
export function CommandMenu({
  charge,
  spellsLoaded,
  canCastAny,
  items,
  isBoss,
  powerMove,
  companion,
  companionReady,
  companionHint,
  canSwap,
  onAttack,
  onSpells,
  onCompanion,
  onGuard,
  onItems,
  onSwap,
  onFlee,
}: {
  charge: number;
  spellsLoaded: boolean;
  canCastAny: boolean;
  items: Record<ConsumableId, number>;
  isBoss: boolean;
  /** A charged power move lands next turn (Guard pulses), or null. */
  powerMove: string | null;
  companion: CompanionDef;
  companionReady: boolean;
  companionHint: string;
  /** More than one companion has joined. */
  canSwap: boolean;
  onAttack: () => void;
  onSpells: () => void;
  onCompanion: () => void;
  onGuard: () => void;
  onItems: () => void;
  onSwap: () => void;
  onFlee: () => void;
}) {
  return (
    <div className={PANEL}>
      <p className={`${HEADER} mb-3`}>
        {powerMove ? (
          `💢 ${powerMove} is coming — Guard to block it!`
        ) : (
          <>
            <span className="sm:hidden">Your move!</span>
            <span className="hidden sm:inline">Your move — every command is a question!</span>
          </>
        )}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <CommandButton emoji="⚔️" label="Attack" onClick={onAttack} />
        <CommandButton
          emoji="📖"
          label="Spells"
          disabled={!canCastAny}
          hint={
            !spellsLoaded
              ? 'Loading…'
              : canCastAny
                ? `◆ ${charge}/${CHARGE_MAX}`
                : `Charge ◆ ${charge}/${CHARGE_MAX}`
          }
          onClick={onSpells}
        />
        <CommandButton
          emoji={companion.emoji}
          label={companion.name}
          disabled={!companionReady}
          hint={companionHint}
          onClick={onCompanion}
        />
        <CommandButton
          emoji="🛡️"
          label="Guard"
          hint={powerMove ? `Blocks ${powerMove}!` : undefined}
          highlight={!!powerMove}
          onClick={onGuard}
        />
        <CommandButton
          emoji="🎒"
          label="Items"
          disabled={BATTLE_ITEMS.every((id) => items[id] === 0)}
          hint={
            BATTLE_ITEMS.filter((id) => items[id] > 0)
              .map((id) => `${CONSUMABLES[id].emoji}×${items[id]}`)
              .join(' ') || 'Empty'
          }
          onClick={onItems}
        />
        <CommandButton
          emoji="🔄"
          label="Swap"
          hint={canSwap ? 'Free — keeps your turn' : 'Friends can join you'}
          onClick={onSwap}
        />
        <CommandButton
          emoji="🏃"
          label="Flee"
          disabled={isBoss}
          hint={isBoss ? 'No escape!' : undefined}
          onClick={onFlee}
        />
      </div>
    </div>
  );
}

/** The Spellbook: every known spell, castable when its ◆ cost is affordable. */
export function SpellMenu({
  spells,
  charge,
  spellsLoaded,
  enemyTopic,
  onCast,
  onBack,
}: {
  spells: Spell[];
  charge: number;
  spellsLoaded: boolean;
  /** Sage spells of this topic are super effective here. */
  enemyTopic: Topic;
  onCast: (spell: Spell) => void;
  onBack: () => void;
}) {
  return (
    <div className={SUBMENU}>
      <p className={`${HEADER} mb-1`}>📖 Spellbook — each spell needs one super-hard answer!</p>
      <ChargeRow charge={charge} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {spells.map((spell) => {
          const affordable = charge >= spell.cost && spellsLoaded;
          const weak = spell.topic !== undefined && spell.topic === enemyTopic;
          return (
            <button key={spell.id} onClick={() => onCast(spell)} disabled={!affordable} className={OPTION}>
              <span className="font-bold text-sm">
                <span className="mr-1.5">{spell.emoji}</span>
                {spell.name}
                <span className={`ml-1.5 text-xs ${affordable ? 'text-amber-300' : 'text-white/40'}`}>◆{spell.cost}</span>
              </span>
              {weak && <span className="block text-xs font-bold text-yellow-200">✨ Super effective here!</span>}
              <span className="block text-xs text-white/70 mt-0.5">{spell.description}</span>
              <NeedMore cost={spell.cost} charge={charge} loading={!spellsLoaded} />
            </button>
          );
        })}
      </div>
      <BackButton onClick={onBack} />
    </div>
  );
}

/** The Items bag (#73): battle consumables the hero holds. */
export function ItemMenu({
  items,
  blocked,
  onUse,
  onBack,
}: {
  items: Record<ConsumableId, number>;
  /** Why an item can't be used right now (null = usable). */
  blocked: (id: ConsumableId) => string | null;
  onUse: (id: ConsumableId) => void;
  onBack: () => void;
}) {
  return (
    <div className={SUBMENU}>
      <p className={`${HEADER} mb-3`}>🎒 Items — using one takes your turn</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {BATTLE_ITEMS.filter((id) => items[id] > 0).map((id) => {
          const why = blocked(id);
          return (
            <button key={id} onClick={() => onUse(id)} disabled={!!why} className={OPTION}>
              <span className="font-bold text-sm">
                <span className="mr-1.5">{CONSUMABLES[id].emoji}</span>
                {CONSUMABLES[id].name}
                <span className="ml-1.5 text-xs text-white/60">×{items[id]}</span>
              </span>
              <span className="block text-xs text-white/70 mt-0.5">{why ?? CONSUMABLES[id].description}</span>
            </button>
          );
        })}
      </div>
      <BackButton onClick={onBack} />
    </div>
  );
}

/** The active companion's strike (with its perk) and its Pair Attacks. */
export function CompanionMenu({
  companion,
  move,
  perkLabel,
  pairs,
  growHint,
  charge,
  spellsLoaded,
  onStrike,
  onPair,
  onBack,
}: {
  companion: CompanionDef;
  move: { name: string; emoji: string };
  perkLabel: string;
  pairs: PairAttack[];
  /** Ember has bigger combos still to unlock. */
  growHint: boolean;
  charge: number;
  spellsLoaded: boolean;
  onStrike: () => void;
  onPair: (pair: PairAttack) => void;
  onBack: () => void;
}) {
  return (
    <div className={SUBMENU}>
      <p className={`${HEADER} mb-1`}>
        {companion.emoji} {companion.name} — fight side by side!
      </p>
      <ChargeRow charge={charge} />
      <button onClick={onStrike} className={`${OPTION} w-full mb-2`}>
        <span className="font-bold text-sm">
          <span className="mr-1.5">{move.emoji}</span>
          {move.name}
          <span className="ml-1.5 text-xs text-amber-300">{perkLabel}</span>
        </span>
        <span className="block text-xs text-white/70 mt-0.5">
          {companion.name} attacks! {companion.perkLine}
        </span>
      </button>
      <p className="text-xs text-white/70 mb-1.5 uppercase tracking-widest">
        Pair Attacks — one super-hard answer, double the power
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {pairs.map((pair) => {
          const affordable = charge >= pair.cost && spellsLoaded;
          return (
            <button
              key={pair.id}
              onClick={() => onPair(pair)}
              disabled={!affordable}
              className="bg-gradient-to-r from-orange-500/20 to-amber-400/10 hover:from-orange-500/30 disabled:opacity-60 rounded-xl px-3 py-2 text-left transition border border-orange-300/30"
            >
              <span className="font-bold text-sm">
                <span className="mr-1.5">{pair.emoji}</span>
                {pair.name}
                <span className={`ml-1.5 text-xs ${affordable ? 'text-amber-300' : 'text-white/40'}`}>◆{pair.cost}</span>
              </span>
              <span className="block text-xs text-white/70 mt-0.5">{pair.description}</span>
              <NeedMore cost={pair.cost} charge={charge} loading={!spellsLoaded} />
            </button>
          );
        })}
      </div>
      {growHint && (
        <p className="text-xs text-white/60 mt-2 italic">Restore crystals to help Ember grow — bigger Ember, bigger combos!</p>
      )}
      <BackButton onClick={onBack} />
    </div>
  );
}

/** 🔄 Swap — a free action: pick who fights beside the hero; locked friends say how to recruit them. */
export function SwapMenu({
  party,
  active,
  onSwap,
  onBack,
}: {
  party: CompanionId[];
  active: CompanionId;
  onSwap: (id: CompanionId) => void;
  onBack: () => void;
}) {
  return (
    <div className={SUBMENU}>
      <p className={`${HEADER} mb-3`}>🔄 Swap — free, you still get your move!</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {COMPANION_IDS.map((id) => {
          const c = COMPANIONS[id];
          const joined = party.includes(id);
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => onSwap(id)}
              disabled={!joined}
              className={`rounded-xl px-3 py-2 text-left transition border ${
                isActive ? 'bg-sky-500/25 border-sky-300/70' : 'bg-white/10 hover:bg-white/20 border-transparent'
              } disabled:opacity-60 disabled:hover:bg-white/10`}
            >
              <span className="font-bold text-sm">
                <span className="mr-1.5">{c.emoji}</span>
                {c.name}
                <span className="ml-1.5 text-xs uppercase tracking-wider text-white/70">{c.role}</span>
              </span>
              <span className="block text-xs text-white/75 mt-0.5">
                {!joined ? `🔒 ${c.joinHint}` : isActive ? '✓ Fighting now' : c.blurb}
              </span>
            </button>
          );
        })}
      </div>
      <BackButton onClick={onBack} />
    </div>
  );
}
