import type { SaveData, Topic, ZoneId } from '../types';
import { chestKeyItem, keyChestFor, litFlag, secretFlag } from './zones';
import { CHEST_COINS, type ConsumableId } from './items';
import { knowsFieldSpell } from './fieldSpells';
import { ACT2_SEEN, ACT4_SEEN } from './story';
import { BOAT_QUEST_ID } from './boat';
import { crystalFlag } from './topics';
import { BELL_QUEST, BELL_SLATES, BLANK_CHART_HELD, BLANK_CHART_QUEST, CODA_QUEST, DOG_QUEST, NAME_LEARNED, SAY_HER_NAME_QUEST, JUNO_CAME, JUNO_QUEST, JUNO_WALK, RESO_QUEST, RESO_STONES, SHUSH_QUEST, YARN_QUEST, YARN_STONES, POSY_QUEST, POSY_SAILED, POSY_WALK, escortBackFlag, escortWalkingFlag, questDoneFlag, questOfferedFlag, stepFlag } from './questFlags';

export { escortWalkingFlag, questDoneFlag, questOfferedFlag, stepFlag };

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
 * - escort steps  — walk someone through a place: they follow the hero and
 *                   wait while a critter is near (#75 item 14g, Posy)
 * - song steps    — talk to things in order; talking to one out of turn is a
 *                   wrong note that starts the song again (#75 item 15f, Reso)
 * - riddle steps  — talk to a thing that asks a question; a right answer
 *                   completes the step and says where the next one is — a
 *                   puzzle chain (#75 item 15e, Yarn's tale-stones)
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
  // Fen's Forgotten Acorns (#75 item 14f): three key-item chests in Eldergrove.
  'acorn-speckled': { id: 'acorn-speckled', name: 'Speckled Acorn', emoji: '🌰' },
  'acorn-striped': { id: 'acorn-striped', name: 'Striped Acorn', emoji: '🌰' },
  'acorn-golden': { id: 'acorn-golden', name: 'Golden Acorn', emoji: '🌰' },
  // Salt's sea-glass (#75 item 15d): two chests on Driftwood Shallows, one on Gale Atoll.
  'seaglass-green': { id: 'seaglass-green', name: 'Green Sea-Glass', emoji: '💚' },
  'seaglass-blue': { id: 'seaglass-blue', name: 'Blue Sea-Glass', emoji: '💙' },
  'seaglass-gold': { id: 'seaglass-gold', name: 'Gold Sea-Glass', emoji: '💛' },
  // The Lantern Ledger (#75 item 14g): Brume's little book, in a key-item chest in Foglight Marsh.
  'lantern-ledger': { id: 'lantern-ledger', name: 'Lantern Ledger', emoji: '📒' },
  // The Pen-Pal Papers (#75 item 15f): Shush's letter, and Librarian Sage's reply.
  'shush-letter': { id: 'shush-letter', name: "Shush's Letter", emoji: '✉️' },
  'sage-letter': { id: 'sage-letter', name: "Librarian Sage's Reply", emoji: '📨' },
  // Ness's Lens (#75 item 14i): sea glass from Sandpiper Cay, ground by Shelby.
  'sea-glass': { id: 'sea-glass', name: 'Sea Glass', emoji: '🧊' },
  'sea-glass-lens': { id: 'sea-glass-lens', name: 'Sea-Glass Lens', emoji: '🔍' },
  // A Letter, Long Overdue (#75 item 14h): Index's find, and Wick's note back.
  'old-letter': { id: 'old-letter', name: 'Old Letter', emoji: '📜' },
  // Coda's Lost Refrains (#75 item 15g): three key-item chests on Chorus Isle.
  'refrain-sunrise': { id: 'refrain-sunrise', name: 'Sunrise Refrain', emoji: '🌅' },
  'refrain-noon': { id: 'refrain-noon', name: 'Noon Refrain', emoji: '☀️' },
  'refrain-bedtime': { id: 'refrain-bedtime', name: 'Bedtime Refrain', emoji: '🌙' },
  'wick-note': { id: 'wick-note', name: "Wick's Thank-You Note", emoji: '💌' },
  // The Blank Chart (#75 item 15h): the Chartmaker's quill, inked by Inka — and the chart itself, kept for Act IV.
  'compass-quill': { id: 'compass-quill', name: 'Compass Quill', emoji: '✒️' },
  'starlit-quill': { id: 'starlit-quill', name: 'Starlit Quill', emoji: '✨' },
  'blank-chart': { id: 'blank-chart', name: 'Blank Chart', emoji: '🗺️' },
};

/**
 * Fen's acorns in the order she remembers them (#75 item 14f): each one found
 * jogs her memory about the next, so her hint always points at the first
 * still missing — the "hints chain" of STORY-4X.
 */
const FEN_ACORNS = [
  {
    item: 'acorn-speckled',
    label: 'the Speckled Acorn',
    where: 'The Speckled Acorn is in a 🎁 on the far west side of the grove, between the trees.',
  },
  {
    item: 'acorn-striped',
    label: 'the Striped Acorn',
    where: 'The Striped Acorn is in a 🎁 on the east side. Follow the path east, between the two ponds!',
  },
  {
    item: 'acorn-golden',
    label: 'the Golden Acorn',
    where: 'The Golden Acorn is in a 🎁 in a little circle of trees in the south-west corner — not the Great Ring!',
  },
] as const;

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
  /** An escort step's walk (#75 item 14g). */
  escort?: EscortDef;
  /**
   * A talk step that says "not this one yet" when its NPC is talked to before
   * its turn, with the step that's due (#75 item 14g review: Brume's lanterns).
   */
  early?: boolean;
  /**
   * A person's own words for "not yet", in place of "Not this one yet!" and the
   * due step's hint (#75 item 16a review round 4: Keeper Mnem isn't a lantern).
   */
  earlyLine?: string;
  /**
   * "Not yet" only once this story flag is set (16a code review round 4): until
   * then the NPC's own story beat comes first — Mnem's call to the Hall's dedication.
   */
  earlyAfter?: string;
  /**
   * What the giver says while this step is active, when the hint (also the
   * quest log's, and said by other people) would have them talk about
   * themselves (15e review: Yarn saying "west of Yarn"). Default: the hint.
   */
  remind?: string;
  /**
   * A riddle step (#75 item 15e): talking to `npc` opens a question on the
   * zone's topic instead of finishing the step; a right answer finishes it,
   * and `solved` — the clue to the next step — shows under the answer.
   */
  riddle?: {
    solved: string;
    /** Its question's topic (#75 item 16b), in place of the zone's (`topicAt`). */
    topic?: Topic;
    /** What the question screen says it is, and when it's answered right or wrong (default: a tale-stone's). */
    words?: RiddleWords;
  };
  /**
   * A song step (#75 item 15f): talked to out of turn while the song is due,
   * its thing is a wrong note — every song step of its quest is un-done and the
   * song starts again (roadmap decision 14: no timers, the song just restarts).
   * Before the song is due, it's an ordinary "not this one yet".
   */
  song?: boolean;
}

/**
 * An escort (#75 item 14g): talk to `npcId` in `zoneId` and they follow the
 * hero (`lib/escort.ts`) — waiting while a critter is near — until they reach
 * `goal` (a cell), which completes the step. Their walk is never saved:
 * leaving the place, losing a battle or reloading sends them back to wait
 * where they started (`escortWalkingFlag`).
 */
export interface EscortDef {
  npcId: string;
  zoneId: ZoneId;
  goal: { x: number; y: number };
  /** What they say as the walk starts. */
  lines: string[];
  /** The world's lines (#75 item 14g review): they stopped for a critter; the hero reached the goal without them; they went back to wait. */
  waitLine: string;
  behindLine: string;
  backLine: string;
  /** What they say if talked to away from the walk (15d review: Juno in town). Default: the step's hint. */
  remindLine?: string;
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
  /**
   * The line under one of its key-item chests' finds while the quest is on
   * (#75 item 14f: Fen will remember the next acorn) — before the quest is
   * offered, the chest's `wantedBy` says who wants it instead.
   */
  foundNote?: (save: SaveData) => string;
  /** Where it's played once accepted, when not where it was offered (Posy's walk: the Marsh) — the menu's tag. */
  playedIn?: ZoneId;
  /** The menu's line once every step is done, in place of "go back to <giver>" (the giver waits somewhere else). */
  doneLine?: string;
  /** The offer when you already carry one of `items` (found the thing before meeting them). */
  offerHaving?: { items: string[]; lines: string[] };
  /**
   * A song quest's wrong notes (#75 item 15f review): struck out of turn before
   * anything rings (`early`), and after something has rung, so the song starts
   * again (`again`). Each is followed by the first song step's hint. Every
   * quest with song steps needs one (quests.test checks).
   */
  wrongNote?: { early: string; again: string };
  /** Only offered once this story flag is set (Act II's quests wait for `act2-seen`, #75 item 14). */
  requires?: string;
  steps: QuestStep[];
  complete: string[];
  reward: { coins: number; potion?: number; hint?: number; items?: Partial<Record<ConsumableId, number>> };
  /**
   * Kept for good as the quest completes (#75 item 15h): quest items handed
   * over (the Blank Chart) and story flags set (`blank-chart-held`).
   */
  grants?: { items?: string[]; flags?: string[]; badge?: string };
  /**
   * The completion ends on a choice (#75 item 16b: the Unnamed Dog's name):
   * the last line asks, a button per option, and the one picked sets its flag.
   */
  choice?: QuestChoice[];
}

/** One option of a quest's closing choice (#75 item 16b): its button, its flag, and what's said after. */
export interface QuestChoice {
  label: string;
  flag: string;
  line: string;
}

/** Badges a quest gives (#75 item 16b) — shown on the menu's shelf. */
export const QUEST_BADGES: Record<string, { name: string; emoji: string }> = {
  'dog-badge': { name: 'Dog Badge', emoji: '🐕' },
};

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
  /** `listLeft: false` when the intro already says what's left (Fen's acorns, #75 item 14f). */
  { listLeft = true }: { listLeft?: boolean } = {},
): QuestStep {
  const carrying = (save: SaveData, t: { items: string[] }) =>
    t.items.some((i) => save.questItems.includes(i) || save.flags[handedOverFlag(i)] === true);
  return {
    id,
    needs: targets.flatMap((t) => t.items),
    hint: (save) => {
      const lead = typeof intro === 'function' ? intro(save) : intro;
      const left = targets.filter((t) => !carrying(save, t));
      return left.length === 0 || targets.length === 1 || !listLeft ? lead : `${lead} Still to find: ${left.map((t) => t.label).join(', ')}.`;
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

/**
 * Walk someone through a place (#75 item 14g): done once they reach the goal
 * (`stepFlag`, set by the world as they arrive).
 */
function escortStep(id: string, escort: EscortDef, hint: string | ((save: SaveData) => string)): QuestStep {
  return { id, hint, escort, isComplete: (save) => save.flags[stepFlag(id)] === true };
}

/**
 * Strike a thing in a song (#75 item 15f): like a talk step, but struck out of
 * turn it's a wrong note, and the song starts again from its first step.
 */
function songStep(id: string, npcId: string, lines: string[], hint: string, remind?: string): QuestStep {
  return { id, hint, remind, npc: { id: npcId, lines }, song: true, isComplete: (save) => save.flags[stepFlag(id)] === true };
}

/**
 * Answer a riddle at a thing (#75 item 15e): talk to it while this step is
 * active and it asks a question (`PathQuestionOverlay`, kind `riddle`); a
 * right answer sets the step flag and shows `solved`, which says where the
 * next riddle is — each hint comes from the last answer.
 */
function riddleStep(
  id: string,
  npcId: string,
  lines: string[],
  hint: string,
  solved: string,
  { early = false, remind, topic, words }: { early?: boolean; remind?: string; topic?: Topic; words?: RiddleWords } = {},
): QuestStep {
  return { id, hint, remind, npc: { id: npcId, lines }, riddle: { solved, topic, words }, early, isComplete: (save) => save.flags[stepFlag(id)] === true };
}

/** What a riddle's question screen says (#75 item 16b): the title, then right and wrong. */
export interface RiddleWords {
  title: string;
  /** What the dialog is called for screen readers, and the button that opens it (16b review round 2). */
  label: string;
  button: string;
  right: string;
  wrong: string;
}

/** A tale-stone's words (#75 item 15e) — every riddle's, unless its step says otherwise. */
export const TALE_STONE_WORDS: RiddleWords = {
  title: '📜 The tale-stone asks a word question!',
  label: 'Tale-stone riddle',
  button: '📜 Hear the question',
  right: 'The stone glows!',
  wrong: 'The stone stays dim. Want another question?',
};

/** A chalk slate's words (#75 item 16b review round 1). */
const SLATE_WORDS: RiddleWords = {
  title: '📝 The slate asks a question!',
  label: 'Slate question',
  button: '📝 Hear the question',
  right: 'The chalk turns gold!',
  wrong: 'The chalk stays white. Want another question?',
};

/** Save flag: this quest item was handed over in a bring step (#75 item 13). */
export function handedOverFlag(item: string): string {
  return `quest-item:${item}:handed-over`;
}


// --- The quests -----------------------------------------------------------------

/** Where Posy's walk is — its escort, the menu's tag and its "you're here" hint share it. */
const POSY_ZONE: ZoneId = 'foglight-marsh';
/** Where Juno's walk is (#75 item 15d). */
const JUNO_ZONE: ZoneId = 'driftwood-shallows';

/** Salt's three pieces of sea-glass (#75 item 15d) — two on the beach, one out on Gale Atoll. */
const SALT_GLASS = [
  { item: 'seaglass-green', label: 'the green one 💚', where: 'a 🎁 in the top-left corner of Driftwood Shallows' },
  { item: 'seaglass-blue', label: 'the blue one 💙', where: 'a 🎁 on the sand near the right side of Driftwood Shallows, below the walled cove' },
  { item: 'seaglass-gold', label: 'the gold one 💛', where: 'a 🎁 on the west side of Gale Atoll, out at sea south-west of Port Lantern — only Ember can fly you there' },
];

/**
 * What Lamplighter Ness tells a first visitor besides her lens (#75 item 14i):
 * the sea critters (14d), the Great Fogbank, Foglight Marsh (14g's rumor).
 */
const NESS_RUMORS = [
  "Sea critters splash about out there now. They only bother boats, and you can always steer round them. On the sand you're as safe as a shell!",
  "East, past everything, is the Great Fogbank. Mind how you go out there — even the gulls are careful!",
  'Up on the north coast is Foglight Marsh. Lightkeeper Brume keeps lanterns there. Tell her Ness says hello!',
];

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

  // --- Act II: Eldergrove (#75 item 14f) ---------------------------------------

  // A collection quest: three key-item chests across Eldergrove, the hint
  // chaining from one acorn to the next.
  {
    id: 'fen-acorns',
    zoneId: 'eldergrove',
    giverNpcId: 'elder-fen',
    side: true,
    title: "Fen's Forgotten Acorns",
    offer: [
      "Oh! A visitor! I'm Fen. I gather nuts. I remember where I hid my acorns. All 4,000. Roughly.",
      "Well… my three BEST ones, anyway — Speckled, Striped and Golden. I hid them in chests so the squirrels couldn't find them.",
      "Then I forgot which chests! Could you find them? I remember where the first one is — and finding it might help me remember the next!",
    ],
    steps: [
      haveStep(
        'fen-acorns-find',
        FEN_ACORNS.map((a) => ({ items: [a.item], label: a.label })),
        (save) => {
          // The step is done once all three are carried, so one is always missing here.
          const left = FEN_ACORNS.filter((a) => !save.questItems.includes(a.item));
          const next = left[0];
          // Each one found helps her remember the next — the first she knows already.
          const remembered = FEN_ACORNS.indexOf(next) > 0 ? 'Ooh, now I remember! ' : '';
          const togo = left.length === 1 ? "It's the last one!" : `${left.length === 3 ? 'Three' : 'Two'} to go!`;
          return `${remembered}${next.where} ${togo}`;
        },
        { listLeft: false },
      ),
    ],
    // Under each acorn's chest while her quest is on: she'll remember the next.
    foundNote: (save) =>
      FEN_ACORNS.every((a) => save.questItems.includes(a.item))
        ? "🧺 That's all three! Take them back to Fen."
        : '🧺 Fen might remember where the next one is now — ask her!',
    takesItems: FEN_ACORNS.map((a) => a.item),
    complete: [
      'Speckled, Striped AND Golden! My three best acorns, home at last!',
      "I'd forget my own tail if it weren't attached. It is. I checked.",
      '✨ Reward: 35 coins and a Hint Feather!',
    ],
    reward: { coins: 35, items: { hint: 1 } },
  },

  // --- Foglight Marsh (#75 item 14g) -----------------------------------------

  // Multi-step: find the Ledger, light its three lanterns in order, report back.
  {
    id: 'marsh-lanterns',
    zoneId: 'foglight-marsh',
    giverNpcId: 'marsh-brume',
    side: true,
    title: 'The Lantern Ledger',
    offer: [
      "Oh! A visitor. Lightkeeper Brume. I keep the Marsh's lanterns — or I did, until I lost my Lantern Ledger.",
      "It's the little book that says which lantern to light, and when. It's stuck in a riddle-chest in the reeds, at the top of the east boardwalk.",
      'Find my Ledger, light the three lanterns it lists, then come and tell me. The Marsh has been dark far too long!',
    ],
    // Found first (#75 item 14g UX review): no sending you after a second one.
    offerHaving: {
      items: ['lantern-ledger'],
      lines: [
        "Oh! A visitor. Lightkeeper Brume — and is that my Lantern Ledger?! You found it already!",
        'It says which lantern to light, and when. Light all three, then come and tell me.',
        'First, the EAST lantern — just down the east boardwalk from the chest, next to the big pond!',
      ],
    },
    // What the Ledger says when you find it — where to go first (#75 item 14g UX review).
    foundNote: () => "📒 Inside is Brume's Lantern Ledger! It says: first, the EAST lantern — just down the east boardwalk, next to the big pond!",
    // East → north → west: from the Ledger's chest (top right) back toward Brume's
    // lamp-house, so the walk never crosses the Marsh and back (#75 item 14g, the owner's call).
    steps: [
      haveStep(
        'ledger-find',
        [{ items: ['lantern-ledger'], label: 'the Lantern Ledger' }],
        "Brume's Lantern Ledger is in a riddle-chest 🎁 in the reeds, at the top of the east boardwalk.",
      ),
      {
        early: true,
        ...talkStep(
        'lantern-east',
        'marsh-lantern-east',
        ['You open the Ledger. "First: the EAST lantern."', 'You strike a match… *fwoomp!* The east lantern glows warm and gold. ✨'],
        'The Ledger says: light the EAST lantern first. It\'s down the east boardwalk from the chest, next to the big pond.',
        ),
      },
      {
        early: true,
        ...talkStep(
        'lantern-north',
        'marsh-lantern-north',
        ['The Ledger says: "Second: the NORTH lantern."', '*Fwoomp!* The north lantern glows. Its light dances on the reed pools. ✨'],
        'Next, the NORTH lantern — on a post beside the middle boardwalk, near its top. The glowing thing nearby is a Bog Lantern, a critter!',
        ),
      },
      {
        early: true,
        ...talkStep(
        'lantern-west',
        'marsh-lantern-west',
        ['The Ledger says: "Last of all: the WEST lantern."', '*Fwoomp!* The west lantern glows. That\'s all three! Brume\'s lamp-house is right there — go and tell her.'],
        'Last, the WEST lantern — beside the boardwalk, just up and to the right of Brume\'s lamp-house.',
        ),
      },
    ],
    takesItems: ['lantern-ledger'],
    complete: [
      'All three lanterns lit! Look at the water — every lantern shines twice, once up and once down.',
      'The Marsh remembers how to glow. And I remember where my Ledger lives: right here, in my pocket.',
      '✨ Reward: 35 coins and a Hint Feather!',
    ],
    reward: { coins: 35, hint: 1 },
  },

  // Escort: walk Posy through Foglight Marsh to the Nameless Stone.
  {
    id: POSY_QUEST,
    zoneId: 'remembrance-hill',
    giverNpcId: 'hill-posy',
    side: true,
    title: 'The Flower for No Name',
    // Asked on the Hill, but walked — and thanked — in the Marsh (#75 item 14g UX review).
    playedIn: POSY_ZONE,
    doneLine: 'Posy is waiting by the Nameless Stone in Foglight Marsh — talk to her there!',
    // She needs Marlow's boat to get there — and so do you.
    requires: questDoneFlag({ id: BOAT_QUEST_ID }),
    offer: [
      "Hi! I'm Posy. I bring flowers to the names nobody remembers.",
      'There\'s a stone in Foglight Marsh with NO name on it at all. It needs a flower most of all!',
      'Ferryman Slosh will take me over on his raft. Will you meet me at the Marsh\'s landing and walk me to the stone? The critters scare me a little.',
    ],
    steps: [
      escortStep(
        POSY_WALK,
        {
          npcId: 'hill-posy',
          zoneId: POSY_ZONE,
          // The end of the north-west boardwalk, beside the Nameless Stone.
          goal: { x: 6, y: 4 },
          lines: [
            "You came! The stone is at the far end of the boardwalk, way up at the top-left of the Marsh.",
            "I'll follow right behind you. If a critter gets close, I'll wait until it moves away!",
          ],
          waitLine: 'Posy stops — a critter is too close! Wait for it to move away, or bump into it to battle.',
          behindLine: "Posy isn't here yet! Go back and find her — look for her ❗.",
          backLine: '🌼 Posy ran back to the landing. Talk to her there to walk again!',
        },
        (save) =>
          save.flags[escortWalkingFlag(POSY_WALK)]
            ? 'Walk Posy to the Nameless Stone, at the top-left of the Marsh. Stay close — she stops if a critter is near!'
            : save.zoneId === POSY_ZONE
              ? 'Posy is waiting at the landing — talk to her to walk her to the Nameless Stone!'
              : save.flags[POSY_SAILED]
                ? "Sail to Foglight Marsh, on the Silver Shallows' north coast. Posy waits at the landing — walk her to the Nameless Stone!"
                : "Sail to Foglight Marsh, on the Silver Shallows' north coast. Posy will meet you at its landing — then walk her to the Nameless Stone!",
      ),
    ],
    complete: [
      'The stone has a flower now. I think it likes it!',
      'Thank you for walking with me. You were very brave. I was… medium brave.',
      '✨ Reward: 35 coins and a Berry Potion!',
    ],
    reward: { coins: 35, potion: 1 },
  },

  // --- Taleshore I (#75 item 15d) ----------------------------------------------

  // Escort: walk Skipper Juno along Driftwood Shallows to her beached ferry.
  {
    id: JUNO_QUEST,
    zoneId: 'port-lantern',
    giverNpcId: 'port-skipper',
    side: true,
    title: 'Ferry the Fretful',
    playedIn: JUNO_ZONE,
    doneLine: 'Skipper Juno is waiting by her ferry on Driftwood Shallows — talk to her there!',
    offer: [
      "Ahoy! I'm Skipper Juno. My ferry, the Puffin, is beached at the old dock on Driftwood Shallows. I'm too scared to go alone.",
      'Those critters on the beach give me the wobbles. Will you walk with me? The road south from town goes right there.',
      "I'll meet you where the road comes in to Driftwood Shallows!",
    ],
    steps: [
      escortStep(
        JUNO_WALK,
        {
          npcId: 'port-skipper',
          zoneId: JUNO_ZONE,
          // On the sand by the old dock in the south-west, beside the Puffin.
          goal: { x: 3, y: 18 },
          lines: [
            "You came! The Puffin is by the old dock, in the bottom-left corner of the beach.",
            "I'll follow right behind you. If a critter gets close, I'll wait until it moves away!",
          ],
          waitLine: 'Juno stops — a critter is too close! Wait for it to move away, or bump into it to battle.',
          behindLine: "Juno isn't here yet! Go back and find her — look for her ❗.",
          backLine: '🧭 Juno went back to where the road comes in. Talk to her there to walk again!',
          remindLine: "See you on the beach! Take the road south from town to Driftwood Shallows. I'll wait where it comes in.",
        },
        (save) =>
          save.flags[escortWalkingFlag(JUNO_WALK)]
            ? 'Walk Juno to the Puffin, by the old dock in the bottom-left corner of Driftwood Shallows. Stay close — she stops if a critter is near!'
            : save.zoneId === JUNO_ZONE
              ? 'Juno is waiting where the road comes in — talk to her to walk her to her ferry!'
              : 'Take the road south from Port Lantern to Driftwood Shallows. Juno waits where the road comes in!',
      ),
    ],
    complete: [
      "There she is — the Puffin! Hello, old girl. I missed you!",
      "You know what? I'm not scared any more. I'll scrub her till she shines!",
      '✨ Reward: 40 coins and a Berry Potion!',
    ],
    reward: { coins: 40, potion: 1 },
  },

  // Collection across two places: Salt's three pieces of sea-glass.
  {
    id: 'salt-seaglass',
    zoneId: 'driftwood-shallows',
    giverNpcId: 'drift-salt',
    side: true,
    title: "Salt's Sea-Glass Set",
    offer: [
      "I'm Salt the Younger! I collect sea-glass: bits of old bottle the waves have polished smooth.",
      "I hid my three best pieces in chests so the gulls wouldn't take them: green, blue and gold. Then I forgot which chests!",
      'One is even out on Gale Atoll. Juno\'s ferry took me there, before the storm. Could you find all three?',
    ],
    steps: [
      haveStep(
        'salt-seaglass-find',
        SALT_GLASS.map((g) => ({ items: [g.item], label: g.label })),
        (save) => {
          const left = SALT_GLASS.filter((g) => !save.questItems.includes(g.item));
          return `The next one is in ${left[0].where}.`;
        },
        // The hint names the next one already (review): no list after it.
        { listLeft: false },
      ),
    ],
    foundNote: (save) =>
      SALT_GLASS.every((g) => save.questItems.includes(g.item))
        ? "🧂 That's all three! Take them back to Salt on Driftwood Shallows."
        : '🧂 Salt the Younger will be so pleased! Your quest list says where the next one is.',
    takesItems: SALT_GLASS.map((g) => g.item),
    complete: [
      'Green, blue AND gold! My whole set!',
      "Hold one up to the sun… see? It's like looking through the sea.",
      '✨ Reward: 40 coins and a Hint Feather!',
    ],
    reward: { coins: 40, hint: 1 },
  },

  // Cross-place defeat: one critter from each of Taleshore I's three places.
  {
    id: 'drift-map',
    zoneId: 'wayfinder-isles',
    giverNpcId: 'way-drift',
    side: true,
    title: 'The Unfinished Map',
    offer: [
      "I'm Wim. I'm making a map of where every critter lives. It's nearly done — but three spots are blank!",
      'A Compass Crab on Driftwood Shallows, a Latitude Cat here on the isles, and a Kite Ray out on Gale Atoll.',
      'Battle one of each, and tell me what they were like. Then my map is finished!',
    ],
    steps: [
      defeatStep(
        'drift-map-critters',
        [
          { defId: 'compass-crab', label: 'a Compass Crab 🦀 (Driftwood Shallows)' },
          { defId: 'latitude-cat', label: 'a Latitude Cat 🐈 (the Wayfinder Isles)' },
          { defId: 'kite-ray', label: 'a Kite Ray 🎏 (Gale Atoll)' },
        ],
        'My map still has blank spots.',
      ),
    ],
    complete: [
      'A crab that walks to the north, a cat that naps on the lines, a ray that flies like a kite… all on my map!',
      'The best map of the Starfall Sea. Well — Lo says the second best.',
      '✨ Reward: 45 coins and a Berry Potion!',
    ],
    reward: { coins: 45, potion: 1 },
  },

  // --- Taleshore II (#75 item 15e) ------------------------------------------------

  // A puzzle chain: three tale-stones on the Story Reef, in order. Each asks a
  // word riddle; each right answer gives back a chapter and says where the
  // next stone is.
  {
    id: YARN_QUEST,
    zoneId: 'story-reef',
    giverNpcId: 'reef-yarn',
    side: true,
    title: "Yarn's Tallest Tale",
    offer: [
      "Ahoy! I'm Yarn, the Tale-Fisher. I don't catch fish. I catch STORIES!",
      'Last night a big wave broke my tallest tale into three chapters. They washed up on three tale-stones round the reef.',
      "Each stone asks a word question before it gives a chapter back. Start with the stone by the little tide pool, just west of here!",
    ],
    steps: [
      riddleStep(
        YARN_STONES[0],
        'reef-stone-1',
        ['🪨 A tale-stone. Faint words swirl over it like little fish.', 'A whisper comes out of the stone: "Answer my word question, and I\'ll give back my chapter!"'],
        'The first chapter is on the tale-stone by the little tide pool west of Yarn, near the top of the reef. Talk to it!',
        '📜 Chapter 1: "Once, a fish as big as an island swallowed the moon…" The words float EAST, over the road, to the tide pool near the top. The next stone is there!',
        { remind: 'Start with the tale-stone by the little tide pool, just west of me!' },
      ),
      riddleStep(
        YARN_STONES[1],
        'reef-stone-2',
        ['🪨 Another tale-stone. Its words shiver when you come close.', 'A whisper: "Answer my word question, and you\'ll hear what happened next!"'],
        'The second chapter is on the tale-stone by the tide pool east of the road, near the top of the reef. Talk to it!',
        '📜 Chapter 2: "…and then the fish hiccupped stars for a whole week!" The words float SOUTH-WEST, to the sandbar in the sea. The last stone is there!',
        { early: true },
      ),
      riddleStep(
        YARN_STONES[2],
        'reef-stone-3',
        ['🪨 The last tale-stone, out on the sandbar. Waves splash its words.', 'A whisper: "Answer my word question, and the tale is whole again!"'],
        'The last chapter is on the tale-stone out on the sandbar, in the south-west corner of the reef. Talk to it!',
        '📜 Chapter 3: "…and that is why the sea sparkles at night." The whole tale is back! Go and tell Yarn.',
        { early: true },
      ),
    ],
    complete: [
      'You found all three chapters! A fish as big as an island, the moon, and a week of hiccupped stars…',
      'That might be my TALLEST tale. Or my second tallest. I have a lot of tales.',
      '✨ Reward: 45 coins and a Hint Feather!',
    ],
    reward: { coins: 45, hint: 1 },
  },

  // --- Taleshore III (#75 item 15f) -----------------------------------------------

  // A song in order: three songstones, high to low. A wrong note just starts the song again.
  {
    id: RESO_QUEST,
    zoneId: 'songstone-cliffs',
    giverNpcId: 'cliff-reso',
    side: true,
    title: 'Ring the Songstones',
    offer: [
      "Ah, a listener! I'm Choir-Mistress Reso.",
      'These cliffs sing a song on three songstones — high, middle, low. But the song is stuck!',
      'Walk up to each stone and press Space to ring it: the HIGH one on the top ledge, then the MIDDLE, then the LOW one down here. A wrong note? We just start again!',
    ],
    wrongNote: {
      early: '🔔 Bwong… not yet!',
      again: '🔔 BWOOONG! Wrong note — start again from the top!',
    },
    steps: [
      songStep(
        RESO_STONES[0],
        'songstone-high',
        ['🔔 DIIING! The high songstone rings! Next: the MIDDLE songstone, on the middle ledge to the east.'],
        'First the HIGH songstone — on the top ledge, in the west. Climb the west steps, then the east steps!',
      ),
      songStep(
        RESO_STONES[1],
        'songstone-middle',
        ['🔔 DOOONG! Two notes ring together! Last: the LOW songstone — go down the west steps. It\'s just west of Reso.'],
        'Next the MIDDLE songstone — on the middle ledge, near the east steps.',
      ),
      songStep(
        RESO_STONES[2],
        'songstone-low',
        ['🔔 BOOOM! The low songstone rings. Three notes ring as one song — the cliffs are singing! Go tell Reso!'],
        'Last the LOW songstone — on the bottom ledge, just west of Reso.',
        'Last the LOW songstone — down here on the bottom ledge, just west of me!',
      ),
    ],
    complete: [
      'Listen! High, middle, low — the cliffs are singing again!',
      'My choir can practise at last. Thank you, little listener.',
      '✨ Reward: 45 coins and a Berry Potion!',
    ],
    reward: { coins: 45, potion: 1 },
  },

  // A letter across the sea: Shush's to Librarian Sage in Lumina Village, and Sage's reply back.
  {
    id: SHUSH_QUEST,
    zoneId: 'quiet-quarter',
    giverNpcId: 'quiet-shush',
    side: true,
    title: 'The Pen-Pal Papers',
    offer: [
      "Shh… hello. I'm Shush, keeper of the Quiet Quarter's books.",
      'I have a pen-pal far away: Librarian Sage, in Lumina Village. We wrote every week — until the fog came.',
      'Would you carry my letter across the sea, on Ember? It\'s far too precious for the post!',
    ],
    givesItem: 'shush-letter',
    takesItems: ['sage-letter'],
    doneLine: "Take Sage's reply back to Librarian Shush! Cast 🏠 Return to Port Lantern, go down the south road, then turn east into the woods.",
    steps: [
      bringStep(
        'shush-deliver',
        'hub-librarian',
        { takes: 'shush-letter', gives: 'sage-letter' },
        [
          '📨 A letter… from Shush? From Taleshore?! I thought the fog had swallowed every letter!',
          'Wait right there… There! I\'ve written back — a LONG reply, years of news. Please take it to Shush!',
        ],
        'Take the letter to Librarian Sage, in the Library at the east end of Lumina Village. Cast 🏠 Return from 📜 Menu, or fly home on Ember!',
      ),
    ],
    complete: [
      '📨 A reply from Sage! Shh, let me read it… Oh. Oh, how lovely.',
      'Sage says Pudding, the Library cat, had kittens. FIVE!',
      '✨ Reward: 50 coins and a Hint Feather!',
    ],
    reward: { coins: 50, hint: 1 },
  },

  // --- Chorus Isle (#75 item 15g) --------------------------------------------------

  // Collection, then talk steps: find the island's three refrains, then sing
  // each one back — to Brio, to Sage Aria, and last to Coda herself.
  {
    id: CODA_QUEST,
    zoneId: 'chorus-isle',
    giverNpcId: 'chorus-coda',
    title: "Coda's Lost Refrains",
    offer: [
      "Hi! I'm Coda — that's the bit at the very END of a song! Our island has three songs: one for sunrise, one for noon and one for bedtime.",
      'When the Hush Fiend came, all three refrains blew away! Mum thinks the wind tucked them into chests.',
      "Can you find them? One's by the top-left beach, one's by the top-right beach, and one's by the bottom-left shore. Then we'll sing them back!",
    ],
    steps: [
      haveStep(
        'coda-refrains-find',
        [
          { items: ['refrain-sunrise'], label: 'the Sunrise Refrain (a 🎁 by the top-left beach)' },
          { items: ['refrain-noon'], label: 'the Noon Refrain (a 🎁 by the top-right beach)' },
          { items: ['refrain-bedtime'], label: 'the Bedtime Refrain (a 🎁 by the bottom-left shore)' },
        ],
        'The refrains are in chests round the island.',
      ),
      talkStep(
        'coda-sing-brio',
        'chorus-brio',
        [
          '🌅 You sing the Sunrise Refrain… Maestro Brio plays along on his violin! "That\'s the one! We woke the whole island with it!"',
          'Next, sing the Noon Refrain to Sage Aria, in the Music Hall across the road.',
        ],
        'You found all three! Sing the Sunrise Refrain to Maestro Brio, at the Resting Note Inn.',
      ),
      talkStep(
        'coda-sing-aria',
        'sage-aria',
        [
          '☀️ You sing the Noon Refrain… Aria hums the harmony. ♪ Oh, how I MISSED that one! ♪',
          '♪ The last one is the bedtime song… Sing it to Coda, by her cottage! ♪',
        ],
        "Sing the Noon Refrain to Sage Aria, in Aria's Music Hall.",
      ),
    ],
    takesItems: ['refrain-sunrise', 'refrain-noon', 'refrain-bedtime'],
    doneLine: 'Last of all, sing the Bedtime Refrain to Coda, by her cottage!',
    complete: [
      '🌙 You sing the Bedtime Refrain… Coda sings it with you, very softly. Then she yawns. Then she giggles.',
      'All three songs, home again! The hush can\'t take a song you remember. Nobody can hush them away now!',
      '✨ Reward: 45 coins and a Berry Potion!',
    ],
    reward: { coins: 45, potion: 1 },
  },

  // --- Chartmaker's Rest (#75 item 15h) ----------------------------------------

  // Act III's last story quest: find the Chartmaker's quill (Pen hid it in her
  // nest), have Inka fill it with starlight ink, and bring it back — he charts
  // all of Lumina, and one place stays blank. He gives you the Blank Chart,
  // Act IV's key item (`blank-chart-held`).
  {
    id: BLANK_CHART_QUEST,
    zoneId: 'chartmakers-rest',
    giverNpcId: 'chart-chartmaker',
    title: 'The Blank Chart',
    requires: crystalFlag('words'),
    offer: [
      "Ah, a visitor! I'm the Chartmaker. I've drawn a chart of every place in Lumina — every town, every island, every hill.",
      "Every place but ONE. There's a place I can never name. Each time I try, my ink fades away, as if the world forgot it.",
      'Now the Crystal of Voices sings, I think I can chart it at last! But my seabird Pen flew off with my Compass Quill.',
      'Pen hides shiny things in her nest — the chest just right of my study.',
    ],
    offerHaving: {
      items: ['compass-quill', 'starlit-quill'],
      lines: [
        "A visitor — with my Compass Quill! Pen hid it in her nest, didn't she? I'm the Chartmaker.",
        "I've charted every place in Lumina but ONE. My ink fades every time I try. With Voices singing, maybe now I can!",
        "Oh — the quill's dry as a bone. Take it to Inka, on the left (west) side of the island. She mixes my inks.",
      ],
    },
    steps: [
      {
        ...haveStep(
          'chart-quill-find',
          [{ items: ['compass-quill', 'starlit-quill'], label: 'the Compass Quill' }],
          "Pen hid the Compass Quill in her nest — the chest just right of the Chartmaker's study.",
        ),
        // In his own voice when you talk to him (15h review round 1).
        remind: "Pen's nest is the chest just right of my study. Find my quill — it'll need Inka's ink!",
      },
      {
        ...bringStep(
        'chart-quill-ink',
        'chart-inka',
        { takes: 'compass-quill', gives: 'starlit-quill' },
        [
          '🖌️ Inka dips the Compass Quill in a pot of ink that twinkles like the night sky.',
          '"Starlight ink! It remembers almost everything it touches. Take it back to the Chartmaker!"',
        ],
        "The quill is dry! Bring it to Inka, on the left (west) side of the island. She mixes the Chartmaker's inks.",
        ),
        remind: "My quill! Oh — it's dry as a bone. Take it to Inka, on the left (west) side of the island. She mixes my inks.",
      },
    ],
    // Opened once he's asked: the quill is dry, so on to Inka (15h review round 3).
    foundNote: () => "✒️ The Chartmaker's Compass Quill — bone dry! Inka, on the left (west) side of the island, mixes his inks.",
    takesItems: ['starlit-quill'],
    doneLine: 'Take the Starlit Quill back to the Chartmaker, in his study!',
    complete: [
      '✨ The Chartmaker dips the Starlit Quill and draws. Dawnreach… the Silver Shallows… Taleshore… every place you\'ve been, all at once!',
      'Hmm… one spot won\'t take the ink. Not even starlight ink.',
      '"Take it! I\'ll call it the Blank Chart, for its one blank spot. A blank like that isn\'t NOTHING — it\'s something the whole world forgot."',
      '🗺️ You got the Blank Chart! ✨ Reward: 60 coins and a Honey Elixir!',
    ],
    reward: { coins: 60, items: { elixir: 1 } },
    grants: { items: ['blank-chart'], flags: [BLANK_CHART_HELD] },
  },

  // Act IV's spine (#75 item 16a, STORY-4X §6): Wisp asks you to gather five
  // memories of the very first Sage, across the world. The fifth — Young Wick,
  // in Lumina-That-Was (16b) — says her name, and the quest sets `name-learned`.
  {
    id: SAY_HER_NAME_QUEST,
    zoneId: 'whispering-woods',
    giverNpcId: 'woods-sprite',
    title: 'Say Her Name',
    requires: ACT4_SEEN,
    offer: [
      'Spark! Since the door under the Spire opened, I keep hearing that word again. A NAME. It\'s so close!',
      'Will you help me remember? Ask the oldest folk in Lumina about the very first Sage.',
      'Start with Grandmother Wick, in Lumina Village. She has known me the longest.',
    ],
    steps: [
      {
        ...talkStep(
          'name-wick',
          'village-elder',
          [
            '*Wick sets down her rolling pin.* The very first Sage? I was small then. She let me ask \'why?\' five times in a row and never once sighed.',
            'She wore a daisy behind her ear, every single day. I can see that daisy, child. I just can\'t see her name.',
            '✨ A piece of her! Next: Keeper Mnem, in the Hall of Names on Remembrance Hill.',
          ],
          'Ask Grandmother Wick, in Lumina Village, about the very first Sage.',
        ),
        remind: 'Ask Grandmother Wick first, in Lumina Village. She has known me the longest!',
      },
      {
        // Asked out of turn, they say "not yet" and who's first (16a UX review round 3) —
        // Mnem only once the Hall is dedicated: his call to it comes first (round 4).
        early: true,
        earlyAfter: 'hall-dedicated',
        earlyLine: 'Not yet, little one. Wisp wants Grandmother Wick asked first — she is in Lumina Village. Then come and see me!',
        ...talkStep(
          'name-mnem',
          'hill-keeper',
          [
            'The first plaque in this Hall was blank when I came. I polish it anyway. Polishing is a kind of remembering.',
            'Once, under the dust, my thumb found letters. Five of them, I think. The first was pointy, like a little tent — an A.',
            '✨ Another piece! Next: the Chartmaker, on his island at the top of Taleshore.',
          ],
          'Ask Keeper Mnem, in the Hall of Names on Remembrance Hill, about the first plaque.',
        ),
        remind: 'Keeper Mnem minds the Hall of Names on Remembrance Hill. Ask about the very first plaque!',
      },
      {
        early: true,
        earlyLine: 'Not yet! Wisp has an order for these things, and I am third. Ask Grandmother Wick and Keeper Mnem first — then come back to me.',
        ...talkStep(
          'name-chartmaker',
          'chart-chartmaker',
          [
            'My oldest map has a little schoolhouse drawn where the Crystal Spire stands now. Someone wrote the teacher\'s name beside it…',
            '…and someone rubbed it out. Only the end is left: \'…ter\'. Like \'water\', or \'later\'.',
            '✨ Another piece! Next: Sage Chronicle, in the Sunken Archive.',
          ],
          'Ask the Chartmaker, on his island at the top of Taleshore, about his oldest map.',
        ),
        remind: 'The Chartmaker has the oldest maps in Lumina. Ask him, on his island at the top of Taleshore!',
      },
      {
        ...talkStep(
          'name-chronicle',
          'sage-chronicle',
          [
            'Every history book here has a footnote that goes nowhere: \'see the First Sage\'. No page says who she was.',
            'But I know WHY she was forgotten. The questions got too hard, so people stopped asking her. Then they stopped saying her name.',
            '✨ Four pieces! Next: Young Wick — Grandmother Wick as a little girl! — in Lumina-That-Was, below the Dream Root Door.',
          ],
          'Ask Sage Chronicle, in the Sunken Archive, about the very first Sage.',
        ),
        remind: 'Sage Chronicle knows every old book in the Sunken Archive. Ask about the very first Sage!',
      },
      {
        ...talkStep(
          'name-young-wick',
          'memory-young-wick',
          [
            'Teacher? Oh, you mean ASTER! Everybody knows Aster. She says there\'s no such thing as a silly question.',
            'A-S-T-E-R, like the daisy flower! Why are you smiling like that? It\'s just her name.',
            '✨ The last piece! Run back to Wisp, in the Whispering Woods, and say it!',
          ],
          'Ask Young Wick about her teacher — in the old village of Lumina-That-Was, below the Dream Root Door.',
        ),
        remind: 'Somebody who still REMEMBERS her… Young Wick, down in Lumina-That-Was, past the Dream Root Door!',
      },
    ],
    doneLine: 'Go back to Wisp, in the Whispering Woods, and say her name!',
    complete: [
      'A daisy… five letters, the first one pointy like an A… \'…ter\'… people stopped asking… and Young Wick said it right out loud.',
      'It\'s right on the tip of my tongue… say it with me! ✨ Reward: 60 coins and a Hint Feather!',
    ],
    reward: { coins: 60, hint: 1 },
    grants: { flags: [NAME_LEARNED] },
  },

  // --- Lumina-That-Was (#75 item 16b) ---------------------------------------------
  // The Lesson Bell rang too early and the class ran out before the last three
  // questions were answered; answer the slates in order (the riddle chain) and
  // the bell can say sorry.
  {
    id: BELL_QUEST,
    zoneId: 'first-classroom',
    giverNpcId: 'class-prim',
    side: true,
    title: "The Bell's Apology",
    requires: ACT4_SEEN,
    offer: [
      "*Monitor Prim taps a ruler.* The Lesson Bell rang far too early today, and the whole class ran out to play!",
      'Three slates still hold the last three questions. Answer them in order, left to right, and the lesson can end properly.',
    ],
    steps: [
      riddleStep(
        BELL_SLATES[0],
        'class-slate-1',
        ['📝 The first slate. A question is chalked on it, waiting.', 'Answer it, and the chalk turns gold!'],
        'Answer Slate 1 — the one on the left.',
        '✨ The chalk turns gold! Now Slate 2, in the middle.',
        { remind: 'Start with Slate 1, on the left. Left to right!', topic: 'math', words: SLATE_WORDS },
      ),
      riddleStep(
        BELL_SLATES[1],
        'class-slate-2',
        ['📝 The second slate. Its chalk wiggles as you come close.', 'Answer it, and the chalk turns gold!'],
        'Answer Slate 2, the middle one.',
        '✨ Gold again! One more — Slate 3, on the right.',
        { early: true, topic: 'science', words: SLATE_WORDS },
      ),
      riddleStep(
        BELL_SLATES[2],
        'class-slate-3',
        ['📝 The last slate. Its question is the hardest-looking of all.', 'Answer it, and the lesson is finished!'],
        'Answer Slate 3, the one on the right.',
        '✨ All three slates shine gold! Go and tell Monitor Prim.',
        { early: true, topic: 'words', words: SLATE_WORDS },
      ),
    ],
    complete: [
      '*Bwong…* The Lesson Bell rings very softly. "Sorry I rang so early. I was just SO excited about lunch."',
      'Monitor Prim smiles — just a little. "Apology accepted. Lesson ended. Well done."',
      '✨ Reward: 50 coins and two Hint Feathers!',
    ],
    reward: { coins: 50, hint: 2 },
  },

  // Every child in old Lumina called the dog a different name (STORY-4X §6):
  // ask three of them, then pick the one that sticks.
  {
    id: DOG_QUEST,
    zoneId: 'memory-village',
    giverNpcId: 'memory-dog',
    side: true,
    title: 'One More Name',
    requires: ACT4_SEEN,
    offer: [
      'Woof! *The dog sits on your foot and wags.*',
      "(There's no name on its collar. Ask Young Wick, Young Lumen and Monitor Prim what they call him — in that order!)",
    ],
    steps: [
      talkStep(
        'dog-wick',
        'memory-young-wick',
        ["That dog? That's PICKLES! Because he steals pickles. Every. Single. Day."],
        'Ask Young Wick, in the old village, what the dog is called.',
      ),
      {
        early: true,
        earlyLine: "The dog? Ask Young Wick first — she's known him longest! She's by the bakery in the old village.",
        ...talkStep(
        'dog-lumen',
        'memory-young-lumen',
        ["That's Captain! He guards the whole town. Very serious. Mostly naps."],
        'Ask Young Lumen, in the old library in the field, what the dog is called.',
        ),
      },
      {
        early: true,
        earlyLine: 'The dog? Ask the children first — Young Wick, then Young Lumen. Then come and see me.',
        ...talkStep(
        'dog-prim',
        'class-prim',
        ['That is Sir Wigglesworth. Obviously.'],
        'Ask Monitor Prim, in the First Classroom, what the dog is called.',
        ),
      },
    ],
    doneLine: 'Three names! Go back to the dog, in the old village, and pick one.',
    complete: [
      'Woof? *The dog looks up at you, waiting.*',
      'Pickles, Captain or Sir Wigglesworth — which name will stick?',
    ],
    choice: [
      { label: '🥒 Pickles', flag: 'dog-named-pickles', line: 'Pickles it is! *He wags so hard he falls over.* ✨ Reward: 20 coins and the 🐕 Dog Badge!' },
      { label: '⚓ Captain', flag: 'dog-named-captain', line: 'Captain it is! *He sits up very straight.* ✨ Reward: 20 coins and the 🐕 Dog Badge!' },
      { label: '🎩 Sir Wigglesworth', flag: 'dog-named-wigglesworth', line: 'Sir Wigglesworth it is! *He bows, then wiggles.* ✨ Reward: 20 coins and the 🐕 Dog Badge!' },
    ],
    reward: { coins: 20 },
    grants: { badge: 'dog-badge' },
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

  // An island hermit chain (#75 item 14i, #106a): Ness on Gull Rock wants a
  // new lens; the sea glass is in a key-item chest on Sandpiper Cay, and
  // Shelby, the Cay's hermit crab, grinds it.
  {
    id: 'ness-lens',
    zoneId: 'silver-shallows',
    giverNpcId: 'gull-lamplighter',
    side: true,
    // Her first talk is this offer, so it carries her hello, the sea-critter safety line and her
    // rumors (#75 item 14i review round 2: one trip — Ness, the Cay's chest and Shelby, back to Ness).
    title: "Ness's Lens",
    // Her rumors first, so the lens ask is the last thing said before the button (round 3).
    offer: [
      "A visitor! By BOAT! I'm Ness. I kept this lighthouse lit all through the fog, just in case somebody came.",
      ...NESS_RUMORS,
      "But my lamp's lens cracked in the fog. Now it only shines about as far as my nose.",
      'Shelby, the hermit crab on Sandpiper Cay — the sandbar to the south-east — grinds lenses from sea glass. Sea glass washes up in a chest there.',
      'Find some, ask Shelby to grind it into a lens, and bring the lens to me?',
    ],
    offerHaving: {
      items: ['sea-glass', 'sea-glass-lens'],
      lines: [
        "A visitor! By BOAT! I'm Ness, the lamplighter.",
        ...NESS_RUMORS,
        "And is that sea glass from the Cay? My lamp's lens cracked in the fog — it's just what I need!",
        'Ask Shelby, the hermit crab on Sandpiper Cay, to grind it into a lens, then bring the lens to me?',
      ],
    },
    steps: [
      haveStep(
        'lens-glass',
        [{ items: ['sea-glass', 'sea-glass-lens'], label: 'the sea glass' }],
        () => 'The sea glass is in a chest on Sandpiper Cay, the sandbar south-east of Gull Rock. The Cay has two chests — try both!',
      ),
      bringStep(
        'lens-grind',
        'cay-hermit',
        { takes: 'sea-glass', gives: 'sea-glass-lens' },
        [
          'Sea glass! Smooth as a whisper. A lens? For Ness? Hmm, hmm.',
          "*scritch, scritch, scritch*… There! Polished on my very own shell. Don't tell the shell.",
          '✨ You got the Sea-Glass Lens! Sail it back to Ness on Gull Rock.',
        ],
        'You have the sea glass! Ask Shelby on Sandpiper Cay to grind it into a lens.',
      ),
    ],
    takesItems: ['sea-glass-lens'],
    complete: [
      "Shelby's work! Hold the ladder… *click*.",
      'Look at that beam! Ships will see Gull Rock from three islands away. Mostly they\'ll see me waving.',
      '✨ Reward: 40 coins and a Hint Feather!',
    ],
    reward: { coins: 40, hint: 1 },
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

  // --- The Sunken Archive (#75 item 14h) ---------------------------------------

  // A delivery across the sea: Index's long-lost letter, home to Grandmother Wick
  // in Lumina Village — the Act I friend, written to long ago (STORY-4X's
  // cross-act nostalgia beat). Wick sends a thank-you note back.
  {
    id: 'archive-letter',
    zoneId: 'sunken-archive',
    giverNpcId: 'archive-index',
    title: 'A Letter, Long Overdue',
    offer: [
      "Oh! A reader! I'm Index. I was putting the W's in order, and look — a letter that was never sent!",
      "It's sixty years old. The name it was written to has faded right off — but it's signed: Wick, Lumina Village. Grandmother Wick? She lives there still!",
      "Could you carry it home to her? A letter is meant to be read. That's practically the first rule of the alphabet!",
    ],
    givesItem: 'old-letter',
    steps: [
      bringStep(
        'letter-to-wick',
        'village-elder',
        { takes: 'old-letter', gives: 'wick-note' },
        [
          'A letter… for me? Oh, my spark. This is MY handwriting. I wrote it when I was just your age — to my teacher.',
          "I never sent it. And now I can't even remember her name. Isn't that strange? …Thank you for bringing it home.",
          'Here — a note for whoever found it. Tell them an old lady says thank you.',
        ],
        'Carry the old letter to Grandmother Wick, at her house in Lumina Village — sail west to Dawnreach!',
      ),
    ],
    takesItems: ['wick-note'],
    // Index is a sea away from Wick: the quest log says where (#75 item 14h review).
    doneLine: "Take Wick's thank-you note back to Index in the Sunken Archive — sail out to the Silver Shallows' north-east!",
    complete: [
      'A thank-you note from Wick! I shall file it under T, for Thank you. And under W, for Wonderful!',
      'Sixty years late, and still it found its way home. That is the best kind of letter.',
      '✨ Reward: 40 coins and a Berry Potion!',
    ],
    reward: { coins: 40, potion: 1 },
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
  /** What the closing button should celebrate — or, for a riddle step, open (#75 item 15e). */
  finishKind: 'offer' | 'complete' | 'step' | 'riddle' | null;
  /** A riddle step's id (#75 item 15e): the closing button asks its question. */
  riddle?: string;
  /** A completion that ends on a choice (#75 item 16b): one button per option, then `finish` and its flag. */
  choice?: QuestChoice[];
}

/**
 * The quest conversation an NPC holds right now, or null when normal
 * dialogue applies. In order (#75 item 14c):
 *   1. their quest is ready to **complete** — even if the player finished
 *      the steps before hearing the offer;
 *   2. a **step** goes through them (any quest's, while that step is active;
 *      a bring step only once its item is in hand);
 *   3. they **offer** their quest;
 *   4. another quest's **"not yet"** for a later step of theirs (with their
 *      own reminder after it, if their quest is under way);
 *   5. they **remind** you of its current step.
 */
export function questConversation(npcId: string, save: SaveData): QuestConversation | null {
  const quest = questFor(npcId, save);
  const step = quest ? activeStep(quest, save) : null;
  if (quest && !step) return completeConversation(quest);
  const through = stepConversation(npcId, save);
  if (through) {
    // Another quest's step through them comes next (Young Wick: her memory,
    // then the dog's name) — say so, or it's easy to walk off (16b review round 2).
    const after = through.finish && through.finishKind === 'step' ? through.finish(save) : null;
    const next = after ? stepConversation(npcId, after) : null;
    if (next && next.badge !== through.badge) {
      return { ...through, lines: [...through.lines.slice(0, -1), `${through.lines[through.lines.length - 1]} (Talk again — there's more!)`] };
    }
    return through;
  }
  // Their own quest's offer comes before another quest's "not yet" (16b review round 2:
  // Monitor Prim's dog line hid the Bell's Apology).
  const early = quest && step && !save.flags[questOfferedFlag(quest)] ? null : earlyConversation(npcId, save);
  if (early && quest && step) {
    // …and their own reminder still follows it.
    return { ...early, lines: [...early.lines, step.remind ?? resolveHint(step, save)] };
  }
  if (early) return early;
  if (!quest || !step) return null;
  if (!save.flags[questOfferedFlag(quest)]) {
    return {
      lines: quest.offerHaving?.items.some((i) => save.questItems.includes(i)) ? quest.offerHaving.lines : quest.offer,
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
  return { lines: [step.remind ?? resolveHint(step, save)], badge: quest.title, finishKind: null, finish: null };
}

/** The giver hands out the reward and takes back what the quest lent or needed. */
function completeConversation(quest: QuestDef): QuestConversation {
  return {
    lines: quest.complete,
    badge: quest.title,
    finishKind: 'complete',
    choice: quest.choice,
    finish: (s) => {
      const { coins, potion = 0, hint = 0, items = {} } = quest.reward;
      const nextItems = { ...s.items, potion: s.items.potion + potion, hint: s.items.hint + hint };
      for (const [id, n] of Object.entries(items) as [ConsumableId, number][]) nextItems[id] += n;
      const kept = s.questItems.filter((i) => i !== quest.givesItem && !quest.takesItems?.includes(i));
      const granted = (quest.grants?.items ?? []).filter((i) => !kept.includes(i));
      const grantedFlags = Object.fromEntries((quest.grants?.flags ?? []).map((f) => [f, true]));
      const badge = quest.grants?.badge;
      return {
        ...s,
        badges: badge && !s.badges.includes(badge) ? [...s.badges, badge] : s.badges,
        coins: s.coins + coins,
        items: nextItems,
        questItems: [...kept, ...granted],
        flags: { ...s.flags, ...grantedFlags, [questDoneFlag(quest)]: true, [questOfferedFlag(quest)]: true },
      };
    },
  };
}

/** A step that goes through this NPC (deliveries, multi-step middles), or null. */
function stepConversation(npcId: string, save: SaveData): QuestConversation | null {
  for (const q of QUESTS) {
    if (!save.flags[questOfferedFlag(q)] || save.flags[questDoneFlag(q)]) continue;
    const step = activeStep(q, save);
    // An escort starts when you talk to them — not while they're already walking with you (#75 item 14g).
    if (step?.escort && step.escort.npcId === npcId) {
      const walking = escortWalkingFlag(step.id);
      if (save.flags[walking]) continue;
      // Only where the walk is (15d review: talked to again in town, Juno
      // started a walk that was over before it began) — elsewhere, the hint.
      if (save.zoneId !== step.escort.zoneId) {
        if (!step.escort.remindLine) continue;
        return { lines: [step.escort.remindLine], badge: q.title, finish: null, finishKind: null };
      }
      return {
        lines: step.escort.lines,
        badge: q.title,
        finishKind: 'step',
        finish: (s) => ({ ...s, flags: { ...s.flags, [walking]: true } }),
      };
    }
    // A riddle step asks its question; the answer finishes it (#75 item 15e).
    if (step?.riddle && step.npc?.id === npcId) {
      return { lines: step.npc.lines, badge: q.title, finishKind: 'riddle', finish: null, riddle: step.id };
    }
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

/**
 * A talk step's NPC talked to before its turn (#75 item 14g review: the north
 * lantern before the west one): "not this one yet", and the step that's due —
 * once the steps before have reached the talking part. A song step struck out
 * of turn (#75 item 15f) is a wrong note first: if any song step has rung they
 * all go quiet and the song starts again; if none has, just "not yet". A step
 * already done never counts — its thing is placed as another NPC (rung).
 */
function earlyConversation(npcId: string, save: SaveData): QuestConversation | null {
  for (const q of QUESTS) {
    if (!save.flags[questOfferedFlag(q)] || save.flags[questDoneFlag(q)]) continue;
    const step = activeStep(q, save);
    if (!step) continue;
    const later = q.steps.slice(q.steps.indexOf(step) + 1);
    // A wrong note (#75 item 15f): every song step goes quiet and the song starts again —
    // only while the song itself is due (15f round 2: a step before it gets "not this one yet").
    if (step.song && later.some((st) => st.song && st.npc?.id === npcId)) {
      const song = q.steps.filter((st) => st.song);
      const rung = song.some((st) => st.isComplete(save));
      // Every quest with song steps has its own wrong notes (quests.test checks).
      const note = rung ? q.wrongNote!.again : q.wrongNote!.early;
      const quiet = Object.fromEntries(song.map((st) => [stepFlag(st.id), false]));
      return {
        lines: [`${note} ${resolveHint(song[0], save)}`],
        badge: q.title,
        finishKind: null,
        finish: rung ? (s) => ({ ...s, flags: { ...s.flags, ...quiet } }) : null,
      };
    }
    const mine = later.find((st) => (st.early || st.song) && st.npc?.id === npcId && (!st.earlyAfter || save.flags[st.earlyAfter]));
    if (mine) {
      // A person says it their own way (16a review round 4).
      if (mine.earlyLine) return { lines: [mine.earlyLine], badge: q.title, finishKind: null, finish: null };
      // Another of its kind first ("Not this one yet!"), or something to find first — the Ledger (#75 item 14g UX review).
      return { lines: [`${step.npc ? 'Not this one yet!' : 'Not yet!'} ${resolveHint(step, save)}`], badge: q.title, finishKind: null, finish: null };
    }
  }
  return null;
}

/**
 * Story flags that arriving in a zone sets, given the save's flags: reaching
 * the Marsh after Posy asks means she's come over too (`POSY_SAILED`, #75 item 14g).
 */
export function arrivalFlags(zoneId: ZoneId, flags: Record<string, boolean>): string[] {
  const out: string[] = [];
  if (zoneId === POSY_ZONE && flags[questOfferedFlag({ id: POSY_QUEST })] && !flags[POSY_SAILED]) out.push(POSY_SAILED);
  // Juno walks over from town as you do (#75 item 15d review).
  if (zoneId === JUNO_ZONE && flags[questOfferedFlag({ id: JUNO_QUEST })] && !flags[JUNO_CAME]) out.push(JUNO_CAME);
  return out;
}

/** The world's line for each walk that ended short (`escortBackFlag`, #75 item 14g review). */
export function escortsBackLines(flags: Record<string, boolean>, zoneId?: ZoneId): { flag: string; line: string }[] {
  // Said in the escort's own place (left mid-walk, it waits for your next visit — #75 item 14g UX review).
  return QUESTS.flatMap((q) =>
    q.steps.flatMap((st) =>
      st.escort && flags[escortBackFlag(st.id)] && (!zoneId || st.escort.zoneId === zoneId)
        ? [{ flag: escortBackFlag(st.id), line: st.escort.backLine }]
        : [],
    ),
  );
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

/** The clue a riddle step's right answer shows (#75 item 15e): where the next one is. */
export function riddleSolvedLine(stepId: string): string | null {
  for (const q of QUESTS) for (const st of q.steps) if (st.id === stepId && st.riddle) return st.riddle.solved;
  return null;
}

/** What a riddle step's question screen says (#75 item 16b): its own words, or a tale-stone's. */
export function riddleWords(stepId: string): RiddleWords {
  for (const q of QUESTS) for (const st of q.steps) if (st.id === stepId && st.riddle) return st.riddle.words ?? TALE_STONE_WORDS;
  return TALE_STONE_WORDS;
}

/** A riddle step's own topic, if it has one (#75 item 16b). */
export function riddleTopic(stepId: string): Topic | undefined {
  for (const q of QUESTS) for (const st of q.steps) if (st.id === stepId && st.riddle) return st.riddle.topic;
  return undefined;
}

/**
 * A riddle answered right (#75 item 15e): its step is done — but only while it
 * is still the step due in an offered, unfinished quest (a stale question
 * never finishes a step out of turn).
 */
export function solveRiddle(save: SaveData, stepId: string): SaveData {
  const due = QUESTS.some(
    (q) => save.flags[questOfferedFlag(q)] && !save.flags[questDoneFlag(q)] && activeStep(q, save)?.id === stepId && activeStep(q, save)?.riddle,
  );
  return due ? { ...save, flags: { ...save.flags, [stepFlag(stepId)]: true } } : save;
}

/** What a chest gives, for its "pops open" line: "25 coins! 🪙" or "25 coins and the 🌙 Moonstone!". */
export function chestRewardText(chestId: string): string {
  const info = QUEST_ITEMS[chestKeyItem(chestId) ?? ''];
  return info ? `${CHEST_COINS} coins and the ${info.emoji} ${info.name}!` : `${CHEST_COINS} coins! 🪙`;
}

/**
 * The line shown with a key-item chest's find: before its quest is offered,
 * who wants it (#75 item 13), so a kid who opens the chest first knows where
 * to take it; while the quest is on, its `foundNote`, if any (#75 item 14f:
 * Fen will remember the next acorn). Null otherwise.
 */
export function chestWantedLine(save: SaveData, chestId: string): string | null {
  const chest = keyChestFor(chestId);
  if (!chest) return null;
  const quest = QUESTS.find(
    (q) => q.takesItems?.includes(chest.item) || q.steps.some((st) => st.needs?.includes(chest.item) || st.trade?.takes === chest.item),
  );
  if (!quest || save.flags[questDoneFlag(quest)]) return null;
  if (!save.flags[questOfferedFlag(quest)]) return chest.wantedBy;
  return quest.foundNote?.(save) ?? null;
}

/**
 * The walk under way in this place, if any (#75 item 14g): whose, where to,
 * and the step it finishes. The canvas leads them while it lasts.
 */
export function activeEscort(
  save: SaveData,
  zoneId: ZoneId,
): { stepId: string; npcId: string; goal: { x: number; y: number }; waitLine: string; behindLine: string } | null {
  for (const q of QUESTS) {
    if (!save.flags[questOfferedFlag(q)] || save.flags[questDoneFlag(q)]) continue;
    const step = activeStep(q, save);
    if (step?.escort && step.escort.zoneId === zoneId && save.flags[escortWalkingFlag(step.id)]) {
      const { npcId, goal, waitLine, behindLine } = step.escort;
      return { stepId: step.id, npcId, goal, waitLine, behindLine };
    }
  }
  return null;
}

/** Who is walking with the hero somewhere other than `zoneId` (#75 item 14g) — they go back to wait. */
export function escortsAway(save: SaveData, zoneId: ZoneId): string[] {
  return QUESTS.flatMap((q) => {
    const step = save.flags[questDoneFlag(q)] ? null : activeStep(q, save);
    return step?.escort && step.escort.zoneId !== zoneId && save.flags[escortWalkingFlag(step.id)] ? [step.escort.npcId] : [];
  });
}

/** Quests accepted but not finished — for the menu's quest log. */
export function activeQuests(save: SaveData): QuestDef[] {
  return QUESTS.filter(
    (q) => save.flags[questOfferedFlag(q)] && !save.flags[questDoneFlag(q)],
  );
}
