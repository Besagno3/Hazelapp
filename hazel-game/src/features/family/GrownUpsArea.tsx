import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, sessionRanOut } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { calcAge } from '../../lib/age';
import { isPin, kidIcon, PIN_LENGTH } from '../../content/family';
import { KidAddedWithoutPin, useFamilyStore } from '../../store/familyStore';
import { isAdmin } from '../../lib/review';
import { GROWN_UP_UNLOCK_MINUTES, LAPSED_NOTE } from '../../lib/grownUpsGate';
import { useGrownUpsStore } from '../../store/grownUpsStore';
import PasswordInput from '../../components/PasswordInput';
import { useLiveMessage } from '../auth/useLiveMessage';
import { ChangeEmailPage, ChangePasswordPage, SignInSection } from './AccountChange';
import CloseAccountPage, { CloseAccountSection } from './CloseAccount';
import FamilyCard from './FamilyCard';
import SignOutButton from './SignOutButton';
import GrownUpsGate from './GrownUpsGate';
import { gateLinkClass, gatePrimaryClass as primaryClass } from './familyStyles';
import KidForm from './KidForm';
import PrivacyNotice from './PrivacyNotice';
import QuestionReviewPage from './QuestionReviewPage';
import SignInAgainButton from './SignInAgainButton';
import type { Kid } from '../../types';

// 📈 Progress (#29) loads only when a grown-up opens it: the game's first load doesn't carry it.
const ProgressPage = lazy(() => import('./ProgressPage'));

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/**
 * 👪 Grown-ups (#124): add, change and remove kids, set the grown-up PIN,
 * change the login's email or password (#124d), see the privacy notice, sign
 * out and close the whole account (#124b) — and, for the game's owner,
 * 🛡️ Question review (#147). Opens only with the grown-up's own PIN (if
 * they've set one; the database limits guesses, #124c) or their password
 * (`GrownUpsGate`), and since #167 the database holds it to that: opening it
 * opens a 15-minute window on this sign-in that every grown-up action needs,
 * shut again when the area is left (`App`) or the time runs out
 * (`RelockDialog` then asks again, keeping the page). Back on the list once
 * the time has run out, it shows the gate again rather than controls that
 * would only ask (#167 review round 1) — and says why, on the gate and out
 * loud (`LAPSED_NOTE`, #167 review round 2). Closing the account and
 * changing the login ask for the password again, never the PIN. 📈 Progress
 * (#29) shows how each kid is doing — read-only, but still only behind the
 * gate, and it goes back to the gate when the 15 minutes run out like the list.
 */
export default function GrownUpsArea() {
  const [unlocked, setUnlocked] = useState(false);
  // Back at the gate because the window ran out: the gate says so.
  const [lapsed, setLapsed] = useState(false);
  // One live region for the area — gate and pages alike — there from the
  // start, so what's said in it is read out even as the page under it
  // changes (a region's first words aren't).
  const [said, say] = useLiveMessage();
  const close = () => useFamilyStore.getState().setGrownUpsOpen(false);
  const onLapse = useCallback(() => {
    setUnlocked(false);
    setLapsed(true);
    say(LAPSED_NOTE);
  }, [say]);
  return (
    <>
      {unlocked ? (
        <GrownUpsPages say={say} onLapse={onLapse} />
      ) : (
        <GrownUpsGate
          onUnlock={() => {
            setUnlocked(true);
            setLapsed(false);
            say(null);
          }}
          frame={(subtitle, controls) => (
            // Opens with its title focused, like the screens it replaces (#124 review round 2).
            <FamilyCard focusTitle title="👪 Grown-ups" subtitle={lapsed ? `${LAPSED_NOTE} ${subtitle}` : subtitle}>
              {controls}
            </FamilyCard>
          )}
          back={
            <button onClick={close} className={`mt-1 ${gateLinkClass} text-purple-600`}>
              ← Back to Who's playing
            </button>
          }
        />
      )}
      <div role="status" className="sr-only">
        {said && <p key={said.key}>{said.text}</p>}
      </div>
    </>
  );
}

function GrownUpsPages({ say, onLapse }: { say: (words: string | null) => void; onLapse: () => void }) {
  const kids = useFamilyStore((s) => s.kids);
  const consentAt = useFamilyStore((s) => s.consentAt);
  const addKid = useFamilyStore((s) => s.addKid);
  const updateKid = useFamilyStore((s) => s.updateKid);
  const close = () => useFamilyStore.getState().setGrownUpsOpen(false);
  /** Which kid is being changed ('new' = adding one). */
  const [editing, setEditing] = useState<string | null>(null);
  // A player this form just added whose PIN didn't save: it's still "Add a
  // player" (no new title, so the page doesn't jump to its top and away from
  // the words saying why — #167 review round 2), but Save sets their PIN.
  const [addedNoPin, setAddedNoPin] = useState<string | null>(null);
  // Sign out is on its way: "Done" waits (it would only lock again and flicker, #167 review round 2).
  const [signingOut, setSigningOut] = useState(false);
  const [removing, setRemoving] = useState<Kid | null>(null);
  const [closing, setClosing] = useState(false);
  // Changing the login's email or password (#124d).
  const [changing, setChanging] = useState<'email' | 'password' | null>(null);
  // Whose 📈 Progress is open (#29).
  const [progressFor, setProgressFor] = useState<string | null>(null);
  // Which kids' PINs the database has locked (#124c review): unlocking is done here.
  const pinLocks = useFamilyStore((s) => s.pinLocks);
  const [lockedKids, setLockedKids] = useState<Record<string, number>>({});
  // A Save that lifted a kid's lock: said on their row until the list is left again (#124c review round 2).
  const [unlockedId, setUnlockedId] = useState<string | null>(null);
  // Arrived from a review alert's link: straight to the review page.
  const [reviewing, setReviewing] = useState(() => useFamilyStore.getState().reviewRequested);
  const [admin, setAdmin] = useState(false);
  // The button that left the list (its `data-return`), where the keyboard and
  // the page go when the list comes back — once, then forgotten, so a later
  // return never jumps back to an older one (#124 review round 2).
  const returnTo = useRef<string | null>(reviewing ? 'review' : null);

  /** Leave the list for another page, coming back to the button that did it. */
  function leave(to: string) {
    returnTo.current = to;
    setUnlockedId(null);
    setAddedNoPin(null);
    say(null);
  }

  useEffect(() => {
    let live = true;
    void isAdmin().then((yes) => {
      if (live) setAdmin(yes);
    });
    return () => {
      live = false;
    };
  }, []);

  // Asked again each time the list comes back (after a Change, a PIN typed again unlocks).
  const listing = !editing && !removing && !closing && !reviewing && !changing && !progressFor;
  useEffect(() => {
    if (!listing) return;
    let live = true;
    void pinLocks().then((locks) => {
      if (live) setLockedKids(locks?.kids ?? {});
    });
    return () => {
      live = false;
    };
  }, [listing, pinLocks]);

  // On the list once the window has run out (it opened GROWN_UP_UNLOCK_MINUTES
  // ago, by the gate, the dialog or a password typed again): back to the gate,
  // so a kid who finds the device sees the way in, not live grown-up controls.
  // A page part-filled keeps its place; the list checks again when it's back.
  // 📈 Progress has nothing to lose, so it goes back to the gate too (#29): a
  // kid who finds the device never reads the answers to their Library shelf.
  const openedAt = useGrownUpsStore((s) => s.openedAt);
  const watching = listing || progressFor !== null;
  useEffect(() => {
    if (!watching || openedAt === null) return;
    const left = openedAt + GROWN_UP_UNLOCK_MINUTES * 60_000 - Date.now();
    if (left <= 0) {
      onLapse();
      return;
    }
    const timer = window.setTimeout(onLapse, left);
    return () => window.clearTimeout(timer);
  }, [watching, openedAt, onLapse]);

  // Back on the list: the keyboard and the page are where they left it.
  useEffect(() => {
    if (!listing || !returnTo.current) return;
    const key = returnTo.current;
    returnTo.current = null;
    const button = document.querySelector<HTMLElement>(`[data-return="${key}"]`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView?.({ block: 'center' });
  }, [listing]);

  if (reviewing) {
    return (
      <QuestionReviewPage
        onBack={() => {
          setReviewing(false);
          useFamilyStore.getState().clearReviewRequest();
        }}
      />
    );
  }

  if (editing) {
    const kid = kids.find((k) => k.id === editing);
    const stillAdding = kid !== undefined && kid.id === addedNoPin;
    return (
      <FamilyCard wide focusTitle title={kid && !stillAdding ? `Change ${kid.name ?? 'player'}` : 'Add a player'}>
        <KidForm
          kid={kid}
          submitLabel={kid ? 'Save' : 'Add player'}
          onSubmit={async (input) => {
            if (kid) await updateKid(kid.id, input);
            else {
              try {
                await addKid(input);
              } catch (err) {
                // Added, but the PIN didn't save: this form changes them now, so
                // trying again sets the PIN rather than adding them twice.
                if (err instanceof KidAddedWithoutPin) {
                  setAddedNoPin(err.kid.id);
                  setEditing(err.kid.id);
                }
                throw err;
              }
            }
            // Their PIN typed again while it was locked: the database has
            // unlocked it — say so on their row, and drop the 🔒 note now.
            if (kid && input.pin && lockedKids[kid.id] > 0) {
              say(unlockedWords(kid.name ?? 'This player'));
              setUnlockedId(kid.id);
              setLockedKids((locks) => {
                const rest = { ...locks };
                delete rest[kid.id];
                return rest;
              });
            }
            setEditing(null);
            setAddedNoPin(null);
          }}
          onCancel={() => {
            setEditing(null);
            setAddedNoPin(null);
          }}
        />
      </FamilyCard>
    );
  }

  if (removing) return <RemoveKid kid={removing} onDone={() => setRemoving(null)} />;

  if (progressFor) {
    return (
      <Suspense
        fallback={
          <FamilyCard wide focusTitle title="📈 Progress">
            <p role="status" className="text-center text-sm text-gray-600">
              Loading…
            </p>
          </FamilyCard>
        }
      >
        <ProgressPage kidId={progressFor} onBack={() => setProgressFor(null)} />
      </Suspense>
    );
  }

  if (closing) {
    return <CloseAccountPage onCancel={() => setClosing(false)} />;
  }

  if (changing === 'email') return <ChangeEmailPage onDone={() => setChanging(null)} />;
  if (changing === 'password') return <ChangePasswordPage onDone={() => setChanging(null)} />;

  return (
    // Its title takes the keyboard as the gate gives way to it (the gate's
    // button is gone); back from a page, the button that left takes it after.
    <FamilyCard wide focusTitle title="👪 Grown-ups" subtitle={`Locks again when you leave, or after ${GROWN_UP_UNLOCK_MINUTES} minutes.`}>
      <ul className="space-y-2">
        {kids.map((k) => (
          <li key={k.id} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>
                {kidIcon(k.icon)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-800 truncate">{k.name ?? 'Player'}</p>
                <p className="text-xs text-gray-500">
                  Age {calcAge(k.birthYear, k.birthMonth)} · {k.hasPin ? 'PIN set' : 'no PIN yet'}
                </p>
              </div>
            </div>
            {lockedKids[k.id] > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                <span aria-hidden="true">🔒 </span>PIN locked after too many tries. Tap Change and type their PIN again —
                the same one is fine — to unlock it now.
              </p>
            )}
            {unlockedId === k.id && !(lockedKids[k.id] > 0) && <UnlockedNote name={k.name ?? 'This player'} />}
            {/* Their own line, so a long nickname never squeezes them on a phone; all three fit one line at 320 px. */}
            <div className="flex flex-wrap justify-end gap-x-2 [@media(max-width:359px)]:gap-x-0.5">
              <button
                data-return={`progress:${k.id}`}
                onClick={() => {
                  leave(`progress:${k.id}`);
                  setProgressFor(k.id);
                }}
                aria-label={`Progress for ${k.name ?? 'this player'}`}
                className="text-sm font-semibold text-purple-700 hover:underline px-2 min-h-11 [@media(max-width:359px)]:px-1.5"
              >
                <span aria-hidden="true" className="[@media(max-width:359px)]:hidden">
                  📈{' '}
                </span>
                Progress
              </button>
              <button
                data-return={`change:${k.id}`}
                onClick={() => {
                  leave(`change:${k.id}`);
                  setEditing(k.id);
                }}
                className="text-sm text-purple-600 hover:underline px-2 min-h-11 [@media(max-width:359px)]:px-1.5"
              >
                Change
              </button>
              <button
                data-return={`remove:${k.id}`}
                onClick={() => {
                  leave(`remove:${k.id}`);
                  setRemoving(k);
                }}
                className="text-sm text-red-600 hover:underline px-2 min-h-11 [@media(max-width:359px)]:px-1.5"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        data-return="add"
        onClick={() => {
          leave('add');
          setEditing('new');
        }}
        className="mt-3 w-full border-2 border-dashed border-purple-300 text-purple-700 font-semibold rounded-xl py-2 hover:bg-purple-50 transition"
      >
        ＋ Add a player
      </button>
      <ParentPin />
      <SignInSection
        onChange={(what) => {
          leave(what);
          setChanging(what);
        }}
      />
      {admin && (
        <button
          data-return="review"
          onClick={() => {
            leave('review');
            setReviewing(true);
          }}
          className="mt-6 w-full rounded-xl border border-purple-300 bg-purple-50 py-2 font-semibold text-purple-700 transition hover:bg-purple-100"
        >
          🛡️ Question review
        </button>
      )}
      <div className="mt-6 space-y-2">
        {consentAt && (
          <p className="text-xs text-gray-500">
            You agreed to the privacy notice on {new Date(consentAt).toLocaleDateString()}.
          </p>
        )}
        <PrivacyNotice />
      </div>
      <button
        onClick={() => !signingOut && close()}
        aria-disabled={signingOut}
        className="mt-6 w-full min-h-11 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-purple-600"
      >
        Done — back to Who's playing
      </button>
      <SignOutButton className="mt-1" onBusyChange={setSigningOut} />
      <CloseAccountSection
        onOpen={() => {
          leave('close');
          setClosing(true);
        }}
      />
    </FamilyCard>
  );
}

/** "Sam can try their PIN again now." — read out as the save lands, and shown on their row. */
function unlockedWords(name: string): string {
  return `${name} can try their PIN again now.`;
}

/** The 🔓 line on a kid's row after a Save lifted their lock (the area's live region reads it out). */
function UnlockedNote({ name }: { name: string }) {
  return (
    <p className="mt-2 rounded-lg bg-green-50 px-2 py-1.5 text-xs text-green-800">
      <span aria-hidden="true">🔓 </span>
      {unlockedWords(name)}
    </p>
  );
}

/** The grown-up's own PIN: a quicker way into 👪 Grown-ups (their password still works). */
function ParentPin() {
  const hasParentPin = useFamilyStore((s) => s.hasParentPin);
  const setParentPin = useFamilyStore((s) => s.setParentPin);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The save failed because the sign-in ran out: the words ask to sign in again, so the button's here.
  const [signedOut, setSignedOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSignedOut(false);
    if (!isPin(pin)) return setError(`A PIN is ${PIN_LENGTH} numbers.`);
    setSaving(true);
    try {
      await setParentPin(pin);
      setEditing(false);
      setPin('');
      setNotice('Grown-up PIN saved.');
    } catch (err) {
      console.warn('Saving the grown-up PIN failed:', errorMessage(err));
      setError(plainErrorOr(err, "That PIN didn't save just now. Please try again."));
      setSignedOut(sessionRanOut(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 p-3 text-sm">
      <p className="font-semibold text-gray-700">Grown-up PIN</p>
      <p className="text-xs text-gray-500 mt-0.5">
        Opens 👪 Grown-ups without typing your password (your password always works too). Pick one your kids
        don't know.
      </p>
      {editing ? (
        <form onSubmit={handleSave} className="mt-2 space-y-2">
          <PasswordInput
            placeholder={`New ${PIN_LENGTH}-digit PIN`}
            aria-label="Grown-up PIN"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LENGTH}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
            className={fieldClass}
          />
          {/* Always there, so a screen reader hears it as it appears. */}
          <div role="status">{error && <p className="text-red-700">{error}</p>}</div>
          {signedOut && <SignInAgainButton />}
          <div className="flex gap-2">
            <button type="submit" aria-disabled={saving} className={`flex-1 ${primaryClass}`}>
              {saving ? 'Saving…' : 'Save PIN'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 text-gray-500 hover:underline">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-gray-500">{notice ?? (hasParentPin ? 'Set' : 'Not set')}</span>
          <button onClick={() => setEditing(true)} className="text-purple-600 hover:underline px-2 min-h-11">
            {hasParentPin ? 'Change' : 'Set a PIN'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Removing a kid deletes everything they own, so it asks first. */
function RemoveKid({ kid, onDone }: { kid: Kid; onDone: () => void }) {
  const removeKid = useFamilyStore((s) => s.removeKid);
  const [error, setError] = useState<string | null>(null);
  // The remove failed because the sign-in ran out: the words ask to sign in again, so the button's here.
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = kid.name ?? 'this player';

  async function handleRemove() {
    if (busy) return;
    setError(null);
    setSignedOut(false);
    setBusy(true);
    try {
      await removeKid(kid.id);
      onDone();
    } catch (err) {
      console.warn('Removing a player failed:', errorMessage(err));
      setError(plainErrorOr(err, `We couldn't remove ${name} just now. Please try again.`));
      setSignedOut(sessionRanOut(err));
      setBusy(false);
    }
  }

  return (
    <FamilyCard focusTitle title={`Remove ${name}?`}>
      <p className="text-sm text-gray-600 text-center">
        Their adventure, XP and saved game are deleted for good. This can't be undone.
      </p>
      {/* Always there, so a screen reader hears it as it appears. */}
      <div role="status" className="mt-3 empty:mt-0 text-sm">
        {error && <p className="text-red-700">{error}</p>}
      </div>
      {signedOut && <SignInAgainButton />}
      <button
        onClick={() => void handleRemove()}
        aria-disabled={busy}
        className="mt-5 w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-red-600"
      >
        {busy ? 'Removing…' : `Remove ${name} for good`}
      </button>
      <button onClick={onDone} className="mt-3 w-full text-center text-sm text-purple-600 hover:underline">
        Keep {name}
      </button>
    </FamilyCard>
  );
}
