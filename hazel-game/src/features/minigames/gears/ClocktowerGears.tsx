import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  CRANK_TEETH,
  JOBS_PER_ROUND,
  MACHINES,
  MACHINE_BY_ID,
  check,
  ends,
  jobFor,
  jobWords,
  roundQueue,
  learnedLine,
  pegAt,
  radius,
  run,
  speedWords,
  turnWords,
  verdictWords,
  type Board,
  type Job,
  type MachineId,
  type Run,
  type Teeth,
  type Turn,
  type Verdict,
} from '../../../lib/minigames/gears';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { GearShape } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Tock after a machine comes back to life, in turn. */
const RIGHT_LINES = ['Tick… TOCK! Listen to it go!', 'Splendid! Right on time.', 'Ha! The old thing hasn’t run that well in years.'];

const HEADS: Record<Verdict, string> = {
  right: 'It works!',
  empty: 'Nothing turned',
  'not-joined': 'Not joined yet',
  jammed: 'Jammed!',
  'wrong-way': 'The wrong way round',
  'too-fast': 'A bit too fast',
  'too-slow': 'A bit too slow',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * ⚙️ Clocktower Gears (docs/DESIGN-MINIGAMES.md §5.3), in Tock's Clocktower:
 * three of its machines have stopped each round. The kid puts gears on the
 * pegs between the crank and the machine and turns the crank: every gear the
 * crank reaches turns, each the other way from the one turning it. Gentle
 * joins them; Medium needs the machine to turn the right way (count the gears
 * between); Tricky picks the crank's gear for the speed too. A run that isn't
 * right shows what turned and says why; nothing is lost. No timer. Rules:
 * `lib/minigames/gears.ts`.
 */
export default function ClocktowerGears({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which machines have stopped this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue((id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const machine = MACHINE_BY_ID[job.machine];
  const [placed, setPlaced] = useState<ReadonlySet<number>>(() => new Set());
  const [crank, setCrank] = useState<Teeth>(16);
  const [result, setResult] = useState<{ run: Run; verdict: Verdict; crank: Teeth } | null>(null);
  const [lessons, setLessons] = useState<string[]>([]);
  const [newPage, setNewPage] = useState(false);
  const [read, setRead] = useState<MachineId | null>(null);
  const [rights, setRights] = useState(0);
  const known = (id: MachineId) => !!flags[pageFlag(def.id, id)];
  const verdict = result?.verdict ?? null;
  const right = verdict === 'right';

  // Focus follows the job, from the start: the board's step (described by the job), then what happened.
  const buildHead = useRef<HTMLHeadingElement>(null);
  const resultHead = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    (result ? resultHead.current : buildHead.current)?.focus({ preventScroll: first.current });
    first.current = false;
  }, [result, done]);

  // The step's gold button comes into view once it can be pressed.
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (placed.size > 0 || result) goRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [placed.size > 0, result, still]); // eslint-disable-line react-hooks/exhaustive-deps

  function peg(i: number) {
    if (right) return;
    sfx('select');
    setRead(null);
    setResult(null);
    setPlaced((p) => {
      const next = new Set(p);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function clear() {
    if (right) return;
    setResult(null);
    setPlaced(new Set());
  }

  function pickCrank(t: Teeth) {
    if (right) return;
    sfx('select');
    setResult(null);
    setCrank(t);
  }

  function turn() {
    if (result || placed.size === 0) return;
    setRead(null);
    const r = run(job.board, placed, crank, job.teeth);
    const v = check(job, r);
    setResult({ run: r, verdict: v, crank });
    if (v === 'right') {
      sfx('chest');
      setNewPage(onPage(job.machine, machine.short));
      setLessons((l) => [...l, learnedLine(job, r, crank)]);
      setRights((n) => n + 1);
    } else sfx('wrong');
  }

  function next() {
    if (!right) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'The Clocktower ticks again!', learned: lessons[lessons.length - 1] ?? '' });
      return;
    }
    setDone((n) => n + 1);
    setPlaced(new Set());
    setCrank(16);
    setResult(null);
    setNewPage(false);
  }

  const stepIndex = result ? 2 : placed.size > 0 ? 1 : 0;
  const tricky = CRANK_TEETH[band].length > 1;

  let line: string;
  const readMachine = read ? MACHINE_BY_ID[read] : null;
  if (readMachine) line = `${readMachine.short}: ${readMachine.note}`;
  else if (right) line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'On to the next machine!' : 'That’s the last one!'}`;
  else if (result) line = 'Tick… tock… not quite! Look at what turned, then change the gears and try again.';
  else if (!job.turn) line = `${cap(machine.name)} has stopped! Put gears on the pegs from the crank to it — gears that touch turn each other.`;
  else if (job.speed === undefined) line = `${cap(machine.name)} must turn ${turnWords(job.turn)}. Each gear turns the other way from the one before — count them!`;
  else line = `${cap(machine.name)} must turn ${turnWords(job.turn)}, ${speedWords(job.speed)}. Pick the crank’s gear: only it and the machine’s gear change the speed.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden">
      {/* From `sm` up the Clocktower's room is above the board; a phone and a short screen keep just the board. */}
      <div className="grid flex-none grid-cols-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_300px] sm:grid-rows-[minmax(0,40fr)_minmax(0,60fr)] lg:grid-cols-[minmax(0,1fr)_380px] sm:[@media(max-height:500px)]:grid-rows-[minmax(0,1fr)]">
        <section aria-label="Tock’s clocktower" className="relative hidden overflow-hidden sm:col-start-1 sm:row-start-1 sm:block [@media(max-height:500px)]:hidden">
          <ClockScene machine={job.machine} running={right} />
        </section>

        {/* The board: on a phone it stays at the top while the steps scroll under it, so a gear placed is always in sight. */}
        <section
          aria-labelledby="cg-board"
          className="sticky top-0 z-10 flex flex-col gap-1 border-b-4 border-[#1b0f22] bg-[#3b2a4a] px-2 pb-1.5 pt-1 sm:static sm:col-start-1 sm:row-start-2 sm:min-h-0 sm:justify-center sm:border-b-0 sm:border-t-4 sm:p-4 [@media(max-height:500px)]:row-start-1 [@media(max-height:500px)]:border-t-0 [@media(max-height:500px)]:p-2"
        >
          <h2 id="cg-board" className={cn(pixelHeadClass, 'text-lg text-[#fde68a] sm:text-2xl [@media(max-width:639px)]:sr-only')}>
            The gear board
          </h2>
          <GearBoard
            job={job}
            placed={placed}
            crank={result?.crank ?? crank}
            ran={result?.run ?? null}
            still={still}
            locked={right}
            onPeg={peg}
          />
          <p aria-hidden="true" className="mx-auto flex w-full max-w-[860px] justify-between px-1 text-[13px] font-bold text-[#fde68a] sm:text-[15px]">
            <span>⟳ The crank</span>
            <span>
              {machine.emoji} {machine.short}
            </span>
          </p>
        </section>

        <aside className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:overflow-y-auto sm:border-l-4 sm:p-4">
          <HostBubble npcId={def.host} line={line} phoneStrip />
          <div className="order-1 sm:order-none">
            <Ticket heading={`FIX ${machine.short.toUpperCase()}`} ready={right} icon={<MachineBadge id={job.machine} />} id="cg-job">
              {jobWords(job)}
            </Ticket>
          </div>

          <div className={cn(windowClass, 'flex flex-col gap-3 p-3.5 [@media(max-height:500px)]:order-first')}>
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2]">
              Machine {done + 1} of {JOBS_PER_ROUND}
            </p>

            {!result && (
              <>
                <h2 ref={buildHead} tabIndex={-1} aria-describedby="cg-job" className={cn(pixelHeadClass, 'self-start rounded text-[26px]', focusRing)}>
                  Step 1 · Place the gears
                </h2>
                <JobLine job={job} />
                <p className="text-[15px] leading-snug text-[#e4e1ff]">Tap a peg to put a gear on it — tap again to take it off. Gears that touch turn each other.</p>
                {tricky && (
                  <div role="group" aria-label="The crank’s gear" className="grid grid-cols-3 gap-2">
                    {CRANK_TEETH[band].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => pickCrank(t)}
                        aria-pressed={crank === t}
                        className={cn(
                          'flex min-h-[64px] flex-col items-center justify-center rounded-lg border-[3px] px-1 text-center text-[13px] font-bold leading-tight',
                          crank === t ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a] hover:bg-[#2f2b70]',
                          focusRing,
                        )}
                      >
                        <svg width="34" height="34" viewBox="-40 -40 80 80" aria-hidden="true">
                          <GearShape teeth={t} r={radius(t) * 64} spokes={false} />
                        </svg>
                        {t === 8 ? 'Small' : t === 16 ? 'Medium' : 'Big'}
                        <span className="block font-semibold text-[#c9c5f2]">{t} teeth</span>
                      </button>
                    ))}
                  </div>
                )}
                <p role="status" className="text-center text-[15px] font-bold">
                  {placed.size === 0 ? 'No gears on the pegs yet.' : `${cap(gearsWord(placed.size))} on the pegs.`}
                </p>
                <button ref={goRef} type="button" onClick={turn} aria-disabled={placed.size === 0 || undefined} className={cn(goldClass, 'h-14 text-lg')}>
                  {placed.size === 0 ? 'Put a gear on first' : 'Turn the crank ↻'}
                </button>
                {placed.size > 0 && (
                  <button type="button" onClick={clear} className={cn(outlineClass, 'min-h-11 border-2 text-sm')}>
                    Take all the gears off
                  </button>
                )}
              </>
            )}

            {result && verdict && (
              <>
                {/* Heard with what happened, as focus lands. */}
                <h2 ref={resultHead} tabIndex={-1} aria-describedby="cg-result" className={cn(pixelHeadClass, 'self-start rounded text-[28px] text-white', focusRing)}>
                  {HEADS[verdict]}
                </h2>
                <p id="cg-result" className={cn('rounded-lg px-3 py-2 text-[15px] font-bold text-[#1b0f22]', right ? 'bg-amber-300' : 'bg-[#d4d0f5]')}>
                  {right ? learnedLine(job, result.run, result.crank) : verdictWords(job, result.run, verdict)}
                  {right && newPage && ` ${cap(machine.name)} is in your book!`}
                </p>
                {right ? (
                  <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'text-lg')}>
                    {done + 1 < JOBS_PER_ROUND ? 'Next machine' : 'Next — that’s the last one!'}
                  </button>
                ) : (
                  <button ref={goRef} type="button" onClick={() => setResult(null)} className={cn(goldClass, 'text-lg')}>
                    Change the gears
                  </button>
                )}
              </>
            )}
          </div>

          <MachineBook known={known} read={read} onRead={(id) => setRead(id)} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 sm:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={['Gears', 'Crank', 'Watch']} current={stepIndex} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const gearsWord = (n: number) => `${NUM[n] ?? n} gear${n === 1 ? '' : 's'}`;

/** The job, in the step card on a phone or a short screen (the ticket is further down there). */
function JobLine({ job }: { job: Job }) {
  return (
    <p aria-hidden="true" className="flex items-center gap-2 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[15px] leading-snug text-[#1b0f22] sm:[@media(min-height:501px)]:hidden">
      <span className="flex-none">
        <MachineBadge id={job.machine} />
      </span>
      <b>{jobWords(job)}</b>
    </p>
  );
}

/** A machine's emoji on a brass plate. */
function MachineBadge({ id }: { id: MachineId }) {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-[#1b0f22] bg-amber-200 text-xl">
      {MACHINE_BY_ID[id].emoji}
    </span>
  );
}

/** Pegs are one unit apart; the board is drawn this many SVG units to the peg. */
const S = 100;
const ROW_NAME = ['Top row', 'Middle row', 'Bottom row'];

/** Seconds for one turn of the crank. */
const CRANK_TURN_S = 3;

/**
 * The board: the crank on the left, the machine on the right, the pegs
 * between. Each peg is a button (tap or Enter / Space puts a gear on it or
 * takes it off). After a run, every gear that turned spins (or, with reduced
 * motion, just shows its arrow) and a jam shows its two stuck gears.
 */
function GearBoard({
  job,
  placed,
  crank,
  ran,
  still,
  locked,
  onPeg,
}: {
  job: Job;
  placed: ReadonlySet<number>;
  crank: Teeth;
  ran: Run | null;
  still: boolean;
  locked: boolean;
  onPeg: (i: number) => void;
}) {
  const b = job.board;
  const m = MACHINE_BY_ID[job.machine];
  const box = useMemo(() => viewBoxFor(b), [b]);
  const [bx, by, bw, bh] = box.split(' ').map(Number);
  const at = ends(b, crank, job.teeth);
  const turning = ran && (ran.kind === 'turns' || ran.kind === 'not-joined') ? ran.turning : null;
  const stuck = ran?.kind === 'jammed' ? ran.stuck : null;
  const crankTurns = !!ran && ran.kind !== 'jammed';
  const machineTurn: Turn | null = ran?.kind === 'turns' ? ran.turn : null;
  const period = (teeth: number) => (CRANK_TURN_S * teeth) / crank;

  return (
    <svg viewBox={box} role="group" aria-label={`The gear board: the crank on the left, ${m.name} on the right, ${b.pegs.length} pegs between`} aria-describedby="cg-job" className="mx-auto block h-auto max-h-full w-full max-w-[860px] sm:min-h-0">
      <rect x={bx + 4} y={by + 4} width={bw - 8} height={bh - 8} rx="22" fill="#5b3a26" stroke="#1b0f22" strokeWidth="8" />
      {/* The crank: its gear, its handle, and the word. */}
      <g transform={`translate(${at.crank.x * S} ${at.crank.y * S})`}>
        <Spinning period={period(crank)} turn={crankTurns ? 'cw' : null} still={still}>
          <GearShape teeth={crank} r={radius(crank) * S} />
          <path d={`M0 0 L0 ${-radius(crank) * S - 26}`} stroke="#1b0f22" strokeWidth="14" strokeLinecap="round" />
          <circle cy={-radius(crank) * S - 26} r="13" fill="#e8483f" stroke="#1b0f22" strokeWidth="5" />
        </Spinning>
        {crankTurns && <TurnArrow r={radius(crank) * S} turn="cw" />}
      </g>
      {/* The machine: its gear, its face, its name. */}
      <g transform={`translate(${at.machine.x * S} ${at.machine.y * S})`}>
        <Spinning period={period(job.teeth)} turn={machineTurn} still={still}>
          <GearShape teeth={job.teeth} r={radius(job.teeth) * S} fill="#f2c45a" />
        </Spinning>
        {/* The machine's face, on its hub (it doesn't spin, so it stays readable). */}
        <circle r={Math.max(20, radius(job.teeth) * S * 0.62)} fill="#fff6dc" stroke="#1b0f22" strokeWidth="4" />
        <text textAnchor="middle" dominantBaseline="central" fontSize={Math.max(22, radius(job.teeth) * S * 0.7)}>
          {m.emoji}
        </text>
        {machineTurn && <TurnArrow r={radius(job.teeth) * S} turn={machineTurn} />}
      </g>
      {b.pegs.map((p, i) => {
        const { x, y } = pegAt(p);
        const on = placed.has(i);
        const turn = turning?.get(i) ?? null;
        const isStuck = !!stuck && stuck.includes(i);
        const rowPegs = b.pegs.filter((q) => q.r === p.r && q.c <= p.c).length;
        const near = i === b.entry ? ' It touches the crank.' : i === b.exit ? ` It touches ${m.name}.` : '';
        return (
          <g
            key={i}
            transform={`translate(${x * S} ${y * S})`}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked || undefined}
            aria-label={`${ROW_NAME[p.r] ?? `Row ${p.r + 1}`}, peg ${rowPegs}: ${on ? 'a gear. Take it off.' : 'empty. Put a gear on.'}${near}`}
            onClick={() => onPeg(i)}
            onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPeg(i);
              }
            }}
            className={cn('group outline-none', !locked && 'cursor-pointer')}
          >
            <circle r={S * 0.47} fill={on ? 'transparent' : '#4a2e1e'} stroke="#2a1a12" strokeWidth="3" />
            {on ? (
              <Spinning period={period(16)} turn={turn} still={still}>
                <GearShape teeth={16} r={S / 2} />
              </Spinning>
            ) : (
              <circle r="11" fill="#cbd5e1" stroke="#1b0f22" strokeWidth="4" />
            )}
            {on && turn && <TurnArrow r={S / 2} turn={turn} />}
            {isStuck && (
              <g>
                <circle r={S * 0.56} fill="none" stroke="#e8483f" strokeWidth="7" strokeDasharray="12 8" />
                <circle cx={S * 0.36} cy={-S * 0.36} r="17" fill="#e8483f" stroke="#1b0f22" strokeWidth="4" />
                <text x={S * 0.36} y={-S * 0.36} textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="bold" fill="#fff">
                  !
                </text>
              </g>
            )}
            {/* The focus ring, drawn (an SVG has no outline everywhere). */}
            <circle r={S * 0.53} fill="none" stroke="#22d3ee" strokeWidth="7" className="opacity-0 group-focus-visible:opacity-100" />
          </g>
        );
      })}
    </svg>
  );
}

/** The board's viewBox: room for the biggest crank and machine gears, so it doesn't move between jobs. */
function viewBoxFor(b: Board): string {
  const at = ends(b, 24, 24);
  const xs = [...b.pegs.map((p) => pegAt(p).x), at.crank.x - radius(24), at.machine.x + radius(24)];
  const ys = b.pegs.map((p) => pegAt(p).y);
  const x0 = Math.min(...xs, at.crank.x - radius(24)) - 0.2;
  const x1 = Math.max(...xs) + 0.2;
  const y0 = Math.min(...ys) - 0.66;
  const y1 = Math.max(...ys) + 0.66;
  return `${x0 * S} ${y0 * S} ${(x1 - x0) * S} ${(y1 - y0) * S}`;
}

/** A group that spins about its centre, `turn` way round, one turn every `period` seconds (still, with reduced motion). */
function Spinning({ period, turn, still, children }: { period: number; turn: Turn | null; still: boolean; children: ReactNode }) {
  const spin = !!turn && !still;
  return (
    <g
      className={spin ? 'animate-spin' : undefined}
      style={spin ? { transformBox: 'fill-box', transformOrigin: 'center', animationDuration: `${period}s`, animationDirection: turn === 'ccw' ? 'reverse' : 'normal' } : undefined}
    >
      {/* An invisible ring, so the group's box is centred on the hub and it spins true. */}
      <circle r={S} fill="none" stroke="none" />
      {children}
    </g>
  );
}

/** Which way a gear turned: an arrow round its top. */
function TurnArrow({ r, turn }: { r: number; turn: Turn }) {
  const a = r * 0.55;
  return (
    <g transform={turn === 'ccw' ? 'scale(-1 1)' : undefined} aria-hidden="true">
      <path d={`M ${-a} ${-a * 0.3} A ${a} ${a} 0 0 1 ${a} ${-a * 0.3}`} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
      <path d={`M ${-a} ${-a * 0.3} A ${a} ${a} 0 0 1 ${a} ${-a * 0.3}`} fill="none" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" />
      <path d={`M ${a - 12} ${-a * 0.3 - 10} L ${a} ${-a * 0.3 + 2} L ${a + 12} ${-a * 0.3 - 12}`} fill="none" stroke="#0e7490" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/**
 * The Clocktower's machine room, close up (§2.2): the great clock's face, a
 * window on Gearfall, pipes, and today's machine on its brass plate — still
 * and grey while it's stopped, lit once it runs. Tock and Ember stand over
 * the SVG as HTML (no `foreignObject`, which Safari mis-renders).
 */
function ClockScene({ machine, running }: { machine: MachineId; running: boolean }) {
  const m = MACHINE_BY_ID[machine];
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const tock = NPC_DEFS['gearfall-clockkeeper'];
  return (
    <>
      <svg viewBox="0 0 900 420" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Tock’s clocktower: ${m.name}, ${running ? 'running' : 'stopped'}`} className="absolute inset-0 h-full w-full">
        <rect width="900" height="420" fill="#4a3a5e" />
        {/* Stone blocks. */}
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 10 }, (_, k) => (
            <rect key={`${row}-${k}`} x={k * 96 - (row % 2) * 48} y={row * 48} width="92" height="44" fill={(row + k) % 3 ? '#54436a' : '#4f3f64'} />
          )),
        )}
        {/* The great clock's face. */}
        <g transform="translate(150 190)">
          <circle r="140" fill="#9a6516" stroke="#1b0f22" strokeWidth="8" />
          <circle r="122" fill="#fff6dc" stroke="#1b0f22" strokeWidth="5" />
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k * Math.PI) / 6;
            return <circle key={k} cx={100 * Math.sin(a)} cy={-100 * Math.cos(a)} r={k % 3 === 0 ? 9 : 5} fill="#1b0f22" />;
          })}
          {/* Stopped at 3 o'clock, as it was before Tock's quest; going once a machine runs. */}
          <path d={running ? 'M0 0 L-46 -62' : 'M0 0 L0 -82'} stroke="#1b0f22" strokeWidth="10" strokeLinecap="round" />
          <path d={running ? 'M0 0 L58 30' : 'M0 0 L62 0'} stroke="#1b0f22" strokeWidth="14" strokeLinecap="round" />
          <circle r="12" fill="#e0a43a" stroke="#1b0f22" strokeWidth="4" />
        </g>
        {/* A window on Gearfall. */}
        <g transform="translate(370 60)">
          <rect width="150" height="190" rx="70" fill="#7dd3fc" stroke="#1b0f22" strokeWidth="8" />
          <path d="M75 0 V190 M0 100 H150" stroke="#1b0f22" strokeWidth="6" />
          <path d="M8 160 L40 120 L70 150 L100 110 L142 160 V182 H8 Z" fill="#8a5a3b" />
        </g>
        {/* Pipes. */}
        <path d="M560 0 V120 Q560 150 590 150 H900" fill="none" stroke="#1b0f22" strokeWidth="26" />
        <path d="M560 0 V120 Q560 150 590 150 H900" fill="none" stroke="#c48a52" strokeWidth="16" />
        {/* Today's machine on its plate. */}
        <g transform="translate(700 270)">
          <rect x="-110" y="-90" width="220" height="180" rx="18" fill={running ? '#fcd34d' : '#9ca3af'} stroke="#1b0f22" strokeWidth="6" />
          <circle r="56" fill={running ? '#fff6dc' : '#d1d5db'} stroke="#1b0f22" strokeWidth="5" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="64" opacity={running ? 1 : 0.55}>
            {m.emoji}
          </text>
          <text y="78" textAnchor="middle" fontFamily="'Jersey 15', 'Arial Narrow', sans-serif" fontSize="26" fill="#1b0f22">
            {running ? 'RUNNING!' : 'STOPPED'}
          </text>
        </g>
        <rect y="392" width="900" height="28" fill="#2a1a12" />
      </svg>
      <span aria-hidden="true" className="absolute bottom-[6%] right-[32%] flex items-end">
        {tock && <CharacterPortrait spriteId={npcSpriteId(tock, flags)} emoji={npcEmoji(tock, flags)} scale={3} className="text-5xl" />}
      </span>
      <span aria-hidden="true" className="absolute bottom-[4%] left-[36%]">
        <EmberSprite anim={running ? 'cheer' : undefined} scale={3} />
      </span>
    </>
  );
}

/**
 * The Clocktower's machines: a page per machine brought back to life. A found
 * page shows it; tapped, it's read out — by Tock, and under the book.
 */
function MachineBook({ known, read, onRead }: { known: (id: MachineId) => boolean; read: MachineId | null; onRead: (id: MachineId) => void }) {
  const count = MACHINES.filter((m) => known(m.id)).length;
  const reading = read ? MACHINE_BY_ID[read] : null;
  const panel = useRef<HTMLParagraphElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="cg-book" className="order-2 mt-auto flex flex-col gap-2 sm:order-none">
      <div className="flex items-baseline justify-between">
        <h2 id="cg-book" className={cn(pixelHeadClass, 'text-2xl')}>
          Clocktower Machines
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {MACHINES.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-1.5">
        {MACHINES.map((m) =>
          known(m.id) ? (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onRead(m.id)}
                aria-pressed={read === m.id}
                aria-label={`${m.short}. Read the page`}
                className={cn('flex h-[64px] w-full flex-col items-center justify-center gap-0.5 rounded border-[3px] bg-[#fff6dc] hover:bg-white', read === m.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  {m.emoji}
                </span>
                <span aria-hidden="true" className="w-full truncate px-0.5 text-center text-[11px] font-bold leading-tight text-[#1b0f22]">
                  {m.short}
                </span>
              </button>
            </li>
          ) : (
            <li key={m.id}>
              <span role="img" aria-label="A machine not fixed yet" className="flex h-[64px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                ?
              </span>
            </li>
          ),
        )}
      </ul>
      {reading && (
        <p ref={panel} className="flex items-start gap-2 rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <span aria-hidden="true" className="flex-none text-lg leading-none">
            {reading.emoji}
          </span>
          <span>
            <b>{reading.short}</b> — {reading.note}
          </span>
        </p>
      )}
    </section>
  );
}
