import { describe, it, expect } from 'vitest';
import {
  COLOURS,
  FREE_PALETTE,
  GLYPH,
  HEX,
  JOBS_PER_ROUND,
  MOVES,
  MOVE_NAME,
  NAME,
  OPPOSITE,
  PATTERNS,
  PATTERN_IDS,
  POTS,
  SIZE,
  checkWords,
  decodeMine,
  fakes,
  encodeMine,
  given,
  jobFor,
  jobWords,
  learnedLine,
  mapPoint,
  markWords,
  mirrorWords,
  mirrored,
  mismatches,
  mix,
  nameAsk,
  mixWords,
  nameWords,
  num,
  opposite,
  pImage,
  paintFirstWords,
  recipe,
  roundQueue,
  ruleWords,
  source,
  start,
  tie,
  toPaint,
  type Cell,
  type Grid,
  type Kind,
  type Move,
  type Point,
} from './mural';
import { BANDS, MINIGAMES, PLAY_BANDS, type PlayBand } from '../../content/minigames';

const jobs = (band: PlayBand) => Array.from({ length: 36 }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
const KINDS: readonly Kind[] = ['across', 'down', 'four', 'turn', 'opposite'];
/** Words as read: Expert keeps an expression on one line with no-break spaces (`tie`). */
const sp = (s: string) => s.replace(/\u00a0/g, ' ');

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
    for (const band of PLAY_BANDS) {
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
    const turns = PLAY_BANDS.flatMap((b) => jobs(b)).filter((j) => j.kind === 'turn');
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
    for (const band of PLAY_BANDS) {
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
    for (const band of PLAY_BANDS) for (const i of [0, 1, 2]) expect(jobFor(band, 0, i, q).pattern).toBe(q[i]);
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

describe('Expert: transformations on a coordinate grid (§8.5)', () => {
  /** A square's four corners, x across and y up from the canvas's bottom-left corner. */
  const corners = (r: number, c: number): Point[] => [
    [c, SIZE - 1 - r],
    [c + 1, SIZE - 1 - r],
    [c, SIZE - r],
    [c + 1, SIZE - r],
  ];
  const same = (a: readonly Point[], b: readonly Point[]) => JSON.stringify(a.map(String).sort()) === JSON.stringify(b.map(String).sort());
  const turned = (m: Move, p: Point, n: number): Point => (n === 0 ? p : turned(m, mapPoint(m, p), n - 1));

  it('each move takes every square of the painted part onto the square it makes — corner for corner', () => {
    for (const move of MOVES) {
      for (const [r, c] of toPaint(move)) {
        const [sr, sc] = source(move, r, c);
        // The quarter turns' three other quarters, clockwise (code review round 1: any number of turns passed): the
        // painted one turned once to the top right, twice to the bottom right, three times to the bottom left.
        const n = move !== 'quarter' ? 1 : r < SIZE / 2 ? 1 : c >= SIZE / 2 ? 2 : 3;
        expect(same(corners(sr, sc).map((p) => turned(move, p, n)), corners(r, c)), `${move} ${r},${c}`).toBe(true);
      }
    }
    // The painted part: half; a triangle with the squares on y = x (their own image); a quarter.
    expect(MOVES.map((m) => toPaint(m).length)).toEqual([18, 18, 15, 18, 27, 18]);
    for (let k = 0; k < SIZE; k++) expect(given('diag', SIZE - 1 - k, k)).toBe(true);
  });

  it('A: in every move’s painted part, off its lines, and each move takes it somewhere else inside the canvas', () => {
    for (const job of jobs('expert')) {
      const images = MOVES.map((m) => String(mapPoint(m, job.p)));
      expect(new Set(images).size, String(job.p)).toBe(MOVES.length);
      expect(images).not.toContain(String(job.p));
      for (const m of MOVES) for (const v of mapPoint(m, job.p)) expect(v > 0 && v < SIZE, `${m} ${job.p}`).toBe(true);
      // The square A is the top-right corner of is painted on every move: x < 3, y > 3, above y = x.
      const [x, y] = job.p;
      expect(x > 0 && x < 3 && y > 3 && y < SIZE && y > x).toBe(true);
      expect(pImage(job)).toEqual(mapPoint(job.kind as Move, job.p));
    }
  });

  it('the six moves over two rounds, each once; no paint to mix — the palette is the picture’s two colours', () => {
    const six = [0, 1].flatMap((round) => [0, 1, 2].map((i) => jobFor('expert', round, i)));
    expect(six.map((j) => j.kind)).toEqual(['across', 'diag', 'quarter', 'shift', 'turn', 'down']);
    for (const job of jobs('expert')) {
      expect(job.expert).toBe(true);
      expect(MOVES).toContain(job.kind);
      expect(job.palette).toHaveLength(2);
      for (const [r, c] of toPaint(job.kind)) if (job.goal[r][c]) expect(job.palette).toContain(job.goal[r][c]);
    }
    for (const band of BANDS) expect(jobs(band).every((j) => !j.expert)).toBe(true);
  });

  it('the words: A and A′ till the move’s named, then the move; a wrong move says where it takes A; a miss gives the rule; the lesson', () => {
    const job = jobFor('expert', 0, 1); // reflect in y = x, A (2, 5)
    expect(job.kind).toBe('diag');
    expect(sp(jobWords(job, false))).toBe('A (2, 5) maps to A′ (5, 2). Name the move, then paint the image.');
    expect(sp(jobWords(job))).toBe('Reflect the top-left triangle in the line y = x.');
    expect(jobWords(job, false)).not.toMatch(/Reflect|Rotate|Translate|Mix/);
    expect(sp(nameWords(job, 'diag'))).toBe('Reflect in y = x: A goes to (5, 2).');
    expect(sp(nameWords(job, 'turn'))).toBe('Rotate 180° about (3, 3): A goes to (4, 1), not (5, 2). Try another.');
    expect(sp(markWords(2, job))).toBe('Two squares don’t match yet — they’re marked. A reflection in y = x swaps the coordinates: (x, y) goes to (y, x).');
    expect(paintFirstWords(job.kind, true)).toBe('Paint the image first — the bottom-right triangle — then check it.');
    expect(sp(learnedLine(job))).toMatch(/^A reflection in y = x swaps the coordinates/);
    expect(sp(mirrorWords('quarter', true))).toBe('Rotate the top-left quarter 90°, 180° and 270° clockwise about (3, 3).');
    // Every move has its button and its own lesson; none says "darling" or mixes paint.
    expect(new Set(MOVES.map((m) => MOVE_NAME[m])).size).toBe(6);
    const lessons = jobs('expert').map(learnedLine);
    expect(new Set(lessons).size).toBe(6);
    for (const l of lessons) expect(l).not.toMatch(/darling|make (purple|orange|green|pink)/i);
  });

  it('each move’s rule, lesson and wrong-move line agree with where the move takes a point (code review round 1)', () => {
    /** "6 − x", "x + 3", "y" at a point. */
    const at = (e: string, [x, y]: Point) => {
      const v = (t: string) => (t === 'x' ? x : t === 'y' ? y : Number(t));
      const [a, op, b] = e.split(' ');
      return op === undefined ? v(a) : op === '−' ? v(a) - v(b) : v(a) + v(b);
    };
    for (const m of MOVES) {
      const job = jobs('expert').find((j) => j.kind === m)!;
      // The rule after a miss, and the lesson: "(x, y) to (6 − x, y)".
      for (const words of [ruleWords(m), learnedLine(job)]) {
        const [, ex, ey] = /\(x, y\) (?:goes )?to \(([^,]+), ([^)]+)\)/.exec(sp(words))!;
        for (const p of [[1, 4], [2, 5], [0, 0], [6, 2]] as Point[]) expect([at(ex, p), at(ey, p)], `${m} ${p}: ${words}`).toEqual(mapPoint(m, p));
      }
      // A wrong move says where it takes A.
      const other = MOVES.find((o) => o !== m)!;
      expect(sp(nameWords(job, other))).toContain(`A goes to (${mapPoint(other, job.p).join(', ')}), not (${pImage(job).join(', ')}).`);
    }
  });

  it('an expression never breaks across lines: no-break spaces round =, −, + and in a pair (UX review round 1)', () => {
    expect(tie('x = 3, (6 − x, y) and (x + 3, y)')).toBe('x\u00a0=\u00a03, (6\u00a0−\u00a0x,\u00a0y) and (x\u00a0+\u00a03,\u00a0y)');
    const said = [
      ...MOVES.flatMap((m) => [MOVE_NAME[m], mirrorWords(m, true), ruleWords(m)]),
      ...jobs('expert').flatMap((j) => [learnedLine(j), jobWords(j, false), ...MOVES.map((m) => nameWords(j, m))]),
    ];
    for (const w of said) expect(w, w).not.toMatch(/ [=−+] |\([^()]*, [^()]*\)/);
  });

  it('each pair of rounds turns the moves’ order on one and gives each move the other A, so the third round isn’t the first again (UX review rounds 1 and 2)', () => {
    const pair = (n: number) => Array.from({ length: 6 }, (_, s) => jobFor('expert', 2 * n + Math.floor(s / 3), s % 3));
    for (let n = 0; n < 3; n++) {
      const [now, next] = [pair(n), pair(n + 1)];
      // All six, each once, in every pair; each round's three the same three.
      expect(now.map((j) => j.kind).sort()).toEqual([...MOVES].sort());
      for (const half of [0, 3]) expect(next.slice(half, half + 3).map((j) => j.kind).sort()).toEqual(now.slice(half, half + 3).map((j) => j.kind).sort());
      // Picture 1 of each round asks another move, and each move another A.
      expect(next[0].kind).not.toBe(now[0].kind);
      expect(next[3].kind).not.toBe(now[3].kind);
      for (const m of MOVES) expect(next.find((j) => j.kind === m)!.p, m).not.toEqual(now.find((j) => j.kind === m)!.p);
    }
    // The first two rounds as they were.
    expect(pair(0).map((j) => j.kind)).toEqual(['across', 'diag', 'quarter', 'shift', 'turn', 'down']);
    expect(pair(1).map((j) => j.kind)).toEqual(['diag', 'quarter', 'across', 'turn', 'down', 'shift']);
  });

  it('A is kept with its point (UX review round 2: "A / (1, 4)" broke across lines)', () => {
    expect(nameAsk(jobFor('expert', 0, 0))).toBe('A\u00a0(1,\u00a04) maps to A′\u00a0(5,\u00a04).');
  });

  it('no other way of copying the painted part paints an Expert picture right: every pattern under every move (code review rounds 1 and 2)', () => {
    // Every pattern is the same across and down, and five are the same corner to corner, so as they came a half turn
    // painted x = 3's picture, and two mirrors a quarter turn's. The ways are written out here, apart from the game's
    // own list (code review round 2: the test read the list it checked). Each gives the square a kid's square is copied
    // from; rows go down, so y = x runs from the bottom-left corner.
    const M = SIZE - 1;
    const H = SIZE / 2;
    type Way = (r: number, c: number) => readonly [number, number];
    const ways: Record<string, Way> = {
      ...Object.fromEntries((['across', 'down', 'four', 'turn', 'diag', 'quarter', 'shift'] as const).map((k) => [k, (r: number, c: number) => source(k, r, c)])),
      'a quarter turn clockwise, whole': (r, c) => [M - c, r],
      'a half turn, whole': (r, c) => [M - r, M - c],
      'a quarter turn anticlockwise, whole': (r, c) => [c, M - r],
      'a mirror across': (r, c) => [r, M - c],
      'a mirror down': (r, c) => [M - r, c],
      'a mirror in y = x': (r, c) => [M - c, M - r],
      'a mirror in y = 6 − x': (r, c) => [c, r],
      'slid across': (r, c) => [r, c - H],
      'slid down': (r, c) => [r - H, c],
      'the quarter tiled': (r, c) => [r % H, c % H],
      'the quarter turned the wrong way in place': (r, c) => (r < H ? (c < H ? [r, c] : [c - H, M - H - r]) : c < H ? [M - H - c, r - H] : [M - r, M - c]),
    };
    /** A way fits if it copies only painted squares onto the kid's, each the colour the picture wants — and isn't the move's own. */
    const fits = (job: ReturnType<typeof jobFor>, way: Way) => {
      let other = false;
      for (const [r, c] of toPaint(job.kind)) {
        const [sr, sc] = way(r, c);
        if (sr < 0 || sc < 0 || sr >= SIZE || sc >= SIZE || !given(job.kind, sr, sc) || job.goal[sr][sc] !== job.goal[r][c]) return false;
        const [kr, kc] = source(job.kind, r, c);
        if (sr !== kr || sc !== kc) other = true;
      }
      return other;
    };
    /** The kid's part painted by a move from what's shown: each painted square carried where the move takes it (a quarter turn's three times). */
    const paintedBy = (job: ReturnType<typeof jobFor>, m: Move) => {
      const painted: Cell[][] = start(job);
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          if (!given(job.kind, r, c) || !job.goal[r][c]) continue;
          let ends: Point[] = [[c, M - r], [c + 1, SIZE - r]];
          for (let n = 0; n < (m === 'quarter' ? 3 : 1); n++) {
            ends = ends.map((p) => mapPoint(m, p));
            const [tr, tc] = [M - Math.min(ends[0][1], ends[1][1]), Math.min(ends[0][0], ends[1][0])];
            if (tr >= 0 && tr < SIZE && tc >= 0 && tc < SIZE && !given(job.kind, tr, tc)) painted[tr][tc] = job.goal[r][c];
          }
        }
      return painted;
    };
    // Unswapped, as the younger bands paint them, the ways are there to find: x = 3's butterfly is also a half turn
    // and two mirrors.
    const butterfly = jobFor('gentle', 0, 0, ['butterfly', 'butterfly', 'butterfly']);
    expect(Object.keys(ways).filter((w) => fits(butterfly, ways[w])).sort()).toEqual(['a half turn, whole', 'four']);
    expect(fakes('across', butterfly.goal)).toBe(2);
    for (const pattern of PATTERN_IDS)
      for (let s = 0; s < 6; s++) {
        const job = jobFor('expert', Math.floor(s / 3), s % 3, [pattern, pattern, pattern]);
        expect(Object.keys(ways).filter((w) => fits(job, ways[w])), `${job.kind} ${pattern}`).toEqual([]);
        expect(fakes(job.kind, job.goal), `${job.kind} ${pattern}`).toBe(0);
        // Both colours still in the painted part.
        expect(new Set(start(job).flat().filter(Boolean)).size, `${job.kind} ${pattern}`).toBe(2);
        // Painted by its own move it's exact; by any other, a square is marked.
        for (const m of MOVES) expect(mismatches(job, paintedBy(job, m)).length === 0, `${job.kind} ${pattern} painted by ${m}`).toBe(m === job.kind);
      }
  });

  it('the game finds the quarter turned the wrong way in place (code review round 2: its way never fitted anything)', () => {
    // A top-left quarter with no symmetry, the others it turned anticlockwise into the top right, half round into the
    // bottom right, clockwise into the bottom left.
    const q = [['red', 'red', null], [null, 'blue', null], ['blue', null, null]] as const;
    const g: Cell[][] = Array.from({ length: SIZE }, (_, r) =>
      Array.from({ length: SIZE }, (_, c) => {
        const [i, j] = [r % 3, c % 3];
        return r < 3 ? (c < 3 ? q[i][j] : q[j][2 - i]) : c < 3 ? q[2 - j][i] : q[2 - i][2 - j];
      }),
    );
    expect(fakes('quarter', g)).toBe(1);
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
