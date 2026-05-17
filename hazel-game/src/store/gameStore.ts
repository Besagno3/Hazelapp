import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GamePhase, GameProgress, Topic, QuizRound, BattleState, NPC, Avatar } from '../types';
import { ROUNDS_TO_UNLOCK } from '../lib/utils';

interface GameStore {
  phase: GamePhase;
  progress: GameProgress;
  battle: BattleState;
  avatar: Avatar | null;

  setPhase: (phase: GamePhase) => void;
  setTopic: (topic: Topic) => void;
  completeRound: (round: QuizRound) => void;
  setAvatar: (avatar: Avatar) => void;
  startBattle: (npc: NPC, playerHp: number) => void;
  updateBattleHp: (playerHp: number, npcHp: number) => void;
  endBattle: (result: 'win' | 'lose') => void;
  reset: () => void;
}

const defaultBattle: BattleState = {
  npc: null,
  playerHp: 100,
  npcHp: 100,
  round: 0,
  log: [],
  result: null,
};

const defaultProgress: GameProgress = {
  completedRounds: [],
  worldUnlocked: false,
  currentTopic: null,
};

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      phase: 'auth',
      progress: defaultProgress,
      battle: defaultBattle,
      avatar: null,

      setPhase: (phase) => set({ phase }),

      setTopic: (topic) =>
        set((s) => ({ progress: { ...s.progress, currentTopic: topic } })),

      completeRound: (round) =>
        set((s) => {
          const completed = [...s.progress.completedRounds, round];
          const passedCount = completed.filter((r) => r.passed).length;
          const worldUnlocked = passedCount >= ROUNDS_TO_UNLOCK;
          return {
            progress: { ...s.progress, completedRounds: completed, worldUnlocked },
            phase: worldUnlocked && s.phase !== 'world' ? 'world' : s.phase,
          };
        }),

      setAvatar: (avatar) => set({ avatar }),

      startBattle: (npc, playerHp) =>
        set({
          battle: { ...defaultBattle, npc, playerHp, npcHp: npc.maxHp },
          phase: 'battle',
        }),

      updateBattleHp: (playerHp, npcHp) =>
        set((s) => ({ battle: { ...s.battle, playerHp, npcHp } })),

      endBattle: (result) =>
        set((s) => ({ battle: { ...s.battle, result }, phase: 'world' })),

      reset: () =>
        set({ phase: 'auth', progress: defaultProgress, battle: defaultBattle, avatar: null }),
    }),
    { name: 'hazel-game' }
  )
);
