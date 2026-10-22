import { describe, it, expect } from 'vitest';
import { MINIGAMES, MINIGAME_IDS, gameHostedBy, openedFlag, pageFlag, starFlag } from './minigames';
import { NPC_DEFS } from './npcs';
import { ZONES } from './zones';
import { topicInfo } from './topics';
import { CONSUMABLE_IDS } from './items';
import { MUSIC_SOURCES } from '../lib/audio';
import { GAME_SCREENS } from '../features/minigames/games';

describe('the mini-games registry (docs/DESIGN-MINIGAMES.md §4)', () => {
  it('every game has a host who exists and stands somewhere in the world', () => {
    for (const id of MINIGAME_IDS) {
      const g = MINIGAMES[id];
      expect(g.id).toBe(id);
      expect(NPC_DEFS[g.host], `${id}'s host`).toBeDefined();
      const placed = Object.values(ZONES).some((z) => z.npcs.some((p) => p.defId === g.host));
      expect(placed, `${g.host} is placed`).toBe(true);
      expect(gameHostedBy(g.host)).toBe(id);
    }
  });

  it('nobody hosts two games; nobody else hosts one', () => {
    const hosts = MINIGAME_IDS.map((id) => MINIGAMES[id].host);
    expect(new Set(hosts).size).toBe(hosts.length);
    expect(gameHostedBy('numbria-innkeeper')).toBeNull();
  });

  it('each game names a real topic, music track, item and backdrop, and has its screens', () => {
    for (const id of MINIGAME_IDS) {
      const g = MINIGAMES[id];
      expect(topicInfo(g.topic)).toBeDefined();
      if (g.music) expect(MUSIC_SOURCES[g.music]).toBeDefined();
      if (g.firstItem) expect(CONSUMABLE_IDS).toContain(g.firstItem);
      expect(g.backdrop).toMatch(/^\/backgrounds\/[a-z-]+\.png$/);
      expect(g.steps).toHaveLength(3);
      expect(g.pages).toBeGreaterThan(0);
      expect(GAME_SCREENS[id].steps).toHaveLength(3);
    }
  });

  it('progress lives in its own save flags', () => {
    expect(openedFlag('potion-lab')).toBe('mg:potion-lab:opened');
    expect(pageFlag('potion-lab', 'lemon')).toBe('mg:potion-lab:page:lemon');
    expect(starFlag('potion-lab', 2)).toBe('mg:potion-lab:star:2');
  });
});
