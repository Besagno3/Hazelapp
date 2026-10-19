import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PathTarget, Question } from '../../types';

// One riddle; the first option is right.
const riddle: Question = {
  id: 'chest-q',
  topic: 'history',
  level: 3,
  text: 'Which came first?',
  options: ['Right', 'Wrong A', 'Wrong B', 'Wrong C'],
  correctIndex: 0,
  explanation: 'Because it did.',
};
// The question served; a test may swap in a starter one (#153).
const served: { q: Question | null; fail?: Error } = { q: riddle };
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  fetchQuestions: async () => {
    if (served.fail) throw served.fail;
    return served.q ? [served.q] : [];
  },
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../machines/gameFlow')>()),
  sendFlow: (...args: unknown[]) => sendFlow(...args),
}));

const { default: PathQuestionOverlay } = await import('./PathQuestionOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { pathTargetId } = await import('../../content/zones');
const { useProfileStore } = await import('../../store/profileStore');
const { XP_PER_CORRECT } = await import('../../lib/level');
const { xpBonusPerCorrect } = await import('../../lib/powerups');

const moonstoneChest: PathTarget = { kind: 'chest', id: pathTargetId('echo-mine', 'chest', 8, 7), topic: 'history', zoneId: 'echo-mine' };
const plainChest: PathTarget = { kind: 'chest', id: pathTargetId('echo-mine', 'chest', 19, 2), topic: 'history', zoneId: 'echo-mine' };

function withFlags(flags: Record<string, boolean>) {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
}
/** Yarn has asked: the first tale-stone's riddle is due. */
const YARN_ASKED = { 'quest:yarn-tale:offered': true };

beforeEach(() => {
  served.q = riddle;
  served.fail = undefined;
  sendFlow.mockClear();
  withFlags({});
});

describe('PathQuestionOverlay — starter questions pay no XP (#153)', () => {
  it('a right bank answer pays XP; a right starter answer opens the chest all the same, but pays none', async () => {
    const addXp = vi.fn();
    useProfileStore.setState({ addXp });
    render(<PathQuestionOverlay target={plainChest} />);
    fireEvent.click(await screen.findByText('Right'));
    expect(addXp).toHaveBeenCalledWith(XP_PER_CORRECT);
  });

  it('…and a starter one opens it with no XP', async () => {
    const addXp = vi.fn();
    useProfileStore.setState({ addXp });
    served.q = { ...riddle, id: 'starter-history-easy-1' };
    render(<PathQuestionOverlay target={plainChest} />);
    fireEvent.click(await screen.findByText('Right'));
    expect(useSaveStore.getState().save!.openedChests).toEqual([plainChest.id]);
    expect(addXp).not.toHaveBeenCalled();
  });
});

describe('PathQuestionOverlay — the Scholar bonus (#102j)', () => {
  it('a Scholar hero gets the bonus on top of a right answer, as in battles and quizzes', async () => {
    const addXp = vi.fn();
    useProfileStore.setState({ profile: { birthYear: 2017, birthMonth: 1, powerUps: { scholar: 2 } } as never, addXp });
    render(<PathQuestionOverlay target={plainChest} />);
    fireEvent.click(await screen.findByText('Right'));
    expect(addXp).toHaveBeenCalledWith(XP_PER_CORRECT + xpBonusPerCorrect({ scholar: 2 }));
    expect(xpBonusPerCorrect({ scholar: 2 })).toBeGreaterThan(0);
    useProfileStore.setState({ profile: null });
  });
});

describe('PathQuestionOverlay — key-item chests (#75 item 13)', () => {
  it('a right answer opens the chest: coins and the Moonstone, and — before Moss has asked — who wants it, above the button', async () => {
    render(<PathQuestionOverlay target={moonstoneChest} />);
    const right = await screen.findByText('Right');
    const status = screen.getByRole('status'); // the live region is there before the answer
    expect(status).toHaveTextContent('');
    fireEvent.click(right);
    expect(status).toHaveTextContent(/Hermit Moss.*Moonstone/);
    const button = screen.getByRole('button', { name: /The chest pops open — 25 coins and the 🌙 Moonstone!/ });
    expect(status.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the note comes first
    const save = useSaveStore.getState().save!;
    expect(save.questItems).toEqual(['moonstone']);
    expect(save.coins).toBe(25);
    expect(save.openedChests).toEqual([moonstoneChest.id]);
  });

  it('a wrong answer opens nothing and says nothing', async () => {
    render(<PathQuestionOverlay target={moonstoneChest} />);
    fireEvent.click(await screen.findByText('Wrong A'));
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(useSaveStore.getState().save!.questItems).toEqual([]);
    expect(screen.getByRole('button', { name: /come back/ })).toBeInTheDocument();
  });

  it('no note once Moss has asked, or for an ordinary chest', async () => {
    withFlags({ 'quest:hermit-moonstone:offered': true });
    const { unmount } = render(<PathQuestionOverlay target={moonstoneChest} />);
    fireEvent.click(await screen.findByText('Right'));
    expect(screen.getByRole('status')).toHaveTextContent('');
    unmount();
    withFlags({});
    render(<PathQuestionOverlay target={plainChest} />);
    fireEvent.click(await screen.findByText('Right'));
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.getByRole('button', { name: /25 coins! 🪙/ })).toBeInTheDocument();
  });
});

describe("PathQuestionOverlay — a tale-stone's riddle (#75 item 15e)", () => {
  const stone: PathTarget = { kind: 'riddle', id: 'yarn-stone-1', topic: 'words', zoneId: 'story-reef' };

  it('a right answer lights the stone (its step) and says where the next one is, above the button', async () => {
    withFlags(YARN_ASKED);
    render(<PathQuestionOverlay target={stone} />);
    expect(screen.getByRole('heading', { name: /tale-stone asks a word question/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Right'));
    expect(useSaveStore.getState().save!.flags['quest-step:yarn-stone-1']).toBe(true);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^📜 Chapter 1:.*over the road, to the tide pool near the top/);
    const button = screen.getByRole('button', { name: /The stone glows!/ });
    expect(status.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // No coins: a stone isn't a chest.
    expect(useSaveStore.getState().save!.coins).toBe(0);
  });

  it('a wrong answer leaves it dim and says to ask again (round 1)', async () => {
    withFlags(YARN_ASKED);
    render(<PathQuestionOverlay target={stone} />);
    const wrong = await screen.findByText('Wrong B');
    expect(screen.getByRole('status')).toHaveTextContent('');
    fireEvent.click(wrong);
    expect(useSaveStore.getState().save!.flags['quest-step:yarn-stone-1']).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent('The stone stays dim. Want another question?');
    // Another question right here (round 3): a new one loads; "Later" walks away.
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ask me another/ }));
    fireEvent.click(await screen.findByText('Right'));
    expect(useSaveStore.getState().save!.flags['quest-step:yarn-stone-1']).toBe(true);
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
  });

  it('focus goes to the button that carries on, and comes back into the dialog with a new question (round 4)', async () => {
    withFlags(YARN_ASKED);
    render(<PathQuestionOverlay target={stone} />);
    fireEvent.click(await screen.findByText('Wrong A'));
    const again = screen.getByRole('button', { name: /Ask me another/ });
    await waitFor(() => expect(document.activeElement).toBe(again));
    fireEvent.click(again);
    await screen.findByText('Right');
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('a stale riddle (its step no longer due) finishes nothing, and says nothing about glowing (rounds 1–2)', async () => {
    render(<PathQuestionOverlay target={stone} />); // Yarn hasn't asked
    fireEvent.click(await screen.findByText('Right'));
    expect(useSaveStore.getState().save!.flags['quest-step:yarn-stone-1']).toBeUndefined();
    expect(screen.queryByRole('button', { name: /The stone glows/ })).toBeNull();
    // …and no "stays dim" after a right answer either (round 3).
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('a wrong answer to a stale riddle offers nothing more — just come back (round 4)', async () => {
    render(<PathQuestionOverlay target={stone} />); // Yarn hasn't asked
    fireEvent.click(await screen.findByText('Wrong A'));
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(screen.queryByRole('button', { name: /Ask me another/ })).toBeNull();
    expect(screen.getByRole('button', { name: /come back/ })).toBeInTheDocument();
  });
});

describe('PathQuestionOverlay — Escape is "Later" or "Walk away" while one is offered (#159 r2)', () => {
  const stone: PathTarget = { kind: 'riddle', id: 'yarn-stone-1', topic: 'words', zoneId: 'story-reef' };
  const escape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

  it('over a question still to answer it does nothing — nothing to cancel', async () => {
    withFlags(YARN_ASKED);
    render(<PathQuestionOverlay target={stone} />);
    await screen.findByText('Right');
    escape();
    expect(sendFlow).not.toHaveBeenCalled();
    expect(screen.getByText('Which came first?')).toBeInTheDocument();
  });

  it('after a tale-stone miss, Escape is "Later"', async () => {
    withFlags(YARN_ASKED);
    render(<PathQuestionOverlay target={stone} />);
    fireEvent.click(await screen.findByText('Wrong A'));
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
    escape();
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });

  it('when no question came, Escape is "Walk away"', async () => {
    served.q = null;
    render(<PathQuestionOverlay target={plainChest} />);
    expect(await screen.findByRole('button', { name: 'Walk away' })).toBeInTheDocument();
    escape();
    expect(sendFlow).toHaveBeenCalledWith({ type: 'CLOSE' });
  });
});

describe('PathQuestionOverlay — a question that fails to load (#130 S6)', () => {
  it('says so in plain words with Try again and Walk away — the raw error goes to the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      served.fail = new Error('Edge Function returned a non-2xx status code');
      render(<PathQuestionOverlay target={plainChest} />);
      expect(await screen.findByText('The question didn\'t load. Tap "Try again".')).toBeInTheDocument();
      expect(screen.queryByText(/non-2xx|Edge Function/)).toBeNull();
      expect(screen.getByRole('button', { name: 'Walk away' })).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith('Path question failed:', 'Edge Function returned a non-2xx status code');
      served.fail = undefined;
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByText('Which came first?')).toBeInTheDocument();
    } finally {
      warn.mockRestore();
    }
  });
});
