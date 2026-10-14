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
// What the hook hands back; a test may swap it, as a re-keyed fetch would.
const hook = { questions, loading: false, error: null as string | null };
/** The level override the hook was last called with. */
let lastLevelOverride: number | undefined;
vi.mock('../../hooks/useGeneratedQuestions', () => ({
  useGeneratedQuestions: (_topic: string, _count: number, levelOverride?: number) => {
    lastLevelOverride = levelOverride;
    return { ...hook, age: 9, skillLevel: 3, reload: () => {} };
  },
}));
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  prefetchQuestions: () => {},
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
const { markSeen } = vi.hoisted(() => ({ markSeen: vi.fn() }));
vi.mock('../../lib/seen', () => ({ markSeen }));

const { default: QuizRound } = await import('./QuizRound');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { TOPIC_NOT_READY } = await import('../../lib/questions');

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

beforeEach(() => {
  addXp.mockReset();
  hook.error = null;
  markSeen.mockClear();
  hook.questions = questions;
  hook.loading = false;
  lastLevelOverride = undefined;
});

describe('QuizRound — on screen = seen (#134)', () => {
  it('marks each question seen as it comes up, in order — none from the next batch under the results', async () => {
    start(3, true);
    useProfileStore.setState({
      setSkillLevel: vi.fn(async () => {
        hook.questions = questions.map((q) => ({ ...q, id: `next-${q.id}` }));
      }),
    });
    await playPerfectRound();
    expect(markSeen.mock.calls.map((c) => c[0])).toEqual(questions.map((q) => q.id));
  });
});

describe('QuizRound — XP only once the world is open (#122)', () => {
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

describe('QuizRound — a topic the server does not know yet (#130)', () => {
  it('says it is coming soon, with Pick another topic and no Try again', () => {
    start(3, true);
    hook.error = TOPIC_NOT_READY;
    render(<QuizRound />);
    expect(screen.getByText('Coming soon!')).toBeInTheDocument();
    expect(screen.getByText(TOPIC_NOT_READY)).toBeInTheDocument();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pick another topic' })).toBeInTheDocument();
  });

  it('any other failure keeps Try again', () => {
    start(3, true);
    hook.error = 'Question generation failed — rate limited';
    render(<QuizRound />);
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });
});

describe('QuizRound — the recap keeps the round it was played with (Act I review B3)', () => {
  // Saving the new skill level re-keys the question hook: the next batch is
  // loading (then arrives) while the results are on screen.
  const nextBatch: Question[] = questions.map((q, i) => ({ ...q, id: `next-${i}`, text: `Next ${i}?`, options: [`New ${i}`, 'x', 'y', 'z'] }));

  it('shows the question the player missed, not one from the next batch', async () => {
    start(3, true);
    useProfileStore.setState({
      setSkillLevel: vi.fn(async () => {
        hook.questions = nextBatch;
        hook.loading = true;
      }),
    });
    render(<QuizRound />);
    // Miss the first question, get the other four right (80%: passed).
    fireEvent.click(await screen.findByText('Wrong 0a'));
    fireEvent.click(screen.getByText('Next Question'));
    for (let i = 1; i < questions.length; i++) {
      fireEvent.click(await screen.findByText(`Right ${i}`));
      fireEvent.click(screen.getByText(i === questions.length - 1 ? 'See Results' : 'Next Question'));
    }
    expect(await screen.findByText('Round Passed!')).toBeInTheDocument();
    expect(screen.getByText('Score: 80%')).toBeInTheDocument();
    expect(screen.getByText('Question 0?')).toBeInTheDocument();
    expect(screen.getByText('Wrong 0a')).toBeInTheDocument();
    expect(screen.getByText('Right 0')).toBeInTheDocument();
    expect(screen.queryByText('Next 0?')).toBeNull();
    expect(screen.queryByText(/Building your questions/)).toBeNull();
  });
});

describe('QuizRound — the results keep the next round\'s warm-up (#130 review)', () => {
  it('plays at the profile\'s level, then pins the round\'s level once it ends', async () => {
    start(3, true);
    render(<QuizRound />);
    expect(lastLevelOverride).toBeUndefined();
    for (let i = 0; i < questions.length; i++) {
      fireEvent.click(await screen.findByText(`Right ${i}`));
      fireEvent.click(screen.getByText(i === questions.length - 1 ? 'See Results' : 'Next Question'));
    }
    await screen.findByText('Round Passed!');
    // The round was played at level 3: the hook keeps asking for 3, so the new
    // level can't re-key it and use up the batch prefetched for the next round.
    expect(lastLevelOverride).toBe(3);
  });
});
