import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  QUESTS,
  questConversation,
  questFor,
  questsBy,
  stepFlag,
  type QuestDef,
  questOfferedFlag,
  questDoneFlag,
  activeStep,
  arrivalFlags,
  activeQuests,
  resolveHint,
  QUEST_ITEMS,
  openChest,
  chestRewardText,
  handedOverFlag,
  zoneChestOpened,
  chestWantedLine,
  activeEscort,
  escortsAway,
  escortsBackLines,
  riddleSolvedLine,
  solveRiddle,
} from './quests';
import { BOAT_QUEST_ID } from './boat';
import { JUNO_CAME, JUNO_QUEST, JUNO_WALK, YARN_QUEST, YARN_STONES, POSY_QUEST, POSY_SAILED, POSY_WALK, escortBackFlag, escortWalkingFlag, withoutEscorts } from './questFlags';
import { normalizeSave } from '../lib/save';
import { WALKABLE_CHARS, ZONES, litFlag, pathTargetId, tileAt } from './zones';
import { reach, touches } from '../lib/reach';
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

  it('each of the five towns has two side quests', () => {
    for (const town of TOWNS) {
      expect(QUESTS.filter((q) => q.side && q.zoneId === town), town).toHaveLength(2);
    }
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

  it('each key-item chest is a riddle-chest you can reach, holding a known item some quest needs', () => {
    expect(KEY_CHESTS.length).toBeGreaterThan(0);
    for (const c of KEY_CHESTS) {
      expect(tileAt(c.z, c.x, c.y), `${c.z.id} (${c.x},${c.y}) is a chest`).toBe('C');
      expect(c.z.topic, `${c.z.id} has a riddle topic`).toBeDefined();
      expect(QUEST_ITEMS[c.item], `${c.item} is a quest item`).toBeDefined();
      // Reachable with every fog lifted and every dark place lit.
      // Out at sea (#75 item 14i: Sandpiper Cay), from the boat sailing in at the map's edge.
      const sea = c.z.seaLinks ? c.z.map.findIndex((row) => row[0] === '~') : -1;
      const opts = sea >= 0 ? { flags: null, from: { x: 0, y: sea }, aboard: true, modes: ['boat', 'foot'] as const } : { flags: null };
      expect(touches(reach(c.z, opts), c.x, c.y), `${c.z.id} chest reachable`).toBe(true);
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
    expect(mine.keyChests!.map(({ x, y, item }) => ({ x, y, item }))).toEqual([{ x: 8, y: 7, item: 'moonstone' }]);
    const reached = (flags: Record<string, boolean>) => touches(reach(mine, { flags }), 8, 7);
    expect(reached({})).toBe(false);
    expect(reached({ [litFlag('echo-mine')]: true })).toBe(true);
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

  it("Ness's Lens (#75 item 14i): Ness → the Cay's sea-glass chest → Shelby grinds it → Ness fits it", () => {
    const quest = byId('ness-lens');
    const chest = pathTargetId('silver-shallows', 'chest', 25, 32);
    // Her first talk is the offer, and it still carries her hello, the safety line and her rumors
    // (#75 item 14i review rounds 1–2), so one trip does it: Ness → the Cay → Ness.
    const first = questConversation('gull-lamplighter', defaultSave())!.lines.join(' ');
    expect(first).toMatch(/I'm Ness/);
    expect(first).toMatch(/only bother boats/);
    expect(first).toMatch(/Great Fogbank/);
    expect(first).toMatch(/Foglight Marsh/);
    // The ask is the last thing she says before the button (review round 3).
    const offerLines = questConversation('gull-lamplighter', defaultSave())!.lines;
    expect(offerLines.at(-1)).toMatch(/bring the lens to me/);
    // Found the glass first? She says so (offerHaving), rumors and all.
    const having = questConversation('gull-lamplighter', { ...defaultSave(), questItems: ['sea-glass'] })!.lines.join(' ');
    expect(having).toMatch(/is that sea glass/);
    expect(having).toMatch(/Foglight Marsh/);
    expect(questConversation('gull-lamplighter', { ...defaultSave(), questItems: ['sea-glass'] })!.lines.at(-1)).toMatch(/bring the lens to me/);
    let save: SaveData = converse('gull-lamplighter', defaultSave());
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);
    expect(questConversation('gull-lamplighter', save)!.lines[0]).toMatch(/Sandpiper Cay/);
    expect(questConversation('cay-hermit', save)).toBeNull();
    save = openChest(save, chest);
    expect(save.questItems).toEqual(['sea-glass']);
    const grind = questConversation('cay-hermit', save)!;
    expect(grind.finishKind).toBe('step');
    save = grind.finish!(save);
    expect(save.questItems).toEqual(['sea-glass-lens']);
    expect(activeStep(quest, save)).toBeNull();
    const coins = save.coins;
    const hints = save.items.hint;
    save = converse('gull-lamplighter', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.questItems).toEqual([]);
    expect(save.coins).toBe(coins + 40);
    expect(save.items.hint).toBe(hints + 1);
    // Afterwards: no stale chest rumor, no repeated rumors (review round 3).
    const after = NPC_DEFS['gull-lamplighter'].lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ');
    expect(after).not.toMatch(/chest on it|Foglight Marsh|only bother boats/);
    expect(after).toMatch(/whale/);
    // The sea-glass chest says Shelby is right there.
    expect(chestWantedLine(defaultSave(), pathTargetId('silver-shallows', 'chest', 25, 32))).toMatch(/Shelby, right here/);
    // The Cay's old riddle-chest is still an ordinary one.
    expect(chestRewardText(pathTargetId('silver-shallows', 'chest', 26, 31))).toBe('25 coins! 🪙');
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

  it('a key item found before its quest says who wants it — until the quest is offered', () => {
    const quest = byId('hermit-moonstone');
    const save = openChest(defaultSave(), MOONSTONE_CHEST);
    expect(chestWantedLine(save, MOONSTONE_CHEST)).toMatch(/Hermit Moss.*Moonstone/);
    const offered = { ...save, flags: { ...save.flags, [questOfferedFlag(quest)]: true } };
    expect(chestWantedLine(offered, MOONSTONE_CHEST)).toBeNull();
    expect(chestWantedLine(save, pathTargetId('echo-mine', 'chest', 19, 2))).toBeNull(); // an ordinary chest
  });

  it("a key-item chest doesn't count as its zone's riddle-chest", () => {
    const keyChest = openChest(defaultSave(), MOONSTONE_CHEST);
    expect(zoneChestOpened(keyChest, 'echo-mine')).toBe(false);
    expect(zoneChestOpened(openChest(keyChest, pathTargetId('echo-mine', 'chest', 19, 2)), 'echo-mine')).toBe(true);
  });

  it('each quest item belongs to one quest (hand-overs are remembered per item)', () => {
    const owner = new Map<string, string>();
    for (const q of QUESTS) {
      const ids = new Set([
        ...(q.givesItem ? [q.givesItem] : []),
        ...(q.takesItems ?? []),
        ...q.steps.flatMap((st) => [...(st.needs ?? []), ...(st.trade ? [st.trade.takes] : []), ...(st.trade?.gives ? [st.trade.gives] : [])]),
      ]);
      for (const id of ids) {
        expect(owner.get(id) ?? q.id, `${id} is used by ${owner.get(id)} and ${q.id}`).toBe(q.id);
        owner.set(id, q.id);
      }
    }
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

describe('one person, several quests (#75 item 14c)', () => {
  // Two stand-in people: Bea gives two quests, Moe gives one, and Bea's first goes through Moe.
  const BEA = 'test-bea';
  const MOE = 'test-moe';
  const LATER = 'test-later-act';
  const flagged = (id: string, hint: string, npc?: QuestDef['steps'][number]['npc']): QuestDef['steps'][number] => ({
    id,
    hint,
    npc,
    isComplete: (save) => save.flags[stepFlag(id)] === true,
  });
  const quest = (id: string, giverNpcId: string, steps: QuestDef['steps'], requires?: string): QuestDef => ({
    id,
    zoneId: 'lumina-village',
    giverNpcId,
    title: id,
    offer: [`${id} offer`],
    requires,
    steps,
    complete: [`${id} done`],
    reward: { coins: 1 },
  });
  const BEA_FIRST = quest('bea-first', BEA, [flagged('bea-first-moe', 'Go and see Moe.', { id: MOE, lines: ['Moe helps Bea.'] })]);
  const BEA_SECOND = quest('bea-second', BEA, [flagged('bea-second-x', 'Bea waits on her second.')], LATER);
  const MOE_OWN = quest('moe-own', MOE, [flagged('moe-own-x', 'Moe waits on his own.')]);

  let added: QuestDef[] = [];
  beforeEach(() => {
    added = [BEA_FIRST, BEA_SECOND, MOE_OWN];
    QUESTS.push(...added);
  });
  afterEach(() => {
    for (const q of added) {
      const i = QUESTS.indexOf(q);
      if (i >= 0) QUESTS.splice(i, 1);
    }
  });

  const talk = (npc: string, save: SaveData) => {
    const c = questConversation(npc, save);
    expect(c, npc).not.toBeNull();
    return { c: c!, save: c!.finish ? c!.finish(save) : save };
  };
  const set = (save: SaveData, flag: string): SaveData => ({ ...save, flags: { ...save.flags, [flag]: true } });

  it("a giver's quests come one at a time, and the next waits for its story flag", () => {
    expect(questsBy(BEA)).toEqual([BEA_FIRST, BEA_SECOND]);
    let save = defaultSave();
    expect(questFor(BEA, save)).toBe(BEA_FIRST);
    save = talk(BEA, save).save;
    save = set(save, stepFlag('bea-first-moe'));
    const done = talk(BEA, save);
    expect(done.c.finishKind).toBe('complete');
    save = done.save;
    // The second waits for the story: nothing to say, until the flag is set.
    expect(questFor(BEA, save)).toBeUndefined();
    expect(questConversation(BEA, save)).toBeNull();
    save = set(save, LATER);
    expect(questFor(BEA, save)).toBe(BEA_SECOND);
    expect(talk(BEA, save).c.lines).toEqual(['bea-second offer']);
  });

  it("a step through a giver speaks first — before their own offer, and while their own quest is mid-way", () => {
    let save = talk(BEA, defaultSave()).save;
    // Moe hasn't offered his own yet: Bea's step still goes first.
    expect(questConversation(MOE, save)!.lines).toEqual(['Moe helps Bea.']);
    // Moe's own quest under way (mid-hint): Bea's step still goes first, then his hint.
    save = set(save, questOfferedFlag(MOE_OWN));
    const step = talk(MOE, save);
    expect(step.c.finishKind).toBe('step');
    expect(step.c.badge).toBe('bea-first');
    expect(step.save.flags[stepFlag('bea-first-moe')]).toBe(true);
    expect(talk(MOE, step.save).c.lines).toEqual(['Moe waits on his own.']);
  });

  it('a giver whose own quest is ready to finish finishes it first, then the step', () => {
    let save = talk(BEA, defaultSave()).save;
    save = set(set(save, questOfferedFlag(MOE_OWN)), stepFlag('moe-own-x'));
    const done = talk(MOE, save);
    expect(done.c.finishKind).toBe('complete');
    expect(done.c.badge).toBe('moe-own');
    expect(talk(MOE, done.save).c.finishKind).toBe('step');
  });

  it("a bring step through a giver waits for its item: until then they talk about their own", () => {
    const talkStep = BEA_FIRST.steps[0];
    BEA_FIRST.steps[0] = { ...talkStep, trade: { takes: 'test-parcel' } };
    try {
      const save = talk(BEA, defaultSave()).save;
      expect(questConversation(MOE, save)!.lines).toEqual(['moe-own offer']);
      expect(questConversation(MOE, { ...save, questItems: ['test-parcel'] })!.finishKind).toBe('step');
    } finally {
      BEA_FIRST.steps[0] = talkStep;
    }
  });

  it('finish what you started: a quest under way comes before one listed first that unlocks later', () => {
    // Bea's second quest is listed before a third that needs no story flag — swap them in for this test.
    const third = quest('bea-third', BEA, [flagged('bea-third-x', 'Bea waits on her third.')]);
    QUESTS.splice(QUESTS.indexOf(BEA_FIRST), 1);
    added = [BEA_SECOND, third, MOE_OWN];
    QUESTS.push(third);
    expect(questsBy(BEA)).toEqual([BEA_SECOND, third]);
    let save = talk(BEA, defaultSave()).save; // the third is the one on offer before the story flag
    expect(save.flags[questOfferedFlag(third)]).toBe(true);
    save = set(save, LATER); // now the second (listed first) has unlocked too
    expect(questFor(BEA, save)).toBe(third);
    expect(talk(BEA, save).c.lines).toEqual(['Bea waits on her third.']);
    save = set(save, stepFlag('bea-third-x'));
    const done = talk(BEA, save);
    expect(done.c.finishKind).toBe('complete');
    expect(done.c.badge).toBe('bea-third');
    expect(talk(BEA, done.save).c.lines).toEqual(['bea-second offer']);
  });

  it("today's people give one quest each, and each is theirs once its story flag is set", () => {
    for (const q of QUESTS.filter((x) => !added.includes(x))) {
      const save = q.requires ? set(defaultSave(), q.requires) : defaultSave();
      expect(questsBy(q.giverNpcId), q.giverNpcId).toEqual([q]);
      expect(questFor(q.giverNpcId, save), q.id).toBe(q);
    }
  });
});

describe("Fen's Forgotten Acorns (#75 item 14f)", () => {
  const chest = (x: number, y: number) => pathTargetId('eldergrove', 'chest', x, y);
  const SPECKLED = chest(2, 15);
  const STRIPED = chest(41, 14);
  const GOLDEN = chest(5, 24);
  const hint = (save: SaveData) => questConversation('elder-fen', save)!.lines[0];

  it('three acorns in three key-item chests across Eldergrove, none behind the gate', () => {
    expect(ZONES.eldergrove.keyChests!.map((c) => c.item)).toEqual(['acorn-speckled', 'acorn-striped', 'acorn-golden']);
    for (const c of ZONES.eldergrove.keyChests!) {
      expect(touches(reach(ZONES.eldergrove), c.x, c.y), `${c.item} in reach without the gate`).toBe(true);
    }
    expect(byId('fen-acorns')).toMatchObject({ giverNpcId: 'elder-fen', side: true, zoneId: 'eldergrove' });
  });

  it('offer → each acorn helps her remember the next → she takes all three and pays', () => {
    const quest = byId('fen-acorns');
    let save = converse('elder-fen', defaultSave());
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);
    // The first she remembers already; how many are left, never the whole list again.
    expect(hint(save)).toBe('The Speckled Acorn is in a 🎁 on the far west side of the grove, between the trees. Three to go!');

    save = openChest(save, SPECKLED);
    expect(chestWantedLine(save, SPECKLED)).toBe('🧺 Fen might remember where the next one is now — ask her!');
    expect(hint(save)).toBe('Ooh, now I remember! The Striped Acorn is in a 🎁 on the east side. Follow the path east, between the two ponds! Two to go!');
    save = openChest(save, STRIPED);
    expect(hint(save)).toMatch(/^Ooh, now I remember! The Golden Acorn is in a 🎁 .*not the Great Ring! It's the last one!$/);
    save = openChest(save, GOLDEN);
    expect(chestWantedLine(save, GOLDEN)).toBe("🧺 That's all three! Take them back to Fen.");

    const coins = save.coins;
    const feathers = save.items.hint;
    const done = questConversation('elder-fen', save)!;
    expect(done.finishKind).toBe('complete');
    save = done.finish!(save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.questItems).toEqual([]);
    expect(save.coins).toBe(coins + 35);
    expect(save.items.hint).toBe(feathers + 1);
    // Afterwards she says her own lines, and a chest says nothing more.
    expect(questConversation('elder-fen', save)).toBeNull();
    expect(chestWantedLine(save, GOLDEN)).toBeNull();
  });

  it("found out of order, she names the first still missing — and only says she remembers when she's past the first", () => {
    let save = converse('elder-fen', defaultSave());
    save = openChest(save, GOLDEN);
    expect(hint(save)).toBe('The Speckled Acorn is in a 🎁 on the far west side of the grove, between the trees. Two to go!');
    save = openChest(save, SPECKLED);
    expect(hint(save)).toMatch(/^Ooh, now I remember! The Striped Acorn .* It's the last one!$/);
  });

  it('every hint is short enough for a young reader (≤ 30 words)', () => {
    let save = converse('elder-fen', defaultSave());
    for (const c of [SPECKLED, STRIPED, GOLDEN]) {
      expect(hint(save).split(/\s+/).length, hint(save)).toBeLessThanOrEqual(30);
      save = openChest(save, c);
    }
  });

  it('an acorn found before meeting Fen says who wants it', () => {
    const save = openChest(defaultSave(), STRIPED);
    expect(save.questItems).toEqual(['acorn-striped']);
    expect(chestWantedLine(save, STRIPED)).toMatch(/Fen the Forager.*acorns/);
    expect(chestRewardText(STRIPED)).toBe('25 coins and the 🌰 Striped Acorn!');
  });
});

describe('The Lantern Ledger (#75 item 14g)', () => {
  const LEDGER = pathTargetId('foglight-marsh', 'chest', 40, 3);
  const hint = (save: SaveData) => questConversation('marsh-brume', save)!.lines[0];

  it('a Ledger found before meeting Brume: she knows, and asks for the lanterns only', () => {
    const save = openChest(defaultSave(), LEDGER);
    expect(questConversation('marsh-brume', save)!.lines[0]).toMatch(/You found it already/);
    expect(questConversation('marsh-brume', save)!.lines.join(' ')).toMatch(/First, the EAST lantern/);
    expect(questConversation('marsh-brume', defaultSave())!.lines[0]).not.toMatch(/already/);
  });

  it('find the Ledger, light the east, north and west lanterns in turn — from the chest back to Brume — then she pays', () => {
    const quest = byId('marsh-lanterns');
    expect(quest).toMatchObject({ giverNpcId: 'marsh-brume', side: true, zoneId: 'foglight-marsh' });
    let save = converse('marsh-brume', defaultSave());
    expect(hint(save)).toMatch(/riddle-chest 🎁/);
    // A lantern before the Ledger is found says to find it first (#75 item 14g UX review).
    expect(questConversation('marsh-lantern-west', save)!.lines[0]).toMatch(/^Not yet! .*riddle-chest 🎁/);
    save = openChest(save, LEDGER);
    expect(save.questItems).toContain('lantern-ledger');
    // The Ledger says where to start (#75 item 14g UX review).
    expect(chestWantedLine(save, LEDGER)).toMatch(/first, the EAST lantern/);
    expect(hint(save)).toMatch(/EAST/);
    // Out of order: the north lantern waits its turn, and says which comes first (#75 item 14g review).
    expect(questConversation('marsh-lantern-north', save)!.lines[0]).toMatch(/^Not this one yet! The Ledger says: light the EAST lantern first/);
    expect(questConversation('marsh-lantern-north', save)!.finish).toBeNull();
    for (const side of ['east', 'north', 'west']) {
      save = converse(`marsh-lantern-${side}`, save);
      expect(save.flags[stepFlag(`lantern-${side}`)], side).toBe(true);
    }
    const coins = save.coins;
    const feathers = save.items.hint;
    const done = questConversation('marsh-brume', save)!;
    expect(done.finishKind).toBe('complete');
    save = done.finish!(save);
    expect([save.coins, save.items.hint, save.questItems]).toEqual([coins + 35, feathers + 1, []]);
  });

  it("the Ledger found first says it's Brume's", () => {
    expect(chestWantedLine(openChest(defaultSave(), LEDGER), LEDGER)).toMatch(/Lightkeeper Brume/);
  });

  it('every hint is short enough for a young reader (≤ 30 words)', () => {
    for (const st of byId('marsh-lanterns').steps) {
      const text = resolveHint(st, defaultSave());
      expect(text.split(/\s+/).length, text).toBeLessThanOrEqual(30);
    }
  });
});

describe('The Flower for No Name: an escort (#75 item 14g)', () => {
  const withBoat = (): SaveData => ({ ...defaultSave(), flags: { ...defaultSave().flags, [questDoneFlag({ id: BOAT_QUEST_ID })]: true } });
  const walking = escortWalkingFlag(POSY_WALK);

  it('Posy asks only once there\'s a boat to sail there in', () => {
    expect(questConversation('hill-posy', defaultSave())).toBeNull();
    const offer = questConversation('hill-posy', withBoat())!;
    expect(offer.finishKind).toBe('offer');
    expect(offer.lines.join(' ')).toMatch(/Foglight Marsh/);
  });

  it('talk to her at the landing and she walks with you; arriving at the stone finishes it; she pays', () => {
    let save: SaveData = { ...converse('hill-posy', withBoat()), zoneId: 'foglight-marsh' };
    expect(activeEscort(save, 'foglight-marsh')).toBeNull();
    // At the landing: she says she'll follow, and the walk begins.
    const start = questConversation('hill-posy', save)!;
    expect(start.finishKind).toBe('step');
    save = start.finish!(save);
    expect(save.flags[walking]).toBe(true);
    expect(activeEscort(save, 'foglight-marsh')).toMatchObject({ stepId: POSY_WALK, npcId: 'hill-posy', goal: { x: 6, y: 4 } });
    // Walking with you she isn't asked again.
    expect(questConversation('hill-posy', save)?.finishKind ?? null).toBeNull();
    // The world marks the arrival (WorldScreen.onEscortArrive).
    save = { ...save, flags: { ...withoutEscorts(save.flags), [stepFlag(POSY_WALK)]: true } };
    expect(activeEscort(save, 'foglight-marsh')).toBeNull();
    const coins = save.coins;
    const potions = save.items.potion;
    const done = questConversation('hill-posy', save)!;
    expect(done.finishKind).toBe('complete');
    save = done.finish!(save);
    expect([save.coins, save.items.potion, save.flags[questDoneFlag({ id: POSY_QUEST })]]).toEqual([coins + 35, potions + 1, true]);
  });

  it('she comes over to the Marsh when the hero first gets there after she asks — not before (#75 item 14g)', () => {
    const asked = converse('hill-posy', withBoat());
    expect(arrivalFlags('foglight-marsh', withBoat().flags)).toEqual([]); // not asked yet
    expect(arrivalFlags('silver-shallows', asked.flags)).toEqual([]); // not there yet
    expect(arrivalFlags('foglight-marsh', asked.flags)).toEqual([POSY_SAILED]);
    expect(arrivalFlags('foglight-marsh', { ...asked.flags, [POSY_SAILED]: true })).toEqual([]);
  });

  it('a walk is never kept: a reload, or leaving the Marsh, and she waits at the landing again', () => {
    let save: SaveData = { ...converse('hill-posy', withBoat()), zoneId: 'foglight-marsh' };
    save = converse('hill-posy', save);
    expect(save.flags[walking]).toBe(true);
    expect(normalizeSave(save).flags[walking]).toBeUndefined();
    // …and the world says once that she went back (#75 item 14g review).
    expect(normalizeSave(save).flags[escortBackFlag(POSY_WALK)]).toBe(true);
    expect(escortsBackLines(normalizeSave(save).flags)[0].line).toMatch(/Posy ran back to the landing/);
    // Said in the Marsh: left mid-walk, it waits for the next visit there.
    expect(escortsBackLines(normalizeSave(save).flags, 'silver-shallows')).toEqual([]);
    expect(escortsBackLines(normalizeSave(save).flags, 'foglight-marsh')).toHaveLength(1);
    // In the Marsh, not walking: the log says where she waits, not "sail to the Marsh".
    const inMarsh = normalizeSave({ ...save, zoneId: 'foglight-marsh' });
    const quest = QUESTS.find((q) => q.id === POSY_QUEST)!;
    expect(resolveHint(activeStep(quest, inMarsh)!, inMarsh)).toMatch(/waiting at the landing/);
    expect(escortsAway(save, 'foglight-marsh')).toEqual([]);
    expect(escortsAway(save, 'silver-shallows')).toEqual(['hill-posy']);
    expect(withoutEscorts(save.flags)[walking]).toBeUndefined();
    // Nothing else is touched.
    expect(withoutEscorts(save.flags)[questOfferedFlag({ id: POSY_QUEST })]).toBe(true);
  });
});

describe("A Letter, Long Overdue (#75 item 14h)", () => {
  it("Index's letter across the sea: offered in the Archive, read by Grandmother Wick, her note back to Index", () => {
    const quest = byId('archive-letter');
    expect(quest.zoneId).toBe('sunken-archive');
    expect(ZONES['sunken-archive'].npcs.some((n) => n.defId === quest.giverNpcId)).toBe(true);
    // Wick has nothing to say about a letter before there is one.
    let save = defaultSave();
    expect(questConversation('village-elder', save)).toBeNull();

    save = converse('archive-index', save);
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);
    expect(save.questItems).toEqual(['old-letter']);
    // Signed by Wick, written to someone whose name has faded — as she tells it (review fix).
    expect(questConversation('village-elder', save)!.lines[0]).toMatch(/MY handwriting/);
    expect(quest.offer.join(' ')).toMatch(/signed: Wick/);
    expect(quest.offer.join(' ')).not.toMatch(/To Wick/);
    expect(resolveHint(activeStep(quest, save)!, save)).toMatch(/Grandmother Wick.*Lumina Village/);

    // Wick reads it — her own handwriting, to a teacher whose name she's forgotten — and sends a note back.
    const wick = questConversation('village-elder', save)!;
    expect(wick.finishKind).toBe('step');
    expect(wick.lines.join(' ')).toMatch(/MY handwriting.*teacher.*can't even remember her name/);
    save = wick.finish!(save);
    expect(save.questItems).toEqual(['wick-note']);
    expect(activeStep(quest, save)).toBeNull();
    // Index is a sea away: the quest log says where (review fix).
    expect(quest.doneLine).toMatch(/Index in the Sunken Archive/);

    const coins = save.coins;
    const potions = save.items.potion;
    save = converse('archive-index', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.questItems).toEqual([]);
    expect(save.coins).toBe(coins + 40);
    expect(save.items.potion).toBe(potions + 1);
    expect(questConversation('archive-index', save)).toBeNull();
    expect(questConversation('village-elder', save)).toBeNull();
  });
});

describe('Taleshore I quests (#75 item 15d)', () => {
  const GREEN = pathTargetId('driftwood-shallows', 'chest', 4, 3);
  const BLUE = pathTargetId('driftwood-shallows', 'chest', 36, 16);
  const GOLD = pathTargetId('gale-atoll', 'chest', 6, 18);

  it("Salt's sea-glass: three chests in two places; the hint names the next; she takes all three and pays", () => {
    const quest = byId('salt-seaglass');
    let save = converse('drift-salt', defaultSave());
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);
    const hint = (s: SaveData) => questConversation('drift-salt', s)!.lines[0];
    expect(hint(save)).toMatch(/^The next one is in a 🎁 in the top-left corner of Driftwood Shallows\./);
    save = openChest(save, GREEN);
    save = openChest(save, BLUE);
    expect(hint(save)).toBe('The next one is in a 🎁 on the west side of Gale Atoll, out at sea south-west of Port Lantern — only Ember can fly you there.');
    save = openChest(save, GOLD);
    expect(chestWantedLine(save, GOLD)).toBe("🧂 That's all three! Take them back to Salt on Driftwood Shallows.");
    const coins = save.coins;
    save = converse('drift-salt', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.questItems).toEqual([]);
    expect(save.coins).toBe(coins + 40);
  });

  it("Wim's map: one critter from each of the three places, any order", () => {
    const quest = byId('drift-map');
    const zones = ['driftwood-shallows', 'wayfinder-isles', 'gale-atoll'] as const;
    for (const [defId, zid] of [['compass-crab', zones[0]], ['latitude-cat', zones[1]], ['kite-ray', zones[2]]] as const) {
      expect(ZONES[zid].enemies.some((e) => e.defId === defId), `${defId} in ${zid}`).toBe(true);
    }
    let save = converse('way-drift', defaultSave());
    save = { ...save, kills: { 'kite-ray': 1, 'compass-crab': 2 } };
    expect(questConversation('way-drift', save)!.lines[0]).toMatch(/Still out there: a Latitude Cat 🐈/);
    save = { ...save, kills: { ...save.kills, 'latitude-cat': 1 } };
    const coins = save.coins;
    save = converse('way-drift', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.coins).toBe(coins + 45);
  });

  it("Juno's walk: offered in Port Lantern, she comes over as you reach the beach, walked to the Puffin", () => {
    const quest = byId(JUNO_QUEST);
    expect(quest).toMatchObject({ zoneId: 'port-lantern', giverNpcId: 'port-skipper', playedIn: 'driftwood-shallows' });
    const walk = quest.steps[0].escort!;
    expect(walk.zoneId).toBe('driftwood-shallows');
    // Her goal is on the sand beside the Puffin (review: not on the one-wide dock).
    expect(tileAt(ZONES['driftwood-shallows'], walk.goal.x, walk.goal.y)).toBe(':');
    const puffin = ZONES['driftwood-shallows'].npcs.find((n) => n.defId === 'drift-puffin')!;
    expect(Math.abs(puffin.x - walk.goal.x) + Math.abs(puffin.y - walk.goal.y)).toBe(1);
    let save = converse('port-skipper', defaultSave());
    expect(save.flags[questOfferedFlag(quest)]).toBe(true);
    // Talked to again in town, she says to meet on the beach — no walk starts there (round 2).
    const inTown = questConversation('port-skipper', { ...save, zoneId: 'port-lantern' })!;
    expect(inTown.lines[0]).toBe("See you on the beach! Take the road south from town to Driftwood Shallows. I'll wait where it comes in.");
    expect(inTown).toMatchObject({ finish: null, finishKind: null });
    // Reaching the beach brings her over (review: she doesn't vanish as her offer closes).
    expect(arrivalFlags('driftwood-shallows', save.flags)).toEqual([JUNO_CAME]);
    expect(arrivalFlags('port-lantern', save.flags)).toEqual([]);
    save = { ...save, zoneId: 'driftwood-shallows', flags: { ...save.flags, [JUNO_CAME]: true } };
    // Talked to at the landing, she starts walking (the escort step).
    const start = questConversation('port-skipper', save)!;
    expect(start.lines[0]).toMatch(/^You came! The Puffin is by the old dock/);
    save = start.finish ? start.finish(save) : save;
    expect(save.flags[escortWalkingFlag(JUNO_WALK)]).toBe(true);
    // A reload mid-walk sends her back to wait, and the world says so in Driftwood.
    const back = normalizeSave(save);
    expect(back.flags[escortWalkingFlag(JUNO_WALK)]).toBeFalsy();
    expect(escortsBackLines(back.flags, 'driftwood-shallows').map((l) => l.line)).toEqual(['🧭 Juno went back to where the road comes in. Talk to her there to walk again!']);
    save = { ...save, flags: { ...withoutEscorts(save.flags), [stepFlag(JUNO_WALK)]: true } };
    const coins = save.coins;
    save = converse('port-skipper', save);
    expect(save.flags[questDoneFlag(quest)]).toBe(true);
    expect(save.coins).toBe(coins + 40);
  });
});

describe("Yarn's Tallest Tale: a riddle chain (#75 item 15e)", () => {
  const stones = ['reef-stone-1', 'reef-stone-2', 'reef-stone-3'];
  const offered = () => converse('reef-yarn', { ...defaultSave(), zoneId: 'story-reef' });

  it('three riddle steps, one per tale-stone, in order; each answer says where the next is', () => {
    const quest = byId(YARN_QUEST);
    expect(quest.steps.map((st) => st.id)).toEqual([...YARN_STONES]);
    expect(quest.steps.map((st) => st.npc?.id)).toEqual(stones);
    expect(quest.steps.every((st) => st.riddle)).toBe(true);
    // Each right answer points at the next stone's place, and the last sends you home to Yarn.
    expect(riddleSolvedLine(YARN_STONES[0])).toMatch(/EAST, over the road, to the pool near the top/);
    expect(riddleSolvedLine(YARN_STONES[1])).toMatch(/sandbar/);
    expect(riddleSolvedLine(YARN_STONES[2])).toMatch(/tell Yarn/);
    expect(riddleSolvedLine('juno-walk')).toBeNull();
  });

  it("a stone talked to on its turn asks its riddle — the step finishes only on the answer", () => {
    const save = offered();
    const convo = questConversation('reef-stone-1', save)!;
    expect(convo.finishKind).toBe('riddle');
    expect(convo.riddle).toBe(YARN_STONES[0]);
    expect(convo.finish).toBeNull();
    // Yarn's own reminder talks about herself as "me" (round 2), the quest log's names her.
    expect(questConversation('reef-yarn', save)!.lines).toEqual(['Start with the tale-stone by the little pool, just west of me!']);
    expect(resolveHint(activeStep(byId(YARN_QUEST), save)!, save)).toMatch(/west of Yarn/);
    // Closing the talk without answering leaves the step open.
    expect(activeStep(byId(YARN_QUEST), save)!.id).toBe(YARN_STONES[0]);
  });

  it('a stone out of turn says "not this one yet" and where the next chapter is; one before the quest has nothing to say', () => {
    expect(questConversation('reef-stone-2', { ...defaultSave(), zoneId: 'story-reef' })).toBeNull();
    const early = questConversation('reef-stone-3', offered())!;
    expect(early.finishKind).toBeNull();
    // Said at another stone, so it names the place, not "here" (round 1).
    expect(early.lines[0]).toMatch(/^Not this one yet! The first chapter is on the tale-stone by the little pool west of Yarn/);
    expect(early.lines[0]).not.toMatch(/here/);
  });

  it('answered in order, Yarn pays 45 coins and a Hint Feather', () => {
    let save = offered();
    for (const [i, id] of YARN_STONES.entries()) {
      expect(questConversation(stones[i], save)!.riddle).toBe(id);
      // The right answer (PathQuestionOverlay) finishes the step.
      save = solveRiddle(save, id);
      expect(save.flags[stepFlag(id)]).toBe(true);
    }
    const { coins, items } = save;
    save = converse('reef-yarn', save);
    expect(save.flags[questDoneFlag(byId(YARN_QUEST))]).toBe(true);
    expect(save.coins).toBe(coins + 45);
    expect(save.items.hint).toBe(items.hint + 1);
    // A lit stone is just a stone again.
    expect(questConversation('reef-stone-1', save)).toBeNull();
  });
});

describe('solveRiddle (#75 item 15e, round 1)', () => {
  it('finishes only the riddle step due now — never one out of turn, before the offer or after the quest', () => {
    const fresh = { ...defaultSave(), zoneId: 'story-reef' as const };
    expect(solveRiddle(fresh, YARN_STONES[0])).toBe(fresh); // not offered yet
    const offered = converse('reef-yarn', fresh);
    expect(solveRiddle(offered, YARN_STONES[1])).toBe(offered); // out of turn
    expect(solveRiddle(offered, 'juno-walk')).toBe(offered); // not a riddle
    const one = solveRiddle(offered, YARN_STONES[0]);
    expect(one.flags[stepFlag(YARN_STONES[0])]).toBe(true);
    expect(solveRiddle(one, YARN_STONES[0])).toBe(one); // already done
  });
});
