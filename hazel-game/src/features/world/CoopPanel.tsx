import { useState } from 'react';
import { useFamilyStore } from '../../store/familyStore';
import { usePlayerTwoStore } from '../../store/playerTwoStore';
import { useSaveStore } from '../../store/saveStore';
import { companionLook, companionsInParty } from '../../content/companion';
import { kidName, playerTwoLook } from '../../lib/playerTwo';
import PlayerTwoPicker from '../duel/PlayerTwoPicker';

/**
 * 👥 Play together (#178), in the world's 📜 Menu: co-op battles on or off.
 * Off, one row says what it is; tapping it asks who's Player 2
 * (`PlayerTwoPicker`, the duel's) and "👥 Play together!" turns it on. On, it
 * says who plays the companion, and "Stop playing together" turns it off. For
 * this session only — Switch player puts it away with the game.
 */
export default function CoopPanel() {
  const kids = useFamilyStore((s) => s.kids);
  const activeKidId = useFamilyStore((s) => s.activeKidId);
  const save = useSaveStore((s) => s.save);
  const playerTwo = usePlayerTwoStore((s) => s.playerTwo);
  const coop = usePlayerTwoStore((s) => s.coop);
  const loading = usePlayerTwoStore((s) => s.loading);
  const setCoop = usePlayerTwoStore((s) => s.setCoop);
  const [picking, setPicking] = useState(false);
  const oneName = kidName(kids.find((k) => k.id === activeKidId), 'you');
  const party = save ? companionsInParty(save) : [];
  const companion = companionLook(save?.companionId && party.includes(save.companionId) ? save.companionId : 'ember', save?.flags);
  const ready = !!playerTwo && !loading;

  return (
    <div className="bg-white/10 rounded-xl p-3 mb-3" data-testid="coop-panel">
      <div className="font-bold text-sm mb-2">👥 Play together</div>
      {coop && playerTwo ? (
        <>
          <p className="text-sm">
            {playerTwoLook(playerTwo).icon} <strong>{playerTwoLook(playerTwo).name}</strong> plays {companion.emoji} {companion.name} in
            battles: after {oneName}'s move, they pick theirs — each with a question at their own level.
          </p>
          <button
            onClick={() => setCoop(false)}
            className="mt-2 w-full min-h-[44px] bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm font-semibold"
          >
            Stop playing together
          </button>
        </>
      ) : picking ? (
        <div className="bg-white text-gray-800 rounded-xl p-3">
          <p className="font-bold mb-2">Who's playing with {oneName}?</p>
          <PlayerTwoPicker playerOne={oneName} />
          <p className="mt-2 text-xs text-gray-600">
            They play {companion.emoji} {companion.name}. Only {oneName}'s answers earn XP; nothing of theirs is saved.
          </p>
          <button
            aria-disabled={!ready}
            onClick={() => {
              if (!ready) return;
              setCoop(true);
              setPicking(false);
            }}
            className={`mt-3 w-full min-h-[44px] rounded-lg font-bold text-white bg-amber-700 hover:bg-amber-800 ${ready ? '' : 'opacity-60 cursor-not-allowed'}`}
          >
            👥 Play together!
          </button>
          <button onClick={() => setPicking(false)} className="mt-1 w-full min-h-[44px] text-sm text-gray-600 hover:underline">
            Not now
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="w-full min-h-[44px] flex items-center justify-between bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm"
        >
          <span className="text-left">
            Two players
            <span className="block text-xs text-white/70">A friend or family member plays your companion in battles</span>
          </span>
          <span className="text-white/70">Off</span>
        </button>
      )}
    </div>
  );
}
