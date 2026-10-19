import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Question } from '../../types';

vi.mock('canvas-confetti', () => ({ default: () => {} }));

const { default: ServiceOverlay } = await import('./ServiceOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { defaultSave } = await import('../../lib/save');
const { LIBRARY_XP } = await import('../../content/items');

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
  it('a desk button under the lessons, open only after the capitals lesson, counting pages copied', () => {
    render(<ServiceOverlay service="library" npcId={null} />);
    const desk = screen.getByText('The Scriptorium').closest('button')!;
    expect(desk).toHaveTextContent('once you can type capitals');
    fireEvent.click(desk);
    expect(screen.getByText('Press any key on your keyboard to begin.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('📚 Back to the shelf'));
    expect(screen.getByText('📚 The Library')).toBeInTheDocument();
  });
});
