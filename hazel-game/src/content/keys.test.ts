import { describe, it, expect } from 'vitest';
import { GATE_KEYS, keyForBoss, keyForZone, keyFlag, keyName, bossDefeated, bossFlag } from './keys';
import { ENEMY_DEFS, fiendFor } from './enemies';
import { ZONES } from './zones';
import { actCrystals, crystalFlag, TOPICS } from './topics';
import { NPC_DEFS, type DialogueLine } from './npcs';
import { bossScript } from './enemies';

/** Act I's three wardens' keys (#58): the ones that open an Act I crystal zone (not the Memoria Key, #75 item 14h). */
const ACT_ONE_KEYS = GATE_KEYS.filter((k) => actCrystals(1).some((t) => t.zoneId === k.unlocksZone));

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

  it("every Act I key unlocks a crystal zone whose keyGate sits on its G tile", () => {
    for (const k of ACT_ONE_KEYS) {
      const zone = ZONES[k.unlocksZone];
      expect(TOPICS, `${k.unlocksZone} is a crystal zone`).toContain(zone.topic);
      expect(zone.keyGate, `${k.unlocksZone} keyGate`).toBeTruthy();
      const { x, y } = zone.keyGate!;
      expect(zone.map[y][x], `${k.unlocksZone} keyGate tile`).toBe('G');
    }
  });

  it('keys are themed to their destination crystal zone, not the keyless warden zone (#59)', () => {
    for (const k of ACT_ONE_KEYS) {
      // The key id belongs to the zone it opens (which awards a crystal)…
      expect(k.id, `${k.id} keyed to destination`).toBe(`${k.unlocksZone}-key`);
      // …and never to the warden's home zone, which has no crystal of its own.
      expect(ZONES[k.fromZone].topic).not.toBe(ZONES[k.unlocksZone].topic);
    }
  });

  it('each warden has someone in its home zone who warns of it until its key is won (#59)', () => {
    const warns = (lines: DialogueLine[], id: string) =>
      lines.some((l) => typeof l !== 'string' && l.unlessFlag === keyFlag(id)) &&
      lines.some((l) => typeof l !== 'string' && l.ifFlag === keyFlag(id));
    for (const k of GATE_KEYS) {
      const signs = ZONES[k.fromZone].npcs.filter((n) => warns(NPC_DEFS[n.defId].lines, k.id));
      expect(signs, `${k.fromZone} warden signpost`).toHaveLength(1);
    }
  });

  it('keyForBoss / keyForZone round-trip, and Numbria stays open (no key)', () => {
    for (const k of GATE_KEYS) expect(keyForBoss(k.bossId)?.id).toBe(k.id);
    for (const k of ACT_ONE_KEYS) expect(keyForZone(k.unlocksZone)?.id).toBe(k.id);
    // Math/Numbria is the guaranteed first crystal — never key-gated.
    expect(ZONES.numbria.keyGate).toBeUndefined();
    expect(keyForZone('numbria')).toBeUndefined();
    // Exactly three of Act I's four Fiends are key-gated.
    expect(ACT_ONE_KEYS).toHaveLength(3);
    expect(new Set(ACT_ONE_KEYS.map((k) => k.unlocksZone)).size).toBe(3);
  });

  it("the First Chorus Key (#75 item 15d): the Compass Golem's, on the Wayfinder Isles — one of Chorus Isle's two (15g)", () => {
    const k = GATE_KEYS.find((g) => g.id === 'chorus-a')!;
    expect(keyFlag(k.id)).toBe('key-chorus-a'); // STORY-4X's flag
    expect(k.fromZone).toBe('wayfinder-isles');
    expect(k.unlocksZone).toBe('chorus-isle');
    expect(k.opens).toMatch(/one of the two Chorus Keys/);
    expect(keyForZone(null)).toBeUndefined();
    expect(ENEMY_DEFS[k.bossId]).toMatchObject({ role: 'warden', topic: 'geography', isBoss: true });
  });

  it("the Second Chorus Key (#75 item 15e): the Riddle Leviathan's, in Inkwell Cove — the same gate's other key", () => {
    const k = GATE_KEYS.find((g) => g.id === 'chorus-b')!;
    expect(keyFlag(k.id)).toBe('key-chorus-b'); // STORY-4X's flag
    expect(k.fromZone).toBe('inkwell-cove');
    expect(k.unlocksZone).toBe('chorus-isle');
    expect(k.opens).toMatch(/one of the two Chorus Keys/);
    expect(k.fiendName).toBe(GATE_KEYS.find((g) => g.id === 'chorus-a')!.fiendName);
    expect(ENEMY_DEFS[k.bossId]).toMatchObject({ role: 'warden', topic: 'words', isBoss: true });
    // It talks only in riddles — even beaten (STORY-4X).
    expect(k.bossDefeat).toMatch(/^"What has been beaten, yet feels lighter\?/);
  });

  it("the Memoria Key (#75 items 14f, 14h): the Ringkeeper's, in Eldergrove, opening the Sunken Archive's silver door", () => {
    const k = GATE_KEYS.find((g) => g.id === 'memoria')!;
    expect(keyFlag(k.id)).toBe('key-memoria'); // STORY-4X's flag
    expect(k.fromZone).toBe('eldergrove');
    expect(k.unlocksZone).toBe('sunken-archive');
    expect(keyForZone('sunken-archive')).toBe(k);
    // Its gate is the Hollow Fiend's: a key gate on the Archive's map, in front of the Fiend.
    const archive = ZONES['sunken-archive'];
    expect(archive.map[archive.keyGate!.y][archive.keyGate!.x]).toBe('G');
    expect(k.fiendName).toBe('the Hollow Fiend');
    // Bumped, it's the silver door everyone calls it (review fix); Act I's stay gates.
    expect(k.door).toBe('silver door');
    for (const a of ACT_ONE_KEYS) expect(a.door).toBeUndefined();
    expect(ENEMY_DEFS[fiendFor('history').id].role).toBe('fiend');
    const boss = ENEMY_DEFS[k.bossId];
    expect(boss).toMatchObject({ role: 'warden', topic: 'history', isBoss: true, levelOffset: 1 });
    expect(bossScript(boss)).toEqual({ intro: k.bossIntro, defeat: k.bossDefeat });
    expect(bossDefeated(boss, {})).toBe(false);
    expect(bossDefeated(boss, { [keyFlag(k.id)]: true })).toBe(true);
    // After it, Old Ringwood says where its door is (#75 item 14h).
    const after = NPC_DEFS['elder-ringwood'].lines.filter((l) => typeof l !== 'string' && l.ifFlag === keyFlag(k.id));
    expect(after.map((l) => (l as { text: string }).text).join(' ')).toMatch(/Sunken Archive/);
    // It stands in the Great Ring, south of Old Ringwood.
    const at = ZONES.eldergrove.enemies.find((e) => e.defId === k.bossId)!;
    const ringwood = ZONES.eldergrove.npcs.find((n) => n.defId === 'elder-ringwood')!;
    expect(at.y).toBeGreaterThan(ringwood.y);
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

describe('keyName (16c review round 1–2)', () => {
  it('"the Verdant Key", but "Aster\'s Key" — a name that says whose it is takes no "the"', () => {
    const asters = GATE_KEYS.find((k) => k.id === 'asters-key')!;
    const verdant = GATE_KEYS.find((k) => k.id !== 'asters-key' && !/'s /.test(k.name))!;
    expect(keyName(asters)).toBe("Aster's Key");
    expect(keyName(asters, true)).toBe("Aster's Key");
    expect(keyName(verdant)).toBe(`the ${verdant.name}`);
    expect(keyName(verdant, true)).toBe(`The ${verdant.name}`);
    expect(keyName({ ...asters, name: 'Aster’s Key' })).toBe('Aster’s Key');
  });
});
