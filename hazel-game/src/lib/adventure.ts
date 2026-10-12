import type { SaveData } from '../types';
import { ALL_SECRETS, secretFlag } from '../content/secrets';
import { QUESTS, questDoneFlag } from '../content/quests';
import { crystalsInPlay } from '../content/story';

/**
 * How far the hero has come (#132) — what the "Act II complete" card shows at
 * the end of the story built so far, worked out from the save alone.
 */
export interface AdventureProgress {
  crystals: { restored: number; total: number };
  secrets: { found: number; total: number };
  quests: { done: number; total: number };
  badges: number;
}

export function adventureProgress(save: SaveData): AdventureProgress {
  return {
    crystals: crystalsInPlay(save.flags),
    secrets: {
      found: ALL_SECRETS.filter((s) => save.flags[secretFlag(s.secret.id)]).length,
      total: ALL_SECRETS.length,
    },
    quests: { done: QUESTS.filter((q) => save.flags[questDoneFlag(q)]).length, total: QUESTS.length },
    badges: save.badges.length,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Things to do while the next act is on its way (#132): the secrets and
 * quests still left, if any, then two that are always there.
 */
export function whileYouWait(p: AdventureProgress): string[] {
  const lines: string[] = [];
  const secrets = p.secrets.total - p.secrets.found;
  if (secrets > 0) lines.push(`✨ Find the ${plural(secrets, 'secret')} still hidden!`);
  const quests = p.quests.total - p.quests.done;
  if (quests > 0) lines.push(`📜 Finish ${plural(quests, 'more quest')} — talk to everyone!`);
  lines.push('🗼 Climb the Spire again — Umbra remembers you!');
  lines.push('📚 Retry the questions you missed, in the Library.');
  return lines;
}
