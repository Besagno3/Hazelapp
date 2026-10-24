import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Kid } from '../types';

// The `profiles` and `saves` reads, stood in for: each answers a row (or an error, or never).
const { profileRead, saveRead } = vi.hoisted(() => ({ profileRead: vi.fn(), saveRead: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: table === 'profiles' ? profileRead : saveRead }) }) }),
  },
}));

const { guestName, kidName, playerOneSeat, playerTwoChoices, playerTwoLook, playerTwoSeat, readKidPlay, seatXpPerRight, GUEST_NAME, LEVELS_WAIT_MS } =
  await import('./playerTwo');
const { profileKey } = await import('./profile');
const { saveKey } = await import('./save');

const kid = (id: string, name: string | null, birthYear = 2014): Kid => ({ id, name, icon: 'fox', hasPin: true, birthYear, birthMonth: 1 });
const NOW = new Date(2026, 9, 22);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  profileRead.mockReset();
  saveRead.mockReset();
  saveRead.mockResolvedValue({ data: { world: true }, error: null });
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('Player 2 (#186)', () => {
  it('the kid playing plays at their own age and level for the topic', () => {
    const one = playerOneSeat({ name: 'Ada', icon: 'panda' }, { birthYear: 2019, birthMonth: 1, skillLevels: { math: 3 } }, 7, 'math');
    expect(one).toEqual({ name: 'Ada', icon: '🐼', kid: null, age: 7, skillLevel: 3, xpPerRight: 0, worldOpen: false });
    // A topic never played starts where a player of their age would (7 → level 2).
    expect(playerOneSeat({ name: 'Ada', icon: 'panda' }, null, 7, 'space').skillLevel).toBe(2);
    expect(playerOneSeat(undefined, null, 7, 'math').name).toBe('Player 1');
  });

  it("a family kid plays as themselves: their own id, age and level — the server pitches to their age", () => {
    const one = playerOneSeat({ name: 'Ada', icon: 'panda' }, null, 7, 'math');
    const two = playerTwoSeat(
      { kind: 'kid', id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 1, skillLevels: { math: 5 }, powerUps: {}, worldOpen: true },
      one,
      'math',
    );
    expect(two).toEqual({ name: 'Mia', icon: '🦊', kid: 'kid-2', age: 12, skillLevel: 5, xpPerRight: 10, worldOpen: true });
  });

  it('XP a right answer: 10 and the Scholar bonus, once the world is open; a guest earns none', () => {
    expect(seatXpPerRight({}, true)).toBe(10);
    expect(seatXpPerRight({ scholar: 2 }, true)).toBe(20);
    expect(seatXpPerRight({ scholar: 2 }, false)).toBe(0);
    const one = playerOneSeat({ name: 'Ada', icon: 'panda' }, { birthYear: 2019, birthMonth: 1, skillLevels: {}, powerUps: { scholar: 1 } }, 7, 'math', true);
    expect(one).toMatchObject({ xpPerRight: 15, worldOpen: true });
    expect(playerTwoSeat({ kind: 'guest', name: 'Dad', pace: 'same' }, one, 'math')).toMatchObject({ xpPerRight: 0, worldOpen: false });
    const closed = playerTwoSeat(
      { kind: 'kid', id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 1, skillLevels: {}, powerUps: { scholar: 3 }, worldOpen: false },
      one,
      'math',
    );
    expect(closed).toMatchObject({ xpPerRight: 0, worldOpen: false });
  });

  it("a guest plays under the kid playing (their age, B8), at the kid's level moved by their pace", () => {
    const one = playerOneSeat({ name: 'Ada', icon: 'panda' }, { birthYear: 2019, birthMonth: 1, skillLevels: { math: 3 } }, 7, 'math');
    const guest = (pace: 'easier' | 'same' | 'harder', name = 'Mom') => playerTwoSeat({ kind: 'guest', name, pace }, one, 'math');
    expect(guest('same')).toEqual({ name: 'Mom', icon: '🙂', kid: null, age: 7, skillLevel: 3, xpPerRight: 0, worldOpen: false });
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

  it("Player 2's name and emoji for the screen (#187)", () => {
    expect(playerTwoLook({ kind: 'guest', name: '  ', pace: 'same' })).toEqual({ name: 'Guest', icon: '🙂' });
    const mia = { kind: 'kid' as const, id: 'kid-2', name: 'Mia', icon: 'fox', birthYear: 2014, birthMonth: 1, skillLevels: {}, powerUps: {}, worldOpen: true };
    expect(playerTwoLook(mia)).toEqual({ name: 'Mia', icon: '🦊' });
  });

  it('Player 2 can be any kid of the family but the one playing', () => {
    const kids = [kid('kid-1', 'Ada'), kid('kid-2', 'Mia'), kid('kid-3', 'Sam')];
    expect(playerTwoChoices(kids, 'kid-2').map((k) => k.id)).toEqual(['kid-1', 'kid-3']);
    expect(playerTwoChoices([kid('kid-1', 'Ada')], 'kid-1')).toEqual([]);
  });
});

describe("readKidPlay — what Player 2 plays with, read only (#186)", () => {
  it('reads their levels and power-ups (real numbers only) and whether their world is open', async () => {
    profileRead.mockResolvedValue({
      data: { skill_levels: { math: 6, space: 'x', science: Number.NaN, history: 2 }, power_ups: { scholar: 2, attack: 'lots' } },
      error: null,
    });
    expect(await readKidPlay('kid-2')).toEqual({ skillLevels: { math: 6, history: 2 }, powerUps: { scholar: 2 }, worldOpen: true });
    saveRead.mockResolvedValue({ data: { world: null }, error: null });
    expect((await readKidPlay('kid-2')).worldOpen).toBe(false);
    saveRead.mockResolvedValue({ data: null, error: null });
    expect((await readKidPlay('kid-2')).worldOpen).toBe(false);
  });

  it("…falls back to this device's copies when the rows can't be read", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(profileKey('kid-2'), JSON.stringify({ id: 'kid-2', skillLevels: { math: 4 }, powerUps: { scholar: 1 } }));
    localStorage.setItem(saveKey('kid-2'), JSON.stringify({ worldUnlocked: true }));
    profileRead.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    saveRead.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await readKidPlay('kid-2')).toEqual({ skillLevels: { math: 4 }, powerUps: { scholar: 1 }, worldOpen: true });
    expect(warn).toHaveBeenCalledWith("Player 2's levels didn't load — using this device's copy:", 'permission denied');
    expect(warn).toHaveBeenCalledWith("Player 2's save didn't load — using this device's copy:", 'offline');
    // No copy of their save here either: whether their world is open is unknown (no XP, and the screens say why).
    localStorage.removeItem(saveKey('kid-2'));
    expect((await readKidPlay('kid-2')).worldOpen).toBeNull();
    warn.mockRestore();
  });

  it('…and never waits for ever: reads that hang give way after LEVELS_WAIT_MS (no copy: no XP rather than XP not earned)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    profileRead.mockReturnValue(new Promise(() => {}));
    saveRead.mockReturnValue(new Promise(() => {}));
    const play = readKidPlay('kid-2');
    await vi.advanceTimersByTimeAsync(LEVELS_WAIT_MS);
    // No copy on this device: every topic starts where a player of their age would, and no XP — the world unknown, said so (#188 review).
    expect(await play).toEqual({ skillLevels: {}, powerUps: {}, worldOpen: null });
    warn.mockRestore();
  });
});
