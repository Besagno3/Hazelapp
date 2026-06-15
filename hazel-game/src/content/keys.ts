import type { Topic, ZoneId } from '../types';
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
 * Thematic pairing: woods→Nature crystal, clockwork→Gears crystal,
 * starfall→Wonder crystal.
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
  /** The crystal zone whose Fiend gate this key unlocks. */
  unlocksZone: ZoneId;
  /** That zone's Fiend, named in the locked-gate message. */
  fiendName: string;
}

export const GATE_KEYS: GateKey[] = [
  {
    id: 'thornroot-key',
    name: 'Thornroot Key',
    emoji: '🌿',
    bossId: 'thicket-warden',
    bossName: 'The Thicket Warden',
    bossIntro: [
      'A wall of living bramble heaves itself upright. The Thicket Warden has guarded this grove since before the fog.',
      '"You smell of crystals, little one. The road to Verdara is MINE to give. Answer my thorns — or turn back."',
    ],
    bossDefeat: '"Heh… roots that bend… do not break. The grove is yours. Take the key, and go free my cousin from the smog."',
    fromZone: 'whispering-woods',
    unlocksZone: 'verdara',
    fiendName: 'the Smog Fiend',
  },
  {
    id: 'mainspring-key',
    name: 'Mainspring Key',
    emoji: '🔑',
    bossId: 'clockwork-titan',
    bossName: 'The Clockwork Titan',
    bossIntro: [
      'Gears the size of windmills grind awake. The Clockwork Titan was wound up long ago and never told to stop.',
      '"DEFINITION: intruder. The mainspring to Gearfall stays locked until you prove your cogs turn true. Compute, child."',
    ],
    bossDefeat: '"Re…calculating… you were the missing piece all along. Mainspring released. Wind the Rust Fiend down for me."',
    fromZone: 'clockwork-depths',
    unlocksZone: 'gearfall',
    fiendName: 'the Rust Fiend',
  },
  {
    id: 'starlight-prism',
    name: 'Starlight Prism',
    emoji: '🌟',
    bossId: 'tide-colossus',
    bossName: 'The Tide Colossus',
    bossIntro: [
      'The sea stands up. The Tide Colossus has carried a fallen star on its back for a thousand quiet years.',
      '"The way to Chromaria runs through ME, stargazer. Show me the colors of a clever mind, or sink back to the sand."',
    ],
    bossDefeat: '"…bright. So bright. Take the prism, and give the Gray Fiend back the colors it forgot."',
    fromZone: 'starfall-coast',
    unlocksZone: 'chromaria',
    fiendName: 'the Gray Fiend',
  },
];

/** The key dropped by beating a given warden boss (by enemy def id). */
export function keyForBoss(bossId: string): GateKey | undefined {
  return GATE_KEYS.find((k) => k.bossId === bossId);
}

/** The key required to open a given crystal zone's Fiend gate. */
export function keyForZone(zoneId: ZoneId): GateKey | undefined {
  return GATE_KEYS.find((k) => k.unlocksZone === zoneId);
}

/** Save-flag set when the player holds a key. */
export function keyFlag(id: string): string {
  return `key-${id}`;
}

/**
 * Whether a boss is permanently beaten (so the world stops spawning it): crystal
 * Fiends despawn once their crystal is restored, wardens once their key is held.
 */
export function bossDefeated(
  enemyId: string,
  topic: Topic,
  flags: Record<string, boolean>,
): boolean {
  const key = keyForBoss(enemyId);
  return key ? flags[keyFlag(key.id)] === true : flags[crystalFlag(topic)] === true;
}
