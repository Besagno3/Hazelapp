import { describe, it, expect } from 'vitest';
import {
  CHIME,
  CHIMES,
  PLACE,
  STAFF_LINES,
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
  shapeQuestion,
  shapeWords,
  spotWords,
  staffY,
  tapWords,
} from './echo';
import { BANDS, type Band } from '../../content/minigames';

const echoes = (band: Band) => Array.from({ length: 24 }, (_, k) => echoFor(band, Math.floor(k / ECHOES_PER_ROUND), k % ECHOES_PER_ROUND));

describe('the chimes (docs/DESIGN-MINIGAMES.md §5.5)', () => {
  it('five, C to G, low to high; each its own colour and name', () => {
    expect(NOTES).toEqual(['C', 'D', 'E', 'F', 'G']);
    // Middle C up to G, tuned as a piano is.
    expect(NOTES.map((n) => CHIME[n].hz)).toEqual([261.63, 293.66, 329.63, 349.23, 392.0]);
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
    // Every opening pinned: a note out is a wrong tune taught.
    expect(Object.fromEntries(TUNES.map((t) => [t.id, t.opening.join(' ')]))).toEqual({
      'hot-cross-buns': 'E D C E D C C',
      mary: 'E D C D E E E',
      'frere-jacques': 'C D E C C D E',
      'au-clair': 'C C C D E D C',
      'aunt-rhody': 'E E D C C D D',
      'ode-to-joy': 'E E F G G F E',
      'old-macdonald': 'G G G D E E D',
      'lightly-row': 'G E E F D D C',
    });
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
      if (e.mode !== 'wrong') continue;
      const w = e.wrongAt;
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(e.notes.length - 1);
      expect(Math.abs(height(e.played[w]) - height(e.notes[w]))).toBe(1);
      // A step up — down only from the top, G.
      expect(height(e.played[w]) - height(e.notes[w])).toBe(e.notes[w] === 'G' ? -1 : 1);
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

describe('the staff (Tricky)', () => {
  it('each note drawn where its place says: E on the bottom line, F the space above, G the next line; D just under; C on a line of its own', () => {
    const [, , , second, bottom] = STAFF_LINES;
    expect(staffY('E')).toBe(bottom);
    expect(staffY('G')).toBe(second);
    expect(staffY('F')).toBe((bottom + second) / 2);
    expect(staffY('D')).toBeGreaterThan(bottom);
    expect(staffY('C')).toBe(bottom + (bottom - second));
    expect(PLACE).toEqual({
      C: 'on a little line below the staff',
      D: 'just under the staff',
      E: 'on the bottom line',
      F: 'in the bottom space',
      G: 'on the second line',
    });
  });
});

describe('the checks and the words', () => {
  it('a note: right, or where the right one is', () => {
    const hcb = echoFor('medium', 0, 0); // Hot Cross Buns: E D C E
    expect(hcb.notes.join(' ')).toBe('E D C E');
    expect(judge(hcb, 0, 'E')).toBe('right');
    expect(judge(hcb, 1, 'E')).toBe('lower');
    expect(judge(hcb, 1, 'C')).toBe('higher');
    expect(tapWords(hcb, 1, 'E')).toBe('That was E. The second note is lower — a longer chime, further left.');
    expect(tapWords(hcb, 1, 'C')).toBe('That was C. The second note is higher — a shorter chime, further right.');
    expect(tapWords(hcb, 1, 'D')).toBe('D — yes! 2 of 4.');
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
    expect(shapeWords(g, 'lower')).toBe('Yes — lower: it starts on E and ends on C — a longer chime, further left.');
    const up = echoFor('medium', 0, 2); // Frère Jacques, six: C D E C C D
    expect(shapeWords(up, 'same')).toBe('Not quite: it starts on C and ends on D — a shorter chime, further right. Higher!');
    // Read from the staff, the notes are said by their place: reading them is the job.
    const read = echoFor('tricky', 0, 0); // Hot Cross Buns, five: E D C E D
    expect(shapeQuestion(read)).toBe('Read the staff: does the last note sit higher, lower or the same as the first?');
    expect(shapeQuestion(g)).toBe('Did the tune end higher, lower or the same as it started? Higher notes are shorter chimes, further right.');
    expect(shapeWords(read, 'lower')).toBe('Yes — lower: it starts on the bottom line and ends just under the staff, lower down.');
    expect(shapeWords(read, 'same')).toBe('Not quite: it starts on the bottom line and ends just under the staff, lower down. Lower!');
  });

  it('the ticket, the wrong note and the lessons', () => {
    expect(echoWords(echoFor('gentle', 0, 0))).toBe('Listen to Lyra’s two notes, then play them back on the chimes.');
    expect(echoWords(echoFor('tricky', 0, 0))).toBe('Read the five notes on the staff, then play them on the chimes.');
    const w = echoFor('tricky', 0, 1); // Mary, six: E D C D E E — Lyra plays the C a step up
    if (w.mode !== 'wrong') throw new Error('a wrong-note echo');
    expect(w.played.join(' ')).toBe('E D D D E E');
    expect(spotWords(w, 2)).toBe('Yes — the third note! Lyra played D, but the staff says C.');
    expect(spotWords(w, 0)).toBe('The first note was right: the staff says E, and Lyra played E. Watch the chimes again!');
    expect(learnedLine(w)).toBe('Mary Had a Little Lamb starts E D C D E E: Lyra’s third note was D, a step too high.');
    // At the top (G), she plays it a step down.
    const low = echoFor('tricky', 7, 1); // Old MacDonald, six: G G G D E E
    if (low.mode !== 'wrong') throw new Error('a wrong-note echo');
    expect(low.played.join(' ')).toBe('G F G D E E');
    expect(learnedLine(low)).toBe('Old MacDonald starts G G G D E E: Lyra’s second note was F, a step too low.');
    expect(learnedLine(echoFor('tricky', 0, 0))).toMatch(/E sits on the bottom line/);
    expect(learnedLine(echoFor('gentle', 0, 1))).toBe('Mary Had a Little Lamb starts E D C: it ends lower than it starts. A higher note is a shorter chime.');
    expect(learnedLine(echoFor('medium', 0, 0))).toBe('Hot Cross Buns starts E D C E: it ends on the note it started on. A higher note is a shorter chime.');
  });
});
