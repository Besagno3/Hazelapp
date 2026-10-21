import { useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import SignOutButton from './SignOutButton';
import KidForm from './KidForm';

/** A new family's first step (#124): add the first player. More come from 👪 Grown-ups. */
export default function FirstKidPage() {
  const addKid = useFamilyStore((s) => s.addKid);
  return (
    // Its title takes the keyboard as it replaces the screen before (#167 review round 1).
    <FamilyCard
      wide
      focusTitle
      title="Add your first player"
      subtitle="Who's going on the adventure? You can add brothers and sisters later from 👪 Grown-ups."
    >
      <KidForm
        submitLabel="Add player"
        onSubmit={async (input) => {
          await addKid(input);
        }}
      />
      <SignOutButton className="mt-3" />
    </FamilyCard>
  );
}
