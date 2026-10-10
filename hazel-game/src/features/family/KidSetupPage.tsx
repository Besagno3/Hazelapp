import { supabase } from '../../lib/supabase';
import { kidNeedingPin, useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import KidForm from './KidForm';

/**
 * Every kid needs a PIN before anyone plays (#118). A kid from before PINs
 * (an old account's — often with no nickname or picture either), or one whose
 * PIN didn't save, is finished here by a grown-up.
 */
export default function KidSetupPage() {
  const kid = useFamilyStore((s) => kidNeedingPin(s.kids));
  const updateKid = useFamilyStore((s) => s.updateKid);
  if (!kid) return null;
  return (
    <FamilyCard
      wide
      title={kid.name ? `Finish setting up ${kid.name}` : 'Finish setting up your player'}
      subtitle="Every player opens their adventure with their own 4-digit PIN. A grown-up sets it here."
    >
      <KidForm
        key={kid.id}
        kid={kid}
        submitLabel="Save"
        onSubmit={async (input) => {
          await updateKid(kid.id, input);
        }}
      />
      <button
        onClick={() => void supabase.auth.signOut()}
        className="mt-3 w-full text-center text-sm text-gray-500 hover:underline"
      >
        Sign out
      </button>
    </FamilyCard>
  );
}
