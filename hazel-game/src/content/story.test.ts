import { describe, it, expect } from 'vitest';
import {
  emberStage,
  endingPanels,
  BOSS_LINES,
  INTRO_PANELS,
  HATCH_PANELS,
  CRYSTAL_PANELS,
  SPIRE_PANELS,
  EMBER_SPRITES,
  EMBER_MAP_SIZE,
  EMBER_HATCHED,
} from './story';
import { TOPICS } from './topics';

describe('emberStage', () => {
  it('stays an egg until the first battle victory, regardless of crystals', () => {
    expect(emberStage(0, {})).toBe('egg');
    expect(emberStage(2, {})).toBe('egg');
  });

  it('grows hatchling → whelp → dragon as crystals are restored', () => {
    const hatched = { [EMBER_HATCHED]: true };
    expect(emberStage(0, hatched)).toBe('hatchling');
    expect(emberStage(1, hatched)).toBe('hatchling');
    expect(emberStage(2, hatched)).toBe('whelp');
    expect(emberStage(3, hatched)).toBe('whelp');
    expect(emberStage(4, hatched)).toBe('dragon');
  });

  it('every stage has a sprite and a map size', () => {
    for (const stage of ['egg', 'hatchling', 'whelp', 'dragon'] as const) {
      expect(EMBER_SPRITES[stage]).toBeTruthy();
      expect(EMBER_MAP_SIZE[stage]).toBeGreaterThan(0);
    }
  });
});

describe('cutscene panels', () => {
  it('intro and hatch panels are non-empty storybook pages', () => {
    expect(INTRO_PANELS.length).toBeGreaterThanOrEqual(3);
    expect(HATCH_PANELS.length).toBeGreaterThanOrEqual(2);
    for (const p of [...INTRO_PANELS, ...HATCH_PANELS]) {
      expect(p.emoji).toBeTruthy();
      expect(p.text.length).toBeGreaterThan(20);
    }
  });

  it('the ending is personalized with the hero name', () => {
    const panels = endingPanels('Blaze');
    expect(panels.length).toBeGreaterThanOrEqual(3);
    expect(panels.some((p) => p.text.includes('Blaze'))).toBe(true);
  });

  it('every topic has a crystal-restored cutscene and the Spire scene is present', () => {
    for (const topic of TOPICS) {
      const panels = CRYSTAL_PANELS[topic];
      expect(panels.length).toBeGreaterThanOrEqual(1);
      for (const p of panels) {
        expect(p.emoji).toBeTruthy();
        expect(p.text.length).toBeGreaterThan(20);
      }
    }
    expect(SPIRE_PANELS.length).toBeGreaterThanOrEqual(1);
    for (const p of SPIRE_PANELS) expect(p.text.length).toBeGreaterThan(20);
  });
});

describe('BOSS_LINES', () => {
  it('every topic has Fiend intro lines and last words', () => {
    for (const topic of TOPICS) {
      expect(BOSS_LINES[topic].intro.length).toBeGreaterThanOrEqual(1);
      for (const line of BOSS_LINES[topic].intro) expect(line.length).toBeGreaterThan(10);
      expect(BOSS_LINES[topic].defeat.length).toBeGreaterThan(10);
    }
  });
});
