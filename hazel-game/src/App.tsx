import { useAuthInit } from './features/auth/useAuthInit';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import AuthPage from './features/auth/AuthPage';
import SignOutButton from './features/auth/SignOutButton';
import LevelBadge from './components/LevelBadge';
import TopicSelect from './features/quiz/TopicSelect';
import QuizRound from './features/quiz/QuizRound';
import AvatarSelect from './features/battle/AvatarSelect';
import BattleArena from './features/battle/BattleArena';
import WorldMap from './features/world/WorldMap';
import type { GameProgress, GamePhase, Avatar } from './types';

function GameScreen({
  phase,
  progress,
  avatar,
}: {
  phase: GamePhase;
  progress: GameProgress;
  avatar: Avatar | null;
}) {
  if (phase === 'quiz') return <QuizRound />;

  // After the world unlocks, force avatar selection before entering it.
  if (progress.worldUnlocked && !avatar) return <AvatarSelect />;

  if (phase === 'world') return <WorldMap />;
  if (phase === 'battle') return <BattleArena />;

  // 'auth' and 'topic-select' both land here — the player is authenticated,
  // so the auth phase is treated as the topic-select entry point.
  return <TopicSelect />;
}

export default function App() {
  useAuthInit();
  const initialized = useAuthStore((s) => s.initialized);
  const session = useAuthStore((s) => s.session);
  const { phase, progress, avatar } = useGameStore();

  // Wait for the initial session check so the auth screen never flashes.
  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500 text-white text-lg">
        Loading…
      </div>
    );
  }

  // No valid session → auth is the only reachable screen, regardless of any
  // game phase persisted in localStorage.
  if (!session) return <AuthPage />;

  return (
    <>
      <LevelBadge />
      <SignOutButton />
      <GameScreen phase={phase} progress={progress} avatar={avatar} />
    </>
  );
}
