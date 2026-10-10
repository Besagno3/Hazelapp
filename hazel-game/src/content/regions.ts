import type { BattleEnemy, ZoneId } from '../types';
import type { EnemyPlacement } from './zones';

/**
 * Regional difficulty (#75 roadmap item 12): the farther along the journey a
 * place is, the tougher its critters FIGHT — never the harder their questions.
 * An enemy's `level` is still the child's question level for its topic (see
 * `spawnEnemy`); the place's danger tier only scales its HP, its blows, how
 * often it winds up a power move, and what it pays out.
 *
 * Tiers follow the road the story sends you down (the 🚩, `nextObjective`):
 * home ground first, then Numbria and the Woods, Verdara and the Depths,
 * Gearfall and the Coast, and Chromaria last (0–4, Act I); Acts II–IV go on
 * to 5–7 (#75 item 14c), the Silver Shallows first. A place you can walk to
 * early (the Coast is just east of home) can still be a late, tough one — its
 * critters show it ("Lv 4 !!") before you bump into them.
 */
export type DangerTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface DangerDef {
  /** Scales max HP. */
  hp: number;
  /** Scales every blow (before power moves, enrage and defending). */
  attack: number;
  /** Chance a regular enemy starts charging a power move on a turn (`nextIntent`); bosses keep their rhythm. */
  chargeChance: number;
  /** Scales the coins it drops. */
  coins: number;
  /** Scales the bonus XP for beating it. */
  xp: number;
  /**
   * Its "Lv" label on the map (RGB) — warmer the tougher, alongside the "!"
   * marks; past tier 4, where the marks stop at "!!!", violet → magenta.
   */
  mapColor: [number, number, number];
}

/**
 * Tier 1 is the game's balance before regions existed (Numbria, the first
 * crystal, plays exactly as it did); home ground is a little gentler.
 */
export const DANGER: Record<DangerTier, DangerDef> = {
  0: { hp: 0.85, attack: 0.85, chargeChance: 0.12, coins: 0.8, xp: 0.9, mapColor: [255, 200, 200] },
  1: { hp: 1, attack: 1, chargeChance: 0.2, coins: 1, xp: 1, mapColor: [255, 200, 200] },
  2: { hp: 1.15, attack: 1.1, chargeChance: 0.25, coins: 1.3, xp: 1.15, mapColor: [255, 226, 120] },
  3: { hp: 1.3, attack: 1.2, chargeChance: 0.3, coins: 1.6, xp: 1.3, mapColor: [255, 170, 80] },
  4: { hp: 1.45, attack: 1.3, chargeChance: 0.35, coins: 2, xp: 1.45, mapColor: [255, 150, 140] },
  5: { hp: 1.6, attack: 1.4, chargeChance: 0.4, coins: 2.4, xp: 1.6, mapColor: [221, 214, 254] },
  6: { hp: 1.75, attack: 1.5, chargeChance: 0.45, coins: 2.8, xp: 1.75, mapColor: [240, 171, 252] },
  7: { hp: 1.9, attack: 1.6, chargeChance: 0.5, coins: 3.2, xp: 1.9, mapColor: [232, 121, 249] },
};

/** The tier the game was balanced at before regions (tests and hand-built enemies default to it). */
export const BASE_TIER: DangerTier = 1;

export interface RegionDef {
  id: string;
  /** How the region reads in docs and tests ("Verdara and the Depths"). */
  name: string;
  tier: DangerTier;
  zones: ZoneId[];
}

/** Every zone belongs to exactly one region (regions.test). */
export const REGIONS: RegionDef[] = [
  {
    id: 'home',
    name: 'Home ground — Lumina Village and the roads around it',
    tier: 0,
    zones: ['lumina-village', 'dawnreach', 'moonwell-grove', 'dawn-shrine', 'wayfarer-shrine', 'quiet-shrine', 'crystal-spire', 'remembrance-hill'],
  },
  { id: 'numbria', name: 'Numbria and the Whispering Woods', tier: 1, zones: ['numbria', 'whispering-woods'] },
  {
    id: 'verdara',
    name: 'Verdara and the Clockwork Depths',
    tier: 2,
    zones: ['verdara', 'clockwork-depths', 'clockwork-depths-b2', 'clockwork-depths-b3', 'echo-mine'],
  },
  { id: 'gearfall', name: 'Gearfall Canyon and Starfall Coast', tier: 3, zones: ['gearfall', 'starfall-coast'] },
  { id: 'chromaria', name: 'Chromaria', tier: 4, zones: ['chromaria'] },
  // Act II (#75 item 14): the first place past Act I's tiers (#105g, #108d).
  // Its islands share its tier (#75 item 14f: Eldergrove).
  { id: 'shallows', name: 'The Silver Shallows and its islands', tier: 5, zones: ['silver-shallows', 'eldergrove'] },
];

/** The danger tier of a zone (its region's). */
export function zoneTier(zoneId: ZoneId): DangerTier {
  return REGIONS.find((r) => r.zones.includes(zoneId))?.tier ?? BASE_TIER;
}

/**
 * The danger tier of a placed enemy: its own `tier` (an overworld critter
 * roaming beside a far region takes that region's) or its zone's.
 */
export function placementTier(zoneId: ZoneId, p: Pick<EnemyPlacement, 'tier'>): DangerTier {
  return p.tier ?? zoneTier(zoneId);
}

/** The most "!" marks a label shows; tougher tiers change colour instead (`DANGER.mapColor`). */
export const MAX_MARKS = 3;

/**
 * "!" marks after a critter's level, on the map and in battle: none up to
 * tier 1, then one more per tier ("Lv 4 !!"), up to "!!!" (`MAX_MARKS`). A
 * mark means it fights harder than near home — never that its questions are
 * harder.
 */
export function dangerMarks(tier: DangerTier = BASE_TIER): string {
  return '!'.repeat(Math.min(MAX_MARKS, Math.max(0, tier - BASE_TIER)));
}

/** The first tier past the last "!" (5): its marks are coloured, and it reads "Very tough" (#75 item 14c). */
export const VERY_TOUGH_TIER = (BASE_TIER + MAX_MARKS + 1) as DangerTier;

/** A critter's map label: "Lv 4", "👑 Lv 5 !!" — the level is its questions', the marks its danger. */
export function mapLabel(level: number, isBoss: boolean, tier: DangerTier = BASE_TIER): string {
  const marks = dangerMarks(tier);
  return `${isBoss ? '👑 ' : ''}Lv ${level}${marks ? ` ${marks}` : ''}`;
}

/**
 * The line the first battle against a tier's "!" marks opens with, once per
 * tier a session (#75 item 12) — so a child who taps into a fight, never
 * having read the map, still learns what the marks mean. The copy talks
 * about the marks, not distance: tiers follow the story's road, and the
 * Coast is a short walk from home. Past "!!!" the marks only change colour,
 * so tiers 5–7 say what the colour means (#75 item 14c) — once for all
 * three (`toughKey`).
 */
export function toughCallout(tier: DangerTier): string {
  if (tier >= VERY_TOUGH_TIER) {
    return 'See its purple !!! by its level? A very tough critter — it hits even harder than a red !!!, and drops even more coins!';
  }
  return `See the ${dangerMarks(tier)} by its level? Critters with ! marks hit harder — but they drop more coins!`;
}

/** The tier a 💪 line counts as explained under (`battleStore.toughMet`): tiers 5–7 share one line. */
export function toughKey(tier: DangerTier): DangerTier {
  return tier >= VERY_TOUGH_TIER ? VERY_TOUGH_TIER : tier;
}

/** Where the 🚩 is, in the words of the buttons a child can see. */
const FLAG_HINT = 'Open 📜 Menu — the 🚩 on the map shows where to go next!';

/**
 * The defeat screen's tip after losing far from home (#75 item 12), or null.
 * `road` is the tier of the 🚩's road (`roadTier`): a critter tougher than
 * that is off the story's path, so point back to it; one on it eases off
 * after a couple of losses (mercy), so say so — unless it already has.
 */
export function defeatTip(enemy: Pick<BattleEnemy, 'name' | 'tier' | 'eased'>, road: DangerTier | null): string | null {
  const tier = enemy.eased ?? enemy.tier ?? BASE_TIER;
  const marks = dangerMarks(tier);
  if (!marks) return null;
  if (road !== null && tier > road) {
    // An eased fight was a gentle one: don't call it tough, just point the way.
    return enemy.eased !== undefined ? FLAG_HINT : `${enemy.name} is extra tough (see its ${marks}). ${FLAG_HINT}`;
  }
  if (enemy.eased !== undefined) return null;
  return 'Critters with ! marks hit hard. Keep at it — after a couple of tries, they go easier on you!';
}

/** How many tiers past the 🚩's road a place is before arriving there warns you. */
export const WARN_AHEAD = 2;

/**
 * A toast on first arriving somewhere far tougher than the 🚩's road (#75
 * item 12) — the Coast is a short walk from home but a late, fierce place.
 */
export function arrivalWarning(tier: DangerTier, road: DangerTier | null): string | null {
  if (road === null || tier - road < WARN_AHEAD) return null;
  return `⚔️ Critters here are extra tough (see the ${dangerMarks(tier)})! ${FLAG_HINT}`;
}
