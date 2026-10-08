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
  openChest,
  chestRewardText,
  handedOverFlag,
} from './quests';
import { WALKABLE_CHARS, ZONES, litFlag, pathTargetId, reachableOnFoot, tileAt } from './zones';
import { fieldSpellFlag } from './fieldSpells';
import { NPC_DEFS } from './npcs';
import { ENEMY_DEFS } from './enemies';
import { TOPIC_REGISTRY } from './topics';
import { defaultSave } from '../lib/save';
import type { SaveData } from '../types';
import { ALL_SECRETS, claimSecret, secretById } from './secrets';

/** Every key-item chest in the world (#75 item 13). */
const KEY_CHESTS = Object.values(ZONES).flatMap((z) => (z.keyChests ?? []).map((c) => ({ z, ...c })));

/** Can this quest item be had somewhere: a secret, a key-item chest, or a bring step's hand-back? */
function obtainable(item: string): boolean {
  return (
    ALL_SECRETS.some((s) => s.secret.reward.questItem === item) ||
    KEY_CHESTS.some((c) => c.item === item) ||
    QUESTS.some((q) => q.steps.some((st) => st.trade?.gives === item))
  );
}

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

  it('items a quest takes back exist, and are found in a secret or chest, or handed over', () => {
    for (const q of QUESTS) {
      for (const item of q.takesItems ?? []) {
        expect(QUEST_ITEMS[item], `${q.id} item ${item}`).toBeDefined();
        expect(obtainable(item) || q.givesItem === item, `${q.id} ${item} obtainable`).toBe(true);
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

describe('item chains (#75 item 13)', () => {
  const MOONSTONE_CHEST = pathTargetId('echo-mine', 'chest', 8, 7);
  const neighbours = (x: number, y: number) => [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`];

  it('each key-item chest is a riddle-chest you can reach, holding a known item some quest needs', () => {
    expect(KEY_CHESTS.length).toBeGreaterThan(0);
    for (const c of KEY_CHESTS) {
      expect(tileAt(c.z, c.x, c.y), `${c.z.id} (${c.x},${c.y}) is a chest`).toBe('C');
      expect(c.z.topic, `${c.z.id} has a riddle topic`).toBeDefined();
      expect(QUEST_ITEMS[c.item], `${c.item} is a quest item`).toBeDefined();
      // Reachable with every fog lifted and every dark place lit.
      const open = reachableOnFoot(c.z, null);
      expect(neighbours(c.x, c.y).some((k) => open.has(k)), `${c.z.id} chest reachable`).toBe(true);
      const needed = QUESTS.some((q) => q.takesItems?.includes(c.item) || q.steps.some((st) => st.trade?.takes === c.item));
      expect(needed, `${c.item} is needed by a quest`).toBe(true);
    }
  });

  it('every item a bring step takes can be had first', () => {
    for (const q of QUESTS) {
      for (const st of q.steps) {
        if (st.trade) expect(obtainable(st.trade.takes) || q.givesItem === st.trade.takes, `${q.id} ${st.trade.takes}`).toBe(true);
      }
    }
  });

  it("the Moonstone's chest sits behind the Echo Mine's dark until Glow lights it", () => {
    const mine = ZONES['echo-mine'];
    expect(mine.keyChests).toEqual([{ x: 8, y: 7, item: 'moonstone' }]);
    const reach = (flags: Record<string, boolean>) => neighbours(8, 7).some((k) => reachableOnFoot(mine, flags).has(k));
    expect(reach({})).toBe(false);
    expect(reach({ [litFlag('echo-mine')]: true })).toBe(true);
  });

  it('Hermit Moss stands on open ground on Dawnreach', () => {
    const at = ZONES.dawnreach.npcs.find((p) => p.defId === 'dawnreach-hermit');
    expect(at).toBeDefined();
    expect(WALKABLE_CHARS.has(tileAt(ZONES.dawnreach, at!.x, at!.y))).toBe(true);
    expect(NPC_DEFS['dawnreach-hermit']).toBeDefined();
  });

  it('opening a key-item chest pays its coins and the item, once', () => {
    let save = openChest(defaultSave(), MOONSTONE_CHEST);
    expect(save.openedChests).toContain(MOONSTONE_CHEST);
    expect(save.questItems).toEqual(['moonstone']);
    expect(save.coins).toBe(25);
    expect(openChest(save, MOONSTONE_CHEST)).toBe(save); // a second time changes nothing
    // An ordinary chest still pays coins only.
    const plain = pathTargetId('echo-mine', 'chest', 19, 2);
    save = openChest(save, plain);
    expect(save.questItems).toEqual(['moonstone']);
    expect(save.coins).toBe(50);
    expect(chestRewardText(MOONSTONE_CHEST)).toBe('25 coins and the 🌙 Moonstone!');
    expect(chestRewardText(plain)).toBe('25 coins! 🪙');
  });

  it("the Hermit's Moonstone: offer → the mine's chest → Mabel cuts it → Moss takes it", () => {
    const quest = byId('hermit-moonstone');
    let save = converse('dawnreach-hermit', defaultSave());
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);
    // Before Glow the hint points at Old Wren; with Glow, at casting it; once
    // the mine is lit, at the nook itself.
    expect(questConversation('dawnreach-hermit', save)!.lines[0]).toMatch(/Old Wren/);
    const glowing = { ...save, flags: { ...save.flags, [fieldSpellFlag('glow')]: true } };
    expect(questConversation('dawnreach-hermit', glowing)!.lines[0]).toMatch(/cast 🔆 Glow/);
    const lit = { ...glowing, flags: { ...glowing.flags, [litFlag('echo-mine')]: true } };
    expect(questConversation('dawnreach-hermit', lit)!.lines[0]).toMatch(/lamps are lit.*little nook/);
    // Mabel has nothing to cut yet.
    expect(questConversation('mine-miner', save)).toBeNull();

    save = openChest(save, MOONSTONE_CHEST);
    expect(resolveHint(activeStep(quest, save)!, save)).toMatch(/Miner Mabel/);
    const cut = questConversation('mine-miner', save)!;
    expect(cut.finishKind).toBe('step');
    save = cut.finish!(save);
    expect(save.questItems).toEqual(['cut-moonstone']);
    // The raw stone is gone, but the cut one (and the handed-over flag) still
    // count for the first step, so the quest is ready to finish — not back to
    // "go find it".
    expect(save.flags[handedOverFlag('moonstone')]).toBe(true);
    expect(activeStep(quest, save)).toBeNull();

    const coins = save.coins;
    const elixirs = save.items.elixir;
    save = converse('dawnreach-hermit', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.questItems).toEqual([]);
    expect(save.coins).toBe(coins + 50);
    expect(save.items.elixir).toBe(elixirs + 1);
    // Afterwards Moss speaks his own lines and Mabel hers.
    expect(questConversation('dawnreach-hermit', save)).toBeNull();
    expect(questConversation('mine-miner', save)).toBeNull();
  });

  it('a Moonstone found before meeting Moss: he offers, then sends you to Mabel', () => {
    const quest = byId('hermit-moonstone');
    let save = openChest(defaultSave(), MOONSTONE_CHEST);
    const offer = questConversation('dawnreach-hermit', save)!;
    expect(offer.finishKind).toBe('offer');
    save = offer.finish!(save);
    expect(activeStep(quest, save)!.id).toBe('moonstone-cut');
    expect(questConversation('mine-miner', save)!.finishKind).toBe('step');
  });

  it('a bring step waits until the item is in hand', () => {
    const quest = byId('hermit-moonstone');
    // An odd save: the find step counts (the Moonstone was handed over once —
    // the flag alone keeps a take-only trade from undoing it), so the cutting
    // step is up, but no Moonstone is carried to hand over.
    const save: SaveData = {
      ...defaultSave(),
      flags: { ...defaultSave().flags, [questOfferedFlag(quest)]: true, [handedOverFlag('moonstone')]: true },
    };
    expect(activeStep(quest, save)!.id).toBe('moonstone-cut');
    expect(questConversation('mine-miner', save)).toBeNull();
  });

  it('every quest item a step, chest or hand-over names is a registered quest item', () => {
    const named = [
      ...KEY_CHESTS.map((c) => c.item),
      ...QUESTS.flatMap((q) => [
        ...(q.givesItem ? [q.givesItem] : []),
        ...(q.takesItems ?? []),
        ...q.steps.flatMap((st) => [...(st.needs ?? []), ...(st.trade ? [st.trade.takes] : []), ...(st.trade?.gives ? [st.trade.gives] : [])]),
      ]),
    ];
    expect(named).toContain('moonstone');
    for (const id of named) expect(QUEST_ITEMS[id], `quest item ${id}`).toBeDefined();
  });
});
