import type { SaveData } from '../types';
import { ZONES, secretFlag, type SecretDef, type ZoneDef, type ZoneId } from './zones';
import { CONSUMABLES, type ConsumableId } from './items';
import { QUEST_ITEMS } from './quests';

/**
 * Hidden secrets (village expansion). Each zone lists its own in
 * `ZoneDef.secrets`; this module claims them and summarizes progress.
 */

export { secretFlag };

/** Every secret in the world, with the zone it lives in. */
export const ALL_SECRETS: { zoneId: ZoneId; secret: SecretDef }[] = Object.values(ZONES).flatMap((z) =>
  (z.secrets ?? []).map((secret) => ({ zoneId: z.id, secret })),
);

export function secretById(id: string): SecretDef | undefined {
  return ALL_SECRETS.find((s) => s.secret.id === id)?.secret;
}

/** The secret hidden at a map cell, if any. */
export function secretAt(z: ZoneDef, x: number, y: number): SecretDef | undefined {
  return z.secrets?.find((s) => s.x === x && s.y === y);
}

/** Hand over a secret's reward and mark it found. A no-op if already found. */
export function claimSecret(save: SaveData, secret: SecretDef): SaveData {
  if (save.flags[secretFlag(secret.id)]) return save;
  const { coins = 0, items = {}, questItem } = secret.reward;
  const nextItems = { ...save.items };
  for (const [id, n] of Object.entries(items) as [ConsumableId, number][]) nextItems[id] += n;
  return {
    ...save,
    coins: save.coins + coins,
    items: nextItems,
    questItems: questItem && !save.questItems.includes(questItem) ? [...save.questItems, questItem] : save.questItems,
    flags: { ...save.flags, [secretFlag(secret.id)]: true },
  };
}

/** One-line reward summary for the "secret found" popup, e.g. "+30 🪙 · 🍵 Focus Tea". */
export function rewardSummary(secret: SecretDef): string {
  const parts: string[] = [];
  const { coins, items = {}, questItem } = secret.reward;
  if (coins) parts.push(`+${coins} 🪙`);
  for (const [id, n] of Object.entries(items) as [ConsumableId, number][]) {
    if (n > 0) parts.push(`${CONSUMABLES[id].emoji} ${CONSUMABLES[id].name}${n > 1 ? ` ×${n}` : ''}`);
  }
  if (questItem) {
    const qi = QUEST_ITEMS[questItem];
    if (qi) parts.push(`${qi.emoji} ${qi.name}`);
  }
  return parts.join(' · ');
}

/** How many of a zone's secrets the save has found. */
export function secretProgress(zoneId: ZoneId, save: SaveData): { found: number; total: number } {
  const list = ZONES[zoneId].secrets ?? [];
  return { found: list.filter((s) => save.flags[secretFlag(s.id)]).length, total: list.length };
}
