import { CHARGE_MAX } from '../../content/abilities';
import { BATTLE_ITEMS, CONSUMABLES, type ConsumableId } from '../../content/items';
import type { Spell } from '../../content/spells';
import { ChargePips } from './BattleHud';

const PANEL = 'bg-indigo-950/95 border-4 border-white/80 rounded-2xl p-4 w-full max-w-xl text-white shadow-2xl';
const OPTION =
  'bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 rounded-xl px-3 py-2 text-left transition';

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 w-full bg-white/10 hover:bg-white/20 rounded-lg py-2 text-xs font-semibold"
    >
      ← Back
    </button>
  );
}

function CommandButton({
  emoji,
  label,
  hint,
  disabled,
  onClick,
}: {
  emoji: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled} className={`${OPTION} py-2.5`}>
      <span className="text-lg mr-1.5">{emoji}</span>
      <span className="font-bold text-sm">{label}</span>
      {hint && <span className="block text-[10px] text-white/50 mt-0.5">{hint}</span>}
    </button>
  );
}

/** The top-level command box: Attack / Spells / Guard / Items / Flee. */
export function CommandMenu({
  charge,
  spellsLoaded,
  canCastAny,
  items,
  isBoss,
  onAttack,
  onSpells,
  onGuard,
  onItems,
  onFlee,
}: {
  charge: number;
  spellsLoaded: boolean;
  canCastAny: boolean;
  items: Record<ConsumableId, number>;
  isBoss: boolean;
  onAttack: () => void;
  onSpells: () => void;
  onGuard: () => void;
  onItems: () => void;
  onFlee: () => void;
}) {
  return (
    <div className={PANEL}>
      <p className="text-xs text-white/60 mb-3 uppercase tracking-widest">
        Your move — every command is a question!
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
        <CommandButton emoji="🛡️" label="Guard" onClick={onGuard} />
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
  onCast,
  onBack,
}: {
  spells: Spell[];
  charge: number;
  spellsLoaded: boolean;
  onCast: (spell: Spell) => void;
  onBack: () => void;
}) {
  return (
    <div className={PANEL}>
      <p className="text-xs text-white/60 mb-1 uppercase tracking-widest">
        📖 Spellbook — each spell needs one super-hard answer!
      </p>
      <p className="text-[11px] text-white/50 mb-3">
        Charge: <ChargePips charge={charge} />
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {spells.map((spell) => {
          const affordable = charge >= spell.cost && spellsLoaded;
          return (
            <button key={spell.id} onClick={() => onCast(spell)} disabled={!affordable} className={OPTION}>
              <span className="font-bold text-sm">
                <span className="mr-1.5">{spell.emoji}</span>
                {spell.name}
                <span className={`ml-1.5 text-xs ${affordable ? 'text-amber-300' : 'text-white/40'}`}>
                  ◆{spell.cost}
                </span>
              </span>
              <span className="block text-[10px] text-white/50 mt-0.5">{spell.description}</span>
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
    <div className={PANEL}>
      <p className="text-xs text-white/60 mb-3 uppercase tracking-widest">🎒 Items — using one takes your turn</p>
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
              <span className="block text-[10px] text-white/50 mt-0.5">{why ?? CONSUMABLES[id].description}</span>
            </button>
          );
        })}
      </div>
      <BackButton onClick={onBack} />
    </div>
  );
}
