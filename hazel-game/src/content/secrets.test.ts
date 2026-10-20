import { describe, it, expect } from 'vitest';
import { ALL_SECRETS, SECRETS_BADGE, SECRET_BADGES, allSecretsFound, claimSecret, rewardSummary, secretAt, secretById, secretFlag, secretProgress, withSecretsBadge } from './secrets';
import { ZONES, WALKABLE_CHARS, tileAt } from './zones';
import { reach } from '../lib/reach';
import { QUEST_ITEMS } from './quests';
import { defaultSave, normalizeSave } from '../lib/save';

const TOWNS = ['lumina-village', 'numbria', 'verdara', 'gearfall', 'chromaria'] as const;

describe('secrets (village expansion)', () => {
  it('every town hides at least three secrets', () => {
    for (const town of TOWNS) expect(ZONES[town].secrets?.length ?? 0, town).toBeGreaterThanOrEqual(3);
  });

  it('secret ids are unique and every reward gives something real', () => {
    const ids = ALL_SECRETS.map((s) => s.secret.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { secret } of ALL_SECRETS) {
      expect(rewardSummary(secret), secret.id).not.toBe('');
      if (secret.reward.questItem) expect(QUEST_ITEMS[secret.reward.questItem], secret.id).toBeDefined();
    }
  });

  it('every secret can be found from the spawn without opening a gate', () => {
    for (const { zoneId, secret } of ALL_SECRETS) {
      const z = ZONES[zoneId];
      // On foot from the spawn — closed gates block.
      const open = reach(z, { flags: null });
      const ch = tileAt(z, secret.x, secret.y);
      expect('KDEGSC'.includes(ch), `${secret.id} sits on a '${ch}' tile`).toBe(false);
      const found = WALKABLE_CHARS.has(ch)
        ? open.has(`${secret.x},${secret.y}`) // step on it
        : [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => open.has(`${secret.x + dx},${secret.y + dy}`)); // bump it
      expect(found, `${zoneId} ${secret.id} reachable`).toBe(true);
    }
  });

  it('every hidden passage joins two walkable sides (it leads somewhere)', () => {
    let passages = 0;
    for (const z of Object.values(ZONES)) {
      z.map.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch !== 'H') return;
          passages++;
          const walk = (dx: number, dy: number) => WALKABLE_CHARS.has(tileAt(z, x + dx, y + dy));
          expect((walk(-1, 0) && walk(1, 0)) || (walk(0, -1) && walk(0, 1)), `${z.id} H at ${x},${y}`).toBe(true);
        }),
      );
    }
    expect(passages).toBeGreaterThanOrEqual(TOWNS.length);
  });

  it('secretAt finds a secret by its cell', () => {
    const z = ZONES['lumina-village'];
    const s = z.secrets![0];
    expect(secretAt(z, s.x, s.y)?.id).toBe(s.id);
    expect(secretAt(z, 0, 0)).toBeUndefined();
  });

  it('claiming hands over the reward once and sets the flag', () => {
    const garden = secretById('village-secret-garden')!;
    const s1 = claimSecret(defaultSave(), garden);
    expect(s1.flags[secretFlag(garden.id)]).toBe(true);
    expect(s1.coins).toBe(40);
    expect(s1.items.clover).toBe(1);
    const s2 = claimSecret(s1, garden);
    expect(s2).toBe(s1); // already found: no double reward
  });

  it('a quest-item secret adds the item once', () => {
    const seal = secretById('village-fountain-seal')!;
    const s = claimSecret(defaultSave(), seal);
    expect(s.questItems).toEqual(['town-seal']);
  });

  it('secretProgress counts found secrets per zone', () => {
    const save = claimSecret(defaultSave(), secretById('numbria-pond')!);
    expect(secretProgress('numbria', save)).toEqual({ found: 1, total: ZONES.numbria.secrets!.length });
    expect(secretProgress('dawnreach', save)).toEqual({ found: 0, total: 0 });
  });
});

describe('the Secret Seeker trophy (#80b)', () => {
  const allBut = (n: number) => Object.fromEntries(ALL_SECRETS.slice(n).map((s) => [secretFlag(s.secret.id), true]));

  it('finding the last secret puts the trophy on the shelf — once', () => {
    const last = ALL_SECRETS[0].secret;
    let save = { ...defaultSave(), flags: { ...defaultSave().flags, ...allBut(1) } };
    expect(allSecretsFound(save.flags)).toBe(false);
    expect(withSecretsBadge(save).badges).not.toContain(SECRETS_BADGE);
    save = claimSecret(save, last);
    expect(allSecretsFound(save.flags)).toBe(true);
    expect(save.badges.filter((b) => b === SECRETS_BADGE)).toHaveLength(1);
    // Claiming again (a no-op) or asking again never adds a second.
    expect(claimSecret(save, last).badges.filter((b) => b === SECRETS_BADGE)).toHaveLength(1);
    expect(withSecretsBadge(save)).toBe(save);
    expect(SECRET_BADGES[SECRETS_BADGE]).toMatchObject({ name: 'Secret Seeker' });
  });

  it('any secret but the last pays no trophy', () => {
    const save = claimSecret(defaultSave(), ALL_SECRETS[0].secret);
    expect(save.badges).not.toContain(SECRETS_BADGE);
  });

  it('a save that found them all before the trophy existed gets it on load, once', () => {
    const old = { ...defaultSave(), badges: ['badge:clover'], flags: { ...defaultSave().flags, ...allBut(0) } };
    const loaded = normalizeSave(JSON.parse(JSON.stringify(old)));
    expect(loaded.badges).toEqual(['badge:clover', SECRETS_BADGE]);
    expect(normalizeSave(JSON.parse(JSON.stringify(loaded))).badges).toEqual(['badge:clover', SECRETS_BADGE]);
    // One secret short: no trophy.
    const short = { ...old, flags: { ...defaultSave().flags, ...allBut(1) } };
    expect(normalizeSave(JSON.parse(JSON.stringify(short))).badges).toEqual(['badge:clover']);
  });
});
