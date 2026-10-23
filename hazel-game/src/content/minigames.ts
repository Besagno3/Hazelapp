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
export const MINIGAME_IDS = ['potion-lab', 'dots-bakery', 'clocktower-gears', 'mirror-mural', 'echos-call', 'star-charts', 'ringwoods-rings', 'index-timeline', 'ember-air-mail', 'word-forge'] as const;
export type MiniGameId = (typeof MINIGAME_IDS)[number];

/** The three bands every game is played at (§3.3), picked from the topic's question level and the kid's age. */
export const BANDS = ['gentle', 'medium', 'tricky'] as const;
export type Band = (typeof BANDS)[number];
/**
 * And Expert (§8), for about 12–18: secondary-school content, on the games
 * that have it (`MiniGameDef.expert`) — one PR a game, so a game's own tables
 * stay `Band` till it has it.
 */
export type PlayBand = Band | 'expert';
export const PLAY_BANDS: readonly PlayBand[] = [...BANDS, 'expert'];
export const BAND_LABEL: Record<PlayBand, string> = { gentle: 'Gentle', medium: 'Medium', tricky: 'Tricky', expert: 'Expert' };

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
  /**
   * Its Expert band (§8), once it has one — a game without one shows three
   * bands. On Expert the title card is a teen's: the line under the chooser,
   * a plainer hello, and how Expert's played, the seal in it (PR 11 UX review
   * round 1: Expert picked, the card still greeted a young kid).
   */
  expert?: { note: string; hello: string; steps: readonly [HowToStep, HowToStep, HowToStep] };
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
    expert: {
      note: 'Expert: the pH scale in numbers — and each step on it is ten times the last.',
      hello: 'Today’s orders come as a pH, counted in tens from pure water. Pick the jar that fits — and say its pH first.',
      steps: [
        { title: 'Pick a jar', text: 'Twelve on the counter, from lemon juice to soap. One goes into fresh cabbage juice.' },
        { title: 'Say its pH, 0–14', text: '7 is neutral. Each step away is ten times as acidic — or as alkaline.' },
        { title: 'Stir and see', text: 'Every pH spot on in a round wins the Expert seal. No clock.' },
      ],
    },
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
    expert: {
      note: 'Expert: ratios, rates and percentage change — the pie is yours to work out.',
      hello: 'Today’s orders come as ratios and percentages. Work out how much pie each one is, then box exactly that.',
      steps: [
        // The same three as the pictures: cut, fill, close.
        { title: 'Cut the pies', text: 'A share, a rate, or a percentage up or down: work out the pie it means, then cut.' },
        { title: 'Fill the box', text: 'Two pies on the board. Any cut that makes it exactly is right.' },
        { title: 'Close the box', text: 'All three right first time wins the Expert seal. No clock.' },
      ],
    },
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
  'index-timeline': {
    id: 'index-timeline',
    name: 'Index’s Timeline',
    emoji: '📜',
    topic: 'history',
    host: 'archive-index',
    place: 'The Card Catalog · Sunken Archive',
    where: 'Index, the Sunken Archive',
    playLabel: 'Let’s file!',
    againLabel: 'More drawers',
    hello: 'Ah… Bh… CHOO! Oh no — my cards washed out of their drawers. Help me put them back in the order things happened?',
    steps: [
      { title: 'Tap the oldest', text: 'Soggy cards wash in, each something people made or found. Which came first?' },
      { title: 'Then the next', text: 'Tap them in the order they happened — each goes in the next place on the timeline.' },
      { title: 'Check the order', text: 'Wrong ones float back with a clue. Every drawer goes in the timeline book!' },
    ],
    collection: 'Timeline book',
    pages: 8,
    bandNote: 'Medium: five cards across the centuries. Tricky: six or seven, with their years — BCE and CE.',
    music: 'spireArchive',
    backdrop: '/backgrounds/sunken-archive.png',
    firstItem: 'knot',
  },
  'ember-air-mail': {
    id: 'ember-air-mail',
    name: 'Ember Air Mail',
    emoji: '🐉',
    topic: 'geography',
    host: 'port-postmaster',
    place: 'The Post Office · Port Lantern',
    where: 'Postmaster Pidge, Port Lantern',
    playLabel: 'Let’s fly!',
    againLabel: 'More post',
    hello: 'Coo! Parcels to the rafters, and only one dragon fast enough to fly them. You steer her with the compass — I’ll tell you where each one goes!',
    steps: [
      { title: 'Read the parcel', text: 'Each says where it’s going: a picture, a square like C5, or a place in the world.' },
      { title: 'Steer Ember', text: 'Tap the compass to fly one square at a time. Her route is drawn as she goes.' },
      { title: 'Deliver it', text: 'There? Deliver! Every kind of post is a stamp in Pidge’s album.' },
    ],
    collection: 'Stamp album',
    pages: 9,
    bandNote: 'Medium: the town, its squares named like C5, and eight directions. Tricky: the whole world, and how far by the map’s scale.',
    music: 'sailing',
    backdrop: '/backgrounds/port-lantern.png',
    firstItem: 'hint',
  },
  'word-forge': {
    id: 'word-forge',
    name: 'Word Forge',
    emoji: '🔨',
    topic: 'words',
    host: 'ink-dot',
    place: 'The Ink Forge · Inkwell Cove',
    where: 'Scrivener Dot, Inkwell Cove',
    playLabel: 'Let’s forge!',
    againLabel: 'Forge more',
    hello: 'Words are made of parts, the way a key is made of teeth! I’ll say what a word means — you forge it from its parts. Mind the sparks!',
    steps: [
      { title: 'Read the meaning', text: 'Dot says what a word means, like “a coat that keeps the rain off”.' },
      { title: 'Pick two parts', text: 'Tap them in the tray — each goes on the anvil, in order.' },
      { title: 'Hammer!', text: 'The word meant? It goes on Dot’s word wall, with its family.' },
    ],
    collection: 'Word wall',
    pages: 9,
    // A word joiner after each end part's hyphen: "-" / "ful" never split over two lines (Word Forge's UX review round 2).
    bandNote: 'Medium: un-, re-, pre-, -\u2060ful, -\u2060less, -\u2060er and -\u2060est. Tricky: Greek and Latin roots — tele means far!',
    music: 'shallows',
    backdrop: '/backgrounds/inkwell-cove.png',
    firstItem: 'tea',
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
/** The Expert seal (§8.3): a round on Expert spot on every time. Shown, never paid, never needed for a star. */
export const sealFlag = (id: MiniGameId) => mg(id, 'seal');
/**
 * The kid's own picture (the Mirror Mural's free canvas, §3.5): one flag whose
 * name ends in the picture's code — `mineFlag(id)` alone is the prefix, so the
 * one before can be found and replaced.
 */
export const mineFlag = (id: MiniGameId, code = '') => mg(id, `mine:${code}`);

// What a page or a star pays is economy tuning: `MINIGAME_*` in content/items.ts.
