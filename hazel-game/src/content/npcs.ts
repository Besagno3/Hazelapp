import type { ServiceType, Topic } from '../types';
import { MET_ELDER, fogSeenFlag, litFlag } from './zones';
import { fieldSpellFlag } from './fieldSpells';
import { keyFlag } from './keys';
import { BOAT_MENDED } from './boat';
import { handedOverFlag, questOfferedFlag } from './quests';
import { BLANK_CHART_HELD, BLANK_CHART_QUEST, CODA_QUEST, NAME_LEARNED, SAY_HER_NAME_QUEST, JUNO_CAME, JUNO_QUEST, RESO_QUEST, RESO_STONES, SHUSH_QUEST, YARN_QUEST, YARN_STONES, POSY_QUEST, POSY_SAILED, POSY_WALK, escortWalkingFlag, questDoneFlag, stepFlag } from './questFlags';
import { actCrystals, crystalFlag } from './topics';
import { HALL_DEDICATED } from './spells';
import { ACT2_SEEN, ACT3_SEEN, ACT4_SEEN, HALL_CALLED, MET_GALE, MET_ROOT_AURORA, WISP_STIRRING } from './story';

/** 4 → "Four" (up to ten — the Hall's plaques). */
function numberWord(n: number): string {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n] ?? String(n);
}

/** "a, b and c". */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Friendly (non-combat) NPCs and their dialogue (#37).
 * One kid-friendly register for everyone (decided 2026-06-12) — short lines,
 * big-hearted tone, Dragon Warrior "talk to everyone" energy.
 */

export type DialogueLine =
  | string
  | {
      text: string;
      /** Show only when this save flag is set (given several, every one of them)… */
      ifFlag?: string | string[];
      /** …or only when it is NOT set (or, given several, none of them is). */
      unlessFlag?: string | string[];
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
   * How fast a wanderer ambles, against everyone else's (default 1) — Dawdle
   * the turtle (#75 item 14f) is the slowest wanderer in the game.
   */
  pace?: number;
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
  /**
   * A thing, not a person — a quest board, a lantern, a carved stone (#75
   * item 15c review): walking into it never makes it step aside. Signposts
   * are things too.
   */
  prop?: boolean;
  /**
   * A new face once a story flag is set (#75 item 16a: Wisp, once Say Her Name
   * is done) — the sprite in the world, in talk and in battle (`npcSpriteId`).
   * The canvas redraws them where they stand when it changes, and a wanderer
   * redrawn so stops wandering for that visit — give a `face` to someone
   * stationary (Wisp is).
   */
  face?: { flag: string; spriteId: string; sprite: string };
}

/** A thing, not a person — a prop or a signpost (15c review): it never steps aside. */
export function isThing(def: Pick<WorldNpcDef, 'prop' | 'signpost'> | undefined): boolean {
  return !!(def?.prop || def?.signpost);
}

/** Resolves which lines apply given the current story flags. */
export function visibleLines(lines: DialogueLine[], flags: Record<string, boolean>): DialogueLine[] {
  return lines.filter((l) => {
    if (typeof l === 'string') return true;
    if (l.ifFlag && ![l.ifFlag].flat().every((f) => flags[f])) return false;
    if (l.unlessFlag && [l.unlessFlag].flat().some((f) => flags[f])) return false;
    return true;
  });
}

/** What a line says, string or not. */
export function lineText(l: DialogueLine): string {
  return typeof l === 'string' ? l : l.text;
}

/** The sprite-manifest key for an NPC (its new `face` once that flag is set, an explicit `spriteId`, else its id). */
export function npcSpriteId(def: WorldNpcDef, flags: Record<string, boolean> = {}): string {
  if (def.face && flags[def.face.flag]) return def.face.spriteId;
  return def.spriteId ?? def.id;
}

/** The emoji an NPC falls back to (its new `face`'s once that flag is set). */
export function npcEmoji(def: WorldNpcDef, flags: Record<string, boolean> = {}): string {
  return def.face && flags[def.face.flag] ? def.face.sprite : def.sprite;
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
        // Once all four are back (the ending scene sets it), not after the first —
        // and not in Act II, where the HUD counts a fifth (#75 item 14h review).
        ifFlag: 'ending-seen',
        unlessFlag: 'act2-seen',
      },
      {
        text: 'You climbed the Spire and faced Umbra itself. Lumina will tell your story for a thousand years, brave one.',
        ifFlag: 'spire-cleared',
        unlessFlag: ACT2_SEEN,
      },
      // Act II (#75 item 14i): Lumina remembers — and the first Aster breadcrumbs.
      {
        text: "Since the Spire fell, I remember things I forgot I'd forgotten. My first day in this Library. A cat called Pudding.",
        ifFlag: ACT2_SEEN,
        // Only his newest memory line (#75 item 14i review round 3).
        unlessFlag: ['met-mnem', crystalFlag('history')],
      },
      {
        text: "Keeper Mnem has blank plaques? I've read every book here, and not one names the very first Sage. Odd. VERY odd.",
        ifFlag: 'met-mnem',
        unlessFlag: crystalFlag('history'),
      },
      {
        text: 'The Crystal of Memory whispered a name, you say? "Aster." I don\'t know it… yet my heart skipped, as if it should.',
        ifFlag: crystalFlag('history'),
        unlessFlag: ACT4_SEEN,
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
      {
        text: "Now I remember! I lost a tooth last year and NOBODY came. The fog ate the Tooth Fairy's map!",
        ifFlag: ACT2_SEEN,
      },
      {
        text: "You flew Ember right over the Great Fogbank?! I'm telling EVERYONE. I already told the chickens.",
        ifFlag: ACT3_SEEN,
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
      {
        text: "Since the fog lifted, my guests remember their dreams at breakfast. One dreamed of a boat! Have you seen Old Marlow? He's acting very sailor-ish.",
        ifFlag: ACT2_SEEN,
        unlessFlag: BOAT_MENDED,
      },
      // The reactive pass (#75 item 15h): Act III's news reaches home.
      {
        text: "A guest from Taleshore stayed last night! A whole land the fog never reached! She told me SIX bedtime stories.",
        ifFlag: crystalFlag('words'),
      },
    ],
  },
  'hub-librarian': {
    id: 'hub-librarian',
    name: 'Librarian Sage',
    sprite: '🦉',
    role: 'librarian',
    lines: [
      {
        text: 'Now I remember why I love books: someone read to me once, under a big tree. I wish I knew who.',
        ifFlag: ACT2_SEEN,
      },
      'Every question you ever missed waits in my library. Beat it here, and it makes you stronger!',
      // The Pen-Pal Papers (#75 item 15f round 3): Sage remembers Shush.
      { text: "Shush's letters always smell of candle wax. I've started my next one already!", ifFlag: questDoneFlag({ id: SHUSH_QUEST }) },
    ],
  },
  'hub-merchant': {
    id: 'hub-merchant',
    name: 'Merchant Maple',
    sprite: '🦝',
    role: 'merchant',
    lines: [
      {
        text: 'Ha! I found my good scales — under the counter, all along! So THAT\'s why I gave everyone too few berries. Sorry!',
        ifFlag: ACT2_SEEN,
      },
      'Potions! Hint feathers! Shiny badges! Coins well spent, friend.',
      {
        text: 'A boat full of Taleshore traders sailed in this morning, right through the Great Fogbank\'s mist! They pay in songs. I\'m RICH!',
        ifFlag: crystalFlag('words'),
      },
    ],
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
        unlessFlag: 'spire-cleared',
      },
      {
        text: 'My memories come back like birds to a feeder. This morning: the smell of chalk, and a kind voice asking, "Why do YOU think so?"',
        ifFlag: ACT2_SEEN,
      },
      // The first Aster breadcrumb (STORY-4X Act II), once you've met Keeper Mnem.
      {
        text: 'Keeper Mnem told you about the first Sage? Oh, spark… nobody remembers the first Sage. Not even me. Especially me.',
        ifFlag: 'met-mnem',
        // Once she has told her own memory of the daisy (#75 item 16a review round 2).
        unlessFlag: stepFlag('name-wick'),
      },
      {
        text: 'Aster! With the daisy behind her ear. Fancy me forgetting a name like that, all these years.',
        ifFlag: NAME_LEARNED,
      },
      // Wisp's beat plays only in the Woods (#129l) — a nudge back there after Memory.
      {
        text: 'Little Wisp in the Whispering Woods has been flickering like mad since the Memory crystal woke. Pay that wisp a visit, would you, spark?',
        ifFlag: crystalFlag('history'),
        unlessFlag: WISP_STIRRING,
      },
      {
        text: 'Last night I heard singing on the wind, from far across the sea. An old, old song… I almost knew the words.',
        ifFlag: crystalFlag('words'),
      },
    ],
  },
  'village-friend': {
    id: 'village-friend',
    name: 'Bramble',
    sprite: '🧑',
    role: 'villager',
    lines: [
      {
        text: 'You and me, we used to race to the field and back before supper. Remember? You always won. Show those Fiends the same heels!',
        unlessFlag: ACT2_SEEN,
      },
      'I would come adventuring, but SOMEbody has to keep the village bread from burning. That somebody is me. The bread, it… does not forgive.',
      {
        text: 'A real dragon. Hatched right here. I told everyone you were special and NObody believed me. Ha!',
        ifFlag: 'ember-hatched',
      },
      {
        text: "Now I remember: YOU taught me to race. Then I won once and you said you let me. You didn't. I won.",
        ifFlag: ACT2_SEEN,
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
      {
        text: 'I keep every lantern in the village lit. Lately they sputter — the fog drinks light the way a thirsty traveler drinks water.',
        unlessFlag: ACT2_SEEN,
      },
      'Each crystal you restore, my lanterns burn a little brighter. I can almost read by them again!',
      {
        text: 'Four crystals home, and the whole village glows like a held breath finally let go. You did this. A child from our own little field.',
        ifFlag: 'crystal-creativity-restored',
      },
      {
        text: "I remember now who taught me to trim a wick: Grandmother Wick! Ha. So THAT's why everyone calls her that.",
        ifFlag: ACT2_SEEN,
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
      {
        text: 'Business is booming! Everyone suddenly remembers the badges they collected as kids, and wants a new one.',
        ifFlag: ACT2_SEEN,
      },
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
        text: 'You carry a true dragon now. Bring all four crystals home and Ember will grow up big. Then Ember\'s Breath is yours — the brightest spell of all.',
        ifFlag: 'ember-hatched',
      },
    ],
  },
  'woods-sprite': {
    id: 'woods-sprite',
    name: 'Wisp',
    sprite: '🧚',
    role: 'villager',
    // Gives Say Her Name (#75 item 16a): a quest-giver stays where you can find them.
    stationary: true,
    lines: [
      'South of these woods, a cave runs down into the Clockwork Depths. Old machines sleep there. Be gentle, they dream of working again.',
      'I am made of leftover questions, you know. The ones nobody answered. When you answer yours, a little of me lights up. Thank you for that.',
      // Act II (#75 item 14i): Wisp is starting to remember itself.
      {
        text: 'Something is different since the Spire. I keep ALMOST remembering things. It tickles.',
        ifFlag: ACT2_SEEN,
        unlessFlag: [WISP_STIRRING, NAME_LEARNED],
      },
      {
        text: "Since the Crystal of Memory, I dream in words. Mostly one word. I can't quite hear it yet. Keep going, little spark!",
        ifFlag: WISP_STIRRING,
        unlessFlag: ACT4_SEEN,
      },
      // Act IV (#75 item 16a): the name comes back (Say Her Name speaks for Wisp until then).
      {
        text: 'Aster. I say it every morning now, so nobody ever forgets it again. Thank you, spark!',
        ifFlag: NAME_LEARNED,
      },
    ],
    ambient: ['*flickers softly*', 'Ooh, a riddle!', '✨', 'The trees whisper.'],
    // Say Her Name (#75 item 16a): Wisp's new face — golden, with a daisy.
    face: { flag: NAME_LEARNED, spriteId: 'wisp-named', sprite: '🌼' },
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
      {
        text: "The Great Fogbank's thinned! The Biscuit can sail clear to Taleshore now. Mind the Starfall Sea, though — it's deep, and full of stars.",
        ifFlag: [crystalFlag('words'), BOAT_MENDED],
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
    // Her lens quest (#75 item 14i) is her first talk — its offer carries her hello, the
    // sea-critter safety line and her rumors (quests.ts). These lines are for after it.
    lines: [
      {
        text: "My new lens! Last night I saw a whale wave at me. I waved back. We're friends now.",
        ifFlag: questDoneFlag({ id: 'ness-lens' }),
      },
      'These islands are only now remembering they exist. Some mornings I count a new one! Yesterday it was a rock shaped like a sneeze.',
      // After her quest (#75 item 14i review round 3): no stale chest rumor, no repeat of the
      // offer's rumors — just the Fogbank warning, which still matters.
      'Shelby, over on Sandpiper Cay, says my beam lights up his whole sandbar now. He reads the sand by it!',
      { text: "And east, past everything, sits the Great Fogbank. Don't sail into it. Even the gulls go around.", unlessFlag: crystalFlag('words') },
      { text: 'And the Great Fogbank, way out east? It has thinned to a mist! Boats sail right through it now.', ifFlag: crystalFlag('words') },
    ],
    ambient: ['*polishes the lamp*', 'Ship ahoy? …Oh, it\'s you!', 'Shine on, little light.'],
  },

  // Sandpiper Cay's hermit (#75 item 14i): grinds Ness's lens.
  'cay-hermit': {
    id: 'cay-hermit',
    name: 'Shelby',
    sprite: '🐚',
    role: 'villager',
    stationary: true,
    lines: [
      "I'm Shelby. A hermit. A hermit CRAB. That's twice as hermit-y as anybody.",
      'This shell? Borrowed. Everything a hermit crab owns is borrowed. Except my opinions.',
      {
        text: 'Sea glass for Ness? Try the chests right beside me! Bring it here, and I\'ll grind it.',
        ifFlag: questOfferedFlag({ id: 'ness-lens' }),
        unlessFlag: handedOverFlag('sea-glass'),
      },
      {
        text: "Ness's lamp is so bright now, I can read at night. I don't have any books. I read the sand.",
        ifFlag: questDoneFlag({ id: 'ness-lens' }),
      },
    ],
    ambient: ['*scritch, scritch*', 'Lovely sand today.', '🐚'],
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
      {
        text: "Since the fog lifted, I remember every speech I've ever given. All of them. That's… a LOT of speeches.",
        ifFlag: ACT2_SEEN,
      },
    ],
  },
  'village-clover-merchant': {
    id: 'village-clover-merchant',
    name: 'Grocer Clover',
    sprite: '🧺',
    role: 'merchant',
    lines: [
      {
        text: 'The hills remember spring again — the clovers have never grown so lucky!',
        ifFlag: ACT2_SEEN,
      },
      "Fresh from the hills! Lucky clovers, picked at dawn. Win a battle holding one and the coins just pour in!",
    ],
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
      {
        text: "I remembered Grandma's secret recipe! The secret is… more butter. It was always more butter.",
        ifFlag: ACT2_SEEN,
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
      {
        text: "I remember now! The polite goose was called Gerald. Gerald, if you're out there: you still owe me a sandwich.",
        ifFlag: ACT2_SEEN,
      },
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
      {
        text: 'I remembered where I buried my treasure box! It had… one pebble in it. A GOOD pebble.',
        ifFlag: ACT2_SEEN,
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
  // ── Act II: Remembrance Hill (#75 item 14e) ──
  'hill-keeper': {
    id: 'hill-keeper',
    name: 'Keeper Mnem',
    sprite: '🗿',
    role: 'villager',
    stationary: true,
    lines: [
      // His hello is for the first meeting (lines freeze as a talk opens, so both show then).
      { text: "Welcome to the Hall of Names. I'm Keeper Mnem. I never forget a name. Names, ALWAYS.", unlessFlag: 'met-mnem', setFlag: 'met-mnem' },
      { text: 'Faces, though… Have we met? You have a very brave sort of face.', unlessFlag: 'met-mnem' },
      // One plaque per crystal remembered (STORY-4X: the Hall of Names) — read
      // in one breath. The Hill only opens once all of Act I's are restored.
      // Memory's plaque lights itself at the dedication (#75 item 14i), so it's four until then.
      {
        text: `${numberWord(actCrystals(1).length)} plaques shine again: ${listOf(actCrystals(1).map((t) => t.crystalName.replace(/^Crystal of /, '')))}!`,
        unlessFlag: crystalFlag('history'),
      },
      {
        text: `${numberWord(actCrystals(1).length + actCrystals(2).length)} plaques shine now: ${listOf([...actCrystals(1), ...actCrystals(2)].map((t) => t.crystalName.replace(/^Crystal of /, '')))}!`,
        ifFlag: HALL_DEDICATED,
        unlessFlag: crystalFlag('words'),
      },
      // The sixth plaque lights with Voices (#75 item 15g review round 2).
      {
        text: `${numberWord(actCrystals(1).length + actCrystals(2).length + actCrystals(3).length)} plaques shine now: ${listOf([...actCrystals(1), ...actCrystals(2), ...actCrystals(3)].map((t) => t.crystalName.replace(/^Crystal of /, '')))}!`,
        ifFlag: [HALL_DEDICATED, crystalFlag('words')],
      },
      // Plants the first Sage, for Wick's and Lumen's breadcrumbs.
      { text: 'These plaques are still blank — even the very first Sage\'s. Names nobody remembers… yet.', unlessFlag: crystalFlag('words') },
      { text: "The crystal said \"she\"? Then the first blank plaque belongs to a SHE. Still no name… yet.", ifFlag: crystalFlag('words'), unlessFlag: NAME_LEARNED },
      { text: 'Aster. I shall carve it on the first plaque myself — and polish it every single day.', ifFlag: NAME_LEARNED },
      // The dedication (#75 item 14i): Memory's plaque lights itself, and Mnem
      // calls you in — the panels play as his talk closes (WorldScreen).
      {
        text: 'Wait — do you hear that? A new plaque is humming in the Hall. Come, come! Let us dedicate it together.',
        ifFlag: crystalFlag('history'),
        unlessFlag: HALL_DEDICATED,
        setFlag: HALL_CALLED,
      },
      {
        text: "Your name is in the Hall's heart now. I'll never forget it — names, ALWAYS! (Faces, though…)",
        ifFlag: HALL_DEDICATED,
      },
    ],
    ambient: ['Names, always…', '🗿'],
  },
  'hill-posy': {
    id: 'hill-posy',
    name: 'Posy',
    sprite: '👧',
    role: 'villager',
    stationary: true,
    lines: [
      "Hi! I'm Posy. I bring flowers to the Hall of Names.",
      'Some plaques have names nobody remembers. They get flowers too.',
      "That's the rule. I made it up!",
      { text: "I sang to the Nameless Stone today. It didn't sing back… but I think it was listening.", ifFlag: crystalFlag('words') },
    ],
    ambient: ['Daisies for the blank plaques!', '🌼'],
  },
  'hill-merchant': {
    id: 'hill-merchant',
    name: 'Trader Knack',
    sprite: '🧳',
    role: 'merchant',
    lines: [
      'Trader Knack, at your service! Pre-remembered goods, the finest anywhere.',
      'Lightly forgotten. Deep discount.',
      'This compass? It points to wherever you left your other sock.',
    ],
  },
  'hill-innkeeper': {
    id: 'hill-innkeeper',
    name: 'Innkeeper Hettie',
    sprite: '🫖',
    role: 'innkeeper',
    lines: [
      "Welcome to the Tip-of-the-Tongue Inn! The name's right there… on the tip of my tongue.",
      'Moonwell Grove is just up the road. Lune keeps the moon\'s own well in there. Go and say hello!',
    ],
  },
  'hill-traveler': {
    id: 'hill-traveler',
    name: 'Traveler Sorrel',
    sprite: '🎒',
    role: 'villager',
    lines: [
      "I'm walking all the way round Dawnreach. Again! I forgot I'd already done it.",
      'In Lumina Village the Sleepy Sheep Inn has the softest pillows. I slept there twice. I think.',
    ],
    ambient: ['Left, right, left…', 'Have I been here before?', '🎒'],
  },
  'hill-carver': {
    id: 'hill-carver',
    name: 'Chisel',
    sprite: '🔨',
    role: 'villager',
    lines: [
      "I'm Chisel. I carve the names on the Hall's plaques, one letter at a time.",
      "I carved my own name so small, I can't find it!",
      // The dedication (#75 item 14i): MEMORY carved itself.
      {
        text: "That MEMORY plaque? It carved itself! Best letters in the Hall, too. I'm a little jealous.",
        ifFlag: HALL_DEDICATED,
      },
    ],
    ambient: ['Tap, tap, tap…', '🔨'],
  },
  'hill-elder': {
    id: 'hill-elder',
    name: 'Grandpa Dew',
    sprite: '👴',
    role: 'villager',
    lines: [
      "This hill wasn't here last week. Or maybe I wasn't! Ha!",
      'I remember my very first day of school. Not the second one. Second days are forgettable.',
    ],
    ambient: ['Now where are my glasses… oh! On my nose.', '👓'],
  },
  'hill-jam': {
    id: 'hill-jam',
    name: 'Mira',
    sprite: '🧺',
    role: 'villager',
    lines: [
      'Fresh forget-me-not jam! Made with real forget-me-nots.',
      "One spoonful and you'll never forget the taste. Everything else, maybe.",
    ],
    ambient: ['Jam! Lovely jam!', '🍓'],
  },

  // --- Act II: Eldergrove (#75 item 14f) ---
  'elder-fen': {
    id: 'elder-fen',
    name: 'Fen the Forager',
    sprite: '🧺',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("Fen's Forgotten Acorns"); these follow it.
    lines: [
      "My three best acorns are safe in my hollow now. I won't forget where. I wrote it down!",
      '…Has anybody seen where I put the note?',
      { text: 'Gulls from Taleshore came to Eldergrove! They remember where every acorn is buried. Very annoying. Very helpful.', ifFlag: ACT3_SEEN },
    ],
    ambient: ['Acorns, acorns…', '🌰'],
  },
  'elder-ringwood': {
    id: 'elder-ringwood',
    name: 'Old Ringwood',
    sprite: '🌳',
    role: 'villager',
    stationary: true,
    // The Ringkeeper's signpost (#59's pattern): a warning until its key is won.
    lines: [
      'Hrrrm. A visitor. Stand still while I count my rings. One… two… three…',
      '…eight hundred and ninety-nine… nine hundred… nine hundred and… oh, bother. Lost count again.',
      {
        text: 'Mind the Great Ring, just south of me. The Ringkeeper lives there — older than me, older than this whole grove.',
        unlessFlag: keyFlag('memoria'),
      },
      {
        text: 'It wears the Memoria Key on its antlers. Answer its riddles about long ago, and it might give the key away.',
        unlessFlag: keyFlag('memoria'),
      },
      {
        text: 'You won the Memoria Key! Nine hundred years, and the Ringkeeper never shared a thing before. Hrrm. Well done.',
        ifFlag: keyFlag('memoria'),
      },
      {
        text: "Its door is in the Sunken Archive, a library half under the sea in the Shallows' north-east. Mind the Hollow Fiend in there — mark my rings.",
        ifFlag: keyFlag('memoria'),
      },
    ],
    ambient: ['…nine hundred and… hrrm.', '🍂'],
  },
  'elder-dawdle': {
    id: 'elder-dawdle',
    name: 'Dawdle',
    sprite: '🐢',
    role: 'villager',
    pace: 0.15,
    lines: [
      "Oh… hello. I'm… Dawdle.",
      "I'm going… for a… walk. Around the pond. I started… on Tuesday.",
    ],
    ambient: ['Almost… there…', '…', '🐢'],
  },
  // --- Foglight Marsh (#75 item 14g) ------------------------------------------
  'marsh-brume': {
    id: 'marsh-brume',
    name: 'Lightkeeper Brume',
    sprite: '🏮',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("The Lantern Ledger"); these follow it.
    lines: [
      "Lightkeeper Brume. I keep the Marsh's lanterns. The fog and I were friends. Then it left.",
      'Beware the Last Fogbank, down in the reedy cove at the bottom-right of the Marsh. It swallowed every lantern here once. Don\'t let it swallow YOU!',
      "Ness says hello? Tell her my lamps are burning bright — and her lighthouse had better be too!",
    ],
    ambient: ['Wick trimmed, lamp filled.', '🏮'],
  },
  'marsh-puddle': {
    id: 'marsh-puddle',
    name: 'Puddle',
    sprite: '🐸',
    role: 'villager',
    lines: [
      "Ribbit! I'm Puddle. I remember being a tadpole like it was yesterday.",
      'It WAS yesterday. I grow up fast.',
    ],
    ambient: ['Ribbit!', 'Was I a tadpole? Yes!', '🪷'],
  },
  'marsh-slosh': {
    id: 'marsh-slosh',
    name: 'Ferryman Slosh',
    sprite: '⛵',
    role: 'merchant',
    lines: [
      "Slosh's the name, rafts are the game! I ferry folk in from the sea, and I sell what a bog-walker needs.",
      // Only while she's here (#75 item 14g UX review).
      { text: 'I just ferried a little girl called Posy over, right behind you. She had a flower for someone.', ifFlag: POSY_SAILED, unlessFlag: questDoneFlag({ id: POSY_QUEST }) },
      'Glimmer Candles! Bog Lanterns are too slippery for Hint Feathers. Light one little candle, and your feathers work again.',
    ],
  },
  'marsh-stone': {
    id: 'marsh-stone',
    name: 'The Nameless Stone',
    sprite: '🪨',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      'A smooth grey stone at the end of the boardwalk. There is no name on it — only a tiny flower, carved at the top.',
      { text: "A daisy is tucked into the crack at the top. Posy's.", ifFlag: stepFlag(POSY_WALK) },
      // Here without her (#75 item 14g review): where is she?
      { text: "Posy is on her way! If a critter is holding her up, look for her ❗.", ifFlag: escortWalkingFlag(POSY_WALK) },
    ],
  },
  'marsh-lantern-west': {
    id: 'marsh-lantern-west',
    name: 'West Lantern',
    sprite: '🏮',
    spriteId: 'marsh-lantern',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['A marsh lantern, cold and dark. Lightkeeper Brume keeps these — her Lantern Ledger says which to light, and when.'],
  },
  'marsh-lantern-west-lit': {
    id: 'marsh-lantern-west-lit',
    name: 'West Lantern',
    sprite: '🏮',
    spriteId: 'marsh-lantern-lit',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['The west lantern glows warm and gold. Somewhere out on the water, a little fish is very grateful.'],
  },
  'marsh-lantern-north': {
    id: 'marsh-lantern-north',
    name: 'North Lantern',
    sprite: '🏮',
    spriteId: 'marsh-lantern',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['A marsh lantern, cold and dark. Lightkeeper Brume keeps these — her Lantern Ledger says which to light, and when.'],
  },
  'marsh-lantern-north-lit': {
    id: 'marsh-lantern-north-lit',
    name: 'North Lantern',
    sprite: '🏮',
    spriteId: 'marsh-lantern-lit',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['The north lantern glows warm and gold. Somewhere out on the water, a little fish is very grateful.'],
  },
  'marsh-lantern-east': {
    id: 'marsh-lantern-east',
    name: 'East Lantern',
    sprite: '🏮',
    spriteId: 'marsh-lantern',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['A marsh lantern, cold and dark. Lightkeeper Brume keeps these — her Lantern Ledger says which to light, and when.'],
  },
  'marsh-lantern-east-lit': {
    id: 'marsh-lantern-east-lit',
    name: 'East Lantern',
    sprite: '🏮',
    spriteId: 'marsh-lantern-lit',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['The east lantern glows warm and gold. Somewhere out on the water, a little fish is very grateful.'],
  },

  // ── Act II: the Sunken Archive (#75 item 14h) ──
  'sage-chronicle': {
    id: 'sage-chronicle',
    name: 'Sage Chronicle',
    sprite: '🦉',
    role: 'sage',
    topic: 'history',
    lines: [
      'Hoo. I am Sage Chronicle. (See also: owl.)',
      'Every battle is a story, little spark. Mine can ripple time itself. (See also: bravery.)',
      { text: "The Crystal of Voices rang! A new footnote: 'The Crystal of Voices rang, and the stories came home.' (Footnote to the footnote: hooray.)", ifFlag: crystalFlag('words') },
    ],
  },
  'archive-index': {
    id: 'archive-index',
    name: 'Index',
    sprite: '🐭',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("A Letter, Long Overdue"); these follow it.
    lines: [
      "I'm Index! I put everything in alphabetical order. Even my sneezes. Ah… Bh… CHOO!",
      { text: 'The Crystal of Memory shines! Every card in my catalog remembers its book again. A to Z!', ifFlag: 'crystal-history-restored' },
    ],
  },
  'archive-binder': {
    id: 'archive-binder',
    name: 'Innkeeper Binder',
    sprite: '📚',
    role: 'innkeeper',
    lines: [
      'Welcome to the Quiet Shelf Inn. Quietest inn in Lumina. The books insist.',
      "Brume keeps the lanterns lit in Foglight Marsh, up on the north coast. Tell her the Archive says hello — quietly.",
    ],
  },
  'archive-traveler': {
    id: 'archive-traveler',
    name: 'Sailor Brine',
    sprite: '🧭',
    role: 'villager',
    // Among the inn's beds and tables there's no room to step back after a talk (#75 item 14h review).
    stationary: true,
    lines: [
      "I rowed all the way from Remembrance Hill. Keeper Mnem said my name might be in a book here.",
      "Found it! Page four hundred. Turns out I'm a sailor. I KNEW I liked boats.",
    ],
    ambient: ['Page four hundred…', 'Ahoy — quietly!', '🧭'],
  },
  'archive-hush': {
    id: 'archive-hush',
    name: 'Hush',
    sprite: '🤫',
    role: 'villager',
    // Boxed in by the Reading Room's tables, a wanderer kept walking back into you (#75 item 14h review).
    stationary: true,
    lines: [
      "Shhh! …Oh, sorry. Habit. I've been the Reading Room's librarian for three hundred years.",
      { text: "The books are whispering again, now the Crystal of Memory shines. I'll allow it. Just this once.", ifFlag: 'crystal-history-restored' },
    ],
    ambient: ['Shhh!', 'Shhhhh…', '🤫'],
  },
  'archive-quillon': {
    id: 'archive-quillon',
    name: 'Old Quillon',
    sprite: '✒️',
    role: 'villager',
    stationary: true,
    lines: [
      "I'm Quillon, the Archive's oldest scribe. The silver door behind me leads to the Hollow.",
      { text: 'The Hollow Fiend lives in there. It eats old stories — the before-times. Only the Memoria Key opens that door.', unlessFlag: 'key-memoria' },
      { text: "You carry the Memoria Key! The silver door is right behind me. Be brave — the Hollow Fiend is hungry.", ifFlag: 'key-memoria', unlessFlag: 'crystal-history-restored' },
      { text: 'The Crystal of Memory shines again! I can read my own handwriting. It is TERRIBLE.', ifFlag: 'crystal-history-restored' },
    ],
  },
  'archive-margin': {
    id: 'archive-margin',
    name: 'Margin',
    sprite: '🦋',
    role: 'villager',
    lines: [
      "I'm Margin, a book moth. I nibble footnotes. Sage Chronicle says that's rude. See also: delicious.",
    ],
    ambient: ['Nibble, nibble.', 'See also: snacks.', '🦋'],
  },
  'archive-leaf': {
    id: 'archive-leaf',
    name: 'Leaf',
    sprite: '🧒',
    role: 'villager',
    lines: [
      "I'm Leaf, the Archive's page! I fetch books for everyone. Mostly the wrong ones.",
      'The critters in the stacks are made of old books and spilt ink. The Quill Imps are FAST — they always strike first!',
    ],
    ambient: ['Wrong book again!', 'Fetch, fetch, fetch!', '📖'],
  },
  // Port Lantern (#75 item 15c): Taleshore's harbor town. Its people never
  // forgot — they kept telling the stories — and they know Umbra's name, but
  // it's rude to say a name its owner lost.
  'port-harbormaster': {
    id: 'port-harbormaster',
    name: 'Harbormaster Gale',
    sprite: '⚓',
    role: 'villager',
    stationary: true,
    guide: true,
    lines: [
      { text: "Welcome to Port Lantern! I'm Harbormaster Gale. I've never lost a ship. Misplaced one, yes. Twice.", setFlag: MET_GALE },
      { text: "A dragon, over the Great Fogbank! Nobody has come from that side in years. We kept every lantern lit, just in case.", unlessFlag: crystalFlag('words') },
      { text: "I heard Chorus Isle singing from my dock! And the fog's thinned — boats sail in from the Silver Shallows again. I'm sailing over this summer!", ifFlag: crystalFlag('words') },
      { text: 'Talk to everyone, and check the Quest Board in the square. Skipper Juno on the south dock needs a brave friend!', unlessFlag: questOfferedFlag({ id: JUNO_QUEST }) },
      { text: "Talk to everyone, and check the Quest Board in the square. And thank you for looking after Juno!", ifFlag: questOfferedFlag({ id: JUNO_QUEST }) },
      'Gale Atoll, out at sea? No relation! It\'s just VERY windy out there.',
    ],
  },
  'port-skipper': {
    id: 'port-skipper',
    name: 'Skipper Juno',
    sprite: '🧭',
    role: 'villager',
    stationary: true,
    lines: [
      { text: 'The Puffin is scrubbed and shining, down on the beach! Thank you for walking with me.', ifFlag: questDoneFlag({ id: JUNO_QUEST }) },
      { text: "Next time a storm gives me a fright, I'll think of you and your dragon!", ifFlag: questDoneFlag({ id: JUNO_QUEST }) },
      { text: 'The Puffin needs new sails before she carries passengers. Until then, your dragon is the best ferry around!', ifFlag: questDoneFlag({ id: JUNO_QUEST }) },
      { text: "You flew here? On a DRAGON? Then you're brave enough for both of us!", unlessFlag: questDoneFlag({ id: JUNO_QUEST }) },
    ],
  },
  'port-merchant': {
    id: 'port-merchant',
    name: 'Candlemaker Wick-Wax',
    sprite: '🕯️',
    role: 'merchant',
    lines: [
      "Potions, Glimmer Candles, and a badge that glows! Wick-Wax's Candle Shop keeps Port Lantern bright.",
      'You know a Grandmother Wick? Never heard of her. No relation. Certainly not my cousin.',
    ],
  },
  'port-innkeeper': {
    id: 'port-innkeeper',
    name: 'Innkeeper Hollis',
    sprite: '🍲',
    role: 'innkeeper',
    lines: [
      "Welcome to the Driftlight Inn! Fish stew, soft beds, and a lantern in every window.",
      "Sleep here, and if a battle ever goes badly, you'll wake right here. Safe and sound.",
    ],
  },
  'port-netmender': {
    id: 'port-netmender',
    name: 'Netmender Orla',
    sprite: '🧶',
    role: 'villager',
    lines: [
      "I'm Orla. I mend the nets. Every knot in this loft has a story, and I remember them all.",
      'Every sailor on the Starfall Sea has a story. I\'ve heard them all, knot by knot.',
    ],
    ambient: ['Over, under, through…', 'Another knot, another story.', '🧶'],
  },
  'port-lamplighter': {
    id: 'port-lamplighter',
    name: 'Tiko',
    sprite: '👦',
    role: 'villager',
    lines: [
      "I'm Tiko! I light the lanterns every night, so ships can find their way home.",
      'Is that a REAL dragon? Can I pat it? …It sneezed on me! Best day ever!',
    ],
    ambient: ['One lantern, two lanterns…', 'Dragon! A real dragon!', '🏮'],
  },
  'port-postmaster': {
    id: 'port-postmaster',
    name: 'Postmaster Pidge',
    sprite: '🐦',
    role: 'villager',
    lines: [
      "Coo! Postmaster Pidge. I carry letters over hills and over sea. But never over the fog. Until now!",
      { text: "I've years of letters for Lumina Village. Now a dragon's found the way, maybe they'll finally get there!", unlessFlag: crystalFlag('words') },
      { text: 'The fog has thinned — the post boats sail again! Coo! My sack has never been so heavy.', ifFlag: crystalFlag('words') },
      { text: "Shush's letters? Far too precious for my sack — you carry them, dragon-rider!", ifFlag: questOfferedFlag({ id: SHUSH_QUEST }), unlessFlag: questDoneFlag({ id: SHUSH_QUEST }) },
    ],
    ambient: ['Coo!', 'Letters! Letters!', '✉️'],
  },
  'port-storyteller': {
    id: 'port-storyteller',
    name: 'Storyteller Fable',
    sprite: '📖',
    role: 'villager',
    stationary: true,
    lines: [
      "The fog never came here, little one, because we never stopped telling our stories. We remember everything.",
      "You call him Umbra. That isn't his real name. We know it, but here we never say a name its owner has lost.",
    ],
  },
  // The quest board in the square (#75 item 15c): its notices change as Taleshore opens up.
  'port-board': {
    id: 'port-board',
    name: 'Quest Board',
    sprite: '📋',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      '📋 The Quest Board. Notices are pinned all over it.',
      'NEW IN TOWN? Say hello to Harbormaster Gale by the road in. Rest at the Driftlight Inn. Potions at Wick-Wax\'s Candle Shop.',
      { text: 'WANTED: a brave friend to walk Skipper Juno to her old ferry. Ask Juno on the south dock!', unlessFlag: questOfferedFlag({ id: JUNO_QUEST }) },
      { text: 'NOTICE: Skipper Juno has gone down the south road to Driftwood Shallows, to find her old ferry.', ifFlag: JUNO_CAME, unlessFlag: questDoneFlag({ id: JUNO_QUEST }) },
      { text: "GOOD NEWS: Skipper Juno has found her nerve AND her ferry! Well done, whoever helped.", ifFlag: questDoneFlag({ id: JUNO_QUEST }) },
      { text: 'SEEN: a stone giant in the Wayfinder Isles. Cartographer Lo says it guards a key. Take care!', unlessFlag: keyFlag('chorus-a') },
      { text: 'NEWS: someone beat the stone giant on the Wayfinder Isles! Cartographer Lo is redrawing her map.', ifFlag: keyFlag('chorus-a') },
      // Taleshore II (#75 item 15e): up the north road.
      { text: "LOST: one tall tale, in three pieces, somewhere on the Story Reef. Ask Tale-Fisher Yarn, at the end of the north road!", unlessFlag: questDoneFlag({ id: YARN_QUEST }) },
      { text: 'BEWARE: a whale that talks in riddles lives in Inkwell Cove, where the water turns black as ink — east off the north road. Scrivener Dot says it has a key.', unlessFlag: keyFlag('chorus-b') },
      { text: 'NEWS: someone answered every one of the Riddle Leviathan\'s riddles! Scrivener Dot wrote it all down.', ifFlag: keyFlag('chorus-b') },
      // Taleshore III (#75 item 15f).
      { text: "CHOIR NEWS: the Songstone Cliffs' song is stuck! Take the north road past the Inkwell Cove turn, then turn east under the mountains. Reso needs a listener!", unlessFlag: questDoneFlag({ id: RESO_QUEST }) },
      { text: 'SHH: the Quiet Quarter is east off the south road. Please whisper there. Librarian Shush insists.' },
      'NOTICE: Postmaster Pidge is sending letters to Lumina Village at last!',
      // Chorus Isle (#75 item 15g): the double gate's island.
      { text: 'OLD SAILORS SAY: far out west, straight across the sea from Port Lantern, lies Chorus Isle, where everyone used to sing. Nobody has heard a note from it in years.', unlessFlag: crystalFlag('words') },
      { text: "GREAT NEWS: Chorus Isle is singing again — and the Great Fogbank has thinned! Boats from the Silver Shallows can sail right into Port Lantern now.", ifFlag: crystalFlag('words') },
      // Chartmaker's Rest (#75 item 15h review round 1): the board points the way too.
      { text: "WANTED: a helper for the Chartmaker, on his little island out at sea, north-west past the Wayfinder Isles. Look for the globe on your map 🌐 He says he's missing one place. Just ONE!", ifFlag: crystalFlag('words'), unlessFlag: BLANK_CHART_HELD },
      'Check back soon for more notices!',
    ],
  },
  // A note on the harbormaster's desk (15c review): Gale is out meeting the boats.
  'port-office-note': {
    id: 'port-office-note',
    name: "Gale's Note",
    sprite: '📝',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['📝 "Out saying hello to visitors! Find me by the road into town, on the east side. — Gale"'],
  },
  // --- Taleshore III (#75 item 15f) --------------------------------------------
  // Songstone Cliffs: Choir-Mistress Reso, a stone face that echoes, a bee who
  // hums, and Reso's three songstones (a song you ring in order).
  'cliff-reso': {
    id: 'cliff-reso',
    name: 'Choir-Mistress Reso',
    sprite: '🎶',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("Ring the Songstones"); these follow it.
    lines: [
      'Every stone on these cliffs hums. Put your ear to one and listen!',
      { text: 'High, middle, low — hear it? The cliffs sing again, every evening.', ifFlag: questDoneFlag({ id: RESO_QUEST }) },
      { text: 'Chorus Isle is singing again — I can hear it from up here! My choir is learning their songs.', ifFlag: crystalFlag('words') },
    ],
  },
  'cliff-echo': {
    id: 'cliff-echo',
    name: 'Echo-of-Echo',
    sprite: '🗿',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      '🗿 A stone face in the cliff. You say "Hello, rock!" It says: "…rock! …rock!"',
      'You ask "What\'s your name?" It says: "…name? …name?" It only ever repeats the LAST word.',
      'You say "See you later!" It says: "…later! …later!" Then it smiles. Probably.',
    ],
  },
  'cliff-hum': {
    id: 'cliff-hum',
    name: 'Hum',
    sprite: '🐝',
    role: 'villager',
    lines: [
      "Hmmm-hmm! I'm Hum. I hum because I never learned the words. Nobody minds!",
      'The Chime Gulls are SO fast — they always strike first. Keep your guard up!',
    ],
    ambient: ['Hmmm…', 'Hmm-hmm!', '🎵'],
  },
  'songstone-high': {
    id: 'songstone-high',
    name: 'High Songstone',
    sprite: '🪨',
    spriteId: 'songstone',
    role: 'villager',
    prop: true,
    stationary: true,
    // Before Reso asks: once she has, a struck stone is part of her song (quests.ts).
    lines: ['🪨 A tall blue stone covered in carved music notes. It hums, very quietly.'],
  },
  'songstone-high-rung': {
    id: 'songstone-high-rung',
    name: 'High Songstone',
    sprite: '🪨',
    spriteId: 'songstone-rung',
    role: 'villager',
    prop: true,
    stationary: true,
    // Says which stone is next until that one rings too (15f review).
    lines: [
      { text: '🔔 The high songstone is still ringing. Next: the MIDDLE songstone, on the middle ledge — go down the east steps. Ring it before the low one!', unlessFlag: stepFlag(RESO_STONES[1]) },
      { text: '🔔 The high songstone is still ringing: DIIING! A high, bright note, humming on and on.', ifFlag: stepFlag(RESO_STONES[1]) },
    ],
  },
  'songstone-middle': {
    id: 'songstone-middle',
    name: 'Middle Songstone',
    sprite: '🪨',
    spriteId: 'songstone',
    role: 'villager',
    prop: true,
    stationary: true,
    // Before Reso asks: once she has, a struck stone is part of her song (quests.ts).
    lines: ['🪨 A tall blue stone covered in carved music notes. It hums, very quietly.'],
  },
  'songstone-middle-rung': {
    id: 'songstone-middle-rung',
    name: 'Middle Songstone',
    sprite: '🪨',
    spriteId: 'songstone-rung',
    role: 'villager',
    prop: true,
    stationary: true,
    // Says which stone is next until that one rings too (15f review).
    lines: [
      { text: '🔔 The middle songstone is still ringing. Last: the LOW songstone — go down the west steps, just west of Reso!', unlessFlag: stepFlag(RESO_STONES[2]) },
      { text: '🔔 The middle songstone is still ringing: DOOONG! A middle note, humming on and on.', ifFlag: stepFlag(RESO_STONES[2]) },
    ],
  },
  'songstone-low': {
    id: 'songstone-low',
    name: 'Low Songstone',
    sprite: '🪨',
    spriteId: 'songstone',
    role: 'villager',
    prop: true,
    stationary: true,
    // Before Reso asks: once she has, a struck stone is part of her song (quests.ts).
    lines: ['🪨 A tall blue stone covered in carved music notes. It hums, very quietly.'],
  },
  'songstone-low-rung': {
    id: 'songstone-low-rung',
    name: 'Low Songstone',
    sprite: '🪨',
    spriteId: 'songstone-rung',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: ['🔔 The low songstone is still ringing: BOOOM! A deep, low note, humming on and on.'],
  },
  // The Quiet Quarter: Librarian Shush (Librarian Sage's pen-pal), a mime, and
  // Sotto, who sells secrets — mostly recipes.
  'quiet-shush': {
    id: 'quiet-shush',
    name: 'Librarian Shush',
    sprite: '🤫',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("The Pen-Pal Papers"); these follow it.
    lines: [
      'Shh. Books are the loudest thing in the world, when you read them in your head.',
      { text: 'Five kittens! I\'m writing back right now. Shh — I\'m thinking.', ifFlag: questDoneFlag({ id: SHUSH_QUEST }) },
      { text: '"The Hush Fiend is gone, and everyone is SO loud now. Shh! …Oh, all right. Hooray!" she whispers.', ifFlag: crystalFlag('words') },
    ],
  },
  'quiet-mime': {
    id: 'quiet-mime',
    name: 'Mime',
    sprite: '🎭',
    role: 'villager',
    lines: ['🎭 The Mime doesn\'t say a word. Instead…', '🎭 👋 😊', '🎭 🤫 … 👉 📚 … 🤔 💭', '🎭 👐 … 👐 … 😮 (an invisible wall!) … 🚪 🚶 🎉'],
    ambient: ['…', '🤐', '🎭'],
  },
  'quiet-sotto': {
    id: 'quiet-sotto',
    name: 'Whisper-Monger Sotto',
    sprite: '🗣️',
    role: 'merchant',
    lines: [
      'Psst. Over here. I sell secrets. Mostly recipes. VERY secret recipes.',
      "And candles — for slippery critters, like the Latitude Cats out on the Wayfinder Isles. Shh!",
    ],
  },
  // --- Taleshore II (#75 item 15e) --------------------------------------------
  // The Story Reef: Tale-Fisher Yarn, a mermaid who can't stop rhyming, a fish
  // who talks about himself, and Yarn's three tale-stones (a riddle chain).
  'reef-yarn': {
    id: 'reef-yarn',
    name: 'Tale-Fisher Yarn',
    sprite: '🎏',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("Yarn's Tallest Tale"); these follow it.
    lines: [
      "Every tide brings a story in. Some are short. Some are tall. Mine are TALLER than they look!",
      { text: 'Want another tale? Once I caught a sentence so long it took three days to reel in. Ha!', ifFlag: questDoneFlag({ id: YARN_QUEST }) },
    ],
  },
  'reef-verse': {
    id: 'reef-verse',
    name: 'Verse',
    sprite: '🧜',
    role: 'villager',
    lines: [
      "Hello, hello, I'm Verse, you see — I rhyme all day, I can't stop, dear me!",
      'The Riddle Jellies love a riddle game. Your Hint Feathers fizzle — a 🕯️ candle fixes that, no shame!',
      'Please ask me to stop, I really would try… but the rhymes just keep coming. Oh my, oh my!',
    ],
    ambient: ['Rhyme, chime…', 'Sea and me!', '🎶'],
  },
  'reef-bloop': {
    id: 'reef-bloop',
    name: 'Bloop',
    sprite: '🐠',
    role: 'villager',
    lines: [
      'Bloop says hello! Bloop is a fish. Bloop is a very good fish.',
      'Bloop is a fish on the sand. Bloop likes the view. Bloop will hop back in soon.',
      'Bloop saw a Word Eel today. Bloop swam away. Bloop is fast. Bloop is brave. Mostly fast.',
      { text: "Bloop heard Yarn's tale is lost on three stones. Bloop would help, but Bloop can't read. Bloop is a fish.", ifFlag: questOfferedFlag({ id: YARN_QUEST }), unlessFlag: questDoneFlag({ id: YARN_QUEST }) },
    ],
    ambient: ['Bloop!', 'Bloop bloop.', '🫧'],
  },
  'reef-stone-1': {
    id: 'reef-stone-1',
    name: 'First Tale-Stone',
    sprite: '🪨',
    spriteId: 'reef-stone',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      { text: '🪨 A smooth stone covered in faded words, too faint to read. Maybe Tale-Fisher Yarn, at the top of the reef, knows.', unlessFlag: questOfferedFlag({ id: YARN_QUEST }) },
      { text: "🪨 One of Yarn's tale-stones. The words on it are faint and still.", ifFlag: questOfferedFlag({ id: YARN_QUEST }) },
    ],
  },
  'reef-stone-1-lit': {
    id: 'reef-stone-1-lit',
    name: 'First Tale-Stone',
    sprite: '🪨',
    spriteId: 'reef-stone-lit',
    role: 'villager',
    prop: true,
    stationary: true,
    // Says where the next stone is until that one glows too (15e round 3: the clue shows once, after the answer).
    lines: [
      { text: '🪨 The stone glows. Its words float EAST, over the road, to the tide pool near the top of the reef!', unlessFlag: stepFlag(YARN_STONES[1]) },
      { text: '🪨 The tale-stone glows softly. Its chapter of the tale is back where it belongs.', ifFlag: stepFlag(YARN_STONES[1]) },
    ],
  },
  'reef-stone-2': {
    id: 'reef-stone-2',
    name: 'Second Tale-Stone',
    sprite: '🪨',
    spriteId: 'reef-stone',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      { text: '🪨 A smooth stone covered in faded words, too faint to read. Maybe Tale-Fisher Yarn, at the top of the reef, knows.', unlessFlag: questOfferedFlag({ id: YARN_QUEST }) },
      { text: "🪨 One of Yarn's tale-stones. The words on it are faint and still.", ifFlag: questOfferedFlag({ id: YARN_QUEST }) },
    ],
  },
  'reef-stone-2-lit': {
    id: 'reef-stone-2-lit',
    name: 'Second Tale-Stone',
    sprite: '🪨',
    spriteId: 'reef-stone-lit',
    role: 'villager',
    prop: true,
    stationary: true,
    // Says where the next stone is until that one glows too (15e round 3: the clue shows once, after the answer).
    lines: [
      { text: '🪨 The stone glows. Its words float SOUTH-WEST, to the sandbar in the sea!', unlessFlag: stepFlag(YARN_STONES[2]) },
      { text: '🪨 The tale-stone glows softly. Its chapter of the tale is back where it belongs.', ifFlag: stepFlag(YARN_STONES[2]) },
    ],
  },
  'reef-stone-3': {
    id: 'reef-stone-3',
    name: 'Third Tale-Stone',
    sprite: '🪨',
    spriteId: 'reef-stone',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      { text: '🪨 A smooth stone covered in faded words, too faint to read. Maybe Tale-Fisher Yarn, at the top of the reef, knows.', unlessFlag: questOfferedFlag({ id: YARN_QUEST }) },
      { text: "🪨 One of Yarn's tale-stones. The words on it are faint and still.", ifFlag: questOfferedFlag({ id: YARN_QUEST }) },
    ],
  },
  'reef-stone-3-lit': {
    id: 'reef-stone-3-lit',
    name: 'Third Tale-Stone',
    sprite: '🪨',
    spriteId: 'reef-stone-lit',
    role: 'villager',
    prop: true,
    stationary: true,
    // Sends you home to Yarn until her tale is done (15e round 4).
    lines: [
      { text: '🪨 The stone glows. The whole tale is back! Go and tell Tale-Fisher Yarn, at the top of the reef.', unlessFlag: questDoneFlag({ id: YARN_QUEST }) },
      { text: '🪨 The tale-stone glows softly. Its chapter of the tale is back where it belongs.', ifFlag: questDoneFlag({ id: YARN_QUEST }) },
    ],
  },
  // Inkwell Cove: Scrivener Dot (the Leviathan's signpost), Smudge the little
  // squid, and Barnacle Bess's shell shop.
  'ink-dot': {
    id: 'ink-dot',
    name: 'Scrivener Dot',
    sprite: '✒️',
    role: 'villager',
    stationary: true,
    // The Riddle Leviathan's signpost (#59's pattern): a warning until its key is won.
    lines: [
      "Oh! A visitor. I'm Dot. I write down every word the cove says. It says a LOT.",
      { text: "At the tip of the sandy point, the Riddle Leviathan guards the Second Chorus Key. It talks only in riddles. Even 'hello' is a riddle!", unlessFlag: keyFlag('chorus-b') },
      { text: "Answer its word questions to win the key. If you're hurt, Bess sells Berry Potions — her shop is up by the road into the cove.", unlessFlag: keyFlag('chorus-b') },
      { text: 'You beat the Riddle Leviathan! I wrote it all down. Twice. In my best letters.', ifFlag: keyFlag('chorus-b') },
    ],
  },
  'ink-smudge': {
    id: 'ink-smudge',
    name: 'Smudge',
    sprite: '🦑',
    role: 'villager',
    lines: [
      "Hi! I'm Smudge. Every time I get a fright I squirt ink. Then everything is a smudge. That's how I got my name!",
      'Cuttle-Scribes scribble their scrapes away with ink. Hit them hard, so they can\'t scribble fast enough!',
    ],
    ambient: ['Squirt!', 'Oops, ink.', '🫧'],
  },
  'ink-bess': {
    id: 'ink-bess',
    name: 'Barnacle Bess',
    sprite: '🐚',
    role: 'merchant',
    lines: [
      "Ahoy! I'm Barnacle Bess. Shells, feathers, potions — everything a riddle-hunter needs!",
      'Hint Feathers sell fast round here. The Leviathan\'s riddles are VERY twisty.',
    ],
  },
  // --- Taleshore I (#75 item 15d) ---------------------------------------------
  // Driftwood Shallows: a beachcomber, a crab who walks sideways, and Salt the Younger.
  'drift-reel': {
    id: 'drift-reel',
    name: 'Beachcomber Reel',
    sprite: '🎣',
    role: 'villager',
    lines: [
      "Morning! I'm Reel. Every tide brings something new up the beach. Yesterday, a boot. Today, the other boot!",
      'Skipper Juno\'s old ferry is beached by the dock in the south-west corner. Poor Puffin. She misses the sea.',
    ],
    ambient: ['Ooh, a shell!', 'Another boot?', '🐚'],
  },
  // The Puffin, Skipper Juno's ferry, beached by the old dock (#75 item 15d review).
  'drift-puffin': {
    id: 'drift-puffin',
    name: 'The Puffin',
    sprite: '⛵',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      { text: '⛵ The Puffin, Skipper Juno\'s little ferry. A bit sandy, but not one plank missing.', unlessFlag: questDoneFlag({ id: JUNO_QUEST }) },
      { text: '⛵ The Puffin, scrubbed and shining. She looks happy to be near the sea again.', ifFlag: questDoneFlag({ id: JUNO_QUEST }) },
    ],
  },
  'drift-sandy': {
    id: 'drift-sandy',
    name: 'Sandy',
    sprite: '🪣',
    role: 'villager',
    lines: [
      "Hi hi! I'm Sandy! I walk sideways, like the crabs. It takes ages to get anywhere, but I see SO much on the way!",
      'The snails here wear their shells like shields. Hit one once and the shell cracks. Then it\'s just a snail!',
    ],
    ambient: ['Sideways, sideways…', 'Click click!', '🦀'],
  },
  'drift-salt': {
    id: 'drift-salt',
    name: 'Salt the Younger',
    sprite: '🧂',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("Salt's Sea-Glass Set"); these follow it.
    lines: [
      'My grandpa Salt the Elder will be SO jealous of my set!',
      'Sea-glass is just old bottles the sea has polished for a hundred years. Imagine being that patient!',
      'Next I\'m hunting for purple sea-glass. Nobody has EVER found a purple one!',
    ],
  },
  // The Wayfinder Isles: a mapmaker (the Golem's signpost), a penguin who walks in straight lines, and Wim the Mapper.
  'way-lo': {
    id: 'way-lo',
    name: 'Cartographer Lo',
    sprite: '🗺️',
    role: 'villager',
    stationary: true,
    // The Compass Golem's signpost (#59's pattern): a warning until its key is won.
    lines: [
      "Hello there! I'm Lo. I'm drawing a map of every island in the Starfall Sea. These six took me a whole year!",
      { text: 'Careful! The Compass Golem stands in the stone circle, just south of me. It guards the First Chorus Key.', unlessFlag: keyFlag('chorus-a') },
      { text: 'Answer its questions about places in the world, and it might give the key away. If you\'re hurt, fly back to the Driftlight Inn first!', unlessFlag: keyFlag('chorus-a') },
      { text: 'You beat the Compass Golem! Now its needle points every way at once. I\'ll have to redraw my map.', ifFlag: keyFlag('chorus-a') },
    ],
  },
  'way-pebble': {
    id: 'way-pebble',
    name: 'Pebble',
    sprite: '🐧',
    role: 'villager',
    lines: [
      'Waddle. Waddle. Turn. I only walk in straight lines. It is the proper way to walk.',
      'North, south, east and west. Four directions. Very tidy. I do not trust diagonals.',
    ],
    ambient: ['Straight line…', 'Turn. Waddle.', '🐧'],
  },
  'way-drift': {
    id: 'way-drift',
    name: 'Wim the Mapper',
    sprite: '✏️',
    role: 'villager',
    stationary: true,
    // His quest's offer comes first ("The Unfinished Map"); these follow it.
    lines: [
      'Did you know a compass needle always points north? Except near the Golem. It points at the Golem.',
    ],
  },
  // Gale Atoll: the windkeeper, a dove blown off course, and Tass's kites.
  'gale-sough': {
    id: 'gale-sough',
    name: 'Windkeeper Sough',
    sprite: '🌬️',
    role: 'villager',
    stationary: true,
    lines: [
      "Whoosh! I'm Sough, the Windkeeper. The wind never stops here, so I keep an eye on it. Somebody has to.",
      'The Squall Chicks ride the gusts. They are so quick they always strike first. Keep your guard up!',
    ],
  },
  'gale-gully': {
    id: 'gale-gully',
    name: 'Gully',
    sprite: '🕊️',
    role: 'villager',
    lines: [
      'Coo… I was flying to Port Lantern, and the wind blew me here. Three times. I think I live here now.',
      "Salt the Younger hid something shiny in a chest on this island. I saw her! I didn't tell. Oops, I just told.",
    ],
    ambient: ['Whoooa, wind!', 'Coo?', '🕊️'],
  },
  'gale-tass': {
    id: 'gale-tass',
    name: 'Kite-Maker Tass',
    sprite: '🪁',
    role: 'merchant',
    lines: [
      "Kites! Well, kite BADGES. I'm Tass. The windiest island in the world blows real kites away!",
      'Kite Badges never blow away. And I keep Berry Potions for travelers — this island has no inn!',
    ],
  },
  // Old Pike fishes off the north dock (15c review): Port Lantern's harbor has people on it.
  'port-fisher': {
    id: 'port-fisher',
    name: 'Old Pike',
    sprite: '🎣',
    role: 'villager',
    stationary: true,
    lines: [
      "Shh! You'll scare the fish. …Ah, never mind, they weren't biting anyway. I'm Old Pike.",
      "Fifty years I've fished this dock. Out past the islands, the fish are as big as boats. Or so my grandpa said.",
    ],
    ambient: ['Bite, fishy, bite…', 'Any minute now…', '🎣'],
  },
  // A rambler on Taleshore's road (15c review): someone out there besides the town.
  'tale-rambler': {
    id: 'tale-rambler',
    name: 'Rambler Hob',
    sprite: '🥾',
    role: 'villager',
    lines: [
      "Hello, traveler! I'm Hob. I walk every road on Taleshore, and I've still not seen it all.",
      'Out at sea are the Wayfinder Isles, north-west of town, and Gale Atoll, south-west. No road goes there. You need wings!',
      'Up the north road, by the mountains, the Songstone Cliffs sing. Down the south road, east into the woods, everyone whispers in the Quiet Quarter.',
    ],
    ambient: ['Left foot, right foot…', 'What a view!', '🥾'],
  },

  // The Dragon's Roost (#75 item 15b): where Ember's egg came from.
  'roost-stone': {
    id: 'roost-stone',
    name: 'The Roost Stone',
    sprite: '🪨',
    spriteId: 'marsh-stone',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      'An old stone covered in claw marks. Someone carved a dragon on it, curled round an egg.',
      'Tiny letters under it say: "When the fog came, the dragons flew away. The last one carried her egg down to the village, where the fog had not come yet."',
      'Ember presses her nose to the carving and rumbles softly. That egg was Ember — the very egg YOU found!',
    ],
  },

  // --- Chorus Isle (#75 item 15g) ---------------------------------------------------
  // Act III's crystal zone: Sage Aria, who speaks in song-fragments; Coda, who
  // lost the island's refrains; Maestro Brio's inn; Old Cadence by the double
  // gate; and Trill, a songbird who only knows half a song.
  'sage-aria': {
    id: 'sage-aria',
    name: 'Sage Aria',
    sprite: '🎼',
    role: 'sage',
    topic: 'words',
    lines: [
      '♪ La-la… hello, little singer! I am Sage Aria. Words are songs that forgot their tune. ♪',
      { text: '♪ The Hush Fiend took our voices… but not this one. I only sing it very, VERY quietly. ♪', unlessFlag: crystalFlag('words') },
      { text: '♪ Hear that? The whole island is singing! Thank you, thank you, thank YOU! ♪', ifFlag: crystalFlag('words') },
    ],
  },
  'chorus-brio': {
    id: 'chorus-brio',
    name: 'Maestro Brio',
    sprite: '🎻',
    role: 'innkeeper',
    lines: [
      'Welcome to the Resting Note Inn! I am Maestro Brio. Rest here — rest is a note too, you know.',
      "Harbormaster Gale used to sail over from Port Lantern every summer, just to hear us sing. That was before the hush came.",
      { text: 'Every song needs a pause. Even a brave hero.', unlessFlag: crystalFlag('words') },
      { text: "Listen to that racket — my whole island is singing! I haven't been this happy since my violin was a twig.", ifFlag: crystalFlag('words') },
    ],
  },
  'chorus-coda': {
    id: 'chorus-coda',
    name: 'Coda',
    sprite: '👧',
    role: 'villager',
    stationary: true,
    // Her quest's offer comes first ("Coda's Lost Refrains"); these follow it.
    lines: [
      { text: "I hum all three songs every day — very quietly, until the Hush Fiend is gone.", ifFlag: questDoneFlag({ id: CODA_QUEST }), unlessFlag: crystalFlag('words') },
      { text: 'Now we sing the sunrise song, the noon song AND the bedtime song — out loud. Every day!', ifFlag: [questDoneFlag({ id: CODA_QUEST }), crystalFlag('words')] },
    ],
  },
  'chorus-cadence': {
    id: 'chorus-cadence',
    name: 'Old Cadence',
    sprite: '👴',
    role: 'villager',
    stationary: true,
    lines: [
      { text: "I'm Old Cadence. I led the island's choir, before the Hush Fiend came. It lives in the hollow behind this gate.", unlessFlag: crystalFlag('words') },
      { text: "I'm Old Cadence. The hollow behind me is empty now — just echoes!", ifFlag: crystalFlag('words') },
      { text: 'Two locks, two Chorus Keys! The Compass Golem (Wayfinder Isles) has one; the Riddle Leviathan (Inkwell Cove) has the other.', unlessFlag: [keyFlag('chorus-a'), keyFlag('chorus-b')] },
      { text: 'You have the First Chorus Key! The other lock needs the Second — the Riddle Leviathan in Inkwell Cove has it.', ifFlag: keyFlag('chorus-a'), unlessFlag: keyFlag('chorus-b') },
      { text: 'You have the Second Chorus Key! The other lock needs the First — the Compass Golem on the Wayfinder Isles has it.', ifFlag: keyFlag('chorus-b'), unlessFlag: keyFlag('chorus-a') },
      { text: "You hold BOTH Chorus Keys! The gate is right behind me. Be brave — and be LOUD!", ifFlag: [keyFlag('chorus-a'), keyFlag('chorus-b')], unlessFlag: crystalFlag('words') },
      { text: 'The Crystal of Voices rings again! My choir is back — and every one of them is singing too loudly. Wonderful!', ifFlag: crystalFlag('words') },
    ],
  },
  'chorus-trill': {
    id: 'chorus-trill',
    name: 'Trill',
    sprite: '🐦',
    role: 'villager',
    lines: [
      { text: 'Tweet-tweedle-tweet-… I only remember HALF my song. The Hush Fiend shushed the rest. Tweet-…?', unlessFlag: crystalFlag('words') },
      { text: 'Tweet-tweedle-tweet-TWEEEE! I remember the WHOLE song now! Tweedle!', ifFlag: crystalFlag('words') },
    ],
    ambient: ['Tweet-tweedle!', '♪', '🐦'],
  },
  // The Crystal of Voices, ringing in the empty hollow once it's freed.
  'chorus-crystal': {
    id: 'chorus-crystal',
    name: 'Crystal of Voices',
    sprite: '💎',
    role: 'villager',
    prop: true,
    stationary: true,
    lines: [
      '💎 The Crystal of Voices hums. Put your ear close: every song on Taleshore is in it — and one small voice, far away.',
    ],
  },
  // Do and Re: twins who only ever say half a sentence each.
  'chorus-do': {
    id: 'chorus-do',
    name: 'Do',
    sprite: '🧒',
    role: 'villager',
    stationary: true,
    lines: [
      "I'm Do! And she's—",
      { text: 'We used to sing in rounds. Now we just TALK in rounds. It isn\'t the same.', unlessFlag: crystalFlag('words') },
      { text: 'Row, row, row your— Re, it\'s YOUR turn!', ifFlag: crystalFlag('words') },
    ],
  },
  'chorus-re': {
    id: 'chorus-re',
    name: 'Re',
    sprite: '👧',
    role: 'villager',
    stationary: true,
    lines: [
      "—Re! I'm Re. We're twins. Do always starts and I always finish.",
      { text: '…boat, gently down the STREAM! Ha! We remember the whole round!', ifFlag: crystalFlag('words') },
    ],
  },
  'chorus-baritone': {
    id: 'chorus-baritone',
    name: 'Old Baritone',
    sprite: '🎣',
    role: 'villager',
    lines: [
      'I fish. I used to sing the low notes. LOW. So low the fish came to listen.',
      { text: 'Now I hum. Hmmmmm. The fish are not impressed.', unlessFlag: crystalFlag('words') },
      { text: 'BOOOOM-bom-bom! The fish are back! They LOVE the low notes.', ifFlag: crystalFlag('words') },
    ],
    ambient: ['Bom.', '🎣'],
  },

  // --- Chartmaker's Rest (#75 item 15h) ---
  'chart-chartmaker': {
    id: 'chart-chartmaker',
    name: 'The Chartmaker',
    sprite: '🧓',
    role: 'villager',
    stationary: true,
    // His quest's offer comes first ("The Blank Chart", once Voices rings); these follow it.
    lines: [
      { text: "I'm the Chartmaker! I've charted every place in Lumina but one.", unlessFlag: crystalFlag('words') },
      { text: 'My ink keeps fading until the Crystal of Voices sings again. Free it! If you\'ve found my Compass Quill, keep it safe for me till then.', unlessFlag: crystalFlag('words') },
      {
        text: "Keep the Blank Chart safe. Every chart has edges — but a blank in the MIDDLE? That's a mystery worth solving.",
        ifFlag: BLANK_CHART_HELD,
        unlessFlag: ACT4_SEEN,
      },
      {
        text: 'So my blank was stairs under the Crystal Spire! I\'ll draw them in — the Dream Root Door. A chart is never finished, you know.',
        ifFlag: ACT4_SEEN,
      },
    ],
  },
  'chart-pen': {
    id: 'chart-pen',
    name: 'Pen',
    sprite: '🐦',
    role: 'villager',
    lines: [
      { text: 'Squawk! Shiny! Pen likes SHINY. Pen keeps shiny in the nest. Squawk!', unlessFlag: questDoneFlag({ id: BLANK_CHART_QUEST }) },
      { text: 'Squawk! Chartmaker inside! Blue roof! Squawk!', unlessFlag: questOfferedFlag({ id: BLANK_CHART_QUEST }) },
      { text: 'Squawk… shiny quill went home. Pen sad. Chart is shiny too! Pen happy. Squawk!', ifFlag: questDoneFlag({ id: BLANK_CHART_QUEST }) },
    ],
    ambient: ['Squawk!', 'Shiny?', '🐦'],
  },
  'chart-inka': {
    id: 'chart-inka',
    name: 'Inka',
    sprite: '👩‍🎨',
    role: 'villager',
    stationary: true,
    lines: [
      { text: "I'm Inka! I mix the Chartmaker's inks: sea-blue, forest-green, sunset-red. Today I'm trying starlight.", unlessFlag: stepFlag('chart-quill-ink') },
      { text: "The Chartmaker's in the blue-roofed study — go say hi!", unlessFlag: questOfferedFlag({ id: BLANK_CHART_QUEST }) },
      // Visited before the quill is found (round 4): she says what she needs.
      { text: "Bring me his Compass Quill and I'll fill it with starlight ink! Pen hid it in her nest, the chest by the study.", ifFlag: questOfferedFlag({ id: BLANK_CHART_QUEST }), unlessFlag: stepFlag('chart-quill-ink') },
      // Inked, she points back to him (saas UX review).
      { text: 'It worked! Run the Starlit Quill back to the Chartmaker, in the blue-roofed study!', ifFlag: stepFlag('chart-quill-ink'), unlessFlag: BLANK_CHART_HELD },
      { text: 'Starlight ink worked! Now I want to try moonlight. Or puddle-light.', ifFlag: BLANK_CHART_HELD },
      { text: 'The chart even drew ME. Teeny tiny! I\'ve never been on a map before.', ifFlag: BLANK_CHART_HELD },
    ],
    ambient: ['Sea-blue… or sky-blue?', '🎨'],
  },

  // --- Act IV: the Dream Root Door (#75 item 16a) ---
  // Keeper Aurora, come down from the Spire to keep the last warm room before the Dream Root.
  'root-aurora': {
    id: 'root-aurora',
    name: 'Keeper Aurora',
    sprite: '🔮',
    spriteId: 'spire-keeper',
    role: 'innkeeper',
    lines: [
      { text: 'Welcome to the Lamplight Rest, the last warm room before the Dream Root. Rest here whenever you need. I keep the lamps lit.', setFlag: MET_ROOT_AURORA },
      'Long ago, before the fog, I kept a lamp for a teacher who worked late. Every night she asked me a question I could not answer.',
      {
        text: 'I forgot her name, like everyone. But Wisp, in the Whispering Woods, is trying so hard to remember it. Go and see Wisp, little one.',
        unlessFlag: [questOfferedFlag({ id: SAY_HER_NAME_QUEST }), NAME_LEARNED],
      },
      // The fifth memory waits below (Lumina-That-Was, 16b): she says so, and where.
      {
        text: 'Someone below still remembers her — I am sure of it. But Old Knot has not untangled the way down yet. Rest here, and come back soon.',
        ifFlag: stepFlag('name-chronicle'),
        unlessFlag: [NAME_LEARNED, stepFlag('name-young-wick')],
      },
      {
        text: 'Aster. Yes… ASTER. I can see her lamp-lit face again. Thank you for remembering, for all of us.',
        ifFlag: NAME_LEARNED,
      },
    ],
  },
  'root-knot': {
    id: 'root-knot',
    name: 'Old Knot',
    sprite: '🌳',
    role: 'villager',
    stationary: true,
    lines: [
      'Creeeak. I am Old Knot, one root of the Dream Root. I go down, and down, and down — all the way to everything Lumina forgot.',
      'Down there, the world still looks the way it did before the fog. Folk you know are young again!',
      'The way down is still knotted shut. I am untangling it, little one, but roots are slow.',
    ],
    ambient: ['*creak*', 'Down and down…', '🍄'],
  },
  // Grandmother Wick as a girl, in Lumina-That-Was (placed with the Memory Village,
  // #75 item 16b) — the fifth memory in Wisp's Say Her Name.
  'memory-young-wick': {
    id: 'memory-young-wick',
    name: 'Young Wick',
    sprite: '👧',
    role: 'villager',
    stationary: true,
    lines: [
      "I'm Wick! I'm going to be a baker when I grow up. I burnt the bread again today. Don't tell!",
    ],
  },
};
