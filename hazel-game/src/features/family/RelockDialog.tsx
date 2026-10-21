import { useEffect, useId, useRef } from 'react';
import ModalLayer from '../../components/ModalLayer';
import { grownUpsLockedMessage, relockLead, relockTitle } from '../../lib/grownUpsGate';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import { unlockCancelled, unlockedAgain, useGrownUpsStore } from '../../store/grownUpsStore';
import GrownUpsGate from './GrownUpsGate';
import { gateLinkClass } from './familyStyles';

/**
 * 👪 Grown-ups locked mid-action (#167): the database refused a grown-up
 * action because the 15-minute window shut (or, on a setup screen, was never
 * open on this sign-in). A modal over the page it happened on — so the form
 * and what was typed stay — with the same way in as the gate (the grown-up
 * PIN or the password). Opened, the waiting action carries on by itself;
 * "Not now" (or Escape, which puts focus back on the button that was
 * pressed) ends it, and the page says nothing changed in words for where it
 * is (`grownUpsLockedMessage`). App renders it beside every grown-up screen
 * (consent, the first player, a player's PIN, 👪 Grown-ups) and says which
 * (`inArea`): "locked again" only in 👪 Grown-ups itself (#167 review round 1).
 */
export default function RelockDialog({ inArea = false }: { inArea?: boolean }) {
  const asked = useGrownUpsStore((s) => s.asked);
  return asked ? <RelockLayer inArea={inArea} /> : null;
}

function RelockLayer({ inArea }: { inArea: boolean }) {
  const hasParentPin = useFamilyStore((s) => s.hasParentPin);
  const email = useAuthStore((s) => s.user?.email ?? '');
  const leadId = useId();
  const title = relockTitle(inArea);
  // "Not now", Escape, or the dialog going away: the page's words for where it is.
  const words = grownUpsLockedMessage({ inArea, hasParentPin });
  const wordsRef = useRef(words);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);
  const notNow = () => unlockCancelled(words);

  // Gone without being opened (the screen behind it changed): the waiting action ends.
  useEffect(
    () => () => {
      if (useGrownUpsStore.getState().asked) unlockCancelled(wordsRef.current);
    },
    [],
  );

  return (
    <ModalLayer
      label={title}
      describedBy={leadId}
      onEscape={notNow}
      restoreFocusOnEscape
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 [@media(max-width:359px)]:p-2 [@media(max-height:500px)]:p-2"
    >
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl [@media(max-width:359px)]:p-4 [@media(max-height:500px)]:max-w-xl [@media(max-height:500px)]:p-4">
          <GrownUpsGate
            onUnlock={unlockedAgain}
            autoFocusPassword
            // One line under the title says what to do: the gate's own
            // subtitle would only say it again (#167 review round 1).
            frame={(_subtitle, controls, way) => (
              <>
                <h2 className="text-center text-xl font-bold text-purple-700">{title}</h2>
                <p
                  id={leadId}
                  className="mb-4 mt-1 text-center text-sm text-gray-700 [overflow-wrap:anywhere] [@media(max-height:500px)]:mb-2"
                >
                  {relockLead(way, email, hasParentPin)}
                </p>
                {controls}
              </>
            )}
            back={
              <button type="button" onClick={notNow} className={`mt-1 ${gateLinkClass} text-purple-600`}>
                Not now
              </button>
            }
          />
        </div>
      </div>
    </ModalLayer>
  );
}
