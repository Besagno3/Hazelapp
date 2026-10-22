import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import type { Kid } from '../../types';

const { readKidPlay } = vi.hoisted(() => ({ readKidPlay: vi.fn() }));
vi.mock('../../lib/playerTwo', async (orig) => ({ ...(await orig<typeof import('../../lib/playerTwo')>()), readKidPlay }));

const { default: MenuOverlay } = await import('./MenuOverlay');
const { useSaveStore } = await import('../../store/saveStore');
const { useProfileStore } = await import('../../store/profileStore');
const { useFamilyStore } = await import('../../store/familyStore');
const { usePlayerTwoStore } = await import('../../store/playerTwoStore');
const { defaultSave } = await import('../../lib/save');

const kid = (id: string, name: string, icon: string): Kid => ({ id, name, icon, hasPin: true, birthYear: 2015, birthMonth: 1 });
// Mia's PIN is 4821.
const checkKidPin = vi.fn(async (_id: string, pin: string) => ({ ok: pin === '4821', triesLeft: 4, waitSeconds: 0, limited: true }));
const pinLocks = vi.fn(async () => null);

async function typePin(pin: string) {
  for (const d of pin) await act(async () => fireEvent.click(screen.getByRole('button', { name: d })));
}

beforeEach(() => {
  readKidPlay.mockReset();
  readKidPlay.mockResolvedValue({ skillLevels: { math: 5 }, powerUps: {}, worldOpen: true });
  useProfileStore.setState({ profile: null });
  useSaveStore.setState({ userId: null, status: 'ready', remoteError: null, save: defaultSave() });
  useFamilyStore.setState({ kids: [kid('kid-1', 'Ada', 'panda'), kid('kid-2', 'Mia', 'fox')], activeKidId: 'kid-1', checkKidPin, pinLocks });
  usePlayerTwoStore.getState().clear();
});

describe('📜 Menu → 👥 Play together (#178)', () => {
  it('off, one row says what it is; tapped, it asks who — and turns on once Player 2 is picked', async () => {
    render(<MenuOverlay />);
    const panel = screen.getByTestId('coop-panel');
    expect(panel).toHaveTextContent('A friend or family member plays your companion in battles');
    fireEvent.click(within(panel).getByRole('button', { name: /Two players/ }));
    expect(within(panel).getByText("Who's playing with Ada?")).toBeInTheDocument();
    expect(within(panel).getByText(/They play .*Ember\. A family player earns XP for their own right answers; a guest plays just for fun\./)).toBeInTheDocument();
    const go = within(panel).getByRole('button', { name: '👥 Play together!' });
    expect(go).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(go);
    expect(usePlayerTwoStore.getState().coop).toBe(false);

    fireEvent.click(within(panel).getByRole('button', { name: /Mia/ }));
    // Mia types her PIN; "Play together!" waits meanwhile.
    expect(within(panel).getByTestId('player-two-pin')).toHaveTextContent('Hi, Mia! Type your PIN.');
    expect(within(panel).queryByRole('button', { name: '👥 Play together!' })).toBeNull();
    await typePin('4821');
    await waitFor(() => expect(within(panel).getByRole('button', { name: '👥 Play together!' })).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.click(within(panel).getByRole('button', { name: '👥 Play together!' }));
    expect(usePlayerTwoStore.getState().coop).toBe(true);
    expect(panel).toHaveTextContent("🦊 Mia plays 🐉 Ember in battles: after Ada's move, they pick theirs — each with a question at their own level.");
  });

  it('on, "Stop playing together" turns it off (Player 2 is kept for next time)', () => {
    usePlayerTwoStore.getState().chooseGuest('Dad', 'same');
    usePlayerTwoStore.getState().setCoop(true);
    render(<MenuOverlay />);
    const panel = screen.getByTestId('coop-panel');
    expect(panel).toHaveTextContent('🙂 Dad plays');
    fireEvent.click(within(panel).getByRole('button', { name: 'Stop playing together' }));
    expect(usePlayerTwoStore.getState()).toMatchObject({ coop: false, playerTwo: { kind: 'guest', name: 'Dad' } });
    expect(within(panel).getByRole('button', { name: /Two players/ })).toBeInTheDocument();
  });

  it('"Not now" closes the question with nothing changed', () => {
    render(<MenuOverlay />);
    const panel = screen.getByTestId('coop-panel');
    fireEvent.click(within(panel).getByRole('button', { name: /Two players/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Not now' }));
    expect(within(panel).queryByText("Who's playing with Ada?")).toBeNull();
    expect(usePlayerTwoStore.getState().coop).toBe(false);
  });
});
