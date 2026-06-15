import { describe, it, expect } from 'vitest';
import { GATE_KEYS, keyForBoss, keyForZone, keyFlag, bossDefeated } from './keys';
import { ENEMY_DEFS } from './enemies';
import { ZONES } from './zones';
import { crystalFlag, TOPICS } from './topics';

describe('warden keys (#58)', () => {
  it('every key is dropped by a real boss living in its themed zone', () => {
    for (const k of GATE_KEYS) {
      const boss = ENEMY_DEFS[k.bossId];
      expect(boss, `boss ${k.bossId}`).toBeTruthy();
      expect(boss.isBoss).toBe(true);
      expect(boss.name).toBe(k.bossName);
      expect(
        ZONES[k.fromZone].enemies.some((e) => e.defId === k.bossId),
        `${k.bossId} must be placed in ${k.fromZone}`,
      ).toBe(true);
    }
  });

  it('every key unlocks a crystal zone whose keyGate sits on its G tile', () => {
    for (const k of GATE_KEYS) {
      const zone = ZONES[k.unlocksZone];
      expect(TOPICS, `${k.unlocksZone} is a crystal zone`).toContain(zone.topic);
      expect(zone.keyGate, `${k.unlocksZone} keyGate`).toBeTruthy();
      const { x, y } = zone.keyGate!;
      expect(zone.map[y][x], `${k.unlocksZone} keyGate tile`).toBe('G');
    }
  });

  it('keyForBoss / keyForZone round-trip, and Numbria stays open (no key)', () => {
    for (const k of GATE_KEYS) {
      expect(keyForBoss(k.bossId)?.id).toBe(k.id);
      expect(keyForZone(k.unlocksZone)?.id).toBe(k.id);
    }
    // Math/Numbria is the guaranteed first crystal — never key-gated.
    expect(ZONES.numbria.keyGate).toBeUndefined();
    expect(keyForZone('numbria')).toBeUndefined();
    // Exactly three of the four Fiends are key-gated.
    expect(GATE_KEYS).toHaveLength(3);
    expect(new Set(GATE_KEYS.map((k) => k.unlocksZone)).size).toBe(3);
  });

  it('bossDefeated: crystal Fiends key off the crystal flag, wardens off the key flag', () => {
    // A warden is only "gone" once its key is held — not its (unused) crystal flag.
    const warden = GATE_KEYS[0];
    const wardenTopic = ENEMY_DEFS[warden.bossId].topic;
    expect(bossDefeated(warden.bossId, wardenTopic, {})).toBe(false);
    expect(bossDefeated(warden.bossId, wardenTopic, { [crystalFlag(wardenTopic)]: true })).toBe(false);
    expect(bossDefeated(warden.bossId, wardenTopic, { [keyFlag(warden.id)]: true })).toBe(true);
    // A crystal Fiend keys off its crystal flag.
    expect(bossDefeated('null-fiend', 'math', {})).toBe(false);
    expect(bossDefeated('null-fiend', 'math', { [crystalFlag('math')]: true })).toBe(true);
  });
});
