import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Kid } from '../types';

const { readKidLevels } = vi.hoisted(() => ({ readKidLevels: vi.fn() }));
vi.mock('../lib/playerTwo', async (orig) => ({ ...(await orig<typeof import('../lib/playerTwo')>()), readKidLevels }));

const { usePlayerTwoStore } = await import('./playerTwoStore');
const { putAwayGame } = await import('./familyStore');

const kid = (id: string, name: string | null): Kid => ({ id, name, icon: 'fox', hasPin: true, birthYear: 2014, birthMonth: 3 });

beforeEach(() => {
  readKidLevels.mockReset();
  usePlayerTwoStore.getState().clear();
});

describe('playerTwoStore (#177)', () => {
  it('a kid is Player 2 at once; their levels follow once read', async () => {
    let answer!: (levels: object) => void;
    readKidLevels.mockReturnValue(new Promise((r) => (answer = r)));
    const picked = usePlayerTwoStore.getState().chooseKid(kid('kid-2', 'Mia'));
    expect(usePlayerTwoStore.getState()).toMatchObject({
      loading: true,
      playerTwo: { kind: 'kid', id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 3, skillLevels: {} },
    });
    answer({ math: 6 });
    await picked;
    expect(usePlayerTwoStore.getState()).toMatchObject({ loading: false, playerTwo: { id: 'kid-2', skillLevels: { math: 6 } } });
  });

  it('levels that come back after another pick are dropped', async () => {
    let answer!: (levels: object) => void;
    readKidLevels.mockReturnValue(new Promise((r) => (answer = r)));
    const picked = usePlayerTwoStore.getState().chooseKid(kid('kid-2', 'Mia'));
    usePlayerTwoStore.getState().chooseGuest('Dad', 'harder');
    answer({ math: 6 });
    await picked;
    expect(usePlayerTwoStore.getState()).toEqual(expect.objectContaining({ loading: false, playerTwo: { kind: 'guest', name: 'Dad', pace: 'harder' } }));
  });

  it('a kid with no name is "Player 2"', async () => {
    readKidLevels.mockResolvedValue({});
    await usePlayerTwoStore.getState().chooseKid(kid('kid-2', null));
    expect(usePlayerTwoStore.getState().playerTwo).toMatchObject({ name: 'Player 2' });
  });

  it('is put away with the game (Switch player, sign-out)', () => {
    usePlayerTwoStore.getState().chooseGuest('Dad', 'same');
    putAwayGame();
    expect(usePlayerTwoStore.getState().playerTwo).toBeNull();
  });
});
