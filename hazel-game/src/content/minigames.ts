import type { Topic } from '../types';
import type { MusicTrack } from '../lib/audio';
import type { ConsumableId } from './items';

/**
 * Mini-games (docs/DESIGN-MINIGAMES.md): learning games played on their own
 * full-screen stage, opened from a host in the world. This is the registry —
 * what each game is called, who runs it where, its title card — and the save
 * flags its progress lives in. Each game's rules are `lib/minigames/<game>.ts`;
 * the stage and the games' screens are `features/minigames/`.
 */
export const MINIGAME_IDS = ['potion-lab'] as const;
export type MiniGameId = (typeof MINIGAME_IDS)[number];

/** The three bands a game is played at (§3.3), picked from the topic's question level. */
export const BANDS = ['gentle', 'medium', 'tricky'] as const;
export type Band = (typeof BANDS)[number];
export const BAND_LABEL: Record<Band, string> = { gentle: 'Gentle', medium: 'Medium', tricky: 'Tricky' };

/** One of the title card's three "how to play" steps. */
export interface HowToStep {
  title: string;
  text: string;
}

export interface MiniGameDef {
  id: MiniGameId;
  name: string;
  emoji: string;
  topic: Topic;
  /** The host's NPC id: who offers the game, whose portrait and words it shows. */
  host: string;
  /** Under the title plate: the building and the place. */
  place: string;
  /** Where the 📜 Menu says to find it. */
  where: string;
  /** The title card's Play button, and the reward's Play again. */
  playLabel: string;
  againLabel: string;
  /** The host's hello on the title card. */
  hello: string;
  steps: readonly [HowToStep, HowToStep, HowToStep];
  /** The collection: its name, and how many pages it holds across every band. */
  collection: string;
  pages: number;
  /** A line under the band chooser (the Potion Lab: more jars on the harder bands). */
  bandNote?: string;
  /** Its music, while the stage is up (`App` steps aside, as for the Spire). */
  music: MusicTrack;
  /** The picture behind the title card and the reward (a zone's battle backdrop). */
  backdrop: string;
  /** Given once, the first time a round is finished. */
  firstItem?: ConsumableId;
}

export const MINIGAMES: Record<MiniGameId, MiniGameDef> = {
  'potion-lab': {
    id: 'potion-lab',
    name: 'Potion Lab',
    emoji: '🧪',
    topic: 'science',
    host: 'verdara-merchant',
    place: 'Tadpole’s Tonics · Verdara',
    where: 'Trader Tadpole, Verdara',
    playLabel: 'Let’s brew!',
    againLabel: 'Brew another',
    hello: 'Ribbit! Orders are piling up and I’m all fins today. Will you brew them for me?',
    steps: [
      { title: 'Pour in one jar', text: 'Lemon, soap, sugar… every jar does something different.' },
      { title: 'Guess what happens', text: 'Scientists guess first. A wrong guess is fine!' },
      { title: 'Stir and see!', text: 'Every new jar adds a page to your Brew Book.' },
    ],
    collection: 'Brew Book',
    pages: 12,
    bandNote: 'More jars on Medium and Tricky.',
    music: 'shrine',
    backdrop: '/backgrounds/verdara.png',
    firstItem: 'potion',
  },
};

/** The game a person runs, if any (they offer it from their first line). */
export function gameHostedBy(npcId: string): MiniGameId | null {
  return MINIGAME_IDS.find((id) => MINIGAMES[id].host === npcId) ?? null;
}

// Progress is save flags (§3.4): additive, so no save-version bump.
const mg = (id: MiniGameId, key: string) => `mg:${id}:${key}`;
/** Set the first time the stage opens — the 📜 Menu lists the games found. */
export const openedFlag = (id: MiniGameId) => mg(id, 'opened');
/** A page of the game's collection, found. */
export const pageFlag = (id: MiniGameId, page: string) => mg(id, `page:${page}`);
/** A star earned: 1 the first round finished, 2 half the collection, 3 all of it. */
export const starFlag = (id: MiniGameId, n: 1 | 2 | 3) => mg(id, `star:${n}`);

/** XP for a new collection page (once). */
export const MINIGAME_PAGE_XP = 5;
/** XP and coins for a new star (once each). */
export const MINIGAME_STAR_XP = 20;
export const MINIGAME_STAR_COINS = 10;
