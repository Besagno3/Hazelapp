import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  JOBS_PER_ROUND,
  RING_WIDTH,
  TREES,
  TREE_BY_ID,
  countWords,
  dateWords,
  dryWords,
  fitOffset,
  jobFor,
  jobWords,
  learnedLine,
  matchWords,
  maxOffset,
  ringWords,
  ringsOf,
  roundQueue,
  weather,
  wetWords,
  type Job,
  type MatchJob,
  type TreeId,
} from '../../../lib/minigames/rings';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useSettled } from '../useSettled';
import { SliceCard } from './art';
import { BARK, LATE, TREE_TINT, WOOD } from './wood';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Counting a slice's rings; its wettest year; a core's year; its dry years; sliding a beam; read. */
type Step = 'count' | 'wet' | 'date' | 'dry' | 'slide' | 'done';

/** Old Ringwood after a tree's read, in turn. */
const RIGHT_LINES = ['Hrrrm! Just as I remember it.', 'You read wood like an old owl. Well done.', 'Ha! I’d forgotten that year. Thank you.'];

/** How near a tap must land to a ring (px) to be that ring, however thin it's drawn. */
const TAP_REACH_PX = 14;

const STEP_CHIPS: Record<Job['kind'], readonly string[]> = {
  count: ['Count the rings', 'The wettest year', 'Its page'],
  date: ['Find the year', 'The dry years', 'Its page'],
  match: ['Slide the beam', 'Its year', 'Its page'],
};

const firstStep = (job: Job): Step => (job.kind === 'count' ? 'count' : job.kind === 'date' ? 'date' : 'slide');

/**
 * 🌳 Ringwood's Rings (docs/DESIGN-MINIGAMES.md §5.7), by Old Ringwood in
 * Eldergrove: a ring a year, wide when it was wet and thin when it was dry.
 * Gentle counts a young tree's slice from the middle out and finds its
 * wettest year; Medium reads a core — the ring from the year something
 * happened, counted back from the bark, then the dry years; Tricky slides an
 * old beam's core along a living tree's till the rings match, to find when the
 * beam's tree was cut. Three trees a round, each a page of the grove book. No
 * timer. Rules: `lib/minigames/rings.ts`.
 */
export default function RingwoodsRings({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which trees come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue(band, (id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const tree = TREE_BY_ID[job.tree];
  const [step, setStep] = useState<Step>(firstStep(job));
  const [counted, setCounted] = useState(0);
  const [hintAt, setHintAt] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [found, setFound] = useState<readonly number[]>([]);
  const [offset, setOffset] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  const [read, setRead] = useState<TreeId | null>(null);
  const known = (id: TreeId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}`);
  const dryRings = job.kind === 'date' ? ringsOf(job.rings, 'dry') : [];

  function finish() {
    sfx('chest');
    setNewPage(onPage(job.tree, tree.name));
    setLessons((l) => [...l, learnedLine(job)]);
    setRights((r) => r + 1);
    setStep('done');
  }

  /** A ring tapped (or pressed), `k` from the middle. */
  function tapRing(k: number) {
    if (!settled()) return;
    setRead(null);
    if (job.kind === 'count' && step === 'count') {
      const total = job.rings.length;
      setSaid(countWords(counted, k, total));
      if (k !== counted) {
        sfx('select');
        // The ring to count next, outlined: where to look.
        setHintAt(counted);
        return;
      }
      sfx('correct');
      setHintAt(null);
      setCounted(counted + 1);
      if (counted + 1 === total) setStep('wet');
      return;
    }
    if (job.kind === 'count' && step === 'wet') {
      setSaid(wetWords(job, k));
      if (weather(job.rings[k]) !== 'wet') return void sfx('wrong');
      setPicked(k);
      finish();
      return;
    }
    if (job.kind === 'date' && step === 'date') {
      setSaid(dateWords(job, k));
      if (job.rings[k] !== job.event.year) return void sfx('wrong');
      sfx('correct');
      setPicked(k);
      setStep('dry');
      return;
    }
    if (job.kind === 'date' && step === 'dry') {
      if (found.includes(k)) {
        setSaid(`${job.rings[k]} is found already — ${dryRings.length - found.length} to go.`);
        return;
      }
      const dry = weather(job.rings[k]) === 'dry';
      const left = dryRings.length - found.length - (dry ? 1 : 0);
      setSaid(dryWords(job, k, left));
      if (!dry) return void sfx('wrong');
      sfx('correct');
      setFound([...found, k]);
      if (!left) finish();
    }
  }

  function slide(d: number) {
    if (job.kind !== 'match' || step !== 'slide') return;
    setRead(null);
    setSaid(null);
    setOffset((o) => Math.max(0, Math.min(maxOffset(job), o + d)));
  }

  function check() {
    if (job.kind !== 'match' || step !== 'slide' || !settled()) return;
    setRead(null);
    setSaid(matchWords(job, offset));
    if (offset !== fitOffset(job)) return void sfx('wrong');
    finish();
  }

  function next() {
    if (step !== 'done' || !settled()) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'Three trees read!', learned: lessons[lessons.length - 1] ?? '' });
      return;
    }
    const j = jobFor(band, round, done + 1, queue);
    setDone((d) => d + 1);
    setStep(firstStep(j));
    setCounted(0);
    setHintAt(null);
    setPicked(null);
    setFound([]);
    setOffset(0);
    setSaid(null);
    setNewPage(false);
  }

  // Focus where each step starts: the wood's first ring to tap; the beam's slide; what was read.
  const wood = useRef<HTMLDivElement>(null);
  const stepHead = useRef<HTMLHeadingElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else if (step === 'slide') stepHead.current?.focus({ preventScroll: true });
    else wood.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus({ preventScroll: true });
  }, [step, done]);

  // As each step starts, the page scrolls back to the board's top on a phone — no further than shows the step's gold
  // button or the wood (a tree read: at least that, with Next); where the page doesn't scroll, the gold button's in view.
  const goRef = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
    const go = step === 'done' || step === 'slide' ? goRef.current : wood.current;
    const s = page.current;
    const b = board.current;
    if (s && b && s.scrollHeight > s.clientHeight && getComputedStyle(s).overflowY !== 'hidden') {
      const base = s.getBoundingClientRect().top - s.scrollTop;
      const top = b.getBoundingClientRect().top - base;
      const bottom = go ? go.getBoundingClientRect().bottom - base : top;
      const show = bottom + 12 - s.clientHeight;
      s.scrollTo?.({ top: Math.max(0, step === 'done' ? Math.max(top, show) : Math.min(top, show)), behavior });
    } else go?.scrollIntoView?.({ block: 'nearest', behavior });
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const cheerLine = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Another?' : 'My rings and I thank you.'}`;
  let line: string;
  if (read) line = `${TREE_BY_ID[read].name}: ${TREE_BY_ID[read].note}`;
  else if (step === 'done') line = cheerLine;
  else if (said) line = said;
  else if (step === 'count') line = `A slice of ${tree.name}. Count its rings for me, from the middle out — I always lose count.`;
  else if (step === 'wet') line = 'Now: which ring is the widest? That was its wettest year.';
  else if (step === 'date' && job.kind === 'date') line = `The ring under the bark is ${job.rings[job.rings.length - 1]}. Count back to ${job.event.year}!`;
  else if (step === 'dry') line = 'Dry years grew thin rings. Find every one!';
  else line = 'An old beam, and my neighbour’s core. Slide the beam till the thin rings line up!';

  const chips = STEP_CHIPS[job.kind];
  const chipAt = step === 'done' ? chips.length : step === 'wet' || step === 'dry' ? 1 : 0;

  // The ring said for a reader: where it is and how it grew (seeing its width) — and what's been found on it.
  const ringLabel = (k: number, year: number): string => {
    if (job.kind === 'count') return `${ringWords(k, year)}${k < counted ? `, counted: ${k + 1}` : ''}${picked === k ? ', the wettest year' : ''}`;
    if (job.kind === 'date') {
      const back = job.rings.length - 1 - k;
      const where = back === 0 ? 'The bark ring' : `The ${ORDINAL[back]} ring in from the bark`;
      const g = weather(year);
      return `${where}, ${g === 'wet' ? 'wide' : g === 'dry' ? 'thin' : 'middling'}${back === 0 || picked === k || found.includes(k) ? `: ${year}` : ''}${found.includes(k) ? ', a dry year' : ''}`;
    }
    return '';
  };

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden">
      {/* Split, the board sits under the grove (from 701 px high), beside the aside; on a short one it's all there is. */}
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] split:[@media(max-height:500px)]:grid-cols-[minmax(440px,1fr)_minmax(0,260px)]">
        <div aria-hidden="true" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:700px)]:hidden">
          <Grove cheer={step === 'done'} />
        </div>

        {/* The wood, and the step with its buttons beside it on a screen held sideways from 560 px (under it on one held
            upright): what to do is always by it, and a step's card growing never moves a ring (on an upright tablet the
            card keeps a height through a tree — bench: the core moved up at the payoff). */}
        <section
          ref={board}
          aria-labelledby="rr-step"
          className="flex flex-col gap-3 bg-[#2c3a26] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:border-t-4 split:border-[#1b0f22] split:p-4 [@media(min-width:560px)_and_(orientation:landscape)]:flex-row split:[@media(max-height:700px)]:row-start-1 split:[@media(max-height:700px)]:border-t-0 split:[@media(max-height:500px)]:p-2"
        >
          <div className="flex min-w-0 flex-col items-center justify-start gap-2 split:min-h-0 split:flex-1 split:justify-center split:[container-type:size] [@media(min-width:560px)_and_(orientation:landscape)]:flex-1">
            {job.kind === 'count' ? (
              <Slice
                ref={wood}
                rings={job.rings}
                counted={counted}
                hintAt={step === 'count' ? hintAt : null}
                picked={picked}
                tint={TREE_TINT[job.tree].wood}
                bark={TREE_TINT[job.tree].bark}
                label={ringLabel}
                done={step === 'done'}
                onTap={tapRing}
              />
            ) : job.kind === 'date' ? (
              <Core ref={wood} job={job} picked={picked} found={found} scar={tree.scar} label={ringLabel} done={step === 'done'} onTap={tapRing} />
            ) : (
              <Match job={job} offset={offset} matched={step === 'done'} />
            )}
          </div>
          <div
            className={cn(
              windowClass,
              'flex flex-col gap-2.5 p-3 [&>*]:flex-none split:overflow-y-auto split:[@media(orientation:portrait)]:max-h-[45%] split:[@media(orientation:portrait)]:min-h-[min(300px,45%)] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:w-[min(300px,46%)] [@media(min-width:560px)_and_(orientation:landscape)]:flex-none [@media(min-width:560px)_and_(max-height:500px)]:w-[min(340px,55%)] [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:p-2.5',
            )}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden">
              Tree {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                <h2 id="rr-step" ref={doneHead} tabIndex={-1} aria-describedby="rr-result" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white [@media(max-height:500px)]:text-[20px]', focusRing)}>
                  {tree.name}!
                </h2>
                {/* Ringwood's cheer, in the card too: on a phone his bubble's below the fold — not on a split screen, where
                    it's beside the board. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                <p id="rr-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                  {lessons[lessons.length - 1]}
                  {/* Said to a reader only on a split screen: the grove book's in sight beside the board (bench: at 640 × 360 the
                      card's heading went out of view). */}
                  {newPage && ' '}
                  {newPage && <span className="split:sr-only">{tree.name} is in the grove book!</span>}
                </p>
                <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:text-base')}>
                  {done + 1 < JOBS_PER_ROUND ? 'Next tree' : 'All done!'}
                </button>
              </>
            ) : (
              <>
                <h2
                  id="rr-step"
                  ref={stepHead}
                  tabIndex={-1}
                  aria-describedby="rr-job"
                  className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none [@media(max-height:500px)]:text-[19px]', focusRing)}
                >
                  {stepTitle(step)}
                </h2>
                <p id="rr-do" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  {stepWords(step, job, counted, dryRings.length - found.length)}
                </p>
                {/* What Ringwood said of the last tap, by the wood too: on a phone his bubble's below the fold. Room for
                    the longest, so nothing under it moves; not read out — his bubble is. */}
                <p className="flex min-h-[4.25rem] items-center rounded-md bg-[#24215a] px-2.5 text-[15px] font-bold leading-snug [@media(max-height:500px)]:min-h-[3.5rem] [@media(max-height:500px)]:text-[14px]">
                  {said ?? ''}
                </p>
                {step === 'slide' && job.kind === 'match' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => slide(-1)} aria-disabled={offset === 0 || undefined} aria-describedby="rr-under" className={cn(outlineClass, 'min-h-12 border-2 px-2 text-base aria-disabled:opacity-50')}>
                        ◀ Slide
                      </button>
                      <button type="button" onClick={() => slide(1)} aria-disabled={offset === maxOffset(job) || undefined} aria-describedby="rr-under" className={cn(outlineClass, 'min-h-12 border-2 px-2 text-base aria-disabled:opacity-50')}>
                        Slide ▶
                      </button>
                    </div>
                    <button ref={goRef} type="button" onClick={check} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:text-base')}>
                      Do they match?
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </section>

        <aside
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] split:col-start-2 split:row-span-2 split:row-start-1 split:overflow-y-auto split:border-l-4 split:p-4"
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          {/* Left out on a short screen, where the step card says it (it still describes the step). */}
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={tree.name.toUpperCase()} ready={step === 'done'} icon={<SliceCard id={job.tree} size={52} />} id="rr-job">
              {jobWords(job)}
            </Ticket>
          </div>
          <GroveBook known={known} read={read} onRead={setRead} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 split:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={chips} current={chipAt} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth'];

function stepTitle(step: Step): string {
  if (step === 'count') return 'Count the rings';
  if (step === 'wet') return 'The wettest year';
  if (step === 'date') return 'Find the year';
  if (step === 'dry') return 'The dry years';
  return 'Match the rings';
}

function stepWords(step: Step, job: Job, counted: number, dryLeft: number): ReactNode {
  if (job.kind === 'count' && step === 'count') return `Tap the rings from the middle out — one ring, one year. ${counted} of ${job.rings.length} counted.`;
  if (step === 'wet') return 'A wet year grew a wide ring. Tap the widest!';
  if (job.kind === 'date' && step === 'date') return `The bark ring is ${job.rings[job.rings.length - 1]}; each ring in is a year earlier. Tap the ring from ${job.event.year}.`;
  if (step === 'dry') return `Dry years grew thin rings. Tap every thin one: ${dryLeft} to find.`;
  return 'Slide the old beam till its thin rings sit right under the tree’s, then check.';
}

/** The wood's tap: the ring nearest a point along the way out, if it's near enough (thin rings are hard to hit). */
function nearestRing(at: number, bands: readonly { from: number; to: number }[], reach: number): number | null {
  let best: number | null = null;
  let d = Infinity;
  bands.forEach((b, k) => {
    const dd = at >= b.from && at <= b.to ? 0 : Math.min(Math.abs(at - b.from), Math.abs(at - b.to));
    if (dd < d || (dd === 0 && d === 0 && Math.abs(at - (b.from + b.to) / 2) < Math.abs(at - ((bands[best ?? 0].from + bands[best ?? 0].to) / 2)))) {
      d = dd;
      best = k;
    }
  });
  return d <= reach ? best : null;
}

/** From the keyboard: one ring in the tab order; the arrow keys go in and out; Enter or Space taps it. */
function useRoving(count: number, start: number) {
  const [at, setAt] = useState(start);
  const now = Math.min(Math.max(at, 0), count - 1);
  function onKey(e: KeyboardEvent<HTMLButtonElement>, k: number) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) {
      if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
      return;
    }
    e.preventDefault();
    const to = Math.min(Math.max(k + d, 0), count - 1);
    setAt(to);
    e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-ring="${to}"]`)?.focus();
  }
  return [now, setAt, onKey] as const;
}

const PITH = 7;
const OUTER = 42;

/**
 * A young tree's slice (Gentle): its rings from the middle out, drawn to
 * their width; counted ones tinted, the next outlined after a slip, the
 * wettest marked once found. A tap anywhere near a ring is that ring.
 */
const Slice = forwardRef<
  HTMLDivElement,
  {
  rings: readonly number[];
  counted: number;
  hintAt: number | null;
  picked: number | null;
  tint: string;
  bark: string;
  label: (k: number, year: number) => string;
  done: boolean;
  onTap: (k: number) => void;
  }
>(({ rings, counted, hintAt, picked, tint, bark, label, done, onTap }, ref) => {
  const bands = useMemo(() => {
    const w = rings.map((y) => RING_WIDTH[weather(y)]);
    const scale = (OUTER - PITH) / w.reduce((a, b) => a + b, 0);
    const ends = w.reduce<number[]>((acc, x) => [...acc, (acc[acc.length - 1] ?? PITH) + x * scale], []);
    return ends.map((to, k) => ({ from: ends[k - 1] ?? PITH, to }));
  }, [rings]);
  const [focusAt, setFocusAt, onKey] = useRoving(rings.length, 0);
  const [focused, setFocused] = useState<number | null>(null);
  // The focused ring glows only once a key's been pressed in the slice — a tap, or focus put there as a step starts,
  // shows nothing (it lit a ring as if it were the answer).
  const [keys, setKeys] = useState(false);
  function onPointer(e: PointerEvent<HTMLDivElement>) {
    setKeys(false);
    if (done || e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100 - 50;
    const y = ((e.clientY - r.top) / r.height) * 100 - 50;
    const k = nearestRing(Math.hypot(x, y), bands, Math.max(1.5, (TAP_REACH_PX / r.width) * 100));
    if (k === null) return;
    e.preventDefault();
    setFocusAt(k);
    onTap(k);
  }
  return (
    <div
      ref={ref}
      role="group"
      aria-label="The slice, its rings from the middle out"
      aria-describedby="rr-do"
      onPointerDown={onPointer}
      className="relative aspect-square w-full max-w-[min(420px,calc(100dvh-290px))] touch-manipulation select-none split:w-[min(100cqw,100cqh)] split:max-w-none [@media(min-width:560px)_and_(orientation:landscape)]:max-w-[min(420px,calc(100dvh-90px))]"
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r={OUTER + 5} fill={bark} stroke="#1b0f22" strokeWidth="1.6" />
        {[...bands].reverse().map((b, j) => {
          const k = bands.length - 1 - j;
          const fill = picked === k ? '#9fd3ff' : k < counted ? (k % 2 ? '#f5c66b' : '#f9d98f') : tint;
          return <circle key={k} data-band={k} data-mid={(b.from + b.to) / 2} cx="50" cy="50" r={b.to} fill={fill} stroke={LATE} strokeWidth={0.9} />;
        })}
        <circle cx="50" cy="50" r={PITH} fill={tint} stroke={LATE} strokeWidth={0.9} />
        <circle cx="50" cy="50" r="1.6" fill={LATE} />
        {/* The ring to count next, after a slip; the one the keyboard is on. */}
        {hintAt !== null && bands[hintAt] && (
          <circle cx="50" cy="50" r={(bands[hintAt].from + bands[hintAt].to) / 2} fill="none" stroke="#1b0f22" strokeWidth="1.2" strokeDasharray="2 1.6" />
        )}
        {keys && focused !== null && bands[focused] && (
          <circle cx="50" cy="50" r={(bands[focused].from + bands[focused].to) / 2} fill="none" stroke="#22d3ee" strokeWidth={Math.max(1.4, bands[focused].to - bands[focused].from)} strokeOpacity="0.85" />
        )}
        {picked !== null && bands[picked] && (
          <text x="50" y={50 - (bands[picked].from + bands[picked].to) / 2 + 1.6} textAnchor="middle" fontSize="5" aria-hidden="true">
            💧
          </text>
        )}
        {/* How many counted, at the middle. */}
        {counted > 0 && (
          <text x="50" y="52.2" textAnchor="middle" fontSize="6" fontWeight="900" fill="#1b0f22">
            {counted}
          </text>
        )}
      </svg>
      {/* The rings as buttons for the keyboard and a reader (a pointer's tap is the slice's); the one focused glows. */}
      <div className="sr-only">
        {rings.map((y, k) => (
          <button
            key={k}
            type="button"
            data-ring={k}
            tabIndex={k === focusAt ? 0 : -1}
            aria-label={label(k, y)}
            aria-disabled={done || undefined}
            onFocus={() => {
              setFocusAt(k);
              setFocused(k);
            }}
            onBlur={() => setFocused(null)}
            onKeyDown={(e) => {
              setKeys(true);
              onKey(e, k);
            }}
            onClick={(e) => {
              if (e.detail === 0 && !done) onTap(k);
            }}
          />
        ))}
      </div>
    </div>
  );
});
Slice.displayName = 'Slice';

/**
 * A core (Medium): a pencil-thin sample from the middle (left) to the bark
 * (right), each ring a band its width; the bark's year said; the year found
 * and the dry years found marked with theirs; a fire's scar a dark notch.
 */
const Core = forwardRef<
  HTMLDivElement,
  {
  job: Extract<Job, { kind: 'date' }>;
  picked: number | null;
  found: readonly number[];
  scar?: number;
  label: (k: number, year: number) => string;
  done: boolean;
  onTap: (k: number) => void;
  }
>(({ job, picked, found, scar, label, done, onTap }, ref) => {
  const { bands, total } = useStrip(job.rings);
  const [focusAt, setFocusAt, onKey] = useRoving(job.rings.length, job.rings.length - 1);
  function onPointer(e: PointerEvent<HTMLDivElement>) {
    if (done || e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const at = ((e.clientX - r.left) / r.width) * total;
    const k = nearestRing(at, bands, (TAP_REACH_PX / r.width) * total * 0.5);
    if (k === null) return;
    e.preventDefault();
    setFocusAt(k);
    onTap(k);
  }
  const bark = job.rings[job.rings.length - 1];
  return (
    <div className="flex w-full max-w-[560px] flex-col gap-1">
      <div className="flex flex-wrap justify-between gap-x-3 text-[13px] font-bold text-[#e4e1ff]">
        <span>◀ the middle</span>
        <span>the bark: {bark} ▶</span>
      </div>
      <div
        ref={ref}
        role="group"
        aria-label="The core, from the middle to the bark"
        aria-describedby="rr-do"
        onPointerDown={onPointer}
        className="relative h-24 w-full touch-manipulation select-none overflow-hidden rounded-md border-[3px] border-[#1b0f22] [@media(max-height:500px)]:h-20"
        style={{ background: WOOD }}
      >
        {job.rings.map((y, k) => {
          const b = bands[k];
          const isFound = found.includes(k);
          const marked = picked === k || isFound;
          return (
            <button
              key={k}
              type="button"
              data-ring={k}
              tabIndex={k === focusAt ? 0 : -1}
              aria-label={label(k, y)}
              aria-disabled={done || undefined}
              onFocus={() => setFocusAt(k)}
              onKeyDown={(e) => onKey(e, k)}
              onClick={(e) => {
                if (e.detail === 0 && !done) onTap(k);
              }}
              className={cn('absolute inset-y-0 outline-none focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_3px_#22d3ee]', k === job.rings.length - 1 && 'rounded-r-sm')}
              style={{
                left: `${(b.from / total) * 100}%`,
                width: `${((b.to - b.from) / total) * 100}%`,
                background: picked === k ? '#9fd3ff' : isFound ? '#fbbf24' : weather(y) === 'dry' ? '#e3b77d' : WOOD,
                borderRight: `${weather(y) === 'dry' ? 3 : 2}px solid ${LATE}`,
              }}
            >
              {scar === y && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-[#2b1a10]" />}
              {marked && (
                <span aria-hidden="true" className="absolute left-1/2 top-0.5 -translate-x-1/2 rounded bg-[#1b0f22] px-0.5 text-[10px] font-black leading-tight text-white">
                  {y}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" className="h-2 w-full rounded-b" style={{ background: BARK }} />
    </div>
  );
});
Core.displayName = 'Core';

/**
 * Tricky's two cores: the living tree's (its years from end to end) and, under
 * it, the old beam's, slid along by the slide buttons. Lined up right, every
 * ring sits under the one that grew in the same weather. For a reader, what's
 * under the beam and the beam's own rings are said (`rr-under`).
 */
function Match({ job, offset, matched }: { job: MatchJob; offset: number; matched: boolean }) {
  const { bands, total } = useStrip(job.rings);
  const beam = useStrip(job.beam);
  const left = bands[offset]?.from ?? 0;
  const said = (ys: readonly number[]) => ys.map((y) => (weather(y) === 'wet' ? 'wide' : weather(y) === 'dry' ? 'thin' : 'middling')).join(', ');
  const above = job.rings.slice(offset, offset + job.beam.length);
  return (
    <div role="group" aria-label="Two cores: the living tree’s, and the old beam’s under it" aria-describedby="rr-under" className="flex w-full max-w-[640px] flex-col gap-1.5">
      <div className="flex justify-between text-[13px] font-bold text-[#e4e1ff]">
        <span>{job.rings[0]}</span>
        <span>The living tree</span>
        <span>{job.rings[job.rings.length - 1]} ▶</span>
      </div>
      <svg viewBox={`0 0 ${total} 30`} preserveAspectRatio="none" aria-hidden="true" className="h-16 w-full rounded-md border-[3px] border-[#1b0f22] [@media(max-height:500px)]:h-12">
        <Rings bands={bands} years={job.rings} wood={WOOD} />
      </svg>
      <div className="relative h-16 w-full [@media(max-height:500px)]:h-12">
        <svg
          viewBox={`0 0 ${beam.total} 30`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-y-0 h-full rounded-md border-[3px] border-[#1b0f22] transition-[left] duration-200 motion-reduce:transition-none"
          style={{ left: `${(left / total) * 100}%`, width: `${(beam.total / total) * 100}%` }}
        >
          <Rings bands={beam.bands} years={job.beam} wood="#c9a06c" />
        </svg>
      </div>
      <div className="flex justify-between text-[13px] font-bold text-[#e4e1ff]">
        <span>The beam{matched ? `: ${job.beam[0]}–${job.beam[job.beam.length - 1]}` : ''}</span>
      </div>
      <p id="rr-under" className="sr-only">
        The beam’s rings: {said(job.beam)}. The tree’s rings above them: {said(above)}.
      </p>
    </div>
  );
}

/** A core's rings as bands, drawn in a `total`-wide box: each ring its wood, a dark line where it ends; a dry one darker. */
function Rings({ bands, years, wood }: { bands: readonly { from: number; to: number }[]; years: readonly number[]; wood: string }) {
  return (
    <>
      {bands.map((b, k) => (
        <g key={k}>
          <rect x={b.from} y="0" width={b.to - b.from} height="30" fill={weather(years[k]) === 'dry' ? '#d8a868' : wood} />
          <rect x={b.to - (weather(years[k]) === 'dry' ? 0.6 : 0.35)} y="0" width={weather(years[k]) === 'dry' ? 0.6 : 0.35} height="30" fill={weather(years[k]) === 'dry' ? '#4a2a14' : LATE} />
        </g>
      ))}
    </>
  );
}

/** A core's rings laid end to end: where each starts and ends, in ring-width units. */
function useStrip(rings: readonly number[]) {
  return useMemo(() => {
    const ends = rings.reduce<number[]>((acc, y) => [...acc, (acc[acc.length - 1] ?? 0) + RING_WIDTH[weather(y)]], []);
    return { bands: ends.map((to, k) => ({ from: ends[k - 1] ?? 0, to })), total: ends[ends.length - 1] ?? 0 };
  }, [rings]);
}

/** Eldergrove, close up (§2.2): Old Ringwood, Ember among the roots, leaves falling when a tree's read. */
function Grove({ cheer }: { cheer: boolean }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const ringwood = NPC_DEFS['elder-ringwood'];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[16%] bg-[linear-gradient(#20402c_0_70%,#3b2a1c_70%_100%)] px-3 pb-[3%]">
      <span className={cn('absolute left-1/2 top-[12%] -translate-x-1/2 text-3xl transition-opacity', cheer ? 'opacity-100' : 'opacity-0')}>🍂 🍃 🍂</span>
      <span>
        <EmberSprite anim={cheer ? 'cheer' : undefined} scale={3} />
      </span>
      <span className="flex items-end">{ringwood && <CharacterPortrait spriteId={npcSpriteId(ringwood, flags)} emoji={npcEmoji(ringwood, flags)} scale={3} className="text-5xl" />}</span>
    </div>
  );
}

/** Ringwood's grove book: a page per tree read, its slice drawn; tapped, read out — by him, and under the book. */
function GroveBook({ known, read, onRead }: { known: (id: TreeId) => boolean; read: TreeId | null; onRead: (id: TreeId) => void }) {
  const count = TREES.filter((t) => known(t.id)).length;
  const reading = read ? TREE_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="rr-book" className="mt-auto flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="rr-book" className={cn(pixelHeadClass, 'text-2xl leading-none')}>
          Grove book
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {TREES.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {TREES.map((t) => (
          <li key={t.id}>
            {known(t.id) ? (
              <button
                type="button"
                onClick={() => onRead(t.id)}
                aria-pressed={read === t.id}
                aria-label={`${t.name}. Read the page`}
                className={cn('flex min-h-[52px] w-full items-center gap-2 rounded border-[3px] bg-[#fff6dc] px-1.5 py-1 text-left hover:bg-white', read === t.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <SliceCard id={t.id} size={34} />
                <span aria-hidden="true" className="text-[13px] font-bold leading-tight text-[#1b0f22]">
                  {t.name}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A tree not read yet" className="flex min-h-[52px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                🌳 ?
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* The page read (Ringwood's bubble says it too, and is the live region). */}
      {reading && (
        <div ref={panel} className="rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <b>{reading.name}</b> — {reading.note}
        </div>
      )}
    </section>
  );
}
