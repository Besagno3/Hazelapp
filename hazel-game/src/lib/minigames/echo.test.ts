import { describe, it, expect } from 'vitest';
import {
  CHIME,
  CHIMES,
  ECHOES_PER_ROUND,
  NOTES,
  TUNES,
  TUNE_IDS,
  echoFor,
  echoWords,
  height,
  judge,
  learnedLine,
  playable,
  roundQueue,
  shape,
  shapeWords,
  spotWords,
  tapWords,
} from './echo';
import { BANDS, type Band } from '../../content/minigames';

const echoes = (band: Band) => Array.from({ length: 24 }, (_, k) => echoFor(band, Math.floor(k / ECHOES_PER_ROUND), k % ECHOES_PER_ROUND));

describe('the chimes (docs/DESIGN-MINIGAMES.md §5.5)', () => {
  it('five, C to G, low to high; each its own colour and name', () => {
    expect(NOTES).toEqual(['C', 'D', 'E', 'F', 'G']);
    for (let k = 1; k < NOTES.length; k++) expect(CHIME[NOTES[k]].hz).toBeGreaterThan(CHIME[NOTES[k - 1]].hz);
    expect(new Set(NOTES.map((n) => CHIME[n].colour)).size).toBe(5);
    expect(new Set(NOTES.map((n) => CHIME[n].name)).size).toBe(5);
    expect(CHIMES.gentle).toEqual(['C', 'D', 'E']);
    expect(CHIMES.medium).toEqual(NOTES);
  });
});

describe('the songbook', () => {
  it('eight tunes, each opening seven notes on the chimes', () => {
    expect(TUNES.map((t) => t.id)).toEqual([...TUNE_IDS]);
    for (const t of TUNES) {
      expect(t.opening, t.id).toHaveLength(7);
      expect(t.note.length).toBeGreaterThan(20);
    }
    expect(TUNES.find((t) => t.id === 'hot-cross-buns')!.opening.join(' ')).toBe('E D C E D C C');
    expect(TUNES.find((t) => t.id === 'ode-to-joy')!.opening.join(' ')).toBe('E E F G G F E');
  });

  it('Gentle plays the five that fit on C, D and E; the others all eight', () => {
    expect(TUNES.filter((t) => playable('gentle', t, 4)).map((t) => t.id)).toEqual(['hot-cross-buns', 'mary', 'frere-jacques', 'au-clair', 'aunt-rhody']);
    expect(TUNES.every((t) => playable('medium', t, 7))).toBe(true);
  });

  it('tunes not in the songbook come first; three rounds of Medium show all eight', () => {
    expect(roundQueue('medium', () => false, 0).slice(0, 3)).toEqual(['hot-cross-buns', 'mary', 'frere-jacques']);
    expect(new Set(Array.from({ length: 9 }, (_, k) => echoFor('medium', Math.floor(k / 3), k % 3).tune)).size).toBe(8);
    const known = new Set<string>(['hot-cross-buns', 'mary']);
    expect(roundQueue('medium', (id) => known.has(id), 0).slice(0, 3)).toEqual(['frere-jacques', 'au-clair', 'aunt-rhody']);
    expect(roundQueue('gentle', () => false, 0)).toHaveLength(5);
  });
});

describe('the echoes', () => {
  it('each a note longer: Gentle 2–4 on three chimes, Medium 4–6, Tricky 5–7', () => {
    for (const [band, lengths] of [['gentle', [2, 3, 4]], ['medium', [4, 5, 6]], ['tricky', [5, 6, 7]]] as const) {
      for (const e of echoes(band)) {
        expect(lengths).toContain(e.notes.length);
        for (const n of e.notes) expect(e.chimes).toContain(n);
      }
      expect([0, 1, 2].map((i) => echoFor(band, 0, i).notes.length)).toEqual(lengths);
    }
  });

  it('Gentle and Medium listen; Tricky reads, spots the wrong note, reads', () => {
    expect(new Set(echoes('gentle').map((e) => e.mode))).toEqual(new Set(['ear']));
    expect(new Set(echoes('medium').map((e) => e.mode))).toEqual(new Set(['ear']));
    expect([0, 1, 2].map((i) => echoFor('tricky', 0, i).mode)).toEqual(['staff', 'wrong', 'staff']);
  });

  it('a wrong note: one in the middle, a step off; the rest as written', () => {
    for (const e of echoes('tricky').filter((x) => x.mode === 'wrong')) {
      const w = e.wrongAt!;
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(e.notes.length - 1);
      expect(Math.abs(height(e.played[w]) - height(e.notes[w]))).toBe(1);
      e.played.forEach((n, k) => k !== w && expect(n).toBe(e.notes[k]));
    }
    for (const e of [...echoes('gentle'), ...echoes('medium')]) {
      expect(e.played).toEqual(e.notes);
      expect(e.wrongAt).toBeNull();
    }
  });

  it('every shape comes up in each band', () => {
    for (const band of BANDS) expect(new Set(echoes(band).map((e) => shape(e.notes)))).toEqual(new Set(['higher', 'lower', 'same']));
  });
});

describe('the checks and the words', () => {
  it('a note: right, or where the right one is', () => {
    const hcb = echoFor('medium', 0, 0); // Hot Cross Buns: E D C E
    expect(hcb.notes.join(' ')).toBe('E D C E');
    expect(judge(hcb, 0, 'E')).toBe('right');
    expect(judge(hcb, 1, 'E')).toBe('lower');
    expect(judge(hcb, 1, 'C')).toBe('higher');
    expect(tapWords(hcb, 1, 'E')).toBe('That was E. The second note is lower — try another chime.');
    expect(tapWords(hcb, 1, 'D')).toBe('D — yes!');
    expect(tapWords(hcb, 3, 'E')).toBe('That’s the whole tune!');
  });

  it('the shape, said kindly', () => {
    const hcb = echoFor('medium', 0, 0);
    expect(shape(hcb.notes)).toBe('same');
    expect(shapeWords(hcb, 'same')).toBe('Yes — the same: it starts and ends on E.');
    expect(shapeWords(hcb, 'higher')).toBe('Not quite: it starts and ends on E. The same note!');
    const mary = echoFor('medium', 0, 1); // E D C D E
    expect(shapeWords(mary, 'lower')).toBe('Not quite: it starts and ends on E. The same note!');
    const g = echoFor('gentle', 0, 1); // Mary, three notes: E D C
    expect(g.notes.join(' ')).toBe('E D C');
    expect(shapeWords(g, 'lower')).toBe('Yes — lower: it starts on E and ends on C, lower down.');
  });

  it('the ticket, the wrong note and the lessons', () => {
    expect(echoWords(echoFor('gentle', 0, 0))).toBe('Listen to Lyra’s two notes, then play them back on the chimes.');
    expect(echoWords(echoFor('tricky', 0, 0))).toBe('Read the five notes on the staff, then play them on the chimes.');
    const w = echoFor('tricky', 0, 1);
    const at = w.wrongAt!;
    expect(spotWords(w, at)).toMatch(/^Yes — the \w+ note! Lyra played [A-G], but the staff says [A-G]\.$/);
    expect(spotWords(w, 0)).toMatch(/^The first note was right/);
    expect(learnedLine(w)).toMatch(/a step too (high|low)\.$/);
    expect(learnedLine(echoFor('tricky', 0, 0))).toMatch(/E sits on the bottom line/);
    expect(learnedLine(echoFor('gentle', 0, 1))).toBe('Mary Had a Little Lamb starts E D C: it ends lower than it starts. A higher note is a shorter chime.');
  });
});
