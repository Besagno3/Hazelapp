import { describe, it, expect, afterEach, vi } from 'vitest';
import { bandFor, claimPage, claimRound, pagesFound, rememberBand, rememberedBand, starsEarned, starsFor } from './minigames';
import { MINIGAMES, pageFlag, starFlag } from '../content/minigames';
import { MINIGAME_PAGE_XP, MINIGAME_STAR_COINS, MINIGAME_STAR_XP } from '../content/items';
import { defaultSave } from './save';
import type { SaveData } from '../types';

const ID = 'potion-lab' as const;
const TOTAL = MINIGAMES[ID].pages;

function saveWith(pages: number, extra: Record<string, boolean> = {}): SaveData {
  const flags: Record<string, boolean> = { ...extra };
  for (let i = 0; i < pages; i++) flags[pageFlag(ID, `p${i}`)] = true;
  return { ...defaultSave(), flags };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('bandFor (docs/DESIGN-MINIGAMES.md §3.3)', () => {
  it('1–3 Gentle, 4–6 Medium, 7–10 Tricky', () => {
    expect([1, 2, 3].map(bandFor)).toEqual(['gentle', 'gentle', 'gentle']);
    expect([4, 5, 6].map(bandFor)).toEqual(['medium', 'medium', 'medium']);
    expect([7, 8, 9, 10].map(bandFor)).toEqual(['tricky', 'tricky', 'tricky', 'tricky']);
  });
});

describe('stars (§3.4)', () => {
  it('★ the first round, ★ half the collection, ★ all of it', () => {
    expect(starsFor(false, 0, 12)).toEqual([]);
    expect(starsFor(true, 0, 12)).toEqual([1]);
    expect(starsFor(false, 5, 12)).toEqual([]);
    expect(starsFor(false, 6, 12)).toEqual([2]);
    expect(starsFor(true, 12, 12)).toEqual([1, 2, 3]);
    // An odd collection: half rounds up.
    expect(starsFor(false, 4, 9)).toEqual([]);
    expect(starsFor(false, 5, 9)).toEqual([2]);
  });

  it('reads pages and stars from the flags, ignoring other games and unset flags', () => {
    const flags = { ...saveWith(3).flags, [pageFlag(ID, 'off')]: false, 'mg:other:page:x': true, [starFlag(ID, 1)]: true };
    expect(pagesFound(flags, ID).sort()).toEqual(['p0', 'p1', 'p2']);
    expect(starsEarned(flags, ID)).toBe(1);
  });
});

describe('claimPage', () => {
  it('saves a new page and pays its XP once', () => {
    const first = claimPage(saveWith(0), ID, 'lemon');
    expect(first.save.flags[pageFlag(ID, 'lemon')]).toBe(true);
    expect(first).toMatchObject({ xp: MINIGAME_PAGE_XP, coins: 0, pages: ['lemon'], stars: [] });
    const again = claimPage(first.save, ID, 'lemon');
    expect(again.save).toBe(first.save);
    expect(again).toMatchObject({ xp: 0, coins: 0, pages: [], stars: [] });
  });

  it('the page that fills half the collection earns star 2, the last one star 3 — with their XP and coins', () => {
    const half = claimPage(saveWith(TOTAL / 2 - 1), ID, 'last-of-half');
    expect(half.stars).toEqual([2]);
    expect(half.xp).toBe(MINIGAME_PAGE_XP + MINIGAME_STAR_XP);
    expect(half.save.coins).toBe(defaultSave().coins + MINIGAME_STAR_COINS);
    expect(half.save.flags[starFlag(ID, 2)]).toBe(true);
    const all = claimPage(saveWith(TOTAL - 1, { [starFlag(ID, 2)]: true }), ID, 'the-last');
    expect(all.stars).toEqual([3]);
    expect(all.coins).toBe(MINIGAME_STAR_COINS);
  });
});

describe('claimRound', () => {
  it('the first round finished earns star 1 and the game’s one item; later rounds nothing', () => {
    const save = saveWith(0);
    const first = claimRound(save, ID);
    expect(first.stars).toEqual([1]);
    expect(first.item).toBe('potion');
    expect(first.save.items.potion).toBe(save.items.potion + 1);
    expect(first.save.coins).toBe(save.coins + MINIGAME_STAR_COINS);
    expect(first.xp).toBe(MINIGAME_STAR_XP);
    const second = claimRound(first.save, ID);
    expect(second).toMatchObject({ xp: 0, coins: 0, stars: [], item: null });
    expect(second.save).toBe(first.save);
  });
});

describe('the band remembered on this device', () => {
  it('per kid and per game', () => {
    expect(rememberedBand('kid-a', ID)).toBeNull();
    rememberBand('kid-a', ID, 'tricky');
    expect(rememberedBand('kid-a', ID)).toBe('tricky');
    expect(rememberedBand('kid-b', ID)).toBeNull();
  });

  it('a junk value or storage that throws is "not remembered", never an error', () => {
    localStorage.setItem('hazel-mg-band-kid-a-potion-lab', 'impossible');
    expect(rememberedBand('kid-a', ID)).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberBand('kid-a', ID, 'gentle')).not.toThrow();
    expect(rememberedBand('kid-a', ID)).toBeNull();
  });
});
