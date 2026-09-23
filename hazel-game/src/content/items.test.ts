import { describe, it, expect } from 'vitest';
import { ALL_SHOP_ITEMS, BATTLE_ITEMS, CONSUMABLE_IDS, SHOPS, shopFor } from './items';
import { NPC_DEFS } from './npcs';
import { normalizeSave } from '../lib/save';

describe('shops (#73: every store is unique)', () => {
  it('every item is sold in exactly one shop', () => {
    const ids = ALL_SHOP_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every consumable is sold somewhere', () => {
    for (const id of CONSUMABLE_IDS) {
      expect(ALL_SHOP_ITEMS.some((i) => i.id === id), `${id} for sale`).toBe(true);
    }
  });
  it('every merchant NPC runs a shop, and every shop belongs to a merchant', () => {
    const merchants = Object.values(NPC_DEFS).filter((n) => n.role === 'merchant').map((n) => n.id);
    expect(Object.keys(SHOPS).sort()).toEqual([...merchants].sort());
  });
  it('shop names are distinct', () => {
    const names = Object.values(SHOPS).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('shopFor resolves merchants and nothing else', () => {
    expect(shopFor('hub-merchant')?.name).toBeTruthy();
    expect(shopFor('elder-lumen')).toBeNull();
    expect(shopFor(null)).toBeNull();
  });
  it('hint feathers are not a battle item (they are used on questions)', () => {
    expect(BATTLE_ITEMS).not.toContain('hint');
  });
});

describe('save items (#73)', () => {
  it('an older save with only potion/hint gains zeroed slots for new items', () => {
    const s = normalizeSave({ items: { potion: 3, hint: 2 } });
    expect(s.items).toEqual({ potion: 3, hint: 2, elixir: 0, spark: 0, ward: 0 });
  });
  it('new item counts round-trip', () => {
    const s = normalizeSave({ items: { potion: 1, hint: 0, elixir: 2, spark: 1, ward: 4 } });
    expect(s.items.elixir).toBe(2);
    expect(s.items.ward).toBe(4);
  });
});
