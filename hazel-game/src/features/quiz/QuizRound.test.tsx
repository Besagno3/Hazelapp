import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
const { XP_PER_CORRECT } = await import('../../lib/level');

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

/** Answer each question right or wrong as `right` says, then open the results. */
async function playRound(right: boolean[]) {
  render(<QuizRound />);
  for (let i = 0; i < questions.length; i++) {
    fireEvent.click(await screen.findByText(right[i] ? `Right ${i}` : `Wrong ${i}a`));
    fireEvent.click(screen.getByText(i === questions.length - 1 ? 'See Results' : 'Next Question'));
  }
}

beforeEach(() => {
  addXp.mockReset();
  hook.error = null;
  markSeen.mockClear();
  hook.questions = questions;
  hook.loading = false;
  lastLevelOverride = undefined;
});

describe('QuizRound — the top bar (#110h)', () => {
  it('the level, streak and Switch sit in the page above the question, and above the results', async () => {
    start(1, false);
    render(<QuizRound />);
    const bar = screen.getByTestId('screen-topbar');
    expect(bar.querySelector('.fixed')).toBeNull();
    expect(bar.compareDocumentPosition(screen.getByText('Question 0?')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    await playPerfectRound();
    expect(screen.getByTestId('screen-topbar').compareDocumentPosition(screen.getByText('Round Passed!')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('…and through the wait for the questions, and a failure: Switch player is never out of reach (#110h review)', () => {
    start(1, false);
    hook.loading = true;
    render(<QuizRound />);
    expect(screen.getByText('Building your questions…')).toBeInTheDocument();
    expect(screen.getByTestId('screen-topbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch player' })).toBeInTheDocument();
    cleanup();
    hook.loading = false;
    hook.error = 'Question generation failed — rate limited';
    render(<QuizRound />);
    expect(screen.getByRole('button', { name: 'Switch player' })).toBeInTheDocument();
    expect(screen.getByTestId('screen-topbar').compareDocumentPosition(screen.getByText('Try again')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a short landscape phone keeps the bar and the card tight, so the answers stay on screen', () => {
    start(1, false);
    render(<QuizRound />);
    expect(screen.getByTestId('screen-topbar')).toHaveClass('[@media(max-height:500px)]:mb-1');
    expect(screen.getByText('Question 0?')).toHaveClass('[@media(max-height:500px)]:mb-3');
    // Still 48 px a tap (py-2.5 + the line + the border).
    expect(screen.getByRole('button', { name: 'Right 0' })).toHaveClass('[@media(max-height:500px)]:py-2.5');
  });

  it('after an answer, Next is brought into view — on a sideways phone it sat below the fold (#159 review round 2)', async () => {
    const scrolled: Element[] = [];
    const scroll = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    try {
      start(1, false);
      render(<QuizRound />);
      expect(scroll).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByText('Right 0'));
      // 'nearest': no scroll at all when it already fits.
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
      expect(scrolled.at(-1)).toBe(screen.getByRole('button', { name: 'Next Question' }));
      // The next question's answer brings its Next in too.
      fireEvent.click(screen.getByText('Next Question'));
      fireEvent.click(await screen.findByText('Wrong 1a'));
      expect(scroll).toHaveBeenCalledTimes(2);
    } finally {
      raf.mockRestore();
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
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

describe('QuizRound — starter questions don’t move the skill level (#153 review round 1)', () => {
  it('a perfect round of starter questions keeps the level, and pays no XP', async () => {
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    hook.questions = questions.map((q, i) => ({ ...q, id: `starter-math-easy-${i + 1}` }));
    await playPerfectRound();
    // Six a band, the same six for levels 1–3: a child who knows them by heart
    // would otherwise climb two levels a round.
    expect(setSkillLevel).toHaveBeenCalledWith('math', 3);
    // …and knowing them by heart isn't worth XP either (the owner's call).
    expect(addXp).not.toHaveBeenCalled();
  });

  it('the bank questions in a mixed round still move it, on their own', async () => {
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    // Three from the bank, the last two topped up from the starters — the
    // bank's all right, the starters both wrong (review round 2: counted, the
    // starters would make it a +1).
    hook.questions = questions.map((q, i) => (i < 3 ? q : { ...q, id: `starter-math-easy-${i + 1}` }));
    await playRound([true, true, true, false, false]);
    await screen.findByText('Keep Trying!');
    expect(setSkillLevel).toHaveBeenCalledWith('math', 5);
  });

  it('a mixed round pays XP for its right bank answers only', async () => {
    start(3, true);
    // Two from the bank, three starters — every answer right.
    hook.questions = questions.map((q, i) => (i < 2 ? q : { ...q, id: `starter-math-easy-${i + 1}` }));
    await playPerfectRound();
    expect(addXp).toHaveBeenCalledWith(2 * XP_PER_CORRECT);
  });
});

describe('QuizRound — one or two bank questions among starters don’t decide the level (#153 review round 2)', () => {
  // A short batch from the server: one bank question, four starters.
  const oneFromTheBank = () => questions.map((q, i) => (i === 0 ? q : { ...q, id: `starter-math-easy-${i}` }));

  it('a round passed 4 of 5 doesn’t drop the level on its one bank question', async () => {
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    hook.questions = oneFromTheBank();
    await playRound([false, true, true, true, true]);
    await screen.findByText('Round Passed!');
    expect(setSkillLevel).toHaveBeenCalledWith('math', 3);
  });

  it('a round failed 1 of 5 doesn’t climb two on its one bank question', async () => {
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    hook.questions = oneFromTheBank();
    await playRound([true, false, false, false, false]);
    await screen.findByText('Keep Trying!');
    expect(setSkillLevel).toHaveBeenCalledWith('math', 3);
  });
});
