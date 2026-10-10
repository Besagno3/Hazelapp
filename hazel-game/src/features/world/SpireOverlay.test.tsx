import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('canvas-confetti', () => ({ default: Object.assign(vi.fn(), { reset: vi.fn() }) }));
vi.mock('../../lib/audio', () => ({ playMusic: vi.fn(), sfx: vi.fn() }));
vi.mock('../../lib/questions', () => ({
  fetchQuestions: vi.fn(async (topic: string, _age: number, level: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${topic}-${i}`,
      topic,
      level,
      text: `${i} + 2?`,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 0,
    })),
  ),
}));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', () => ({ sendFlow: (e: unknown) => sendFlow(e) }));

const { default: SpireOverlay } = await import('./SpireOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { defaultSave } = await import('../../lib/save');
const { TOPIC_REGISTRY, crystalFlag } = await import('../../content/topics');

/** Read through the Spire's opening lines (each panel ignores a tap in its first 250 ms). */
async function readUntil(name: string | RegExp) {
  for (let i = 0; i < 12 && !screen.queryByRole('button', { name }); i++) {
    await act(() => new Promise((r) => setTimeout(r, 260)));
    const next = screen.queryByText('▼ tap to continue');
    if (next) fireEvent.click(next);
  }
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeInTheDocument());
}

describe('leaving the Spire asks first (#75 item 14b review)', () => {
  beforeEach(() => {
    sendFlow.mockClear();
    useSaveStore.setState({
      userId: null,
      status: 'ready',
      save: { ...defaultSave(), avatarId: 'a1', flags: Object.fromEntries(TOPIC_REGISTRY.map((t) => [crystalFlag(t.id), true])) },
      flush: vi.fn(async () => {}),
    });
  });

  it('in the HUD row, Leave opens "Leave the Spire?" — Keep climbing goes back to the floor, Leave says the climb starts over', async () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    render(<SpireOverlay hudSlot={slot} />);
    await readUntil('🚪 Leave the Spire');
    // Exploring: the climb's status sits in the HUD slot.
    expect(slot.textContent).toContain('Seals 0/');
    expect(screen.getByRole('img', { name: '4 of 4 candle-lights left' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave the Spire' }));
    expect(screen.getByRole('alertdialog', { name: 'Leave the Spire?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🗼 Keep climbing' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '🗼 Keep climbing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: '🚪 Leave the Spire' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave the Spire' }));
    fireEvent.click(screen.getByRole('button', { name: '🚪 Leave' }));
    expect(screen.getByText(/next time, the climb starts again from the first floor/)).toBeInTheDocument();
    expect(sendFlow).not.toHaveBeenCalled();
    slot.remove();
  });
});
