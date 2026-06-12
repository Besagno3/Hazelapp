import type { Topic } from '../types';

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
];

export function endingPanels(heroName: string): StoryPanel[] {
  return [
    {
      emoji: '💎',
      text:
        'The four Crystals of Knowing blaze like little suns. The fog of Forgetting ' +
        'thins, curls… and gives up.',
    },
    {
      emoji: '🏘️',
      text:
        'Tally counts shooting stars. Fern\'s fireflies spell words in the dark. ' +
        'Rivet\'s great engine purrs. And Doodle is painting EVERYTHING — including you.',
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
