import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
vi.mock('../../lib/questions', async (orig) => ({
  ...(await orig<typeof import('../../lib/questions')>()),
  fetchQuestions: async () => [riddle],
}));
vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: PathQuestionOverlay } = await import('./PathQuestionOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { pathTargetId } = await import('../../content/zones');

const moonstoneChest: PathTarget = { kind: 'chest', id: pathTargetId('echo-mine', 'chest', 8, 7), topic: 'history', zoneId: 'echo-mine' };
const plainChest: PathTarget = { kind: 'chest', id: pathTargetId('echo-mine', 'chest', 19, 2), topic: 'history', zoneId: 'echo-mine' };

function withFlags(flags: Record<string, boolean>) {
  useSaveStore.setState({ userId: null, save: { ...defaultSave(), flags }, status: 'ready', remoteError: null });
}

beforeEach(() => withFlags({}));

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
