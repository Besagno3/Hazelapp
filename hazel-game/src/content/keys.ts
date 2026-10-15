import type { BossRole, Topic, ZoneId } from '../types';
import { crystalFlag } from './topics';

/**
 * Warden bosses & gate keys (#58). Each of the three themed expansion zones
 * holds a **warden boss**; beating it drops a **key** that unlocks the Fiend's
 * gate in one crystal zone — so three of the four Fiends are now gated behind a
 * themed-zone challenge (Numbria/math stays open as the guaranteed first crystal).
 *
 * Possession of a key is the flag `keyFlag(id)`; the same id is also pushed to
 * `save.badges` as a trophy. The crystal zone's Fiend gate (`ZoneDef.keyGate`)
 * checks the key instead of asking a gatekeeper question.
 *
 * Each key is named for the **crystal zone it unlocks** (its destination, which
 * is the zone that awards the crystal) — not the warden's home zone, which has
 * no crystal of its own: woods warden→Verdant Key (Verdara), clockwork
 * warden→Gearwright Key (Gearfall), starfall warden→Prism Key (Chromaria).
 *
 * Act II (#75 item 14f): the Ringkeeper of Eldergrove gives the **Memoria
 * Key**, which opens the Hollow Fiend's silver door in the Sunken Archive
 * (#75 item 14h — until then it had no gate on any map). Act III (#75 items
 * 15d–15g): the Compass Golem and the Riddle Leviathan each give one of the
 * two **Chorus Keys**; the Hush Fiend's gate on Chorus Isle needs both
 * (`keysForZone`, `holdsKeysFor`).
 */
export interface GateKey {
  id: string;
  /** Key item display name. */
  name: string;
  emoji: string;
  /** The warden boss enemy def id that drops this key. */
  bossId: string;
  /** Warden boss display name (matches its EnemyDef name). */
  bossName: string;
  /** Warden monologue before the fight (one box at a time). */
  bossIntro: string[];
  /** Warden's last words on the victory panel. */
  bossDefeat: string;
  /** The themed zone the warden lives in (for "go beat X" hints). */
  fromZone: ZoneId;
  /**
   * The crystal zone whose Fiend gate this key unlocks — null while that zone
   * isn't built yet (the Chorus Keys were, #75 items 15d–15f, until Chorus
   * Isle, 15g). Two keys may share a zone: its gate then needs both
   * (`keysForZone`).
   */
  unlocksZone: ZoneId | null;
  /** What the key opens, for its victory panel, when "It unlocks X's gate" isn't the whole story (one of two keys). */
  opens?: string;
  /** That zone's Fiend, named in the locked-gate message. */
  fiendName: string;
  /** What its gate is called when bumped, if not a "gate" (the Archive's silver door, #75 item 14h review). */
  door?: string;
}

export const GATE_KEYS: GateKey[] = [
  {
    id: 'verdara-key',
    name: 'Verdant Key',
    emoji: '🌿',
    bossId: 'thicket-warden',
    bossName: 'The Thicket Warden',
    bossIntro: [
      'A wall of living bramble heaves itself upright. The Thicket Warden has guarded this grove since before the fog.',
      '"You smell of crystals, little one. The road to Verdara is MINE to give. Answer my thorns — or turn back."',
    ],
    bossDefeat: '"Heh… roots that bend… do not break. Take the Verdant Key, and go free Verdara from the smog."',
    fromZone: 'whispering-woods',
    unlocksZone: 'verdara',
    fiendName: 'the Smog Fiend',
  },
  {
    id: 'gearfall-key',
    name: 'Gearwright Key',
    emoji: '⚙️',
    bossId: 'clockwork-titan',
    bossName: 'The Clockwork Titan',
    bossIntro: [
      'Gears the size of windmills grind awake. The Clockwork Titan was wound up long ago and never told to stop.',
      '"DEFINITION: intruder. The way to Gearfall stays locked until you prove your cogs turn true. Compute, child."',
    ],
    bossDefeat: '"Re…calculating… you were the missing piece all along. Take the Gearwright Key and wind the Rust Fiend down for me."',
    // At the bottom of the Depths since they became a dungeon (#75 item 10).
    fromZone: 'clockwork-depths-b3',
    unlocksZone: 'gearfall',
    fiendName: 'the Rust Fiend',
  },
  {
    id: 'chromaria-key',
    name: 'Prism Key',
    emoji: '🌈',
    bossId: 'tide-colossus',
    bossName: 'The Tide Colossus',
    bossIntro: [
      'The sea stands up. The Tide Colossus has carried a fallen star on its back for a thousand quiet years.',
      '"The way to Chromaria runs through ME, stargazer. Show me the colors of a clever mind, or sink back to the sand."',
    ],
    bossDefeat: '"…bright. So bright. Take the Prism Key, and give the Gray Fiend back the colors it forgot."',
    fromZone: 'starfall-coast',
    unlocksZone: 'chromaria',
    fiendName: 'the Gray Fiend',
  },
  // Act II (#75 item 14f): the Ringkeeper of Eldergrove keeps the key to the
  // Sunken Archive's silver door (#75 item 14h). Named for memory, not its
  // zone, as STORY-4X's flag `key-memoria` has it.
  {
    id: 'memoria',
    name: 'Memoria Key',
    emoji: '🗝️',
    bossId: 'ringkeeper',
    bossName: 'The Ringkeeper',
    bossIntro: [
      'The great stag by the old stump lifts its head. Its bark is ringed like an ancient tree, and a silver key hangs from its antlers.',
      '"Every ring is a year, and every year is MINE. You want the Memoria Key, little spark? Then tell me about the long-ago!"',
    ],
    bossDefeat: '"…take the key. Some years are meant to be given away."',
    fromZone: 'eldergrove',
    unlocksZone: 'sunken-archive',
    fiendName: 'the Hollow Fiend',
    door: 'silver door',
  },
  // Act III (#75 item 15d): the Compass Golem of the Wayfinder Isles keeps one
  // of the two keys to Chorus Isle's double gate (#75 item 15g). Named as
  // STORY-4X has it, `key-chorus-a`.
  {
    id: 'chorus-a',
    name: 'First Chorus Key',
    emoji: '🎹',
    bossId: 'compass-golem',
    bossName: 'The Compass Golem',
    bossIntro: [
      'In the middle of the stone circle, a great stone figure creaks awake. A compass needle spins on its chest.',
      '"ALL directions lead to ME, little traveler. You want the First Chorus Key? Then tell me where in the world things ARE!"',
    ],
    bossDefeat: '"…north was… that way… all along. Take the key, little traveler."',
    fromZone: 'wayfinder-isles',
    unlocksZone: 'chorus-isle',
    opens: "It's one of the two Chorus Keys. Together they open the Hush Fiend's gate on Chorus Isle!",
    fiendName: 'the Hush Fiend',
  },
  // Act III (#75 item 15e): the Riddle Leviathan of Inkwell Cove keeps the
  // other key to Chorus Isle's double gate (#75 item 15g). It speaks only in
  // riddles — its defeat line too (STORY-4X). `key-chorus-b`.
  {
    id: 'chorus-b',
    name: 'Second Chorus Key',
    emoji: '🎶',
    bossId: 'riddle-leviathan',
    bossName: 'The Riddle Leviathan',
    bossIntro: [
      'The black water by the point bubbles. A huge whale heaves itself up onto the sand, dripping words. A silver key glints on its tail.',
      '"What has a key, but opens no lock?" it rumbles. "A PIANO! Ha! But MY key opens a gate. Answer my word-riddles, little reader, and it\'s yours!"',
    ],
    bossDefeat: '"What has been beaten, yet feels lighter? …Me. Take the key, little reader."',
    fromZone: 'inkwell-cove',
    unlocksZone: 'chorus-isle',
    opens: "It's one of the two Chorus Keys. Together they open the Hush Fiend's gate on Chorus Isle!",
    fiendName: 'the Hush Fiend',
  },
];

/** The key dropped by beating a given warden boss (by enemy def id). */
export function keyForBoss(bossId: string): GateKey | undefined {
  return GATE_KEYS.find((k) => k.bossId === bossId);
}

/** The key required to open a given crystal zone's Fiend gate (the first, where it takes two). */
export function keyForZone(zoneId: ZoneId | null): GateKey | undefined {
  return keysForZone(zoneId)[0];
}

/**
 * Every key a crystal zone's Fiend gate needs (#75 item 15g): one, or — Chorus
 * Isle's — both Chorus Keys. The gate opens only once all of them are held.
 */
export function keysForZone(zoneId: ZoneId | null): GateKey[] {
  return zoneId ? GATE_KEYS.filter((k) => k.unlocksZone === zoneId) : [];
}

/** Does the hero hold every key this zone's Fiend gate needs? (False where there's no keyed gate.) */
export function holdsKeysFor(zoneId: ZoneId | null, flags: Record<string, boolean>): boolean {
  const keys = keysForZone(zoneId);
  return keys.length > 0 && keys.every((k) => flags[keyFlag(k.id)] === true);
}

/** Save-flag set when the player holds a key. */
export function keyFlag(id: string): string {
  return `key-${id}`;
}

/** Set when a boss that restores nothing and holds no key is beaten (#75 item 14c): a miniboss, an echo, the finale. */
export function bossFlag(enemyId: string): string {
  return `boss:${enemyId}:defeated`;
}

/**
 * Whether a boss is permanently beaten (so the world stops spawning it), by
 * its role (#75 item 14c): a Fiend once its crystal is restored, a warden once
 * its key is held, any other boss once its own `bossFlag` is set — never on
 * another boss's crystal.
 */
export function bossDefeated(
  boss: { id: string; topic: Topic; role?: BossRole },
  flags: Record<string, boolean>,
): boolean {
  if (boss.role === 'fiend') return flags[crystalFlag(boss.topic)] === true;
  const key = keyForBoss(boss.id);
  if (key) return flags[keyFlag(key.id)] === true;
  return flags[bossFlag(boss.id)] === true;
}
