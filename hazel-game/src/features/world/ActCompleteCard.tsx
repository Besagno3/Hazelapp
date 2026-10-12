import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import ModalLayer from '../../components/ModalLayer';
import { adventureProgress, whileYouWait } from '../../lib/adventure';
import type { SaveData } from '../../types';

/**
 * "Act II complete!" (#132): after Act II's ending panels, the end of the
 * story built so far — what the hero has done (crystals, secrets, quests,
 * badges), that Act III is coming, and what's still there to do meanwhile.
 * One button back to the world.
 */
export default function ActCompleteCard({ save, onClose }: { save: SaveData; onClose: () => void }) {
  const progress = adventureProgress(save);
  const stats = [
    { emoji: '💎', label: 'Crystals', value: `${progress.crystals.restored}/${progress.crystals.total}` },
    { emoji: '✨', label: 'Secrets', value: `${progress.secrets.found}/${progress.secrets.total}` },
    { emoji: '📜', label: 'Quests', value: `${progress.quests.done}/${progress.quests.total}` },
    { emoji: '🏅', label: 'Badges', value: `${progress.badges}` },
  ];

  // Focus the button without scrolling to it: on a short screen (a phone
  // held sideways) the card opens at its title, and scrolls on down.
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus({ preventScroll: true });
    confetti({ particleCount: 220, spread: 120, origin: { y: 0.35 }, disableForReducedMotion: true });
  }, []);

  return (
    <ModalLayer label="Act II complete" className="fixed inset-0 z-[80] overflow-y-auto bg-black/90">
      {/* Short screens: tighter; a phone held sideways also wider, the stats in one row. */}
      <div className="min-h-full flex items-center justify-center p-4 [@media(max-height:600px)]:py-2">
        <div className="w-full max-w-md rounded-2xl border-2 border-amber-300/60 bg-slate-900 p-5 text-center text-white [@media(max-height:500px)]:max-w-2xl [@media(max-height:600px)]:p-3">
          <div aria-hidden className="text-5xl leading-none [@media(max-height:600px)]:hidden">
            🏁
          </div>
          <h2 className="mt-2 text-2xl font-extrabold text-amber-300 [@media(max-height:600px)]:mt-0">
            <span aria-hidden className="hidden [@media(max-height:600px)]:inline">🏁 </span>
            Act II complete!
          </h2>
          <p className="mt-1 text-white/85">The Crystal of Memory shines, and the Hall of Names remembers you.</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-left [@media(max-height:600px)]:mt-2 [@media(max-height:500px)]:grid-cols-4" data-testid="act-stats">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 px-3 py-2">
                <dt className="text-xs text-white/70">
                  <span aria-hidden>{s.emoji} </span>
                  {s.label}
                </dt>
                <dd className="text-lg font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 font-bold text-amber-200 [@media(max-height:600px)]:mt-2">Act III: The Starfall Sea is coming soon!</p>
          <p className="mt-2 text-sm text-white/80 [@media(max-height:600px)]:mt-1">While you wait:</p>
          <ul className="mt-1 space-y-1 text-left text-sm text-white/90 [@media(max-height:600px)]:space-y-0">
            {whileYouWait(progress).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button
            ref={button}
            onClick={onClose}
            className="mt-5 min-h-[44px] [@media(max-height:600px)]:mt-3 rounded-xl bg-amber-400 px-8 py-3 font-bold text-amber-950 hover:bg-amber-300"
          >
            🗺️ Keep exploring
          </button>
        </div>
      </div>
    </ModalLayer>
  );
}
