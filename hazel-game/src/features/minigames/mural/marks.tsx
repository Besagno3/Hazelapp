import type { ReactNode } from 'react';
import { SIZE, pImage, type Job, type Point } from '../../../lib/minigames/mural';
import { cn } from '../../../lib/utils';

/**
 * Mirror Mural's Expert marks (docs/DESIGN-MINIGAMES.md §8.5): the axes round
 * the canvas, A and A′, and a move's line, centre or vector — drawn in the
 * grid's coordinates, x across and y up from the bottom-left corner.
 */

/** The canvas's frame (`border-4`): the grid's lines are inside it. */
const FRAME = 4;
/** The room the axis numbers take, left and under the canvas (inside the size `layout.ts` fits). */
export const AXIS = 16;

/** Expert's mark on the canvas: A and A′, or the move's line, centre or vector. */
export type Overlay = 'points' | 'move' | null;

/**
 * Expert's coordinate grid round the canvas (§8.5): x along the bottom and y
 * up the left, 0 to 6 at the grid's lines from the bottom-left corner. It
 * takes the canvas's own room, so the canvas fits as before.
 */
export function Axes({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  const at = (i: number) => `calc(${FRAME}px + (100% - ${2 * FRAME}px) * ${i / SIZE})`;
  const ticks = Array.from({ length: SIZE + 1 }, (_, i) => i);
  const tick = 'absolute text-[11px] font-bold leading-none text-[#fde68a]';
  return (
    <div className="grid" style={{ gridTemplateColumns: `${AXIS}px minmax(0, 1fr)`, gridTemplateRows: `minmax(0, 1fr) ${AXIS}px` }}>
      <div aria-hidden="true" className="relative">
        {ticks.map((i) => (
          <span key={i} className={cn(tick, 'right-1 -translate-y-1/2')} style={{ top: at(SIZE - i) }}>
            {i}
          </span>
        ))}
      </div>
      {children}
      <span aria-hidden="true" />
      <div aria-hidden="true" className="relative">
        {ticks.map((i) => (
          <span key={i} className={cn(tick, 'top-1 -translate-x-1/2')} style={{ left: at(i) }}>
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Expert's mark on the canvas, drawn in its coordinates (y up): A and A′
 * with an arrow while the move's named; once the mirror's found something to
 * fix, the move's line — x = 3, y = 3, y = x — its centre (3, 3), or its
 * vector. Cyan and white with ink edges, clear on any paint.
 */
export function MoveMarks({ job, overlay }: { job: Job; overlay: Exclude<Overlay, null> }) {
  const y = (v: number) => SIZE - v;
  const line = (x1: number, y1: number, x2: number, y2: number) => (
    <>
      <line x1={x1} y1={y(y1)} x2={x2} y2={y(y2)} stroke="#1b0f22" strokeWidth={0.2} strokeLinecap="round" />
      <line x1={x1} y1={y(y1)} x2={x2} y2={y(y2)} stroke="#22d3ee" strokeWidth={0.11} strokeDasharray="0.3 0.18" strokeLinecap="round" />
    </>
  );
  const dot = ([px, py]: Point, fill: string, name: string) => (
    <>
      <circle cx={px} cy={y(py)} r={0.17} fill={fill} stroke="#1b0f22" strokeWidth={0.07} />
      <text x={px + 0.2} y={y(py) - 0.2} fontSize={0.46} fontWeight={900} fill="#1b0f22" stroke="#ffffff" strokeWidth={0.12} paintOrder="stroke">
        {name}
      </text>
    </>
  );
  const kind = job.kind;
  const centre = (
    <>
      <circle cx={3} cy={3} r={0.24} fill="#ffffff" stroke="#1b0f22" strokeWidth={0.08} />
      <circle cx={3} cy={3} r={0.08} fill="#0e7490" />
    </>
  );
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${SIZE} ${SIZE}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        <marker id="mm-head" viewBox="0 0 4 4" refX="3.2" refY="2" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L4 2 L0 4 Z" fill="#1b0f22" />
        </marker>
      </defs>
      {overlay === 'points' ? (
        <>
          <line x1={job.p[0]} y1={y(job.p[1])} x2={pImage(job)[0]} y2={y(pImage(job)[1])} stroke="#1b0f22" strokeWidth={0.07} strokeDasharray="0.2 0.12" markerEnd="url(#mm-head)" />
          {dot(job.p, '#ffffff', 'A')}
          {dot(pImage(job), '#22d3ee', 'A′')}
        </>
      ) : (
        <>
          {kind === 'across' && line(3, 0, 3, 6)}
          {kind === 'down' && line(0, 3, 6, 3)}
          {kind === 'diag' && line(0, 0, 6, 6)}
          {(kind === 'turn' || kind === 'quarter') && centre}
          {kind === 'shift' && (
            <>
              <line x1={1.5} y1={3} x2={4.5} y2={3} stroke="#ffffff" strokeWidth={0.22} />
              <line x1={1.5} y1={3} x2={4.4} y2={3} stroke="#1b0f22" strokeWidth={0.1} markerEnd="url(#mm-head)" />
            </>
          )}
        </>
      )}
    </svg>
  );
}

/**
 * Expert's ask on a phone, beside the moves (UX review round 1): A and A′ on
 * a small bare grid with its axes — the canvas they're on is above, scrolled
 * away. Said in the line beside it.
 */
export function AskPicture({ job }: { job: Job }) {
  return (
    <div aria-hidden="true" className="w-[136px] flex-none self-start sm:hidden [@media(max-height:500px)]:row-span-2">
      <Axes on>
        <div className="relative grid aspect-square w-full grid-cols-6 rounded-md border-4 border-[#1b0f22] bg-[#f4ecdc]">
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <span key={i} className="border-[0.5px] border-[#1b0f22]/15" />
          ))}
          <MoveMarks job={job} overlay="points" />
        </div>
      </Axes>
    </div>
  );
}
