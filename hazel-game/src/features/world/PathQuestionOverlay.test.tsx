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
const served = { q: riddle };
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  fetchQuestions: async () => [served.q],
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: PathQuestionOverlay } = await import('./PathQuestionOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { pathTargetId } = await import('../../content/zones');
const { useProfileStore } = await import('../../store/profileStore');
const { XP_PER_CORRECT } = await import('../../lib/level');
const { useKeyboardStore } = await import('../../store/keyboardStore');
const { PANGRAM_BONUS_COINS, charKey, pangramChest, pangramFor, typingLessonFlag } = await import('../../content/typing');
const { CHEST_COINS } = await import('../../content/items');

const moonstoneChest: PathTarget = { kind: 'chest', id: pathTargetId('echo-mine', 'chest', 8, 7), topic: 'history', zoneId: 'echo-mine' };
const plainChest: PathTarget = { kind: 'chest', id: pathTargetId('echo-mine', 'chest', 19, 2), topic: 'history', zoneId: 'echo-mine' };

function withFlags(flags: Record<string, boolean>) {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
}
/** Yarn has asked: the first tale-stone's riddle is due. */
const YARN_ASKED = { 'quest:yarn-tale:offered': true };

beforeEach(() => {
  served.q = riddle;
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

describe("PathQuestionOverlay — a scribe's lock on a pangram chest (#159 item 8)", () => {
  // The first Echo Mine cell whose chest id has a lock, and one without.
  const ids = Array.from({ length: 40 }, (_, i) => pathTargetId('echo-mine', 'chest', i % 20, Math.floor(i / 20)));
  const lockedChest: PathTarget = { kind: 'chest', id: ids.find(pangramChest)!, topic: 'history', zoneId: 'echo-mine' };
  const plainLock: PathTarget = { kind: 'chest', id: ids.find((id) => !pangramChest(id))!, topic: 'history', zoneId: 'echo-mine' };
  const capitals = { [typingLessonFlag('capitals')]: true };

  beforeEach(() => useKeyboardStore.getState().reset());

  it('with a keyboard and the capitals lesson, the sentence typed opens the chest with the bonus and no question answered', async () => {
    useKeyboardStore.getState().seen();
    useSaveStore.setState({ save: { ...defaultSave(), flags: capitals, typingAnchor: false } });
    const addXp = vi.fn();
    useProfileStore.setState({ addXp });
    render(<PathQuestionOverlay target={lockedChest} />);
    const lock = screen.getByTestId('scribe-lock');
    const sentence = pangramFor(lockedChest.id);
    // An offer first (review round 1: unfolded, the lock buried the riddle); the sentence on asking.
    expect(screen.queryByLabelText(`Type: ${sentence}`)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Type the sentence/ }));
    expect(screen.getByLabelText(`Type: ${sentence}`)).toBeInTheDocument();
    // The riddle is still there to answer instead.
    expect(await screen.findByText('Right')).toBeInTheDocument();
    for (const ch of sentence) {
      const found = charKey(ch)!;
      fireEvent.keyDown(window, { code: found.key.code, key: ch });
      fireEvent.keyUp(window, { code: found.key.code, key: ch });
    }
    expect(lock).not.toBeInTheDocument();
    expect(screen.getByTestId('scribe-lock-open')).toHaveTextContent(`A scribe's bonus: 🪙 ${PANGRAM_BONUS_COINS} more!`);
    expect(screen.queryByText('Right')).toBeNull();
    expect(screen.getByRole('heading', { name: /The lock springs open/ })).toBeInTheDocument();
    const save = useSaveStore.getState().save!;
    expect(save.openedChests).toEqual([lockedChest.id]);
    expect(save.coins).toBe(CHEST_COINS + PANGRAM_BONUS_COINS);
    expect(addXp).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Onward!' })).toBeInTheDocument();
  });

  it('the riddle answered right takes the lock with it: no second opening, no bonus (review round 1)', async () => {
    useKeyboardStore.getState().seen();
    useSaveStore.setState({ save: { ...defaultSave(), flags: capitals, typingAnchor: false } });
    render(<PathQuestionOverlay target={lockedChest} />);
    expect(screen.getByTestId('scribe-lock')).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Right'));
    expect(screen.queryByTestId('scribe-lock')).toBeNull();
    const save = useSaveStore.getState().save!;
    expect(save.openedChests).toEqual([lockedChest.id]);
    expect(save.coins).toBe(CHEST_COINS);
  });

  it('a wrong riddle answer focuses nothing while the lock is up, and the sentence still opens the chest (review round 2)', async () => {
    useKeyboardStore.getState().seen();
    useSaveStore.setState({ save: { ...defaultSave(), flags: capitals, typingAnchor: false } });
    render(<PathQuestionOverlay target={lockedChest} />);
    fireEvent.click(screen.getByRole('button', { name: /Type the sentence/ }));
    fireEvent.click(await screen.findByText('Wrong A'));
    const back = screen.getByRole('button', { name: /come back/ });
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).not.toBe(back);
    // A Space for the pangram's space is the line's, never the button's.
    const sentence = pangramFor(lockedChest.id);
    for (const ch of sentence) {
      const found = charKey(ch)!;
      fireEvent.keyDown(window, { code: found.key.code, key: ch });
      fireEvent.keyUp(window, { code: found.key.code, key: ch });
    }
    expect(screen.getByTestId('scribe-lock-open')).toBeInTheDocument();
    expect(useSaveStore.getState().save!.openedChests).toEqual([lockedChest.id]);
  });

  it('no lock without a keyboard, before the capitals lesson, or on a chest that has none', async () => {
    useSaveStore.setState({ save: { ...defaultSave(), flags: capitals } });
    const { unmount } = render(<PathQuestionOverlay target={lockedChest} />);
    expect(screen.queryByTestId('scribe-lock')).toBeNull();
    unmount();
    useKeyboardStore.getState().seen();
    withFlags({});
    const second = render(<PathQuestionOverlay target={lockedChest} />);
    expect(screen.queryByTestId('scribe-lock')).toBeNull();
    second.unmount();
    useSaveStore.setState({ save: { ...defaultSave(), flags: capitals } });
    render(<PathQuestionOverlay target={plainLock} />);
    expect(screen.queryByTestId('scribe-lock')).toBeNull();
    expect(await screen.findByText('Right')).toBeInTheDocument();
  });
});
