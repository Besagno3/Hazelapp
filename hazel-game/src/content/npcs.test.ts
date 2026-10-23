import { describe, it, expect } from 'vitest';
import { NPC_DEFS, lineText, visibleLines } from './npcs';
import { questDoneFlag } from './questFlags';

describe('Index, after her letter is home (#128a)', () => {
  const said = (flags: Record<string, boolean>) => visibleLines(NPC_DEFS['archive-index'].lines, flags).map(lineText);
  const done = { [questDoneFlag({ id: 'archive-letter' })]: true };

  it("doesn't introduce herself again once her quest is done — she files the note and sneezes on", () => {
    expect(said({}).some((l) => l.startsWith("I'm Index!"))).toBe(true);
    expect(said(done).some((l) => /I'm Index/.test(l))).toBe(false);
    expect(said(done).some((l) => l.startsWith("Wick's note is filed"))).toBe(true);
    expect(said({}).some((l) => l.startsWith("Wick's note is filed"))).toBe(false);
  });

  it('asks for help with her time-order cards after her hello or Wick’s note — with no “too” left over (code review round 2)', () => {
    for (const flags of [{}, done]) {
      const lines = said(flags);
      const ask = lines.findIndex((l) => l.startsWith('Some of my cards are in time order'));
      expect(ask).toBe(1);
      expect(lines[ask]).not.toMatch(/\btoo\b/);
    }
  });
});
