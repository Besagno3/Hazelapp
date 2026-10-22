import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  CRANK_TEETH,
  HANDLE,
  JOBS_PER_ROUND,
  MACHINES,
  MACHINE_BY_ID,
  boardBox,
  check,
  ends,
  jobFor,
  jobWords,
  learnedLine,
  pegAt,
  radius,
  roundQueue,
  run,
  speedWords,
  touching,
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
import { BAND_LABEL, pageFlag, type Band } from '../../../content/minigames';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useFitWidth } from '../useFitWidth';
import { useStickyHeight } from '../useStickyHeight';
import { GearShape } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Tock after a machine comes back to life, in turn. */
const RIGHT_LINES = ['Tick… TOCK! Listen to it go!', 'Splendid! Right on time.', 'Ha! The old thing hasn’t run that well in years.'];

const HEADS: Record<Verdict, string> = {
  right: 'It works!',
  // The crank turns on its own (review round 1: "Nothing turned" under a spinning crank).
  empty: 'Only the crank turned',
  'not-joined': 'Not joined yet',
  jammed: 'Jammed!',
  'wrong-way': 'The wrong way round',
  // Not "a bit": it may be three times too fast (review round 2).
  'too-fast': 'Too fast',
  'too-slow': 'Too slow',
};

/** The crank's gear sizes, by name (not "Medium": that's a band, review round 1). */
const SIZE_NAME: Record<Teeth, string> = { 8: 'Small', 16: 'Middle', 24: 'Big' };

const ARROW: Record<Turn, string> = { cw: '↻', ccw: '↺' };

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
  const tricky = CRANK_TEETH[band].length > 1;
  const [done, setDone] = useState(0);
  // Which machines have stopped this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue((id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const machine = MACHINE_BY_ID[job.machine];
  const [placed, setPlaced] = useState<ReadonlySet<number>>(() => new Set());
  // Tricky's crank starts with no gear: the speed is the kid's to work out, never right by default (review round 1).
  const [crank, setCrank] = useState<Teeth | null>(tricky ? null : 16);
  const [result, setResult] = useState<{ run: Run; verdict: Verdict; crank: Teeth } | null>(null);
  const [lessons, setLessons] = useState<string[]>([]);
  const [newPage, setNewPage] = useState(false);
  const [read, setRead] = useState<MachineId | null>(null);
  const [rights, setRights] = useState(0);
  // Bumped when the kid goes back to change the gears: focus goes back to the board.
  const [again, setAgain] = useState(0);
  const known = (id: MachineId) => !!flags[pageFlag(def.id, id)];
  const verdict = result?.verdict ?? null;
  const right = verdict === 'right';
  const ready = placed.size > 0 && crank !== null;

  // Focus starts on the crank's peg, described by the job — the pegs come first on the page, so a keyboard kid starts
  // where the game does (review round 1: it started on a heading after them). A peg tapped or a gear picked leaves
  // focus where it is; a run moves it to what happened.
  const entry = useRef<SVGGElement>(null);
  const resultHead = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    entry.current?.focus({ preventScroll: first.current });
    first.current = false;
  }, [done, again]);
  // On a phone the board stays at the top of the page: the page keeps that much room at its top when it scrolls
  // something into view, so nothing lands under the board (review round 2: what happened, and why, did).
  const [boardEl, boardH] = useStickyHeight<HTMLElement>();

  // What happened, in sight below the board.
  useEffect(() => {
    if (!result) return;
    resultHead.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    resultHead.current?.focus({ preventScroll: true });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // The step's gold button comes into view as a step starts — never on a peg tap, which slid the board under the
  // kid's finger on a phone (review round 2, as the bakery's) — with Tricky's crank gears just above it. Not where
  // the board scrolls with the page (a phone on its side under 640 px): it'd go before the kid had seen it.
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (result) return;
    const b = boardEl.current;
    if (b && window.matchMedia?.('(max-width: 639px)').matches && getComputedStyle(b).position !== 'sticky') return;
    goRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [done, again, !!result]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Its button goes with the gears: focus back to the crank's peg (review round 2: it fell to the page).
    setAgain((n) => n + 1);
  }

  function pickCrank(t: Teeth) {
    if (right) return;
    sfx('select');
    setRead(null);
    setResult(null);
    setCrank(t);
  }

  function turn() {
    if (result || !ready || crank === null) return;
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

  function change() {
    setResult(null);
    setAgain((n) => n + 1);
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
    setCrank(tricky ? null : 16);
    setResult(null);
    setNewPage(false);
  }

  const stepIndex = result ? 2 : placed.size > 0 ? 1 : 0;
  const [area, fit] = useFitWidth(boardRatio(job.board, band), LABELS_PX);

  let line: string;
  const readMachine = read ? MACHINE_BY_ID[read] : null;
  if (readMachine) line = `${readMachine.short}: ${readMachine.note}`;
  else if (right) line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'On to the next machine!' : 'That’s the last one!'}`;
  else if (result) line = 'Tick… tock… not quite! Look at what turned, then change the gears and try again.';
  else if (!job.turn) line = `${cap(machine.name)} has stopped! Put gears on the pegs from the crank to it — gears that touch turn each other.`;
  else if (job.speed === undefined) line = `${cap(machine.name)} must turn ${turnWords(job.turn)}. Each gear turns the other way from the one before — count them!`;
  else
    line = `${cap(machine.name)} must turn ${turnWords(job.turn)}, ${speedWords(job.speed)} — its gear has ${job.teeth} teeth. Pick the crank’s gear: only it and the machine’s gear change the speed.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden" style={boardH ? { scrollPaddingTop: boardH } : undefined}>
      {/* The Clocktower's room above the board from `sm` up; a phone and a short screen keep just the board (review
          round 2: on a phone a strip of it scrolled away at the first step, and slid the board under a tap). */}
      <div className="grid flex-none grid-cols-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_300px] sm:grid-rows-[minmax(0,40fr)_minmax(0,60fr)] lg:grid-cols-[minmax(0,1fr)_380px] sm:[@media(max-height:500px)]:grid-rows-[minmax(0,1fr)]">
        <section aria-label="Tock’s clocktower" className="relative hidden overflow-hidden sm:col-start-1 sm:row-start-1 sm:block [@media(max-height:500px)]:hidden">
          <ClockScene machine={job.machine} running={right} />
        </section>

        {/* The board: on a phone it stays at the top while the steps scroll under it, so a gear placed is always in sight. */}
        {/* Not on a phone on its side under 640 px, where it'd be taller than the room under the header (review round 2). */}
        <section
          ref={boardEl}
          aria-labelledby="cg-board"
          className="sticky top-0 z-10 flex flex-col gap-1 border-b-4 border-[#1b0f22] bg-[#3b2a4a] px-2 pb-1.5 pt-1 sm:static sm:col-start-1 sm:row-start-2 sm:min-h-0 sm:justify-center sm:border-b-0 sm:border-t-4 sm:p-4 [@media(max-height:500px)]:static [@media(max-height:500px)]:row-start-1 [@media(max-height:500px)]:border-t-0 [@media(max-height:500px)]:p-2"
        >
          {/* The board as big as its space allows, its heading on it and its labels right under its ends (review
              rounds 1 and 2). */}
          <div ref={area} className="flex w-full justify-center sm:min-h-0 sm:flex-1 sm:items-center">
            <div className="w-full max-w-[860px]" style={fit ? { width: fit } : undefined}>
              <h2 id="cg-board" className={cn(pixelHeadClass, 'mb-1 text-lg text-[#fde68a] sm:text-2xl [@media(max-width:639px)]:sr-only')}>
                The gear board
              </h2>
              <GearBoard ref={entry} job={job} band={band} placed={placed} crank={result?.crank ?? crank} ran={result?.run ?? null} still={still} locked={right} onPeg={peg} />
              {/* What the ends are, and on Medium and Tricky which way the machine must turn — then which way it did. */}
              <p aria-hidden="true" className="grid w-full grid-cols-2 gap-2 px-1 pt-1 text-[13px] font-bold leading-tight text-[#fde68a] sm:text-[15px]">
                <span>
                  ⟳ The crank
                  {tricky && <span className="font-semibold text-[#e4e1ff]"> · {crank !== null ? `${crank} teeth` : 'pick its gear'}</span>}
                </span>
                <span className="text-right">
                  {machine.emoji} {machine.short}
                  {tricky && <span className="font-semibold text-[#e4e1ff]"> · {job.teeth} teeth</span>}
                </span>
                {/* Which way it must turn, then which way it did, on a line of its own so an arrow never wraps away
                    (review round 2); turned the wrong way, what it must do stays in sight. */}
                {job.turn && (
                  <span className="col-span-2 whitespace-nowrap text-right font-semibold text-[#e4e1ff]">
                    {result?.run.kind === 'turns' ? `turned ${ARROW[result.run.turn]}` : `must turn ${ARROW[job.turn]}`}
                    {verdict === 'wrong-way' && ` · must turn ${ARROW[job.turn]}`}
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>

        <aside aria-label={`The job and the ${def.collection}`} className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:overflow-y-auto sm:border-l-4 sm:p-4">
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
                <h2 className={cn(pixelHeadClass, 'text-[26px]')}>Step 1 · Place the gears</h2>
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
                        {SIZE_NAME[t]}
                        <span className="block font-semibold text-[#c9c5f2]">{t} teeth</span>
                      </button>
                    ))}
                  </div>
                )}
                <p role="status" className="text-center text-[15px] font-bold">
                  {placed.size === 0 ? 'No gears on the pegs yet.' : `${cap(gearsWord(placed.size))} on the pegs.`}
                </p>
                <button ref={goRef} type="button" onClick={turn} aria-disabled={!ready || undefined} className={cn(goldClass, 'h-14 text-lg')}>
                  {placed.size === 0 ? 'Put a gear on first' : crank === null ? 'Pick the crank’s gear first' : 'Turn the crank ↻'}
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
                  <button ref={goRef} type="button" onClick={change} className={cn(goldClass, 'text-lg')}>
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

/** Room under the board for its labels, in px (two lines on a narrow screen). */
const LABELS_PX = 76;


const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const gearsWord = (n: number) => `${NUM[n] ?? n} gear${n === 1 ? '' : 's'}`;

/** "a, b and c". */
function listWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

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

/** Seconds for one turn of the crank, and how many turns a run shows before it stops (review round 1: it spun on). */
const CRANK_TURN_S = 3;
const CRANK_TURNS = 3;

/** The crank's knob: how far out from its gear, and its size (its reach is `HANDLE`, in pegs). */
const KNOB_AT = 26;
const KNOB_R = 13;

/**
 * The board: the crank on the left, the machine on the right, the pegs
 * between. Each peg is a button (tap, or Enter / Space) that puts a gear on
 * it or takes it off, named by its place, what it touches and — after a run —
 * what its gear did. After a run every gear that turned spins for a few turns
 * (or, with reduced motion, stays still) and shows its arrow on its hub; a jam
 * shakes and marks its stuck gears. Before a run on Medium and Tricky, a
 * dashed arrow on the machine shows which way it must turn. `ref` is the
 * crank's peg, where focus starts.
 */
const GearBoard = forwardRef<
  SVGGElement,
  {
    job: Job;
    band: Band;
    placed: ReadonlySet<number>;
    crank: Teeth | null;
    ran: Run | null;
    still: boolean;
    locked: boolean;
    onPeg: (i: number) => void;
  }
>(function GearBoard({ job, band, placed, crank, ran, still, locked, onPeg }, entryRef) {
  const b = job.board;
  const m = MACHINE_BY_ID[job.machine];
  const biggest = biggestFor(band);
  const frame = useMemo(() => boardBox(b, biggest), [b, biggest]);
  const [bx, by, bw, bh] = [frame.x * S, frame.y * S, frame.w * S, frame.h * S];
  const box = `${bx} ${by} ${bw} ${bh}`;
  // Left to right, then top to bottom: Tab follows the train from the crank to the machine (review round 2: the
  // top row came first, before the crank's peg focus starts on).
  const order = useMemo(
    () =>
      b.pegs
        .map((_, i) => i)
        .sort((i, k) => pegAt(b.pegs[i]).x - pegAt(b.pegs[k]).x || b.pegs[i].r - b.pegs[k].r),
    [b],
  );
  // Before Tricky's crank gear is picked, a middle one stands in, faded.
  const shown: Teeth = crank ?? 16;
  const at = ends(b, shown, job.teeth);
  const turning = ran && (ran.kind === 'turns' || ran.kind === 'not-joined') ? ran.turning : null;
  const stuck = ran?.kind === 'jammed' ? ran.stuck : null;
  const crankTurns = !!ran && ran.kind !== 'jammed';
  const machineTurn: Turn | null = ran?.kind === 'turns' ? ran.turn : null;
  const period = (teeth: number) => (CRANK_TURN_S * teeth) / shown;

  /** A peg's name for a sentence: "middle row peg 2". */
  const pegName = (i: number) => {
    const p = b.pegs[i];
    return `${(ROW_NAME[p.r] ?? `Row ${p.r + 1}`).toLowerCase()} peg ${b.pegs.filter((q) => q.r === p.r && q.c <= p.c).length}`;
  };

  return (
    <svg
      viewBox={box}
      role="group"
      aria-label={`The gear board: the crank on the left, ${m.name} on the right${job.speed !== undefined ? ` (its gear has ${job.teeth} teeth)` : ''}, ${b.pegs.length} pegs between`}
      aria-describedby="cg-job"
      className="mx-auto block h-auto max-h-full w-full max-w-[860px] sm:min-h-0"
    >
      <rect x={bx + 4} y={by + 4} width={bw - 8} height={bh - 8} rx="22" fill="#5b3a26" stroke="#1b0f22" strokeWidth="8" />
      {/* The crank: its gear and its handle. */}
      <g transform={`translate(${at.crank.x * S} ${at.crank.y * S})`} opacity={crank === null ? 0.45 : 1}>
        <Spinning period={period(shown)} turn={crankTurns ? 'cw' : null} still={still} reach={(radius(shown) + HANDLE) * S}>
          <GearShape teeth={shown} r={radius(shown) * S} />
          <path d={`M0 0 L0 ${-radius(shown) * S - KNOB_AT}`} stroke="#1b0f22" strokeWidth="14" strokeLinecap="round" />
          <circle cy={-radius(shown) * S - KNOB_AT} r={KNOB_R} fill="#e8483f" stroke="#1b0f22" strokeWidth="5" />
        </Spinning>
        {crankTurns && <HubArrow r={radius(shown) * S} turn="cw" />}
      </g>
      {/* The machine: its gear, its face, and which way it must turn (then did). */}
      <g transform={`translate(${at.machine.x * S} ${at.machine.y * S})`}>
        <Spinning period={period(job.teeth)} turn={machineTurn} still={still}>
          <GearShape teeth={job.teeth} r={radius(job.teeth) * S} fill="#f2c45a" />
        </Spinning>
        {machineTurn ? (
          <HubArrow r={radius(job.teeth) * S} turn={machineTurn} />
        ) : job.turn ? (
          <HubArrow r={radius(job.teeth) * S} turn={job.turn} target />
        ) : (
          <>
            <circle r={Math.max(20, radius(job.teeth) * S * 0.62)} fill="#fff6dc" stroke="#1b0f22" strokeWidth="4" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={Math.max(22, radius(job.teeth) * S * 0.7)}>
              {m.emoji}
            </text>
          </>
        )}
      </g>
      {order.map((i) => {
        const p = b.pegs[i];
        const { x, y } = pegAt(p);
        const on = placed.has(i);
        const turn = turning?.get(i) ?? null;
        const isStuck = !!stuck && stuck.includes(i);
        const name = pegName(i);
        const touches = [
          ...(i === b.entry ? ['the crank'] : []),
          ...b.pegs.flatMap((q, k) => (k !== i && touching(p, q) ? [pegName(k)] : [])),
          ...(i === b.exit ? [m.name] : []),
        ];
        // What its gear did, after a run (review round 1: only drawn).
        const did = !on || !ran ? '.' : isStuck ? ', stuck!' : turn ? `, turning ${turnWords(turn)}.` : ', not turning.';
        return (
          <g
            key={i}
            ref={i === b.entry ? entryRef : undefined}
            transform={`translate(${x * S} ${y * S})`}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked || undefined}
            aria-label={`${cap(name.replace(' peg', ', peg'))}: ${on ? `a gear${did} Take it off.` : 'empty. Put a gear on.'} Touches ${listWords(touches)}.`}
            onClick={() => onPeg(i)}
            onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              // A held key doesn't flick the gear on and off (review round 1).
              if (!e.repeat) onPeg(i);
            }}
            className={cn('group outline-none', !locked && 'cursor-pointer')}
          >
            <circle r={S * 0.47} fill={on ? 'transparent' : '#4a2e1e'} stroke="#2a1a12" strokeWidth="3" />
            {on ? (
              // The shake on its own group: an SVG's translate is in its transform attribute, which a CSS transform replaces.
              <g className={isStuck && !still ? 'cg-shake' : undefined}>
                <Spinning period={period(16)} turn={turn} still={still}>
                  <GearShape teeth={16} r={S / 2} />
                </Spinning>
              </g>
            ) : (
              <circle r="11" fill="#cbd5e1" stroke="#1b0f22" strokeWidth="4" />
            )}
            {on && turn && <HubArrow r={S / 2} turn={turn} />}
            {/* Marks and rings are pictures only: a tap goes to the peg under them (review round 2). */}
            {isStuck && (
              <g pointerEvents="none">
                <circle r={S * 0.56} fill="none" stroke="#e8483f" strokeWidth="7" strokeDasharray="12 8" />
                <circle cx={S * 0.36} cy={-S * 0.36} r="17" fill="#e8483f" stroke="#1b0f22" strokeWidth="4" />
                <text x={S * 0.36} y={-S * 0.36} textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="bold" fill="#fff">
                  !
                </text>
              </g>
            )}
            {/* The focus ring, drawn (an SVG has no outline everywhere). */}
            <circle r={S * 0.53} fill="none" stroke="#22d3ee" strokeWidth="7" pointerEvents="none" className="opacity-0 group-focus-visible:opacity-100" />
          </g>
        );
      })}
    </svg>
  );
});

/** The biggest gear at either end on a band: Tricky's 24 teeth, else 16 (Gentle and Medium never change them). */
const biggestFor = (band: Band): Teeth => (band === 'tricky' ? 24 : 16);

/** The board's width over its height. */
function boardRatio(b: Board, band: Band): number {
  const { w, h } = boardBox(b, biggestFor(band));
  return w / h;
}

/**
 * A group that spins about its hub, `turn` way round, one turn every `period`
 * seconds, for `CRANK_TURNS` turns of the crank (still, with reduced motion).
 * `reach`: how far it reaches from the hub, so its box is centred there and it
 * spins true (review round 1: the crank's handle tipped it off centre).
 */
function Spinning({ period, turn, still, reach = S, children }: { period: number; turn: Turn | null; still: boolean; reach?: number; children: ReactNode }) {
  const spin = !!turn && !still;
  return (
    <g
      className={spin ? 'animate-spin' : undefined}
      data-turn={spin ? turn : undefined}
      style={
        spin
          ? {
              transformBox: 'fill-box',
              transformOrigin: 'center',
              animationDuration: `${period}s`,
              animationDirection: turn === 'ccw' ? 'reverse' : 'normal',
              animationIterationCount: (CRANK_TURNS * CRANK_TURN_S) / period,
              animationFillMode: 'forwards',
            }
          : undefined
      }
    >
      {/* An invisible ring, so the group's box is centred on the hub. */}
      <circle r={Math.max(S, reach + 2)} fill="none" stroke="none" />
      {children}
    </g>
  );
}

/**
 * Which way a gear turned: a bold arrow round its hub, on a white chip
 * (review round 1: arcs over the gears' tops met at every joint). `target`:
 * which way it must turn — dashed, before a run.
 */
function HubArrow({ r, turn, target = false }: { r: number; turn: Turn; target?: boolean }) {
  const chip = Math.max(19, Math.min(30, r * 0.62));
  const a = chip * 0.58;
  const ink = target ? '#b45309' : '#0e7490';
  // Three quarters of a circle from the top, clockwise, ending in a head.
  const start = { x: 0, y: -a };
  const end = { x: -a, y: 0 };
  return (
    <g transform={turn === 'ccw' ? 'scale(-1 1)' : undefined} aria-hidden="true" pointerEvents="none" data-arrow={target ? `must-${turn}` : turn}>
      <circle r={chip} fill="#ffffff" stroke="#1b0f22" strokeWidth="4" strokeDasharray={target ? '7 5' : undefined} />
      <path d={`M ${start.x} ${start.y} A ${a} ${a} 0 1 1 ${end.x} ${end.y}`} fill="none" stroke={ink} strokeWidth={chip * 0.22} strokeLinecap="round" />
      <path
        d={`M ${end.x - chip * 0.28} ${end.y + chip * 0.05} L ${end.x} ${end.y - chip * 0.32} L ${end.x + chip * 0.28} ${end.y + chip * 0.05} Z`}
        fill={ink}
        stroke={ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * The Clocktower's machine room, close up (§2.2): the great clock's face, a
 * window on Gearfall, pipes, and today's machine on its brass plate — still
 * and grey while it's stopped, lit once it runs. Tock and Ember stand over
 * the SVG as HTML (no `foreignObject`, which Safari mis-renders), out at the
 * sides. Anchored at the bottom with the plate near the middle, so a crop
 * keeps it (review round 1).
 */
function ClockScene({ machine, running }: { machine: MachineId; running: boolean }) {
  const m = MACHINE_BY_ID[machine];
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const tock = NPC_DEFS['gearfall-clockkeeper'];
  return (
    <>
      <svg viewBox="0 0 900 420" preserveAspectRatio="xMidYMax slice" role="img" aria-label={`Tock’s clocktower: ${m.name}, ${running ? 'running' : 'stopped'}`} className="absolute inset-0 h-full w-full">
        <rect width="900" height="420" fill="#4a3a5e" />
        {/* Stone blocks. */}
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 10 }, (_, k) => (
            <rect key={`${row}-${k}`} x={k * 96 - (row % 2) * 48} y={row * 48} width="92" height="44" fill={(row + k) % 3 ? '#54436a' : '#4f3f64'} />
          )),
        )}
        {/* The great clock's face. */}
        <g transform="translate(160 200)">
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
        <g transform="translate(660 50)">
          <rect width="150" height="190" rx="70" fill="#7dd3fc" stroke="#1b0f22" strokeWidth="8" />
          <path d="M75 0 V190 M0 100 H150" stroke="#1b0f22" strokeWidth="6" />
          <path d="M8 160 L40 120 L70 150 L100 110 L142 160 V182 H8 Z" fill="#8a5a3b" />
        </g>
        {/* Pipes. */}
        <path d="M600 0 V100 Q600 130 570 130 H340" fill="none" stroke="#1b0f22" strokeWidth="26" />
        <path d="M600 0 V100 Q600 130 570 130 H340" fill="none" stroke="#c48a52" strokeWidth="16" />
        {/* Today's machine on its plate. */}
        <g transform="translate(480 290)">
          <rect x="-100" y="-90" width="200" height="170" rx="18" fill={running ? '#fcd34d' : '#9ca3af'} stroke="#1b0f22" strokeWidth="6" />
          <circle cy="-14" r="52" fill={running ? '#fff6dc' : '#d1d5db'} stroke="#1b0f22" strokeWidth="5" />
          <text y="-14" textAnchor="middle" dominantBaseline="central" fontSize="60" opacity={running ? 1 : 0.55}>
            {m.emoji}
          </text>
          <text y="64" textAnchor="middle" fontFamily="'Jersey 15', 'Arial Narrow', sans-serif" fontSize="26" fill="#1b0f22">
            {running ? 'RUNNING!' : 'STOPPED'}
          </text>
        </g>
        <rect y="392" width="900" height="28" fill="#2a1a12" />
      </svg>
      <span aria-hidden="true" className="absolute bottom-[6%] right-[6%] flex items-end">
        {tock && <CharacterPortrait spriteId={npcSpriteId(tock, flags)} emoji={npcEmoji(tock, flags)} scale={3} className="text-5xl" />}
      </span>
      <span aria-hidden="true" className="absolute bottom-[4%] left-[6%]">
        <EmberSprite anim={running ? 'cheer' : undefined} scale={3} />
      </span>
    </>
  );
}

/**
 * The Machine Book: a page per machine brought back to life. A found page
 * shows it; tapped, it's read out — by Tock, and under the book.
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
          Machine Book
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
                <span aria-hidden="true" className="w-full truncate text-center text-[12px] font-bold leading-tight tracking-tight text-[#1b0f22]">
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
      {/* The page read (Tock's bubble says it too, and is the live region). */}
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
