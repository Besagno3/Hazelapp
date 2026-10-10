import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { calcAge } from '../../lib/age';
import { isPin, kidIcon, PIN_LENGTH } from '../../content/family';
import { useAuthStore } from '../../store/authStore';
import { useFamilyStore } from '../../store/familyStore';
import PasswordInput from '../../components/PasswordInput';
import FamilyCard from './FamilyCard';
import KidForm from './KidForm';
import PinPad from './PinPad';
import PrivacyNotice from './PrivacyNotice';
import type { Kid } from '../../types';

const fieldClass =
  'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400';

/**
 * 👪 Grown-ups (#118): add, change and remove kids, set the grown-up PIN, see
 * the privacy notice, and sign out. Opens only with the grown-up's own PIN
 * (if they've set one) or their password, so a kid can't remove a sibling or
 * sign the family out.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    // Signing in again with the same login proves it's the grown-up; the
    // session stays the same family (useAuthInit reloads only on a new user).
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(errorMessage(authError));
      return;
    }
    onUnlock();
  }

  async function sendReset() {
    setError(null);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (authError) setError(errorMessage(authError));
    else setNotice(`A reset link is on its way to ${email}.`);
  }

  const back = (
    <button onClick={close} className="mt-3 w-full text-center text-sm text-purple-600 hover:underline">
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
        <button onClick={() => setUsePassword(true)} className="w-full text-center text-sm text-gray-500 hover:underline">
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
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {notice && <p className="text-green-600 text-sm">{notice}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Open'}
        </button>
      </form>
      <button onClick={() => void sendReset()} className="mt-3 w-full text-center text-sm text-gray-500 hover:underline">
        Forgot it? Email me a reset link
      </button>
      {hasParentPin && (
        <button onClick={() => setUsePassword(false)} className="mt-3 w-full text-center text-sm text-gray-500 hover:underline">
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
    setError(null);
    if (!isPin(pin)) return setError(`A PIN is ${PIN_LENGTH} numbers.`);
    setSaving(true);
    try {
      await setParentPin(pin);
      setEditing(false);
      setPin('');
      setNotice('Grown-up PIN saved.');
    } catch (err) {
      setError(errorMessage(err));
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
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
            >
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
    setError(null);
    setBusy(true);
    try {
      await removeKid(kid.id);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
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
        disabled={busy}
        className="mt-5 w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
      >
        {busy ? 'Removing…' : `Remove ${name} for good`}
      </button>
      <button onClick={onDone} className="mt-3 w-full text-center text-sm text-purple-600 hover:underline">
        Keep {name}
      </button>
    </FamilyCard>
  );
}
