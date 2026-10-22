import { describe, it, expect } from 'vitest';
import {
  FREE_PALETTE,
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
  mirrored,
  mismatches,
  mix,
  mixWords,
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
  });

  it('opposites go both ways round the colour wheel', () => {
    for (const [a, b] of Object.entries(OPPOSITE)) expect(OPPOSITE[b!]).toBe(a);
  });

  it('every colour has a name and a paint', () => {
    for (const c of Object.keys(HEX)) expect(NAME[c as keyof typeof NAME]).toBeTruthy();
    expect(NAME.sky).toBe('sky blue');
  });
});

describe('mirrors', () => {
  it('each kind copies the right square', () => {
    expect(source('across', 2, 4)).toEqual([2, 1]);
    expect(source('down', 4, 2)).toEqual([1, 2]);
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
          expect(job.goal[r][c]).toBe(job.kind === 'opposite' && v ? OPPOSITE[v] : v);
        }
      }
    }
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
    expect(checkWords(job, job.goal)).toBe('A perfect match!');
    const one = job.goal.map((row) => [...row]);
    const [r, c] = toPaint(job.kind).find(([rr, cc]) => job.goal[rr][cc])!;
    one[r][c] = null;
    expect(mismatches(job, one)).toEqual([[r, c]]);
    expect(checkWords(job, one)).toBe('One square doesn’t match yet — it’s marked. Look at the square the mirror copies.');
    one[r][c + (c < 5 ? 1 : -1)] = 'red';
    expect(checkWords(job, one)).toMatch(/^(Two squares don’t match yet — they’re marked\.|One square)/);
  });

  it('the ticket, the mix and what it teaches', () => {
    expect(jobWords(job)).toBe('Paint the right half as the left half’s mirror. Mix purple first.');
    expect(mixWords('red', 'blue', 'purple')).toBe('Red and blue make purple!');
    expect(mixWords('red', 'yellow', 'purple')).toBe('Red and yellow make orange — the picture needs purple. Try two others!');
    expect(mixWords('blue', 'blue', 'purple')).toBe('That’s just blue — mix two different pots.');
    expect(mixWords('blue', 'white', 'sky')).toBe('Blue and white make sky blue!');
    expect(learnedLine(job)).toBe('Red and blue make purple; a mirror line down the middle makes the right half the left half flipped.');
    expect(learnedLine(jobs('tricky').find((j) => j.kind === 'turn')!)).toMatch(/rotational symmetry\.$/);
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
    expect(decodeMine('-'.repeat(18))!.flat().every((v) => v === null)).toBe(true);
  });

  it('a free canvas shows the left half mirrored', () => {
    const pic: Grid = Array.from({ length: SIZE }, () => ['red', 'blue', null, 'green', 'green', 'green']);
    expect(mirrored(pic)[0]).toEqual(['red', 'blue', null, null, 'blue', 'red']);
  });
});
