import { MINIGAMES, pageFlag, starFlag, type Band, type MiniGameId } from '../content/minigames';
import { MINIGAME_PAGE_XP, MINIGAME_STAR_COINS, MINIGAME_STAR_XP, type ConsumableId } from '../content/items';
import type { SaveData } from '../types';

/**
 * The rules every mini-game shares (docs/DESIGN-MINIGAMES.md §3): the band a
 * kid plays at, and what finding a page or finishing a round earns. Pure — the
 * stage (`features/minigames/MiniGameStage`) saves and pays what these return.
 */

/** The band picked from the topic's question level (§3.3): 1–3 Gentle, 4–6 Medium, 7–10 Tricky. */
export function bandFor(level: number): Band {
  if (level <= 3) return 'gentle';
  if (level <= 6) return 'medium';
  return 'tricky';
}

/** The collection's pages found so far (their keys, in no order). */
export function pagesFound(flags: Record<string, boolean>, id: MiniGameId): string[] {
  const prefix = pageFlag(id, '');
  return Object.keys(flags).filter((f) => f.startsWith(prefix) && flags[f]).map((f) => f.slice(prefix.length));
}

/** Stars earned so far, 0–3. */
export function starsEarned(flags: Record<string, boolean>, id: MiniGameId): number {
  return ([1, 2, 3] as const).filter((n) => flags[starFlag(id, n)]).length;
}

/**
 * The stars a game's progress is worth (§3.4): ★ the first round finished,
 * ★ half the collection, ★ all of it. Stars 2 and 3 come with the pages,
 * whenever they're found; star 1 only with a finished round.
 */
export function starsFor(roundDone: boolean, found: number, total: number): (1 | 2 | 3)[] {
  const stars: (1 | 2 | 3)[] = [];
  if (roundDone) stars.push(1);
  if (found >= Math.ceil(total / 2)) stars.push(2);
  if (found >= total) stars.push(3);
  return stars;
}

/** What a page or a finished round newly earned: the save with it, and what to pay. */
export interface Claim {
  save: SaveData;
  xp: number;
  coins: number;
  /** New pages, new stars and the item, for the reward screen. */
  pages: string[];
  stars: (1 | 2 | 3)[];
  item: ConsumableId | null;
}

/** New stars, with their XP and coins, flagged in the save. */
function withStars(save: SaveData, id: MiniGameId, due: (1 | 2 | 3)[]): { save: SaveData; stars: (1 | 2 | 3)[] } {
  const stars = due.filter((n) => !save.flags[starFlag(id, n)]);
  if (stars.length === 0) return { save, stars };
  const flags = { ...save.flags };
  for (const n of stars) flags[starFlag(id, n)] = true;
  return { save: { ...save, flags, coins: save.coins + stars.length * MINIGAME_STAR_COINS }, stars };
}

/**
 * A page found (§3.4): saved, `MINIGAME_PAGE_XP` the first time — and a star
 * (2 or 3) if it fills half or all of the collection. Nothing again for a page
 * found before.
 */
export function claimPage(save: SaveData, id: MiniGameId, page: string): Claim {
  if (save.flags[pageFlag(id, page)]) return { save, xp: 0, coins: 0, pages: [], stars: [], item: null };
  const found = { ...save, flags: { ...save.flags, [pageFlag(id, page)]: true } };
  const { save: next, stars } = withStars(found, id, starsFor(false, pagesFound(found.flags, id).length, MINIGAMES[id].pages));
  return {
    save: next,
    xp: MINIGAME_PAGE_XP + stars.length * MINIGAME_STAR_XP,
    coins: stars.length * MINIGAME_STAR_COINS,
    pages: [page],
    stars,
    item: null,
  };
}

/**
 * A round finished (§3.4): star 1 the first time, with the game's one-time
 * item (the Potion Lab's Berry Potion). Nothing again after that.
 */
export function claimRound(save: SaveData, id: MiniGameId): Claim {
  const { save: next, stars } = withStars(save, id, [1]);
  const item = stars.includes(1) ? MINIGAMES[id].firstItem ?? null : null;
  const withItem = item ? { ...next, items: { ...next.items, [item]: next.items[item] + 1 } } : next;
  return {
    save: withItem,
    xp: stars.length * MINIGAME_STAR_XP,
    coins: stars.length * MINIGAME_STAR_COINS,
    pages: [],
    stars,
    item,
  };
}

/** The band a kid last picked for a game, on this device (§3.3); null when they haven't, or storage can't be read. */
export function rememberedBand(kidId: string | null, id: MiniGameId): Band | null {
  try {
    const v = localStorage.getItem(bandKey(kidId, id));
    return v === 'gentle' || v === 'medium' || v === 'tricky' ? v : null;
  } catch {
    return null;
  }
}

/** Remember the band picked (storage that can't be written just forgets it). */
export function rememberBand(kidId: string | null, id: MiniGameId, band: Band): void {
  try {
    localStorage.setItem(bandKey(kidId, id), band);
  } catch {
    // Private mode / blocked storage: the band is picked from the level next time.
  }
}

/** Back to the band the kid's level suggests: picking the suggested band forgets any other (review round 2: it pinned it for good). */
export function forgetBand(kidId: string | null, id: MiniGameId): void {
  try {
    localStorage.removeItem(bandKey(kidId, id));
  } catch {
    // Nothing stored that can be read either.
  }
}

const bandKey = (kidId: string | null, id: MiniGameId) => `hazel-mg-band-${kidId ?? 'anon'}-${id}`;
const roundsKey = (kidId: string | null, id: MiniGameId) => `hazel-mg-rounds-${kidId ?? 'anon'}-${id}`;

/**
 * How many rounds of a game this kid has finished on this device: where the
 * next visit picks up, so a game's orders don't start over each time the
 * stage opens (review round 2: every visit's first morning asked the same
 * three). Variety, not progress — so it's the device's, like the band; 0 when
 * storage can't be read.
 */
export function roundsPlayed(kidId: string | null, id: MiniGameId): number {
  try {
    const n = Number(localStorage.getItem(roundsKey(kidId, id)));
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** One more round finished (storage that can't be written just starts over next visit). */
export function noteRoundPlayed(kidId: string | null, id: MiniGameId): void {
  try {
    localStorage.setItem(roundsKey(kidId, id), String(roundsPlayed(kidId, id) + 1));
  } catch {
    // Private mode / blocked storage.
  }
}
