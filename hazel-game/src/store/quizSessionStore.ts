import { create } from 'zustand';
import type { Topic } from '../types';

/**
 * Ephemeral quiz-session state. Deliberately NOT persisted — it tracks the
 * topics the player has *passed* at the Training Grounds during this play
 * session so `TopicSelect` can grey them out and stop them being re-picked.
 * A reload starts a fresh session (mirrors `battleStore`); sign-out resets it
 * (see `useAuthInit`) so one player's progress can't leak into the next.
 */
interface QuizSessionStore {
  /** Topics passed (80%+) this session. */
  completedTopics: Topic[];
  markCompleted: (topic: Topic) => void;
  reset: () => void;
}

export const useQuizSessionStore = create<QuizSessionStore>((set) => ({
  completedTopics: [],

  markCompleted: (topic) =>
    set((s) =>
      s.completedTopics.includes(topic)
        ? s
        : { completedTopics: [...s.completedTopics, topic] },
    ),

  reset: () => set({ completedTopics: [] }),
}));
