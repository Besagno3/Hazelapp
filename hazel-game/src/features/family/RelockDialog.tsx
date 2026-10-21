import { useEffect, useId } from 'react';
import ModalLayer from '../../components/ModalLayer';
import { relockLead, relockTitle } from '../../lib/grownUpsGate';
import { useFamilyStore } from '../../store/familyStore';
import { unlockCancelled, unlockedAgain, useGrownUpsStore } from '../../store/grownUpsStore';
import GrownUpsGate from './GrownUpsGate';
import { gateLinkClass } from './familyStyles';

/**
 * 👪 Grown-ups locked again, mid-action (#167): the database refused a
 * grown-up action because the 15-minute window shut (or, in the first run,
 * never opened on this sign-in). A modal over the page it happened on — so
 * the form and what was typed stay — with the same way in as the gate (the
 * grown-up PIN or the password). Opened, the waiting action carries on by
 * itself; "Not now" (or Escape) ends it, and the page says nothing changed.
 * App renders it beside every grown-up screen (consent, the first player, a
 * player's PIN, 👪 Grown-ups).
 */
export default function RelockDialog() {
  const asked = useGrownUpsStore((s) => s.asked);
  return asked ? <RelockLayer /> : null;
}

function RelockLayer() {
  const wasOpen = useGrownUpsStore((s) => s.wasOpen);
  const hasParentPin = useFamilyStore((s) => s.hasParentPin);
  const leadId = useId();
  const title = relockTitle(wasOpen);

  // Gone without being opened (the screen behind it changed): the waiting action ends.
  useEffect(
    () => () => {
      if (useGrownUpsStore.getState().asked) unlockCancelled();
    },
    [],
  );

  return (
    <ModalLayer
      label={title}
      describedBy={leadId}
      onEscape={unlockCancelled}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 [@media(max-height:500px)]:p-2"
    >
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl [@media(max-height:500px)]:max-w-xl [@media(max-height:500px)]:p-4">
          <GrownUpsGate
            onUnlock={unlockedAgain}
            autoFocusPassword
            frame={(subtitle, controls) => (
              <>
                <h2 className="text-center text-xl font-bold text-purple-700">{title}</h2>
                <p id={leadId} className="mt-1 text-center text-sm text-gray-700">
                  {relockLead(hasParentPin)}
                </p>
                <p className="mb-4 mt-1 text-center text-xs text-gray-500 [@media(max-height:500px)]:mb-2">{subtitle}</p>
                {controls}
              </>
            )}
            back={
              <button type="button" onClick={unlockCancelled} className={`mt-1 ${gateLinkClass} text-purple-600`}>
                Not now
              </button>
            }
          />
        </div>
      </div>
    </ModalLayer>
  );
}
