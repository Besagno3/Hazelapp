import { describe, it, expect, beforeEach } from 'vitest';
import { useQuizSessionStore } from './quizSessionStore';

beforeEach(() => {
  useQuizSessionStore.setState({ completedTopics: [] });
});

describe('quizSessionStore.markCompleted', () => {
  it('adds a passed topic to the completed set', () => {
    useQuizSessionStore.getState().markCompleted('math');
    expect(useQuizSessionStore.getState().completedTopics).toEqual(['math']);
  });

  it('is idempotent — a topic is never listed twice', () => {
    const { markCompleted } = useQuizSessionStore.getState();
    markCompleted('science');
    markCompleted('science');
    expect(useQuizSessionStore.getState().completedTopics).toEqual(['science']);
  });

  it('accumulates distinct topics in order', () => {
    const { markCompleted } = useQuizSessionStore.getState();
    markCompleted('math');
    markCompleted('space');
    markCompleted('math');
    expect(useQuizSessionStore.getState().completedTopics).toEqual(['math', 'space']);
  });
});

describe('quizSessionStore.reset', () => {
  it('clears the completed set (sign-out) so it cannot leak into the next session', () => {
    const store = useQuizSessionStore.getState();
    store.markCompleted('history');
    store.reset();
    expect(useQuizSessionStore.getState().completedTopics).toEqual([]);
  });
});
