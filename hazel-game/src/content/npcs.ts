import type { ServiceType, Topic } from '../types';
import { MET_ELDER, fogSeenFlag, litFlag } from './zones';
import { fieldSpellFlag } from './fieldSpells';
import { keyFlag } from './keys';
import { BOAT_MENDED } from './boat';
import { handedOverFlag, questOfferedFlag } from './quests';

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

/** `keeper`: a shrine keeper, who teaches a field spell by a short trial (#75 item 9). */
export type NpcRole = 'villager' | 'sage' | 'merchant' | 'innkeeper' | 'librarian' | 'keeper';

export interface WorldNpcDef {
  id: string;
  name: string;
  sprite: string;
  /**
   * key into src/content/sprites.ts SPRITES. Defaults to the NPC `id` (the
   * generated art is keyed by id — see `npcSpriteId`); falls back to `sprite`
   * (emoji) when neither resolves.
   */
  spriteId?: string;
  role: NpcRole;
  /** Sages belong to a topic; opens that topic's Sage screen. */
  topic?: Topic;
  lines: DialogueLine[];
  /**
   * Force a villager to stay put even though villagers normally roam — for
   * quest-givers, key story figures, and warden signposts the player must be
   * able to find reliably. Service roles are always stationary regardless.
   * See `lib/wander.ts` `npcWanders`.
   */
  stationary?: boolean;
  /**
   * Short throwaway one-liners that occasionally float above the NPC on the map
   * for ambient life (wandering-NPC pass). Distinct from `lines` (conversation).
   */
  ambient?: string[];
  /**
   * Tells you where to go next (#75 item 6): after their own lines, a "where
   * to next?" line keyed to the story, with the way there from where they
   * stand. See `lib/wayfinding.ts`.
   */
  guide?: boolean;
  /**
   * Gives big-picture tips on what to do next (#75 item 8, Elder Lumen in the
   * Library): after their own lines, the plan for this stage of the story and
   * one practical tip (`mentorTips`, `lib/wayfinding.ts`). `invite` closes
   * the first meeting, before `MET_ELDER` is set — where to find them again.
   */
  mentor?: { invite: string };
  /**
   * A signpost, not a person (#75 item 6): it reads out the places around it
   * by direction, worked out from the map, then the way to the next goal.
   * Its `lines` stay empty. Place it beside a crossroads, off the road.
   */
  signpost?: boolean;
}

/** The sprite-manifest key for an NPC (explicit `spriteId`, else its id). */
export function npcSpriteId(def: WorldNpcDef): string {
  return def.spriteId ?? def.id;
}

/** Which service overlay (if any) talking to this role opens after dialogue. */
export const ROLE_SERVICE: Partial<Record<NpcRole, ServiceType>> = {
  sage: 'sage',
  merchant: 'shop',
  innkeeper: 'inn',
  librarian: 'library',
  keeper: 'trial',
};

export const NPC_DEFS: Record<string, WorldNpcDef> = {
  // --- Home: Lumina Village's east end (moved in from Lumina Field when it
  // retired as a hub, #75 item 8; the hub-* ids are kept for saves + quests) ---
  'elder-lumen': {
    id: 'elder-lumen',
    name: 'Elder Lumen',
    sprite: '👴',
    role: 'villager',
    stationary: true,
    // Meets a new hero on the plaza, then keeps the Library (two placements in
    // zones.ts that hand over on MET_ELDER), where he gives tips (#75 item 8).
    mentor: {
      invite:
        'I keep the Lumina Library, at the far east end of town. Come and find me there whenever you wonder what to do next!',
    },
    lines: [
      // First meeting, on the plaza.
      {
        text: 'Welcome home, brave one! I am Elder Lumen. A fog of Forgetting has dimmed our four Crystals of Knowing.',
        unlessFlag: MET_ELDER,
        setFlag: MET_ELDER,
      },
      {
        text: 'Every question you answer returns a spark of light. Learning is our magic!',
        unlessFlag: MET_ELDER,
      },
      // Afterwards, in the Library.
      {
        text: 'Ah, welcome to the Library, young one! Sit, sit — let us look at where your journey stands.',
        ifFlag: MET_ELDER,
      },
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
        // Once all four are back (the ending scene sets it), not after the first.
        ifFlag: 'ending-seen',
      },
      {
        text: 'You climbed the Spire and faced Umbra itself. Lumina will tell your story for a thousand years, brave one.',
        ifFlag: 'spire-cleared',
      },
    ],
  },
  'hub-kid': {
    id: 'hub-kid',
    name: 'Pip',
    sprite: '🧒',
    role: 'villager',
    stationary: true,
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
      {
        text: 'You beat the SPIRE?! You are the bravest kid EVER. Teach me everything someday, okay?',
        ifFlag: 'spire-cleared',
      },
    ],
  },
  'hub-innkeeper': {
    // Id kept from when Poppy stood in the hub; she now runs Lumina's one Inn
    // in the village (#73 — one of each service in the world).
    id: 'hub-innkeeper',
    name: 'Innkeeper Poppy',
    sprite: '👩‍🍳',
    role: 'innkeeper',
    lines: [
      'Welcome to the Sleepy Sheep Inn! Rest here and your HP comes right back. On the house!',
      // Every town has an inn now (#75 item 11) — and inns hear every rumor.
      'A courier told me there\'s an inn in every town on Dawnreach. Rest in any of them, and that\'s where you\'ll wake if a battle goes badly.',
      {
        text: 'Travelers say the Echo Mine, in the ridge north-east of here, went pitch dark when the fog came. Nobody\'s been down since.',
        unlessFlag: litFlag('echo-mine'),
      },
    ],
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
    stationary: true,
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
    stationary: true,
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
    lines: ['Fresh from the lab-lily pads: Berry Potions and my famous Honey Elixir!'],
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
    stationary: true,
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
    stationary: true,
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
    stationary: true,
    guide: true,
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
    ambient: ['*kneads bread*', 'Off racing again?', 'Mind the burnt loaf!'],
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
    ambient: ['*trims a wick*', 'A little more light…', 'The lanterns sputter.'],
  },

  // --- Whispering Woods ---
  // --- Lumina Village (#72/#73) — Clove's Curios; Poppy runs the only Inn ---
  'village-shopkeeper': {
    id: 'village-shopkeeper',
    name: 'Shopkeep Clove',
    sprite: '🧑‍💼',
    role: 'merchant',
    lines: [
      "Welcome to Clove's Curios! Nothing useful, everything wonderful — badges from every corner of Lumina.",
    ],
  },
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
    ambient: ['*flickers softly*', 'Ooh, a riddle!', '✨', 'The trees whisper.'],
  },
  // Warns the player before the Thicket Warden — and points the reward home (#59).
  'woods-warden-sign': {
    id: 'woods-warden-sign',
    name: 'Old Bracken',
    sprite: '🦡',
    role: 'villager',
    stationary: true,
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
    // He gives "Marlow's Boat" (#75 item 14): quest-givers stay put.
    stationary: true,
    lines: [
      'The fog rolled out to sea and the fish forgot the way home. Now I mostly catch old boots. Tasty boots, mind you. Acquired taste.',
      'They call it Starfall Coast because the stars used to land here to rest. Then the Smog Fiend smudged the sky. Clear it, and maybe they\'ll come back.',
      {
        text: 'Look! A star skipped across the water last night, plain as a thrown stone. The coast remembers its name again. So do I.',
        ifFlag: 'crystal-science-restored',
      },
      // Once his boat is mended (#75 item 14, "Marlow's Boat").
      {
        text: "The Biscuit's yours whenever you like — my dock's just east of here. Sail off the edge of the sea to reach the Silver Shallows!",
        ifFlag: BOAT_MENDED,
      },
    ],
    ambient: ['*casts a line*', 'Caught a boot.', 'Tide is turning…'],
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
    ambient: ['*peers skyward*', 'So many stars…', 'What is that one called?'],
  },
  // --- The Silver Shallows (#75 item 14) ---
  // A lighthouse keeper on Gull Rock, the first island you sail up to.
  'gull-lamplighter': {
    id: 'gull-lamplighter',
    name: 'Lamplighter Ness',
    sprite: '🏮',
    role: 'villager',
    stationary: true,
    lines: [
      "A visitor! By BOAT! Oh, my lamp hasn't had anyone to shine for in a hundred years.",
      "I'm Ness. I kept this lighthouse lit all through the fog, just in case somebody came. Nobody did. I'd do it again.",
      'These islands are only now remembering they exist. Some mornings I count a new one! Yesterday it was a rock shaped like a sneeze.',
      'See the little sandbar to the south-east? Sandpiper Cay. The sandpipers say there\'s a chest on it. Sandpipers say a LOT of things.',
      // Sea critters (#75 item 14d): why the ones out there never bother you on the sand.
      "Puffers, inklings, starfish… sea critters splash about out there now. They only bother boats — on the sand you're as safe as a shell!",
      "And east, past everything, sits the Great Fogbank. Don't sail into it. Even the gulls go around.",
    ],
    ambient: ['*polishes the lamp*', 'Ship ahoy? …Oh, it\'s you!', 'Shine on, little light.'],
  },

  // Warns the player before the Tide Colossus — and points the reward home (#59).
  'coast-warden-sign': {
    id: 'coast-warden-sign',
    name: 'Castaway Pell',
    sprite: '🦭',
    role: 'villager',
    stationary: true,
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
      // The Depths run three floors deep since #75 item 10.
      {
        text: 'The Clockwork Titan? It clanked off down the stairs to the old forge — two floors down, past the Gear Halls. The gatekeeper here guards the way.',
        unlessFlag: 'key-gearfall-key',
      },
      {
        text: 'The Rust Fiend fell? I FELT it — every gear down here turned over in its sleep and sighed. You woke the whole deep, friend.',
        ifFlag: 'crystal-engineering-restored',
      },
    ],
    ambient: ['*taps a gear*', 'Tick… tock…', 'Mind that one, it bites!'],
  },
  'depths-echo': {
    id: 'depths-echo',
    name: 'Echo',
    sprite: '🤖',
    role: 'villager',
    lines: [
      'HELLO hello hello… sorry. Down here every word comes back three times. I have been alone with my own voice a very long while.',
      'I am the last lantern-bot of the deep. I keep one light burning for the crystals\' sake. Tell me a bright answer and I will keep it glowing.',
      'The Gear Halls below are dim — my light never reached them. Mind the side hall: it is darker still.',
    ],
    ambient: ['hello… hello… hello…', '*hums an echo*', 'Anyone… anyone…?'],
  },
  // Warns the player before the Clockwork Titan — and points the reward home (#59).
  'depths-warden-sign': {
    id: 'depths-warden-sign',
    name: 'Ratchet the Wind-Up',
    sprite: '🔧',
    role: 'villager',
    stationary: true,
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
    stationary: true,
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

  // --- Moonwell Grove (hidden side-region off Lumina Village) ---
  'grove-guardian': {
    id: 'grove-guardian',
    name: 'Lune the Moonkeeper',
    sprite: '🌙',
    role: 'villager',
    stationary: true,
    lines: [
      {
        text: 'Hush now — you found it. Moonwell Grove. I am Lune, keeper of the well that once mirrored every bright memory in Lumina.',
        unlessFlag: 'met-lune',
        setFlag: 'met-lune',
      },
      'The fog of Forgetting drank the well\'s reflection dark. Now it shows nothing at all — not the moon, not the stars, not even your own brave face.',
      {
        text: 'Help me wake it, little light: the old chest by the water keeps a riddle, and dim-winged moths nest where the moon should shine. Answer the one, shoo the others.',
        unlessFlag: 'quest:grove-moonwell:done',
      },
      {
        text: 'Look — the Moonwell shines again, and it remembers YOUR face first of all. Come back whenever you need to see something bright.',
        ifFlag: 'quest:grove-moonwell:done',
      },
    ],
  },
  'grove-firefly': {
    id: 'grove-firefly',
    name: 'Glim',
    sprite: '🦋',
    role: 'villager',
    lines: [
      'I dance on the dark water so it does not feel so lonely. One little light is still a light!',
      {
        text: 'The well glows now and we dance in its reflection — a hundred Glims where there was only me. Come dance!',
        ifFlag: 'quest:grove-moonwell:done',
      },
    ],
    ambient: ['*flutters*', 'One little light…', '✨'],
  },
  'grove-otter': {
    id: 'grove-otter',
    name: 'Ripple',
    sprite: '🦦',
    role: 'villager',
    lines: [
      'The water used to tell me stories when I floated on my back. Lately it just… holds its breath. Spooky, right?',
      'Lune says memories live in the Moonwell. I hope mine are in there — the good ones, with my whole raft of cousins.',
    ],
    ambient: ['*splash!*', '*floats on its back*', 'The water is so still…'],
  },

  // --- Village expansion: new townsfolk (side quests + secret hints) --------
  // Lumina Village — east district
  'village-mayor': {
    id: 'village-mayor',
    name: 'Mayor Marigold',
    sprite: '🎩',
    role: 'villager',
    stationary: true,
    lines: [
      'Welcome to the Town Hall! I am Mayor Marigold. I sign every important paper in Lumina Village with the golden Town Seal.',
      {
        text: 'Thank you again for finding my seal. The paperwork is flowing like a river! A very boring river.',
        ifFlag: 'quest:mayor-seal:done',
      },
    ],
  },
  'village-clover-merchant': {
    id: 'village-clover-merchant',
    name: 'Grocer Clover',
    sprite: '🧺',
    role: 'merchant',
    lines: ["Fresh from the hills! Lucky clovers, picked at dawn. Win a battle holding one and the coins just pour in!"],
  },
  'village-baker': {
    id: 'village-baker',
    name: 'Baker Dot',
    sprite: '🥐',
    role: 'villager',
    stationary: true,
    lines: [
      'Mmm, smell that? Honey buns, fresh out of the oven! I bake before the sun gets up. The sun is VERY lazy.',
      {
        text: 'Grandmother Wick and Keeper Sol both loved their buns. You are the fastest delivery hero in Lumina!',
        ifFlag: 'quest:bakery-deliveries:done',
      },
    ],
  },
  'village-guard': {
    id: 'village-guard',
    name: 'Guard Rook',
    sprite: '💂',
    role: 'villager',
    lines: [
      'Guard Rook, on patrol! Nothing gets past me. Except butterflies. And bees. And, once, a very polite goose.',
      'Psst. When the sun hits the plaza fountain just right, I swear something golden glints at the bottom.',
      'The Mayor keeps old books in the Town Hall. Some of them are not books at all… if you know what I mean. I do not know what I mean.',
    ],
    ambient: ['*marches*', 'All clear!', 'Was that a goose?'],
  },
  'village-kid': {
    id: 'village-kid',
    name: 'Nib',
    sprite: '👦',
    role: 'villager',
    lines: [
      'Wanna know a secret? The hedge around the corner garden has a gap you can squeeze through. It looks solid… but it is NOT!',
      'Look for the little twinkles ✦ — that is where secrets hide. Every town has some. I have found… zero. But YOU might!',
      {
        text: 'You found the secret garden?! I KNEW it was real. Best day ever.',
        ifFlag: 'secret:village-secret-garden',
      },
    ],
    ambient: ['✦?', '*hops*', 'Secrets everywhere!'],
  },

  // Numbria — south district
  'numbria-tea-merchant': {
    id: 'numbria-tea-merchant',
    name: 'Auntie Chai',
    sprite: '🍵',
    role: 'merchant',
    lines: ['Sit, sit! One cup of Focus Tea and your next swing lands twice as hard. Mathematicians swear by it!'],
  },
  'numbria-teacher': {
    id: 'numbria-teacher',
    name: 'Teacher Pi',
    sprite: '👩‍🏫',
    role: 'villager',
    stationary: true,
    lines: [
      'Welcome to the Numbria Schoolhouse! Today we are learning that 3.14159… oh, you have heard this one.',
      {
        text: 'Thanks to you, the class has all its lessons back. Everyone gets a gold star. You get TWO.',
        ifFlag: 'quest:lost-lessons:done',
      },
    ],
  },
  'numbria-kid': {
    id: 'numbria-kid',
    name: 'Dos',
    sprite: '🧒',
    role: 'villager',
    stationary: true,
    lines: [
      'My twin Uno counts forwards and I count backwards. We meet in the middle at lunch.',
      {
        text: 'The slimes are gone and I can do my sums outside again. Ten, nine, eight… you are the BEST!',
        ifFlag: 'quest:dos-slimes:done',
      },
    ],
  },
  'numbria-sundial': {
    id: 'numbria-sundial',
    name: 'Sundial Sid',
    sprite: '🧔',
    role: 'villager',
    stationary: true,
    lines: [
      'I tell the time by shadows. The shadow on the west hill is wrong, though — it points INTO the rock. Rocks do not have insides… do they?',
      'People toss coins in the town pond for luck. Nobody ever fishes them out. Somebody should. For science.',
    ],
  },

  // Verdara — east meadow
  'verdara-seed-merchant': {
    id: 'verdara-seed-merchant',
    name: 'Sunny',
    sprite: '🌻',
    role: 'merchant',
    lines: ['Sunseed Snacks! Crunchy, sunny, and they top up your spell charge too. Grown right here in the meadow!'],
  },
  'verdara-beekeeper': {
    id: 'verdara-beekeeper',
    name: 'Beekeeper Hilda',
    sprite: '🐝',
    role: 'villager',
    stationary: true,
    lines: [
      'Bzz-welcome! My bees make the sweetest honey in all of Verdara. Mind the hives — they are friendly but VERY busy.',
      {
        text: 'The Queen is home and the hives are humming. Listen — that buzz is a thank-you song!',
        ifFlag: 'quest:queen-bee:done',
      },
    ],
  },
  'verdara-kid': {
    id: 'verdara-kid',
    name: 'Sprout',
    sprite: '🧒',
    role: 'villager',
    lines: [
      'I live in the treehouse! I keep a snack stash under my hammock. For emergencies. Snack emergencies.',
      'The trees east of the big meadow whisper and wiggle. I think there is a hole in them. A bee-sized hole. Or a you-sized one!',
    ],
    ambient: ['*climbs*', 'Treehouse rules!', 'Snack time?'],
  },
  'verdara-botanist': {
    id: 'verdara-botanist',
    name: 'Professor Petal',
    sprite: '👩‍🔬',
    role: 'villager',
    stationary: true,
    lines: [
      'I study every leaf, petal and root in Verdara. Did you know sunflowers follow the sun across the sky? Show-offs.',
      {
        text: 'The moonbloom cutting is thriving in the treehouse garden. Science AND friendship — the best kind of experiment!',
        ifFlag: 'quest:garden-survey:done',
      },
    ],
  },

  // Gearfall — east district + Clockwork Plaza
  'gearfall-coil-merchant': {
    id: 'gearfall-coil-merchant',
    name: 'Mechanic Spring',
    sprite: '🔩',
    role: 'merchant',
    lines: ['Coil & Spring, open all hours! A Turbo Coil fills your spell charge right to the top. Zzzap!'],
  },
  'gearfall-inventor': {
    id: 'gearfall-inventor',
    name: 'Professor Sprocket',
    sprite: '🥽',
    role: 'villager',
    stationary: true,
    lines: [
      'Professor Sprocket, inventor extraordinaire! Today I invented a spoon that stirs itself. Tomorrow: a self-tying shoe!',
      'I keep spare parts under my bed. Everyone should. Where else would you keep them? In a DRAWER? Preposterous.',
    ],
  },
  'gearfall-clockkeeper': {
    id: 'gearfall-clockkeeper',
    name: 'Tock',
    sprite: '🕰️',
    role: 'villager',
    stationary: true,
    lines: [
      'Tick… tock… tick… The Clocktower has kept Gearfall on time for a hundred years. Well. Mostly on time.',
      {
        text: 'Both gears home and the great clock sings on the hour again. Gearfall will never be late — thanks to you!',
        ifFlag: 'quest:tock-gears:done',
      },
    ],
  },
  'gearfall-apprentice': {
    id: 'gearfall-apprentice',
    name: 'Widget',
    sprite: '🧑‍🔧',
    role: 'villager',
    stationary: true,
    lines: [
      'I am Professor Sprocket\'s apprentice! I hold the wrench. Sometimes I hold TWO wrenches.',
      'There is a crate by the Clocktower with a loose plate. It rattles when the wind blows. Rattle rattle!',
    ],
  },

  // Chromaria — south district
  'chromaria-mirror-merchant': {
    id: 'chromaria-mirror-merchant',
    name: 'Glint',
    sprite: '🪞',
    role: 'merchant',
    lines: ['Mirror, mirror, on the shelf — a Mirror Charm bounces a foe\'s next hit right back at itself! Clever, no?'],
  },
  'chromaria-curator': {
    id: 'chromaria-curator',
    name: 'Madame Hue',
    sprite: '🖼️',
    role: 'villager',
    stationary: true,
    lines: [
      'Welcome to the Grand Gallery, darling! Every painting here was rescued from the gray. Well — almost every painting.',
      {
        text: '"Sunrise in Seven Colours" is back on its wall where it belongs. Visitors weep. With JOY, darling.',
        ifFlag: 'quest:masterpiece:done',
      },
    ],
  },
  'chromaria-musician': {
    id: 'chromaria-musician',
    name: 'Bard Lyra',
    sprite: '🎻',
    role: 'villager',
    stationary: true,
    lines: [
      'La la LAAA! In Chromaria every colour has a note. Red is a trumpet. Blue is a cello. Gray is… a sigh.',
      {
        text: 'Our Song of Colors plays in every street now. Can you hear yourself in it? You are the high, brave part!',
        ifFlag: 'quest:song-of-colors:done',
      },
    ],
  },
  'chromaria-kid': {
    id: 'chromaria-kid',
    name: 'Clay',
    sprite: '🧑‍🎨',
    role: 'villager',
    lines: [
      'I make statues! My best ones live in a secret garden past the west wall. The wall has a soft spot. Shh!',
      'Madame Hue lost her favourite painting. I bet it is somewhere nobody looks… like a garden full of statues.',
    ],
    ambient: ['*sculpts*', 'Squish!', 'Art!'],
  },

  // --- Dawnreach, the overworld (#75 Phase 1) ---------------------------------
  // A scout at the Village crossroads: every road, in one breath, and a nudge
  // toward the world map — so a kid always knows where to go next.
  'dawnreach-scout': {
    id: 'dawnreach-scout',
    name: 'Scout Tamsin',
    sprite: '🧭',
    role: 'villager',
    stationary: true,
    guide: true,
    lines: [
      'Hi! I\'m mapping all of Dawnreach. Want the short version? Here goes!',
      'West: the Whispering Woods. East: Starfall Coast, where the land runs out.',
      'At the four corners lie the crystal lands: Numbria north-west, Gearfall Canyon north-east, Verdara south-west and Chromaria south-east!',
      // Regional difficulty (#75 item 12): what the "!" by a critter's level means, and where the gentle road is.
      'Some lands have tougher critters than others!',
      "See a ! after a critter's level? It hits harder — but drops more coins. Open your 📜 Menu: the 🚩 on the map shows where to go next.",
      // The Spire hides in its ring of fog until the first crystal (#75 item 7).
      {
        text: "South, past the hills, the Crystal Spire hides in a ring of fog. I haven't been able to draw it yet! Restore a crystal and the fog should lift.",
        unlessFlag: fogSeenFlag('spire-fog'),
      },
      {
        text: 'South, past the hills: the Crystal Spire, out of the fog at last! You can see it from almost anywhere — lost? Look for the Spire!',
        ifFlag: fogSeenFlag('spire-fog'),
      },
      {
        text: 'Far to the north-east, an old shrine hides behind the fog. Nobody\'s been there since the fog came.',
        unlessFlag: 'met-wren',
      },
      { text: 'You found the Shrine of First Light! I\'m drawing it on my map RIGHT NOW. With extra sparkles.', ifFlag: 'met-wren' },
      'Tip: open the 📜 Menu to see my map. I drew the trees myself. All of them. Each one. Individually.',
    ],
    ambient: ['Hmm… north is that way.', '*scribbles on a map*', 'So many places to draw!'],
  },
  // Crossroads signposts (#75 item 6). What they say is worked out from the
  // map (lib/wayfinding.ts), so a repainted map can't make them lie.
  'dawnreach-sign-west': {
    id: 'dawnreach-sign-west',
    name: 'Signpost',
    sprite: '🪧',
    spriteId: 'signpost',
    role: 'villager',
    stationary: true,
    signpost: true,
    lines: [],
  },
  'dawnreach-sign-east': {
    id: 'dawnreach-sign-east',
    name: 'Signpost',
    sprite: '🪧',
    spriteId: 'signpost',
    role: 'villager',
    stationary: true,
    signpost: true,
    lines: [],
  },
  'dawnreach-sign-north': {
    id: 'dawnreach-sign-north',
    name: 'Signpost',
    sprite: '🪧',
    spriteId: 'signpost',
    role: 'villager',
    stationary: true,
    signpost: true,
    lines: [],
  },
  'dawnreach-sign-fork': {
    id: 'dawnreach-sign-fork',
    name: 'Signpost',
    sprite: '🪧',
    spriteId: 'signpost',
    role: 'villager',
    stationary: true,
    signpost: true,
    lines: [],
  },
  // Old Wren kept one candle burning here through the whole fog.
  // Old Wren keeps the Shrine of First Light, and teaches Glow (#75 item 9).
  'shrine-keeper': {
    id: 'shrine-keeper',
    name: 'Old Wren',
    sprite: '🕯️',
    role: 'keeper',
    stationary: true,
    lines: [
      { text: 'Welcome, little light. This is the Shrine of First Light — the oldest lit place in all of Dawnreach.', setFlag: 'met-wren' },
      'When the fog rolled in, I kept one candle burning here. Just one. It was enough to remember the way.',
      'I\'ve kept that candle lit for sixty years. I blinked once. Very nervous blink.',
      { text: 'Your dragon is warm as a hearth! Ember would make a fine candle-keeper. Don\'t tell the candle.', ifFlag: 'ember-hatched' },
      {
        text: 'Now I can teach you to carry the light with you: Glow. Answer three riddles about how the world works, and it\'s yours.',
        unlessFlag: fieldSpellFlag('glow'),
      },
      {
        text: 'There\'s an old mine in the ridge just south of here — the Echo Mine. It has been dark since the fog came. Glow would light it again.',
        unlessFlag: litFlag('echo-mine'),
      },
      { text: 'The Forgotten One fell, and still my candle burns. Good. Some lights are for keeping.', ifFlag: 'spire-cleared' },
    ],
  },

  // ── An inn in every town, and travelers who carry the news (#75 item 11) ──
  // Every town points onward: the innkeeper and a traveler each name another
  // place and what's there (zones.test checks every town has someone who does).
  'numbria-innkeeper': {
    id: 'numbria-innkeeper',
    name: 'Innkeeper Tabitha',
    sprite: '🧶',
    role: 'innkeeper',
    lines: [
      'Welcome to the Square Root Inn! Every bed is exactly the right size. I measured. Twice.',
      {
        text: "A traveler told me the Wayfarer's Shrine, just north-west of Lumina Village, teaches a spell that flies you home. Think of the shoes you'd save!",
        unlessFlag: fieldSpellFlag('return'),
      },
      'They say Verdara, way down in the south-west corner of Dawnreach, grows flowers taller than houses.',
    ],
  },
  'numbria-traveler': {
    id: 'numbria-traveler',
    name: 'Pilgrim Oriel',
    sprite: '🎒',
    role: 'villager',
    lines: [
      "I'm walking every road on Dawnreach! These are my third pair of boots.",
      {
        text: 'In the Whispering Woods, west of Lumina Village, a Thicket Warden guards a key. Or so the squirrels say. Squirrels exaggerate.',
        unlessFlag: keyFlag('verdara-key'),
      },
      'Have you seen Starfall Coast, east of Lumina Village? The sand there sparkles at night like it fell from the sky.',
    ],
    ambient: ['Left foot, right foot…', 'Which way is north again?', '🎒'],
  },
  'verdara-innkeeper': {
    id: 'verdara-innkeeper',
    name: 'Innkeeper Willow',
    sprite: '🌿',
    role: 'innkeeper',
    lines: [
      'Welcome to the Mossy Pillow Inn! The pillows are real moss. Very soft. Only a little bit damp.',
      {
        text: 'Down in the Clockwork Depths, the stairs go three floors deep. Something big still ticks at the bottom.',
        unlessFlag: keyFlag('gearfall-key'),
      },
      {
        text: 'A ranger says the Echo Mine went dark when the fog came. Once the fog lifts from the Shrine of First Light, Old Wren there can teach you to carry a light.',
        unlessFlag: fieldSpellFlag('glow'),
      },
    ],
  },
  'verdara-traveler': {
    id: 'verdara-traveler',
    name: 'Collector Fennick',
    sprite: '🧳',
    role: 'villager',
    lines: [
      "I collect buttons! Four hundred and twelve so far. This one's shaped like a frog — it's my favorite.",
      'Up in Gearfall Canyon, in the north-east corner, there is a clocktower that has never once been on time. Lovely place.',
    ],
    ambient: ['Ooh, a button!', 'Four hundred and thirteen…', '🧳'],
  },
  'gearfall-innkeeper': {
    id: 'gearfall-innkeeper',
    name: 'Innkeeper Hinge',
    sprite: '🔩',
    role: 'innkeeper',
    lines: [
      'Welcome to the Wound-Down Inn — the only quiet place in Gearfall Canyon. We oil the beds so they never squeak.',
      'A tinker passing through swore that Chromaria, down in the south-east corner, has a Mirror Hall where your reflection waves first.',
      {
        text: 'They say the keeper of the Shrine of Quiet Paws, south-east of Lumina Village, can make any critter let you pass. Handy on a long walk!',
        unlessFlag: fieldSpellFlag('calm'),
      },
    ],
  },
  'gearfall-traveler': {
    id: 'gearfall-traveler',
    name: 'Courier Zip',
    sprite: '📨',
    role: 'villager',
    lines: [
      'Special delivery! …Oh. It\'s for me again. I keep doing that.',
      'I deliver all the way to Starfall Coast, east of Lumina Village. The stargazer there says every star has a question for a name.',
      {
        text: 'Out on Starfall Coast a Tide Colossus guards the Prism Key. I deliver around it. Very carefully.',
        unlessFlag: keyFlag('chromaria-key'),
      },
    ],
    ambient: ['Special delivery!', 'Coming through!', '📨'],
  },
  'chromaria-innkeeper': {
    id: 'chromaria-innkeeper',
    name: 'Innkeeper Indigo',
    sprite: '🌈',
    role: 'innkeeper',
    lines: [
      "Welcome to the Rainbow Quilt Inn! Every quilt is a different color. Pick your favorite — no, you can't have two.",
      'Have you heard? Up in Numbria, in the north-west corner, the Abacus Observatory counts the stars every single night.',
    ],
  },
  'chromaria-traveler': {
    id: 'chromaria-traveler',
    name: 'Mapmaker Atlas',
    sprite: '🗺️',
    role: 'villager',
    lines: [
      "I'm drawing a map of all of Dawnreach! So far it's mostly smudges. Very accurate smudges.",
      {
        text: 'In the hidden Moonwell Grove, south-west of Lumina Village, the moon\'s well went dark. Lune the Moonkeeper is looking for a helper.',
        unlessFlag: 'quest:grove-moonwell:done',
      },
      'Up at the Wayfarer\'s Shrine, north-west of Lumina Village, the pool is full of stars — even at noon. I drew it twice to be sure.',
    ],
    ambient: ['North is… that way?', '🗺️', 'Oops — a smudge.'],
  },

  // ── Field-spell shrines (#75 item 9) ──
  'wayfarer-keeper': {
    id: 'wayfarer-keeper',
    name: 'Wayfarer Juniper',
    sprite: '🌠',
    role: 'keeper',
    stationary: true,
    lines: [
      "Ah, a fellow traveler! I'm Juniper. I've walked every road in Dawnreach — some of them twice, by accident.",
      'My feet got tired, so I learned the stars\' trick instead: Return. Think of a town you\'ve been to, and the stars carry you there.',
      {
        text: 'Answer three star riddles and Return is yours. A wrong guess? The stars just ask another!',
        unlessFlag: fieldSpellFlag('return'),
      },
      {
        text: 'Mind the landing. I once Returned into a haystack. The hay was not expecting me either.',
        ifFlag: fieldSpellFlag('return'),
      },
    ],
  },
  'quiet-keeper': {
    id: 'quiet-keeper',
    name: 'Keeper Thistle',
    sprite: '🦔',
    role: 'keeper',
    stationary: true,
    lines: [
      "Shh… welcome to the Shrine of Quiet Paws. I'm Thistle. The critters out there aren't mean — they're scared of the fog.",
      'I know a spell that tells them, gently, "I mean no harm." It\'s called Calm. For a whole minute, every critter lets you pass.',
      {
        text: 'Answer three riddles about living things and Calm is yours. Take your time — the ponds aren\'t going anywhere.',
        unlessFlag: fieldSpellFlag('calm'),
      },
      {
        text: 'Calm won\'t work on the big bosses, mind. They\'re far too busy being dramatic.',
        ifFlag: fieldSpellFlag('calm'),
      },
    ],
    ambient: ['Shh…', 'Hello, little frog.', '🌸'],
  },
  'mine-miner': {
    id: 'mine-miner',
    name: 'Miner Mabel',
    sprite: '⛏️',
    role: 'villager',
    stationary: true,
    lines: [
      "Oh! A visitor! I'm Mabel. I've dug this mine for forty years, and I've never been this scared of the dark.",
      // While Moss's quest is on and the stone isn't cut yet (#75 item 13).
      {
        text: "Looking for Moss's Moonstone? The miners left it in the little nook up the left-hand tunnel. Bring it to me and I'll cut it for him!",
        ifFlag: questOfferedFlag({ id: 'hermit-moonstone' }),
        unlessFlag: handedOverFlag('moonstone'),
      },
      {
        text: 'When the fog came, every lamp went out at once. I ran up here and haven\'t dared go back down since.',
        unlessFlag: litFlag('echo-mine'),
      },
      {
        text: 'My treasure chest is still at the very bottom. If only someone could carry a light down there…',
        unlessFlag: litFlag('echo-mine'),
      },
      {
        text: 'You lit the lamps — every single one! Go on down. The chest at the bottom is yours. You earned it!',
        ifFlag: litFlag('echo-mine'),
      },
      'Moles are supposed to love the dark, you know. I\'m a very unusual mole. I don\'t like dirt much, either.',
    ],
  },

  // ── Item chains (#75 item 13) ──
  // Hermit Moss reads the stars from his hill beside the Echo Mine. His quest
  // (quests.ts, "The Hermit's Moonstone") speaks until it's done; these lines
  // come after.
  'dawnreach-hermit': {
    id: 'dawnreach-hermit',
    name: 'Hermit Moss',
    sprite: '🏮',
    role: 'villager',
    stationary: true,
    lines: [
      'My moon-lamp shines every night now. On a clear one I can count the stars over the far sea.',
      "Mabel cut that stone better than the miners ever could. Don't tell her I said so — she'll blush right through her fur.",
    ],
    ambient: ['*hums at the sky*', 'Clear skies tonight?', '🌙'],
  },
};
