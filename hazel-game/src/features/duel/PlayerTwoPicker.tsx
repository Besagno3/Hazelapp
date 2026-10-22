import { useState } from 'react';
import { kidIcon, MAX_KID_NAME } from '../../content/family';
import { useFamilyStore } from '../../store/familyStore';
import { usePlayerTwoStore } from '../../store/playerTwoStore';
import { cn } from '../../lib/utils';
import { GUEST_ICON, GUEST_PACES, playerTwoChoices, type GuestPace } from '../../lib/playerTwo';

/** Each guest pace's words, against the kid playing's name. */
const PACE_WORDS: Record<GuestPace, (one: string) => { emoji: string; label: string }> = {
  easier: () => ({ emoji: '🌱', label: 'Easier' }),
  same: (one) => ({ emoji: '⚖️', label: `Same as ${one}` }),
  harder: () => ({ emoji: '🔥', label: 'Harder' }),
};

/**
 * Who's Player 2 (#177): another kid of the family — no PIN, since nothing of
 * theirs is changed, only their levels read — or a friend or grown-up as a
 * guest, with a name (optional) and how tricky their questions are. The pick
 * is the store's (`playerTwoStore`), so the next duel starts with it.
 */
export default function PlayerTwoPicker({ playerOne }: { playerOne: string }) {
  const kids = useFamilyStore((s) => s.kids);
  const activeKidId = useFamilyStore((s) => s.activeKidId);
  const playerTwo = usePlayerTwoStore((s) => s.playerTwo);
  const chooseKid = usePlayerTwoStore((s) => s.chooseKid);
  const chooseGuest = usePlayerTwoStore((s) => s.chooseGuest);
  const choices = playerTwoChoices(kids, activeKidId);
  const guest = playerTwo?.kind === 'guest' ? playerTwo : null;
  // What's typed is kept here too, so going to a sibling and back keeps it.
  const [name, setName] = useState(guest?.name ?? '');
  const [pace, setPace] = useState<GuestPace>(guest?.pace ?? 'same');

  const tile = 'rounded-2xl border-2 p-3 flex flex-col items-center text-center transition min-h-[6.5rem]';
  const on = 'border-amber-400 bg-amber-50 ring-2 ring-amber-300';
  const off = 'border-gray-200 bg-white hover:border-amber-300';

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {choices.map((k) => {
          const picked = playerTwo?.kind === 'kid' && playerTwo.id === k.id;
          return (
            <button key={k.id} aria-pressed={picked} onClick={() => void chooseKid(k)} className={cn(tile, picked ? on : off)}>
              <span className="text-4xl" aria-hidden>
                {kidIcon(k.icon)}
              </span>
              <span className="mt-1 font-bold text-gray-800 truncate max-w-full">{k.name?.trim() || 'Player'}</span>
              <span className="text-xs text-gray-500">Their own level</span>
            </button>
          );
        })}
        <button aria-pressed={!!guest} onClick={() => chooseGuest(name, pace)} className={cn(tile, guest ? on : off)}>
          <span className="text-4xl" aria-hidden>
            {GUEST_ICON}
          </span>
          <span className="mt-1 font-bold text-gray-800">A friend or grown-up</span>
          <span className="text-xs text-gray-500">Plays as a guest</span>
        </button>
      </div>

      {guest && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-left">
          <label className="block text-sm font-semibold text-gray-700">
            Their name <span className="font-normal text-gray-500">(you can skip this)</span>
            <input
              value={name}
              maxLength={MAX_KID_NAME}
              placeholder="Guest"
              autoComplete="off"
              onChange={(e) => {
                setName(e.target.value);
                chooseGuest(e.target.value, pace);
              }}
              className="mt-1 block w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 font-normal focus:border-amber-400 focus:outline-none"
            />
          </label>
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-gray-700">How tricky should their questions be?</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {GUEST_PACES.map((p) => {
                const { emoji, label } = PACE_WORDS[p](playerOne);
                return (
                  <button
                    key={p}
                    aria-pressed={pace === p}
                    onClick={() => {
                      setPace(p);
                      chooseGuest(name, p);
                    }}
                    className={cn(
                      'rounded-lg border-2 px-2 py-2 text-sm font-semibold transition [overflow-wrap:anywhere]',
                      pace === p ? 'border-amber-400 bg-white text-amber-900' : 'border-transparent bg-white/60 text-gray-700 hover:border-amber-300',
                    )}
                  >
                    <span aria-hidden>{emoji} </span>
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-2 text-xs text-gray-600">Their questions are written for {playerOne}'s age.</p>
        </div>
      )}
    </div>
  );
}
