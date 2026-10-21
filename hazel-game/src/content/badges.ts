import { ALL_SHOP_ITEMS } from './items';
import { GATE_KEYS } from './keys';
import { BOSS_BADGES } from './enemies';
import { QUEST_BADGES } from './quests';
import { TYPING_BADGES } from './typing';
import { SECRET_BADGES } from './secrets';

/** A badge's (or trophy's) name and emoji, as the shelves show it. */
export interface BadgeInfo {
  name: string;
  emoji: string;
}

/** A table's own entry for `id` — never one of Object's (`constructor`, `toString`…). */
function own<T>(table: Record<string, T>, id: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
}

/**
 * What a `save.badges` id is: a badge bought in a shop, a warden's gate key
 * (kept as a trophy), a boss's, a quest's, the scribe's or the secret seeker's.
 * Null for an id this build doesn't know (an older or newer save) — the menu's
 * shelf shows the id itself then; 👪 Progress leaves it out (no raw ids, #29).
 */
export function badgeInfo(id: string): BadgeInfo | null {
  const shop = ALL_SHOP_ITEMS.find((i) => i.id === id);
  if (shop) return { name: shop.name, emoji: shop.emoji };
  const key = GATE_KEYS.find((k) => k.id === id);
  if (key) return { name: key.name, emoji: key.emoji };
  return own(BOSS_BADGES, id) ?? own(QUEST_BADGES, id) ?? own(TYPING_BADGES, id) ?? own(SECRET_BADGES, id) ?? null;
}
