import { useState } from 'react';
import { kidIcon } from '../../content/family';
import { useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import PinPad from './PinPad';
import type { Kid } from '../../types';

/**
 * "Who's playing?" (#118): each kid taps their own tile, then types their
 * 4-digit PIN. Grown-ups manage the family from 👪 Grown-ups, behind their
 * own PIN or password.
 */
export default function WhoIsPlaying() {
  const kids = useFamilyStore((s) => s.kids);
  const choose = useFamilyStore((s) => s.choose);
  const checkKidPin = useFamilyStore((s) => s.checkKidPin);
  const setGrownUpsOpen = useFamilyStore((s) => s.setGrownUpsOpen);
  const [asking, setAsking] = useState<Kid | null>(null);

  if (asking) {
    return (
      <FamilyCard title={`Hi, ${asking.name ?? 'Player'}!`} subtitle="Type your PIN.">
        <PinPad
          onSubmit={async (pin) => {
            const right = await checkKidPin(asking.id, pin);
            if (right) choose(asking.id);
            return right;
          }}
          wrongText="Not quite — try again! Forgot it? A grown-up can change it in 👪 Grown-ups."
        />
        <button onClick={() => setAsking(null)} className="mt-1 w-full text-center text-sm text-purple-600 hover:underline">
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
            onClick={() => setAsking(k)}
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
