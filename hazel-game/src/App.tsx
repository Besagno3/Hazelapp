import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthInit } from './features/auth/useAuthInit';
import { useAuthStore } from './store/authStore';
import { useSaveStore, watchPageForSaves } from './store/saveStore';
import { watchKeyboard } from './store/keyboardStore';
import { useBattleStore } from './store/battleStore';
import { musicScreen, useScreenMusic } from './lib/audio';
import { dropSignupParam } from './lib/signupLink';
import { HUB_ZONE, zone } from './content/zones';
import { seaAreaAt, type SeaArea } from './content/boat';
import { sendFlow, useFlow } from './machines/gameFlow';
import AuthPage from './features/auth/AuthPage';
import ResetPasswordPage from './features/auth/ResetPasswordPage';
import ConsentPage from './features/family/ConsentPage';
import FirstKidPage from './features/family/FirstKidPage';
import KidSetupPage from './features/family/KidSetupPage';
import WhoIsPlaying from './features/family/WhoIsPlaying';
import GrownUpsArea from './features/family/GrownUpsArea';
import { familyScreen, useFamilyStore } from './store/familyStore';
import SwitchPlayerButton from './features/auth/SwitchPlayerButton';
import LevelBadge from './components/LevelBadge';
import StreakBadge from './components/StreakBadge';
import LevelUpModal from './components/LevelUpModal';
import { ErrorScreen, LoadingScreen, OutdatedScreen } from './components/StatusScreens';
import TopicSelect from './features/quiz/TopicSelect';
import QuizRound from './features/quiz/QuizRound';
import AvatarSelect from './features/battle/AvatarSelect';
import BattleArena from './features/battle/BattleArena';

// Lazy-load the canvas-based world — pulls in KaPlay (~200 KB), which
// the auth / quiz / battle screens never need. (#36)
const WorldScreen = lazy(() => import('./features/world/WorldScreen'));

/**
 * Routing is the game-flow machine (#37, resolves #11): App renders whatever
 * top-level state the machine is in. Auth still gates everything, and the
 * machine waits in `boot` until the session + save file are ready.
 */
/**
 * The sea area the hero is in (#75 item 14), for the music — kept as state so
 * each new position is judged against the last area (the fogbank's music
 * lingers a little on the way out instead of flipping at one line).
 */
function useSeaArea(): SeaArea | null {
  const [area, setArea] = useState<SeaArea | null>(() => {
    const save = useSaveStore.getState().save;
    return save ? seaAreaAt(save) : null;
  });
  useEffect(
    () => useSaveStore.subscribe((st) => setArea((prev) => (st.save ? seaAreaAt(st.save, prev) : null))),
    [],
  );
  return area;
}

export default function App() {
  useAuthInit();
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);
  const passwordRecovery = useAuthStore((s) => s.passwordRecovery);
  // Before the game: the grown-up's consent, their kids, who's playing (#124).
  const family = useFamilyStore((s) => familyScreen(s));
  const familyError = useFamilyStore((s) => s.error);
  const saveStatus = useSaveStore((s) => s.status);
  const outdatedReason = useSaveStore((s) => s.outdatedReason);
  const booting = useFlow((s) => s.matches('boot'));
  const screen = useFlow((s) =>
    s.matches('quiz')
      ? 'quiz'
      : s.matches('avatarSelect')
        ? 'avatar'
        : s.matches('world')
          ? 'world'
          : s.matches('battle')
            ? 'battle'
            : 'topics',
  );
  const isBoss = useBattleStore((s) => s.enemy?.isBoss ?? false);
  // The Spire's climb and Umbra's finale (#75 item 16e) drive their own music.
  const inSpire = useFlow((s) => s.matches({ world: 'spire' }) || (s.matches({ world: 'service' }) && s.context.service === 'name'));
  const zoneKind = useSaveStore((s) => zone(s.save?.zoneId ?? HUB_ZONE).kind);
  const sea = useSeaArea();

  // Background music follows the screen — the sign-in screen has its own intro,
  // which plays on through the family screens until a kid is playing (#124);
  // in the world, the sea area or the kind of place you're in (on by default;
  // the menu turns it off).
  const playing = !!session && !passwordRecovery && family === 'play';
  useScreenMusic(musicScreen(initialized, playing, screen), isBoss, inSpire, zoneKind, sea);

  // A hidden or closing tab saves to the server at once; a tab back in view, or
  // another tab saving, checks it hasn't fallen behind (#151).
  useEffect(() => watchPageForSaves(), []);
  // The first press from a real keyboard opens the typing features (#159).
  useEffect(() => watchKeyboard(), []);

  // Already signed in when the public site's sign-up button brought them
  // here: drop its ?signup, or a later sign-out would open on sign-up (#146).
  useEffect(() => {
    if (session) dropSignupParam();
  }, [session]);

  // Wake the machine once auth + save have loaded (guards read the save).
  useEffect(() => {
    if (session && saveStatus === 'ready' && booting) sendFlow({ type: 'READY' });
  }, [session, saveStatus, booting]);

  // Wait for the initial session check so the auth screen never flashes.
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500 text-white text-lg">
        Loading…
      </div>
    );
  }

  // No valid session → auth is the only reachable screen.
  if (!session) return <AuthPage />;
  // Arrived from a reset-email link → choose a new password before playing.
  if (passwordRecovery) return <ResetPasswordPage />;

  if (family === 'loading') return <LoadingScreen label="Opening your family…" />;
  if (family === 'error') {
    return (
      <ErrorScreen
        message={familyError ?? "Couldn't load your family."}
        onRetry={() => {
          const userId = useAuthStore.getState().user?.id;
          if (userId) void useFamilyStore.getState().load(userId);
        }}
      />
    );
  }
  if (family === 'consent') return <ConsentPage />;
  if (family === 'grownUps') return <GrownUpsArea />;
  if (family === 'firstKid') return <FirstKidPage />;
  if (family === 'kidSetup') return <KidSetupPage />;
  if (family === 'pick') return <WhoIsPlaying />;

  // A newer save exists — from a newer version of the game, or played on in
  // another tab or device (#151): this tab is out of date.
  if (saveStatus === 'outdated') {
    return <OutdatedScreen reason={outdatedReason} onRefresh={() => window.location.reload()} />;
  }

  if (saveStatus !== 'ready' || booting) {
    return <LoadingScreen label="Preparing your adventure…" />;
  }

  return (
    <>
      {/* The world screen puts the badges and Switch player in its own top bar, so
          they never cover the place name or an overlay (#75 item 14b, #102i);
          the battle screen puts the badges in its own too, so they never cover
          the enemy's "!!!" on a phone (#75 item 14f review). */}
      {screen !== 'world' && screen !== 'battle' && (
        <>
          <LevelBadge />
          <StreakBadge />
        </>
      )}
      {/* Switch player floats top-right; hide it in battle where it overlaps
          the hero status panel. */}
      {screen !== 'battle' && screen !== 'world' && <SwitchPlayerButton />}
      {screen === 'topics' && <TopicSelect />}
      {screen === 'quiz' && <QuizRound />}
      {screen === 'avatar' && <AvatarSelect />}
      {screen === 'world' && (
        <Suspense fallback={<LoadingScreen label="Entering Lumina…" />}>
          <WorldScreen />
        </Suspense>
      )}
      {screen === 'battle' && <BattleArena />}
      <LevelUpModal />
    </>
  );
}
