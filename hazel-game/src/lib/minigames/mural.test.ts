import { describe, it, expect } from 'vitest';
import {
  COLOURS,
  FREE_PALETTE,
  GLYPH,
  HEX,
  JOBS_PER_ROUND,
  NAME,
  OPPOSITE,
  PATTERNS,
  PATTERN_IDS,
  POTS,
  SIZE,
  checkWords,
  decodeMine,
  encodeMine,
  given,
  jobFor,
  jobWords,
  learnedLine,
  markWords,
  mirrorWords,
  mirrored,
  mismatches,
  mix,
  mixWords,
  num,
  opposite,
  paintFirstWords,
  recipe,
  roundQueue,
  source,
  start,
  toPaint,
  type Grid,
  type Kind,
} from './mural';
import { BANDS, MINIGAMES } from '../../content/minigames';

const jobs = (band: (typeof BANDS)[number]) => Array.from({ length: 36 }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
const KINDS: readonly Kind[] = ['across', 'down', 'four', 'turn', 'opposite'];

describe('paint (docs/DESIGN-MINIGAMES.md §5.4)', () => {
  it('two pots mix as paint does', () => {
    expect(mix('red', 'blue')).toBe('purple');
    expect(mix('blue', 'red')).toBe('purple');
    expect(mix('red', 'yellow')).toBe('orange');
    expect(mix('yellow', 'blue')).toBe('green');
    expect(mix('red', 'white')).toBe('pink');
    expect(mix('blue', 'white')).toBe('sky');
    expect(mix('yellow', 'white')).toBe('cream');
    expect(mix('red', 'red')).toBe('red');
    expect(recipe('purple')).toEqual(['red', 'blue']);
    expect(recipe('cream')).toEqual(['yellow', 'white']);
    expect(recipe('red')).toBeNull();
    // Every pair of pots makes a colour (mix is total).
    for (const a of POTS.tricky) for (const b of POTS.tricky) expect(HEX[mix(a, b)], `${a}+${b}`).toBeTruthy();
  });

  it('opposites go both ways round the colour wheel', () => {
    for (const [a, b] of Object.entries(OPPOSITE)) expect(opposite(b)).toBe(a);
    expect(opposite('pink')).toBeNull();
  });

  it('every colour has a name, a paint and its own letter', () => {
    for (const c of Object.keys(HEX)) expect(NAME[c as keyof typeof NAME]).toBeTruthy();
    expect(NAME.sky).toBe('sky blue');
    expect(new Set(COLOURS.map((c) => GLYPH[c])).size).toBe(COLOURS.length);
    expect(GLYPH.purple).toBe('P');
  });
});

describe('mirrors', () => {
  it('each kind copies the right square', () => {
    expect(source('across', 2, 4)).toEqual([2, 1]);
    expect(source('down', 4, 2)).toEqual([1, 2]);
    expect(source('down', 3, 2)).toEqual([2, 2]);
    expect(source('down', 5, 0)).toEqual([0, 0]);
    expect(source('down', 1, 4)).toEqual([1, 4]);
    expect(source('four', 5, 5)).toEqual([0, 0]);
    expect(source('four', 4, 1)).toEqual([1, 1]);
    expect(source('turn', 5, 5)).toEqual([0, 0]);
    expect(source('turn', 3, 1)).toEqual([2, 4]);
    expect(source('opposite', 0, 5)).toEqual([0, 0]);
  });

  it('the kid paints half — three quarters for four ways', () => {
    for (const k of KINDS) {
      const n = toPaint(k).length;
      expect(n, k).toBe(k === 'four' ? 27 : 18);
      for (const [r, c] of toPaint(k)) expect(given(k, r, c)).toBe(false);
    }
  });

  it('every pattern is the same across and down (so every mirror fits it)', () => {
    for (const p of PATTERNS) {
      expect(p.rows).toHaveLength(SIZE);
      for (const row of p.rows) {
        expect(row).toHaveLength(SIZE);
        expect(row, p.id).toBe([...row].reverse().join(''));
      }
      p.rows.forEach((row, r) => expect(row, p.id).toBe(p.rows[SIZE - 1 - r]));
    }
  });
});

describe('the jobs', () => {
  it('the paint to mix can be made from the band’s pots, and is painted with', () => {
    for (const band of BANDS) {
      for (const job of jobs(band)) {
        const r = recipe(job.mixColour);
        expect(r, `${band} ${job.mixColour}`).not.toBeNull();
        for (const pot of r!) expect(POTS[band]).toContain(pot);
        expect(job.palette[0]).toBe(job.mixColour);
        // Every colour the kid must paint is in the palette.
        for (const [rr, c] of toPaint(job.kind)) if (job.goal[rr][c]) expect(job.palette, `${band} ${job.kind}`).toContain(job.goal[rr][c]);
        // And the mixed paint is needed.
        expect(toPaint(job.kind).some(([rr, c]) => job.goal[rr][c] === job.mixColour)).toBe(true);
      }
    }
  });

  it('Gentle mixes purple across one line; Medium across and down; Tricky four ways, half turns and opposites, with tints', () => {
    expect(new Set(jobs('gentle').map((j) => j.kind))).toEqual(new Set(['across']));
    expect(new Set(jobs('gentle').map((j) => j.mixColour))).toEqual(new Set(['purple']));
    expect(new Set(jobs('medium').map((j) => j.kind))).toEqual(new Set(['across', 'down']));
    expect(new Set(jobs('tricky').map((j) => j.kind))).toEqual(new Set(['four', 'turn', 'opposite']));
    expect(jobs('tricky').some((j) => ['pink', 'sky', 'cream'].includes(j.mixColour))).toBe(true);
  });

  it('a goal is its pattern mirrored: the kid’s half matches the given half by its rule', () => {
    for (const band of BANDS) {
      for (const job of jobs(band)) {
        for (const [r, c] of toPaint(job.kind)) {
          const [sr, sc] = source(job.kind, r, c);
          const v = job.goal[sr][sc];
          expect(job.goal[r][c]).toBe(job.kind === 'opposite' && v ? opposite(v) : v);
        }
      }
    }
  });

  it('a mirror down: the bottom row is the top one, the row under the line the one over it', () => {
    const down = jobs('medium').find((j) => j.kind === 'down')!;
    expect(down.goal[5]).toEqual(down.goal[0]);
    expect(down.goal[3]).toEqual(down.goal[2]);
    expect(down.goal[4]).toEqual(down.goal[1]);
  });

  it('a half turn isn’t the top half flipped down: a pinwheel, the same after half a turn only', () => {
    const turns = BANDS.flatMap((b) => jobs(b)).filter((j) => j.kind === 'turn');
    expect(turns.length).toBeGreaterThan(0);
    for (const job of turns) {
      const flipped = toPaint('turn').some(([r, c]) => job.goal[r][c] !== job.goal[SIZE - 1 - r][c]);
      expect(flipped, job.pattern).toBe(true);
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) expect(job.goal[r][c]).toBe(job.goal[SIZE - 1 - r][SIZE - 1 - c]);
    }
  });

  it('no half of a picture is two colours a colour-blind eye mixes up — opposites set side by side, the halves apart', () => {
    const muddled = [new Set(['purple', 'blue']), new Set(['red', 'green']), new Set(['red', 'orange']), new Set(['green', 'blue'])];
    const mixedUp = (cs: Set<unknown>) => muddled.some((m) => [...cs].every((c) => m.has(c as string)));
    for (const band of BANDS) {
      for (const job of jobs(band)) {
        const given = new Set(job.goal.flatMap((row, r) => row.filter((v, c) => v && !toPaint(job.kind).some(([rr, cc]) => rr === r && cc === c))));
        const painted = new Set(toPaint(job.kind).map(([r, c]) => job.goal[r][c]).filter(Boolean));
        expect(given.size, `${band} ${job.pattern}`).toBe(2);
        expect(mixedUp(given), `${band} ${job.pattern} given`).toBe(false);
        if (job.kind === 'opposite') expect(mixedUp(painted), `${band} ${job.pattern} painted`).toBe(false);
      }
    }
  });

  it('a round’s three pictures are its queue’s first three, in turn', () => {
    const q = roundQueue((id) => id === 'butterfly', 0);
    for (const band of BANDS) for (const i of [0, 1, 2]) expect(jobFor(band, 0, i, q).pattern).toBe(q[i]);
  });

  it('each band asks in turn: Medium across then down; Tricky four ways, a half turn, opposites', () => {
    expect([0, 1, 2, 3, 4].map((k) => jobFor('medium', 0, k).kind)).toEqual(['across', 'down', 'across', 'down', 'across']);
    expect([0, 1, 2].map((k) => jobFor('tricky', 0, k).kind)).toEqual(['four', 'turn', 'opposite']);
    expect(jobFor('tricky', 1, 0).kind).toBe('four');
    expect(new Set(jobs('gentle').map((j) => j.palette[1])).size).toBeGreaterThan(1);
    expect(new Set(jobs('tricky').map((j) => j.mixColour)).size).toBeGreaterThan(2);
  });

  it('an opposite mirror’s palette is the whole colour wheel', () => {
    const opp = jobs('tricky').find((j) => j.kind === 'opposite')!;
    expect([...opp.palette].sort()).toEqual(['blue', 'green', 'orange', 'purple', 'red', 'yellow']);
  });

  it('three rounds show all nine pictures; those not in the Gallery come first', () => {
    for (const band of BANDS) expect(new Set(Array.from({ length: 9 }, (_, k) => jobFor(band, Math.floor(k / 3), k % 3).pattern)).size).toBe(9);
    expect(MINIGAMES['mirror-mural'].pages).toBe(PATTERNS.length);
    expect(roundQueue(() => false, 0).slice(0, 3)).toEqual(['butterfly', 'window', 'flower']);
    expect(roundQueue(() => false, 1).slice(0, 3)).toEqual(['diamond', 'snowflake', 'lantern']);
    const seen = new Set<string>(['butterfly', 'window', 'flower']);
    expect(roundQueue((id) => seen.has(id), 0).slice(0, 3)).toEqual(['diamond', 'snowflake', 'lantern']);
    const job = jobFor('tricky', 0, 0, roundQueue((id) => seen.has(id), 0));
    expect(job.pattern).toBe('diamond');
    expect(job.kind).toBe(jobFor('tricky', 0, 0).kind);
    expect(PATTERN_IDS).toHaveLength(9);
  });
});

describe('the check and the words', () => {
  const job = jobFor('gentle', 0, 0);

  it('the start has the given part painted and the rest bare; a full copy matches', () => {
    const s = start(job);
    expect(mismatches(job, s).length).toBeGreaterThan(0);
    expect(mismatches(job, job.goal)).toEqual([]);
    // A wrong paint doesn't match either.
    const wrong = job.goal.map((row) => [...row]);
    const [wr, wc] = toPaint(job.kind).find(([rr, cc]) => job.goal[rr][cc] === 'purple')!;
    wrong[wr][wc] = 'red';
    expect(mismatches(job, wrong)).toEqual([[wr, wc]]);
    expect(checkWords(job, job.goal)).toBe('A perfect match!');
    const one = job.goal.map((row) => [...row]);
    const [r, c] = toPaint(job.kind).find(([rr, cc]) => job.goal[rr][cc])!;
    one[r][c] = null;
    expect(mismatches(job, one)).toEqual([[r, c]]);
    expect(checkWords(job, one)).toBe('One square doesn’t match yet — it’s marked. Look at the square the mirror copies.');
    // Paint on a square that should stay bare doesn't match either.
    const bare = job.goal.map((row) => [...row]);
    const [br, bc] = toPaint(job.kind).find(([rr, cc]) => !job.goal[rr][cc])!;
    bare[br][bc] = 'red';
    expect(mismatches(job, bare)).toEqual([[br, bc]]);
    expect(markWords(2)).toBe('Two squares don’t match yet — they’re marked. Look at the square the mirror copies.');
    expect(markWords(14)).toMatch(/^Fourteen squares/);
    expect([13, 20, 21, 27].map(num)).toEqual(['thirteen', 'twenty', 'twenty-one', 'twenty-seven']);
    expect(paintFirstWords('four')).toBe('Paint the other three quarters first, darling — then hold up the mirror!');
  });

  it('the ticket, the mix and what it teaches', () => {
    expect(jobWords(job)).toBe('Paint the right half as the left half’s mirror. Mix purple first.');
    expect(mixWords('red', 'blue', 'purple')).toBe('Red and blue make purple!');
    expect(mixWords('red', 'yellow', 'purple')).toBe('Red and yellow make orange — the picture needs purple. Try two others!');
    expect(mixWords('blue', 'blue', 'purple')).toBe('That’s just blue — mix two different pots.');
    expect(mixWords('blue', 'white', 'sky')).toBe('Blue and white make sky blue!');
    expect(learnedLine(job)).toBe('Red and blue make purple; a mirror line down the middle makes the right half the left half flipped.');
    expect(learnedLine(jobs('tricky').find((j) => j.kind === 'turn')!)).toMatch(/rotational symmetry\.$/);
    expect(jobWords(jobs('tricky').find((j) => j.kind === 'turn')!)).toMatch(/^Turn it half round: paint the bottom half as the top half upside down\. Mix /);
    const opp = jobs('tricky').find((j) => j.kind === 'opposite')!;
    expect(learnedLine(opp)).toMatch(/; opposite colours sit across the colour wheel: red and green, yellow and purple, blue and orange\.$/);
    expect(mirrorWords('down')).toBe('Paint the bottom half as the top half’s mirror.');
  });
});

describe('the kid’s own picture', () => {
  it('is kept as the left half, and comes back mirrored', () => {
    const pic: Grid = Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => (c < 3 ? FREE_PALETTE[(r + c) % FREE_PALETTE.length] : null)));
    const code = encodeMine(pic);
    expect(code).toHaveLength(18);
    expect(decodeMine(code)).toEqual(mirrored(pic));
    expect(decodeMine('nope')).toBeNull();
    expect(decodeMine('x'.repeat(18))).toBeNull();
    expect(decodeMine('r'.repeat(17))).toBeNull();
    expect(decodeMine('r'.repeat(19))).toBeNull();
    expect(decodeMine('-'.repeat(18))!.flat().every((v) => v === null)).toBe(true);
  });

  it('a free canvas shows the left half mirrored', () => {
    const pic: Grid = Array.from({ length: SIZE }, () => ['red', 'blue', null, 'green', 'green', 'green']);
    expect(mirrored(pic)[0]).toEqual(['red', 'blue', null, null, 'blue', 'red']);
  });
});
