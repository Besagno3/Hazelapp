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
export const MINIGAME_IDS = ['potion-lab', 'dots-bakery', 'clocktower-gears', 'mirror-mural', 'echos-call', 'star-charts', 'ringwoods-rings'] as const;
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
  /** Its music, while the stage is up (`App` steps aside, as for the Spire); null: quiet, so a game's own notes are heard. */
  music: MusicTrack | null;
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
      { title: 'Pour in one jar', text: 'Purple cabbage juice changes colour with what you pour in: lemon, soap, sugar…' },
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
  'dots-bakery': {
    id: 'dots-bakery',
    name: 'Dot’s Bakery',
    emoji: '🥧',
    topic: 'math',
    host: 'village-baker',
    place: 'Baker Dot’s shop · Lumina Village',
    where: 'Baker Dot, Lumina Village',
    playLabel: 'Let’s bake!',
    againLabel: 'Another morning',
    hello: 'Pies are out of the oven and the regulars are queueing! Can you cut them fair and fill the boxes?',
    steps: [
      { title: 'Cut the pie', text: 'Halves, quarters and more — pick how many equal slices.' },
      { title: 'Fill the box', text: 'Tap slices to put just the right amount in the box.' },
      { title: 'Close the box', text: 'Two quarters make a half — any cut that makes it is right!' },
    ],
    collection: 'Regulars’ Book',
    pages: 8,
    bandNote: 'Medium cuts thirds, sixths and eighths; Tricky uses percentages and decimals.',
    music: 'town',
    backdrop: '/backgrounds/lumina-village.png',
    firstItem: 'snack',
  },
  'clocktower-gears': {
    id: 'clocktower-gears',
    name: 'Clocktower Gears',
    emoji: '⚙️',
    topic: 'engineering',
    host: 'gearfall-clockkeeper',
    place: 'Tock’s Clocktower · Gearfall',
    where: 'Tock, Gearfall',
    playLabel: 'Let’s tinker!',
    againLabel: 'More machines',
    hello: 'Tick… tock… three of my old machines have stopped. Gears on pegs, a turn of the crank — will you bring them back to life?',
    steps: [
      { title: 'Tap a peg', text: 'Tap a peg to put a gear on it — tap again to take it off.' },
      { title: 'Join them up', text: 'Gears that touch turn each other, each the other way round. Make a chain from the crank to the machine.' },
      { title: 'Turn the crank', text: 'Watch what turns, and which way. Every machine fixed is a page!' },
    ],
    collection: 'Machine Book',
    pages: 9,
    bandNote: 'Medium: make it turn the right way. Tricky: the right speed too.',
    music: 'town',
    backdrop: '/backgrounds/gearfall.png',
    firstItem: 'spark',
  },
  'mirror-mural': {
    id: 'mirror-mural',
    name: 'Mirror Mural',
    emoji: '🪞',
    topic: 'creativity',
    host: 'chromaria-curator',
    place: 'The Grand Gallery · Chromaria',
    where: 'Madame Hue, Chromaria',
    playLabel: 'Let’s paint!',
    againLabel: 'More pictures',
    hello: 'Darling! Half of each picture is painted — the mirror needs the other half. Mix the paint and make them match!',
    steps: [
      { title: 'Mix the paint', text: 'Two pots make a new colour: red and blue make purple.' },
      { title: 'Paint the other half', text: 'Tap or drag across the squares — each one copies the square across the mirror line.' },
      { title: 'Hold up the mirror', text: 'It shows what matches. Every picture finished hangs in the Gallery!' },
    ],
    collection: 'Gallery',
    pages: 9,
    bandNote: 'Medium mirrors down as well as across; Tricky four ways, half turns and opposite colours.',
    music: 'town',
    backdrop: '/backgrounds/chromaria.png',
    firstItem: 'mirror',
  },
  'echos-call': {
    id: 'echos-call',
    name: 'Echo’s Call',
    emoji: '🎵',
    topic: 'music',
    host: 'chromaria-musician',
    place: 'The Music House · Chromaria',
    where: 'Bard Lyra, Chromaria',
    playLabel: 'Let’s play!',
    againLabel: 'More tunes',
    hello: 'La la LAAA! My chimes ring in colours. I play the start of a tune — you play it back!',
    steps: [
      { title: 'Listen', text: 'Lyra plays the start of an old tune. Each chime lights up as it rings — sound on or off.' },
      { title: 'Up or down?', text: 'Did it end higher, lower or the same? A higher note rings from a shorter chime.' },
      { title: 'Play it back', text: 'Tap the chimes in the same order. Every tune goes in Lyra’s Songbook!' },
    ],
    collection: 'Songbook',
    pages: 8,
    bandNote: 'Gentle: three chimes and five of the eight tunes. Medium: all five chimes and all eight. Tricky: read the notes on a staff, and spot a wrong one.',
    music: null,
    backdrop: '/backgrounds/chromaria.png',
    firstItem: 'ward',
  },
  'star-charts': {
    id: 'star-charts',
    name: 'Vela’s Star Charts',
    emoji: '✨',
    topic: 'space',
    host: 'coast-stargazer',
    place: 'Vela’s Observatory · Starfall Coast',
    where: 'Vela, Starfall Coast',
    playLabel: 'Let’s stargaze!',
    againLabel: 'Another night',
    hello: 'The fog made us forget the star pictures. Help me find them again — every one goes back on my chart!',
    steps: [
      { title: 'Look at the card', text: 'Vela shows you a star picture: what shape its stars make.' },
      { title: 'Join the stars', text: 'Tap a star, then one it’s joined to — a line appears. Join them all!' },
      { title: 'Read its card', text: 'A true thing about it. Every picture goes on Vela’s chart!' },
    ],
    collection: 'Star chart',
    pages: 9,
    bandNote: 'Medium: no outline, and find the North Star. Tricky: the sky has turned — and how long the light took.',
    music: 'starfall',
    backdrop: '/backgrounds/starfall-coast.png',
    firstItem: 'candle',
  },
  'ringwoods-rings': {
    id: 'ringwoods-rings',
    name: 'Ringwood’s Rings',
    emoji: '🌳',
    topic: 'nature',
    host: 'elder-ringwood',
    place: 'Ringwood’s Hollow · Eldergrove',
    where: 'Old Ringwood, Eldergrove',
    playLabel: 'Let’s count!',
    againLabel: 'More rings',
    hello: 'Hrrrm. I keep losing count of my rings. Will you read these trees’ rings for me? Every ring is a year.',
    steps: [
      { title: 'Count the rings', text: 'A tree grows one ring a year. Tap them from the middle out.' },
      { title: 'Read them', text: 'A wide ring was a wet year; a thin one, a dry year.' },
      { title: 'Find the year', text: 'Count back from the bark — or match an old beam to a living tree!' },
    ],
    collection: 'Grove book',
    pages: 8,
    bandNote: 'Medium: read a core — find a year, then the dry years. Tricky: match an old beam’s rings to a living tree’s.',
    music: 'spireThicket',
    backdrop: '/backgrounds/eldergrove.png',
    firstItem: 'clover',
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
/**
 * The kid's own picture (the Mirror Mural's free canvas, §3.5): one flag whose
 * name ends in the picture's code — `mineFlag(id)` alone is the prefix, so the
 * one before can be found and replaced.
 */
export const mineFlag = (id: MiniGameId, code = '') => mg(id, `mine:${code}`);

// What a page or a star pays is economy tuning: `MINIGAME_*` in content/items.ts.
