import { describe, it, expect, afterEach, vi } from 'vitest';
import { bandFor, claimPage, claimRound, noteRoundPlayed, pagesFound, rememberBand, rememberedBand, roundsPlayed, starsEarned, starsFor, upToTricky } from './minigames';
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

describe('bandFor (docs/DESIGN-MINIGAMES.md §3.3, §8.2)', () => {
  it('from the level alone: 1–3 Gentle, 4–6 Medium, 7–10 Tricky', () => {
    expect([1, 2, 3].map((l) => bandFor(l))).toEqual(['gentle', 'gentle', 'gentle']);
    expect([4, 5, 6].map((l) => bandFor(l))).toEqual(['medium', 'medium', 'medium']);
    expect([7, 8, 9, 10].map((l) => bandFor(l))).toEqual(['tricky', 'tricky', 'tricky', 'tricky']);
  });

  it('with the age: the higher of that and the band for the kid’s content age (age + (level − 5) / 2) — Expert from 12 where the game has it', () => {
    // A new kid's start level is the age less 5, at most 6 (lib/age.ts).
    const fresh = (age: number, expert = true) => bandFor(Math.min(6, Math.max(1, age - 5)), age, expert);
    expect([6, 7, 8, 9, 10, 11, 12, 14, 18].map((a) => fresh(a))).toEqual(['gentle', 'gentle', 'gentle', 'medium', 'tricky', 'tricky', 'expert', 'expert', 'expert']);
    // No Expert on the game: Tricky.
    expect(fresh(14, false)).toBe('tricky');
    // The boundaries (code review round 1: 8 untested): content age 8 is Medium, 10 Tricky, 12 Expert.
    expect(bandFor(3, 9, true)).toBe('medium');
    expect(bandFor(3, 8.5, true)).toBe('gentle');
    expect(bandFor(5, 10, true)).toBe('tricky');
    expect(bandFor(5, 12, true)).toBe('expert');
    // A young kid's suggestion never drops: a 7-year-old at level 10 keeps Tricky.
    expect(bandFor(10, 7, true)).toBe('tricky');
    // A teen far behind is offered less: 14 at level 1 → content age 12 → Expert; 12 at level 1 → 10 → Tricky.
    expect(bandFor(1, 14, true)).toBe('expert');
    expect(bandFor(1, 12, true)).toBe('tricky');
  });

  it('a game without Expert yet plays Tricky if handed it (§8.6)', () => {
    expect(upToTricky('expert')).toBe('tricky');
    expect(upToTricky('medium')).toBe('medium');
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

describe('rounds played, on this device (PR 2 review round 2)', () => {
  it('count up per kid and per game, from 0', () => {
    expect(roundsPlayed('kid-a', ID)).toBe(0);
    noteRoundPlayed('kid-a', ID);
    noteRoundPlayed('kid-a', ID);
    expect(roundsPlayed('kid-a', ID)).toBe(2);
    expect(roundsPlayed('kid-b', ID)).toBe(0);
    expect(roundsPlayed('kid-a', 'dots-bakery')).toBe(0);
  });

  it('a junk value or storage that throws starts from 0, never an error', () => {
    localStorage.setItem('hazel-mg-rounds-kid-a-potion-lab', '-3');
    expect(roundsPlayed('kid-a', ID)).toBe(0);
    localStorage.setItem('hazel-mg-rounds-kid-a-potion-lab', 'lots');
    expect(roundsPlayed('kid-a', ID)).toBe(0);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => noteRoundPlayed('kid-a', ID)).not.toThrow();
    expect(roundsPlayed('kid-a', ID)).toBe(0);
  });
});

describe('the band remembered on this device', () => {
  it('per kid and per game', () => {
    expect(rememberedBand('kid-a', ID)).toBeNull();
    rememberBand('kid-a', ID, 'tricky');
    expect(rememberedBand('kid-a', ID)).toBe('tricky');
    expect(rememberedBand('kid-b', ID)).toBeNull();
  });

  it('Expert, on a game that has it; not on one that hasn’t (§8.2)', () => {
    rememberBand('kid-a', ID, 'expert');
    expect(rememberedBand('kid-a', ID)).toBe('expert');
    // Every game has Expert now (Word Forge last, PR 20), so one is taken off for the case.
    const expert = MINIGAMES['word-forge'].expert;
    delete MINIGAMES['word-forge'].expert;
    try {
      localStorage.setItem('hazel-mg-band-kid-a-word-forge', 'expert');
      expect(rememberedBand('kid-a', 'word-forge')).toBeNull();
    } finally {
      MINIGAMES['word-forge'].expert = expert;
    }
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
