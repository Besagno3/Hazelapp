import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  BCE_WORDS,
  JOBS_PER_ROUND,
  SETS,
  SET_BY_ID,
  cardDate,
  centuryTip,
  check,
  checkWords,
  clueFor,
  dateOf,
  jobFor,
  jobWords,
  learnedLine,
  roundQueue,
  spanAsk,
  spanChoices,
  spanRight,
  spanWords,
  type Job,
  type SetId,
  type TimelineEvent,
} from '../../../lib/minigames/timeline';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { noRepeat, useFocusMoved } from '../keys';
import { useSettled } from '../useSettled';
import { SetCard } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Putting the cards in order; Expert's years from one card to another; the set's page. */
type Step = 'place' | 'span' | 'done';

/** Index after a set's in order, in turn; on Expert, plainly (§8.3). */
const RIGHT_LINES = ['Filed! In order! Ah… Bh… CHOO!', 'Perfect — every card in its place.', 'You’d make a fine archivist!'];
const EXPERT_RIGHT_LINES = ['Filed.', 'That’s the drawer.', 'Right.'];

/** How to play, in the step's card — or, held sideways, under the cards, where there's room (the card was squeezed). */
const HOW_TO = 'Tap the cards in the order they happened, oldest first — each goes in the next place. Tap one on the line to take it back.';

/** The steps, along the footer. */
const STEP_CHIPS = ['Tap the oldest card', 'Then the next, in order', 'Check the order'];
const EXPERT_CHIPS = ['Put them in order', 'Count the years', 'What led to what'];

/** BCE and CE, for Expert's years before a pick (the title card says how to count them). */
const SPAN_TIP = 'BCE years count back to year 1; CE years count on from it.';

const many = (n: number) => n.toLocaleString('en-GB');

/**
 * 📜 Index's Timeline (docs/DESIGN-MINIGAMES.md §5.8), in the Sunken Archive's
 * card catalog: soggy cards wash in, and the kid puts them on the timeline in
 * the order they happened — each card tapped goes in the next empty place,
 * oldest first (one tapped on the timeline comes back) — and checks; the
 * longest run in order stays, each card in its own place, the rest float back,
 * with a clue for the first empty place ("After gas street lamps came the
 * electric light bulb — …"). Every tap is among the
 * washed-up cards: on a phone, no scrolling to and fro between them and the
 * line. Gentle has 3–4 cards far apart, Medium five, Tricky 6–7 with their
 * years (BCE counting down). Expert (§8.5): all seven, each dated by its
 * century where that's enough to place it; in order, their years come out and
 * Index asks how many years lie from one to another, across BCE and CE; the
 * page says what led to what. Three sets a round, each a page of the timeline
 * book. No timer. Rules: `lib/minigames/timeline.ts`.
 */
export default function IndexTimeline({ def, band, round, onPage, onFinish }: PlayProps) {
  const expert = band === 'expert';
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which sets come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue((id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const set = SET_BY_ID[job.set];
  const n = job.events.length;
  const byId = useMemo(() => Object.fromEntries(job.events.map((ev) => [ev.id, ev])) as Record<string, TimelineEvent>, [job]);
  // Each card's when, worked out once a drawer (code review round 2: every place holds every card's face): on the card
  // as it's placed (Expert's: its century where that's enough), and once the drawer's in order (its year).
  const cards = useMemo(() => Object.fromEntries(job.events.map((ev) => [ev.id, cardDate(job, ev)])) as Record<string, string>, [job]);
  const years = useMemo(() => Object.fromEntries(job.events.map((ev) => [ev.id, dateOf(job, ev)])) as Record<string, string>, [job]);
  const [step, setStep] = useState<Step>('place');
  // Each place's card (by id), and which are checked right (they stay).
  const [placed, setPlaced] = useState<(string | null)[]>(() => Array(n).fill(null));
  const [locked, setLocked] = useState<boolean[]>(() => Array(n).fill(false));
  // The cards that just floated back (a splash as they land).
  const [back, setBack] = useState<readonly string[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  // The last check's words, said by Index; its clue, kept by the step's box till the next check (UX review round 1: the
  // next tap wiped it) — without how many stayed, which the ticks show (UX review round 2: the clue was cut off).
  const [checked, setChecked] = useState<string | null>(null);
  const [clue, setClue] = useState<string | null>(null);
  // Each time Index says something: the same words again are a change her bubble reads out (code review round 2).
  const [beat, setBeat] = useState(0);
  // Where the last card went, said by Index (a reader hears each one land: UX review round 1).
  const [landed, setLanded] = useState<string | null>(null);
  // Checks this drawer: a wrong one starts the wait again (code review round 1: a double tap on Check wiped its clue).
  const [checks, setChecks] = useState(0);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  // Expert: a wrong check or a wrong count this drawer; drawers with neither (the seal: all three); the first missed one's lesson.
  const [missed, setMissed] = useState(false);
  const [spotOn, setSpotOn] = useState(0);
  const missedLesson = useRef<string | null>(null);
  const [read, setRead] = useState<SetId | null>(null);
  const known = (id: SetId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}:${checks}`);
  // A tap waits; a key acts at once (its second press is on what focus moved to, if anything: `moved`).
  const ready = (e: { detail: number }) => e.detail === 0 || settled();
  const inTray = (id: string) => !placed.includes(id);
  const left = job.dealt.filter(inTray).length;
  const showYears = job.years || step === 'done';

  // Where focus goes once a card's placed, or cards float back — its button's gone (code review round 1: focus fell to
  // the page): the next card left, or Check — where a key's second press, straight away, does nothing.
  const focusTo = useRef<string | null>(null);
  const moved = useFocusMoved();
  const card = (id: string) => document.querySelector<HTMLButtonElement>(`[data-card="${id}"]`);
  function say(words: string) {
    setSaid(words);
    setBeat((b) => b + 1);
  }

  /** A washed-up card tapped: it goes in the next empty place, oldest first. */
  function place(id: string, e: MouseEvent) {
    if (step !== 'place' || !settled() || moved.tooSoon(id, e)) return;
    setRead(null);
    const k = placed.indexOf(null);
    if (k < 0) return;
    const next = [...placed];
    next[k] = id;
    setPlaced(next);
    setBack([]);
    setSaid(null);
    setLanded(`${byId[id].name}: place ${k + 1} of ${n}.`);
    // From the keyboard (or a reader), on to the next card in the tray — or Check, once they're all placed.
    if (document.activeElement === card(id)) {
      const rest = job.dealt.filter((x) => x !== id && !next.includes(x));
      const from = job.dealt.indexOf(id);
      focusTo.current = [...rest.filter((x) => job.dealt.indexOf(x) > from), ...rest][0] ?? 'check';
    }
    sfx('select');
  }

  /** A place on the timeline tapped: its card comes back to the tray (not one checked right); an empty one says how. */
  function takeBack(k: number) {
    if (step !== 'place' || !settled()) return;
    setRead(null);
    const id = placed[k];
    if (!id) {
      say('Tap a washed-up card — it goes in the next empty place.');
      return;
    }
    if (locked[k]) {
      say(`${byId[id].name} is in its right place — it stays.`);
      return;
    }
    setPlaced(placed.map((x, j) => (j === k ? null : x)));
    say(`${byId[id].name} is back with the washed-up cards.`);
    sfx('select');
  }

  function checkOrder(e: MouseEvent) {
    if (step !== 'place' || !settled() || moved.tooSoon('check', e)) return;
    setRead(null);
    if (left) {
      say(`Every card on the timeline first — ${left} still to place.`);
      return;
    }
    // The longest run in order stays, each card in its own place (UX review round 2: one slip sent them all back).
    const stay = check(job, placed);
    const words = checkWords(job, stay);
    setSaid(null);
    setChecked(words);
    setBeat((b) => b + 1);
    setLanded(null);
    if (stay.every(Boolean)) {
      setLocked(stay);
      // Expert: the years come out, and Index asks how many lie between two of them.
      if (job.expert) {
        sfx('correct');
        setStep('span');
        return;
      }
      file(missed);
      return;
    }
    setMissed(true);
    sfx('wrong');
    setClue(clueFor(job, stay));
    setChecks((c) => c + 1);
    const floated = placed.filter((id): id is string => !!id && !stay[job.events.indexOf(byId[id])]);
    setLocked(stay);
    setBack(floated);
    setPlaced(job.events.map((ev, k) => (stay[k] ? ev.id : null)));
    // From the keyboard, on to the first card back.
    if (document.activeElement === goRef.current) focusTo.current = job.dealt.find((x) => floated.includes(x)) ?? null;
  }

  /** The drawer filed: its page, and what it taught (`slipped`: a miss on the way, on Expert). */
  function file(slipped: boolean) {
    const lesson = learnedLine(job);
    sfx('chest');
    setNewPage(onPage(job.set, set.name));
    setLessons((l) => [...l, lesson]);
    setRights((r) => r + 1);
    if (expert && !slipped) setSpotOn((n) => n + 1);
    if (expert && slipped) missedLesson.current ??= lesson;
    setStep('done');
  }

  /** Expert: how many years from one card to another, picked; a wrong one says what's wrong with it, and stays to pick again. */
  function pickSpan(n: number, e: { detail: number }) {
    if (step !== 'span' || !job.expert || !ready(e)) return;
    setRead(null);
    const words = spanWords(job, n);
    if (n !== spanRight(job)) {
      setMissed(true);
      say(words);
      sfx('wrong');
      return;
    }
    setSaid(null);
    setChecked(words);
    setBeat((b) => b + 1);
    file(missed);
  }

  function next(e: { detail: number }) {
    if (step !== 'done' || !ready(e)) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'Three timelines filed!', learned: (expert && missedLesson.current) || (lessons[lessons.length - 1] ?? ''), spotOn: expert ? { right: spotOn, of: JOBS_PER_ROUND } : undefined });
      return;
    }
    const j = jobFor(band, round, done + 1, queue);
    setDone((d) => d + 1);
    setStep('place');
    setPlaced(Array(j.events.length).fill(null));
    setLocked(Array(j.events.length).fill(false));
    setBack([]);
    setSaid(null);
    setChecked(null);
    setClue(null);
    setLanded(null);
    setChecks(0);
    setNewPage(false);
    setMissed(false);
  }

  // Focus where each step starts: the washed-up cards, so a Tab goes to the first (no ring — the first card lit up as if
  // it were the answer: UX review round 1; the step's heading came after them, so a Tab went to Check: UX and code review
  // round 2); what was filed.
  const tray = useRef<HTMLDivElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  const spanHead = useRef<HTMLHeadingElement>(null);
  const spanSaid = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (step === 'span' && said) spanSaid.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [step, said, beat, still]);
  useEffect(() => {
    if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else if (step === 'span') spanHead.current?.focus({ preventScroll: true });
    else tray.current?.focus({ preventScroll: true });
  }, [step, done]);
  useEffect(() => {
    const to = focusTo.current;
    focusTo.current = null;
    const el = to === 'check' ? goRef.current : to ? card(to) : null;
    if (!to || !el) return;
    el.focus({ preventScroll: true });
    moved.mark(to);
  }, [placed]); // eslint-disable-line react-hooks/exhaustive-deps

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
      let to = step === 'place' ? Math.min(top, show) : Math.max(top, show);
      // The washed-up cards clear a bar kept at the bottom, the first's top in sight, the board's foot no higher than the
      // screen's (UX review round 2: their years were under it).
      const t = tray.current;
      const first = t?.querySelector('[data-card]');
      const bar = go?.closest<HTMLElement>('[data-bar]');
      if (t && first && bar && getComputedStyle(bar).position === 'sticky') {
        const r = t.getBoundingClientRect();
        to = Math.max(to, Math.min(first.getBoundingClientRect().top - base, r.bottom - base + bar.offsetHeight + 8 - s.clientHeight, b.getBoundingClientRect().bottom - base - s.clientHeight));
      }
      s.scrollTo?.({ top: Math.max(0, to), behavior });
    } else go?.scrollIntoView?.({ block: 'nearest', behavior });
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const cheerLine = expert
    ? `${missed ? 'Filed, with a miss on the way.' : EXPERT_RIGHT_LINES[(rights - 1 + EXPERT_RIGHT_LINES.length) % EXPERT_RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Next drawer.' : 'That’s the catalog.'}`
    : `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Another drawer?' : 'The catalog thanks you!'}`;
  // The next empty place, and the card before it: what to tap next names it (UX review round 2: "the card that came after"
  // — after what, with a gap after a card that stayed?).
  const nextAt = step === 'place' ? placed.indexOf(null) : -1;
  const before = nextAt > 0 ? byId[placed[nextAt - 1] ?? ''] : undefined;
  const ask = !left ? `All on the line — check the order${expert ? '.' : '!'}` : before ? `What came after ${before.said}? Tap that card.` : 'Which came first? Tap the oldest card.';
  let line: string;
  if (read) line = `${SET_BY_ID[read].name}: ${SET_BY_ID[read].note}`;
  else if (step === 'done') line = checked ? `${checked} ${cheerLine}` : cheerLine;
  else if (said) line = said;
  // Expert, in order: the years are out, and the question.
  else if (step === 'span') line = `${checked ?? ''} ${spanAsk(job)}`.trim();
  else if (landed) line = `${landed} ${ask}`;
  else if (checked) line = checked;
  // Tricky's years said as it starts, where a kid sees them (UX review round 1: only on the ticket); Expert's centuries.
  else if (left === n && expert) line = `The ${set.name.toLowerCase()} cards are out of their drawer. ${ask} Some give a century, not a year. ${centuryTip(job)}`;
  else if (left === n) line = `Oh dear, the ${set.name.toLowerCase()} cards washed out of their drawer! ${ask}${job.years ? ` ${BCE_WORDS}` : ''}`;
  else line = ask;
  // A zero-width space, every other time: the same words said again are read again.
  if (beat % 2) line += '\u200b';
  // The step's box: what Index said, or the last check's clue, or what to do now — never empty (UX review round 1).
  const tip = left === n && expert ? `${ask} ${centuryTip(job)}` : left === n && job.years ? `${ask} In BCE, a bigger year is longer ago.` : left && left < n ? `${ask} ${left} still to place.` : ask;

  // From the next empty place (UX review round 2: with the oldest's place empty again, "Tap the oldest" was ticked); on
  // Expert, the order, then the years.
  const chips = expert ? EXPERT_CHIPS : STEP_CHIPS;
  const chipAt = step === 'done' ? chips.length : expert ? (step === 'span' ? 1 : 0) : left === 0 ? 2 : nextAt > 0 ? 1 : 0;

  // On a phone held upright, the page's height is the board's (`cqh`): the step's bar starts at the bottom, where it stays.
  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden [@media(max-width:559px)]:[container-type:size]">
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] split:[@media(orientation:portrait)]:grid-rows-[minmax(0,1fr)] split:[@media(max-height:500px)]:grid-cols-[minmax(440px,1fr)_minmax(0,260px)]">
        {/* Left out up to 700 px high, and on a split screen held upright (an iPad): Tricky's seven places, the tray and
            the card need the room (bench: the card was cut). */}
        <div aria-hidden="true" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:700px)]:hidden split:[@media(orientation:portrait)]:hidden">
          <Archive cheer={step === 'done'} />
        </div>

        {/* The timeline and the tray, and the step with its buttons: on a screen held sideways from 560 px, the timeline the
            board's whole width and the cards and the step side by side under it (UX review round 2: with the step beside
            the timeline, Tricky's seven places were 45 px wide, a name broken in three); under them on one held upright. */}
        <section
          ref={board}
          aria-labelledby="it-step"
          className={cn(
            'flex flex-col gap-3 bg-[#173a47] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:overflow-y-auto split:border-t-4 split:border-[#1b0f22] split:p-4 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:grid [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_clamp(220px,40%,300px)] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:content-start [@media(max-height:500px)]:gap-1.5 split:[@media(max-height:700px)]:row-start-1 split:[@media(max-height:700px)]:border-t-0 split:[@media(orientation:portrait)]:row-start-1 split:[@media(orientation:portrait)]:border-t-0 split:[@media(max-height:500px)]:p-2',
            // On a phone held upright, while placing, the screen's height at least: the bar under it starts at the bottom and
            // stays there as the cards land (UX review round 2: it moved down 55 px as the line grew beside the cards; at 390 ×
            // 844, with the step a card under the board, 75 px — now the same bar at every height).
            // Its foot the bar's, so the bar's the same at the bottom pinned or stuck.
            step === 'place' && '[@media(max-width:559px)]:min-h-[100cqh] [@media(max-width:559px)]:pb-0',
          )}
        >
          {/* On a screen held upright, the cards and the timeline side by side, the cards first: a tap and where it lands both
              in sight (bench: Tricky's seven places pushed the cards under the fold, each landing out of sight; on a tablet,
              the timeline's top out of sight in UX review round 2's bench). The cards come first for the keyboard too; held
              sideways from 560 px, the timeline's shown above them (from 501 px high, in the board's grid). */}
          <div className="flex min-w-0 flex-col gap-3 [@media(max-width:559px)]:grid [@media(orientation:portrait)]:grid [@media(max-width:559px)]:grid-cols-2 [@media(orientation:portrait)]:grid-cols-2 [@media(max-width:559px)]:items-start [@media(orientation:portrait)]:items-start [@media(max-width:559px)]:gap-2 [@media(orientation:portrait)]:gap-2 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:contents [@media(max-height:500px)]:gap-1.5">
            {step === 'place' && (
              <div ref={tray} role="group" tabIndex={-1} aria-label={`The washed-up cards: ${left} to place`} aria-describedby="it-do" className="flex flex-col gap-1.5 focus:outline-none [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:col-start-1 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:row-start-2">
                <p aria-hidden="true" className="text-[13px] font-bold uppercase tracking-wide text-[#bfe3ec] [@media(max-height:500px)]:hidden">
                  Washed-up cards
                </p>
                {/* Each card keeps its spot in the tray, so placing one never moves the others under a finger. On a short screen
                    held sideways, all in a row (under the timeline's row): the step's bar fits under them. */}
                <div className="grid grid-cols-2 gap-1.5 [@media(max-width:559px)]:grid-cols-1 [@media(orientation:portrait)]:grid-cols-1 [@media(min-width:560px)_and_(orientation:landscape)]:grid-cols-3 [@media(min-width:560px)_and_(max-height:500px)]:grid-flow-col [@media(min-width:560px)_and_(max-height:500px)]:auto-cols-fr [@media(min-width:560px)_and_(max-height:500px)]:grid-cols-none [@media(min-width:900px)_and_(min-height:501px)_and_(orientation:landscape)]:grid-cols-4">
                  {job.dealt.map((id) =>
                    inTray(id) ? (
                      <CardButton key={id} ev={byId[id]} when={job.years ? cards[id] : null} floated={back.includes(id) && !still} onTap={(e) => place(id, e)} />
                    ) : (
                      <CardSlot key={id} ev={byId[id]} when={job.years ? cards[id] : null} />
                    ),
                  )}
                </div>
                {/* Held sideways, how to play under the cards (in the step's card it pushed Check under the fold); read out as
                    the cards' description. Not on one up to 600 px high: its Index's and the box's words. */}
                <p aria-hidden="true" className="mt-1.5 hidden text-[15px] leading-snug text-[#e4e1ff] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:block [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)_and_(max-height:600px)]:hidden">
                  {HOW_TO}
                </p>
              </div>
            )}
            {/* Filed (or Expert's years), held upright, the whole width: there are no cards beside it (UX review round 2). */}
            <div className={cn('[@media(min-width:560px)_and_(orientation:landscape)]:order-first [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:col-span-2 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:row-start-1', step !== 'place' && '[@media(max-width:559px)]:col-span-2 [@media(orientation:portrait)]:col-span-2')}>
              <Timeline job={job} placed={placed} locked={locked} byId={byId} whens={step === 'place' ? cards : years} showYears={showYears} nextAt={nextAt} done={step !== 'place'} onTap={takeBack} />
            </div>
          </div>
          <div
            data-bar
            className={cn(
              windowClass,
              // On a short screen, a bar kept in sight at the bottom, should the board's cards run past it — and on a phone held
              // upright, while placing, the same (bench: Check was under the fold). Its own height under the cards (UX review
              // round 2: on a tablet held upright it was squeezed, scrolling inside itself).
              'flex flex-none flex-col gap-2.5 p-3 [&>*]:flex-none split:overflow-y-auto [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:row-start-2 [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:sticky [@media(max-height:500px)]:bottom-0 [@media(max-height:500px)]:z-10 [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible [@media(max-height:500px)]:p-2',
              step === 'place' &&
                '[@media(max-width:559px)]:sticky [@media(max-width:559px)]:bottom-0 [@media(max-width:559px)]:z-10 [@media(max-width:559px)]:mt-auto [@media(max-width:559px)]:p-2',
              // Filed, held sideways: the board's width under the timeline (no cards beside it), what was learned and Next in a row.
              step === 'place' ? '[@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:col-start-2' : '[@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:col-span-2 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:col-start-1',
            )}
          >
            <p className={cn('text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden', step === 'place' && '[@media(max-width:559px)]:hidden [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)_and_(max-height:600px)]:hidden')}>
              Drawer {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                {/* Focused from script, no ring (it carried the title card's: UX review round 1) — as the stage's heading. */}
                <h2 id="it-step" ref={doneHead} tabIndex={-1} aria-describedby="it-result" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white focus:outline-none [@media(max-height:500px)]:text-[20px]')}>
                  {set.name}, in order{expert ? '.' : '!'}
                </h2>
                {/* Index's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                {/* On a short screen, a bar under the timeline: what was learned, Next beside it (review: beside the timeline, the
                    card was too tall for the screen). */}
                <div className="flex flex-col gap-2.5 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-end [@media(max-height:500px)]:gap-2 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-row [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:items-end">
                  <p id="it-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-1 [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                    {lessons[lessons.length - 1]}
                    {newPage && ` ${set.name} is in the timeline book${expert ? '.' : '!'}`}
                  </p>
                  <button ref={goRef} type="button" onClick={next} onKeyDown={noRepeat} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:text-base [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-none [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:px-6')}>
                    {done + 1 < JOBS_PER_ROUND ? 'Next drawer' : expert ? 'Finish the round' : 'All filed!'}
                  </button>
                </div>
              </>
            ) : step === 'span' && job.expert ? (
              <>
                {/* Expert: how many years from one card to another — the question, and three answers; what Index said of a wrong
                    one under them, in a box kept its height, so the answers never move (on a short screen the bar's at the
                    foot, and grows up). */}
                <h2 id="it-step" ref={spanHead} tabIndex={-1} aria-describedby="it-span" className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none focus:outline-none [@media(max-height:500px)]:text-[18px]')}>
                  How many years?
                </h2>
                <p id="it-span" className="text-[15px] font-bold leading-snug [@media(max-height:500px)]:text-[13px]">
                  {spanAsk(job)}
                </p>
                <div role="group" aria-labelledby="it-step" aria-describedby="it-span" className="grid grid-cols-3 gap-2">
                  {spanChoices(job).map((c, k, all) => (
                    <button
                      key={c}
                      ref={k === all.length - 1 ? goRef : undefined}
                      type="button"
                      onClick={(e) => pickSpan(c, e)}
                      onKeyDown={noRepeat}
                      aria-label={`${many(c)} years`}
                      className={cn('min-h-12 rounded-lg border-[3px] border-[#5a55a8] bg-[#24215a] px-1 text-[17px] font-bold hover:bg-[#2f2b70] [@media(max-height:500px)]:min-h-11 [@media(max-height:500px)]:text-[15px]', focusRing)}
                    >
                      {many(c)}
                    </button>
                  ))}
                </div>
                <p ref={spanSaid} className="flex min-h-[4.5rem] items-center rounded-md bg-[#24215a] px-2.5 text-[15px] leading-snug [@media(max-height:500px)]:min-h-[3.25rem] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px]">
                  {said ? <span className="font-bold">{said}</span> : <span className="text-[#e4e1ff]">{SPAN_TIP}</span>}
                </p>
              </>
            ) : (
              <>
                {/* On a short screen the step's a bar under the board: its heading and how to play left to Index and the bar's words —
                    and on one up to 600 px high held sideways, beside the cards (the bench: Check was under the fold). */}
                <h2 id="it-step" className={cn(pixelHeadClass, 'self-start text-[24px] leading-none [@media(max-height:500px)]:sr-only [@media(max-width:559px)]:sr-only [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)_and_(max-height:600px)]:sr-only')}>
                  Put them in order
                </h2>
                <p id="it-do" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:hidden [@media(max-width:559px)]:hidden [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:hidden">
                  {HOW_TO}
                </p>
                {/* What Index said of the last check, by the timeline too: on a phone her bubble's below the fold. Room for
                    the longest, so nothing under it moves — more where the step's card is narrow, beside the cards (UX review
                    round 2: Check moved as its words changed); where it's a bar at the screen's foot, Check at its foot, still as
                    the words above it change; on a tablet held upright, beside it at its top, the words growing down. Not read
                    out — her bubble is. */}
                <div className="flex flex-col gap-2.5 split:[@media(orientation:portrait)]:flex-row split:[@media(orientation:portrait)]:items-start [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-end [@media(max-height:500px)]:gap-2 [@media(max-width:559px)]:flex-row [@media(max-width:559px)]:items-end [@media(max-width:559px)]:gap-2">
                  <p className="flex min-h-[5.25rem] items-center rounded-md bg-[#24215a] px-2.5 text-[15px] font-bold leading-snug split:[@media(orientation:portrait)]:flex-1 [@media(min-width:560px)_and_(max-width:1023px)_and_(orientation:landscape)_and_(min-height:501px)]:min-h-[7.75rem] [@media(min-width:1024px)_and_(max-width:1279px)_and_(orientation:landscape)_and_(min-height:501px)]:min-h-[6.5rem] [@media(max-height:500px)]:min-h-[2.75rem] [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px] [@media(max-width:559px)]:min-h-[3.25rem] [@media(max-width:559px)]:flex-1 [@media(max-width:559px)]:py-1 [@media(max-width:559px)]:text-[13px]">
                    {/* At most three lines on a short screen (Index's bubble beside the board says it all), so the bar stays under the
                        tray — five on a phone held upright. What she said; else the last check's clue, kept till the next;
                        else what to do now. */}
                    {said || clue ? (
                      <span className="[@media(max-height:500px)]:line-clamp-3 [@media(max-width:559px)]:line-clamp-5">{said ?? clue}</span>
                    ) : (
                      <span className="font-normal text-[#e4e1ff]">{tip}</span>
                    )}
                  </p>
                  {/* Short, on a short screen: the words beside it get the room (said in full all the same). */}
                  <button
                    ref={goRef}
                    type="button"
                    onClick={checkOrder}
                    onKeyDown={noRepeat}
                    aria-label="Check the order"
                    aria-disabled={left > 0 || undefined}
                    className={cn(
                      goldClass,
                      'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-[15px] [@media(max-width:559px)]:flex-none [@media(max-width:559px)]:px-3 [@media(max-width:559px)]:text-[15px]',
                    )}
                  >
                    <span className="[@media(max-height:500px)]:hidden [@media(max-width:559px)]:hidden">Check the order</span>
                    <span aria-hidden="true" className="hidden [@media(max-height:500px)]:inline [@media(max-width:559px)]:inline">
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
          {/* On a short screen under 760 px wide, no picture: her words get the panel's width (UX review round 2: one word a line). */}
          <HostBubble npcId={def.host} line={line} phoneStrip portraitClass="split:[@media(max-height:500px)_and_(max-width:759px)]:hidden" />
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={`${set.name.toUpperCase()} DRAWER`} ready={step === 'done'} icon={<SetCard id={job.set} size={48} />} id="it-job">
              {jobWords(job)}
            </Ticket>
          </div>
          <TimelineBook known={known} read={read} onRead={setRead} />
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

/**
 * A card: its picture and name (and when, once said) — soggy parchment. Its
 * name and when go under the picture on a card, beside it in a row (`row`:
 * the classes that make it one, by the screen).
 */
function CardFace({ ev, when, unseen = false, row = '[@media(max-width:559px)]:items-start [@media(orientation:portrait)]:items-start', pic }: { ev: TimelineEvent; when: string | null; unseen?: boolean; row?: string; pic?: string }) {
  // Its "about" left off on a short screen, and a phone up to 600 px high (said all the same: the card's name has it) —
  // two lines at most where there's room (UX review round 2: three, and under the bar); where a card's narrow, its date
  // breaks at its spaces, inside it (the Expert bench: seven in a row on a short screen, "5th century BCE" ran out).
  const about = when?.startsWith('about ') ?? false;
  const year = when && (about ? when.slice(6) : when);
  return (
    <>
      <span aria-hidden="true" className={cn('text-2xl leading-none [@media(max-height:500px)]:text-lg [@media(max-height:500px)]:leading-none', pic)}>
        {ev.emoji}
      </span>
      <span className={cn('flex min-w-0 max-w-full flex-col items-center gap-0.5', row)}>
        {/* A long word breaks rather than run into the next place (UX review round 2: "Stethoscope" in a 45 px place). */}
        <span className="max-w-full text-[13px] font-bold leading-tight [overflow-wrap:anywhere] [@media(max-height:500px)]:text-[11px] [@media(max-height:500px)]:leading-tight">
          <Breakable name={ev.name} />
        </span>
        {year && (
          <span className={cn('max-w-full rounded bg-[#1b0f22] px-1 text-[11px] font-black leading-tight text-amber-200 [@media(max-height:500px)]:text-[10px] [@media(max-height:500px)]:leading-tight', unseen && 'invisible')}>
            {about && <span className="[@media(max-height:500px)]:hidden [@media(max-width:559px)_and_(max-height:600px)]:hidden">about </span>}
            {year}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * Where a card's long words may break, with a hyphen, should one not fit a
 * narrow place (UX review round 2: "Stethoscope" ran into the next place;
 * broken anywhere, "Typewrit/er").
 */
const BREAKS: Record<string, string> = Object.fromEntries(
  ['Air·liner', 'Aque·ducts', 'Aero·plane', 'Ball·point', 'Cas·sette', 'Choco·late', 'Elec·tric', 'Eye·glasses', 'Fire·light', 'Heli·copter', 'Micro·scope', 'Micro·wave', 'Paint·ings', 'Peni·cillin', 'Pic·tures', 'Print·ing', 'Sky·scraper', 'Stetho·scope', 'Type·writer'].flatMap((w) => {
    const soft = w.replace('·', '\u00ad');
    const word = w.replace('·', '');
    return [
      [word, soft],
      [word.toLowerCase(), soft.toLowerCase()],
    ];
  }),
);

/** A card's name, each long word a block that goes to the next line whole if it can, else breaks at its hyphen ("Cave paint-ings" with room for "paintings"). */
function Breakable({ name }: { name: string }) {
  return name.split(' ').map((w, k) => (
    <Fragment key={k}>
      {k > 0 && ' '}
      {BREAKS[w] ? <span className="inline-block max-w-full">{BREAKS[w]}</span> : w}
    </Fragment>
  ));
}

/** A washed-up card's box: on a screen held upright, a slim row like the timeline's places beside it. */
const CARD_BOX =
  'flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-md border-[3px] px-1 py-1 text-center [@media(max-height:500px)]:min-h-[52px] [@media(max-height:500px)]:py-0.5 [@media(max-width:559px)]:min-h-11 [@media(orientation:portrait)]:min-h-11 [@media(max-width:559px)]:flex-row [@media(orientation:portrait)]:flex-row [@media(max-width:559px)]:justify-start [@media(orientation:portrait)]:justify-start [@media(max-width:559px)]:gap-1.5 [@media(orientation:portrait)]:gap-1.5 [@media(max-width:559px)]:px-1.5 [@media(orientation:portrait)]:px-1.5 [@media(max-width:559px)]:text-left [@media(orientation:portrait)]:text-left';

/** A washed-up card; `floated`: just back from the timeline, it drifts in (UX review round 2: a shake read as "wrong!"). */
function CardButton({ ev, when, floated, onTap }: { ev: TimelineEvent; when: string | null; floated: boolean; onTap: (e: MouseEvent) => void }) {
  return (
    <button
      type="button"
      data-card={ev.id}
      onClick={onTap}
      onKeyDown={noRepeat}
      aria-label={`${ev.name}${when ? `, ${when}` : ''}`}
      className={cn(CARD_BOX, 'border-[#1b0f22] bg-[#f4e8c8] text-[#1b0f22] shadow-[2px_2px_0_#1b0f22] hover:bg-[#fff4d6]', floated && 'it-float', focusRing)}
    >
      <CardFace ev={ev} when={when} />
    </button>
  );
}

/**
 * Where a card placed was: dashed, and the card's own size — its face there,
 * unseen — so the cards around it never move (code review round 1: a slot only
 * its least height, and the tray shifted under a finger).
 */
function CardSlot({ ev, when }: { ev: TimelineEvent; when: string | null }) {
  return (
    <span aria-hidden="true" className={cn(CARD_BOX, 'border-dashed border-[#3f6f7d]')}>
      <span className="invisible contents">
        <CardFace ev={ev} when={when} />
      </span>
    </span>
  );
}

/**
 * The timeline: a place per card, oldest at the start; a card on it tapped
 * comes back to the washed-up cards; one checked right stays, ticked; the next
 * empty place marked. Across on a screen held sideways, down on one held
 * upright — there each place a slim row, so the line and the cards fit
 * together. From 560 px wide, where the cards are under the line, every place
 * holds every card's face, unseen but its own, so it's as big as the biggest
 * from the start — the line never grows as they land, nor as the years come
 * out (UX review round 1, and the bench: the cards under it moved).
 */
function Timeline({
  job,
  placed,
  locked,
  byId,
  whens,
  showYears,
  nextAt,
  done,
  onTap,
}: {
  job: Job;
  placed: readonly (string | null)[];
  locked: readonly boolean[];
  byId: Record<string, TimelineEvent>;
  /** Each card's when (`dateOf`). */
  whens: Record<string, string>;
  showYears: boolean;
  nextAt: number;
  done: boolean;
  onTap: (k: number) => void;
}) {
  const n = job.events.length;
  const upright = '[@media(orientation:portrait)]:items-start [@media(max-width:559px)]:items-start';
  // Every card's face in one cell: the one on it shown (its year once said), the rest unseen with theirs.
  const faces = (shown: TimelineEvent | null) => (
    <span className="grid min-w-0 flex-1 [@media(min-width:560px)_and_(orientation:landscape)]:w-full [@media(min-width:560px)_and_(orientation:landscape)]:flex-none">
      {job.events.map((ev) => (
        <span
          key={ev.id}
          aria-hidden="true"
          className={cn(
            'flex min-w-0 items-center gap-2 [grid-area:1/1] [@media(min-width:560px)_and_(orientation:landscape)]:flex-col [@media(min-width:560px)_and_(orientation:landscape)]:justify-center [@media(min-width:560px)_and_(orientation:landscape)]:gap-0.5',
            // Under 560 px wide the cards are beside the line, not under it: a place growing moves none of them, and the
            // line keeps to slim rows (bench: at 320 × 568 it ran off the screen).
            ev !== shown && 'invisible [@media(max-width:559px)]:hidden',
          )}
        >
          {/* The card on it, before its year's said, keeps its year's room unseen: the place is the same height with it
              (the bench: on a tablet, 14 px less with the longest year's card on it). */}
          {/* On a phone, with dates, no picture on the line: the place is half the screen, and its name and date need the
              room (the Expert bench: at 320 × 568, "400,000 BCE" and "5th century BCE" ran out of it). */}
          <CardFace ev={ev} when={whens[ev.id]} unseen={ev === shown && !showYears} row={upright} pic={job.years ? '[@media(max-width:559px)]:hidden' : undefined} />
        </span>
      ))}
    </span>
  );
  return (
    <div className="flex flex-col gap-1">
      {/* Its ends, as it runs: across on a screen held sideways; down on one held upright, the oldest at the top. */}
      <div aria-hidden="true" className="flex items-center justify-between text-[13px] font-bold text-[#bfe3ec]">
        <span className="hidden [@media(min-width:560px)_and_(orientation:landscape)]:inline">◀ Oldest</span>
        <span className="hidden [@media(min-width:560px)_and_(orientation:landscape)]:inline">Newest ▶</span>
        <span className="[@media(min-width:560px)_and_(orientation:landscape)]:hidden">Oldest</span>
      </div>
      <div className="relative">
        {/* The line through time, behind the places (beside the list, not in it). */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-1/2 hidden h-1 -translate-y-1/2 rounded bg-amber-300/70 [@media(min-width:560px)_and_(orientation:landscape)]:block" />
        <ol
          aria-label="The timeline, oldest first"
          aria-describedby={done ? undefined : 'it-do'}
          className="relative grid gap-1.5 [@media(min-width:560px)_and_(orientation:landscape)]:grid-flow-col [@media(min-width:560px)_and_(orientation:landscape)]:auto-cols-fr"
        >
          {job.events.map((_, k) => {
            const id = placed[k];
            const ev = id ? byId[id] : null;
            const right = locked[k];
            const next = k === nextAt;
            return (
              <li key={k} className="relative">
                <button
                  type="button"
                  onClick={() => onTap(k)}
                  onKeyDown={noRepeat}
                  aria-disabled={done || undefined}
                  aria-label={`Place ${k + 1} of ${n}${k === 0 ? ', the oldest' : k === n - 1 ? ', the newest' : ''}${ev ? `: ${ev.name}${showYears ? `, ${whens[ev.id]}` : ''}${right ? ', right' : ''}` : `, empty${next ? ', next' : ''}`}`}
                  className={cn(
                    // Held upright, a slim row (its number, picture, name, year); sideways, a card.
                    'relative flex min-h-11 w-full flex-row items-center gap-2 rounded-md border-[3px] px-2 py-1 text-left [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:min-h-[60px] [@media(min-width:560px)_and_(orientation:landscape)]:flex-col [@media(min-width:560px)_and_(max-height:500px)]:min-h-[52px] [@media(min-width:560px)_and_(max-height:500px)]:py-0.5 [@media(min-width:560px)_and_(orientation:landscape)]:justify-center [@media(min-width:560px)_and_(orientation:landscape)]:gap-0.5 [@media(min-width:560px)_and_(orientation:landscape)]:px-1 [@media(min-width:560px)_and_(orientation:landscape)]:text-center',
                    ev ? 'bg-[#f4e8c8] text-[#1b0f22] shadow-[2px_2px_0_#1b0f22]' : 'border-dashed bg-[#1f4a5a]',
                    // The next empty place, in gold: where the next card goes (UX review round 1: after a check, nothing said).
                    !ev && (next ? 'border-amber-300' : 'border-[#7fb3c2]'),
                    ev && (right ? 'border-emerald-600 pr-6 [@media(min-width:560px)_and_(orientation:landscape)]:pr-1' : 'border-[#1b0f22]'),
                    focusRing,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      // Held upright, a column of its own, "next" under the number: the same width with it or without, so the
                      // faces beside it wrap the same and the place never changes height (UX review round 2's bench: on a tablet,
                      // 30 px).
                      'flex w-8 flex-none flex-col items-center text-[15px] font-black leading-tight',
                      ev
                        ? 'text-[#1b0f22] [@media(min-width:560px)_and_(orientation:landscape)]:hidden'
                        : // Sideways, over the room kept for a card.
                          cn(next ? 'text-amber-300' : 'text-[#bfe3ec]', '[@media(min-width:560px)_and_(orientation:landscape)]:absolute [@media(min-width:560px)_and_(orientation:landscape)]:inset-0 [@media(min-width:560px)_and_(orientation:landscape)]:w-auto [@media(min-width:560px)_and_(orientation:landscape)]:justify-center'),
                    )}
                  >
                    {k + 1}
                    {!ev && next && <span className="text-[12px] font-bold">next</span>}
                  </span>
                  {faces(ev)}
                  {right && (
                    <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#1b0f22] bg-emerald-500 text-[11px] font-black text-white">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <span aria-hidden="true" className="text-[13px] font-bold text-[#bfe3ec] [@media(min-width:560px)_and_(orientation:landscape)]:hidden">
        Newest
      </span>
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
                className={cn('flex min-h-[52px] w-full min-w-0 items-center gap-2 rounded border-[3px] bg-[#fff6dc] px-1.5 py-1 text-left hover:bg-white', read === s.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <SetCard id={s.id} size={34} />
                {/* Wraps rather than run out of a narrow page (UX review round 1: at 200% zoom). */}
                <span aria-hidden="true" className="min-w-0 text-[13px] font-bold leading-tight text-[#1b0f22] [overflow-wrap:anywhere]">
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
