import { describe, it, expect } from 'vitest';
import { ALL_SECRETS, claimSecret, rewardSummary, secretAt, secretById, secretFlag, secretProgress } from './secrets';
import { ZONES, WALKABLE_CHARS, tileAt, type ZoneDef } from './zones';
import { QUEST_ITEMS } from './quests';
import { defaultSave } from '../lib/save';

const TOWNS = ['lumina-village', 'numbria', 'verdara', 'gearfall', 'chromaria'] as const;

/** Cells the hero can reach on foot from the zone spawn (closed gates block). */
function reachable(z: ZoneDef): Set<string> {
  const seen = new Set<string>([`${z.spawn.x},${z.spawn.y}`]);
  const queue = [[z.spawn.x, z.spawn.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || !WALKABLE_CHARS.has(tileAt(z, nx, ny))) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

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
      const open = reachable(z);
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
