import type { ServiceType, Topic } from '../types';

/**
 * Friendly (non-combat) NPCs and their dialogue (#37).
 * One kid-friendly register for everyone (decided 2026-06-12) — short lines,
 * big-hearted tone, Dragon Warrior "talk to everyone" energy.
 */

export type DialogueLine =
  | string
  | {
      text: string;
      /** Show only when this save flag is set… */
      ifFlag?: string;
      /** …or only when it is NOT set. */
      unlessFlag?: string;
      /** Set this flag after the line is shown. */
      setFlag?: string;
    };

export type NpcRole = 'villager' | 'sage' | 'merchant' | 'innkeeper' | 'librarian';

export interface WorldNpcDef {
  id: string;
  name: string;
  sprite: string;
  role: NpcRole;
  /** Sages belong to a topic; opens that topic's Sage screen. */
  topic?: Topic;
  lines: DialogueLine[];
}

/** Which service overlay (if any) talking to this role opens after dialogue. */
export const ROLE_SERVICE: Partial<Record<NpcRole, ServiceType>> = {
  sage: 'sage',
  merchant: 'shop',
  innkeeper: 'inn',
  librarian: 'library',
};

export const NPC_DEFS: Record<string, WorldNpcDef> = {
  // --- Lumina Field (hub) ---
  'elder-lumen': {
    id: 'elder-lumen',
    name: 'Elder Lumen',
    sprite: '👴',
    role: 'villager',
    lines: [
      {
        text: 'Welcome, brave one! A fog of Forgetting has dimmed our four Crystals of Knowing.',
        unlessFlag: 'met-elder',
        setFlag: 'met-elder',
      },
      'Four Fiends hoard the crystal light — one beyond each path from this field.',
      'Every question you answer returns a spark of light. Learning is our magic!',
      {
        text: 'That egg you carry… the last dragon of Lumina chose YOU. Keep answering bravely, and it will hatch.',
        unlessFlag: 'ember-hatched',
      },
      {
        text: 'Little Ember is growing fast! Crystal light is dragon food, you know.',
        ifFlag: 'ember-hatched',
      },
      {
        text: 'All four crystals shine again… you truly are the Hero of Lumina!',
        ifFlag: 'crystal-math-restored',
      },
    ],
  },
  'hub-kid': {
    id: 'hub-kid',
    name: 'Pip',
    sprite: '🧒',
    role: 'villager',
    lines: [
      'I saw a gatekeeper on the path! They only let you through if you answer their question.',
      'Treasure chests ask questions too. Smart chests, huh?',
      {
        text: 'Is that a DRAGON EGG?! When it hatches, can I pet it? Please please please?',
        unlessFlag: 'ember-hatched',
      },
      {
        text: 'EMBER IS SO COOL. I gave them a snack. Dragons like crackers, who knew!',
        ifFlag: 'ember-hatched',
      },
    ],
  },
  'hub-innkeeper': {
    id: 'hub-innkeeper',
    name: 'Innkeeper Poppy',
    sprite: '👩‍🍳',
    role: 'innkeeper',
    lines: ['Tired, traveler? Rest here and your HP comes right back. On the house!'],
  },
  'hub-librarian': {
    id: 'hub-librarian',
    name: 'Librarian Sage',
    sprite: '🦉',
    role: 'librarian',
    lines: [
      'Every question you ever missed waits in my library. Beat it here, and it makes you stronger!',
    ],
  },
  'hub-merchant': {
    id: 'hub-merchant',
    name: 'Merchant Maple',
    sprite: '🦝',
    role: 'merchant',
    lines: ['Potions! Hint feathers! Shiny badges! Coins well spent, friend.'],
  },

  // --- Numbria (math) ---
  'sage-abacus': {
    id: 'sage-abacus',
    name: 'Sage Abacus',
    sprite: '🧙',
    role: 'sage',
    topic: 'math',
    lines: [
      'Numbers are the oldest song in Lumina. Let me teach you to sing it in battle.',
    ],
  },
  'numbria-villager': {
    id: 'numbria-villager',
    name: 'Tally',
    sprite: '👧',
    role: 'villager',
    lines: [
      'The Null Fiend turned our counting river to zeroes! It hides past the far gate.',
      { text: 'You restored the Crystal of Numbers! I can count the stars again!', ifFlag: 'crystal-math-restored' },
    ],
  },
  'numbria-merchant': {
    id: 'numbria-merchant',
    name: 'Peddler Plus',
    sprite: '🦊',
    role: 'merchant',
    lines: ['Out here, a potion is worth its weight in primes.'],
  },

  // --- Verdara (science) ---
  'sage-flora': {
    id: 'sage-flora',
    name: 'Sage Flora',
    sprite: '🧝',
    role: 'sage',
    topic: 'science',
    lines: ['Every leaf is an experiment. Learn why things grow, and you will bloom in battle.'],
  },
  'verdara-villager': {
    id: 'verdara-villager',
    name: 'Fern',
    sprite: '👦',
    role: 'villager',
    lines: [
      'The Smog Fiend choked our skies. The fireflies forgot how to glow…',
      { text: 'The skies are clear! The fireflies remember everything now!', ifFlag: 'crystal-science-restored' },
    ],
  },
  'verdara-merchant': {
    id: 'verdara-merchant',
    name: 'Trader Tadpole',
    sprite: '🐸',
    role: 'merchant',
    lines: ['Fresh from the lab-lily pads: potions and hints!'],
  },

  // --- Gearfall (engineering) ---
  'sage-cog': {
    id: 'sage-cog',
    name: 'Sage Cog',
    sprite: '🧑‍🔧',
    role: 'sage',
    topic: 'engineering',
    lines: ['Everything is a machine if you look closely enough. Even a good answer.'],
  },
  'gearfall-villager': {
    id: 'gearfall-villager',
    name: 'Rivet',
    sprite: '👷',
    role: 'villager',
    lines: [
      'The Rust Fiend jammed the great canyon engine. Nothing turns like it used to.',
      { text: 'The great engine hums again — you fixed more than gears!', ifFlag: 'crystal-engineering-restored' },
    ],
  },
  'gearfall-merchant': {
    id: 'gearfall-merchant',
    name: 'Vendor Volt',
    sprite: '🐹',
    role: 'merchant',
    lines: ['Sturdy goods, fair prices, zero loose screws.'],
  },

  // --- Chromaria (creativity) ---
  'sage-muse': {
    id: 'sage-muse',
    name: 'Sage Muse',
    sprite: '🧚',
    role: 'sage',
    topic: 'creativity',
    lines: ['Imagination is a muscle, little hero. Stretch it, and battles become art.'],
  },
  'chromaria-villager': {
    id: 'chromaria-villager',
    name: 'Doodle',
    sprite: '🧑‍🎨',
    role: 'villager',
    lines: [
      'The Gray Fiend drank all our colors. My paintings just sigh now.',
      { text: 'Color is back! I am going to paint EVERYTHING!', ifFlag: 'crystal-creativity-restored' },
    ],
  },
  'chromaria-merchant': {
    id: 'chromaria-merchant',
    name: 'Seller Swirl',
    sprite: '🐙',
    role: 'merchant',
    lines: ['Eight arms, endless bargains!'],
  },
};
