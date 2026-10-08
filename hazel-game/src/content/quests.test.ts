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
import { ALL_SECRETS, claimSecret, secretById } from './secrets';

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
  it('every topic zone has exactly one main quest; givers exist and are placed in their zone', () => {
    for (const t of TOPIC_REGISTRY) {
      expect(QUESTS.filter((q) => q.zoneId === t.zoneId && !q.side), `${t.zoneId}`).toHaveLength(1);
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

  it('Pip, at home in the Village, sends the player after Numbria\'s Count Bat', () => {
    expect(quest.zoneId).toBe('lumina-village');
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

describe('town side quests (village expansion)', () => {
  const TOWNS = ['lumina-village', 'numbria', 'verdara', 'gearfall', 'chromaria'] as const;

  it('each of the five towns has two side quests, each with its own giver', () => {
    for (const town of TOWNS) {
      expect(QUESTS.filter((q) => q.side && q.zoneId === town), town).toHaveLength(2);
    }
    const givers = QUESTS.map((q) => q.giverNpcId);
    expect(new Set(givers).size).toBe(givers.length);
  });

  it('items a quest takes back exist, and are found in a secret or handed over', () => {
    for (const q of QUESTS) {
      for (const item of q.takesItems ?? []) {
        expect(QUEST_ITEMS[item], `${q.id} item ${item}`).toBeDefined();
        const fromSecret = ALL_SECRETS.some((s) => s.secret.reward.questItem === item);
        expect(fromSecret || q.givesItem === item, `${q.id} ${item} obtainable`).toBe(true);
      }
    }
  });

  it("the Mayor's seal: offer → find the fountain secret → complete takes the seal back", () => {
    const quest = byId('mayor-seal');
    let save = converse('village-mayor', defaultSave());
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);
    expect(questConversation('village-mayor', save)!.finishKind).toBeNull(); // just a hint
    save = claimSecret(save, secretById('village-fountain-seal')!);
    expect(save.questItems).toContain('town-seal');
    const coins = save.coins;
    const clovers = save.items.clover;
    save = converse('village-mayor', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.questItems).not.toContain('town-seal');
    expect(save.coins).toBe(coins + 40);
    expect(save.items.clover).toBe(clovers + 1);
  });

  it('lesson pages: the hint names whichever page is still hidden', () => {
    const quest = byId('lost-lessons');
    let save = converse('numbria-teacher', defaultSave());
    save = claimSecret(save, secretById('numbria-school-shelf')!);
    const hint = resolveHint(activeStep(quest, save)!, save);
    expect(hint).toContain('shapes');
    expect(hint).not.toContain('adding');
    save = claimSecret(save, secretById('numbria-hill-nook')!);
    expect(activeStep(quest, save)).toBeNull();
  });

  it('a secret found before the quest still counts', () => {
    let save = claimSecret(defaultSave(), secretById('verdara-queen-bee')!);
    expect(questConversation('verdara-beekeeper', save)!.finishKind).toBe('complete'); // skips the offer
    save = converse('verdara-beekeeper', save);
    expect(save.flags[questDoneFlag(byId('queen-bee'))]).toBe(true);
    expect(save.questItems).not.toContain('queen-bee');
  });

  it("bakery deliveries go Wick → Sol in order, then the basket is handed back", () => {
    const quest = byId('bakery-deliveries');
    let save = converse('village-baker', defaultSave());
    expect(save.questItems).toContain('warm-buns');
    expect(questConversation('village-keeper', save)).toBeNull(); // not Sol's turn yet
    save = converse('village-elder', save);
    save = converse('village-keeper', save);
    save = converse('village-baker', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.questItems).not.toContain('warm-buns');
  });

  it("Widget's field test needs both battles, then the Professor's report", () => {
    const quest = byId('widget-test');
    let save = converse('gearfall-apprentice', defaultSave());
    save = { ...save, kills: { 'bolt-mouse': 1 } };
    expect(activeStep(quest, save)!.id).toBe('widget-defeat');
    save = { ...save, kills: { 'bolt-mouse': 1, 'scrap-golem': 1 } };
    expect(activeStep(quest, save)!.id).toBe('widget-report');
    save = converse('gearfall-inventor', save);
    save = converse('gearfall-apprentice', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.items.spark).toBe(1);
  });
});
