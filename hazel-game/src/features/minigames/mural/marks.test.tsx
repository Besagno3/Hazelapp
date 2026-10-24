import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MOVES, jobFor, mapPoint, pImage, type Job, type Move } from '../../../lib/minigames/mural';
import { Axes, MoveMarks } from './marks';
import { StepImage, StepPaint } from './art';

// Expert's marks, where they're drawn (code review round 1, PR 14: only x = 3's line was checked). The SVG's y runs
// down, so a point (x, y) is drawn at (x, 6 − y).

/** A real Expert job for each move, from the rounds' asks. */
const JOBS = Object.fromEntries(
  Array.from({ length: 12 }, (_, s) => jobFor('expert', Math.floor(s / 3), s % 3)).map((j) => [j.kind, j]),
) as Record<Move, Job>;

const marks = (job: Job, overlay: 'points' | 'move') => render(<MoveMarks job={job} overlay={overlay} />).container.querySelector('svg')!;
const at = (el: Element, ...names: string[]) => names.map((n) => Number(el.getAttribute(n)));
/** The cyan line drawn (each line has an ink edge under it). */
const cyan = (svg: SVGSVGElement) => svg.querySelector('line[stroke="#22d3ee"]')!;

describe('🪞 Expert’s marks on the canvas', () => {
  it('every move has a job, and both As come up', () => {
    expect(Object.keys(JOBS).sort()).toEqual([...MOVES].sort());
    expect(new Set(Array.from({ length: 12 }, (_, s) => jobFor('expert', Math.floor(s / 3), s % 3).p.join()))).toEqual(new Set(['1,4', '2,5']));
  });

  it('A and A′ at their coordinates, an arrow from one to the other, no move drawn', () => {
    for (const m of MOVES) {
      const job = JOBS[m];
      const svg = marks(job, 'points');
      const [a, b] = Array.from(svg.querySelectorAll('circle'));
      const [ax, ay] = job.p;
      const [bx, by] = pImage(job);
      expect(pImage(job)).toEqual(mapPoint(m, job.p));
      expect(at(a, 'cx', 'cy')).toEqual([ax, 6 - ay]);
      expect(at(b, 'cx', 'cy')).toEqual([bx, 6 - by]);
      expect(Array.from(svg.querySelectorAll('text')).map((t) => t.textContent)).toEqual(['A', 'A′']);
      const arrow = svg.querySelector('line[marker-end]')!;
      expect(at(arrow, 'x1', 'y1', 'x2', 'y2')).toEqual([ax, 6 - ay, bx, 6 - by]);
      // Its head is its own marker (two are drawn as the move's named: the canvas's and the small picture's).
      expect(arrow.getAttribute('marker-end')).toBe(`url(#${svg.querySelector('marker')!.id})`);
      expect(cyan(svg)).toBeNull();
    }
  });

  it('two marks drawn at once have their own arrowheads (code review round 2)', () => {
    const { container } = render(
      <>
        <MoveMarks job={JOBS.across} overlay="points" />
        <MoveMarks job={JOBS.across} overlay="points" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('marker')).map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('after a miss: x = 3, y = 3 and y = x as lines; the turns’ centre (3, 3); the translation’s vector (3, 0)', () => {
    expect(at(cyan(marks(JOBS.across, 'move')), 'x1', 'y1', 'x2', 'y2')).toEqual([3, 6, 3, 0]);
    expect(at(cyan(marks(JOBS.down, 'move')), 'x1', 'y1', 'x2', 'y2')).toEqual([0, 3, 6, 3]);
    // y = x runs from the bottom-left corner (0, 0) to the top-right (6, 6).
    expect(at(cyan(marks(JOBS.diag, 'move')), 'x1', 'y1', 'x2', 'y2')).toEqual([0, 6, 6, 0]);
    for (const m of ['turn', 'quarter'] as const) {
      const svg = marks(JOBS[m], 'move');
      expect(svg.querySelectorAll('circle')).toHaveLength(2);
      for (const c of Array.from(svg.querySelectorAll('circle'))) expect(at(c, 'cx', 'cy')).toEqual([3, 3]);
      expect(svg.querySelector('line')).toBeNull();
      // And how far round, clockwise from straight up, with its arrowhead: to straight down, or a quarter, to the
      // right (UX review round 2: the two turns drew the same dot).
      const arc = svg.querySelector('path[marker-end]')!;
      expect(arc.getAttribute('d')).toBe(m === 'turn' ? 'M3 1.9 A1.1 1.1 0 0 1 3 4.1' : 'M3 1.9 A1.1 1.1 0 0 1 4.1 3');
    }
    for (const m of ['across', 'down', 'diag', 'shift'] as const) expect(marks(JOBS[m], 'move').querySelector('path[d^="M3 1.9"]')).toBeNull();
    const shift = marks(JOBS.shift, 'move');
    const [x1, y1, x2, y2] = at(shift.querySelector('line[marker-end]')!, 'x1', 'y1', 'x2', 'y2');
    // Across to the right, 3 squares (the head takes the last tenth), level.
    expect([x1, y1, y2]).toEqual([1.5, 3, 3]);
    expect(x2 - x1).toBeCloseTo(2.9);
    expect(shift.querySelector('circle')).toBeNull();
  });

  it('the axes: 0 to 6, from the bottom up the left and from the left along the bottom', () => {
    const { container } = render(
      <Axes on>
        <div data-testid="canvas" />
      </Axes>,
    );
    const [left, , , bottom] = Array.from(container.firstElementChild!.children);
    const spans = (el: Element) => Array.from(el.querySelectorAll('span'));
    expect(spans(left).map((s) => s.textContent).join('')).toBe('0123456');
    expect(spans(bottom).map((s) => s.textContent).join('')).toBe('0123456');
    // 0 at the foot of the left axis, 6 at its head; 0 at the left of the bottom one — each the frame's 4 px in.
    const share = (v: string) => {
      const m = /^calc\(4px \+ (?:([\d.]+) \* \(100% - 8px\)|\(100% - 8px\) \* ([\d.]+))\)$/.exec(v);
      return m ? Number(m[1] ?? m[2]) : NaN;
    };
    expect(spans(left).map((s) => share(s.style.top))).toEqual([6, 5, 4, 3, 2, 1, 0].map((i) => i / 6));
    expect(spans(bottom).map((s) => share(s.style.left))).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => i / 6));
  });

  it('off: just the canvas', () => {
    const { container } = render(
      <Axes on={false}>
        <div data-testid="canvas" />
      </Axes>,
    );
    expect(container.innerHTML).toBe('<div data-testid="canvas"></div>');
  });
});

describe('🪞 Expert’s title card', () => {
  it('its step 2 draws no mirror line — the line shows only after a miss (UX review round 2); the younger bands’ does', () => {
    const cyan = (el: Element) => el.querySelector('path[stroke="#22d3ee"]');
    expect(cyan(render(<StepImage />).container)).toBeNull();
    expect(cyan(render(<StepPaint />).container)).not.toBeNull();
  });
});
