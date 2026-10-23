import { describe, it, expect } from 'vitest';
import {
  CHIME,
  CHIMES,
  EXPERT_ASKS,
  EXPERT_THIRD,
  INTERVALS,
  INTERVAL_NAME,
  SEMITONES,
  asked,
  intervalOf,
  intervalQuestion,
  intervalWords,
  pairFor,
  pairsMaking,
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
import { BANDS, type PlayBand } from '../../content/minigames';

/** Words with their no-break spaces as spaces. */
const said = (s: string) => s.replace(/\u00a0/g, ' ');
const echoes = (band: PlayBand) => Array.from({ length: 24 }, (_, k) => echoFor(band, Math.floor(k / ECHOES_PER_ROUND), k % ECHOES_PER_ROUND));

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

describe('Expert: intervals (§8.5)', () => {
  it('every pair of the five chimes makes the interval a piano says — letter names for the number, semitones for its kind', () => {
    const want: Record<string, string> = {
      'C D': 'M2', 'D E': 'M2', 'E F': 'm2', 'F G': 'M2',
      'C E': 'M3', 'D F': 'm3', 'E G': 'm3',
      'C F': 'P4', 'D G': 'P4',
      'C G': 'P5',
    };
    for (const [pair, iv] of Object.entries(want)) {
      const [a, b] = pair.split(' ') as ['C', 'D'];
      expect(intervalOf(a, b), pair).toBe(iv);
      expect(intervalOf(b, a), pair).toBe(iv);
    }
    for (const n of NOTES) expect(intervalOf(n, n)).toBeNull();
    expect(SEMITONES).toEqual({ C: 0, D: 2, E: 4, F: 5, G: 7 });
    expect(INTERVALS.map((iv) => INTERVAL_NAME[iv])).toEqual(['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th', 'perfect 5th']);
  });

  it('read, heard, read; five to seven notes on all five chimes; each asks about two of its notes that make an interval', () => {
    const all = echoes('expert');
    for (const [k, e] of all.entries()) {
      expect(e.mode).toBe(['staff', 'ear', 'staff'][k % 3]);
      expect(e.notes).toHaveLength([5, 6, 7][k % 3]);
      expect(e.chimes).toEqual(NOTES);
      const q = asked(e)!;
      expect(q, e.tune).not.toBeNull();
      expect(q.at[0]).toBeLessThan(q.at[1]);
      expect(intervalOf(e.notes[q.at[0]], e.notes[q.at[1]])).toBe(q.interval);
    }
    // The rarest a tune makes: every kind comes up over the rounds; a fifth only where one's in the tune.
    expect(new Set(all.map((e) => asked(e)!.interval))).toEqual(new Set(INTERVALS));
    // Each tune's asks are made by its first five notes; a fifth wherever the notes make one.
    for (const t of TUNES) for (const iv of EXPERT_ASKS[t.id]) expect(pairsMaking(t.opening.slice(0, 5), iv), `${t.id} ${iv}`).not.toEqual([]);
    for (const turn of [0, 1, 5]) expect(pairFor('lightly-row', ['G', 'E', 'E', 'F', 'D', 'D', 'C'], turn)).toEqual([0, 6]);
    // The tune's intervals in turn; of the pairs that make one, the next each time it comes round.
    const buns = ['E', 'D', 'C', 'E', 'D'] as const;
    expect(pairsMaking(buns, 'M3')).toEqual([[0, 2], [2, 3]]);
    expect(pairsMaking(buns, 'M2')).toEqual([[0, 1], [0, 4], [1, 2], [1, 3], [2, 4], [3, 4]]);
    expect([0, 1, 2, 3, 4, 5].map((turn) => pairFor('hot-cross-buns', buns, turn))).toEqual([[0, 2], [0, 1], [2, 3], [0, 4], [0, 2], [1, 2]]);
    expect(pairFor('old-macdonald', ['G', 'G', 'G', 'D', 'E', 'E'], 1)).toEqual([0, 4]);
    expect(pairFor('old-macdonald', ['G', 'G', 'G', 'D', 'E', 'E'], 3)).toEqual([0, 5]);
    // The younger bands ask the shape, as ever.
    for (const band of BANDS) for (const e of echoes(band)) expect(e.pair).toBeNull();
  });

  it('each tune asks each of its intervals read and heard alike, from different notes; every third round, Lightly Row’s 5th', () => {
    // A full Songbook, four times round it (code review round 1: a tune read always asked one interval, heard the other).
    const tally: Record<string, Set<string>> = {};
    const firsts = new Set<number>();
    const pairs: Record<string, Set<string>> = {};
    for (let round = 0; round < 48; round++) {
      const queue = roundQueue('expert', () => true, round);
      // The third, the longest, in turn: the tunes with a minor 2nd or 3rd, a 4th or a 5th.
      expect(queue[2]).toBe(EXPERT_THIRD[round % 3]);
      expect(new Set(queue.slice(0, 3)).size).toBe(3);
      for (let i = 0; i < ECHOES_PER_ROUND; i++) {
        const e = echoFor('expert', round, i, queue);
        const q = asked(e)!;
        (tally[`${e.tune} ${e.mode}`] ??= new Set()).add(q.interval);
        (pairs[`${e.tune} ${q.interval}`] ??= new Set()).add(q.at.join('-'));
        firsts.add(q.at[0]);
        if (i === 2) expect(q.interval === 'P5').toBe(round % 3 === 0);
      }
    }
    for (const t of TUNES)
      for (const iv of EXPERT_ASKS[t.id]) {
        expect(tally[`${t.id} staff`], `${t.id} ${iv} read`).toContain(iv);
        expect(tally[`${t.id} ear`], `${t.id} ${iv} heard`).toContain(iv);
      }
    // Not always from note 1, nor always the same two.
    expect(firsts.size).toBeGreaterThanOrEqual(4);
    for (const [k, at] of Object.entries(pairs)) if (!k.endsWith('P5')) expect(at.size, k).toBeGreaterThan(1);
    // A new teen fills pages as ever: the tunes not in the book first.
    expect(roundQueue('expert', (id) => id !== 'mary' && id !== 'au-clair', 1).slice(0, 2)).toEqual(['au-clair', 'mary']);
    expect(roundQueue('expert', () => false, 0)).toEqual(['hot-cross-buns', 'mary', 'lightly-row', 'frere-jacques', 'au-clair', 'aunt-rhody', 'ode-to-joy', 'old-macdonald']);
  });

  it('the question by the notes’ places, not their names; the answer, the method either way', () => {
    const e = echoFor('expert', 0, 0, ['ode-to-joy', 'mary', 'au-clair']); // E E F G G — staff
    expect(asked(e)).toEqual({ a: 'E', b: 'F', at: [0, 2], interval: 'm2' });
    expect(intervalQuestion(e)).toBe('From note 1 to note 3: what interval? Count the lines and spaces from one to the other, both notes included.');
    expect(intervalQuestion(e)).not.toMatch(/[A-G]\b(?! interval)/);
    // Bare, the ask alone (the card shows how to count where there's room).
    expect(intervalQuestion(e, true)).toBe('From note 1 to note 3: what interval?');
    expect(intervalWords(e, 'm2')).toBe('Yes, a minor 2nd. E up to F: 2 letter names, E F — a 2nd; 1 semitone — minor.');
    expect(intervalWords(e, 'M2')).toBe('Not a major 2nd. E up to F: 2 letter names, E F — a 2nd; 1 semitone — minor. A minor 2nd.');
    expect(echoWords(e)).toBe('Read the five notes on the staff: name the interval Lyra asks about, then play them on the chimes.');
    expect(learnedLine(e)).toBe('Ode to Joy starts E E F G G: E to F is a minor 2nd, 1 semitone — a 2nd of 1 semitone is minor (E to F has no black key between).');
    const heard = echoFor('expert', 0, 1, ['ode-to-joy', 'old-macdonald', 'au-clair']); // G G G D E E — ear
    expect(asked(heard)?.interval).toBe('P4');
    expect(intervalQuestion(heard)).toBe('From note 1 to note 4: what interval? Count the chimes from one to the other, both included.');
    // The letters the way the tune goes, and the semitones step by step (UX review round 1).
    expect(said(intervalWords(heard, 'P4'))).toBe('Yes, a perfect 4th. G down to D: 4 letter names, G F E D — a 4th; G–F 2 + F–E 1 + E–D 2 = 5 semitones — perfect.');
    expect(intervalWords(heard, 'P4')).toContain('G–F\u00a02 + F–E\u00a01');
    expect(echoWords(heard)).toMatch(/^Listen to Lyra’s six notes: name the interval/);
    expect(learnedLine(heard)).toBe('Old MacDonald starts G G G D E E: G to D is a perfect 4th, 5 semitones — a 4th of 5 semitones is perfect.');
    // Down a 3rd, and Lightly Row's 5th.
    const buns = echoFor('expert', 0, 0, ['hot-cross-buns', 'mary', 'lightly-row']);
    expect(said(intervalWords(buns, 'm3'))).toBe('Not a minor 3rd. E down to C: 3 letter names, E D C — a 3rd; E–D 2 + D–C 2 = 4 semitones — major. A major 3rd.');
    const fifth = echoFor('expert', 0, 2, ['hot-cross-buns', 'mary', 'lightly-row']);
    expect(said(intervalWords(fifth, 'P5'))).toBe('Yes, a perfect 5th. G down to C: 5 letter names, G F E D C — a 5th; G–F 2 + F–E 1 + E–D 2 + D–C 2 = 7 semitones — perfect.');
    expect(learnedLine(fifth)).toBe('Lightly Row starts G E E F D D C: G to C is a perfect 5th, 7 semitones — a 5th of 7 semitones is perfect — the first and fifth notes of the scale.');
    // A chime played back, plainly.
    expect(tapWords(buns, 0, 'E')).toBe('E, 1 of 5.');
    expect(tapWords(buns, 4, 'D')).toBe('That’s the whole tune.');
    expect(tapWords(buns, 1, 'C')).toBe('That was C. The second note is higher — a shorter chime, further right.');
  });
});
