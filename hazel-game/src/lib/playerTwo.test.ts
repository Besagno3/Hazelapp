import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Kid } from '../types';

// The `profiles` read, stood in for: `row` answers it (or `error`, or never).
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: read }) }) }) },
}));

const { guestName, kidName, playerOneSeat, playerTwoChoices, playerTwoLook, playerTwoSeat, readKidLevels, GUEST_NAME, LEVELS_WAIT_MS } = await import('./playerTwo');
const { profileKey } = await import('./profile');

const kid = (id: string, name: string | null, birthYear = 2014): Kid => ({ id, name, icon: 'fox', hasPin: true, birthYear, birthMonth: 1 });
const NOW = new Date(2026, 9, 22);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  read.mockReset();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('Player 2 (#177)', () => {
  it('the kid playing plays at their own age and level for the topic', () => {
    const one = playerOneSeat({ name: 'Ada', icon: 'panda' }, { birthYear: 2019, birthMonth: 1, skillLevels: { math: 3 } }, 7, 'math');
    expect(one).toEqual({ name: 'Ada', icon: '🐼', kid: null, age: 7, skillLevel: 3 });
    // A topic never played starts where a player of their age would (7 → level 2).
    expect(playerOneSeat({ name: 'Ada', icon: 'panda' }, null, 7, 'space').skillLevel).toBe(2);
    expect(playerOneSeat(undefined, null, 7, 'math').name).toBe('Player 1');
  });

  it("a family kid plays as themselves: their own id, age and level — the server pitches to their age", () => {
    const one = playerOneSeat({ name: 'Ada', icon: 'panda' }, null, 7, 'math');
    const two = playerTwoSeat(
      { kind: 'kid', id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 1, skillLevels: { math: 5 } },
      one,
      'math',
    );
    expect(two).toEqual({ name: 'Mia', icon: '🦊', kid: 'kid-2', age: 12, skillLevel: 5 });
  });

  it("a guest plays under the kid playing (their age, B8), at the kid's level moved by their pace", () => {
    const one = playerOneSeat({ name: 'Ada', icon: 'panda' }, { birthYear: 2019, birthMonth: 1, skillLevels: { math: 3 } }, 7, 'math');
    const guest = (pace: 'easier' | 'same' | 'harder', name = 'Mom') => playerTwoSeat({ kind: 'guest', name, pace }, one, 'math');
    expect(guest('same')).toEqual({ name: 'Mom', icon: '🙂', kid: null, age: 7, skillLevel: 3 });
    expect(guest('harder').skillLevel).toBe(5);
    expect(guest('easier').skillLevel).toBe(1);
    // Never past the ends of the scale.
    const top = playerOneSeat({ name: 'Ada', icon: 'panda' }, { birthYear: 2019, birthMonth: 1, skillLevels: { math: 9 } }, 7, 'math');
    expect(playerTwoSeat({ kind: 'guest', name: '', pace: 'harder' }, top, 'math').skillLevel).toBe(10);
    expect(guest('same', '   ').name).toBe(GUEST_NAME);
  });

  it('names are tidied: trimmed, never past 20 letters, a default when empty', () => {
    expect(guestName('  Grandpa Joe  ')).toBe('Grandpa Joe');
    expect(guestName('')).toBe('Guest');
    expect(guestName('A very long name indeed for a guest')).toHaveLength(20);
    expect(kidName({ name: '  ' }, 'Player 1')).toBe('Player 1');
    expect(kidName({ name: 'Sam' }, 'Player 1')).toBe('Sam');
  });

  it("Player 2's name and emoji for the screen (#178)", () => {
    expect(playerTwoLook({ kind: 'guest', name: '  ', pace: 'same' })).toEqual({ name: 'Guest', icon: '🙂' });
    expect(playerTwoLook({ kind: 'kid', id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 1, skillLevels: {} })).toEqual({ name: 'Mia', icon: '🦊' });
  });

  it('Player 2 can be any kid of the family but the one playing', () => {
    const kids = [kid('kid-1', 'Ada'), kid('kid-2', 'Mia'), kid('kid-3', 'Sam')];
    expect(playerTwoChoices(kids, 'kid-2').map((k) => k.id)).toEqual(['kid-1', 'kid-3']);
    expect(playerTwoChoices([kid('kid-1', 'Ada')], 'kid-1')).toEqual([]);
  });
});

describe("readKidLevels — Player 2's levels, read only (#177)", () => {
  it('reads their row, keeping only real numbers', async () => {
    read.mockResolvedValue({ data: { skill_levels: { math: 6, space: 'x', science: Number.NaN, history: 2 } }, error: null });
    expect(await readKidLevels('kid-2')).toEqual({ math: 6, history: 2 });
  });

  it("…falls back to this device's copy when the row can't be read", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(profileKey('kid-2'), JSON.stringify({ id: 'kid-2', skillLevels: { math: 4 } }));
    read.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    expect(await readKidLevels('kid-2')).toEqual({ math: 4 });
    expect(warn).toHaveBeenCalledWith("Player 2's levels didn't load — using this device's copy:", 'permission denied');
    warn.mockRestore();
  });

  it('…and never waits for ever: a read that hangs gives way after LEVELS_WAIT_MS', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    read.mockReturnValue(new Promise(() => {}));
    const levels = readKidLevels('kid-2');
    await vi.advanceTimersByTimeAsync(LEVELS_WAIT_MS);
    // No copy on this device: every topic starts where a player of their age would.
    expect(await levels).toEqual({});
    warn.mockRestore();
  });
});
