import { useEffect, useRef, useState } from 'react';
import { kidIcon, MAX_KID_NAME } from '../../content/family';
import { useFamilyStore } from '../../store/familyStore';
import { usePlayerTwoStore } from '../../store/playerTwoStore';
import { cn } from '../../lib/utils';
import { kidLockKey } from '../../lib/pinLock';
import { GUEST_ICON, GUEST_PACES, playerTwoChoices, type GuestPace } from '../../lib/playerTwo';
import PinPad from '../family/PinPad';
import { KID_UNLOCK_HELP } from '../family/WhoIsPlaying';
import type { Kid } from '../../types';

/** Each guest pace's words, against the kid playing's name. */
const PACE_WORDS: Record<GuestPace, (one: string) => { emoji: string; label: string }> = {
  easier: () => ({ emoji: '🌱', label: 'Easier' }),
  same: (one) => ({ emoji: '⚖️', label: `Same as ${one}` }),
  harder: () => ({ emoji: '🔥', label: 'Harder' }),
};

/**
 * Who's Player 2 (#186): another kid of the family — who types their own PIN
 * first, as on "Who's playing?", since they earn XP as themselves (the
 * owner's call) — or a friend or grown-up as a guest, with a name (optional)
 * and how tricky their questions are. The pick is the store's
 * (`playerTwoStore`), so the next duel starts with it; a kid already picked
 * this session isn't asked again. `onAsking` tells the screen around it while
 * a PIN is being asked, so it can hold its own buttons back.
 */
export default function PlayerTwoPicker({ playerOne, onAsking }: { playerOne: string; onAsking?: (asking: boolean) => void }) {
  const kids = useFamilyStore((s) => s.kids);
  const activeKidId = useFamilyStore((s) => s.activeKidId);
  const checkKidPin = useFamilyStore((s) => s.checkKidPin);
  const pinLocks = useFamilyStore((s) => s.pinLocks);
  const playerTwo = usePlayerTwoStore((s) => s.playerTwo);
  const chooseKid = usePlayerTwoStore((s) => s.chooseKid);
  const chooseGuest = usePlayerTwoStore((s) => s.chooseGuest);
  const choices = playerTwoChoices(kids, activeKidId);
  const guest = playerTwo?.kind === 'guest' ? playerTwo : null;
  // What's typed is kept here too, so going to a sibling and back keeps it.
  const [name, setName] = useState(guest?.name ?? '');
  const [pace, setPace] = useState<GuestPace>(guest?.pace ?? 'same');
  // The kid typing their PIN, and who the pad is open for right now: a check
  // that answers after "That's not me" picks nobody.
  const [asking, setAsking] = useState<Kid | null>(null);
  const askingId = useRef<string | null>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const onAskingRef = useRef(onAsking);
  useEffect(() => {
    onAskingRef.current = onAsking;
  });
  function ask(kid: Kid | null) {
    askingId.current = kid?.id ?? null;
    setAsking(kid);
    onAskingRef.current?.(kid !== null);
  }
  // The pad's heading takes the focus, so a keyboard and a reader start there.
  useEffect(() => {
    if (asking) headingRef.current?.focus({ preventScroll: true });
  }, [asking]);
  // Gone mid-ask (the screen moved on): the screen's buttons come back.
  useEffect(() => () => onAskingRef.current?.(false), []);

  function pickKid(kid: Kid) {
    const picked = playerTwo?.kind === 'kid' && playerTwo.id === kid.id;
    if (picked || !kid.hasPin) void chooseKid(kid);
    else ask(kid);
  }

  if (asking) {
    const kid = asking;
    const kidWord = kid.name?.trim() || 'Player';
    return (
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-3" data-testid="player-two-pin">
        <p ref={headingRef} tabIndex={-1} className="mb-3 text-center font-bold text-gray-800 focus:outline-none [overflow-wrap:anywhere]">
          <span aria-hidden>{kidIcon(kid.icon)} </span>
          Hi, {kidWord}! Type your PIN.
        </p>
        <PinPad
          key={kid.id}
          onSubmit={async (pin) => {
            const verdict = await checkKidPin(kid.id, pin);
            if (verdict.ok && askingId.current === kid.id) {
              ask(null);
              void chooseKid(kid);
            }
            return verdict;
          }}
          forgotText="Forgot it? A grown-up can change it in 👪 Grown-ups."
          lockKey={kidLockKey(kid.id)}
          checkLock={async () => {
            const locks = await pinLocks();
            return locks === null ? null : (locks.kids[kid.id] ?? 0);
          }}
          lockedHelp={KID_UNLOCK_HELP}
          beside={
            <button onClick={() => ask(null)} className="mt-1 w-full min-h-11 text-center text-sm text-amber-900 hover:underline">
              ← That's not me
            </button>
          }
        />
      </div>
    );
  }

  const tile = 'rounded-2xl border-2 p-3 flex flex-col items-center text-center transition min-h-[6.5rem]';
  const on = 'border-amber-400 bg-amber-50 ring-2 ring-amber-300';
  const off = 'border-gray-200 bg-white hover:border-amber-300';

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {choices.map((k) => {
          const picked = playerTwo?.kind === 'kid' && playerTwo.id === k.id;
          return (
            <button key={k.id} aria-pressed={picked} onClick={() => pickKid(k)} className={cn(tile, picked ? on : off)}>
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
