import { lazy, Suspense, useEffect } from 'react';
import { useAuthInit } from './features/auth/useAuthInit';
import { useAuthStore } from './store/authStore';
import { useSaveStore } from './store/saveStore';
import { useBattleStore } from './store/battleStore';
import { useScreenMusic } from './lib/audio';
import { sendFlow, useFlow } from './machines/gameFlow';
import AuthPage from './features/auth/AuthPage';
import SignOutButton from './features/auth/SignOutButton';
import LevelBadge from './components/LevelBadge';
import StreakBadge from './components/StreakBadge';
import LevelUpModal from './components/LevelUpModal';
import { LoadingScreen } from './components/StatusScreens';
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
export default function App() {
  useAuthInit();
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);
  const saveStatus = useSaveStore((s) => s.status);
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

  // Background music follows the screen (silent until enabled in the menu).
  useScreenMusic(screen, isBoss);

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

  if (saveStatus !== 'ready' || booting) {
    return <LoadingScreen label="Preparing your adventure…" />;
  }

  return (
    <>
      <LevelBadge placement={screen === 'battle' ? 'top-center' : 'top-left'} />
      <StreakBadge />
      {/* Sign-out floats top-right; hide it in battle where it overlaps the
          hero status panel. */}
      {screen !== 'battle' && <SignOutButton />}
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
