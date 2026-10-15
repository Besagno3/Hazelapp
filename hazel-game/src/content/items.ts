/**
 * The coin economy + shops (#37; per-shop stock since #73). Every merchant
 * runs their own store, and every item is sold in exactly ONE place — so each
 * town is worth visiting — except the `SHARED_STOCK` staples, which have
 * more sellers so a hero far from Lumina Village can restock (items.test
 * enforces both rules). All tuning numbers live here.
 */

/** Carried consumables. The save stores a count for each id. */
export const CONSUMABLE_IDS = ['potion', 'hint', 'elixir', 'spark', 'ward', 'clover', 'tea', 'snack', 'coil', 'mirror', 'knot', 'candle'] as const;
export type ConsumableId = (typeof CONSUMABLE_IDS)[number];

export interface ShopItem {
  id: ConsumableId | `badge:${string}`;
  name: string;
  emoji: string;
  description: string;
  price: number;
}

/** HP restored by one Berry Potion (usable as a battle item). */
export const POTION_HEAL = 50;
/** Charge (◆) granted by a Spark Cell in battle. */
export const SPARK_CHARGE = 2;
/** HP restored by a Sunseed Snack (it also adds 1 ◆ charge). */
export const SNACK_HEAL = 30;
/** Coin multiplier for a battle won under a Lucky Clover. */
export const CLOVER_COIN_MULT = 2;
/** Damage multiplier for the next Attack after a Focus Tea. */
export const TEA_DAMAGE_MULT = 2;

/**
 * Staples sold in more than one shop (everything else: one), always at one price.
 * Berry Potions: Maple's Trading Post (Lumina Village), Tadpole's Tonics
 * (Verdara) and, on the far continent, Wick-Wax's Candle Shop (Port Lantern, #75 item 15c)
 * and Tass's Kite Stall (Gale Atoll, an island with no inn — #75 item 15d review).
 * Glimmer Candles: Slosh's Raft Shop (Foglight Marsh) and Wick-Wax's (#75 item 15d review —
 * the Latitude Cats on the Wayfinder Isles are slippery too).
 * Glimmer Candles too at Sotto's Whisper Shop (the Quiet Quarter, #75 item 15f), a short
 * flight from the Wayfinder Isles' slippery Latitude Cats.
 * Berry Potions and Hint Feathers: Barnacle Bess's Shell Shop (Inkwell Cove, #75 item 15e)
 * too — the Riddle Leviathan's riddles are twisty, and Plus's Quill & Count is a sea away.
 */
export const SHARED_STOCK: readonly ConsumableId[] = ['potion', 'candle', 'hint'];

/** Display info for each consumable (inventory, battle Items menu). */
export const CONSUMABLES: Record<ConsumableId, { name: string; emoji: string; description: string }> = {
  potion: { name: 'Berry Potion', emoji: '🧪', description: `Restores ${POTION_HEAL} HP.` },
  hint: { name: 'Hint Feather', emoji: '🪶', description: 'Removes two wrong answers from one question.' },
  elixir: { name: 'Honey Elixir', emoji: '🍯', description: 'Restores ALL your HP.' },
  spark: { name: 'Spark Cell', emoji: '🔋', description: `Adds ${SPARK_CHARGE} ◆ charge for spells.` },
  ward: { name: 'Rainbow Ward', emoji: '🌈', description: "Blocks the enemy's next hit completely." },
  clover: { name: 'Lucky Clover', emoji: '🍀', description: `Win this battle for ${CLOVER_COIN_MULT}× the coins.` },
  tea: { name: 'Focus Tea', emoji: '🍵', description: `Your next Attack deals ${TEA_DAMAGE_MULT}× damage.` },
  snack: { name: 'Sunseed Snack', emoji: '🌻', description: `Restores ${SNACK_HEAL} HP and adds 1 ◆ charge.` },
  coil: { name: 'Turbo Coil', emoji: '🌀', description: 'Fills your ◆ charge all the way up.' },
  mirror: { name: 'Mirror Charm', emoji: '🪞', description: "Bounces the enemy's next hit back at it." },
  // Act II (#75 item 14e): Trader Knack's — tie it on and you won't forget the answer twice.
  knot: { name: 'Forget-Me-Knot', emoji: '🎗️', description: 'Your next wrong answer in this battle gets a second try.' },
  // Act II (#75 item 14g): Ferryman Slosh's — a light no trickster can play games with.
  candle: { name: 'Glimmer Candle', emoji: '🕯️', description: "Light it in a battle: a free hint, and slippery critters like Bog Lanterns can't block your Hint Feathers." },
};

/** Consumables that can be used from the battle Items menu (not Hint Feathers). */
export const BATTLE_ITEMS: readonly ConsumableId[] = ['potion', 'elixir', 'snack', 'spark', 'coil', 'ward', 'mirror', 'tea', 'clover', 'knot', 'candle'];

function stock(id: ConsumableId, price: number): ShopItem {
  return { id, ...CONSUMABLES[id], price };
}

export interface ShopDef {
  /** The store's sign name, e.g. "Maple's Trading Post". */
  name: string;
  emoji: string;
  items: ShopItem[];
}

/** One store per merchant NPC (keyed by the NPC id). */
export const SHOPS: Record<string, ShopDef> = {
  'hub-merchant': {
    name: "Maple's Trading Post",
    emoji: '🦝',
    items: [
      stock('potion', 30),
      { id: 'badge:compass', name: 'Compass Badge', emoji: '🧭', description: 'For brave explorers of Lumina.', price: 80 },
    ],
  },
  'numbria-merchant': {
    name: "Plus's Quill & Count",
    emoji: '🦊',
    items: [
      stock('hint', 25),
      { id: 'badge:abacus', name: 'Abacus Badge', emoji: '🧮', description: 'Counts as one very shiny badge.', price: 90 },
    ],
  },
  'verdara-merchant': {
    name: "Tadpole's Tonics",
    emoji: '🐸',
    items: [
      stock('potion', 30), // second potion seller (SHARED_STOCK)
      stock('elixir', 70),
      { id: 'badge:leaf', name: 'Leaf Badge', emoji: '🍃', description: 'Grown, not made. Probably.', price: 90 },
    ],
  },
  'gearfall-merchant': {
    name: "Volt's Gadgets",
    emoji: '🐹',
    items: [
      stock('spark', 45),
      { id: 'badge:gear', name: 'Gear Badge', emoji: '⚙️', description: 'Still ticking, somehow.', price: 90 },
    ],
  },
  'chromaria-merchant': {
    name: "Swirl's Paint & Charms",
    emoji: '🐙',
    items: [
      stock('ward', 40),
      { id: 'badge:palette', name: 'Palette Badge', emoji: '🎨', description: 'Every colour at once!', price: 90 },
    ],
  },
  // Port Lantern (#75 item 15c): the far continent's Berry Potions — a long way from home.
  'port-merchant': {
    name: "Wick-Wax's Candle Shop",
    emoji: '🕯️',
    items: [
      stock('potion', 30), // third potion seller (SHARED_STOCK)
      stock('candle', 40), // a second candle seller (SHARED_STOCK)
      { id: 'badge:harbor', name: 'Harbor Light Badge', emoji: '⚓', description: 'A little anchor with a glowing lantern on it. Ships find their way home by its light.', price: 120 },
    ],
  },
  // Taleshore I (#75 item 15d): Tass's kite stall on windy Gale Atoll.
  'gale-tass': {
    name: "Tass's Kite Stall",
    emoji: '🪁',
    items: [
      stock('potion', 30), // a fourth potion seller, far out at sea (SHARED_STOCK, 15d review)
      { id: 'badge:kite', name: 'Kite Badge', emoji: '🪁', description: 'A tiny kite that flaps whenever the wind blows. So, always.', price: 110 },
    ],
  },
  // Taleshore III (#75 item 15f): Sotto sells secrets — mostly recipes, as collectible badges.
  'quiet-sotto': {
    name: "Sotto's Whisper Shop",
    emoji: '🗣️',
    items: [
      stock('candle', 40), // a third candle seller (SHARED_STOCK)
      { id: 'badge:recipe-soup', name: 'Secret: Fog Soup', emoji: '🍲', description: "The Driftlight Inn's fish soup. Why 'fog'? Nobody can see the fish. Shh!", price: 60 },
      { id: 'badge:recipe-pie', name: 'Secret: Starfall Pie', emoji: '🥧', description: 'Bake it under a full moon. Or a lamp. A lamp is fine.', price: 60 },
      { id: 'badge:recipe-tea', name: 'Secret: Hush Tea', emoji: '🫖', description: 'Steep it quietly. If it hears you, it goes bitter.', price: 60 },
    ],
  },
  // Taleshore II (#75 item 15e): Barnacle Bess's shell shop in Inkwell Cove.
  'ink-bess': {
    name: "Bess's Shell Shop",
    emoji: '🐚',
    items: [
      stock('potion', 30), // a fifth potion seller (SHARED_STOCK)
      stock('hint', 25), // a second Hint Feather seller (SHARED_STOCK)
      { id: 'badge:shell', name: 'Barnacle Badge', emoji: '🐚', description: 'A shell with a barnacle on it. The barnacle came free.', price: 110 },
    ],
  },
  // Act II (#75 item 14e): Trader Knack's "pre-remembered" goods on Remembrance Hill.
  'hill-merchant': {
    name: "Knack's Pre-Remembered Goods",
    emoji: '🧳',
    items: [
      stock('knot', 35),
      { id: 'badge:forgetmenot', name: 'Forget-Me-Not Badge', emoji: '🌼', description: "You won't forget this one. Probably.", price: 100 },
    ],
  },
  // Act II (#75 item 14g): Ferryman Slosh's raft shop by Foglight Marsh's landing.
  'marsh-slosh': {
    name: "Slosh's Raft Shop",
    emoji: '⛵',
    items: [
      stock('candle', 40),
      { id: 'badge:lily', name: 'Lily Pad Badge', emoji: '🪷', description: 'Floats. Mostly.', price: 100 },
    ],
  },
  'village-shopkeeper': {
    name: "Clove's Curios",
    emoji: '🏮',
    items: [
      { id: 'badge:star', name: 'Star Badge', emoji: '⭐', description: 'A shiny badge for your collection.', price: 100 },
      { id: 'badge:lantern', name: 'Lantern Badge', emoji: '🏮', description: 'Glows a little when you smile at it.', price: 120 },
      { id: 'badge:moon', name: 'Moon Badge', emoji: '🌙', description: 'A mysterious badge for your collection.', price: 150 },
    ],
  },
  // --- Village expansion: one new shop per town, each with its own item ---
  'village-clover-merchant': {
    name: "Clover's Market",
    emoji: '🧺',
    items: [
      stock('clover', 35),
      { id: 'badge:clover', name: 'Clover Badge', emoji: '🍀', description: 'Four leaves, zero bad luck.', price: 110 },
    ],
  },
  'numbria-tea-merchant': {
    name: "Chai's Tea Room",
    emoji: '🍵',
    items: [
      stock('tea', 40),
      { id: 'badge:teacup', name: 'Teacup Badge', emoji: '☕', description: 'Pinky out, hero.', price: 90 },
    ],
  },
  'verdara-seed-merchant': {
    name: 'Sunseed Stand',
    emoji: '🌻',
    items: [
      stock('snack', 35),
      { id: 'badge:sunflower', name: 'Sunflower Badge', emoji: '🌻', description: 'Always faces the sunny side.', price: 90 },
    ],
  },
  'gearfall-coil-merchant': {
    name: 'Coil & Spring',
    emoji: '🔩',
    items: [
      stock('coil', 60),
      { id: 'badge:bolt', name: 'Bolt Badge', emoji: '🔩', description: 'Tightly fastened to awesome.', price: 90 },
    ],
  },
  'chromaria-mirror-merchant': {
    name: 'Mirror Hall',
    emoji: '🪞',
    items: [
      stock('mirror', 55),
      { id: 'badge:mirror', name: 'Mirror Badge', emoji: '🪞', description: 'Looks exactly like you. Handsome!', price: 90 },
    ],
  },
};

/** Every item sold anywhere, once each (badge emoji lookups etc.). */
export const ALL_SHOP_ITEMS: ShopItem[] = [
  ...new Map(Object.values(SHOPS).flatMap((s) => s.items).map((i) => [i.id, i])).values(),
];

/** The store a merchant runs (null for a non-merchant). */
export function shopFor(npcId: string | null): ShopDef | null {
  return (npcId && SHOPS[npcId]) || null;
}

/** Coins dropped by a regular enemy of a given level. */
export function enemyCoinDrop(level: number): number {
  return 10 + level * 3;
}

/** Coins dropped by a Fiend (boss). */
export function bossCoinDrop(level: number): number {
  return 60 + level * 10;
}

/** Coins inside a question-locked treasure chest. */
export const CHEST_COINS = 25;

/** Bonus XP for re-answering a missed question correctly at the Library. */
export const LIBRARY_XP = 15;

/** Cap on the Library queue — oldest misses fall off first. */
export const LIBRARY_MAX = 20;
