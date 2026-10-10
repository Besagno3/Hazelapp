import type { Topic, ZoneId } from '../types';
import { HUB_ZONE, litFlag, type ZoneDef } from './zones';
import { TOPIC_REGISTRY, crystalFlag } from './topics';

/**
 * Field spells (#75 item 9): magic for out in the world, not for battle.
 * Each is learned at its own roadside shrine by passing the keeper's short
 * question trial, and cast from the 📜 Menu. Knowing one is a story flag
 * (`fieldSpellFlag`), so a save needs no new field — older saves simply know
 * none yet.
 *
 *   🏠 Return — fly to any town you've been to (DQ's Zoom / Chimaera Wing).
 *   🔆 Glow   — light a dark place for good; one cave can't be explored without it.
 *   🕊️ Calm   — roaming critters leave you be for a minute (bosses don't).
 */
export const FIELD_SPELL_IDS = ['return', 'glow', 'calm'] as const;
export type FieldSpellId = (typeof FIELD_SPELL_IDS)[number];

/** How long Calm keeps the critters away (seconds of play; paused with the world). */
export const CALM_SECONDS = 60;
/** Right answers a shrine trial asks for. A wrong answer just brings another question. */
export const TRIAL_CORRECT = 3;
/** Questions fetched at a time for a trial (another batch comes if they run out). */
export const TRIAL_BATCH = 5;

export interface FieldSpell {
  id: FieldSpellId;
  name: string;
  emoji: string;
  /** One kid-friendly line for the menu. */
  description: string;
  /** The shrine that teaches it, and its keeper, who runs the trial. */
  shrine: ZoneId;
  keeper: string;
  /** The trial's questions are on this topic. */
  topic: Topic;
  /** Shown once it's learned: how to cast it. */
  howTo: string;
}

export const FIELD_SPELLS: Record<FieldSpellId, FieldSpell> = {
  return: {
    id: 'return',
    name: 'Return',
    emoji: '🏠',
    description: "Fly back to any town you've been to.",
    shrine: 'wayfarer-shrine',
    keeper: 'wayfarer-keeper',
    topic: 'space',
    howTo: 'Open your 📜 Menu, find ✨ Field spells and pick a town — whoosh, you’re there!',
  },
  glow: {
    id: 'glow',
    name: 'Glow',
    emoji: '🔆',
    description: 'Light up a dark place — and it stays lit.',
    shrine: 'dawn-shrine',
    keeper: 'shrine-keeper',
    topic: 'science',
    howTo: 'In a dark place, tap 🔆 Glow at the top of the screen, or cast it from your 📜 Menu.',
  },
  calm: {
    id: 'calm',
    name: 'Calm',
    emoji: '🕊️',
    description: `Critters let you pass for ${CALM_SECONDS} seconds. (Bosses still won't!)`,
    shrine: 'quiet-shrine',
    keeper: 'quiet-keeper',
    topic: 'nature',
    howTo: 'Cast it from your 📜 Menu before a long walk — critters will let you pass for a minute.',
  },
};

/** Save flag: the hero knows this field spell. */
export function fieldSpellFlag(id: FieldSpellId): string {
  return `spell:${id}`;
}

export function knowsFieldSpell(id: FieldSpellId, flags: Record<string, boolean>): boolean {
  return flags[fieldSpellFlag(id)] === true;
}

/** The spell a shrine keeper teaches, if they are one. */
export function fieldSpellTaughtBy(npcId: string | null): FieldSpell | undefined {
  return FIELD_SPELL_IDS.map((id) => FIELD_SPELLS[id]).find((s) => s.keeper === npcId);
}

/** A field spell being cast (#75 item 9) — from the menu, or Glow from the HUD. */
export type FieldCast = { spell: 'return'; to: ZoneId } | { spell: 'glow' } | { spell: 'calm' };

/** Can Glow be cast here — a dark place not lit yet? */
export function canGlow(z: ZoneDef, flags: Record<string, boolean>): boolean {
  return !!z.dark && !flags[litFlag(z.id)];
}

// --- Return ----------------------------------------------------------------------

/** Save flag: the hero has been to this zone (set on arrival). */
export function visitedFlag(zoneId: ZoneId): string {
  return `visited:${zoneId}`;
}

/** The towns Return flies to: home and the four crystal regions. */
export const RETURN_TOWNS: readonly ZoneId[] = ['lumina-village', 'numbria', 'verdara', 'gearfall', 'chromaria', 'remembrance-hill'];

/**
 * Has the hero been here? Home always counts. Visits are only recorded since
 * #75 item 9, so for an older save a crystal restored in a town counts too.
 */
export function hasVisited(zoneId: ZoneId, flags: Record<string, boolean>): boolean {
  if (zoneId === HUB_ZONE || flags[visitedFlag(zoneId)]) return true;
  const crystal = TOPIC_REGISTRY.find((t) => t.zoneId === zoneId);
  return !!crystal && flags[crystalFlag(crystal.id)] === true;
}

/**
 * Where Return sets you down in a town: home's plaza, or for any other town
 * just inside its front door — where walking in from Dawnreach would put you.
 */
export function returnLanding(zones: Record<ZoneId, ZoneDef>, zoneId: ZoneId): { x: number; y: number } {
  if (zoneId === HUB_ZONE) return zones[zoneId].spawn;
  const door = Object.values(zones)
    .filter((z) => z.kind === 'overworld')
    .flatMap((z) => z.exits)
    .find((e) => e.to === zoneId);
  return door ? { x: door.spawnX, y: door.spawnY } : zones[zoneId].spawn;
}

export interface ReturnSpot {
  zoneId: ZoneId;
  name: string;
  /** The landing cell. */
  x: number;
  y: number;
}

/** The towns Return can fly to right now (the ones visited), in a fixed order. */
export function returnSpots(zones: Record<ZoneId, ZoneDef>, flags: Record<string, boolean>): ReturnSpot[] {
  return RETURN_TOWNS.filter((id) => hasVisited(id, flags)).map((id) => ({
    zoneId: id,
    name: zones[id].name,
    ...returnLanding(zones, id),
  }));
}
