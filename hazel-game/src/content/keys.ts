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
 * Key**, whose gate — the Sunken Archive's — isn't on any map until 14h
 * (`unlocksZone: null`); winning it says what it `opens` instead.
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
   * The crystal zone whose Fiend gate this key unlocks — null while that gate
   * isn't on any map yet (the Memoria Key's Sunken Archive comes in #75 item 14h).
   */
  unlocksZone: ZoneId | null;
  /** That zone's Fiend, named in the locked-gate message. */
  fiendName: string;
  /** What winning it says the key opens, while its gate isn't on any map yet (`unlocksZone` null). */
  opens?: string;
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
  // Sunken Archive, whose gate comes with the Archive itself (14h). Named for
  // memory, not its zone, as STORY-4X's flag `key-memoria` has it.
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
    unlocksZone: null,
    fiendName: 'the Hollow Fiend',
    opens: 'It opens a door the whole world forgot.',
  },
];

/** The key dropped by beating a given warden boss (by enemy def id). */
export function keyForBoss(bossId: string): GateKey | undefined {
  return GATE_KEYS.find((k) => k.bossId === bossId);
}

/** The key required to open a given crystal zone's Fiend gate. */
export function keyForZone(zoneId: ZoneId): GateKey | undefined {
  // Never the Memoria Key's null (#75 item 14f): `strict` is off, so a null zone type-checks.
  return zoneId ? GATE_KEYS.find((k) => k.unlocksZone === zoneId) : undefined;
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
