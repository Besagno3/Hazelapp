import { useEffect, useRef, useState } from 'react';
import { useFamilyStore } from '../../store/familyStore';
import { usePlayerTwoStore } from '../../store/playerTwoStore';
import { useSaveStore } from '../../store/saveStore';
import { companionLook, companionsInParty } from '../../content/companion';
import { kidName, playerTwoLook } from '../../lib/playerTwo';
import PlayerTwoPicker from '../duel/PlayerTwoPicker';

/** Who earns what playing together, said as Player 2 is picked. */
export const COOP_XP_NOTE = 'A family player earns XP for their own right answers; a guest plays just for fun.';

/**
 * 👥 Play together (#187), in the world's 📜 Menu: co-op battles on or off.
 * Off, one row says what it is; tapping it asks who's Player 2
 * (`PlayerTwoPicker`, the duel's) and "👥 Play together!" turns it on. On, it
 * says who plays the companion, and "Stop playing together" turns it off. For
 * this session only — Switch player puts it away with the game. Each step
 * hands the keyboard on within the panel — the question's heading, the "on"
 * words, the row back — never back to the top of the long 📜 Menu (#191).
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
  // A sibling typing their PIN: "Play together!" waits until they're in.
  const [asking, setAsking] = useState(false);
  const oneName = kidName(kids.find((k) => k.id === activeKidId), 'you');
  const party = save ? companionsInParty(save) : [];
  const companion = companionLook(save?.companionId && party.includes(save.companionId) ? save.companionId : 'ember', save?.flags);
  const ready = !!playerTwo && !loading;
  // Where the keyboard goes once the step just taken has rendered.
  const focusNext = useRef<'question' | 'on' | 'off' | null>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const onRef = useRef<HTMLParagraphElement>(null);
  const offRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const to = focusNext.current;
    focusNext.current = null;
    const el = to === 'question' ? questionRef.current : to === 'on' ? onRef.current : to === 'off' ? offRef.current : null;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [picking, coop]);
  function step(to: 'question' | 'on' | 'off', change: () => void) {
    focusNext.current = to;
    change();
  }

  return (
    <div className="bg-white/10 rounded-xl p-3 mb-3" data-testid="coop-panel">
      <div className="font-bold text-sm mb-2">👥 Play together</div>
      {coop && playerTwo ? (
        <>
          <p ref={onRef} tabIndex={-1} className="text-sm focus:outline-none">
            {playerTwoLook(playerTwo).icon} <strong>{playerTwoLook(playerTwo).name}</strong> plays {companion.emoji} {companion.name} in
            battles: after {oneName}'s move, they pick theirs — each with a question at their own level.
          </p>
          <button
            onClick={() => step('off', () => setCoop(false))}
            className="mt-2 w-full min-h-[44px] bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-sm font-semibold"
          >
            Stop playing together
          </button>
        </>
      ) : picking ? (
        <div className="bg-white text-gray-800 rounded-xl p-3">
          <p ref={questionRef} tabIndex={-1} className="font-bold mb-2 focus:outline-none">
            Who's playing with {oneName}?
          </p>
          <PlayerTwoPicker playerOne={oneName} onAsking={setAsking} />
          {!asking && (
            <>
              <p className="mt-2 text-xs text-gray-600">
                They play {companion.emoji} {companion.name}. {COOP_XP_NOTE}
              </p>
              <button
                aria-disabled={!ready}
                onClick={() => {
                  if (!ready) return;
                  step('on', () => {
                    setCoop(true);
                    setPicking(false);
                  });
                }}
                className={`mt-3 w-full min-h-[44px] rounded-lg font-bold text-white bg-amber-700 hover:bg-amber-800 ${ready ? '' : 'opacity-60 cursor-not-allowed'}`}
              >
                👥 Play together!
              </button>
              <button onClick={() => step('off', () => setPicking(false))} className="mt-1 w-full min-h-[44px] text-sm text-gray-600 hover:underline">
                Not now
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          ref={offRef}
          onClick={() => step('question', () => setPicking(true))}
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
