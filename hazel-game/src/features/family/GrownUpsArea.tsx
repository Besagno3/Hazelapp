import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authErrorMessage, errorMessage, friendlyMessage } from '../../lib/errors';
import { calcAge } from '../../lib/age';
import { isPin, kidIcon, PIN_LENGTH } from '../../content/family';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import { isAdmin } from '../../lib/review';
import PasswordInput from '../../components/PasswordInput';
import { useRetryWait, waitWords } from '../auth/useRetryWait';
import FamilyCard from './FamilyCard';
import KidForm from './KidForm';
import PinPad from './PinPad';
import PrivacyNotice from './PrivacyNotice';
import QuestionReviewPage from './QuestionReviewPage';
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
 * the privacy notice, and sign out — and, for the game's owner, 🛡️ Question
 * review (#147). Opens only with the grown-up's own PIN (if they've set one)
 * or their password, so a kid can't remove a sibling, sign the family out or
 * release a question.
 */
export default function GrownUpsArea() {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked ? <GrownUpsHome /> : <GrownUpsGate onUnlock={() => setUnlocked(true)} />;
}

function GrownUpsGate({ onUnlock }: { onUnlock: () => void }) {
  const email = useAuthStore((s) => s.user?.email ?? '');
  const hasParentPin = useFamilyStore((s) => s.hasParentPin);
  const checkParentPin = useFamilyStore((s) => s.checkParentPin);
  const close = () => useFamilyStore.getState().setGrownUpsOpen(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  // A refused reset link ("Please wait 37 seconds") counts its wait down, as sign-in's mail buttons do.
  const resetWait = useRetryWait();
  const resetWaiting = !sendingReset && resetWait.left > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Open is aria-disabled while it checks: a tap or Enter then stops here.
    if (loading) return;
    setError(null);
    setNotice(null);
    setLoading(true);
    // Signing in again with the same login proves it's the grown-up; the
    // session stays the same family (useAuthInit reloads only on a new user).
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      // Friendly words on screen, the whole error in the console (#130 S6).
      console.warn('Grown-ups sign-in failed:', errorMessage(authError));
      setError(authErrorMessage(authError, { where: 'gate' }));
      return;
    }
    onUnlock();
  }

  async function sendReset() {
    // One link at a time, and none while a refusal's wait runs: the server would only refuse it.
    if (sendingReset || resetWait.left > 0) return;
    setSendingReset(true);
    setError(null);
    setNotice(null);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    setSendingReset(false);
    if (authError) {
      console.warn('Grown-ups reset link failed:', errorMessage(authError));
      setError(authErrorMessage(authError, { where: 'forgot' }));
      resetWait.refused(authError);
    } else setNotice(`A reset link is on its way to ${email}.`);
  }

  const back = (
    <button onClick={close} className={`mt-1 ${linkClass} text-purple-600`}>
      ← Back to Who's playing
    </button>
  );

  if (hasParentPin && !usePassword) {
    return (
      <FamilyCard title="👪 Grown-ups" subtitle="Type your grown-up PIN.">
        <PinPad
          onSubmit={async (pin) => {
            const right = await checkParentPin(pin);
            if (right) onUnlock();
            return right;
          }}
        />
        <button onClick={() => setUsePassword(true)} className={`${linkClass} text-gray-500`}>
          Use my password instead
        </button>
        {back}
      </FamilyCard>
    );
  }

  return (
    <FamilyCard title="👪 Grown-ups" subtitle={`Enter the password for ${email}.`}>
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
      {/* aria-disabled while it sends or waits: a disabled button would drop the keyboard's focus. */}
      <button
        onClick={() => void sendReset()}
        aria-disabled={sendingReset || resetWaiting}
        aria-label={resetWaiting ? `Email me a reset link ${waitWords(resetWait.left).said}` : undefined}
        className={`mt-1 ${linkClass} text-gray-500 aria-disabled:cursor-default aria-disabled:no-underline`}
      >
        {sendingReset
          ? 'Sending a reset link…'
          : resetWaiting
            ? `Email me a reset link ${waitWords(resetWait.left).shown}`
            : 'Forgot it? Email me a reset link'}
      </button>
      {hasParentPin && (
        <button onClick={() => setUsePassword(false)} className={`${linkClass} text-gray-500`}>
          Use my grown-up PIN instead
        </button>
      )}
      {back}
    </FamilyCard>
  );
}

function GrownUpsHome() {
  const kids = useFamilyStore((s) => s.kids);
  const consentAt = useFamilyStore((s) => s.consentAt);
  const addKid = useFamilyStore((s) => s.addKid);
  const updateKid = useFamilyStore((s) => s.updateKid);
  const close = () => useFamilyStore.getState().setGrownUpsOpen(false);
  /** Which kid is being changed ('new' = adding one). */
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Kid | null>(null);
  // Arrived from a review alert's link: straight to the review page.
  const [reviewing, setReviewing] = useState(() => useFamilyStore.getState().reviewRequested);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let live = true;
    void isAdmin().then((yes) => {
      if (live) setAdmin(yes);
    });
    return () => {
      live = false;
    };
  }, []);

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
      <FamilyCard wide title={kid ? `Change ${kid.name ?? 'player'}` : 'Add a player'}>
        <KidForm
          kid={kid}
          submitLabel={kid ? 'Save' : 'Add player'}
          onSubmit={async (input) => {
            if (kid) await updateKid(kid.id, input);
            else await addKid(input);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      </FamilyCard>
    );
  }

  if (removing) return <RemoveKid kid={removing} onDone={() => setRemoving(null)} />;

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
            {/* Their own line, so a long nickname never squeezes them on a phone. */}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(k.id)} className="text-sm text-purple-600 hover:underline px-2 min-h-11">
                Change
              </button>
              <button onClick={() => setRemoving(k)} className="text-sm text-red-600 hover:underline px-2 min-h-11">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        onClick={() => setEditing('new')}
        className="mt-3 w-full border-2 border-dashed border-purple-300 text-purple-700 font-semibold rounded-xl py-2 hover:bg-purple-50 transition"
      >
        ＋ Add a player
      </button>
      <ParentPin />
      {admin && (
        <button
          onClick={() => setReviewing(true)}
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
    </FamilyCard>
  );
}

/** The grown-up's own PIN: a quicker way into 👪 Grown-ups (their password still works). */
function ParentPin() {
  const hasParentPin = useFamilyStore((s) => s.hasParentPin);
  const setParentPin = useFamilyStore((s) => s.setParentPin);
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (!isPin(pin)) return setError(`A PIN is ${PIN_LENGTH} numbers.`);
    setSaving(true);
    try {
      await setParentPin(pin);
      setEditing(false);
      setPin('');
      setNotice('Grown-up PIN saved.');
    } catch (err) {
      console.warn('Saving the grown-up PIN failed:', errorMessage(err));
      setError(friendlyMessage(err));
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
          {error && <p className="text-red-500">{error}</p>}
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
  const [busy, setBusy] = useState(false);
  const name = kid.name ?? 'this player';

  async function handleRemove() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await removeKid(kid.id);
      onDone();
    } catch (err) {
      console.warn('Removing a player failed:', errorMessage(err));
      setError(friendlyMessage(err));
      setBusy(false);
    }
  }

  return (
    <FamilyCard title={`Remove ${name}?`}>
      <p className="text-sm text-gray-600 text-center">
        Their adventure, XP and saved game are deleted for good. This can't be undone.
      </p>
      {error && <p className="mt-3 text-red-500 text-sm">{error}</p>}
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
