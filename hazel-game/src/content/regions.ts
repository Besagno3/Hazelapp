import type { ZoneId } from '../types';
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
 * Gearfall and the Coast, and Chromaria last. A place you can walk to early
 * (the Coast is just east of home) can still be a late, tough one — its
 * critters show it ("Lv 4 !!") before you bump into them.
 */
export type DangerTier = 0 | 1 | 2 | 3 | 4;

export interface DangerDef {
  /** The word shown in battle ("Fierce"), or null where nothing needs saying. */
  label: string | null;
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
  /** Its "Lv" label on the map (RGB) — warmer the tougher, alongside the "!" marks. */
  mapColor: [number, number, number];
}

/**
 * Tier 1 is the game's balance before regions existed (Numbria, the first
 * crystal, plays exactly as it did); home ground is a little gentler.
 */
export const DANGER: Record<DangerTier, DangerDef> = {
  0: { label: null, hp: 0.85, attack: 0.85, chargeChance: 0.12, coins: 0.8, xp: 0.9, mapColor: [255, 200, 200] },
  1: { label: null, hp: 1, attack: 1, chargeChance: 0.2, coins: 1, xp: 1, mapColor: [255, 200, 200] },
  2: { label: 'Tough', hp: 1.15, attack: 1.1, chargeChance: 0.25, coins: 1.3, xp: 1.15, mapColor: [255, 226, 120] },
  3: { label: 'Fierce', hp: 1.3, attack: 1.2, chargeChance: 0.3, coins: 1.6, xp: 1.3, mapColor: [255, 170, 80] },
  4: { label: 'Mighty', hp: 1.45, attack: 1.3, chargeChance: 0.35, coins: 2, xp: 1.45, mapColor: [255, 110, 100] },
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
    zones: ['lumina-village', 'dawnreach', 'moonwell-grove', 'dawn-shrine', 'wayfarer-shrine', 'quiet-shrine', 'crystal-spire'],
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

/** "!" marks after a critter's level on the map: none up to tier 1, then one more per tier ("Lv 4 !!"). */
export function dangerMarks(tier: DangerTier = BASE_TIER): string {
  return '!'.repeat(Math.max(0, tier - BASE_TIER));
}

/** A critter's map label: "Lv 4", "👑 Lv 5 !!" — the level is its questions', the marks its danger. */
export function mapLabel(level: number, isBoss: boolean, tier: DangerTier = BASE_TIER): string {
  const marks = dangerMarks(tier);
  return `${isBoss ? '👑 ' : ''}Lv ${level}${marks ? ` ${marks}` : ''}`;
}
