import { useRef, useState } from 'react';
import { kidIcon } from '../../content/family';
import { useFamilyStore } from '../../store/familyStore';
import { kidLockKey } from '../../lib/pinLock';
import FamilyCard from './FamilyCard';
import PinPad from './PinPad';
import type { Kid } from '../../types';

/** What the locked pad tells a grown-up: where to unlock it, and that the same PIN is fine (#124c review). */
export const KID_UNLOCK_HELP =
  'Grown-ups: in 👪 Grown-ups, tap Change by their name and type their PIN again — the same one is fine — to unlock it.';

/**
 * "Who's playing?" (#124): each kid taps their own tile, then types their
 * 4-digit PIN (5 wrong in a row and the database gives it a break, #124c — a
 * grown-up typing the PIN again in 👪 Grown-ups unlocks it, and the pad
 * notices). Grown-ups manage the family from 👪 Grown-ups, behind their own
 * PIN or password.
 */
export default function WhoIsPlaying() {
  const kids = useFamilyStore((s) => s.kids);
  const choose = useFamilyStore((s) => s.choose);
  const checkKidPin = useFamilyStore((s) => s.checkKidPin);
  const setGrownUpsOpen = useFamilyStore((s) => s.setGrownUpsOpen);
  const pinLocks = useFamilyStore((s) => s.pinLocks);
  const [asking, setAsking] = useState<Kid | null>(null);
  const [resting, setResting] = useState(false);
  // Who the pad is open for right now: a check that answers after "That's not me" lets nobody in.
  const askingId = useRef<string | null>(null);
  function ask(kid: Kid | null) {
    askingId.current = kid?.id ?? null;
    setAsking(kid);
    setResting(false);
  }

  if (asking) {
    const kid = asking;
    return (
      <FamilyCard focusTitle title={`Hi, ${kid.name ?? 'Player'}!`} subtitle={resting ? 'Taking a short break.' : 'Type your PIN.'}>
        <PinPad
          key={kid.id}
          onSubmit={async (pin) => {
            const verdict = await checkKidPin(kid.id, pin);
            if (verdict.ok && askingId.current === kid.id) choose(kid.id);
            return verdict;
          }}
          forgotText="Forgot it? A grown-up can change it in 👪 Grown-ups."
          lockKey={kidLockKey(kid.id)}
          checkLock={async () => {
            const locks = await pinLocks();
            return locks === null ? null : (locks.kids[kid.id] ?? 0);
          }}
          lockedHelp={KID_UNLOCK_HELP}
          onLockedChange={setResting}
        />
        <button
          onClick={() => ask(null)}
          className="mt-1 w-full min-h-11 text-center text-sm text-purple-600 hover:underline"
        >
          ← That's not me
        </button>
      </FamilyCard>
    );
  }

  return (
    <FamilyCard wide title="Who's playing?">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {kids.map((k) => (
          <button
            key={k.id}
            onClick={() => ask(k)}
            className="rounded-2xl bg-purple-50 hover:bg-purple-100 p-4 flex flex-col items-center transition"
          >
            <span className="text-5xl" aria-hidden>
              {kidIcon(k.icon)}
            </span>
            <span className="mt-2 font-bold text-purple-800 truncate max-w-full">{k.name ?? 'Player'}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => setGrownUpsOpen(true)}
        className="mt-6 w-full text-center text-sm text-gray-500 hover:underline"
      >
        👪 Grown-ups
      </button>
    </FamilyCard>
  );
}
