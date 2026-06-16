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
  /** key into src/content/sprites.ts SPRITES; falls back to `sprite` (emoji) when absent */
  spriteId?: string;
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

  // --- Lumina Village (home) ---
  'village-elder': {
    id: 'village-elder',
    name: 'Grandmother Wick',
    sprite: '👵',
    role: 'villager',
    lines: [
      {
        text: 'Oh, my brave grandchild! This is the village where you grew up. The fog took the warmth from our lanterns, but never from our hearts.',
        unlessFlag: 'met-wick',
        setFlag: 'met-wick',
      },
      'I rocked your cradle by candlelight and told you stories of the four crystals. Now you live one. Funny how stories do that.',
      {
        text: 'That egg you cradle… I knew it the moment I saw it. The last dragon of Lumina only hatches for the kindest, bravest heart in the village. It chose well.',
        unlessFlag: 'ember-hatched',
      },
      {
        text: 'Look at little Ember go! Mind you feed that dragon plenty of bright answers. Growing dragons are ALWAYS hungry.',
        ifFlag: 'ember-hatched',
      },
      {
        text: 'When the Spire calls you, child, do not be afraid. A keeper waits there who has watched over the crystals since before the fog. Go when you are ready.',
        ifFlag: 'crystal-math-restored',
      },
    ],
  },
  'village-friend': {
    id: 'village-friend',
    name: 'Bramble',
    sprite: '🧑',
    role: 'villager',
    lines: [
      'You and me, we used to race to the field and back before supper. Remember? You always won. Show those Fiends the same heels!',
      'I would come adventuring, but SOMEbody has to keep the village bread from burning. That somebody is me. The bread, it… does not forgive.',
      {
        text: 'A real dragon. Hatched right here. I told everyone you were special and NObody believed me. Ha!',
        ifFlag: 'ember-hatched',
      },
    ],
  },
  'village-keeper': {
    id: 'village-keeper',
    name: 'Lantern-Keeper Sol',
    sprite: '🧓',
    role: 'villager',
    lines: [
      'I keep every lantern in the village lit. Lately they sputter — the fog drinks light the way a thirsty traveler drinks water.',
      'Each crystal you restore, my lanterns burn a little brighter. I can almost read by them again!',
      {
        text: 'Four crystals home, and the whole village glows like a held breath finally let go. You did this. A child from our own little field.',
        ifFlag: 'crystal-creativity-restored',
      },
    ],
  },

  // --- Whispering Woods ---
  'woods-hermit': {
    id: 'woods-hermit',
    name: 'Hazel the Spellwright',
    sprite: '🧙‍♀️',
    role: 'villager',
    lines: [
      {
        text: 'Shh — the trees are remembering something. They do that, when a curious one walks by. Welcome to the Whispering Woods.',
        unlessFlag: 'met-hazel',
        setFlag: 'met-hazel',
      },
      'I am a spellwright. I do not throw fire or frost — I weave KNOWING into shapes. So can you, in battle. Have you opened your Spellbook?',
      'Here is the secret nobody tells you: a spell is just a hard question you were brave enough to answer. The harder the question, the brighter the spell.',
      'Mend a wound. Raise a shield. Or borrow Ember\'s own fire, once that dragon is fully grown. Every Sage you meet teaches you one more verse of the song.',
      {
        text: 'You carry a true dragon now. When Ember is grown, ask the woods to teach you its Breath — the brightest spell of all.',
        ifFlag: 'ember-hatched',
      },
    ],
  },
  'woods-sprite': {
    id: 'woods-sprite',
    name: 'Wisp',
    sprite: '🧚',
    role: 'villager',
    lines: [
      'Down past the roots there is a stair, and past the stair, the Clockwork Depths. Old machines sleep there. Be gentle, they dream of working again.',
      'I am made of leftover questions, you know. The ones nobody answered. When you answer yours, a little of me lights up. Thank you for that.',
    ],
  },
  // Warns the player before the Thicket Warden — and points the reward home (#59).
  'woods-warden-sign': {
    id: 'woods-warden-sign',
    name: 'Old Bracken',
    sprite: '🦡',
    role: 'villager',
    lines: [
      {
        text: 'Careful, sprout — that great stag deeper in is the Thicket Warden, no cuddly critter. It carries the Verdant Key on its antlers.',
        unlessFlag: 'key-verdara-key',
      },
      {
        text: 'Best it and the Verdant Key is yours — it opens the Smog Fiend\'s gate over in Verdara. Bring your sharpest answers, little one.',
        unlessFlag: 'key-verdara-key',
      },
      {
        text: 'You bested the Warden! The Verdant Key glows in your pack now — Verdara\'s gate will swing wide for it. Off you go.',
        ifFlag: 'key-verdara-key',
      },
    ],
  },

  // --- Starfall Coast ---
  'coast-fisher': {
    id: 'coast-fisher',
    name: 'Old Marlow',
    sprite: '🎣',
    role: 'villager',
    lines: [
      'The fog rolled out to sea and the fish forgot the way home. Now I mostly catch old boots. Tasty boots, mind you. Acquired taste.',
      'They call it Starfall Coast because the stars used to land here to rest. Then the Smog Fiend smudged the sky. Clear it, and maybe they\'ll come back.',
      {
        text: 'Look! A star skipped across the water last night, plain as a thrown stone. The coast remembers its name again. So do I.',
        ifFlag: 'crystal-science-restored',
      },
    ],
  },
  'coast-stargazer': {
    id: 'coast-stargazer',
    name: 'Vela',
    sprite: '🔭',
    role: 'villager',
    lines: [
      'Every star has a question for a name. The fog made us forget them. Each brave answer you give writes one back into the sky.',
      'See that bright one low in the west? I named it after a kid who would not stop asking why. …It does not have to be you. But it could be.',
    ],
  },
  // Warns the player before the Tide Colossus — and points the reward home (#59).
  'coast-warden-sign': {
    id: 'coast-warden-sign',
    name: 'Castaway Pell',
    sprite: '🦭',
    role: 'villager',
    lines: [
      {
        text: 'Psst — that swell out on the sand is no wave. It is the Tide Colossus, and it keeps the Prism Key on its back.',
        unlessFlag: 'key-chromaria-key',
      },
      {
        text: 'Climb it and take the Prism Key — it unlocks the Gray Fiend\'s gate all the way over in Chromaria. Mind its big questions!',
        unlessFlag: 'key-chromaria-key',
      },
      {
        text: 'You rode the Colossus down and won! The Prism Key is yours — Chromaria\'s gate is waiting on you now.',
        ifFlag: 'key-chromaria-key',
      },
    ],
  },

  // --- Clockwork Depths ---
  'depths-tinker': {
    id: 'depths-tinker',
    name: 'Cricket',
    sprite: '🐭',
    role: 'villager',
    lines: [
      'Mind the gears! Half of them are sleeping and half are grumpy and you cannot always tell which until you tap one.',
      'The great machines down here built the Spire, long ago — crystal-light and clockwork together. The Rust Fiend tried to seize it all, up in Gearfall.',
      {
        text: 'The Rust Fiend fell? I FELT it — every gear down here turned over in its sleep and sighed. You woke the whole deep, friend.',
        ifFlag: 'crystal-engineering-restored',
      },
    ],
  },
  'depths-echo': {
    id: 'depths-echo',
    name: 'Echo',
    sprite: '🤖',
    role: 'villager',
    lines: [
      'HELLO hello hello… sorry. Down here every word comes back three times. I have been alone with my own voice a very long while.',
      'I am the last lantern-bot of the deep. I keep one light burning for the crystals\' sake. Tell me a bright answer and I will keep it glowing.',
    ],
  },
  // Warns the player before the Clockwork Titan — and points the reward home (#59).
  'depths-warden-sign': {
    id: 'depths-warden-sign',
    name: 'Ratchet the Wind-Up',
    sprite: '🔧',
    role: 'villager',
    lines: [
      {
        text: 'HALT— halt. The Clockwork Titan still turns just ahead. It holds the Gearwright Key behind its chestplate.',
        unlessFlag: 'key-gearfall-key',
      },
      {
        text: 'Wind it down and the Gearwright Key drops free — it opens the Rust Fiend\'s gate up in Gearfall. Count true, friend!',
        unlessFlag: 'key-gearfall-key',
      },
      {
        text: 'The Titan sleeps and the Gearwright Key is yours! Gearfall\'s gate will turn open for it now.',
        ifFlag: 'key-gearfall-key',
      },
    ],
  },

  // --- The Crystal Spire ---
  'spire-keeper': {
    id: 'spire-keeper',
    name: 'Keeper Aurora',
    sprite: '🔮',
    role: 'villager',
    lines: [
      {
        text: 'So. The egg-bearer climbs the Spire at last. I am Aurora — I have kept this place since before the fog, waiting for a heart bright enough to fill it.',
        unlessFlag: 'met-aurora',
        setFlag: 'met-aurora',
      },
      'This Spire is the heart of Lumina. When all four crystals shine again, their light will gather HERE — and the fog of Forgetting will have nowhere left to hide.',
      {
        text: 'One crystal restored. I can feel it humming in the walls. Bring me the others, brave one. We are so close to morning.',
        ifFlag: 'crystal-math-restored',
        unlessFlag: 'crystal-creativity-restored',
      },
      {
        text: 'All four. ALL FOUR. The Spire blazes like a second sun and the fog is only a memory now. You did not just save Lumina — you reminded it how to be brave. Thank you, Hero.',
        ifFlag: 'crystal-creativity-restored',
      },
    ],
  },
};
