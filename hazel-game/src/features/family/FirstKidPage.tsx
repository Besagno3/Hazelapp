import { supabase } from '../../lib/supabase';
import { useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import KidForm from './KidForm';

/** A new family's first step (#118): add the first player. More come from 👪 Grown-ups. */
export default function FirstKidPage() {
  const addKid = useFamilyStore((s) => s.addKid);
  return (
    <FamilyCard
      wide
      title="Add your first player"
      subtitle="Who's going on the adventure? You can add brothers and sisters later from 👪 Grown-ups."
    >
      <KidForm
        submitLabel="Add player"
        onSubmit={async (input) => {
          await addKid(input);
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
