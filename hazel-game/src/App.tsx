import { useGameStore } from './store/gameStore';
import AuthPage from './features/auth/AuthPage';
import TopicSelect from './features/quiz/TopicSelect';
import QuizRound from './features/quiz/QuizRound';
import AvatarSelect from './features/battle/AvatarSelect';
import BattleArena from './features/battle/BattleArena';
import WorldMap from './features/world/WorldMap';

export default function App() {
  const { phase, progress, avatar } = useGameStore();

  if (phase === 'auth') return <AuthPage />;
  if (phase === 'topic-select') return <TopicSelect />;
  if (phase === 'quiz') return <QuizRound />;

  // After quiz unlock — pick avatar before entering world
  if (progress.worldUnlocked && !avatar) return <AvatarSelect />;

  if (phase === 'world') return <WorldMap />;
  if (phase === 'battle') return <BattleArena />;

  return <TopicSelect />;
}
