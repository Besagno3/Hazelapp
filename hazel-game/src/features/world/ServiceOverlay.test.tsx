import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Question } from '../../types';

vi.mock('canvas-confetti', () => ({ default: () => {} }));
const sendFlow = vi.fn();
vi.mock('../../machines/gameFlow', async (orig) => ({
  ...(await orig<typeof import('../../machines/gameFlow')>()),
  sendFlow: (...args: unknown[]) => sendFlow(...args),
}));

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

describe("a Sage's Learn panel says what their own spell does (#128b)", () => {
  it('Sage Chronicle says Time Ripple costs the enemy its next turn — before and after learning it', () => {
    const { unmount } = render(<ServiceOverlay service="sage" npcId="sage-chronicle" />);
    expect(screen.getByText(/the enemy loses its next turn/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Learn Time Ripple/ })).toBeInTheDocument();
    unmount();
    useSaveStore.setState({ save: { ...useSaveStore.getState().save!, sages: ['history'] } });
    render(<ServiceOverlay service="sage" npcId="sage-chronicle" />);
    expect(screen.getByText(/the enemy loses its next turn/)).toBeInTheDocument();
    expect(screen.getByText(/is in your Spellbook/)).toBeInTheDocument();
  });

  it("each Sage's panel shows that Sage's spell, not one text for all", () => {
    render(<ServiceOverlay service="sage" npcId="sage-aria" />);
    expect(screen.getByText(/sings one ◆ back to you/)).toBeInTheDocument();
    expect(screen.queryByText(/loses its next turn/)).toBeNull();
  });
});

describe('Escape is Leave (#110o)', () => {
  it('in a shop, the inn, the Library (a question open too) and at a Sage', () => {
    for (const [service, npcId] of [['shop', 'numbria-merchant'], ['inn', null], ['library', null], ['sage', 'sage-abacus']] as const) {
      sendFlow.mockClear();
      const { unmount } = render(<ServiceOverlay service={service} npcId={npcId} />);
      if (service === 'library') fireEvent.click(screen.getByText('A bank question?'));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(sendFlow, service).toHaveBeenCalledWith({ type: 'CLOSE' });
      unmount();
    }
  });

  it('a held Escape, or any other key, does nothing', () => {
    sendFlow.mockClear();
    render(<ServiceOverlay service="inn" npcId={null} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', repeat: true });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(sendFlow).not.toHaveBeenCalled();
  });

  it("the finale's questions have nothing to cancel: Escape does nothing there", () => {
    sendFlow.mockClear();
    render(<ServiceOverlay service="name" npcId={null} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(sendFlow).not.toHaveBeenCalled();
  });
});
