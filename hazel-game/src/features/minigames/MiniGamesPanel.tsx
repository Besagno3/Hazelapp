import { MINIGAMES, MINIGAME_IDS, openedFlag } from '../../content/minigames';
import { starsEarned, pagesFound } from '../../lib/minigames';
import { Stars } from './parts';

/**
 * 📜 Menu → 🎮 Mini-games (docs/DESIGN-MINIGAMES.md §3.6): each game the kid
 * has opened, its stars, its collection so far, and who runs it where — so
 * they can find it again. Nothing until the first one is found.
 */
export default function MiniGamesPanel({ flags }: { flags: Record<string, boolean> }) {
  const found = MINIGAME_IDS.filter((id) => flags[openedFlag(id)]);
  if (found.length === 0) return null;
  return (
    <section aria-labelledby="menu-minigames" className="bg-white/10 rounded-xl p-3 mb-3">
      <h3 id="menu-minigames" className="font-bold text-sm mb-2">
        <span aria-hidden="true">🎮 </span>Mini-games
      </h3>
      <ul className="space-y-2">
        {found.map((id) => {
          const g = MINIGAMES[id];
          return (
            <li key={id} className="flex items-center gap-3 text-xs">
              <span aria-hidden="true" className="text-2xl leading-none">
                {g.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-amber-300">{g.name}</span>
                <span className="text-white/70">
                  {g.where} · {g.collection} {pagesFound(flags, id).length}/{g.pages}
                </span>
              </span>
              <Stars count={starsEarned(flags, id)} size={18} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
