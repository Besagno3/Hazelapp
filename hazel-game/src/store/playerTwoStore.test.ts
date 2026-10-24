import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kid } from '../types';

const { readKidPlay } = vi.hoisted(() => ({ readKidPlay: vi.fn() }));
vi.mock('../lib/playerTwo', async (orig) => ({ ...(await orig<typeof import('../lib/playerTwo')>()), readKidPlay }));

const { usePlayerTwoStore } = await import('./playerTwoStore');
const { putAwayGame } = await import('./familyStore');

const kid = (id: string, name: string | null): Kid => ({ id, name, icon: 'fox', hasPin: true, birthYear: 2014, birthMonth: 3 });

beforeEach(() => {
  readKidPlay.mockReset();
  usePlayerTwoStore.getState().clear();
});

describe('playerTwoStore (#186)', () => {
  it('a kid is Player 2 at once; their levels, power-ups and open world follow once read', async () => {
    let answer!: (levels: object) => void;
    readKidPlay.mockReturnValue(new Promise((r) => (answer = r)));
    const picked = usePlayerTwoStore.getState().chooseKid(kid('kid-2', 'Mia'));
    expect(usePlayerTwoStore.getState()).toMatchObject({
      loading: true,
      playerTwo: { kind: 'kid', id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 3, skillLevels: {}, powerUps: {}, worldOpen: false },
    });
    answer({ skillLevels: { math: 6 }, powerUps: { scholar: 2 }, worldOpen: true });
    await picked;
    expect(usePlayerTwoStore.getState()).toMatchObject({
      loading: false,
      playerTwo: { id: 'kid-2', skillLevels: { math: 6 }, powerUps: { scholar: 2 }, worldOpen: true },
    });
  });

  it('a read that comes back after another pick is dropped', async () => {
    let answer!: (levels: object) => void;
    readKidPlay.mockReturnValue(new Promise((r) => (answer = r)));
    const picked = usePlayerTwoStore.getState().chooseKid(kid('kid-2', 'Mia'));
    usePlayerTwoStore.getState().chooseGuest('Dad', 'harder');
    answer({ skillLevels: { math: 6 }, powerUps: {}, worldOpen: true });
    await picked;
    expect(usePlayerTwoStore.getState()).toEqual(expect.objectContaining({ loading: false, playerTwo: { kind: 'guest', name: 'Dad', pace: 'harder' } }));
  });

  it('a kid with no name is "Player 2"', async () => {
    readKidPlay.mockResolvedValue({ skillLevels: {}, powerUps: {}, worldOpen: false });
    await usePlayerTwoStore.getState().chooseKid(kid('kid-2', null));
    expect(usePlayerTwoStore.getState().playerTwo).toMatchObject({ name: 'Player 2' });
  });

  it('is put away with the game (Switch player, sign-out) — co-op too', () => {
    usePlayerTwoStore.getState().chooseGuest('Dad', 'same');
    usePlayerTwoStore.getState().setCoop(true);
    putAwayGame();
    expect(usePlayerTwoStore.getState()).toMatchObject({ playerTwo: null, coop: false });
  });

  it('co-op battles only turn on with a Player 2 picked (#187)', () => {
    usePlayerTwoStore.getState().setCoop(true);
    expect(usePlayerTwoStore.getState().coop).toBe(false);
    usePlayerTwoStore.getState().chooseGuest('Dad', 'same');
    usePlayerTwoStore.getState().setCoop(true);
    expect(usePlayerTwoStore.getState().coop).toBe(true);
    // Picking someone else keeps it on, with them.
    usePlayerTwoStore.getState().chooseGuest('Mum', 'easier');
    expect(usePlayerTwoStore.getState().coop).toBe(true);
    usePlayerTwoStore.getState().setCoop(false);
    expect(usePlayerTwoStore.getState().coop).toBe(false);
  });
});
