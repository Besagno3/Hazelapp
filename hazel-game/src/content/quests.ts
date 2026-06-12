import type { SaveData, ZoneId } from '../types';

/**
 * Zone quests (#37 story pass, #42 variety). Quests are ordered steps over
 * the save file — each step is a predicate plus a hint, and can optionally
 * be fulfilled by talking to another NPC (deliveries). Three mechanics:
 *
 * - chest steps   — the zone's riddle-chest (openedChests)
 * - defeat steps  — lifetime kill counts per enemy def (save.kills)
 * - talk steps    — speak to a named NPC, who advances the quest
 *
 * Conversations resolve through `questConversation(npcId, save)`:
 * the giver speaks offer / current-step hint / completion; step-target NPCs
 * speak their step lines while that step is active.
 */

export interface QuestItemInfo {
  id: string;
  name: string;
  emoji: string;
}

/** Carried delivery items (shown in the menu while held). */
export const QUEST_ITEMS: Record<string, QuestItemInfo> = {
  'color-seed': { id: 'color-seed', name: 'Color Seed', emoji: '🌱' },
};

export interface QuestStep {
  id: string;
  /** The giver's reminder while this step is active. */
  hint: string | ((save: SaveData) => string);
  isComplete: (save: SaveData) => boolean;
  /** Set when this step is fulfilled by talking to another NPC. */
  npc?: { id: string; lines: string[] };
}

export interface QuestDef {
  id: string;
  zoneId: ZoneId;
  giverNpcId: string;
  title: string;
  offer: string[];
  /** Item handed over when the quest is accepted (delivery quests). */
  givesItem?: string;
  steps: QuestStep[];
  complete: string[];
  reward: { coins: number; potion?: number; hint?: number };
}

// --- Step builders ------------------------------------------------------------

/** The zone's riddle-chest has been opened. */
function chestStep(zoneId: ZoneId, hint: string): QuestStep {
  return {
    id: `${zoneId}-chest`,
    hint,
    isComplete: (save) => save.openedChests.some((id) => id.startsWith(`${zoneId}:chest`)),
  };
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

  // Hub quest sending the kid cross-zone for a specific foe.
  {
    id: 'pips-marble',
    zoneId: 'lumina-field',
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
      '✨ Reward: 20 coins and a Berry Potion!',
    ],
    reward: { coins: 20, potion: 1 },
  },
];

// --- Resolution -----------------------------------------------------------------

export function questFor(npcId: string): QuestDef | undefined {
  return QUESTS.find((q) => q.giverNpcId === npcId);
}

export function questOfferedFlag(q: QuestDef): string {
  return `quest:${q.id}:offered`;
}

export function questDoneFlag(q: QuestDef): string {
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
 * dialogue applies: the giver offers / reminds / completes; a step-target
 * NPC speaks their step lines while that step is active. Completion works
 * even if the player finished the steps before hearing the offer.
 */
export function questConversation(npcId: string, save: SaveData): QuestConversation | null {
  const quest = questFor(npcId);
  if (quest && !save.flags[questDoneFlag(quest)]) {
    const step = activeStep(quest, save);
    if (!step) {
      return {
        lines: quest.complete,
        badge: quest.title,
        finishKind: 'complete',
        finish: (s) => {
          const { coins, potion = 0, hint = 0 } = quest.reward;
          return {
            ...s,
            coins: s.coins + coins,
            items: { potion: s.items.potion + potion, hint: s.items.hint + hint },
            questItems: quest.givesItem
              ? s.questItems.filter((i) => i !== quest.givesItem)
              : s.questItems,
            flags: { ...s.flags, [questDoneFlag(quest)]: true, [questOfferedFlag(quest)]: true },
          };
        },
      };
    }
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

  // Step-target NPCs (deliveries, multi-step middles).
  for (const q of QUESTS) {
    if (!save.flags[questOfferedFlag(q)] || save.flags[questDoneFlag(q)]) continue;
    const step = activeStep(q, save);
    if (step?.npc && step.npc.id === npcId) {
      const flag = stepFlag(step.id);
      return {
        lines: step.npc.lines,
        badge: q.title,
        finishKind: 'step',
        finish: (s) => ({ ...s, flags: { ...s.flags, [flag]: true } }),
      };
    }
  }
  return null;
}

/** Quests accepted but not finished — for the menu's quest log. */
export function activeQuests(save: SaveData): QuestDef[] {
  return QUESTS.filter(
    (q) => save.flags[questOfferedFlag(q)] && !save.flags[questDoneFlag(q)],
  );
}
