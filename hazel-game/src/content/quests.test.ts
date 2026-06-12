import { describe, it, expect } from 'vitest';
import {
  QUESTS,
  questDialogue,
  applyQuestFinish,
  questDoneFlag,
  questOfferedFlag,
} from './quests';
import { ZONES, pathTargetId } from './zones';
import { NPC_DEFS } from './npcs';
import { TOPIC_REGISTRY } from './topics';
import { defaultSave } from '../lib/save';
import type { SaveData } from '../types';

/** A save where the quest's zone chest has been opened. */
function saveWithChest(zoneId: string): SaveData {
  const zone = ZONES[zoneId as keyof typeof ZONES];
  let chest: string | null = null;
  zone.map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'C') chest = pathTargetId(zone.id, 'chest', x, y);
    }
  });
  expect(chest, `${zoneId} must have a chest for its quest`).not.toBeNull();
  return { ...defaultSave(), openedChests: [chest!] };
}

describe('QUESTS content', () => {
  it('every topic zone has exactly one quest, given by an NPC placed in that zone', () => {
    for (const t of TOPIC_REGISTRY) {
      const zoneQuests = QUESTS.filter((q) => q.zoneId === t.zoneId);
      expect(zoneQuests, `${t.zoneId} quests`).toHaveLength(1);
      const quest = zoneQuests[0];
      expect(NPC_DEFS[quest.giverNpcId], `giver ${quest.giverNpcId}`).toBeDefined();
      expect(
        ZONES[quest.zoneId].npcs.some((p) => p.defId === quest.giverNpcId),
        `${quest.giverNpcId} placed in ${quest.zoneId}`,
      ).toBe(true);
    }
  });

  it('quests have offer/in-progress/complete lines and a real reward', () => {
    for (const q of QUESTS) {
      expect(q.offer.length).toBeGreaterThanOrEqual(1);
      expect(q.inProgress.length).toBeGreaterThanOrEqual(1);
      expect(q.complete.length).toBeGreaterThanOrEqual(1);
      expect(q.reward.coins).toBeGreaterThan(0);
    }
  });
});

describe('questDialogue flow', () => {
  const quest = QUESTS[0];

  it('offers first, then shows in-progress until the chest opens', () => {
    const fresh = defaultSave();
    const offer = questDialogue(quest.giverNpcId, fresh);
    expect(offer?.finish).toBe('offer');
    expect(offer?.lines).toEqual(quest.offer);

    const offered = applyQuestFinish(fresh, offer!);
    expect(offered.flags[questOfferedFlag(quest)]).toBe(true);

    const progress = questDialogue(quest.giverNpcId, offered);
    expect(progress?.finish).toBeNull();
    expect(progress?.lines).toEqual(quest.inProgress);
  });

  it('completes once the zone chest is open — even without hearing the offer', () => {
    const ready = saveWithChest(quest.zoneId);
    const complete = questDialogue(quest.giverNpcId, ready);
    expect(complete?.finish).toBe('complete');

    const done = applyQuestFinish(ready, complete!);
    expect(done.flags[questDoneFlag(quest)]).toBe(true);
    expect(done.coins).toBe(ready.coins + quest.reward.coins);
    expect(done.items.potion).toBe(ready.items.potion + (quest.reward.potion ?? 0));
    expect(done.items.hint).toBe(ready.items.hint + (quest.reward.hint ?? 0));

    // After completion the quest dialogue retires (normal lines return).
    expect(questDialogue(quest.giverNpcId, done)).toBeNull();
  });

  it('returns null for NPCs without quests', () => {
    expect(questDialogue('elder-lumen', defaultSave())).toBeNull();
  });
});
