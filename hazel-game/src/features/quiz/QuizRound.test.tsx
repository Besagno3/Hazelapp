import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Question } from '../../types';

// Five questions; the first option is right (each with its own text, so the
// one sliding out never matches the one sliding in).
const questions: Question[] = Array.from({ length: 5 }, (_, i) => ({
  id: `q-${i}`,
  topic: 'math',
  level: 3,
  text: `Question ${i}?`,
  options: [`Right ${i}`, `Wrong ${i}a`, `Wrong ${i}b`, `Wrong ${i}c`],
  correctIndex: 0,
  explanation: '',
}));
vi.mock('../../hooks/useGeneratedQuestions', () => ({
  useGeneratedQuestions: () => ({ questions, loading: false, error: null, age: 9, skillLevel: 3, reload: () => {} }),
}));
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  prefetchQuestions: () => {},
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: QuizRound } = await import('./QuizRound');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');

const addXp = vi.fn();

function start(passedRounds: number, worldUnlocked: boolean) {
  useSaveStore.setState({
    userId: null,
    save: { ...defaultSave(), passedRounds, worldUnlocked },
    status: 'ready',
    remoteError: null,
  });
  useProfileStore.setState({ addXp, setSkillLevel: vi.fn(), recordActivity: vi.fn() });
}

/** Answer all five right, then open the results. */
async function playPerfectRound() {
  render(<QuizRound />);
  for (let i = 0; i < questions.length; i++) {
    fireEvent.click(await screen.findByText(`Right ${i}`));
    fireEvent.click(screen.getByText(i === questions.length - 1 ? 'See Results' : 'Next Question'));
  }
  await screen.findByText('Round Passed!');
}

beforeEach(() => addXp.mockReset());

describe('QuizRound — XP only once the world is open (#116)', () => {
  it('an opening round pays no XP for right answers', async () => {
    start(0, false);
    await playPerfectRound();
    expect(addXp).not.toHaveBeenCalled();
    expect(useSaveStore.getState().save!.passedRounds).toBe(1);
  });

  it('the round that opens the world pays none either', async () => {
    start(2, false);
    await playPerfectRound();
    expect(useSaveStore.getState().save!.worldUnlocked).toBe(true);
    expect(addXp).not.toHaveBeenCalled();
  });

  it('a practice round after the world is open still pays XP', async () => {
    start(3, true);
    await playPerfectRound();
    expect(addXp).toHaveBeenCalledTimes(1);
    expect(addXp.mock.calls[0][0]).toBeGreaterThan(0);
  });
});
