import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
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

// The question service, stood in for at the wire (#163): the round loads for
// real — the battle's quick start (a saved-questions-only request), the rest
// asked for while the kid answers, starter questions for whatever the server
// can't give. `saved` answers the saved-only request; `rest` the normal one
// (nothing more by default).
const server = {
  saved: questions as Question[] | Error,
  rest: (): Promise<Question[] | Error> => Promise.resolve([]),
};
const toApi = (q: Question) => ({ ...q, explanation: q.explanation ?? '', timesAsked: 0 });
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke } } }));
function answer(qs: Question[] | Error) {
  return qs instanceof Error ? { data: null, error: qs } : { data: { questions: qs.map(toApi) }, error: null };
}
/** The look-ahead finishRound warms for the next round; and a quick start a test can hang (and land later). */
const { warm, hangQuick } = vi.hoisted(() => ({ warm: vi.fn(), hangQuick: { on: false, until: null as Promise<unknown> | null } }));
vi.mock('../../lib/questions', async (orig) => {
  const real = await orig<typeof import('../../lib/questions')>();
  return {
    ...real,
    warmNextRound: warm,
    quickQuestions: (...args: Parameters<typeof real.quickQuestions>) => (hangQuick.on ? (hangQuick.until ?? new Promise(() => {})) : real.quickQuestions(...args)),
  };
});
vi.mock('canvas-confetti', () => ({ default: () => {} }));
const { markSeen } = vi.hoisted(() => ({ markSeen: vi.fn() }));
vi.mock('../../lib/seen', () => ({ markSeen }));

const { default: QuizRound } = await import('./QuizRound');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { XP_PER_CORRECT } = await import('../../lib/level');
const { QUICK_WAIT_MS, clearCarried } = await import('../../lib/questions');
const { FUN_FACTS } = await import('../../lib/funFacts');
const { LONG_WAIT_MS, LONG_WAIT_WORDS } = await import('./useCalmWait');
const { MotionConfig } = await import('framer-motion');
const { flowActor, sendFlow } = await import('../../machines/gameFlow');

/** The bodies the question service was asked with. */
const asked = () => invoke.mock.calls.map((c) => c[1].body as { count: number; skillLevel: number; cacheOnly?: boolean });

const addXp = vi.fn();
const noteAnswer = vi.fn();

function start(passedRounds: number, worldUnlocked: boolean) {
  useSaveStore.setState({
    userId: null,
    save: { ...defaultSave(), passedRounds, worldUnlocked },
    status: 'ready',
    remoteError: null,
  });
  useProfileStore.setState({
    // Math at level 3.
    profile: { id: 'kid-1', birthYear: 2016, birthMonth: 1, skillLevels: { math: 3 }, xp: 0, powerUps: {}, currentStreak: 0, longestStreak: 0, lastPlayedOn: null },
    addXp,
    setSkillLevel: vi.fn(),
    recordActivity: vi.fn(),
    noteAnswer,
  });
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
  noteAnswer.mockReset();
  markSeen.mockClear();
  warm.mockClear();
  hangQuick.on = false;
  hangQuick.until = null;
  clearCarried();
  server.saved = questions;
  server.rest = () => Promise.resolve([]);
  invoke.mockReset();
  invoke.mockImplementation(async (_name: string, { body }: { body: { count: number; cacheOnly?: boolean } }) =>
    answer(body.cacheOnly ? (server.saved instanceof Error ? server.saved : server.saved.slice(0, body.count)) : await server.rest()),
  );
});

describe('QuizRound — the top bar (#110h)', () => {
  it('the level, streak and Switch sit in the page above the question, and above the results', async () => {
    start(1, false);
    render(<QuizRound />);
    const bar = screen.getByTestId('screen-topbar');
    expect(bar.querySelector('.fixed')).toBeNull();
    expect(bar.compareDocumentPosition(await screen.findByText('Question 0?')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    // (Left mid-round, the unasked four were carried to the next round: start afresh.)
    clearCarried();
    await playPerfectRound();
    expect(screen.getByTestId('screen-topbar').compareDocumentPosition(screen.getByText('Round Passed!')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('…and through the short wait for the first question: Switch player is never out of reach (#110h review, #163)', async () => {
    start(1, false);
    invoke.mockReturnValue(new Promise(() => {})); // a service that never answers
    render(<QuizRound />);
    // The quiz itself, waiting in its card — never the full-screen loader.
    expect(screen.queryByText('Building your questions…')).toBeNull();
    expect(screen.getByTestId('quiz-waiting')).toHaveTextContent('One moment…');
    expect(screen.getByText('Question 1/5')).toBeInTheDocument();
    expect(screen.getByTestId('screen-topbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch player' })).toBeInTheDocument();
    expect(screen.getByTestId('screen-topbar').compareDocumentPosition(screen.getByTestId('quiz-waiting')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the wait is a question\'s height, so the card doesn\'t jump when it ends (#163 review)', async () => {
    start(1, false);
    invoke.mockReturnValue(new Promise(() => {}));
    render(<QuizRound />);
    // Two lines and four answers: 324 px; one line on a short landscape phone,
    // 256 px, where the card runs past the screen (measured).
    expect(screen.getByTestId('quiz-waiting')).toHaveClass('min-h-[20.25rem]', '[@media(max-height:500px)]:min-h-[16rem]');
    cleanup();
    // …and a question keeps two lines' room, so a one-line one is as tall
    // as a two-line one (review round 2: two lines grew the card 28 px).
    invoke.mockImplementation(async (_n: string, { body }: { body: { count: number; cacheOnly?: boolean } }) => answer(body.cacheOnly ? questions.slice(0, body.count) : []));
    render(<QuizRound />);
    expect(await screen.findByText('Question 0?')).toHaveClass('min-h-[3.5rem]', '[@media(max-height:500px)]:min-h-0');
  });

  it('a first question that takes most of a second never brings up the wait (#163 review)', async () => {
    start(1, false);
    const said: string[] = [];
    const saved = server.saved as Question[];
    invoke.mockImplementation(async (_n: string, { body }: { body: { count: number; cacheOnly?: boolean } }) => {
      if (!body.cacheOnly) return answer([]);
      await new Promise((r) => setTimeout(r, 500));
      return answer(saved.slice(0, body.count));
    });
    render(<QuizRound />);
    const status = screen.getByTestId('quiz-status');
    const watch = new MutationObserver(() => said.push(status.textContent ?? ''));
    watch.observe(status, { childList: true, characterData: true, subtree: true });
    expect(await screen.findByText('Question 0?', {}, { timeout: 2000 })).toBeInTheDocument();
    watch.disconnect();
    expect(said.filter(Boolean)).toEqual([]);
  });

  it('the status line is in the page empty, and says nothing for a question that comes at once (#163 review)', async () => {
    start(1, false);
    render(<QuizRound />);
    // Mounted empty, so what's put in it later is read out.
    expect(screen.getByTestId('quiz-status')).toBeEmptyDOMElement();
    await screen.findByText('Question 0?');
    expect(screen.getByTestId('quiz-status')).toBeEmptyDOMElement();
  });

  it('a short landscape phone keeps the bar and the card tight, so the answers stay on screen', async () => {
    start(1, false);
    render(<QuizRound />);
    expect(screen.getByTestId('screen-topbar')).toHaveClass('[@media(max-height:500px)]:mb-1');
    expect(await screen.findByText('Question 0?')).toHaveClass('[@media(max-height:500px)]:mb-3');
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
        server.saved = questions.map((q) => ({ ...q, id: `next-${q.id}` }));
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

describe('QuizRound — the recap keeps the round it was played with (Act I review B3)', () => {
  // Saving the new skill level re-keys the question hook: the next batch is
  // loading (then arrives) while the results are on screen.
  const nextBatch: Question[] = questions.map((q, i) => ({ ...q, id: `next-${i}`, text: `Next ${i}?`, options: [`New ${i}`, 'x', 'y', 'z'] }));

  it('shows the question the player missed, not one from the next batch', async () => {
    start(3, true);
    useProfileStore.setState({
      setSkillLevel: vi.fn(async (topic, level) => {
        server.saved = nextBatch;
        // As the real one does: the profile's level moves.
        useProfileStore.setState((st) => ({ profile: { ...st.profile!, skillLevels: { ...st.profile!.skillLevels, [topic]: level } } }));
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
    expect(screen.queryByText(/One moment/)).toBeNull();
  });
});

describe('QuizRound — the results keep the next round\'s warm-up (#130 review)', () => {
  it('plays at the profile\'s level, then pins the round\'s level once it ends', async () => {
    start(3, true);
    useProfileStore.setState({
      setSkillLevel: vi.fn(async (topic, level) => {
        useProfileStore.setState((st) => ({ profile: { ...st.profile!, skillLevels: { ...st.profile!.skillLevels, [topic]: level } } }));
      }),
    });
    render(<QuizRound />);
    for (let i = 0; i < questions.length; i++) {
      fireEvent.click(await screen.findByText(`Right ${i}`));
      fireEvent.click(screen.getByText(i === questions.length - 1 ? 'See Results' : 'Next Question'));
    }
    await screen.findByText('Round Passed!');
    expect(useProfileStore.getState().profile!.skillLevels.math).toBe(5);
    // The round was played at level 3: the questions keep asking for 3, so the
    // new level can't re-key them and use up the batch warmed for the next round.
    await act(async () => {});
    expect(asked().length).toBeGreaterThan(0);
    expect(asked().every((b) => b.skillLevel === 3)).toBe(true);
    // …which is warmed at the new level (the carried-over ones counted, #163
    // review) — the normal way, as the bank covered this round (#30, review
    // round 2: asked at the new level, not this round's).
    expect(warm).toHaveBeenCalledWith('math', expect.any(Number), 5, 5, { fresh: true });
  });
});

describe('QuizRound — starter questions don’t move the skill level (#153 review round 1)', () => {
  it('a perfect round of starter questions keeps the level, and pays no XP', async () => {
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    // (Starter ids from the stand-in server, so the test knows their answers.)
    server.saved = questions.map((q, i) => ({ ...q, id: `starter-math-easy-${i + 1}` }));
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
    server.saved = questions.map((q, i) => (i < 3 ? q : { ...q, id: `starter-math-easy-${i + 1}` }));
    await playRound([true, true, true, false, false]);
    await screen.findByText('Keep Trying!');
    expect(setSkillLevel).toHaveBeenCalledWith('math', 5);
  });

  it('a mixed round pays XP for its right bank answers only', async () => {
    start(3, true);
    // Two from the bank, three starters — every answer right.
    server.saved = questions.map((q, i) => (i < 2 ? q : { ...q, id: `starter-math-easy-${i + 1}` }));
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
    server.saved = oneFromTheBank();
    await playRound([false, true, true, true, true]);
    await screen.findByText('Round Passed!');
    expect(setSkillLevel).toHaveBeenCalledWith('math', 3);
  });

  it('a round failed 1 of 5 doesn’t climb two on its one bank question', async () => {
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    server.saved = oneFromTheBank();
    await playRound([true, false, false, false, false]);
    await screen.findByText('Keep Trying!');
    expect(setSkillLevel).toHaveBeenCalledWith('math', 3);
  });
});

/** Picks the first answer of the next question on screen (not `previous`, still sliding out), whatever it says. */
async function answerFirst(previous?: string) {
  const heading = await waitFor(() => {
    const h = screen.getByRole('heading', { level: 2 });
    expect(h.textContent).not.toBe(previous);
    return h;
  });
  const options = heading.nextElementSibling!.querySelectorAll('button');
  fireEvent.click(options[0]);
  return heading.textContent ?? '';
}

describe('QuizRound — starts at once, the rest while the kid answers (#163)', () => {
  it('the first question is on screen without waiting for the slow rest; a late batch joins; none asked twice', async () => {
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    // The bank has three saved questions; writing the other two is slow.
    server.saved = questions.slice(0, 3);
    let finish!: (qs: Question[]) => void;
    server.rest = () => new Promise((resolve) => (finish = resolve));
    render(<QuizRound />);
    expect(await screen.findByText('Question 0?')).toBeInTheDocument();
    expect(screen.queryByText('Building your questions…')).toBeNull();
    // Saved questions only first (never a Claude call), the rest asked for at once.
    await waitFor(() => expect(asked()).toHaveLength(2));
    expect(asked()[0]).toMatchObject({ count: 5, cacheOnly: true });
    expect(asked()[1]).toMatchObject({ count: 2 });
    expect(asked()[1]).not.toHaveProperty('cacheOnly');

    for (let i = 0; i < 3; i++) {
      fireEvent.click(await screen.findByText(`Right ${i}`));
      fireEvent.click(screen.getByText('Next Question'));
    }
    // Question 4 isn't here yet: a short wait in the card, heard as well as seen
    // (a moment late, as it shows — #163 review).
    expect(await screen.findByText('Question 4/5')).toBeInTheDocument();
    expect(await screen.findByTestId('quiz-waiting')).toHaveTextContent('One moment…');
    await waitFor(() => expect(screen.getByTestId('quiz-status')).toHaveTextContent('One moment…'));

    // The rest arrive — one of them a question the round already asked — and
    // the status line says so (#163 review).
    await act(async () => finish([questions[1], questions[3], questions[4]]));
    fireEvent.click(await screen.findByText('Right 3'));
    expect(screen.getByTestId('quiz-status')).toHaveTextContent("Here's question 4!");
    fireEvent.click(screen.getByText('Next Question'));
    fireEvent.click(await screen.findByText('Right 4'));
    fireEvent.click(screen.getByText('See Results'));
    await screen.findByText('Round Passed!');
    expect(markSeen.mock.calls.map((c) => c[0])).toEqual(questions.map((q) => q.id));
    // Five bank questions, all right: the ramp and the XP as ever.
    expect(setSkillLevel).toHaveBeenCalledWith('math', 5);
    expect(addXp).toHaveBeenCalledWith(5 * XP_PER_CORRECT);
  });

  it('with the question service down, the round is starter questions and still finishes — no XP, the level holds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start(3, true);
    const setSkillLevel = vi.fn();
    useProfileStore.setState({ setSkillLevel });
    server.saved = new Error('Failed to fetch');
    server.rest = async () => new Error('Failed to fetch');
    render(<QuizRound />);
    const texts: string[] = [];
    for (let i = 0; i < 5; i++) {
      texts.push(await answerFirst(texts.at(-1)));
      fireEvent.click(screen.getByText(i === 4 ? 'See Results' : 'Next Question'));
    }
    expect(await screen.findByText(/Round Passed!|Keep Trying!/)).toBeInTheDocument();
    expect(new Set(texts).size).toBe(5);
    const shown = markSeen.mock.calls.map((c) => c[0] as string);
    expect(shown).toHaveLength(5);
    expect(new Set(shown).size).toBe(5);
    expect(shown.every((id) => id.startsWith('starter-math-'))).toBe(true);
    expect(addXp).not.toHaveBeenCalled();
    expect(setSkillLevel).toHaveBeenCalledWith('math', 3);
    // Never an error for the child; the reason is in the console, in words.
    expect(screen.queryByText(/Failed to fetch|Try again/)).toBeNull();
    warn.mockRestore();
  });

  it('a kid who reaches a question before the rest gets a starter after a short wait, so the round finishes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start(3, true);
    server.saved = questions.slice(0, 4);
    server.rest = () => new Promise(() => {}); // still being written
    render(<QuizRound />);
    for (let i = 0; i < 4; i++) {
      fireEvent.click(await screen.findByText(`Right ${i}`));
      fireEvent.click(screen.getByText('Next Question'));
    }
    expect(await screen.findByTestId('quiz-waiting')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('quiz-waiting')).toBeNull(), { timeout: QUICK_WAIT_MS + 2000 });
    await answerFirst('Question 3?');
    fireEvent.click(screen.getByText('See Results'));
    await screen.findByText(/Round Passed!|Keep Trying!/);
    const shown = markSeen.mock.calls.map((c) => c[0] as string);
    expect(shown.slice(0, 4)).toEqual(['q-0', 'q-1', 'q-2', 'q-3']);
    expect(shown[4]).toMatch(/^starter-math-/);
    // Four bank answers right, the starter's pays nothing (#153).
    expect(addXp).toHaveBeenCalledWith(4 * XP_PER_CORRECT);
    warn.mockRestore();
  }, 10000);
});

describe('QuizRound — review round 1 (#163)', () => {
  it('a double tap on Next never skips a question: the old card is inert, and the recap pairs every answer with its question', async () => {
    start(3, true);
    render(<QuizRound />);
    fireEvent.click(await screen.findByText('Right 0'));
    const next = screen.getByRole('button', { name: 'Next Question' });
    fireEvent.click(next);
    // Sliding out, the old card takes no more taps or keys…
    expect(next.closest('[inert]')).not.toBeNull();
    // …and a tap that gets through anyway moves nothing.
    fireEvent.click(next);
    expect(await screen.findByText('Question 1?')).toBeInTheDocument();
    expect(screen.getByText('Question 2/5')).toBeInTheDocument();
    // Miss question 2, get the rest.
    fireEvent.click(screen.getByText('Wrong 1a'));
    fireEvent.click(screen.getByText('Next Question'));
    for (let i = 2; i < questions.length; i++) {
      fireEvent.click(await screen.findByText(`Right ${i}`));
      fireEvent.click(screen.getByText(i === questions.length - 1 ? 'See Results' : 'Next Question'));
    }
    await screen.findByText('Round Passed!');
    expect(screen.getByText('Score: 80%')).toBeInTheDocument();
    // The miss is the question that was on screen, with the answer picked there.
    expect(screen.getByText('Question 1?')).toBeInTheDocument();
    expect(screen.getByText('Wrong 1a')).toBeInTheDocument();
    expect(markSeen.mock.calls.map((c) => c[0])).toEqual(questions.map((q) => q.id));
    expect(addXp).toHaveBeenCalledWith(4 * XP_PER_CORRECT);
  });

  it('the results show the XP the round paid, and one of the topic\'s fun facts', async () => {
    start(3, true);
    render(<QuizRound />);
    for (let i = 0; i < questions.length; i++) {
      fireEvent.click(await screen.findByText(`Right ${i}`));
      // The first fact, which starts "Did you know?" itself.
      const random = i === questions.length - 1 ? vi.spyOn(Math, 'random').mockReturnValue(0) : null;
      fireEvent.click(screen.getByText(i === questions.length - 1 ? 'See Results' : 'Next Question'));
      random?.mockRestore();
    }
    await screen.findByText('Round Passed!');
    expect(screen.getByText(`+${5 * XP_PER_CORRECT} XP`)).toBeInTheDocument();
    const fact = screen.getByText('Did you know?').parentElement!;
    expect(fact).toHaveTextContent(FUN_FACTS.math[0].replace(/^Did you know\?\s*/, ''));
    // Never "Did you know? Did you know?".
    expect(fact.textContent!.match(/Did you know\?/g)).toHaveLength(1);
  });

  it('no XP line for a round that paid none (the opening rounds, #122)', async () => {
    start(0, false);
    await playPerfectRound();
    expect(screen.queryByText(/^\+\d+ XP$/)).toBeNull();
  });

  it('a wait that runs long (only a bug does that) keeps a way back to the topics', async () => {
    await onFakeTime(async () => {
      start(1, false);
      sendFlow({ type: 'RESET' });
      sendFlow({ type: 'READY' });
      sendFlow({ type: 'PICK_TOPIC', topic: 'math' });
      expect(flowActor.getSnapshot().value).toBe('quiz');
      hangQuick.on = true;
      render(<QuizRound />);
      expect(screen.queryByRole('button', { name: 'Back to Topics' })).toBeNull();
      await act(async () => void (await vi.advanceTimersByTimeAsync(LONG_WAIT_MS)));
      fireEvent.click(screen.getByRole('button', { name: 'Back to Topics' }));
      expect(flowActor.getSnapshot().value).toBe('topicSelect');
    });
  });
});

/** Real time's own timer, taken before any test fakes it. */
const realSetTimeout = globalThis.setTimeout;
/**
 * Fake time on: moves it on by `ms`, letting what's due run — 16 ms at a time,
 * so React renders between (inside one `act` it would only render at the end).
 */
async function step(ms: number) {
  for (let t = 0; t < ms; t += 16) await act(async () => void (await vi.advanceTimersByTimeAsync(Math.min(16, ms - t))));
}
/**
 * Steps fake time until `check` holds. The motion runs its frames on the
 * real animation-frame clock (framer-motion takes it at import), reading the
 * fake time, so each step lets a real frame go by too.
 */
async function stepUntil(check: () => boolean, maxMs = 5000) {
  for (let t = 0; t < maxMs && !check(); t += 16) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
      await new Promise((r) => realSetTimeout(r, 20));
    });
  }
  expect(check()).toBe(true);
}
const heading = () => screen.queryByRole('heading', { level: 2 })?.textContent;
/** Runs `test` on fake time, then unmounts and lets the motion's last frames run before real time is back — a frame left waiting would stall every later test's motion. */
async function onFakeTime(test: () => Promise<void>) {
  vi.useFakeTimers();
  try {
    await test();
  } finally {
    cleanup();
    await vi.advanceTimersByTimeAsync(1000);
    vi.useRealTimers();
  }
}
/** Every text the status line takes, in order. */
function hear() {
  const status = screen.getByTestId('quiz-status');
  const said: string[] = [];
  const watch = new MutationObserver(() => said.push(status.textContent ?? ''));
  watch.observe(status, { childList: true, characterData: true, subtree: true });
  return said;
}

describe('QuizRound — review round 2 (#163)', () => {
  it('a round its saved questions covered asks for the next one\'s the normal way, at the new level; one that asked for the rest only warms', async () => {
    start(3, true);
    await playPerfectRound();
    expect(warm).toHaveBeenLastCalledWith('math', expect.any(Number), 5, 5, { fresh: true });
    cleanup();
    warm.mockClear();
    // Three saved: the round asked for the other two (Claude may write them).
    server.saved = questions.slice(0, 3);
    server.rest = () => Promise.resolve(questions.slice(3));
    await playPerfectRound();
    expect(asked().filter((b) => !b.cacheOnly)).toHaveLength(1);
    expect(warm).toHaveBeenLastCalledWith('math', expect.any(Number), 5, 5, { fresh: false });
  });

  it('the "+N XP" line counts the bank questions\' right answers only, as paid', async () => {
    start(3, true);
    // Two from the bank, three starters — every answer right.
    server.saved = questions.map((q, i) => (i < 2 ? q : { ...q, id: `starter-math-easy-${i + 1}` }));
    await playPerfectRound();
    expect(screen.getByText(`+${2 * XP_PER_CORRECT} XP`)).toBeInTheDocument();
    expect(screen.queryByText(`+${5 * XP_PER_CORRECT} XP`)).toBeNull();
  });

  it('a question that lands while the last one is still sliding out comes straight in — the wait starts only once the slot is free', async () => {
    await onFakeTime(async () => {
      start(3, true);
      server.saved = questions.slice(0, 3);
      const rest: ((qs: Question[]) => void)[] = [];
      server.rest = () => new Promise((resolve) => rest.push(resolve));
      // A slide of 1 s, so "still sliding out" is long enough to land in.
      render(
        <MotionConfig transition={{ duration: 1 }}>
          <QuizRound />
        </MotionConfig>,
      );
      const said = hear();
      for (let i = 0; i < 3; i++) {
        await stepUntil(() => heading() === `Question ${i}?`);
        fireEvent.click(screen.getByText(`Right ${i}`));
        fireEvent.click(screen.getByText('Next Question'));
      }
      // Half a second on, question 3 is still on its way out: no wait yet
      // (it used to show 0.25 s after the tap, behind the old card).
      await step(500);
      expect(said.filter(Boolean)).toEqual([]);
      await act(async () => rest[0](questions.slice(3)));
      await stepUntil(() => heading() === 'Question 3?');
      expect(said.filter(Boolean)).toEqual([]);
      expect(screen.queryByTestId('quiz-waiting')).toBeNull();
    });
  });

  it('…and when nothing has come, the wait shows a beat after the old question has gone', async () => {
    await onFakeTime(async () => {
      start(3, true);
      server.saved = questions.slice(0, 3);
      server.rest = () => new Promise(() => {});
      render(
        <MotionConfig transition={{ duration: 1 }}>
          <QuizRound />
        </MotionConfig>,
      );
      for (let i = 0; i < 3; i++) {
        await stepUntil(() => heading() === `Question ${i}?`);
        fireEvent.click(screen.getByText(`Right ${i}`));
        fireEvent.click(screen.getByText('Next Question'));
      }
      // Question 3 has gone: the wait's place is there, its clock just started.
      await stepUntil(() => !!screen.queryByTestId('quiz-waiting'));
      expect(screen.getByTestId('quiz-status')).toBeEmptyDOMElement();
      await step(200);
      expect(screen.getByTestId('quiz-status')).toBeEmptyDOMElement();
      await step(60);
      expect(screen.getByTestId('quiz-status')).toHaveTextContent('One moment…');
      expect(screen.getByTestId('quiz-waiting')).toHaveTextContent('One moment…');
    });
  });

  it('a wait past 8 s says so — not "on its way" — and so does the status line, once; the way back goes the moment the question comes', async () => {
    await onFakeTime(async () => {
      start(1, false);
      let land!: (v: unknown) => void;
      hangQuick.on = true;
      hangQuick.until = new Promise((r) => (land = r));
      render(<QuizRound />);
      const said = hear();
      await step(LONG_WAIT_MS - 1);
      expect(screen.queryByRole('button', { name: 'Back to Topics' })).toBeNull();
      expect(screen.getByTestId('quiz-waiting')).toHaveTextContent('Your question is on its way!');
      await step(1);
      const wait = screen.getByTestId('quiz-waiting');
      expect(wait).toHaveTextContent('This is taking a while.');
      expect(wait).toHaveTextContent('You can go back and pick again.');
      expect(wait).not.toHaveTextContent(/on its way/);
      expect(wait.querySelector('.animate-spin')).toBeNull();
      expect(screen.getByRole('button', { name: 'Back to Topics' })).toBeInTheDocument();
      expect(screen.getByTestId('quiz-status')).toHaveTextContent(LONG_WAIT_WORDS);
      await step(5000);
      expect(said.filter((t) => t === LONG_WAIT_WORDS)).toHaveLength(1);
      // The question comes after all: the way back is gone at once.
      await act(async () => land({ questions, late: Promise.resolve([]) }));
      expect(screen.queryByRole('button', { name: 'Back to Topics' })).toBeNull();
      await stepUntil(() => heading() === 'Question 0?');
      expect(screen.getByTestId('quiz-status')).toHaveTextContent("Here's question 1!");
      expect(said.filter(Boolean)).toEqual(['One moment… your question is on its way.', LONG_WAIT_WORDS, "Here's question 1!"]);
    });
  });

  it('a short landscape phone tightens the results card — the emoji beside the title, the XP beside the score — and the fact has its own mark', async () => {
    start(3, true);
    await playPerfectRound();
    const title = screen.getByRole('heading', { name: 'Round Passed!' });
    const row = title.parentElement!;
    expect(row).toHaveClass('[@media(max-height:500px)]:flex');
    expect(row.firstElementChild).toHaveClass('text-6xl', '[@media(max-height:500px)]:text-4xl', '[@media(max-height:500px)]:mb-0');
    expect(screen.getByText(`+${5 * XP_PER_CORRECT} XP`).parentElement).toHaveClass('[@media(max-height:500px)]:flex');
    expect(row.closest('.rounded-2xl')).toHaveClass('p-8', '[@media(max-height:500px)]:py-4');
    // 🌟 for the fact — 💡 is the recap's explanations.
    const fact = screen.getByText('Did you know?').parentElement!;
    expect(fact).toHaveTextContent(/^🌟 Did you know\?/);
    expect(fact).not.toHaveTextContent('💡');
  });
});

describe("QuizRound — each answer counts for the kid's day (#173)", () => {
  it('every pick is noted with the question it answered, right or wrong, once', async () => {
    start(3, true);
    await playRound([true, false, true, true, false]);
    expect(noteAnswer.mock.calls.map(([question, correct]) => [question.id, correct])).toEqual([
      ['q-0', true],
      ['q-1', false],
      ['q-2', true],
      ['q-3', true],
      ['q-4', false],
    ]);
  });
});
