import type { Topic } from '../types';
import { TOPIC_REGISTRY, crystalFlag } from './topics';

/**
 * The story layer (#37 story pass — see docs/STORY.md for the full bible).
 * Opening/ending/hatch cutscene panels, Fiend battle dialogue, and Ember —
 * the last dragon of Lumina, the hero's companion, who grows on bravery
 * and bright answers.
 */

export interface StoryPanel {
  emoji: string;
  text: string;
}

// --- Ember, the last dragon ---------------------------------------------------

export type EmberStage = 'egg' | 'hatchling' | 'whelp' | 'dragon';

export const EMBER_SPRITES: Record<EmberStage, string> = {
  egg: '🥚',
  hatchling: '🐲',
  whelp: '🐲',
  dragon: '🐉',
};

/**
 * Sprite-manifest ids per Ember growth stage. Unmapped in SPRITES until the
 * asset task, so each resolves to its EMBER_SPRITES emoji until real art lands.
 */
export const EMBER_SPRITE_IDS: Record<EmberStage, string> = {
  egg: 'ember-egg',
  hatchling: 'ember-hatchling',
  whelp: 'ember-whelp',
  dragon: 'ember-dragon',
};

export const EMBER_STAGE_LABEL: Record<EmberStage, string> = {
  egg: 'a warm egg',
  hatchling: 'hatchling',
  whelp: 'young dragon',
  dragon: 'full-grown dragon',
};

/** Ember's size on the world map, per stage (text size in px). */
export const EMBER_MAP_SIZE: Record<EmberStage, number> = {
  egg: 14,
  hatchling: 16,
  whelp: 22,
  dragon: 28,
};

/** Flag set by the first battle victory; the hatch scene plays back in the world. */
export const EMBER_HATCHED = 'ember-hatched';
export const EMBER_HATCH_SEEN = 'ember-hatch-seen';
export const INTRO_SEEN = 'intro-seen';
export const ENDING_SEEN = 'ending-seen';
/** Plays once after the FIRST crystal is restored — the Spire wakes and calls. */
export const SPIRE_AWAKE_SEEN = 'spire-awake-seen';

/** Per-crystal cutscene flag — set once that topic's "crystal restored" scene plays. */
export function crystalSceneFlag(topic: Topic): string {
  return `crystal-${topic}-scene-seen`;
}

/**
 * Ember grows on the player's deeds: the egg hatches after the first battle
 * victory, and each restored crystal feeds the little dragon.
 */
export function emberStage(crystals: number, flags: Record<string, boolean>): EmberStage {
  if (!flags[EMBER_HATCHED]) return 'egg';
  if (crystals >= 4) return 'dragon';
  if (crystals >= 2) return 'whelp';
  return 'hatchling';
}

/**
 * Crystal count + Ember stage derived from the save flags — the single
 * derivation every screen (HUD, menu, battle) shares.
 */
export function emberStatus(flags: Record<string, boolean>): {
  crystals: number;
  stage: EmberStage;
} {
  const crystals = TOPIC_REGISTRY.filter((t) => flags[crystalFlag(t.id)]).length;
  return { crystals, stage: emberStage(crystals, flags) };
}

// --- Cutscenes ----------------------------------------------------------------

export const INTRO_PANELS: StoryPanel[] = [
  {
    emoji: '🏞️',
    text:
      'The world of Lumina runs on light — the light of four Crystals of Knowing: ' +
      'Numbers, Nature, Gears, and Wonder.',
  },
  {
    emoji: '🌫️',
    text:
      'Then came the fog of Forgetting. Numbers slipped out of the rivers, the stars ' +
      'lost their names, the great engines went still, and the colors began to fade.',
  },
  {
    emoji: '👹',
    text:
      'Four Fiends drank the crystal light and slithered off to the far corners of ' +
      'the world to keep it for themselves.',
  },
  {
    emoji: '🥚',
    text:
      'But on the morning the fog reached your village, you found something the fog ' +
      'could not touch: the last dragon egg of Lumina — warm as a good idea.',
  },
  {
    emoji: '🏡',
    text:
      'You grew up in a little village at the edge of Lumina Field, raised on Grandmother ' +
      "Wick's bedtime stories about the crystals. You never dreamed you'd live one.",
  },
  {
    emoji: '🏛️',
    text:
      'At the heart of the world stands the Crystal Spire — dark and silent now. They say ' +
      'when all four crystals shine again, their light will gather there and burn the fog away.',
  },
  {
    emoji: '🐲',
    text:
      'Dragons grow on bravery and bright answers. Restore the four crystals, raise ' +
      'the last dragon… and bring the light home. Your adventure starts now!',
  },
];

export const HATCH_PANELS: StoryPanel[] = [
  {
    emoji: '🥚',
    text: 'The egg is wobbling! Your brave answers in battle warmed it all the way through…',
  },
  {
    emoji: '🐲',
    text:
      'CRACK! A tiny dragon tumbles out and blinks up at you. "Ember" feels like the ' +
      'right name. Ember will follow you everywhere — and grow with every crystal you restore!',
  },
  {
    emoji: '🔥',
    text:
      'Ember sneezes a tiny puff of sparks and grins. Raise this dragon to full size, and ' +
      "one day you'll cast its very own fire in battle. For now — onward, together!",
  },
];

/**
 * The Spire awakens after the FIRST crystal is restored — introduces the
 * Crystal Spire (the new endgame zone) and its Keeper.
 */
export const SPIRE_PANELS: StoryPanel[] = [
  {
    emoji: '🏛️',
    text:
      'Far across the world, the dark Crystal Spire shivers. A single restored crystal ' +
      'has woken something that slept through the whole long fog.',
  },
  {
    emoji: '🔮',
    text:
      '"At last," whispers Keeper Aurora from the top of the Spire. "A bright heart walks ' +
      'Lumina again. Bring the crystals home, little hero — the Spire has waited so long for morning."',
  },
];

/**
 * A short victory cutscene per Fiend — plays back in the world after the boss
 * falls and that topic's crystal is restored.
 */
export const CRYSTAL_PANELS: Record<Topic, StoryPanel[]> = {
  math: [
    {
      emoji: '💠',
      text:
        'The Null Fiend scatters into a drift of zeroes, and the Crystal of Numbers blazes ' +
        'back to life. Far off in Numbria, the counting river starts to count again — one, two, three…',
    },
    {
      emoji: '🐲',
      text: 'Ember gulps down the fresh crystal-light and grows a little bigger. Three crystals to go!',
    },
  ],
  science: [
    {
      emoji: '🌟',
      text:
        'The Smog Fiend coughs once and clears away like morning mist. The Crystal of Nature ' +
        'shines, and high over Verdara the stars quietly remember their own names.',
    },
    {
      emoji: '🐲',
      text: 'Ember chases a firefly in pure delight, then nibbles the crystal-light and grows. Onward!',
    },
  ],
  engineering: [
    {
      emoji: '🌀',
      text:
        'The Rust Fiend seizes up and flakes away to nothing. The Crystal of Gears spins bright, ' +
        'and deep below, every sleeping machine in the Clockwork Depths turns over with a happy clank.',
    },
    {
      emoji: '🐲',
      text: 'Ember warms its claws on the glowing crystal and stretches, just a touch taller. Keep going!',
    },
  ],
  creativity: [
    {
      emoji: '🌈',
      text:
        'The Gray Fiend dissolves into a splash of every color it ever stole. The Crystal of Wonder ' +
        'sings, and all of Chromaria bursts into a paintbox of light and music at once.',
    },
    {
      emoji: '🐲',
      text: 'Ember rolls in the rainbow and roars a tiny, joyful roar. Such a brave little dragon!',
    },
  ],
};

export function endingPanels(heroName: string): StoryPanel[] {
  return [
    {
      emoji: '💎',
      text:
        'The four Crystals of Knowing rise from the corners of the world and stream toward ' +
        'the Crystal Spire, four ribbons of light braiding together across the sky.',
    },
    {
      emoji: '🏛️',
      text:
        'At the top of the Spire, Keeper Aurora lifts her hands and the crystals settle into ' +
        'place. The Spire blazes like a second sun. The fog of Forgetting thins, curls… and gives up.',
    },
    {
      emoji: '🏘️',
      text:
        'Tally counts shooting stars. Fern\'s fireflies spell words in the dark. ' +
        'Rivet\'s great engine purrs. And Doodle is painting EVERYTHING — including you.',
    },
    {
      emoji: '🏡',
      text:
        'Back home, Grandmother Wick\'s lanterns burn bright enough to read by. "I always knew," ' +
        'she says, and Bramble swears the village bread has never once burned since.',
    },
    {
      emoji: '🔭',
      text:
        'On Starfall Coast, the stars come down to rest on the water again. Vela names a brand-new ' +
        `one — bright and low in the west — after a curious kid who would not stop asking why.`,
    },
    {
      emoji: '🐉',
      text:
        'Ember spreads wings wide enough to shade the village square. The last dragon ' +
        'of Lumina is full-grown — raised on every brave answer you ever gave.',
    },
    {
      emoji: '🌟',
      text:
        `Lumina is bright again because ${heroName} kept asking "why?" — and never ` +
        'stopped, even when the questions got hard. That is what heroes are made of.',
    },
    {
      emoji: '🗺️',
      text:
        'The Fiends may stir again one day, with trickier riddles than before. ' +
        'Ember will be ready. Will you? …Of course you will. The adventure continues!',
    },
  ];
}

// --- Fiend battle dialogue ------------------------------------------------------

export interface BossScript {
  /** Spoken (one message box at a time) before the first command. */
  intro: string[];
  /** Last words, shown on the victory panel. */
  defeat: string;
}

export const BOSS_LINES: Record<Topic, BossScript> = {
  math: {
    intro: [
      'So… the egg-carrier found my lair. How many heroes have I beaten? You would not know — I turned every number to ZERO.',
      'I am the Null Fiend! Your chances against me? Also zero. Let us count you out!',
    ],
    defeat: 'Zero…? No, wait… your answers… they all counted…',
  },
  science: {
    intro: [
      '*cough* *cough* Who let CURIOSITY into my beautiful smog?',
      'I am the Smog Fiend! In my fog, no one asks why, no one wonders how, and the stars stay forgotten!',
    ],
    defeat: 'My fog… it is clearing… the stars… they remember their names…',
  },
  engineering: {
    intro: [
      'Griiind… clank… another little tinkerer come to oil what I have rusted?',
      'I am the Rust Fiend! Nothing turns, nothing works, and NOTHING gets fixed on my watch!',
    ],
    defeat: 'My rust… flaking away…? You… rebuilt what I broke…',
  },
  creativity: {
    intro: [
      'Color is loud. Music is messy. Ideas are EXHAUSTING. I prefer… gray.',
      'I am the Gray Fiend! I drank every color and hushed every song — and your bright little brain is next!',
    ],
    defeat: 'So bright… so loud… so… beautiful…',
  },
};
