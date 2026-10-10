/**
 * Saves as each build wrote them (#75 item 14b) — what "old saves still load"
 * is tested against (save.test, saveStore.test). Each is rebuilt from that
 * build's `defaultSave` / `SaveData` (the commit is named), standing where a
 * player of the time could stand, with the story that far along. None was
 * captured from a real player (ISSUES #110f).
 */

const TILE = 32;
const centre = (x: number, y: number) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
const ITEMS = { potion: 2, hint: 1, elixir: 0, spark: 0, ward: 0, clover: 0, tea: 0, snack: 0, coil: 0, mirror: 0 };

/** v1, before the overworld's save bump: standing on the retired Lumina Field (#75 item 8). */
export const V1 = {
  version: 1,
  avatarId: 'a1',
  zoneId: 'lumina-field',
  pos: { x: 336, y: 368 },
  hp: 80,
  coins: 120,
  items: { ...ITEMS },
  badges: ['badge-numbria'],
  sages: ['math'],
  sageEquipped: 'math',
  flags: { 'crystal-math-restored': true, 'intro-seen': true },
  openedChests: ['numbria:chest:12,4', 'dawnreach:chest:13,9'],
  kills: { 'count-bat': 1 },
  questItems: [],
  passedRounds: 3,
  worldUnlocked: true,
  library: [],
  companionId: 'ember',
  defendTimer: true,
};

/**
 * v2 from its first build (fbd8e83, item 8): no `save:v2` marker yet (ae1c1b4
 * added it), no `lastRest`, no boat. Out on Dawnreach's open road after
 * Numbria's crystal — it must load where it stands, not be shifted again.
 */
export const V2_FIRST_BUILD = {
  version: 2,
  avatarId: 'a1',
  zoneId: 'dawnreach',
  pos: centre(48, 36),
  hp: 70,
  coins: 85,
  items: { ...ITEMS },
  badges: ['badge-numbria'],
  sages: ['math'],
  flags: {
    'intro-seen': true,
    'dawnreach-seen': true,
    'ember-hatched': true,
    'crystal-math-restored': true,
    'crystal-math-scene-seen': true,
  },
  openedChests: ['numbria:chest:12,4'],
  kills: { 'count-bat': 2 },
  questItems: [],
  passedRounds: 4,
  worldUnlocked: true,
  library: [],
  companionId: 'ember',
  defendTimer: true,
};

/**
 * v2 after the field spells (dfd3d5c, item 9), before real dungeons (item
 * 10): in the Clockwork Depths' gated vault (its gatekeeper answered), on
 * the cell where item 10 later drew the stairs down — Glow learned, the Echo
 * Mine lit, the Verdant Key won, Verdara freed. No `lastRest` yet (item 11).
 */
export const V2_PRE_ITEM10 = {
  version: 2,
  avatarId: 'a3',
  zoneId: 'clockwork-depths',
  pos: centre(19, 10),
  hp: 64,
  coins: 210,
  items: { ...ITEMS, elixir: 1 },
  badges: ['badge-numbria', 'verdara-key'],
  sages: ['math', 'science'],
  flags: {
    'save:v2': true,
    'intro-seen': true,
    'dawnreach-seen': true,
    'ember-hatched': true,
    'crystal-math-restored': true,
    'crystal-science-restored': true,
    'key-verdara-key': true,
    'spell:glow': true,
    'spell:return': true,
    'visited:numbria': true,
    'visited:verdara': true,
    'visited:clockwork-depths': true,
    'lit:echo-mine': true,
    // The vault's gatekeeper, answered (its gate is the 'GG' on row 8).
    'gate:clockwork-depths:gate:10,8': true,
  },
  openedChests: ['numbria:chest:12,4'],
  kills: { 'count-bat': 3, 'bolt-mouse': 1 },
  questItems: [],
  passedRounds: 6,
  worldUnlocked: true,
  library: [],
  companionId: 'pip',
  defendTimer: true,
};

/**
 * v2 with inns everywhere (69de256, item 11), before the boat (item 14a):
 * resting at Numbria's inn set `lastRest`; no `boat` / `aboard`. In Verdara,
 * three crystals down, off to the Prism Key next.
 */
export const V2_PRE_14A = {
  version: 2,
  avatarId: 'a1',
  zoneId: 'verdara',
  pos: centre(10, 12),
  hp: null,
  coins: 340,
  items: { ...ITEMS },
  badges: ['badge-numbria', 'verdara-key', 'gearfall-key'],
  sages: ['math', 'science', 'engineering'],
  flags: {
    'save:v2': true,
    'intro-seen': true,
    'dawnreach-seen': true,
    'ember-hatched': true,
    'crystal-math-restored': true,
    'crystal-science-restored': true,
    'crystal-engineering-restored': true,
    'key-verdara-key': true,
    'key-gearfall-key': true,
    'visited:numbria': true,
    'visited:verdara': true,
    'visited:gearfall': true,
  },
  openedChests: [],
  kills: {},
  questItems: [],
  passedRounds: 8,
  worldUnlocked: true,
  library: [],
  companionId: 'ember',
  defendTimer: false,
  lastRest: 'numbria',
};

/** v2 as written today (item 14a): Act II, sailing Marlow's boat on the Silver Shallows. */
export const CURRENT_ABOARD = {
  ...V2_PRE_14A,
  zoneId: 'silver-shallows',
  pos: centre(3, 22),
  flags: {
    ...V2_PRE_14A.flags,
    'crystal-creativity-restored': true,
    'key-chromaria-key': true,
    'spire-cleared': true,
    'spire-victory-seen': true,
    'act2-seen': true,
    'quest:marlows-boat:done': true,
    'first-voyage-seen': true,
    'visited:silver-shallows': true,
  },
  lastRest: 'lumina-village',
  boat: null,
  aboard: true,
};

/**
 * Beat Umbra on a build before the walk home (item 14a): the finale seen,
 * Act II not — still standing in the Spire's grounds.
 */
export const FINALE_NOT_ACT2 = {
  ...V2_PRE_14A,
  zoneId: 'crystal-spire',
  pos: centre(10, 2),
  flags: {
    ...V2_PRE_14A.flags,
    'crystal-creativity-restored': true,
    'key-chromaria-key': true,
    'spire-cleared': true,
    'spire-victory-seen': true,
  },
};
