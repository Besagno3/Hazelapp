import { describe, it, expect } from 'vitest';
import { TOTAL_CRYSTALS } from '../types';
import {
  emberStage,
  EMBER_STAGE_AT,
  endingPanels,
  BOSS_LINES,
  INTRO_PANELS,
  HATCH_PANELS,
  CRYSTAL_PANELS,
  SPIRE_PANELS,
  GROVE_PANELS,
  DAWNREACH_PANELS,
  spireVictoryPanels,
  HOMECOMING_PANELS,
  ACT2_PANELS,
  VILLAIN_NAME,
  EMBER_SPRITES,
  EMBER_MAP_SIZE,
  EMBER_HATCHED,
} from './story';
import { TOPICS } from './topics';
import { NPC_DEFS, type DialogueLine } from './npcs';
import { fogSeenFlag } from './zones';

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

  it('TRIPWIRE: retune EMBER_STAGE_AT deliberately when the crystal count changes', () => {
    // EMBER_STAGE_AT holds explicit narrative beats (STORY-4X.md §8: whelp 2,
    // dragon 4 — even at 6 crystals). This assertion is meant to FAIL when a
    // new act changes TOTAL_CRYSTALS: do not "fix" it by deriving the stages —
    // decide them against the spec (a live player's dragon must not regress),
    // then update this pin.
    expect(TOTAL_CRYSTALS).toBe(4);
    expect(EMBER_STAGE_AT).toEqual({ whelp: 2, dragon: 4 });
    const hatched = { [EMBER_HATCHED]: true };
    expect(emberStage(EMBER_STAGE_AT.whelp, hatched)).toBe('whelp');
    expect(emberStage(EMBER_STAGE_AT.dragon, hatched)).toBe('dragon');
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

  it('the Moonwell Grove has an entry cutscene', () => {
    expect(GROVE_PANELS.length).toBeGreaterThanOrEqual(2);
    for (const p of GROVE_PANELS) {
      expect(p.emoji).toBeTruthy();
      expect(p.text.length).toBeGreaterThan(20);
    }
  });

  it('the villain is foreshadowed in the crystal scenes and named in the finale', () => {
    expect(VILLAIN_NAME.length).toBeGreaterThan(3);
    // Every crystal scene ends on a shadow/omen panel pointing at the Spire.
    for (const topic of TOPICS) {
      const last = CRYSTAL_PANELS[topic][CRYSTAL_PANELS[topic].length - 1];
      expect(last.emoji).toBe('🌑');
    }
    const finale = spireVictoryPanels('Nova');
    expect(finale.length).toBeGreaterThanOrEqual(3);
    expect(finale.some((p) => p.text.includes('Nova'))).toBe(true);
  });
});

describe('the script matches the fog over the Spire (#75 item 7)', () => {
  const shown = (lines: DialogueLine[], flags: Record<string, boolean>) =>
    lines
      .filter((l) => typeof l === 'string' || ((!l.ifFlag || flags[l.ifFlag]) && (!l.unlessFlag || !flags[l.unlessFlag])))
      .map((l) => (typeof l === 'string' ? l : l.text))
      .join(' ');

  it('leaving home (always before any crystal) says the Spire is hidden in fog, not that it shows the way', () => {
    const text = DAWNREACH_PANELS.map((p) => p.text).join(' ');
    expect(text).toMatch(/fog hides the Crystal Spire/);
    expect(text).not.toMatch(/glitters|find your way/);
  });

  it('Scout Tamsin names all four crystal lands, but not in one overlong box on a phone (#101j)', () => {
    const lines = NPC_DEFS['dawnreach-scout'].lines.map((l) => (typeof l === 'string' ? l : l.text));
    const corners = lines.find((l) => /crystal lands/.test(l));
    expect(corners).toMatch(/Numbria north-west.*Gearfall Canyon north-east.*Verdara south-west.*Chromaria south-east/);
    // ~35 characters a row in a 375 px dialogue box: this keeps it to four rows.
    expect(corners!.length).toBeLessThanOrEqual(140);
    expect(corners).not.toMatch(/Whispering Woods|Starfall Coast/);
  });

  it("Scout Tamsin only calls the Spire a landmark once its fog has lifted on screen", () => {
    const lines = NPC_DEFS['dawnreach-scout'].lines;
    const before = shown(lines, {});
    expect(before).toMatch(/Spire hides in a ring of fog/);
    expect(before).not.toMatch(/Look for the Spire/);
    const after = shown(lines, { [fogSeenFlag('spire-fog')]: true });
    expect(after).toMatch(/out of the fog at last.*Look for the Spire/);
    expect(after).not.toMatch(/hides in a ring of fog/);
  });
});

describe('Lumina Field is retired (#75 item 8)', () => {
  it('no one points the hero at it any more (it is just the open country now)', () => {
    for (const npc of Object.values(NPC_DEFS)) {
      for (const l of npc.lines) {
        expect(typeof l === 'string' ? l : l.text, npc.id).not.toMatch(/Lumina Field|this field/);
      }
    }
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

describe('after the Spire: the finale, the walk home, and Act II at the inn (#75 item 14)', () => {
  const words = (panels: { text: string }[]) => panels.reduce((n, p) => n + p.text.split(/\s+/).length, 0);

  it('the walk home is three pictures — down the Spire, the village cheering, a bed at the inn', () => {
    expect(HOMECOMING_PANELS.map((p) => p.scene)).toEqual(['spire-stairs', 'village-cheer', 'inn-night']);
    expect(HOMECOMING_PANELS[2].text).toMatch(/Sleepy Sheep Inn/);
    // The finale itself is words only, and ends on the hero — not "the adventure continues".
    const finale = spireVictoryPanels('Nova');
    expect(finale.every((p) => !p.scene)).toBe(true);
    expect(finale[finale.length - 1].text).toMatch(/Nova/);
    expect(finale.map((p) => p.text).join(' ')).not.toMatch(/adventure continues/i);
  });

  it('Act II opens by waking at that inn, and ends on Old Marlow', () => {
    expect(ACT2_PANELS[0].text).toMatch(/^You wake .* Sleepy Sheep Inn/);
    expect(ACT2_PANELS[ACT2_PANELS.length - 1].text).toMatch(/Old Marlow/);
  });

  it('is shorter than the ten panels it replaced: three short runs, under 330 words in all', () => {
    for (const run of [spireVictoryPanels('Nova'), HOMECOMING_PANELS, ACT2_PANELS]) expect(run.length).toBeLessThanOrEqual(3);
    expect(words(spireVictoryPanels('Nova')) + words(HOMECOMING_PANELS) + words(ACT2_PANELS)).toBeLessThan(330);
  });
});

