import type { SaveData, ZoneId } from '../types';

/**
 * Zone mini-quests (#37 story pass): each topic zone's villager lost
 * something to their Fiend, and it's locked inside the zone's riddle-chest.
 * Quests run entirely on existing systems — chest flags + dialogue — and
 * are resolved through `questDialogue` when talking to the giver.
 */

export interface QuestDef {
  id: string;
  zoneId: ZoneId;
  giverNpcId: string;
  title: string;
  /** Lines when the quest is first offered. */
  offer: string[];
  /** Lines while the chest is still shut. */
  inProgress: string[];
  /** Lines when the player returns with the goods (reward granted after). */
  complete: string[];
  isComplete: (save: SaveData) => boolean;
  reward: { coins: number; potion?: number; hint?: number };
}

/** The zone's riddle-chest has been opened. */
function zoneChestOpened(zoneId: ZoneId) {
  return (save: SaveData) => save.openedChests.some((id) => id.startsWith(`${zoneId}:chest`));
}

export const QUESTS: QuestDef[] = [
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
    inProgress: ['The riddle-chest is still out there — look for a 🎁 somewhere in Numbria!'],
    complete: [
      'My counting stones! You cracked the riddle!',
      'One, two, three… they all still work! Take this, hero — you EARNED it.',
      '✨ Reward: 25 coins and a Berry Potion!',
    ],
    isComplete: zoneChestOpened('numbria'),
    reward: { coins: 25, potion: 1 },
  },
  {
    id: 'glow-moss',
    zoneId: 'verdara',
    giverNpcId: 'verdara-villager',
    title: "Fern's Glow-Moss",
    offer: [
      'The fireflies forgot how to glow, but glow-moss could remind them!',
      'The Smog Fiend sealed our last patch inside a riddle-chest here in Verdara.',
      'Crack the chest, and the fireflies might light up tonight!',
    ],
    inProgress: ['No moss yet? The riddle-chest 🎁 is hiding somewhere in Verdara!'],
    complete: [
      'The glow-moss! Look — the fireflies are already drifting toward it!',
      'Tonight Verdara glows again. You should have this for helping!',
      '✨ Reward: 25 coins and a Hint Feather!',
    ],
    isComplete: zoneChestOpened('verdara'),
    reward: { coins: 25, hint: 1 },
  },
  {
    id: 'golden-gear',
    zoneId: 'gearfall',
    giverNpcId: 'gearfall-villager',
    title: "Rivet's Golden Gear",
    offer: [
      'The great canyon engine is missing its golden gear — the Rust Fiend stuffed it in a riddle-chest!',
      'No golden gear, no engine. No engine, no elevators, no fans, no popcorn machine!',
      'Find that chest and answer it proud, friend.',
    ],
    inProgress: ['The golden gear is still chest-locked — the 🎁 is somewhere in Gearfall!'],
    complete: [
      'The golden gear!! Listen… you can almost hear the engine smiling.',
      'Popcorn machine is back in business. This is for you!',
      '✨ Reward: 25 coins and a Berry Potion!',
    ],
    isComplete: zoneChestOpened('gearfall'),
    reward: { coins: 25, potion: 1 },
  },
  {
    id: 'color-seed',
    zoneId: 'chromaria',
    giverNpcId: 'chromaria-villager',
    title: "Doodle's Color Seed",
    offer: [
      'Before the Gray Fiend drank our colors, I hid one last color seed… and then LOST it.',
      'Now I think it ended up in a riddle-chest here in Chromaria. Typical.',
      'Bring it back and I can grow every color again — even the secret ones!',
    ],
    inProgress: ['The color seed is still locked up — find the riddle-chest 🎁 in Chromaria!'],
    complete: [
      'The color seed! It is already humming with rainbow!',
      'When this blooms, I will paint a mural of YOU. Take this meanwhile!',
      '✨ Reward: 25 coins and a Hint Feather!',
    ],
    isComplete: zoneChestOpened('chromaria'),
    reward: { coins: 25, hint: 1 },
  },
];

export function questFor(npcId: string): QuestDef | undefined {
  return QUESTS.find((q) => q.giverNpcId === npcId);
}

export function questOfferedFlag(q: QuestDef): string {
  return `quest:${q.id}:offered`;
}

export function questDoneFlag(q: QuestDef): string {
  return `quest:${q.id}:done`;
}

export interface QuestDialogue {
  lines: string[];
  /** What finishing this conversation does. */
  finish: 'offer' | 'complete' | null;
  quest: QuestDef;
}

/**
 * Resolves the quest conversation for an NPC, or null when the NPC has no
 * quest or it's already done (normal dialogue shows then). Completing works
 * even if the player opened the chest before hearing the offer.
 */
export function questDialogue(npcId: string, save: SaveData): QuestDialogue | null {
  const quest = questFor(npcId);
  if (!quest || save.flags[questDoneFlag(quest)]) return null;
  if (quest.isComplete(save)) return { lines: quest.complete, finish: 'complete', quest };
  if (!save.flags[questOfferedFlag(quest)]) return { lines: quest.offer, finish: 'offer', quest };
  return { lines: quest.inProgress, finish: null, quest };
}

/** Applies a finished quest conversation to the save. */
export function applyQuestFinish(save: SaveData, qd: QuestDialogue): SaveData {
  if (qd.finish === 'offer') {
    return { ...save, flags: { ...save.flags, [questOfferedFlag(qd.quest)]: true } };
  }
  if (qd.finish === 'complete') {
    const { coins, potion = 0, hint = 0 } = qd.quest.reward;
    return {
      ...save,
      coins: save.coins + coins,
      items: { potion: save.items.potion + potion, hint: save.items.hint + hint },
      flags: { ...save.flags, [questDoneFlag(qd.quest)]: true, [questOfferedFlag(qd.quest)]: true },
    };
  }
  return save;
}
