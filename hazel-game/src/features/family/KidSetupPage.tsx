import { kidNeedingPin, useFamilyStore } from '../../store/familyStore';
import FamilyCard from './FamilyCard';
import SignOutButton from './SignOutButton';
import KidForm from './KidForm';

/**
 * Every kid needs a PIN before anyone plays (#124). A kid from before PINs
 * (an old account's — often with no nickname or picture either), or one whose
 * PIN didn't save, is finished here by a grown-up. It replaces the screen
 * before, so its title takes the keyboard; a player whose PIN just didn't
 * save (the first player's page gave way to this) is told so (#167 review
 * round 2).
 */
export default function KidSetupPage() {
  const kid = useFamilyStore((s) => kidNeedingPin(s.kids));
  const pinNotSaved = useFamilyStore((s) => s.pinNotSavedFor !== null && s.pinNotSavedFor === kidNeedingPin(s.kids)?.id);
  const updateKid = useFamilyStore((s) => s.updateKid);
  if (!kid) return null;
  return (
    <FamilyCard
      wide
      focusTitle
      title={kid.name ? `Finish setting up ${kid.name}` : 'Finish setting up your player'}
      subtitle={
        pinNotSaved
          ? `${kid.name ?? 'Your player'} is added, but their PIN didn't save. Enter their 4-digit PIN again and tap Save.`
          : 'Every player opens their adventure with their own 4-digit PIN. A grown-up sets it here.'
      }
    >
      <KidForm
        key={kid.id}
        kid={kid}
        submitLabel="Save"
        onSubmit={async (input) => {
          await updateKid(kid.id, input);
        }}
      />
      <SignOutButton className="mt-3" />
    </FamilyCard>
  );
}
