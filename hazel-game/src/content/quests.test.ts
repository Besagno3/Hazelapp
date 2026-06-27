import { describe, it, expect } from 'vitest';
import {
  QUESTS,
  questConversation,
  questOfferedFlag,
  questDoneFlag,
  activeStep,
  activeQuests,
  resolveHint,
  QUEST_ITEMS,
} from './quests';
import { ZONES, pathTargetId } from './zones';
import { NPC_DEFS } from './npcs';
import { ENEMY_DEFS } from './enemies';
import { TOPIC_REGISTRY } from './topics';
import { defaultSave } from '../lib/save';
import type { SaveData } from '../types';

function byId(id: string) {
  const q = QUESTS.find((x) => x.id === id);
  expect(q, `quest ${id}`).toBeDefined();
  return q!;
}

/** Runs a giver/step conversation and applies its finish to the save. */
function converse(npcId: string, save: SaveData): SaveData {
  const convo = questConversation(npcId, save);
  expect(convo, `conversation with ${npcId}`).not.toBeNull();
  return convo!.finish ? convo!.finish(save) : save;
}

function chestOf(zoneId: keyof typeof ZONES): string {
  let chest: string | null = null;
  ZONES[zoneId].map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'C') chest = pathTargetId(ZONES[zoneId].id, 'chest', x, y);
    }
  });
  expect(chest, `${zoneId} chest`).not.toBeNull();
  return chest!;
}

describe('QUESTS content', () => {
  it('every topic zone has exactly one quest; givers exist and are placed in their zone', () => {
    for (const t of TOPIC_REGISTRY) {
      expect(QUESTS.filter((q) => q.zoneId === t.zoneId), `${t.zoneId}`).toHaveLength(1);
    }
    for (const q of QUESTS) {
      expect(NPC_DEFS[q.giverNpcId], `giver ${q.giverNpcId}`).toBeDefined();
      expect(
        ZONES[q.zoneId].npcs.some((p) => p.defId === q.giverNpcId),
        `${q.giverNpcId} placed in ${q.zoneId}`,
      ).toBe(true);
    }
  });

  it('step-target NPCs and quest items exist; rewards are real', () => {
    for (const q of QUESTS) {
      expect(q.steps.length).toBeGreaterThanOrEqual(1);
      expect(q.reward.coins).toBeGreaterThan(0);
      if (q.givesItem) expect(QUEST_ITEMS[q.givesItem], `item ${q.givesItem}`).toBeDefined();
      for (const step of q.steps) {
        if (step.npc) expect(NPC_DEFS[step.npc.id], `step npc ${step.npc.id}`).toBeDefined();
      }
    }
  });

  it('uses all three mechanics: chest, defeat, and talk steps', () => {
    const allSteps = QUESTS.flatMap((q) => q.steps);
    expect(allSteps.some((s) => s.id.endsWith('-chest'))).toBe(true);
    expect(allSteps.some((s) => s.npc)).toBe(true);
    // Defeat steps reference real enemy defs (checked via the hint resolving).
    const fresh = defaultSave();
    expect(QUESTS.some((q) => activeStep(q, fresh) && resolveHint(activeStep(q, fresh)!, fresh))).toBe(true);
    expect(ENEMY_DEFS['count-bat']).toBeDefined();
  });
});

describe('chest quest (counting-stones)', () => {
  const quest = byId('counting-stones');

  it('offer → hint → complete with reward', () => {
    let save = defaultSave();
    const offer = questConversation(quest.giverNpcId, save);
    expect(offer?.finishKind).toBe('offer');
    save = converse(quest.giverNpcId, save);
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);

    const hint = questConversation(quest.giverNpcId, save);
    expect(hint?.finishKind).toBeNull();

    save = { ...save, openedChests: [chestOf('numbria')] };
    const complete = questConversation(quest.giverNpcId, save);
    expect(complete?.finishKind).toBe('complete');
    const done = converse(quest.giverNpcId, save);
    expect(done.coins).toBe(save.coins + quest.reward.coins);
    expect(done.flags[questDoneFlag(quest)]).toBe(true);
    expect(questConversation(quest.giverNpcId, done)).toBeNull();
  });
});

describe('defeat quest (firefly-defenders)', () => {
  const quest = byId('firefly-defenders');

  it('completes only when all three critters are beaten; hint names the remaining ones', () => {
    let save = converse(quest.giverNpcId, defaultSave());

    save = { ...save, kills: { 'spore-puff': 1 } };
    const step = activeStep(quest, save);
    expect(step).not.toBeNull();
    const hint = resolveHint(step!, save);
    expect(hint).toContain('Static Jelly');
    expect(hint).toContain('Comet Crab');
    expect(hint).not.toContain('Spore Puff');

    save = { ...save, kills: { 'spore-puff': 1, 'static-jelly': 1, 'comet-crab': 2 } };
    expect(activeStep(quest, save)).toBeNull();
    expect(questConversation(quest.giverNpcId, save)?.finishKind).toBe('complete');
  });
});

describe('multi-step quest (golden-gear)', () => {
  const quest = byId('golden-gear');

  it('runs chest → sage polish → report back, in order', () => {
    let save = converse(quest.giverNpcId, defaultSave());

    // Sage Cog has nothing quest-y to say before the gear is found.
    expect(questConversation('sage-cog', save)).toBeNull();

    save = { ...save, openedChests: [chestOf('gearfall')] };
    const polish = questConversation('sage-cog', save);
    expect(polish?.finishKind).toBe('step');
    save = converse('sage-cog', save);

    expect(activeStep(quest, save)).toBeNull();
    expect(questConversation(quest.giverNpcId, save)?.finishKind).toBe('complete');
  });
});

describe('delivery quest (color-seed)', () => {
  const quest = byId('color-seed');

  it('hands over the seed at offer, Sage Muse awakens it, completion takes it back', () => {
    let save = converse(quest.giverNpcId, defaultSave());
    expect(save.questItems).toContain('color-seed');

    const awaken = questConversation('sage-muse', save);
    expect(awaken?.finishKind).toBe('step');
    save = converse('sage-muse', save);

    const complete = questConversation(quest.giverNpcId, save);
    expect(complete?.finishKind).toBe('complete');
    save = converse(quest.giverNpcId, save);
    expect(save.questItems).not.toContain('color-seed');
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
  });
});

describe('cross-zone quest (pips-marble)', () => {
  const quest = byId('pips-marble');

  it('Pip in the hub sends the player after Numbria\'s Count Bat', () => {
    expect(quest.zoneId).toBe('lumina-field');
    let save = converse(quest.giverNpcId, defaultSave());
    expect(activeQuests(save).map((q) => q.id)).toContain('pips-marble');

    save = { ...save, kills: { 'count-bat': 1 } };
    expect(questConversation(quest.giverNpcId, save)?.finishKind).toBe('complete');
  });

  it('completes even when the kill happened before the offer', () => {
    const save: SaveData = { ...defaultSave(), kills: { 'count-bat': 3 } };
    expect(questConversation(quest.giverNpcId, save)?.finishKind).toBe('complete');
  });
});

describe('grove side-quest (grove-moonwell)', () => {
  const quest = byId('grove-moonwell');

  it('lives in the hidden grove with a stationary guardian giver', () => {
    expect(quest.zoneId).toBe('moonwell-grove');
    expect(NPC_DEFS[quest.giverNpcId].stationary).toBe(true);
  });

  it('runs chest → clear all three critters → complete with reward', () => {
    let save = defaultSave();
    expect(questConversation(quest.giverNpcId, save)?.finishKind).toBe('offer');
    save = converse(quest.giverNpcId, save);
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);

    // Step 1: crack the grove riddle-chest; the next step is the critters.
    save = { ...save, openedChests: [chestOf('moonwell-grove')] };
    const step = activeStep(quest, save);
    expect(step?.id).toBe('grove-critters');
    expect(resolveHint(step!, save)).toContain('Mossback');

    // Step 2: beat all three nature critters, any order.
    save = { ...save, kills: { 'mossback-cub': 1, thornhare: 1, grumblebee: 1 } };
    expect(activeStep(quest, save)).toBeNull();
    const complete = questConversation(quest.giverNpcId, save);
    expect(complete?.finishKind).toBe('complete');
    const done = converse(quest.giverNpcId, save);
    expect(done.coins).toBe(save.coins + quest.reward.coins);
    expect(done.flags[questDoneFlag(quest)]).toBe(true);
  });
});
