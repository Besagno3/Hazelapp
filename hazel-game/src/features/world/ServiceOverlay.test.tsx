import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Question } from '../../types';

vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: ServiceOverlay } = await import('./ServiceOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { LIBRARY_XP } = await import('../../content/items');
const { TYPING_LESSONS, typingLessonFlag } = await import('../../content/typing');

const missed = (id: string, text: string): Question => ({
  id,
  topic: 'math',
  level: 2,
  text,
  options: ['Right', 'Wrong A', 'Wrong B', 'Wrong C'],
  correctIndex: 0,
});

const addXp = vi.fn();
beforeEach(() => {
  addXp.mockClear();
  useProfileStore.setState({ addXp });
  useSaveStore.setState({
    userId: null,
    status: 'ready',
    remoteError: null,
    save: {
      ...defaultSave(),
      library: [
        { question: missed('q-bank', 'A bank question?'), picked: 1 },
        { question: missed('starter-math-easy-1', 'A starter question?'), picked: 1 },
      ],
    },
  });
});

/** Open a shelf question, answer it right, and carry on. */
function beat(text: string, button: string) {
  fireEvent.click(screen.getByText(text));
  fireEvent.click(screen.getByText('Right'));
  fireEvent.click(screen.getByText(button));
}

describe('the Library — starter questions pay no XP (#153)', () => {
  it('a bank question beaten again pays its XP', () => {
    render(<ServiceOverlay service="library" npcId={null} />);
    beat('A bank question?', `🌟 +${LIBRARY_XP} XP — beaten!`);
    expect(addXp).toHaveBeenCalledWith(LIBRARY_XP);
  });

  it('a starter question beaten again leaves the shelf, with no XP and no promise of any', () => {
    render(<ServiceOverlay service="library" npcId={null} />);
    beat('A starter question?', '🌟 Beaten!');
    expect(addXp).not.toHaveBeenCalled();
    expect(useSaveStore.getState().save!.library.map((e) => e.question.id)).toEqual(['q-bank']);
  });
});

describe('the Library — the scriptorium (#159 item 5)', () => {
  it('the desk and the game look locked until their lessons (review round 2), then open', () => {
    render(<ServiceOverlay service="library" npcId={null} />);
    const desk = screen.getByText('The Scriptorium').closest('button')!;
    expect(desk).toHaveAttribute('aria-disabled', 'true');
    expect(desk).toHaveTextContent('Clear typing lesson 12 (capitals) first');
    fireEvent.click(desk);
    expect(screen.queryByText('Press any key on your keyboard to begin.')).toBeNull();
    const game = screen.getByText('Falling Leaves').closest('button')!;
    expect(game).toHaveAttribute('aria-disabled', 'true');
    expect(game).toHaveTextContent('Clear typing lesson 1 first');
    cleanup();
    const all: Record<string, boolean> = {};
    for (const l of TYPING_LESSONS) all[typingLessonFlag(l.id)] = true;
    useSaveStore.setState({ save: { ...defaultSave(), flags: all } });
    render(<ServiceOverlay service="library" npcId={null} />);
    const open = screen.getByText('The Scriptorium').closest('button')!;
    expect(open).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(open);
    expect(screen.getByText('Press any key on your keyboard to begin.')).toBeInTheDocument();
    // The gate's heading takes the focus; back on the shelf, the shelf's does (review round 7).
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'The Scriptorium' }));
    fireEvent.click(screen.getByText('📚 Back to the shelf'));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '📚 The Library' }));
    fireEvent.click(screen.getByText('Falling Leaves').closest('button')!);
    expect(screen.getByText('Press any key on your keyboard to begin.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('📚 Back to the shelf'));
    expect(screen.getByText('📚 The Library')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '📚 The Library' }));
  });
});
