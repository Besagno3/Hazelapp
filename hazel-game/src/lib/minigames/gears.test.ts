import { describe, it, expect } from 'vitest';
import {
  CRANK_TEETH,
  HANDLE,
  JOBS_PER_ROUND,
  MACHINES,
  MACHINE_IDS,
  biggestFor,
  board,
  boardBox,
  forceWords,
  ratioWords,
  roundQueue,
  check,
  ends,
  jobFor,
  jobWords,
  learnedLine,
  pegAt,
  radius,
  run,
  solve,
  speedWords,
  touching,
  verdictWords,
  type Board,
} from './gears';
import { BANDS, MINIGAMES, PLAY_BANDS } from '../../content/minigames';

const set = (...k: number[]) => new Set(k);

/** Every job a band hands out, over enough rounds to see each board and ask. */
const jobs = (band: (typeof PLAY_BANDS)[number]) => Array.from({ length: 36 }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

/** Every way of filling a board's pegs. */
function* fillings(b: Board) {
  for (let mask = 0; mask < 1 << b.pegs.length; mask++) {
    const p = new Set<number>();
    for (let k = 0; k < b.pegs.length; k++) if (mask & (1 << k)) p.add(k);
    yield p;
  }
}

describe('a gear train (docs/DESIGN-MINIGAMES.md §5.3)', () => {
  // Middle row: entry 0, two pegs, exit 3 (a straight line of four).
  const line = board(['....', 'EooX', '....']);

  it('hex neighbours touch; others don’t', () => {
    const b = board(['oo', 'oo']);
    expect(touching(b.pegs[0], b.pegs[1])).toBe(true); // side by side
    expect(touching(b.pegs[0], b.pegs[2])).toBe(true); // below-right of an even row
    expect(touching(b.pegs[1], b.pegs[2])).toBe(true);
    expect(touching(b.pegs[0], b.pegs[3])).toBe(false);
  });

  it('each gear turns the other way from the one turning it; four between turn the machine the other way from the crank', () => {
    const r = run(line, set(0, 1, 2, 3), 16, 16);
    expect(r.kind).toBe('turns');
    if (r.kind !== 'turns') return;
    expect([...r.turning.entries()]).toEqual([
      [0, 'ccw'],
      [1, 'cw'],
      [2, 'ccw'],
      [3, 'cw'],
    ]);
    expect(r.turn).toBe('ccw');
    expect(r.between).toBe(4);
    expect(r.speed).toBe(1);
  });

  it('a gap stops it; no gear by the crank turns nothing', () => {
    expect(run(line, set(0, 1, 3), 16, 16)).toMatchObject({ kind: 'not-joined' });
    expect(run(line, set(1, 2, 3), 16, 16)).toEqual({ kind: 'empty' });
  });

  it('three gears that all touch jam, and all three are the stuck ones (review round 1)', () => {
    const b = board(['.oo.', 'EooX', '....']);
    // Entry (2), the peg above-right of it (0) and the one right of it (3) all touch.
    const r = run(b, set(0, 2, 3), 16, 16);
    expect(r.kind).toBe('jammed');
    if (r.kind !== 'jammed') return;
    expect([...r.stuck].sort()).toEqual([0, 2, 3]);
    for (const i of r.stuck) for (const k of r.stuck) if (i !== k) expect(touching(b.pegs[i], b.pegs[k])).toBe(true);
  });

  it('on every board, every jam marks exactly one ring of three gears that all touch, whatever the tap order (review round 2)', () => {
    for (const band of BANDS) {
      for (const job of jobs(band)) {
        const b = job.board;
        for (const p of fillings(b)) {
          const r = run(b, p, 16, 16);
          if (r.kind !== 'jammed') continue;
          expect(r.stuck, `${band}`).toHaveLength(3);
          expect(new Set(r.stuck).size).toBe(3);
          for (const i of r.stuck) {
            expect(p.has(i)).toBe(true);
            for (const k of r.stuck) if (i !== k) expect(touching(b.pegs[i], b.pegs[k])).toBe(true);
          }
          // The same pegs tapped the other way round mark the same ring.
          const back = run(b, new Set([...p].reverse()), 16, 16);
          expect(back).toEqual(r);
        }
      }
    }
  });

  it('a ring of four marks three, not the crank’s own peg when there’s a choice', () => {
    const b = board(['.ooo', 'EooX', '....']); // 0–2 top, 3 entry, 4–5 middle, 6 exit
    const r = run(b, set(0, 1, 3, 4), 16, 16);
    expect(r.kind).toBe('jammed');
    if (r.kind === 'jammed') expect(r.stuck).toHaveLength(3);
  });

  it('the frame holds the crank’s knob all the way round, at every crank size (review rounds 1 and 2)', () => {
    for (const band of PLAY_BANDS) {
      for (const job of jobs(band)) {
        const f = boardBox(job.board, biggestFor(band));
        for (const t of CRANK_TEETH[band]) {
          const at = ends(job.board, t, job.teeth).crank;
          const reach = radius(t) + HANDLE;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const x = at.x + dx * reach;
            const y = at.y + dy * reach;
            expect(x, `${band} ${t}`).toBeGreaterThanOrEqual(f.x);
            expect(y, `${band} ${t}`).toBeGreaterThanOrEqual(f.y);
            expect(x).toBeLessThanOrEqual(f.x + f.w);
            expect(y).toBeLessThanOrEqual(f.y + f.h);
          }
        }
        // And every peg's gear.
        for (const p of job.board.pegs) {
          const { x, y } = pegAt(p);
          expect(x - 0.5).toBeGreaterThanOrEqual(f.x);
          expect(y + 0.5).toBeLessThanOrEqual(f.y + f.h);
        }
      }
    }
  });

  it('only the crank’s gear and the machine’s change the speed', () => {
    for (const [c, m, s] of [
      [16, 8, 2],
      [24, 8, 3],
      [8, 16, 0.5],
      [8, 24, 1 / 3],
      [16, 16, 1],
    ] as const) {
      const r = run(line, set(0, 1, 2, 3), c, m);
      expect(r.kind === 'turns' && r.speed, `${c}→${m}`).toBeCloseTo(s);
    }
  });

  it('the crank and the machine each touch only their own peg’s gear, at every size — Expert’s 32 too', () => {
    for (const band of PLAY_BANDS) {
      for (const job of jobs(band)) {
        for (const c of CRANK_TEETH[band]) {
          const at = ends(job.board, c, job.teeth);
          job.board.pegs.forEach((p, i) => {
            const { x, y } = pegAt(p);
            const dc = Math.hypot(x - at.crank.x, y - at.crank.y) - radius(c) - radius(16);
            const dm = Math.hypot(x - at.machine.x, y - at.machine.y) - radius(job.teeth) - radius(16);
            if (i === job.board.entry) expect(dc).toBeCloseTo(0);
            else expect(dc, `${band} crank ${c} vs peg ${i}`).toBeGreaterThan(0.1);
            if (i === job.board.exit) expect(dm).toBeCloseTo(0);
            else expect(dm, `${band} machine vs peg ${i}`).toBeGreaterThan(0.1);
          });
        }
      }
    }
  });
});

describe('the jobs', () => {
  it('every job at every band can be done', () => {
    for (const band of PLAY_BANDS) for (const job of jobs(band)) expect(solve(job), `${band} ${job.machine}`).not.toBeNull();
  });

  it('Gentle’s boards can’t jam; Medium’s and Tricky’s can, and offer both ways round', () => {
    for (const job of jobs('gentle')) {
      for (const p of fillings(job.board)) expect(run(job.board, p, 16, 16).kind).not.toBe('jammed');
      expect(job.turn).toBeUndefined();
    }
    for (const band of ['medium', 'tricky'] as const) {
      for (const job of jobs(band)) {
        const ways = new Set<string>();
        let jams = false;
        for (const p of fillings(job.board)) {
          const r = run(job.board, p, 16, 16);
          if (r.kind === 'turns') ways.add(r.turn);
          if (r.kind === 'jammed') jams = true;
        }
        expect([...ways].sort(), `${band} ${job.machine}`).toEqual(['ccw', 'cw']);
        expect(jams).toBe(true);
      }
    }
  });

  it('a round’s boards change from round to round, and only Tricky changes the machine’s gear (review round 1)', () => {
    for (const band of BANDS) {
      const boards = (round: number) => [0, 1, 2].map((i) => jobFor(band, round, i).board);
      expect(boards(1), band).not.toEqual(boards(0));
    }
    for (const band of ['gentle', 'medium'] as const) expect(jobs(band).every((j) => j.teeth === 16)).toBe(true);
    // Every crank gear is the answer somewhere on Tricky.
    const cranks = new Set(jobs('tricky').map((j) => solve(j)!.crank));
    expect([...cranks].sort((a, b) => a - b)).toEqual([8, 16, 24]);
  });

  it('Medium and Tricky ask for both ways; Tricky for faster and slower', () => {
    const medium = jobs('medium');
    expect(new Set(medium.map((j) => j.turn))).toEqual(new Set(['cw', 'ccw']));
    const tricky = jobs('tricky');
    expect(new Set(tricky.map((j) => j.turn))).toEqual(new Set(['cw', 'ccw']));
    expect(tricky.some((j) => j.speed! > 1)).toBe(true);
    expect(tricky.some((j) => j.speed! < 1)).toBe(true);
    // Each speed is made by exactly one crank gear.
    for (const j of tricky) expect(CRANK_TEETH.tricky.filter((c) => Math.abs(c / j.teeth - j.speed!) < 1e-9)).toHaveLength(1);
  });

  it('three rounds fix all nine machines, at every band', () => {
    for (const band of BANDS) {
      const met = new Set(Array.from({ length: 9 }, (_, k) => jobFor(band, Math.floor(k / 3), k % 3).machine));
      expect(met.size).toBe(MACHINE_IDS.length);
    }
    expect(MINIGAMES['clocktower-gears'].pages).toBe(MACHINES.length);
  });

  it('a round brings machines not in the book first, so one round a visit still fills it', () => {
    expect(roundQueue(() => false, 0).slice(0, 3)).toEqual(['hands', 'bell', 'cuckoo']);
    expect(roundQueue(() => false, 1).slice(0, 3)).toEqual(['vane', 'moon', 'drum']);
    const fixed = new Set<string>(['hands', 'bell', 'cuckoo']);
    expect(roundQueue((id) => fixed.has(id), 0).slice(0, 3)).toEqual(['vane', 'moon', 'drum']);
    for (let visit = 0; visit < 3; visit++) for (const id of roundQueue((id) => fixed.has(id), 0).slice(0, 3)) fixed.add(id);
    expect(fixed.size).toBe(MACHINE_IDS.length);
    // Which machine follows the queue; the board and what's asked still go by the slot.
    const q = roundQueue((id) => fixed.has(id) && id !== 'mill', 1);
    const job = jobFor('tricky', 1, 0, q);
    expect(job.machine).toBe('mill');
    expect(job.board).toBe(jobFor('tricky', 1, 0).board);
    expect(job.speed).toBe(jobFor('tricky', 1, 0).speed);
  });
});

describe('the words', () => {
  const gentle = jobFor('gentle', 0, 0);
  const medium = jobFor('medium', 0, 0);
  const tricky = jobFor('tricky', 0, 0);

  it('the ticket', () => {
    expect(jobWords(gentle)).toBe('Join the crank to the Great Hands so it turns.');
    expect(jobWords(medium)).toBe('Make the Great Hands turn clockwise ↻.');
    expect(jobWords(tricky)).toBe('Make the Great Hands turn clockwise ↻, twice as fast as the crank. Its gear has 8 teeth.');
    expect(speedWords(1 / 3)).toBe('a third as fast as the crank');
    expect(speedWords(1 / 2)).toBe('half as fast as the crank');
    // "turned at the same speed", never "turned the same speed" (review round 1).
    expect(speedWords(1)).toBe('at the same speed as the crank');
    expect(speedWords(2 / 3)).toBe('two thirds as fast as the crank');
    expect(speedWords(1.5)).toBe('one and a half times as fast as the crank');
  });

  it('a run that isn’t right says what happened, kindly', () => {
    const b = medium.board;
    const straight = run(b, set(...solveStraight(b)), 16, 16);
    const v = check(medium, straight);
    expect(v).toBe('wrong-way');
    expect(verdictWords(medium, straight, v)).toBe('The Great Hands turned anticlockwise ↺ — four gears between. Try one gear more, or one fewer, on the way.');
    const fast = run(tricky.board, solve(tricky)!.placed, 24, tricky.teeth);
    expect(check(tricky, fast)).toBe('too-fast');
    expect(verdictWords(tricky, fast, 'too-fast')).toContain('A smaller gear on the crank turns it slower.');
    // No gear by the crank: it turned on its own.
    const alone = run(gentle.board, set(), 16, 16);
    expect(verdictWords(gentle, alone, check(gentle, alone))).toBe('Only the crank turned — no gear touches it yet. Put a gear on the peg next to the crank.');
  });

  it('what a right run teaches', () => {
    const g = solve(gentle)!;
    // Gentle: what the chain did (review round 2: the same line for every machine).
    expect(learnedLine(gentle, run(gentle.board, g.placed, 16, 16), 16)).toBe('Four gears, each turning the other way from the one before — so the Great Hands turned anticlockwise ↺.');
    const m = solve(medium)!;
    expect(learnedLine(medium, run(medium.board, m.placed, 16, 16), 16)).toBe('Five gears between the crank and the Great Hands: an odd number, so it turns the same way as the crank.');
    const t = solve(tricky)!;
    expect(learnedLine(tricky, run(tricky.board, t.placed, t.crank, tricky.teeth), t.crank)).toBe(
      'A big gear turning a small one makes it go faster: 16 teeth turning 8 made the Great Hands turn twice as fast as the crank. The gears between change only the way.',
    );
    // Two gears the same size: the same speed.
    const same = jobFor('tricky', 1, 1);
    expect(same.speed).toBe(1);
    const s1 = solve(same)!;
    expect(learnedLine(same, run(same.board, s1.placed, s1.crank, same.teeth), s1.crank)).toMatch(/^Two gears the same size turn at the same speed: 24 teeth turning 24 made .* turn at the same speed as the crank\./);
  });
});

/** The straight line along the entry's row. */
function solveStraight(b: Board): number[] {
  const r = b.pegs[b.entry].r;
  return b.pegs.flatMap((p, i) => (p.r === r ? [i] : []));
}

describe('Expert: gear ratios in numbers — turns a minute, and turning force (§8.5)', () => {
  const expert = Array.from({ length: 8 }, (_, k) => jobFor('expert', Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

  it('eight jobs on the ringed boards, each made by exactly one crank gear of the four — every one of them the answer somewhere', () => {
    expect(CRANK_TEETH.expert).toEqual([8, 16, 24, 32]);
    for (const j of expert) {
      expect(solve(j), j.machine).not.toBeNull();
      expect(CRANK_TEETH.expert.filter((c) => Math.abs(c / j.teeth - j.speed!) < 1e-9), j.machine).toHaveLength(1);
      // Said in turns a minute, or in turning force — never as the speed against the crank.
      expect(j.rpm !== undefined || j.force, j.machine).toBeTruthy();
      expect(jobWords(j)).not.toMatch(/as fast as the crank/);
      // Turns a minute come out whole, for every crank gear.
      if (j.rpm !== undefined) for (const c of CRANK_TEETH.expert) expect(Number.isInteger((j.rpm * c) / j.teeth), `${j.machine} ${c}`).toBe(true);
    }
    expect(new Set(expert.map((j) => solve(j)!.crank))).toEqual(new Set([8, 16, 24, 32]));
    expect(new Set(expert.map((j) => j.turn))).toEqual(new Set(['cw', 'ccw']));
    expect(expert.some((j) => j.force) && expert.some((j) => j.rpm !== undefined)).toBe(true);
    expect(biggestFor('expert')).toBe(32);
  });

  it('the job in numbers; a ratio in lowest terms; force the speed’s inverse', () => {
    expect(jobWords(expert[0])).toBe('Make the Great Hands turn clockwise ↻, 45 times a minute. The crank turns 15 times a minute; the machine’s gear has 8 teeth.');
    expect(jobWords(expert[1])).toBe('Make the Hour Bell turn anticlockwise ↺ with four times the crank’s turning force. Its gear has 32 teeth.');
    expect(ratioWords(24, 8)).toBe('3 : 1');
    expect(ratioWords(24, 32)).toBe('3 : 4');
    expect(ratioWords(16, 16)).toBe('1 : 1');
    expect(forceWords(1)).toBe('the same turning force as the crank');
    expect(forceWords(0.75)).toBe('three quarters of the crank’s turning force');
    expect(forceWords(4 / 3)).toBe('one and a third times the crank’s turning force');
    expect(speedWords(0.25)).toBe('a quarter as fast as the crank');
    expect(speedWords(4 / 3)).toBe('one and a third times as fast as the crank');
  });

  it('a miss says what happened in the job’s own numbers, and the rule — never the gear; a right run, the ratio and the trade', () => {
    const hands = expert[0];
    const over = set(3, 0, 1, 2, 6); // up and over the top: five between, the crank's way round
    const slow = run(hands.board, over, 16, hands.teeth);
    expect(verdictWords(hands, slow, check(hands, slow))).toBe('The Great Hands turned 30 times a minute, not 45. Turns out = turns in × crank teeth ÷ machine teeth.');
    const bell = expert[1];
    const line = set(0, 1, 2, 3);
    const weak = run(bell.board, line, 16, bell.teeth);
    expect(check(bell, weak)).toBe('too-fast');
    expect(verdictWords(bell, weak, 'too-fast')).toBe('The Hour Bell got twice the crank’s turning force, not four times the crank’s turning force. Force out = force in × machine teeth ÷ crank teeth.');
    const wrongWay = run(hands.board, set(3, 4, 5, 6), 24, hands.teeth);
    expect(verdictWords(hands, wrongWay, check(hands, wrongWay))).toBe(
      'The Great Hands turned anticlockwise ↺, with four gears between. An odd number between keeps the crank’s way round; an even number turns it back.',
    );
    for (const v of ['empty', 'not-joined', 'jammed'] as const) expect(verdictWords(hands, { kind: 'empty' }, v)).not.toMatch(/!$|Clunk/);
    const ok = run(hands.board, over, 24, hands.teeth);
    expect(learnedLine(hands, ok, 24)).toBe('24 teeth turning 8 is 3 : 1 — 15 turns a minute became 45, with a third of the crank’s turning force. The gears between change only the way.');
    expect(learnedLine(bell, run(bell.board, line, 8, bell.teeth), 8)).toBe(
      '8 teeth turning 32 is 1 : 4 — a quarter as fast as the crank, with four times the crank’s turning force: speed traded for force.',
    );
  });
});

