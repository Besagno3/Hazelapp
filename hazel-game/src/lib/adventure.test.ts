import { describe, it, expect } from 'vitest';
import { adventureProgress, whileYouWait } from './adventure';
import { defaultSave } from './save';
import { ALL_SECRETS, secretFlag } from '../content/secrets';
import { QUESTS, questDoneFlag } from '../content/quests';
import { ACT2_SEEN } from '../content/story';
import { TOPIC_REGISTRY, crystalFlag } from '../content/topics';

describe('adventureProgress (#132)', () => {
  it('counts nothing on a new save, out of everything in the game', () => {
    const p = adventureProgress(defaultSave());
    expect(p.crystals).toEqual({ restored: 0, total: 4 });
    expect(p.secrets).toEqual({ found: 0, total: ALL_SECRETS.length });
    expect(p.secrets.total).toBeGreaterThan(0);
    expect(p.quests).toEqual({ done: 0, total: QUESTS.length });
    expect(p.badges).toBe(0);
  });

  it('counts what the save has done; Act II\'s crystal once Act II opens', () => {
    const flags: Record<string, boolean> = { [ACT2_SEEN]: true };
    for (const t of TOPIC_REGISTRY) flags[crystalFlag(t.id)] = true;
    flags[secretFlag(ALL_SECRETS[0].secret.id)] = true;
    flags[questDoneFlag(QUESTS[0])] = true;
    flags[questDoneFlag(QUESTS[1])] = true;
    const p = adventureProgress({ ...defaultSave(), flags, badges: ['a', 'b', 'c'] });
    expect(p.crystals).toEqual({ restored: 5, total: 5 });
    expect(p.secrets.found).toBe(1);
    expect(p.quests.done).toBe(2);
    expect(p.badges).toBe(3);
  });
});

describe('whileYouWait (#132)', () => {
  const progress = (secretsLeft: number, questsLeft: number) => ({
    crystals: { restored: 5, total: 5 },
    secrets: { found: 10 - secretsLeft, total: 10 },
    quests: { done: 8 - questsLeft, total: 8 },
    badges: 4,
  });

  it('names the secrets and quests still left, then the Spire and the Library', () => {
    const lines = whileYouWait(progress(3, 2));
    expect(lines[0]).toBe('✨ Find the 3 secrets still hidden!');
    expect(lines[1]).toBe('📜 Finish 2 more quests — talk to everyone!');
    expect(lines.slice(2)).toEqual([
      '🗼 Climb the Spire again — Umbra remembers you!',
      '📚 Retry the questions you missed, in the Library.',
    ]);
  });

  it('says "1 secret" / "1 more quest", and leaves out what\'s all done', () => {
    expect(whileYouWait(progress(1, 1)).slice(0, 2)).toEqual([
      '✨ Find the 1 secret still hidden!',
      '📜 Finish 1 more quest — talk to everyone!',
    ]);
    expect(whileYouWait(progress(0, 0))).toHaveLength(2);
  });
});
