import { useEffect, useRef, useState } from 'react';
import { passwordCheckClient, supabase } from '../../lib/supabase';
import { authErrorMessage, errorMessage, sessionRanOut } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { calcAge } from '../../lib/age';
import { isPin, kidIcon, PIN_LENGTH } from '../../content/family';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import { isAdmin } from '../../lib/review';
import { GROWN_UP_LOCKED_TEXT, grownUpLockKey } from '../../lib/pinLock';
import PasswordInput from '../../components/PasswordInput';
import { useLiveMessage } from '../auth/useLiveMessage';
import CloseAccountPage, { CloseAccountSection } from './CloseAccount';
import FamilyCard from './FamilyCard';
import KidForm from './KidForm';
import PinPad from './PinPad';
import PrivacyNotice from './PrivacyNotice';
import QuestionReviewPage from './QuestionReviewPage';
import ResetLinkButton from './ResetLinkButton';
import SignInAgainButton from './SignInAgainButton';
import type { Kid } from '../../types';

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';
/** The gate's text links: 44 px tall, so a finger finds them. */
const linkClass = 'w-full min-h-11 text-center text-sm hover:underline';
/** A main button that waits with `aria-disabled` (a disabled one drops the keyboard's focus). */
const primaryClass =
  'bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-purple-600';

/**
 * 👪 Grown-ups (#124): add, change and remove kids, set the grown-up PIN, see
 * the privacy notice, sign out and close the whole account (#124b) — and, for
 * the game's owner, 🛡️ Question review (#147). Opens only with the grown-up's
 * own PIN (if they've set one; the database limits guesses, #124c) or their
 * password, so a kid can't remove a sibling, sign the family out or release a
 * question. Closing the account asks for the password again, never the PIN.
 * The password is checked on a client that keeps nothing
 * (`passwordCheckClient`), so opening 👪 Grown-ups never leaves a
 * fresh-password session on the device — one that could close the account
 * (#124b review round 2, #165).
 */
export default function GrownUpsArea() {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <GrownUpsHome /> : <GrownUpsGate onUnlock={() => setUnlocked(true)} />;
}

function GrownUpsGate({ onUnlock }: { onUnlock: () => void }) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  const hasParentPin = useFamilyStore((s) => s.hasParentPin);
  const checkParentPin = useFamilyStore((s) => s.checkParentPin);
  const pinLocks = useFamilyStore((s) => s.pinLocks);
  const userId = useFamilyStore((s) => s.userId);
  const close = () => useFamilyStore.getState().setGrownUpsOpen(false);
  const [usePassword, setUsePassword] = useState(false);
  // The grown-up PIN is locked: the password is the way in now, so it's the main button.
  const [pinResting, setPinResting] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Open is aria-disabled while it checks: a tap or Enter then stops here.
    if (loading) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    // Signing in again with the same login proves it's the grown-up — on a
    // client that keeps nothing, so the device's own session stays as it was
    // and no fresh-password one is left behind; that check sign-in is
    // signed out at once (#124b review round 2).
    const check = passwordCheckClient().auth;
    const { error: authError } = await check.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      // Friendly words on screen, the whole error in the console (#130 S6).
      console.warn('Grown-ups sign-in failed:', errorMessage(authError));
      setError(authErrorMessage(authError, { where: 'gate' }));
      return;
    }
    void check.signOut({ scope: 'local' }).catch((err: unknown) => console.warn('Signing out the password check:', errorMessage(err)));
    onUnlock();
  }

  const back = (
    <button onClick={close} className={`mt-1 ${linkClass} text-purple-600`}>
      ← Back to Who's playing
    </button>
  );

  if (hasParentPin && !usePassword) {
    return (
      // Opens with its title focused, like the screens it replaces (#124 review round 2).
      <FamilyCard focusTitle title="👪 Grown-ups" subtitle={pinResting ? 'Use your password for now.' : 'Type your grown-up PIN.'}>
        <PinPad
          onSubmit={async (pin) => {
            const verdict = await checkParentPin(pin);
            if (verdict.ok) onUnlock();
            return verdict;
          }}
          lockKey={grownUpLockKey(userId)}
          lockedText={GROWN_UP_LOCKED_TEXT}
          who="grown-up"
          checkLock={async () => {
            const locks = await pinLocks();
            return locks === null ? null : locks.grownUp;
          }}
          onLockedChange={setPinResting}
        />
        <button
          onClick={() => setUsePassword(true)}
          className={pinResting ? `mt-2 w-full min-h-[44px] ${primaryClass}` : `${linkClass} text-gray-500`}
        >
          Use my password instead
        </button>
        {back}
      </FamilyCard>
    );
  }

  return (
    <FamilyCard focusTitle title="👪 Grown-ups" subtitle={`Enter the password for ${email}.`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordInput
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={fieldClass}
        />
        <div>
          {/* Always there, so a screen reader hears each message as it appears. */}
          <div role="status" className="mb-3 empty:mb-0 space-y-1 text-sm">
            {error && <p className="text-red-700">{error}</p>}
            {notice && <p className="text-green-700">{notice}</p>}
          </div>
          <button type="submit" aria-disabled={loading} className={`w-full min-h-[44px] ${primaryClass}`}>
            {loading ? 'Checking…' : 'Open'}
          </button>
        </div>
      </form>
      <ResetLinkButton
        email={email}
        onStart={() => {
          setError(null);
          setNotice(null);
        }}
        onSent={setNotice}
        onFailed={setError}
        className={`mt-1 ${linkClass} text-gray-500`}
      />
      {hasParentPin && (
        <button onClick={() => setUsePassword(false)} className={`${linkClass} text-gray-500`}>
          Use my grown-up PIN instead
        </button>
      )}
      {back}
    </FamilyCard>
  );
}

/**
 * The unlocked area: its pages, and one live region for all of them — there
 * from the start, so what's said in it is read out even as the page under
 * it changes (a region's first words aren't).
 */
function GrownUpsHome() {
  const [said, say] = useLiveMessage();
  return (
    <>
      <GrownUpsPages say={say} />
      <div role="status" className="sr-only">
        {said && <p key={said.key}>{said.text}</p>}
      </div>
    </>
  );
}

function GrownUpsPages({ say }: { say: (words: string | null) => void }) {
  const kids = useFamilyStore((s) => s.kids);
  const consentAt = useFamilyStore((s) => s.consentAt);
  const addKid = useFamilyStore((s) => s.addKid);
  const updateKid = useFamilyStore((s) => s.updateKid);
  const close = () => useFamilyStore.getState().setGrownUpsOpen(false);
  /** Which kid is being changed ('new' = adding one). */
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Kid | null>(null);
  const [closing, setClosing] = useState(false);
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
  const listing = !editing && !removing && !closing && !reviewing;
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
    return (
      <FamilyCard wide focusTitle title={kid ? `Change ${kid.name ?? 'player'}` : 'Add a player'}>
        <KidForm
          kid={kid}
          submitLabel={kid ? 'Save' : 'Add player'}
          onSubmit={async (input) => {
            if (kid) await updateKid(kid.id, input);
            else await addKid(input);
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
          }}
          onCancel={() => setEditing(null)}
        />
      </FamilyCard>
    );
  }

  if (removing) return <RemoveKid kid={removing} onDone={() => setRemoving(null)} />;

  if (closing) {
    return <CloseAccountPage onCancel={() => setClosing(false)} />;
  }

  return (
    <FamilyCard wide title="👪 Grown-ups">
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
            {/* Their own line, so a long nickname never squeezes them on a phone. */}
            <div className="flex justify-end gap-2">
              <button
                data-return={`change:${k.id}`}
                onClick={() => {
                  leave(`change:${k.id}`);
                  setEditing(k.id);
                }}
                className="text-sm text-purple-600 hover:underline px-2 min-h-11"
              >
                Change
              </button>
              <button
                data-return={`remove:${k.id}`}
                onClick={() => {
                  leave(`remove:${k.id}`);
                  setRemoving(k);
                }}
                className="text-sm text-red-600 hover:underline px-2 min-h-11"
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
        onClick={close}
        className="mt-6 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition"
      >
        Done — back to Who's playing
      </button>
      <button
        onClick={() => void supabase.auth.signOut()}
        className="mt-3 w-full text-center text-sm text-gray-500 hover:underline"
      >
        Sign out
      </button>
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
