import type { SaveData, ZoneId } from '../types';
import { chestKeyItem, keyChestFor, litFlag, secretFlag } from './zones';
import { CHEST_COINS, type ConsumableId } from './items';
import { knowsFieldSpell } from './fieldSpells';
import { ACT2_SEEN } from './story';
import { BOAT_QUEST_ID } from './boat';

/**
 * Zone quests (#37 story pass, #42 variety). Quests are ordered steps over
 * the save file — each step is a predicate plus a hint, and can optionally
 * be fulfilled by talking to another NPC (deliveries). Three mechanics:
 *
 * - chest steps   — the zone's riddle-chest (openedChests)
 * - defeat steps  — lifetime kill counts per enemy def (save.kills)
 * - talk steps    — speak to a named NPC, who advances the quest
 * - secret steps  — find hidden secrets (village expansion; content/secrets.ts)
 * - have steps    — carry a quest item, e.g. from a key-item chest (#75 item 13)
 * - bring steps   — hand a carried item to another NPC, who may give back
 *                   something new — the item, changed (#75 item 13)
 *
 * Conversations resolve through `questConversation(npcId, save)`:
 * the giver speaks offer / current-step hint / completion; step-target NPCs
 * speak their step lines while that step is active. One person may give
 * several quests, one after another (`questFor`), and a step may go through
 * someone who gives quests of their own (#75 item 14c).
 */

export interface QuestItemInfo {
  id: string;
  name: string;
  emoji: string;
}

/** Carried delivery items (shown in the menu while held). */
export const QUEST_ITEMS: Record<string, QuestItemInfo> = {
  'color-seed': { id: 'color-seed', name: 'Color Seed', emoji: '🌱' },
  // Village expansion side quests (most are found in secrets).
  'town-seal': { id: 'town-seal', name: 'Town Seal', emoji: '🔏' },
  'warm-buns': { id: 'warm-buns', name: 'Warm Honey Buns', emoji: '🥐' },
  'page-addition': { id: 'page-addition', name: 'Lesson Page: Adding', emoji: '📄' },
  'page-shapes': { id: 'page-shapes', name: 'Lesson Page: Shapes', emoji: '📐' },
  'queen-bee': { id: 'queen-bee', name: 'Queen Bee', emoji: '🐝' },
  'brass-gear': { id: 'brass-gear', name: 'Brass Gear', emoji: '⚙️' },
  'silver-gear': { id: 'silver-gear', name: 'Silver Gear', emoji: '🔘' },
  'lost-painting': { id: 'lost-painting', name: '"Sunrise in Seven Colours"', emoji: '🖼️' },
  // Item chains (#75 item 13): found in a key-item chest, cut by Miner Mabel.
  moonstone: { id: 'moonstone', name: 'Moonstone', emoji: '🌙' },
  'cut-moonstone': { id: 'cut-moonstone', name: 'Cut Moonstone', emoji: '💠' },
};

export interface QuestStep {
  id: string;
  /** The giver's reminder while this step is active. */
  hint: string | ((save: SaveData) => string);
  isComplete: (save: SaveData) => boolean;
  /** Set when this step is fulfilled by talking to another NPC. */
  npc?: { id: string; lines: string[] };
  /**
   * A bring step's hand-over (#75 item 13): talking to `npc` takes `takes`
   * (only while it's carried) and hands back `gives`, if any.
   */
  trade?: { takes: string; gives?: string };
  /** A have step's items (#75 item 13), every form of every target — for the content tests. */
  needs?: string[];
}

export interface QuestDef {
  id: string;
  zoneId: ZoneId;
  giverNpcId: string;
  title: string;
  offer: string[];
  /** Item handed over when the quest is accepted (delivery quests). */
  givesItem?: string;
  /** Carried items handed back on completion (e.g. found in secrets). */
  takesItems?: string[];
  /** A town side quest (village expansion) rather than a zone's main quest. */
  side?: boolean;
  /** Only offered once this story flag is set (Act II's quests wait for `act2-seen`, #75 item 14). */
  requires?: string;
  steps: QuestStep[];
  complete: string[];
  reward: { coins: number; potion?: number; hint?: number; items?: Partial<Record<ConsumableId, number>> };
}

// --- Step builders ------------------------------------------------------------

/** The zone's riddle-chest has been opened. */
function chestStep(zoneId: ZoneId, hint: string): QuestStep {
  return {
    id: `${zoneId}-chest`,
    hint,
    isComplete: (save) => zoneChestOpened(save, zoneId),
  };
}

/**
 * Has the zone's riddle-chest been opened? A key-item chest (#75 item 13)
 * doesn't count — it belongs to its own quest, and opening it mustn't finish
 * a "find the zone's chest" step.
 */
export function zoneChestOpened(save: SaveData, zoneId: ZoneId): boolean {
  return save.openedChests.some((id) => id.startsWith(`${zoneId}:chest`) && !chestKeyItem(id));
}

/** Defeat each listed enemy (by def id) at least once — any order. */
function defeatStep(
  id: string,
  targets: { defId: string; label: string }[],
  intro: string,
): QuestStep {
  return {
    id,
    hint: (save) => {
      const left = targets.filter((t) => (save.kills[t.defId] ?? 0) < 1);
      return left.length === 0 ? intro : `${intro} Still out there: ${left.map((t) => t.label).join(', ')}!`;
    },
    isComplete: (save) => targets.every((t) => (save.kills[t.defId] ?? 0) >= 1),
  };
}

/** Talk to another NPC, who advances the quest with their own lines. */
function talkStep(id: string, npcId: string, lines: string[], hint: string): QuestStep {
  return {
    id,
    hint,
    npc: { id: npcId, lines },
    isComplete: (save) => save.flags[stepFlag(id)] === true,
  };
}

/** Find each listed secret (any order) — the hint names whatever's still hidden. */
function secretStep(id: string, targets: { secretId: string; label: string }[], intro: string): QuestStep {
  return {
    id,
    hint: (save) => {
      const left = targets.filter((t) => !save.flags[secretFlag(t.secretId)]);
      return left.length === 0 || targets.length === 1 ? intro : `${intro} Still hidden: ${left.map((t) => t.label).join(', ')}.`;
    },
    isComplete: (save) => targets.every((t) => save.flags[secretFlag(t.secretId)] === true),
  };
}

/**
 * Carry each listed item (#75 item 13) — any order; the hint names what's
 * still missing. A target can name several forms of one thing (a stone, then
 * the same stone cut), and carrying any of them counts. An item already
 * handed over in a bring step still counts (`handedOverFlag`), so a later
 * step that takes it away never sends the hero back to find it again.
 */
function haveStep(
  id: string,
  targets: { items: string[]; label: string }[],
  intro: string | ((save: SaveData) => string),
): QuestStep {
  const carrying = (save: SaveData, t: { items: string[] }) =>
    t.items.some((i) => save.questItems.includes(i) || save.flags[handedOverFlag(i)] === true);
  return {
    id,
    needs: targets.flatMap((t) => t.items),
    hint: (save) => {
      const lead = typeof intro === 'function' ? intro(save) : intro;
      const left = targets.filter((t) => !carrying(save, t));
      return left.length === 0 || targets.length === 1 ? lead : `${lead} Still to find: ${left.map((t) => t.label).join(', ')}.`;
    },
    isComplete: (save) => targets.every((t) => carrying(save, t)),
  };
}

/**
 * Bring a carried item to another NPC (#75 item 13). While this step is
 * active and the item is carried, talking to them hands it over — and they
 * may hand back `gives` (the item, changed).
 */
function bringStep(
  id: string,
  npcId: string,
  trade: { takes: string; gives?: string },
  lines: string[],
  hint: string,
): QuestStep {
  return {
    id,
    hint,
    npc: { id: npcId, lines },
    trade,
    isComplete: (save) => save.flags[stepFlag(id)] === true,
  };
}

/** Save flag: this quest item was handed over in a bring step (#75 item 13). */
export function handedOverFlag(item: string): string {
  return `quest-item:${item}:handed-over`;
}

export function stepFlag(stepId: string): string {
  return `quest-step:${stepId}`;
}

// --- The quests -----------------------------------------------------------------

export const QUESTS: QuestDef[] = [
  // Classic riddle-chest fetch.
  {
    id: 'counting-stones',
    zoneId: 'numbria',
    giverNpcId: 'numbria-villager',
    title: "Tally's Counting Stones",
    offer: [
      'My counting stones! The Null Fiend locked them in a riddle-chest somewhere in Numbria!',
      "Without them I can't count my sheep. They are VERY uncountable sheep.",
      'If you find the chest and crack its riddle, the stones are as good as found. Please?',
    ],
    steps: [chestStep('numbria', 'The riddle-chest is still out there — look for a 🎁 somewhere in Numbria!')],
    complete: [
      'My counting stones! You cracked the riddle!',
      'One, two, three… they all still work! Take this, hero — you EARNED it.',
      '✨ Reward: 25 coins and a Berry Potion!',
    ],
    reward: { coins: 25, potion: 1 },
  },

  // Defeat quest — chase off all three zone critters, any order.
  {
    id: 'firefly-defenders',
    zoneId: 'verdara',
    giverNpcId: 'verdara-villager',
    title: 'The Firefly Defenders',
    offer: [
      "It's not just the smog — the Smog Fiend's rowdy critters bounce around all night scaring my fireflies!",
      'The Spore Puff 🍄, the Static Jelly 🪼, and the Comet Crab 🦀. ALL THREE of them!',
      'Chase them off in battle and the fireflies might dare to glow again!',
    ],
    steps: [
      defeatStep(
        'verdara-critters',
        [
          { defId: 'spore-puff', label: 'Spore Puff 🍄' },
          { defId: 'static-jelly', label: 'Static Jelly 🪼' },
          { defId: 'comet-crab', label: 'Comet Crab 🦀' },
        ],
        'The fireflies are still hiding.',
      ),
    ],
    complete: [
      'You chased off all three?! Look — the fireflies are already drifting out!',
      'Tonight they are glowing in thank-you patterns. That one is YOU, I think.',
      '✨ Reward: 30 coins and a Hint Feather!',
    ],
    reward: { coins: 30, hint: 1 },
  },

  // Multi-step: find the gear, have the Sage polish it, report back.
  {
    id: 'golden-gear',
    zoneId: 'gearfall',
    giverNpcId: 'gearfall-villager',
    title: "Rivet's Golden Gear",
    offer: [
      'The great canyon engine is missing its golden gear — the Rust Fiend stuffed it in a riddle-chest!',
      'And rust never sleeps, so even if you find it, Sage Cog will need to polish it before it can spin.',
      'Find the chest, get the gear polished, and come tell me. Three jobs, one hero!',
    ],
    steps: [
      chestStep('gearfall', 'First job: find the riddle-chest 🎁 somewhere in Gearfall — the golden gear is inside!'),
      talkStep(
        'gear-polish',
        'sage-cog',
        [
          'Ah — the golden gear! Rusted to a whisper, but nothing a sage cannot shine.',
          'There. Polished to a hum. Run and tell Rivet the engine can sing again!',
        ],
        'You have the gear — now take it to Sage Cog for polishing!',
      ),
    ],
    complete: [
      'Polished and perfect! Listen… you can almost hear the engine smiling.',
      'Popcorn machine is back in business. This is for you, three-job hero!',
      '✨ Reward: 30 coins and a Berry Potion!',
    ],
    reward: { coins: 30, potion: 1 },
  },

  // Delivery: carry Doodle's seed to Sage Muse, then report back.
  {
    id: 'color-seed',
    zoneId: 'chromaria',
    giverNpcId: 'chromaria-villager',
    title: "Doodle's Color Seed",
    offer: [
      'Before the Gray Fiend drank our colors, I hid one last color seed. It looks… very gray now.',
      'Only Sage Muse can sing a seed awake. But the path is full of gray-struck critters and I am, um, EXTREMELY busy.',
      'Will you carry it to Sage Muse for me? Guard it well!',
    ],
    givesItem: 'color-seed',
    steps: [
      talkStep(
        'seed-awakening',
        'sage-muse',
        [
          'A color seed! Poor thing, hushed all the way gray. Let me sing it awake…',
          '🎵 …There! Feel it humming with rainbow? Hurry it back to Doodle before it sprouts in your pocket!',
        ],
        'Sage Muse can sing the seed awake — she is somewhere here in Chromaria!',
      ),
    ],
    complete: [
      'It is HUMMING! Listen to all those colors!',
      'When this blooms I will paint a mural of you. A BIG one. Take this meanwhile!',
      '✨ Reward: 30 coins and a Hint Feather!',
    ],
    reward: { coins: 30, hint: 1 },
  },

  // Home quest (Pip lives in Lumina Village since #75 item 8) sending the kid
  // out to Numbria for a specific foe.
  {
    id: 'pips-marble',
    zoneId: 'lumina-village',
    giverNpcId: 'hub-kid',
    title: "Pip's Lucky Marble",
    offer: [
      'I bet my lucky marble that the Count Bat in Numbria could not count to ten. IT COUNTED TO TWELVE.',
      'Now it keeps my marble tucked in its wing and does little victory laps. SO smug.',
      'Beat the Count Bat in a battle and win my marble back? Pleeeease?',
    ],
    steps: [
      defeatStep(
        'marble-rematch',
        [{ defId: 'count-bat', label: 'the Count Bat 🦇' }],
        'My marble is still doing laps around Numbria!',
      ),
    ],
    complete: [
      'MY MARBLE! And the Count Bat said you counted CIRCLES around it!',
      'You are the best hero ever. I saved up these coins from my chore jar — they are yours!',
      "And… can I come fight with you? I'm REALLY good with a slingshot. I can spot the tricky answers, too!",
      '✨ Reward: 20 coins and a Berry Potion! 🧒 Pip joined your battle party — use 🔄 Swap in battle to bring Pip in.',
    ],
    reward: { coins: 20, potion: 1 },
  },

  // Grove side-quest: relight the Moonwell (crack its chest + clear the moths).
  {
    id: 'grove-moonwell',
    zoneId: 'moonwell-grove',
    giverNpcId: 'grove-guardian',
    title: 'The Darkened Moonwell',
    offer: [
      'The Moonwell has shown nothing but dark water since the fog came. A well that forgets how to reflect is a sad thing indeed.',
      'Its old riddle-chest holds the moon-token that wakes the water — find it and crack the riddle.',
      'And shoo the dim-winged critters nesting at the water\'s edge, won\'t you? They love the dark a little too much.',
    ],
    steps: [
      chestStep('moonwell-grove', 'The moon-token sleeps in the riddle-chest 🎁 past the gate, in the south of the grove.'),
      defeatStep(
        'grove-critters',
        [
          { defId: 'mossback-cub', label: 'Mossback Cub 🐻' },
          { defId: 'thornhare', label: 'Thornhare 🐰' },
          { defId: 'grumblebee', label: 'Grumblebee 🐝' },
        ],
        'A few critters still crowd the dark water.',
      ),
    ],
    complete: [
      'The moon-token… and the water is calm again. Look — the Moonwell is catching the light!',
      'It remembers your face first of all. So will the whole grove, now. Thank you, little light.',
      'A small glow drifts down from the branches — Wisp, made of leftover questions, bright with all the ones you answered. It wants to light your way.',
      '✨ Reward: 35 coins and a Berry Potion! 🧚 Wisp joined your battle party — use 🔄 Swap in battle to bring Wisp in.',
    ],
    reward: { coins: 35, potion: 1 },
  },
  // --- Village expansion: two side quests per town ----------------------------

  // Lumina Village: find the Town Seal (a secret in the plaza fountain).
  {
    id: 'mayor-seal',
    zoneId: 'lumina-village',
    giverNpcId: 'village-mayor',
    side: true,
    title: "The Mayor's Missing Seal",
    offer: [
      'Oh dear, oh dear. My golden Town Seal is GONE. I had it at the plaza this morning, admiring the fountain…',
      'Without it I cannot sign anything. Not even my own birthday card!',
      'Could you look around town for it? Keep an eye out for anything that glints.',
    ],
    steps: [
      secretStep(
        'mayor-seal-find',
        [{ secretId: 'village-fountain-seal', label: 'the Town Seal' }],
        'Last I had it, I was leaning over the plaza fountain. Look closely at the water!',
      ),
    ],
    takesItems: ['town-seal'],
    complete: [
      'My seal! Shiny as the day it was made. *STAMP* — I hereby declare you an Honorary Citizen!',
      '✨ Reward: 40 coins and a Lucky Clover!',
    ],
    reward: { coins: 40, items: { clover: 1 } },
  },

  // Lumina Village: deliver warm buns to two neighbours, in order.
  {
    id: 'bakery-deliveries',
    zoneId: 'lumina-village',
    giverNpcId: 'village-baker',
    side: true,
    title: "Baker Dot's Busy Morning",
    offer: [
      'Two orders and only one of me! These honey buns must reach Grandmother Wick AND Keeper Sol while they are warm.',
      'Grandmother Wick first — she gets grumpy if hers is cold. Then Keeper Sol in the Lantern Workshop.',
      'Here, take the basket. Quick-quick, before they cool!',
    ],
    givesItem: 'warm-buns',
    steps: [
      talkStep(
        'buns-wick',
        'village-elder',
        [
          'Honey buns from Dot? Still warm! You always were my favourite delivery hero.',
          'Off you go now — Sol is waiting for the other one, and that man LOVES a bun.',
        ],
        'First stop: Grandmother Wick, in her house in the south-east of town!',
      ),
      talkStep(
        'buns-sol',
        'village-keeper',
        [
          'Is that… a honey bun? For me? The lanterns can wait. *munch munch*',
          'Tell Dot it was perfect. Crispy outside, soft inside — like a good lantern wick.',
        ],
        'Next: Keeper Sol at the Lantern Workshop, in the south-west of town!',
      ),
    ],
    complete: [
      'Both delivered while warm?! You are faster than my oven timer!',
      'Here — a baker always pays in snacks. And coins. Mostly snacks.',
      '✨ Reward: 35 coins, a Berry Potion and a Sunseed Snack!',
    ],
    reward: { coins: 35, potion: 1, items: { snack: 1 } },
  },

  // Numbria: two lost lesson pages, hidden in the school and the hills.
  {
    id: 'lost-lessons',
    zoneId: 'numbria',
    giverNpcId: 'numbria-teacher',
    side: true,
    title: "Teacher Pi's Lost Lessons",
    offer: [
      'Disaster! A gust of wind blew two of my lesson pages away — the one on ADDING and the one on SHAPES.',
      'One fluttered somewhere inside this very schoolhouse. The other sailed off toward the west hills!',
      'Without them, class tomorrow is just me humming. Will you find them?',
    ],
    steps: [
      secretStep(
        'lessons-find',
        [
          { secretId: 'numbria-school-shelf', label: 'the page on adding (somewhere in the schoolhouse)' },
          { secretId: 'numbria-hill-nook', label: 'the page on shapes (out in the west hills)' },
        ],
        'Find my two lesson pages!',
      ),
    ],
    takesItems: ['page-addition', 'page-shapes'],
    complete: [
      'Adding AND shapes! Class is saved. A square has four sides and you have one enormous heart.',
      '✨ Reward: 40 coins, a Hint Feather and a Focus Tea!',
    ],
    reward: { coins: 40, hint: 1, items: { tea: 1 } },
  },

  // Numbria: chase off two slimy pests.
  {
    id: 'dos-slimes',
    zoneId: 'numbria',
    giverNpcId: 'numbria-kid',
    side: true,
    title: "Dos's Slime Trouble",
    offer: [
      'The Sum Slime keeps sliming my homework, and Sir Sumsalot keeps correcting it. WRONG-ly!',
      'Beat them both in a battle and I can do my sums in peace. Ten, nine, eight… please?',
    ],
    steps: [
      defeatStep(
        'dos-slimes-defeat',
        [
          { defId: 'sum-slime', label: 'Sum Slime 🟦' },
          { defId: 'sir-sumsalot', label: 'Sir Sumsalot 🐉' },
        ],
        'My homework is still in danger!',
      ),
    ],
    complete: [
      'They are GONE! My homework is clean and my sums are right. Mostly right. Some of them.',
      '✨ Reward: 30 coins and a Focus Tea!',
    ],
    reward: { coins: 30, items: { tea: 1 } },
  },

  // Verdara: the runaway Queen Bee hides in a secret glade.
  {
    id: 'queen-bee',
    zoneId: 'verdara',
    giverNpcId: 'verdara-beekeeper',
    side: true,
    title: "Hilda's Runaway Queen",
    offer: [
      'My Queen Bee has flown the hive! Without her, the workers just buzz in circles. Look at them. Circles!',
      'She loves clover more than anything. If there is a clover patch hidden anywhere in Verdara, she is in it.',
      'Bring her home gently, won\'t you? She bites only when she is cranky. She is always cranky.',
    ],
    steps: [
      secretStep(
        'queen-find',
        [{ secretId: 'verdara-queen-bee', label: 'the Queen Bee' }],
        'Find a hidden clover patch — the trees east of the big meadow look awfully thin in one spot…',
      ),
    ],
    takesItems: ['queen-bee'],
    complete: [
      'Your Majesty! Back where you belong. Listen — the whole hive is cheering. Bzzzzz!',
      '✨ Reward: 40 coins and two Sunseed Snacks!',
    ],
    reward: { coins: 40, items: { snack: 2 } },
  },

  // Verdara: a talk chain — a cutting from Sage Flora, planted by Sprout.
  {
    id: 'garden-survey',
    zoneId: 'verdara',
    giverNpcId: 'verdara-botanist',
    side: true,
    title: "Professor Petal's Moonbloom",
    offer: [
      'I am trying to grow a moonbloom — the rarest flower in Lumina! Only Sage Flora knows how to take a cutting.',
      'Ask her for one, then bring it to Sprout. That treehouse gets the best light in all of Verdara.',
    ],
    steps: [
      talkStep(
        'moonbloom-cutting',
        'sage-flora',
        [
          'A moonbloom cutting? For Petal? Of course. Snip — gently, gently.',
          'Keep it in the shade until it is planted. Sprout\'s treehouse will suit it perfectly.',
        ],
        'First, ask Sage Flora for a moonbloom cutting — she tends her greenhouse in the south-west.',
      ),
      talkStep(
        'moonbloom-plant',
        'verdara-kid',
        [
          'A real moonbloom?! I will plant it in my best pot. I will water it EVERY day. Twice on Sundays!',
          'Tell Professor Petal it is in good hands. Small hands, but good ones.',
        ],
        'Now bring the cutting to Sprout, who lives in the treehouse in the east meadow.',
      ),
    ],
    complete: [
      'Planted in the treehouse? Splendid! In a month it will glow like a little moon.',
      '✨ Reward: 35 coins and a Honey Elixir!',
    ],
    reward: { coins: 35, items: { elixir: 1 } },
  },

  // Gearfall: two missing clock gears, both hidden.
  {
    id: 'tock-gears',
    zoneId: 'gearfall',
    giverNpcId: 'gearfall-clockkeeper',
    side: true,
    title: "Tock's Stopped Clock",
    offer: [
      'The Clocktower has stopped! Two gears are missing — a Brass Gear and a Silver Gear. Without them, it is always 3 o\'clock.',
      'I love 3 o\'clock, but not FOREVER. Somebody must have hidden them around the plaza.',
    ],
    steps: [
      secretStep(
        'gears-find',
        [
          { secretId: 'gearfall-gear-crate', label: 'the Brass Gear' },
          { secretId: 'gearfall-nook-gear', label: 'the Silver Gear' },
        ],
        'Search around the Clockwork Plaza for my gears!',
      ),
    ],
    takesItems: ['brass-gear', 'silver-gear'],
    complete: [
      'Brass… click. Silver… clack. And — TICK! TOCK! The clock lives!',
      '✨ Reward: 45 coins and a Turbo Coil!',
    ],
    reward: { coins: 45, items: { coil: 1 } },
  },

  // Gearfall: beat two critters, then report to the Professor.
  {
    id: 'widget-test',
    zoneId: 'gearfall',
    giverNpcId: 'gearfall-apprentice',
    side: true,
    title: "Widget's Field Test",
    offer: [
      'Professor Sprocket wants field data on canyon critters, and I am, um, scared of them.',
      'Battle the Bolt Mouse and the Scrap Golem, then tell the Professor what you saw. For science!',
    ],
    steps: [
      defeatStep(
        'widget-defeat',
        [
          { defId: 'bolt-mouse', label: 'Bolt Mouse 🐭' },
          { defId: 'scrap-golem', label: 'Scrap Golem 🤖' },
        ],
        'We still need data!',
      ),
      talkStep(
        'widget-report',
        'gearfall-inventor',
        [
          'Field data! Bolt Mouse: zippy. Scrap Golem: clanky. Hero: magnificent. I will write that down.',
          'Tell Widget the experiment was a success. And to stop hiding behind the crates.',
        ],
        'Now report to Professor Sprocket in the workshop!',
      ),
    ],
    complete: [
      'The Professor said SUCCESS? I am going to frame that word.',
      '✨ Reward: 35 coins and a Spark Cell!',
    ],
    reward: { coins: 35, items: { spark: 1 } },
  },

  // Chromaria: the missing masterpiece, hidden in the sculpture garden.
  {
    id: 'masterpiece',
    zoneId: 'chromaria',
    giverNpcId: 'chromaria-curator',
    side: true,
    title: 'The Missing Masterpiece',
    offer: [
      'Darling, a catastrophe! "Sunrise in Seven Colours" — our most precious painting — has vanished from the Gallery!',
      'The Gray Fiend\'s critters must have carried it off and hidden it. Somewhere quiet. Somewhere… sculptural.',
      'Bring it home and the Gallery will be forever in your debt!',
    ],
    steps: [
      secretStep(
        'masterpiece-find',
        [{ secretId: 'chromaria-lost-painting', label: 'the painting' }],
        'Clay talks about a secret sculpture garden behind the west wall. Perhaps look there, darling?',
      ),
    ],
    takesItems: ['lost-painting'],
    complete: [
      'My Sunrise! Every one of its seven colours, safe and bright. I could kiss you. I will not. But I could.',
      '✨ Reward: 45 coins and a Mirror Charm!',
    ],
    reward: { coins: 45, items: { mirror: 1 } },
  },

  // Chromaria: collect three notes by talking around town.
  {
    id: 'song-of-colors',
    zoneId: 'chromaria',
    giverNpcId: 'chromaria-musician',
    side: true,
    title: 'Song of Colors',
    offer: [
      'I am writing the Song of Colors, but three notes are missing! Each one is kept by a different artist in town.',
      'Clay the sculptor, Seller Swirl at the paint shop, and Glint at Mirror Hall. Collect all three for me?',
    ],
    steps: [
      talkStep(
        'note-clay',
        'chromaria-kid',
        ['A note? Mine is a big, round, squishy one — like clay! BOOOM. There, you have it.'],
        'First note: Clay the sculptor, who wanders the south streets.',
      ),
      talkStep(
        'note-swirl',
        'chromaria-merchant',
        ['My note swirls up and down like paint in water. Oooo-eeee-oooo! Take it, take it!'],
        "Second note: Seller Swirl, at Swirl's Paint & Charms up the street.",
      ),
      talkStep(
        'note-glint',
        'chromaria-mirror-merchant',
        ['My note is the same note, but backwards. *ting*… *gnit*. Mirror magic!'],
        'Last note: Glint, at Mirror Hall.',
      ),
    ],
    complete: [
      'Squish… swirl… ting! *plays* — the Song of Colors is COMPLETE! Listen to it ring!',
      '✨ Reward: 40 coins and a Rainbow Ward!',
    ],
    reward: { coins: 40, items: { ward: 1 } },
  },

  // --- Item chains (#75 item 13) ----------------------------------------------

  // Find a key item in a dungeon chest (behind the Echo Mine's dark — Glow),
  // have it cut by Miner Mabel, bring it home to the hermit.
  {
    id: 'hermit-moonstone',
    zoneId: 'dawnreach',
    giverNpcId: 'dawnreach-hermit',
    side: true,
    title: "The Hermit's Moonstone",
    offer: [
      "Hello, traveler. I'm Moss. I've lived on this hill since before the fog, reading the stars by my moon-lamp.",
      'But the lamp\'s old stone cracked, and without it the night sky is too dim to read.',
      'Long ago the miners found a Moonstone in the Echo Mine — that cave, right beside my hill — and left it in a chest, in a little nook.',
      'Bring it out, and ask Miner Mabel, just inside the mine, to cut it — her paws know stone. Then bring it to me?',
    ],
    steps: [
      haveStep(
        'moonstone-find',
        [{ items: ['moonstone', 'cut-moonstone'], label: 'the Moonstone' }],
        (save) =>
          save.flags[litFlag('echo-mine')]
            ? "The Echo Mine's lamps are lit now! Go up the left-hand tunnel and look in the little nook for a 🎁 — that's the Moonstone's chest."
            : knowsFieldSpell('glow', save.flags)
              ? "The Moonstone's chest is in a little nook deep in the Echo Mine, the cave beside my hill. It's pitch dark in there — cast 🔆 Glow inside!"
              : "The Moonstone's chest is in a little nook deep in the Echo Mine, the cave beside my hill. It's too dark to find without a light — Old Wren at the Shrine of First Light knows a light spell.",
      ),
      bringStep(
        'moonstone-cut',
        'mine-miner',
        { takes: 'moonstone', gives: 'cut-moonstone' },
        [
          'Is that… a Moonstone? From the old seam? I haven\'t seen one since I was a pup!',
          'For Moss\'s lamp? Hold still… tap, tap… *tink*. There — seven little faces, to catch the moon.',
          '✨ You got the Cut Moonstone! Take it up the hill to Moss. Tell him Mabel says hello.',
        ],
        'You have the Moonstone! Ask Miner Mabel, just inside the Echo Mine, to cut it.',
      ),
    ],
    takesItems: ['cut-moonstone'],
    complete: [
      'Mabel\'s work — I\'d know it anywhere. Seven faces, every one catching the light.',
      '*click* — the moon-lamp glows. Look up: every star over Dawnreach, sharp as new.',
      '✨ Reward: 50 coins and a Honey Elixir!',
    ],
    reward: { coins: 50, items: { elixir: 1 } },
  },

  // --- Act II (#75 item 14) ---------------------------------------------------

  // Marlow's Boat: the morning after the Spire, Old Marlow remembers he's a
  // sailor. Three friends across Dawnreach give his boat what it needs; then
  // the Biscuit is yours, and the Silver Shallows are a sail away.
  {
    id: BOAT_QUEST_ID,
    zoneId: 'starfall-coast',
    giverNpcId: 'coast-fisher',
    requires: ACT2_SEEN,
    title: "Marlow's Boat",
    offer: [
      'You! The kid who climbed the Spire! Did you feel it too? This morning my fish remembered the way home — and I remembered I\'m a SAILOR.',
      "Out past my dock lie the Silver Shallows: islands nobody's seen since the fog came. I'd take you there in a heartbeat, but my boat, the Biscuit, is in pieces.",
      'She needs a new sail, a compass that remembers north, and a rudder. Three friends of mine can help — one in Verdara, one in Chromaria, one in Gearfall Canyon.',
      'Start with the sail: Willow weaves the toughest sails on Dawnreach. She runs the Mossy Pillow Inn in Verdara, way down in the south-west.',
    ],
    steps: [
      talkStep(
        'boat-sail',
        'verdara-innkeeper',
        [
          "A sail for Old Marlow? Oh, I'd LOVE to. Every winter I weave one from Verdara's giant leaves — tough as a turtle, and it smells like rain.",
          "Help me fold it… there! I'll send it down to Marlow's dock with the next flower cart.",
          "✨ The Leaf-Silk Sail is on its way to the dock! Next, Marlow's compass: Mapmaker Atlas has it, in Chromaria.",
        ],
        'First, a sail. Willow weaves the toughest sails on Dawnreach — she runs the Mossy Pillow Inn in Verdara, way down in the south-west.',
      ),
      talkStep(
        'boat-compass',
        'chromaria-traveler',
        [
          'Marlow\'s star-compass? He lent it to me ages ago, to draw the coast! I forgot I even had it. …Everyone is remembering things today.',
          "It points north again now the fog is gone — look, it's practically wagging. I'll send it to his dock!",
          "✨ Marlow's Star-Compass is on its way to the dock! Last, a rudder: Sage Cog in Gearfall Canyon builds anything that turns.",
        ],
        "Next, my compass. I lent it to Mapmaker Atlas, who's drawing maps by the Rainbow Quilt Inn in Chromaria, way over in the south-east.",
      ),
      talkStep(
        'boat-rudder',
        'sage-cog',
        [
          "A rudder? For a boat that SAILS? Oh, splendid. I've been dying to build something wet.",
          '*clank* *whirr* *tink* — a clockwork rudder that steers itself straight whenever you let go. Rivet will carry it down to Marlow\'s dock and help him fit everything.',
          '✨ The Clockwork Rudder is done! Go tell Old Marlow on Starfall Coast — his boat is ready to mend.',
        ],
        'Last, a rudder. Sage Cog in Gearfall Canyon, up in the north-east, can build anything that turns.',
      ),
    ],
    complete: [
      'A leaf-silk sail, my old star-compass, and a rudder that steers itself! Rivet and I fitted the lot this morning.',
      "Look at her bob! The Biscuit is the finest boat in Lumina — and she's yours to sail. I'm too old for islands, but you're not.",
      "She's tied up at my dock, just east of here. Climb in, and sail off the east edge of the sea to reach the Silver Shallows!",
      '✨ Reward: Marlow\'s boat, the Biscuit — and 50 coins!',
    ],
    reward: { coins: 50 },
  },
];

// --- Resolution -----------------------------------------------------------------

/** Every quest this person gives, in order (#75 item 14c: one person can give several). */
export function questsBy(npcId: string): QuestDef[] {
  return QUESTS.filter((q) => q.giverNpcId === npcId);
}

/**
 * The quest this person is on now. Finish what you started: one already
 * accepted and not done comes first — even before a story quest that has
 * just unlocked — then their first not done whose story flag (`requires`)
 * is set. The next one waits until this one's done.
 */
export function questFor(npcId: string, save: SaveData): QuestDef | undefined {
  const mine = questsBy(npcId).filter((q) => !save.flags[questDoneFlag(q)]);
  return mine.find((q) => save.flags[questOfferedFlag(q)]) ?? mine.find((q) => !q.requires || save.flags[q.requires]);
}

export function questOfferedFlag(q: Pick<QuestDef, 'id'>): string {
  return `quest:${q.id}:offered`;
}

export function questDoneFlag(q: Pick<QuestDef, 'id'>): string {
  return `quest:${q.id}:done`;
}

/** The first incomplete step, or null when every step is done. */
export function activeStep(q: QuestDef, save: SaveData): QuestStep | null {
  return q.steps.find((st) => !st.isComplete(save)) ?? null;
}

export function resolveHint(step: QuestStep, save: SaveData): string {
  return typeof step.hint === 'function' ? step.hint(save) : step.hint;
}

export interface QuestConversation {
  lines: string[];
  /** Quest title, shown as a chip on the dialogue box. */
  badge: string;
  /** Save mutation applied when the conversation closes (null = none). */
  finish: ((save: SaveData) => SaveData) | null;
  /** What the closing button should celebrate. */
  finishKind: 'offer' | 'complete' | 'step' | null;
}

/**
 * The quest conversation an NPC holds right now, or null when normal
 * dialogue applies. In order (#75 item 14c):
 *   1. their quest is ready to **complete** — even if the player finished
 *      the steps before hearing the offer;
 *   2. a **step** goes through them (any quest's, while that step is active;
 *      a bring step only once its item is in hand);
 *   3. they **offer** their quest;
 *   4. they **remind** you of its current step.
 */
export function questConversation(npcId: string, save: SaveData): QuestConversation | null {
  const quest = questFor(npcId, save);
  const step = quest ? activeStep(quest, save) : null;
  if (quest && !step) return completeConversation(quest);
  const through = stepConversation(npcId, save);
  if (through) return through;
  if (!quest || !step) return null;
  if (!save.flags[questOfferedFlag(quest)]) {
    return {
      lines: quest.offer,
      badge: quest.title,
      finishKind: 'offer',
      finish: (s) => ({
        ...s,
        questItems:
          quest.givesItem && !s.questItems.includes(quest.givesItem)
            ? [...s.questItems, quest.givesItem]
            : s.questItems,
        flags: { ...s.flags, [questOfferedFlag(quest)]: true },
      }),
    };
  }
  return { lines: [resolveHint(step, save)], badge: quest.title, finishKind: null, finish: null };
}

/** The giver hands out the reward and takes back what the quest lent or needed. */
function completeConversation(quest: QuestDef): QuestConversation {
  return {
    lines: quest.complete,
    badge: quest.title,
    finishKind: 'complete',
    finish: (s) => {
      const { coins, potion = 0, hint = 0, items = {} } = quest.reward;
      const nextItems = { ...s.items, potion: s.items.potion + potion, hint: s.items.hint + hint };
      for (const [id, n] of Object.entries(items) as [ConsumableId, number][]) nextItems[id] += n;
      return {
        ...s,
        coins: s.coins + coins,
        items: nextItems,
        questItems: s.questItems.filter((i) => i !== quest.givesItem && !quest.takesItems?.includes(i)),
        flags: { ...s.flags, [questDoneFlag(quest)]: true, [questOfferedFlag(quest)]: true },
      };
    },
  };
}

/** A step that goes through this NPC (deliveries, multi-step middles), or null. */
function stepConversation(npcId: string, save: SaveData): QuestConversation | null {
  for (const q of QUESTS) {
    if (!save.flags[questOfferedFlag(q)] || save.flags[questDoneFlag(q)]) continue;
    const step = activeStep(q, save);
    if (step?.npc && step.npc.id === npcId) {
      const flag = stepFlag(step.id);
      const trade = step.trade;
      // A bring step waits until the item is in hand (#75 item 13).
      if (trade && !save.questItems.includes(trade.takes)) continue;
      return {
        lines: step.npc.lines,
        badge: q.title,
        finishKind: 'step',
        finish: (s) => ({
          ...s,
          questItems: trade ? tradeItems(s.questItems, trade) : s.questItems,
          flags: { ...s.flags, [flag]: true, ...(trade ? { [handedOverFlag(trade.takes)]: true } : {}) },
        }),
      };
    }
  }
  return null;
}

/** Carried items after a bring step's hand-over: `takes` goes, `gives` (if any) arrives once. */
function tradeItems(items: string[], trade: { takes: string; gives?: string }): string[] {
  const kept = items.filter((i) => i !== trade.takes);
  return trade.gives && !kept.includes(trade.gives) ? [...kept, trade.gives] : kept;
}

/**
 * Open a riddle-chest (path-target id): mark it opened and pay its coins,
 * plus its quest item if it's a key-item chest (#75 item 13). Opening one
 * twice changes nothing.
 */
export function openChest(save: SaveData, chestId: string): SaveData {
  if (save.openedChests.includes(chestId)) return save;
  const item = chestKeyItem(chestId);
  return {
    ...save,
    openedChests: [...save.openedChests, chestId],
    coins: save.coins + CHEST_COINS,
    questItems: item && !save.questItems.includes(item) ? [...save.questItems, item] : save.questItems,
  };
}

/** What a chest gives, for its "pops open" line: "25 coins! 🪙" or "25 coins and the 🌙 Moonstone!". */
export function chestRewardText(chestId: string): string {
  const info = QUEST_ITEMS[chestKeyItem(chestId) ?? ''];
  return info ? `${CHEST_COINS} coins and the ${info.emoji} ${info.name}!` : `${CHEST_COINS} coins! 🪙`;
}

/**
 * A key-item chest's "who wants this" line (#75 item 13), shown with the
 * find — only while the quest that needs the item hasn't been offered, so a
 * kid who opens the chest first knows where to take it. Null otherwise.
 */
export function chestWantedLine(save: SaveData, chestId: string): string | null {
  const chest = keyChestFor(chestId);
  if (!chest) return null;
  const quest = QUESTS.find(
    (q) => q.takesItems?.includes(chest.item) || q.steps.some((st) => st.needs?.includes(chest.item) || st.trade?.takes === chest.item),
  );
  return quest && !save.flags[questOfferedFlag(quest)] && !save.flags[questDoneFlag(quest)] ? chest.wantedBy : null;
}

/** Quests accepted but not finished — for the menu's quest log. */
export function activeQuests(save: SaveData): QuestDef[] {
  return QUESTS.filter(
    (q) => save.flags[questOfferedFlag(q)] && !save.flags[questDoneFlag(q)],
  );
}
