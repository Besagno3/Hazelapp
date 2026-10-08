import {
  FIELD_SPELLS,
  FIELD_SPELL_IDS,
  canGlow,
  knowsFieldSpell,
  returnSpots,
  type FieldCast,
  type FieldSpellId,
} from '../../content/fieldSpells';
import { ZONES, zone } from '../../content/zones';
import { sendFlow } from '../../machines/gameFlow';
import type { SaveData } from '../../types';

const castButton =
  'min-h-[44px] rounded-lg px-3 py-2 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-amber-950 disabled:bg-white/10 disabled:text-white/50';

/**
 * The menu's ✨ Field spells (#75 item 9): each known spell with its cast
 * button (Return lists the towns you've been to), and each one not learned
 * yet with the shrine that teaches it — so the menu is a pointer, too.
 */
export default function FieldSpellsPanel({
  save,
  calmLeft,
  onCast,
}: {
  save: SaveData;
  /** Seconds of Calm left (0 = off). */
  calmLeft: number;
  onCast?: (cast: FieldCast) => void;
}) {
  function cast(c: FieldCast) {
    sendFlow({ type: 'CLOSE' });
    onCast?.(c);
  }

  return (
    <div className="bg-white/10 rounded-xl p-3 mb-3">
      <div className="font-bold text-sm mb-1">✨ Field spells</div>
      <p className="text-[11px] text-white/60 mb-2">
        Magic for out in the world — no questions needed. Each shrine keeper teaches one.
      </p>
      <div className="space-y-3">
        {FIELD_SPELL_IDS.map((id) => (
          <SpellRow key={id} id={id} save={save} calmLeft={calmLeft} onCast={onCast ? cast : undefined} />
        ))}
      </div>
    </div>
  );
}

function SpellRow({
  id,
  save,
  calmLeft,
  onCast,
}: {
  id: FieldSpellId;
  save: SaveData;
  calmLeft: number;
  onCast?: (cast: FieldCast) => void;
}) {
  const spell = FIELD_SPELLS[id];
  if (!knowsFieldSpell(id, save.flags)) {
    return (
      <div className="text-sm text-white/60">
        🔒 {spell.name}
        <span className="block text-[11px]">Learn it at {zone(spell.shrine).the ? 'the ' : ''}{zone(spell.shrine).name}.</span>
      </div>
    );
  }

  const title = (
    <span className="text-sm">
      {spell.emoji} <span className="font-semibold">{spell.name}</span>
      <span className="block text-[11px] text-white/60">{spell.description}</span>
    </span>
  );

  if (id === 'return') {
    const spots = returnSpots(ZONES, save.flags);
    return (
      <div>
        {title}
        {onCast && (
          <div className="flex flex-wrap gap-2 mt-1.5">
            {spots.map((spot) => {
              const here = spot.zoneId === save.zoneId;
              return (
                <button
                  key={spot.zoneId}
                  onClick={() => onCast({ spell: 'return', to: spot.zoneId })}
                  disabled={here}
                  className={castButton}
                  title={here ? "You're here" : `Fly to ${spot.name}`}
                >
                  {spot.name}
                  {here && ' (here)'}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const ready = id === 'glow' ? canGlow(zone(save.zoneId), save.flags) : calmLeft <= 0;
  const why =
    id === 'glow'
      ? zone(save.zoneId).dark
        ? 'This place is lit already.'
        : 'Nothing dark to light here.'
      : `Calm is on — ${calmLeft}s left.`;
  return (
    <div className="flex items-center justify-between gap-2">
      <span>
        {title}
        {!ready && <span className="block text-[11px] text-amber-200/80">{why}</span>}
      </span>
      {onCast && (
        <button onClick={() => onCast(id === 'glow' ? { spell: 'glow' } : { spell: 'calm' })} disabled={!ready} className={castButton}>
          Cast
        </button>
      )}
    </div>
  );
}
