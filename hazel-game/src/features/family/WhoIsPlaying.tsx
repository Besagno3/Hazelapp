import { useState } from 'react';
import { kidIcon, SECRET_PICTURES } from '../../content/family';
import { useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import type { Kid } from '../../types';

/** A fresh order each time, so a sibling can't just copy where a finger went. */
function shuffled<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * "Who's playing?" (#118): each kid taps their own tile, then their secret
 * picture (a kid without one goes straight in). Grown-ups manage the family
 * from 👪 Grown-ups, behind their password.
 */
export default function WhoIsPlaying() {
  const kids = useFamilyStore((s) => s.kids);
  const choose = useFamilyStore((s) => s.choose);
  const setGrownUpsOpen = useFamilyStore((s) => s.setGrownUpsOpen);
  const [asking, setAsking] = useState<Kid | null>(null);
  const [order, setOrder] = useState(() => shuffled(SECRET_PICTURES));
  const [wrong, setWrong] = useState(false);

  function pick(kid: Kid) {
    if (!kid.picture) return choose(kid.id);
    setOrder(shuffled(SECRET_PICTURES));
    setWrong(false);
    setAsking(kid);
  }

  if (asking) {
    return (
      <FamilyCard title={`Hi, ${asking.name ?? 'Player'}!`} subtitle="Tap your secret picture.">
        <div className="grid grid-cols-3 gap-3">
          {order.map((p) => (
            <button
              key={p.id}
              onClick={() => (p.id === asking.picture ? choose(asking.id) : setWrong(true))}
              aria-label={p.name}
              className="aspect-square rounded-2xl bg-purple-50 hover:bg-purple-100 text-4xl flex items-center justify-center transition"
            >
              <span aria-hidden>{p.emoji}</span>
            </button>
          ))}
        </div>
        <p role="status" className="mt-4 min-h-10 text-center text-sm text-amber-700">
          {wrong ? 'Not that one — try again! Forgot? A grown-up can check in 👪 Grown-ups.' : ''}
        </p>
        <button onClick={() => setAsking(null)} className="mt-2 w-full text-center text-sm text-purple-600 hover:underline">
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
            onClick={() => pick(k)}
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
