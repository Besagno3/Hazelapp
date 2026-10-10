import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import PrivacyNotice from './PrivacyNotice';

/**
 * A grown-up agrees before anyone plays (#118). Shown to a login with no
 * consent on record: an account from before parent accounts (often a kid's
 * own — hence "get a grown-up"), or a sign-up that didn't send it.
 */
export default function ConsentPage() {
  const agree = useFamilyStore((s) => s.agree);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAgree() {
    setError(null);
    setSaving(true);
    try {
      await agree();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <FamilyCard
      wide
      title="A grown-up's OK first"
      subtitle="Before anyone plays, a parent or guardian needs to agree to how we look after your family's information. If you're a kid, please fetch a grown-up!"
    >
      <PrivacyNotice open />
      <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-purple-600"
        />
        <span>I'm this family's parent or guardian, I'm 18 or older, and I agree to the privacy notice.</span>
      </label>
      {error && <p className="mt-3 text-red-500 text-sm">{error}</p>}
      <button
        onClick={() => void handleAgree()}
        disabled={!checked || saving}
        className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'I agree'}
      </button>
      <button
        onClick={() => void supabase.auth.signOut()}
        className="mt-3 w-full text-center text-sm text-gray-500 hover:underline"
      >
        Not now — sign out
      </button>
    </FamilyCard>
  );
}
