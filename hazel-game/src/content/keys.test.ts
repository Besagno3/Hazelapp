import { describe, it, expect } from 'vitest';
import { GATE_KEYS, keyForBoss, keyForZone, keyFlag, bossDefeated, bossFlag } from './keys';
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

  it('keys are themed to their destination crystal zone, not the keyless warden zone (#59)', () => {
    for (const k of GATE_KEYS) {
      // The key id belongs to the zone it opens (which awards a crystal)…
      expect(k.id, `${k.id} keyed to destination`).toBe(`${k.unlocksZone}-key`);
      // …and never to the warden's home zone, which has no crystal of its own.
      expect(ZONES[k.fromZone].topic).not.toBe(ZONES[k.unlocksZone].topic);
    }
  });

  it('each warden has a signpost NPC placed in its home zone (#59)', () => {
    for (const k of GATE_KEYS) {
      const signs = ZONES[k.fromZone].npcs.filter((n) => n.defId.endsWith('-warden-sign'));
      expect(signs, `${k.fromZone} warden signpost`).toHaveLength(1);
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

  it('bossDefeated, by role (#75 item 14c): a Fiend on its crystal, a warden on its key, any other boss on its own flag', () => {
    // A warden is only "gone" once its key is held — not its (unused) crystal flag.
    const warden = GATE_KEYS[0];
    const wd = ENEMY_DEFS[warden.bossId];
    expect(bossDefeated(wd, {})).toBe(false);
    expect(bossDefeated(wd, { [crystalFlag(wd.topic)]: true })).toBe(false);
    expect(bossDefeated(wd, { [keyFlag(warden.id)]: true })).toBe(true);
    // A crystal Fiend keys off its crystal flag.
    const fiend = ENEMY_DEFS['null-fiend'];
    expect(bossDefeated(fiend, {})).toBe(false);
    expect(bossDefeated(fiend, { [crystalFlag('math')]: true })).toBe(true);
    // A miniboss on a crystal topic with no key: its own flag, never the crystal's.
    const miniboss = { id: 'test-miniboss', topic: 'math' as const, role: 'miniboss' as const };
    expect(bossDefeated(miniboss, { [crystalFlag('math')]: true })).toBe(false);
    expect(bossDefeated(miniboss, { [bossFlag('test-miniboss')]: true })).toBe(true);
    expect(bossFlag('test-miniboss')).toBe('boss:test-miniboss:defeated');
  });
});
