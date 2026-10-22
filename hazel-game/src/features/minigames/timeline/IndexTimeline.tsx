import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { JOBS_PER_ROUND, SETS, SET_BY_ID, check, checkWords, jobFor, jobWords, learnedLine, roundQueue, yearWords, type Event, type SetId } from '../../../lib/minigames/timeline';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useSettled } from '../useSettled';
import { SetCard } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Putting the cards in order; the set's page. */
type Step = 'place' | 'done';

/** Index after a set's in order, in turn. */
const RIGHT_LINES = ['Filed! In order! Ah… Bh… CHOO!', 'Perfect — every card in its place.', 'You’d make a fine archivist!'];

/** The steps, along the footer. */
const STEP_CHIPS = ['Tap the oldest card', 'Then the next, in order', 'Check the order'];

/**
 * 📜 Index's Timeline (docs/DESIGN-MINIGAMES.md §5.8), in the Sunken Archive's
 * card catalog: soggy cards wash in, and the kid puts them on the timeline in
 * the order they happened — each card tapped goes in the next empty place,
 * oldest first (one tapped on the timeline comes back) — and checks; the ones
 * in the wrong place float back, with a hint of why ("A bulb needs electricity
 * in homes — gas lamps lit streets first"), the right ones stay. Every tap is
 * in the tray: on a phone, no scrolling to and fro between it and the line. Gentle has 3–4 cards far
 * apart, Medium five, Tricky 6–7 with their years (BCE counting down). Three
 * sets a round, each a page of the timeline book. No timer. Rules:
 * `lib/minigames/timeline.ts`.
 */
export default function IndexTimeline({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which sets come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue((id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const set = SET_BY_ID[job.set];
  const n = job.events.length;
  const byId = useMemo(() => Object.fromEntries(job.events.map((ev) => [ev.id, ev])) as Record<string, Event>, [job]);
  const [step, setStep] = useState<Step>('place');
  // Each place's card (by id), and which are checked right (they stay).
  const [placed, setPlaced] = useState<(string | null)[]>(() => Array(n).fill(null));
  const [locked, setLocked] = useState<boolean[]>(() => Array(n).fill(false));
  // The cards that just floated back (a splash as they land).
  const [back, setBack] = useState<readonly string[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  const [read, setRead] = useState<SetId | null>(null);
  const known = (id: SetId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}`);
  const inTray = (id: string) => !placed.includes(id);
  const left = job.dealt.filter(inTray).length;
  const showYears = job.years || step === 'done';

  /** A card in the tray tapped: it goes in the next empty place, oldest first. */
  function place(id: string) {
    if (step !== 'place' || !settled()) return;
    setRead(null);
    const k = placed.indexOf(null);
    if (k < 0) return;
    const next = [...placed];
    next[k] = id;
    setPlaced(next);
    setBack([]);
    setSaid(null);
    sfx('select');
  }

  /** A place on the timeline tapped: its card comes back to the tray (not one checked right); an empty one says how. */
  function takeBack(k: number) {
    if (step !== 'place' || !settled()) return;
    setRead(null);
    const id = placed[k];
    if (!id) {
      setSaid('Tap a card in the tray — it goes in the next empty place.');
      return;
    }
    if (locked[k]) {
      setSaid(`${byId[id].name} is in its right place — it stays.`);
      return;
    }
    setPlaced(placed.map((x, j) => (j === k ? null : x)));
    setSaid(`${byId[id].name} is back in the tray.`);
    sfx('select');
  }

  function checkOrder() {
    if (step !== 'place' || !settled()) return;
    setRead(null);
    if (left) {
      setSaid(`Every card on the timeline first — ${left === 1 ? 'one is' : `${left} are`} still in the tray.`);
      return;
    }
    const right = check(job, placed);
    setSaid(checkWords(job, right, placed));
    if (right.every(Boolean)) {
      sfx('chest');
      setLocked(right);
      setNewPage(onPage(job.set, set.name));
      setLessons((l) => [...l, learnedLine(job)]);
      setRights((r) => r + 1);
      setStep('done');
      return;
    }
    sfx('wrong');
    setLocked(right);
    setBack(placed.filter((id, k): id is string => !!id && !right[k]));
    setPlaced(placed.map((id, k) => (right[k] ? id : null)));
  }

  function next() {
    if (step !== 'done' || !settled()) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'Three timelines filed!', learned: lessons[lessons.length - 1] ?? '' });
      return;
    }
    const j = jobFor(band, round, done + 1, queue);
    setDone((d) => d + 1);
    setStep('place');
    setPlaced(Array(j.events.length).fill(null));
    setLocked(Array(j.events.length).fill(false));
    setBack([]);
    setSaid(null);
    setNewPage(false);
  }

  // Focus where each step starts: the tray's first card; what was filed.
  const tray = useRef<HTMLDivElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [step, done]);

  // As each step starts, the page scrolls back to the board's top on a phone (a set filed: at least that, with Next);
  // where the page doesn't scroll, the step's gold button comes into view.
  const goRef = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
    const go = goRef.current;
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

  const cheerLine = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Another drawer?' : 'The catalog thanks you!'}`;
  let line: string;
  if (read) line = `${SET_BY_ID[read].name}: ${SET_BY_ID[read].note}`;
  else if (step === 'done') line = cheerLine;
  else if (said) line = said;
  else if (left === n) line = `Oh dear, the ${set.name.toLowerCase()} cards washed out of their drawer! Which came first? Tap the oldest.`;
  else line = left ? 'And next? Tap the card that came after.' : 'All on the line — check the order!';

  const chipAt = step === 'done' ? 3 : left === 0 ? 2 : left < n ? 1 : 0;

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden">
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] split:[@media(orientation:portrait)]:grid-rows-[minmax(0,1fr)] split:[@media(max-height:500px)]:grid-cols-[minmax(440px,1fr)_minmax(0,260px)]">
        {/* Left out up to 700 px high, and on a split screen held upright (an iPad): Tricky's seven places, the tray and
            the card need the room (bench: the card was cut). */}
        <div aria-hidden="true" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:700px)]:hidden split:[@media(orientation:portrait)]:hidden">
          <Archive cheer={step === 'done'} />
        </div>

        {/* The timeline and the tray, and the step with its buttons beside them on a screen held sideways from 560 px
            (under them on one held upright). */}
        <section
          ref={board}
          aria-labelledby="it-step"
          className="flex flex-col gap-3 bg-[#173a47] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:overflow-y-auto split:border-t-4 split:border-[#1b0f22] split:p-4 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-row [@media(max-height:500px)]:gap-1.5 split:[@media(max-height:700px)]:row-start-1 split:[@media(max-height:700px)]:border-t-0 split:[@media(orientation:portrait)]:row-start-1 split:[@media(orientation:portrait)]:border-t-0 split:[@media(max-height:500px)]:p-2"
        >
          {/* On a phone held upright, the cards and the timeline side by side, the cards first: a tap and where it lands both in
              sight (bench: Tricky's seven places pushed the cards under the fold, each landing out of sight). */}
          <div className="flex min-w-0 flex-col gap-3 [@media(max-width:559px)]:grid [@media(max-width:559px)]:grid-cols-2 [@media(max-width:559px)]:items-start [@media(max-width:559px)]:gap-2 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-1 [@media(max-height:500px)]:gap-1.5">
            <Timeline events={job.events} placed={placed} locked={locked} byId={byId} showYears={showYears} done={step === 'done'} onTap={takeBack} />
            {step === 'place' && (
              <div ref={tray} role="group" aria-label={`The washed-up cards: ${left} to place`} className="flex flex-col gap-1.5 [@media(max-width:559px)]:order-first">
                <p aria-hidden="true" className="text-[13px] font-bold uppercase tracking-wide text-[#bfe3ec] [@media(max-height:500px)]:hidden">
                  Washed-up cards
                </p>
                {/* Each card keeps its spot in the tray, so placing one never moves the others under a finger. On a short screen
                    held sideways, all in a row (under the timeline's row): the step's bar fits under them. */}
                <div className="grid grid-cols-2 gap-1.5 [@media(max-width:559px)]:grid-cols-1 [@media(min-width:560px)]:grid-cols-3 [@media(min-width:560px)_and_(max-height:500px)]:grid-flow-col [@media(min-width:560px)_and_(max-height:500px)]:auto-cols-fr [@media(min-width:560px)_and_(max-height:500px)]:grid-cols-none [@media(min-width:900px)_and_(min-height:501px)]:grid-cols-4">
                  {job.dealt.map((id) =>
                    inTray(id) ? (
                      <CardButton key={id} ev={byId[id]} showYear={job.years} splash={back.includes(id) && !still} onTap={() => place(id)} />
                    ) : (
                      <span key={id} aria-hidden="true" className="min-h-[60px] rounded-md border-2 border-dashed border-[#3f6f7d] [@media(max-height:500px)]:min-h-[52px] [@media(max-width:559px)]:min-h-11" />
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
          <div
            className={cn(
              windowClass,
              // On a short screen, a bar kept in sight at the bottom, should the board's cards run past it — and on a phone held
              // upright, while placing, the same (bench: Check was under the fold).
              'flex flex-col gap-2.5 p-3 [&>*]:flex-none split:overflow-y-auto [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:w-[min(300px,40%)] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-none [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:sticky [@media(max-height:500px)]:bottom-0 [@media(max-height:500px)]:z-10 [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible [@media(max-height:500px)]:p-2',
              step === 'place' &&
                '[@media(max-width:559px)_and_(max-height:700px)]:sticky [@media(max-width:559px)_and_(max-height:700px)]:bottom-0 [@media(max-width:559px)_and_(max-height:700px)]:z-10 [@media(max-width:559px)_and_(max-height:700px)]:p-2',
            )}
          >
            <p className={cn('text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden', step === 'place' && '[@media(max-width:559px)_and_(max-height:700px)]:hidden')}>
              Drawer {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                <h2 id="it-step" ref={doneHead} tabIndex={-1} aria-describedby="it-result" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white [@media(max-height:500px)]:text-[20px]', focusRing)}>
                  {set.name}, in order!
                </h2>
                {/* Index's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                {/* On a short screen, a bar under the timeline: what was learned, Next beside it (review: beside the timeline, the
                    card was too tall for the screen). */}
                <div className="flex flex-col gap-2.5 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-end [@media(max-height:500px)]:gap-2">
                  <p id="it-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                    {lessons[lessons.length - 1]}
                    {newPage && ` ${set.name} is in the timeline book!`}
                  </p>
                  <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:text-base')}>
                    {done + 1 < JOBS_PER_ROUND ? 'Next drawer' : 'All filed!'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* On a short screen the step's a bar under the board: its heading and how to play left to Index and the bar's words. */}
                <h2 id="it-step" tabIndex={-1} aria-describedby="it-job" className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none [@media(max-height:500px)]:sr-only [@media(max-width:559px)_and_(max-height:700px)]:sr-only', focusRing)}>
                  Put them in order
                </h2>
                <p id="it-do" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:hidden [@media(max-width:559px)_and_(max-height:700px)]:hidden">
                  Tap the cards in the order they happened, oldest first — each goes in the next place. Tap one on the line to take it
                  back. {left ? `${left} still to place.` : 'All placed — check them!'}
                </p>
                {/* What Index said of the last check, by the timeline too: on a phone her bubble's below the fold. Room for
                    the longest, so nothing under it moves; not read out — her bubble is. */}
                <div className="flex flex-col gap-2.5 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-center [@media(max-height:500px)]:gap-2 [@media(max-width:559px)_and_(max-height:700px)]:flex-row [@media(max-width:559px)_and_(max-height:700px)]:items-center [@media(max-width:559px)_and_(max-height:700px)]:gap-2">
                  <p className="flex min-h-[5.25rem] items-center rounded-md bg-[#24215a] px-2.5 text-[15px] font-bold leading-snug [@media(max-height:500px)]:min-h-[2.75rem] [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px] [@media(max-width:559px)_and_(max-height:700px)]:min-h-[3.25rem] [@media(max-width:559px)_and_(max-height:700px)]:flex-1 [@media(max-width:559px)_and_(max-height:700px)]:py-1 [@media(max-width:559px)_and_(max-height:700px)]:text-[13px]">
                    {/* At most three lines on a short screen (Index's bubble beside the board says it all), so the bar stays under the
                        tray — five on a small phone held upright. */}
                    {said ? (
                      <span className="[@media(max-height:500px)]:line-clamp-3 [@media(max-width:559px)_and_(max-height:700px)]:line-clamp-5">{said}</span>
                    ) : (
                      <span className="hidden font-normal text-[#e4e1ff] [@media(max-height:500px)]:inline [@media(max-width:559px)_and_(max-height:700px)]:inline">
                        Tap the cards oldest first — each goes in the next place. {left ? `${left} still to place.` : 'All placed — check them!'}
                      </span>
                    )}
                  </p>
                  {/* Short, on a short screen: the words beside it get the room (said in full all the same). */}
                  <button
                    ref={goRef}
                    type="button"
                    onClick={checkOrder}
                    aria-label="Check the order"
                    aria-disabled={left > 0 || undefined}
                    className={cn(
                      goldClass,
                      'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-[15px] [@media(max-width:559px)_and_(max-height:700px)]:flex-none [@media(max-width:559px)_and_(max-height:700px)]:px-3 [@media(max-width:559px)_and_(max-height:700px)]:text-[15px]',
                    )}
                  >
                    <span className="[@media(max-height:500px)]:hidden [@media(max-width:559px)_and_(max-height:700px)]:hidden">Check the order</span>
                    <span aria-hidden="true" className="hidden [@media(max-height:500px)]:inline [@media(max-width:559px)_and_(max-height:700px)]:inline">
                      Check ✓
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <aside
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] split:col-start-2 split:row-span-2 split:row-start-1 split:overflow-y-auto split:border-l-4 split:p-4"
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={`${set.name.toUpperCase()} DRAWER`} ready={step === 'done'} icon={<SetCard id={job.set} size={48} />} id="it-job">
              {jobWords(job)}
            </Ticket>
          </div>
          <TimelineBook known={known} read={read} onRead={setRead} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 split:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={STEP_CHIPS} current={chipAt} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

/** A card: its picture and name (its year on Tricky) — soggy parchment; picked, lifted in gold; just floated back, a splash. */
function CardFace({ ev, showYear }: { ev: Event; showYear: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="text-2xl leading-none [@media(max-height:500px)]:text-lg [@media(max-height:500px)]:leading-none">
        {ev.emoji}
      </span>
      {/* Its name and year together: under the picture on a card, beside it in a row. */}
      <span className="flex min-w-0 flex-col items-center gap-0.5 [@media(max-width:559px)]:items-start">
        <span className="text-[13px] font-bold leading-tight [@media(max-height:500px)]:text-[11px] [@media(max-height:500px)]:leading-tight">{ev.name}</span>
        {showYear && <span className="rounded bg-[#1b0f22] px-1 text-[11px] font-black leading-tight text-amber-200 [@media(max-height:500px)]:text-[10px] [@media(max-height:500px)]:leading-tight">{yearWords(ev)}</span>}
      </span>
    </>
  );
}

function CardButton({ ev, showYear, splash, onTap }: { ev: Event; showYear: boolean; splash: boolean; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${ev.name}${showYear ? `, ${yearWords(ev)}` : ''}`}
      className={cn(
        // On a phone held upright, a slim row like the timeline's places beside it.
        'flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-md border-[3px] border-[#1b0f22] bg-[#f4e8c8] px-1 py-1 text-center text-[#1b0f22] shadow-[2px_2px_0_#1b0f22] hover:bg-[#fff4d6] [@media(max-height:500px)]:min-h-[52px] [@media(max-height:500px)]:py-0.5 [@media(max-width:559px)]:min-h-11 [@media(max-width:559px)]:flex-row [@media(max-width:559px)]:justify-start [@media(max-width:559px)]:gap-1.5 [@media(max-width:559px)]:px-1.5 [@media(max-width:559px)]:text-left',
        splash && 'cg-shake',
        focusRing,
      )}
    >
      <CardFace ev={ev} showYear={showYear} />
    </button>
  );
}

/**
 * The timeline: a place per card, oldest at the start; a card on it tapped
 * comes back to the tray; one checked right stays, ticked. Across on a screen
 * held sideways, down on one held upright — there each place a slim row, so
 * the line and the tray fit together.
 */
function Timeline({
  events,
  placed,
  locked,
  byId,
  showYears,
  done,
  onTap,
}: {
  events: readonly Event[];
  placed: readonly (string | null)[];
  locked: readonly boolean[];
  byId: Record<string, Event>;
  showYears: boolean;
  done: boolean;
  onTap: (k: number) => void;
}) {
  const n = events.length;
  return (
    <div className="flex flex-col gap-1">
      {/* Its ends, as it runs: across on a screen held sideways, down on one held upright. */}
      <div aria-hidden="true" className="flex items-center justify-between text-[13px] font-bold text-[#bfe3ec]">
        <span className="hidden [@media(min-width:560px)_and_(orientation:landscape)]:inline">◀ Oldest</span>
        <span className="hidden [@media(min-width:560px)_and_(orientation:landscape)]:inline">Newest ▶</span>
        <span className="[@media(min-width:560px)_and_(orientation:landscape)]:hidden">Oldest at the top ▼</span>
      </div>
      <ol
        aria-label="The timeline, oldest first"
        aria-describedby="it-do"
        className="relative grid gap-1.5 [@media(min-width:560px)_and_(orientation:landscape)]:grid-flow-col [@media(min-width:560px)_and_(orientation:landscape)]:auto-cols-fr"
      >
        {/* The line through time, behind the places. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-1/2 hidden h-1 -translate-y-1/2 rounded bg-amber-300/70 [@media(min-width:560px)_and_(orientation:landscape)]:block" />
        {events.map((_, k) => {
          const id = placed[k];
          const ev = id ? byId[id] : null;
          const right = locked[k];
          return (
            <li key={k} className="relative">
              <button
                type="button"
                onClick={() => onTap(k)}
                aria-disabled={done || undefined}
                aria-label={`Place ${k + 1} of ${n}${k === 0 ? ', the oldest' : k === n - 1 ? ', the newest' : ''}${ev ? `: ${ev.name}${showYears ? `, ${yearWords(ev)}` : ''}${right ? ', right' : ''}` : ', empty'}`}
                className={cn(
                  // Held upright, a slim row (its number, picture, name, year); sideways, a card.
                  'relative flex min-h-11 w-full flex-row items-center gap-2 rounded-md border-[3px] px-2 py-1 text-left [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:min-h-[60px] [@media(min-width:560px)_and_(orientation:landscape)]:flex-col [@media(min-width:560px)_and_(max-height:500px)]:min-h-[52px] [@media(min-width:560px)_and_(max-height:500px)]:py-0.5 [@media(min-width:560px)_and_(orientation:landscape)]:justify-center [@media(min-width:560px)_and_(orientation:landscape)]:gap-0.5 [@media(min-width:560px)_and_(orientation:landscape)]:px-1 [@media(min-width:560px)_and_(orientation:landscape)]:text-center',
                  ev ? 'bg-[#f4e8c8] text-[#1b0f22] shadow-[2px_2px_0_#1b0f22]' : 'border-dashed border-[#7fb3c2] bg-[#1f4a5a]',
                  ev && (right ? 'border-emerald-600' : 'border-[#1b0f22]'),
                  focusRing,
                )}
              >
                <span aria-hidden="true" className={cn('text-[15px] font-black', ev ? 'text-[#1b0f22] [@media(min-width:560px)_and_(orientation:landscape)]:hidden' : 'text-[#bfe3ec]')}>
                  {k + 1}
                </span>
                {ev && <CardFace ev={ev} showYear={showYears} />}
                {right && (
                  <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1b0f22] bg-emerald-500 text-[13px] font-black text-white">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The Sunken Archive's catalog, close up (§2.2): Index among the drawers, Ember peering in, cards drifting. */
function Archive({ cheer }: { cheer: boolean }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const index = NPC_DEFS['archive-index'];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[16%] bg-[linear-gradient(#1d4b5c_0_70%,#3a2b22_70%_100%)] px-3 pb-[3%]">
      <span className={cn('absolute left-1/2 top-[12%] -translate-x-1/2 text-3xl transition-opacity', cheer ? 'opacity-100' : 'opacity-40')}>🗂️ 📇 🗂️</span>
      <span>
        <EmberSprite anim={cheer ? 'cheer' : undefined} scale={3} />
      </span>
      <span className="flex items-end">{index && <CharacterPortrait spriteId={npcSpriteId(index, flags)} emoji={npcEmoji(index, flags)} scale={3} className="text-5xl" />}</span>
    </div>
  );
}

/** Index's timeline book: a page per set filed; tapped, read out — by Index, and under the book. */
function TimelineBook({ known, read, onRead }: { known: (id: SetId) => boolean; read: SetId | null; onRead: (id: SetId) => void }) {
  const count = SETS.filter((s) => known(s.id)).length;
  const reading = read ? SET_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="it-book" className="mt-auto flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="it-book" className={cn(pixelHeadClass, 'text-2xl leading-none')}>
          Timeline book
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {SETS.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {SETS.map((s) => (
          <li key={s.id}>
            {known(s.id) ? (
              <button
                type="button"
                onClick={() => onRead(s.id)}
                aria-pressed={read === s.id}
                aria-label={`${s.name}. Read the page`}
                className={cn('flex min-h-[52px] w-full items-center gap-2 rounded border-[3px] bg-[#fff6dc] px-1.5 py-1 text-left hover:bg-white', read === s.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <SetCard id={s.id} size={34} />
                <span aria-hidden="true" className="text-[13px] font-bold leading-tight text-[#1b0f22]">
                  {s.name}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A drawer not filed yet" className="flex min-h-[52px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                📇 ?
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* The page read (Index's bubble says it too, and is the live region). */}
      {reading && (
        <div ref={panel} className="rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <b>{reading.name}</b> — {reading.note}
        </div>
      )}
    </section>
  );
}
