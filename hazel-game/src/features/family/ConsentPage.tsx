import { useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { plainErrorOr } from '../../lib/familyErrors';
import { useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import SignOutButton from './SignOutButton';
import PrivacyNotice from './PrivacyNotice';

/**
 * A grown-up agrees before anyone plays (#124). Shown to a login with no
 * consent on record: an account from before parent accounts (often a kid's
 * own — hence "get a grown-up"), or a sign-up that didn't send it.
 */
export default function ConsentPage() {
  const agree = useFamilyStore((s) => s.agree);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAgree() {
    // aria-disabled until the box is ticked, and while it saves: a tap then stops here.
    if (!checked || saving) return;
    setError(null);
    setSaving(true);
    try {
      await agree();
    } catch (err) {
      // Plain words on screen, the whole error in the console (#130 S6).
      console.warn('Recording consent failed:', errorMessage(err));
      setError(plainErrorOr(err, "We couldn't save your OK just now. Please try again."));
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
      {/* Always there, so a screen reader hears each message as it appears. */}
      <div role="status" className="mt-3 empty:mt-0 text-red-700 text-sm">
        {error && <p>{error}</p>}
      </div>
      <button
        onClick={() => void handleAgree()}
        aria-disabled={!checked || saving}
        className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-2 transition aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-purple-600"
      >
        {saving ? 'Saving…' : 'I agree'}
      </button>
      <SignOutButton label="Not now — sign out" className="mt-3" />
    </FamilyCard>
  );
}
