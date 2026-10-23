import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  BAND_DIRS,
  BAY,
  DIR_WORDS,
  EQUATOR_ROW,
  JOBS_PER_ROUND,
  KM_PER_SQUARE,
  PLACES,
  REGIONS,
  STAMPS,
  STAMP_BY_ID,
  TOWN,
  WORLD_START,
  capitalise,
  clueWords,
  delivered,
  destWords,
  farChoices,
  gridRef,
  howToFind,
  jobFor,
  jobWords,
  kmWords,
  landmarkOf,
  learnedLine,
  mapOf,
  missWords,
  move,
  openingWords,
  placeAt,
  regionAt,
  roundQueue,
  squaresAway,
  targetWords,
  whereWords,
  type Cell,
  type Dir,
  type GridMap,
  type Job,
  type PlaceId,
  type RegionId,
  type StampId,
} from '../../../lib/minigames/airmail';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useLiftTap } from '../useLiftTap';
import { useSettled } from '../useSettled';
import { StampCard } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Flying the post; on Tricky, how far she flew; the stamp's card. */
type Step = 'fly' | 'far' | 'done';

/** Pidge once a parcel's delivered, in turn. */
const RIGHT_LINES = ['Coo! Right on target!', 'Delivered — and not a feather out of place!', 'The fastest post in Port Lantern!'];

/**
 * A split screen (the board beside the side panel): from 768 px wide (`md`) —
 * not, as the stage's `split`, a phone held sideways from 640: there the side
 * panel left the world's map 176 × 88 px (UX review round 1); the board takes
 * the screen's width, the side panel under it, as at 568 × 320.
 */
const SPLIT = '(min-width: 768px)';
/** The compass's side (px): its buttons 52 px where the screen's over 600 px high, else 44 (UX review round 1: the smallest thing on screen). */
const compassSide = (tall: boolean) => (tall ? 3 * 52 + 8 : 3 * 44 + 8);
/** Deliver beside the compass, at least (px): its word fits (UX review round 1: at 640 × 360 it ran out of a 28 px button). */
const DELIVER_MIN = 92;
/** The step's card's padding and frame (px). */
const CARD_CHROME = 30;
/**
 * The step's card beside the map: at least the compass and Deliver side by
 * side — the same for a stamp's card, so the map doesn't shrink as a parcel's
 * delivered (UX review round 1: at 1366 × 650, 60 px).
 */
const cardMin = (width: number, compass: number) => Math.min(300, Math.max(compass + 8 + DELIVER_MIN + CARD_CHROME, width * 0.4));
/**
 * Under the map, the card's height: on a split screen under 500 px high only
 * Deliver and the compass, the clue beside them (what Pidge says is in her
 * bubble beside the board) — a stamp's card, its fact (bench: at 640 × 400 its
 * first line was clipped); else its parts: the parcel's count over 700 px
 * high, the clue (`clue`, measured), and the compass, Deliver and what Pidge
 * said beside it — a miss on a narrow phone is four lines (UX review round 1: a
 * constant cut the compass's last row off on a tablet held upright).
 */
const cardUnder = (compass: number, tallScreen: boolean, clue: number) => (tallScreen ? 28 : 0) + clue + 10 + Math.max(compass, 48 + 8 + 96) + CARD_CHROME + 2;
const CARD_UNDER_SHORT = { fly: 140 + CARD_CHROME + 2, done: 220 } as const;
/** On a short phone held sideways, the room what Pidge said needs under the map (px). */
const SAID_UNDER = 64;
/** The town's labels: its letters under the map, its numbers beside it (px); the world's scale under it. */
const GUTTER = 18;
const SCALE_LINE = 20;
const MIN_MAP = 150;

/**
 * Where the step's card goes and how big the map is (px, its squares' width):
 * beside the map or under it, whichever lets the map be bigger — on a split
 * screen in the board's room, on a phone in the screen's height under the
 * header. And on a short phone held sideways, whether what Pidge said goes
 * under the map (the world's wide, so there's room; beside the compass it's a
 * narrow column — bench: at 568 × 320 a miss ran off the screen). Null where
 * it can't be measured (tests): the map takes the width.
 */
function useMapLayout(page: RefObject<HTMLDivElement | null>, board: RefObject<HTMLElement | null>, ratio: number, gutter: number, under: number, done: boolean, parcel: number) {
  const [layout, setLayout] = useState<{ beside: boolean; size: number; saidUnder: boolean; stack: boolean } | null>(null);
  // The clue's height, as last measured: a stamp's card has none, and the map mustn't change size as it comes (bench: Next
  // went under the fold on a phone).
  const clueH = useRef(50);
  useLayoutEffect(() => {
    const p = page.current;
    const b = board.current;
    if (!p || !b || typeof ResizeObserver === 'undefined' || !window.matchMedia) return;
    const fit = () => {
      const cs = getComputedStyle(b);
      const px = (v: string) => parseFloat(v) || 0;
      const w = b.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
      const split = window.matchMedia(SPLIT).matches;
      const h = (split ? b.clientHeight : window.innerHeight - p.getBoundingClientRect().top) - px(cs.paddingTop) - px(cs.paddingBottom);
      const gap = 8;
      const short = window.innerHeight <= 500;
      const compass = compassSide(window.innerHeight > 600);
      const measured = b.querySelector('[data-clue]')?.getBoundingClientRect().height;
      if (measured) clueH.current = measured;
      const clue = clueH.current;
      const card = split && short ? (done ? CARD_UNDER_SHORT.done : CARD_UNDER_SHORT.fly) : cardUnder(compass, window.innerHeight > 700, clue);
      const side = Math.floor(Math.max(MIN_MAP, Math.min((h - under) * ratio, w - cardMin(w, compass) - gap - gutter)));
      const below = Math.min(w - gutter, (h - card - gap - under) * ratio, ratio === 1 ? 440 : Infinity);
      setLayout(
        side > below
          ? {
              beside: true,
              size: side,
              saidUnder: !split && short && h - under - side / ratio - gap >= SAID_UNDER,
              // Deliver under the compass if it'd be squeezed beside it.
              stack: w - side - gap - gutter < compass + 8 + DELIVER_MIN + CARD_CHROME,
            }
          : { beside: false, size: Math.floor(Math.max(MIN_MAP, below)), saidUnder: false, stack: false },
      );
    };
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    ro.observe(p);
    window.addEventListener('resize', fit);
    fit();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [page, board, ratio, gutter, under, done, parcel]);
  return layout;
}

/**
 * 🐉 Ember Air Mail (docs/DESIGN-MINIGAMES.md §5.9), at Port Lantern's post
 * office: Pidge hands over a parcel and its clue; the kid steers Ember across
 * the map with the compass, one square at a time, her route drawn as she
 * flies, and delivers it. Gentle flies the bay with four directions, the place
 * shown as a picture; Medium the town with eight, a house found by its square
 * (C5) or a landmark; Tricky the world — then how far, by the map's scale.
 * Three parcels a round, each kind a stamp in Pidge's album. No timer. Rules:
 * `lib/minigames/airmail.ts`.
 */
export default function EmberAirMail({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which stamps come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue(band, (id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const stamp = STAMP_BY_ID[job.stamp];
  const map = mapOf(job);
  const dirs = BAND_DIRS[band];
  const [step, setStep] = useState<Step>('fly');
  const [path, setPath] = useState<Cell[]>(() => [map.start]);
  const [route, setRoute] = useState<Dir[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  // Each time Pidge says something: the same words again are a change her bubble reads out (code review round 1: four
  // "East! Ember's over Asia." were one).
  const [beat, setBeat] = useState(0);
  // Wrong deliveries this parcel: the first says how to find the place, then which way (UX review round 1).
  const [misses, setMisses] = useState(0);
  const [bump, setBump] = useState(0);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  const [read, setRead] = useState<StampId | null>(null);
  const known = (id: StampId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}`);
  const at = path[path.length - 1];
  function say(words: string | null) {
    setSaid(words);
    setBeat((b) => b + 1);
  }

  /** One square on with the compass; off the map's edge, a bump and a word. */
  function fly(dir: Dir) {
    if (step !== 'fly' || !settled()) return;
    setRead(null);
    const to = move(job, at, dir);
    if (!to) {
      sfx('wrong');
      setBump((n) => n + 1);
      say('Ember can’t fly off the edge of the map — try another way.');
      return;
    }
    sfx('select');
    setPath((p) => [...p, to]);
    setRoute((r) => [...r, dir]);
    const wrapped = job.map === 'world' && Math.abs(to.x - at.x) > 1 ? ' Round the back of the world!' : '';
    say(`${capitalise(DIR_WORDS[dir])}!${wrapped} Ember’s ${whereWords(job, to)}.`);
  }

  /** A square on the map tapped: next to Ember (a way the compass has), she flies there; else, how to fly her (UX review round 1: a tap did nothing). */
  function tapSquare(c: Cell) {
    if (step !== 'fly' || !settled()) return;
    if (c.x === at.x && c.y === at.y) {
      say('That’s Ember! Tap the compass arrows to fly her.');
      return;
    }
    const d = dirs.find((k) => {
      const to = move(job, at, k);
      return to !== null && to.x === c.x && to.y === c.y;
    });
    if (d) fly(d);
    else say(`Ember flies one square at a time — tap a square next to her, or the compass: ${dirs.map((k) => DIR_WORDS[k]).join(', ')}.`);
  }

  function deliver() {
    if (step !== 'fly' || !settled()) return;
    setRead(null);
    if (!delivered(job, at)) {
      sfx('wrong');
      say(missWords(job, at, misses + 1));
      setMisses((m) => m + 1);
      return;
    }
    sfx('chest');
    if (job.map === 'world') {
      // The question's in the card and Pidge's bubble; the line by the map waits for a wrong answer (UX review round 1: the
      // same sentence three times).
      say(null);
      setStep('far');
      return;
    }
    finish();
  }

  /** Tricky: how far the place is from where the post set off, by the map's scale. */
  function far(km: number) {
    if (step !== 'far' || !settled()) return;
    setRead(null);
    const n = squaresAway(job, at);
    if (km !== n * KM_PER_SQUARE) {
      sfx('wrong');
      say(`Not quite: it’s ${n} ${n === 1 ? 'square' : 'squares'}, and each counts as about ${kmWords(KM_PER_SQUARE)} — so ${n} × ${KM_PER_SQUARE.toLocaleString('en-GB')}.`);
      return;
    }
    sfx('chest');
    finish();
  }

  function finish() {
    setNewPage(onPage(job.stamp, stamp.name));
    setLessons((l) => [...l, learnedLine(job, route, at)]);
    setRights((n) => n + 1);
    setSaid(null);
    setStep('done');
  }

  function next() {
    if (step !== 'done' || !settled()) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'The sack’s empty!', learned: lessons[lessons.length - 1] ?? '' });
      return;
    }
    const j = jobFor(band, round, done + 1, queue);
    setDone((n) => n + 1);
    setStep('fly');
    setPath([mapOf(j).start]);
    setRoute([]);
    setSaid(null);
    setMisses(0);
    setNewPage(false);
  }

  // Focus where each step starts: the map (described by where Ember is; the arrow keys fly her); the distance question; the
  // stamp's card.
  const mapRef = useRef<HTMLDivElement>(null);
  const farHead = useRef<HTMLHeadingElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else if (step === 'far') farHead.current?.focus({ preventScroll: true });
    else mapRef.current?.focus({ preventScroll: true });
  }, [step, done]);

  // As each step starts, on a phone the page scrolls back to the board's top, as far as the card's last line allows (a
  // parcel delivered: at least to its Next); on a split screen the side panel's back at its top (Pidge), the card at its.
  const page = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLElement>(null);
  const goRef = useRef<HTMLElement | null>(null);
  const setGo = (el: HTMLElement | null) => {
    goRef.current = el;
  };
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
    side.current?.scrollTo?.({ top: 0, behavior });
    const s = page.current;
    const b = board.current;
    const go = goRef.current;
    if (s && b && s.scrollHeight > s.clientHeight && getComputedStyle(s).overflowY !== 'hidden') {
      const base = s.getBoundingClientRect().top - s.scrollTop;
      const top = b.getBoundingClientRect().top - base;
      const show = (go ? go.getBoundingClientRect().bottom - base : top) + 12 - s.clientHeight;
      let to = step === 'done' ? Math.max(top, show) : Math.min(top, show);
      // Filed, Ember's square in sight too where Next allows (UX review round 1: a house in the top row went under the header).
      const ember = mapRef.current?.querySelector('[data-ember]');
      if (step === 'done' && ember) to = Math.max(show, Math.min(to, ember.getBoundingClientRect().top - base - 8));
      s.scrollTo?.({ top: Math.max(0, to), behavior });
    } else if (step !== 'done') card.current?.scrollTo?.({ top: 0, behavior });
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratio = map.w / map.h;
  const gutter = job.map === 'town' ? GUTTER : 0;
  const layout = useMapLayout(page, board, ratio, gutter, job.map === 'town' ? GUTTER : job.map === 'world' ? SCALE_LINE : 0, step === 'done', done);
  const beside = layout?.beside ?? false;
  const saidUnder = layout?.saidUnder ?? false;
  const stack = layout?.stack ?? false;

  // A wrong delivery: what Pidge said brought into sight, if it's under the fold (bench: at 320 × 568, its last lines were).
  useEffect(() => {
    if (misses) goRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [misses]); // eslint-disable-line react-hooks/exhaustive-deps

  // On a split screen, a stamp's card taller than its room scrolls within: from its top, as far as Next needs (bench: at
  // 640 × 400 Next was under it). Measured once the map's size has settled.
  useLayoutEffect(() => {
    const c = card.current;
    const go = goRef.current;
    if (step !== 'done' || !c || !go || c.scrollHeight <= c.clientHeight) return;
    c.scrollTop = 0;
    const over = go.getBoundingClientRect().bottom - c.getBoundingClientRect().bottom + 8;
    if (over > 0) c.scrollTop = over;
  }, [step, done, layout]);

  const cheerLine = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Next parcel?' : 'The sack’s empty!'}`;
  // Tricky's question: how far from where the post set off — the straight way, whichever way Ember flew (UX review round 1).
  const away = job.map === 'world' ? squaresAway(job, at) : 0;
  const farAsk = `Delivered! On this map each square counts as about ${kmWords(KM_PER_SQUARE)}. From Europe to ${destWords(job)} is ${away} ${away === 1 ? 'square' : 'squares'} the shortest way${route.length > away ? ` (Ember flew ${route.length})` : ''}: about how far is that?`;
  let line: string;
  if (read) line = `${STAMP_BY_ID[read].name}: ${STAMP_BY_ID[read].note}`;
  else if (step === 'done') line = cheerLine;
  else if (said) line = said;
  else if (step === 'far') line = farAsk;
  else line = openingWords(job);
  // A zero-width space, every other time: the same words said again are read again.
  if (beat % 2) line += '\u200b';

  const chips = job.map === 'world' ? ['Steer Ember', 'Deliver', 'How far?'] : ['Read the parcel', 'Steer Ember', 'Deliver'];
  const chipAt = step === 'done' ? 3 : step === 'far' ? 2 : job.map === 'world' ? (route.length ? 1 : 0) : route.length ? 2 : 1;
  const where = `Ember is ${whereWords(job, at)}.`;
  // For a reader (the map's squares are pictures): where the place is, as a kid sees it (code review round 1: only a wrong
  // delivery said it).
  const target = targetWords(job, at);
  // By the map till the first move: how to find the place (UX review round 1: on a phone, it was below the fold).
  const fallback = route.length || misses ? where : howToFind(job);

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto md:overflow-hidden">
      <div className="grid flex-none grid-cols-1 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_300px] md:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] md:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] md:[@media(max-height:500px)]:grid-cols-[minmax(400px,1fr)_minmax(0,260px)]">
        <div aria-hidden="true" className="relative hidden overflow-hidden md:col-start-1 md:row-start-1 md:block [@media(max-height:700px)]:hidden">
          <PostOffice cheer={step === 'done'} />
        </div>

        {/* The map, and the step's card beside it or under it — whichever lets the map be bigger: the clue, the compass and
            Deliver always by the map. */}
        <section
          ref={board}
          aria-labelledby="am-step"
          className={cn(
            'flex gap-2 bg-[#14324a] p-2 md:col-start-1 md:row-start-2 md:min-h-0 md:border-t-4 md:border-[#1b0f22] md:p-4 md:[@media(max-height:700px)]:row-start-1 md:[@media(max-height:700px)]:border-t-0 md:[@media(max-height:500px)]:p-2',
            beside ? 'flex-row' : 'flex-col',
          )}
        >
          <div className={cn('flex flex-none flex-col items-center', beside ? 'md:justify-center' : '')}>
            <MapView
              ref={mapRef}
              job={job}
              path={path}
              size={layout?.size ?? null}
              bump={bump}
              still={still}
              done={step !== 'fly'}
              where={where}
              target={target}
              onTap={tapSquare}
              onKey={(e) => {
                const key: Record<string, Dir> = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' };
                const d = key[e.key];
                if (!d) return;
                e.preventDefault();
                // Held down, one square: its repeats fly nowhere (code review round 1: five squares, round the world).
                if (!e.repeat) fly(d);
              }}
            />
            {saidUnder && step === 'fly' && layout && <SaidLine said={said} goRef={setGo} fallback={fallback} className="mt-2" width={layout.size} />}
          </div>

          <div
            ref={card}
            className={cn(
              windowClass,
              'flex min-w-0 flex-col gap-2.5 p-3 [&>*]:flex-none md:min-h-0 md:overflow-y-auto [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:p-2.5',
              beside ? 'flex-1' : 'md:flex-1',
            )}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:700px)]:hidden">
              Parcel {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                {/* Focused from script, no ring (as the other games' — code review round 1). */}
                <h2 id="am-step" ref={doneHead} tabIndex={-1} aria-describedby="am-fact" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white focus:outline-none [@media(max-height:500px)]:text-[20px]')}>
                  {stamp.name} delivered!
                </h2>
                {/* Pidge's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 md:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                <p id="am-fact" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px]">
                  {lessons[lessons.length - 1]}
                  {/* Said to a reader only on a split screen: the album's in sight beside the board (bench: at 640 × 360 the card's heading went out of view). */}
                  {newPage && ' '}
                  {newPage && <span className="md:sr-only">The {stamp.name.toLowerCase()} stamp is in the album!</span>}
                </p>
                <button ref={setGo} type="button" onClick={next} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:text-base')}>
                  {done + 1 < JOBS_PER_ROUND ? 'Next parcel' : 'All delivered!'}
                </button>
              </>
            ) : step === 'far' ? (
              <>
                <h2 id="am-step" ref={farHead} tabIndex={-1} aria-describedby="am-far" className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none focus:outline-none [@media(max-height:500px)]:text-[19px]')}>
                  How far?
                </h2>
                <p id="am-far" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  On this map each square counts as about <b>{kmWords(KM_PER_SQUARE)}</b>. From Europe to {destWords(job)} is <b>{away}</b> {away === 1 ? 'square' : 'squares'} the shortest way
                  {route.length > away ? ` (Ember flew ${route.length})` : ''}.
                </p>
                <div ref={setGo} role="group" aria-label="About how far?" className="grid grid-cols-3 gap-2">
                  {farChoices(away, round * JOBS_PER_ROUND + done).map((km) => (
                    <button key={km} type="button" onClick={() => far(km)} className={cn(outlineClass, 'min-h-12 border-2 px-1 text-[15px] leading-tight')}>
                      {kmWords(km)}
                    </button>
                  ))}
                </div>
                {/* After a wrong answer only (UX review round 1: the question said three times over, cut off at 640 × 360). */}
                {said && <SaidLine said={said} goRef={setGo} />}
              </>
            ) : (
              <>
                {/* The parcel's label is the card's title to see; this names the board for a reader. */}
                <h2 id="am-step" className="sr-only">
                  Fly the post
                </h2>
                {/* The clue on top — but under the map on a short split screen, where it sits by Deliver (the card's compact). */}
                <ClueTag job={job} parcel={done} className={beside ? undefined : 'md:[@media(max-height:500px)]:hidden'} />
                {beside ? (
                  // Beside the map: the compass with Deliver by it — under it where the card's narrow (UX review round 1: at
                  // 640 × 360 its word ran out of a 28 px button) — and what Pidge said under them: on a short screen
                  // beside the compass, or under the map where there's room (on a split one, only in her bubble: there's no
                  // room, and it's in sight beside the board).
                  <>
                    <div className={cn('flex gap-2', stack ? 'flex-col items-center' : 'items-center')}>
                      <Compass dirs={dirs} at={at} job={job} onFly={fly} />
                      <div className={cn('flex min-w-0 flex-col gap-2', stack ? 'w-full' : 'flex-1 [@media(max-height:500px)]:self-stretch')}>
                        <DeliverButton onDeliver={deliver} column={!stack} />
                        {!saidUnder && <SaidLine said={said} goRef={setGo} fallback={fallback} className="hidden [@media(max-height:500px)]:block md:[@media(max-height:500px)]:hidden" />}
                      </div>
                    </div>
                    <SaidLine said={said} goRef={setGo} fallback={fallback} className="[@media(max-height:500px)]:hidden" />
                  </>
                ) : (
                  // Under it: the clue, Deliver and what Pidge said, the compass beside them (thumb's side) — Deliver first, so
                  // a long line can't push it under the fold (UX review round 1: after a miss, at 320 × 568) — on a short
                  // split screen without what she said (it's in her bubble), so the map has the room.
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <ClueTag job={job} parcel={done} className="hidden md:[@media(max-height:500px)]:flex" copy />
                      <DeliverButton onDeliver={deliver} />
                      <SaidLine said={said} goRef={setGo} fallback={fallback} className="md:[@media(max-height:500px)]:hidden" />
                    </div>
                    <Compass dirs={dirs} at={at} job={job} onFly={fly} />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <aside
          ref={side}
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] md:col-start-2 md:row-span-2 md:row-start-1 md:overflow-y-auto md:border-l-4 md:p-4"
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={stamp.name.toUpperCase()} ready={step === 'done'} icon={<StampCard id={job.stamp} size={44} />} id="am-job">
              {jobWords(job)}
            </Ticket>
          </div>
          {job.map !== 'world' && <MapKey map={job.map === 'bay' ? BAY : TOWN} />}
          <Album known={known} read={read} fresh={step === 'done' && newPage ? job.stamp : null} onRead={(id) => settled() && setRead(id)} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 md:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={chips} current={chipAt} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

/** What Pidge said of the last move, by the map too (her bubble can be out of sight); room for the longest. Not live: hers is. */
function SaidLine({ said, goRef, fallback, className, width }: { said: string | null; goRef: (el: HTMLElement | null) => void; fallback?: string; className?: string; width?: number }) {
  return (
    <p
      style={width ? { width } : undefined}
      ref={(el) => {
        // The one in sight is the step's last line (there are two beside the map: one for short screens).
        if (el && el.offsetParent !== null) goRef(el);
      }}
      className={cn(
        'min-h-[4.1rem] rounded-md bg-[#24215a] px-2.5 py-1.5 text-[15px] leading-snug [@media(max-height:500px)]:min-h-[3.4rem] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[12px] [@media(max-height:500px)]:leading-tight',
        said ? 'font-bold text-white' : 'text-[#e4e1ff]',
        className,
      )}
    >
      {said ?? fallback ?? ''}
    </p>
  );
}

/**
 * Deliver: here, where Ember is — a plain gold bar (UX review round 1: as tall
 * as the compass, it was the biggest thing on screen); beside the compass
 * (`column`), its picture over its word, so the word fits (the bench: at its
 * least width, a row ran out of it).
 */
function DeliverButton({ onDeliver, column = false }: { onDeliver: () => void; column?: boolean }) {
  return (
    <button
      type="button"
      onClick={onDeliver}
      onKeyDown={noRepeat}
      aria-describedby="am-clue"
      className={cn(goldClass, 'min-h-12 w-full whitespace-nowrap px-3 text-lg leading-tight [@media(max-height:500px)]:text-base', column && 'flex-col gap-0 px-1 py-1')}
    >
      <span aria-hidden="true">📬</span> Deliver
    </button>
  );
}

/** Enter or Space held down: its repeats press nothing (code review round 1: a held arrow flew five squares). */
function noRepeat(e: KeyboardEvent) {
  if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
}

/**
 * The parcel's label: its stamp and where it's going — on Gentle the place's
 * picture, on Medium the landmark's beside its name (UX and code review round
 * 1: the map's pictures had no names); up to 700 px high, which parcel of the
 * round, as the card's count is left out there (UX review round 1).
 */
function ClueTag({ job, parcel, className, copy = false }: { job: Job; parcel: number; className?: string; copy?: boolean }) {
  const lm = landmarkOf(job);
  return (
    <p data-clue={copy ? undefined : true} className={cn('relative flex items-center gap-2.5 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[15px] font-bold leading-snug text-[#1b0f22] shadow-[0_3px_0_#1b0f22] [@media(max-height:500px)]:text-[14px]', className)}>
      {job.map !== 'bay' && <StampCard id={job.stamp} size={30} />}
      {job.map === 'bay' && (
        <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-md border-2 border-[#1b0f22] bg-[#8cc277] text-2xl">
          <PlaceIcon id={job.to} />
        </span>
      )}
      {/* The one Deliver's described by (a second, for a short split screen's compact card, isn't named). */}
      <span id={copy ? undefined : 'am-clue'} className="min-w-0 flex-1">
        {clueWords(job)}
      </span>
      {lm && (
        <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-md border-2 border-[#1b0f22] bg-[#8cc277] text-xl">
          <PlaceIcon id={lm.from} />
        </span>
      )}
      {/* On its corner, taking no room from the clue (the bench: at 568 × 320, a long clue then pushed the compass off). */}
      <span className="absolute -top-2 right-1.5 hidden rounded-full border-2 border-[#1b0f22] bg-[#e6dfc4] px-1.5 text-[11px] font-bold leading-tight text-[#1b0f22] [@media(max-height:700px)]:inline">
        <span className="sr-only">Parcel </span>
        {parcel + 1} of {JOBS_PER_ROUND}
      </span>
    </p>
  );
}

/**
 * A place's picture: an emoji, but for the lighthouse and the bridge, drawn —
 * none is one (UX review round 1: the lighthouse was Tokyo Tower, the bridge a
 * dark night scene).
 */
function PlaceIcon({ id }: { id: PlaceId }) {
  if (id === 'lighthouse')
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[1em] w-[1em]">
        <path d="M7 18 L8.5 6 H11.5 L13 18 Z" fill="#fff" stroke="#1b0f22" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M7.6 13 H12.4 M7.9 10 H12.1" stroke="#dc2626" strokeWidth="1.8" />
        <rect x="8" y="3" width="4" height="3" fill="#fcd34d" stroke="#1b0f22" strokeWidth="1.2" />
        <path d="M10 1.2 L12.4 3 H7.6 Z" fill="#dc2626" stroke="#1b0f22" strokeWidth="1" strokeLinejoin="round" />
        <path d="M12.5 4.5 L18 3 M12.5 4.5 L18 6" stroke="#fcd34d" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  if (id === 'bridge')
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[1em] w-[1em]">
        <rect x="1" y="12" width="18" height="6" rx="1" fill="#3d7fb8" />
        <path d="M1 11 H19 V13 H1 Z" fill="#a16207" stroke="#1b0f22" strokeWidth="1" />
        <path d="M3 13 V17 M17 13 V17" stroke="#1b0f22" strokeWidth="1.6" />
        <path d="M2 11 Q10 3 18 11" fill="none" stroke="#1b0f22" strokeWidth="1.6" />
        <path d="M6 8.2 V11 M10 7 V11 M14 8.2 V11" stroke="#1b0f22" strokeWidth="1" />
      </svg>
    );
  return <>{PLACES[id].emoji}</>;
}

/** The compass: a button a direction (four or eight round Ember's square), each flying her one square that way. */
function Compass({ dirs, at, job, onFly }: { dirs: readonly Dir[]; at: Cell; job: Job; onFly: (d: Dir) => void }) {
  const ARROW: Record<Dir, string> = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
  const SPOT: Record<Dir, string> = { NW: 'col-start-1 row-start-1', N: 'col-start-2 row-start-1', NE: 'col-start-3 row-start-1', W: 'col-start-1 row-start-2', E: 'col-start-3 row-start-2', SW: 'col-start-1 row-start-3', S: 'col-start-2 row-start-3', SE: 'col-start-3 row-start-3' };
  return (
    // 52 px buttons where the screen's over 600 px high (UX review round 1: the main control was the smallest thing on screen).
    <div role="group" aria-label="The compass" className="grid flex-none grid-cols-[repeat(3,2.75rem)] grid-rows-[repeat(3,2.75rem)] gap-1 [@media(min-height:601px)]:grid-cols-[repeat(3,3.25rem)] [@media(min-height:601px)]:grid-rows-[repeat(3,3.25rem)]">
      {dirs.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onFly(d)}
          onKeyDown={noRepeat}
          aria-label={`Fly ${DIR_WORDS[d]}`}
          className={cn(outlineClass, 'flex flex-col items-center justify-center border-2 p-0 leading-none', d === 'N' && 'border-amber-300', SPOT[d])}
        >
          <span aria-hidden="true" className="text-lg leading-none [@media(min-height:601px)]:text-2xl [@media(min-height:601px)]:leading-none">
            {ARROW[d]}
          </span>
          <span aria-hidden="true" className={cn('text-[12px] font-black leading-none', d === 'N' ? 'text-amber-200' : 'text-[#c9c5f2]')}>
            {d}
          </span>
        </button>
      ))}
      <span aria-hidden="true" className="col-start-2 row-start-2 flex flex-col items-center justify-center rounded-full bg-[#1b0f22] text-base leading-none [@media(min-height:601px)]:text-xl">
        🐉
        {job.map === 'town' && <span className="mt-0.5 text-[12px] font-black leading-none text-amber-200">{gridRef(at)}</span>}
      </span>
    </div>
  );
}

/** The colours of the world map's continents and oceans — the three big oceans each a shade (UX review round 1: one blue). */
const REGION_FILL: Record<RegionId, string> = {
  'north-america': '#e9a23b',
  'south-america': '#d97aa6',
  europe: '#a48ee0',
  africa: '#e6c24a',
  asia: '#72c46e',
  australia: '#e58a5a',
  antarctica: '#eef5f8',
  pacific: '#3d7fb8',
  atlantic: '#2f6aa3',
  indian: '#4f94cc',
  arctic: '#a8cde3',
};
/** Where each region's name sits on the world map (in squares, its middle) — clear of the equator, and of where Ember starts and lands most (UX review round 1). */
const REGION_LABEL: Record<RegionId, [number, number]> = {
  'north-america': [3, 1.2],
  'south-america': [3.9, 3.6],
  europe: [7, 0.55],
  africa: [7, 2.55],
  asia: [9.6, 1],
  australia: [10.5, 3.9],
  antarctica: [3, 5.5],
  pacific: [1, 2.4],
  atlantic: [4.9, 1.6],
  indian: [8.7, 4.2],
  arctic: [5.5, 0.5],
};

interface MapViewProps {
  job: Job;
  path: readonly Cell[];
  /** The squares' width, px (null: not measured — the width of the column). */
  size: number | null;
  bump: number;
  still: boolean;
  done: boolean;
  where: string;
  /** For a reader: where the parcel's going. */
  target: string;
  onTap: (c: Cell) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * The map: its squares (sea and land, places and houses — on Tricky the
 * world's continents and oceans, named, the equator across it), Ember on
 * hers, and her route drawn. A square next to Ember tapped flies her there
 * (UX review round 1: a tap did nothing); the arrow keys fly her too, and it's
 * in the Tab order (code review round 1: once focus left it, they were lost);
 * a reader hears where she is and where the parcel's going.
 */
const MapView = forwardRef<HTMLDivElement, MapViewProps>(function MapView({ job, path, size, bump, still, done, where, target, onTap, onKey }, ref) {
  const { w, h } = mapOf(job);
  const at = path[path.length - 1];
  const grid: GridMap | null = job.map === 'bay' ? BAY : job.map === 'town' ? TOWN : null;
  const town = job.map === 'town';
  const cell = size ? size / w : null;
  // Under 28 px a square, the world's names are short (they ran into each other) — but all there (UX review round 1).
  const small = cell !== null && cell < 28;
  // Its frame from the keyboard only: a Tab in, or a key (UX review round 1: after "Let's fly!" pressed with a mouse, a
  // dashed frame).
  const [keys, setKeys] = useState(false);
  const { handlers } = useLiftTap<Cell, HTMLDivElement>((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * h);
    return x >= 0 && x < w && y >= 0 && y < h ? { x, y } : null;
  }, onTap);
  // The route, cut where it goes round the back of the world.
  const runs: Cell[][] = [];
  for (const c of path) {
    const run = runs[runs.length - 1];
    if (run && Math.abs(run[run.length - 1].x - c.x) <= 1) run.push(c);
    else runs.push([c]);
  }
  const label = job.map === 'bay' ? 'The map of the bay' : town ? 'The map of the town, squares A1 to F6' : 'The map of the world';
  return (
    <div className="flex flex-col items-center gap-1">
      {/* The town's numbers up its side, 1 at the bottom; its letters along the bottom. */}
      <div className={cn('relative', town && 'pl-[18px]')} style={size ? { width: size + (town ? GUTTER : 0) } : { width: '100%', maxWidth: 420 }}>
        {town && (
          <div aria-hidden="true" className="absolute inset-y-0 left-0 flex w-[18px] flex-col py-1">
            {Array.from({ length: h }, (_, y) => (
              <span key={y} className="flex flex-1 items-center justify-center text-[12px] font-black leading-none text-amber-200">
                {h - y}
              </span>
            ))}
          </div>
        )}
        <div
          ref={ref}
          role="group"
          aria-label={label}
          aria-describedby="am-clue am-where"
          tabIndex={0}
          onKeyDown={(e) => {
            setKeys(true);
            onKey(e);
          }}
          onKeyUp={(e) => e.key === 'Tab' && setKeys(true)}
          onPointerDown={() => setKeys(false)}
          className={cn('relative w-full touch-manipulation select-none overflow-hidden rounded-md border-4 border-[#1b0f22] outline-none', keys && 'focus:outline-dashed focus:outline-2 focus:outline-offset-2 focus:outline-white')}
          style={{ aspectRatio: `${w} / ${h}` }}
        >
          {/* Shaken when Ember bumps the edge (keyed, so each bump shakes; the map itself keeps its focus). Its squares a grid:
              placed by percentages, they left thin dark lines between them (UX review round 1). */}
          <div key={bump} {...handlers} className={cn('absolute inset-0', bump > 0 && !still && 'cg-shake')}>
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, gridTemplateRows: `repeat(${h}, 1fr)` }}>
              {Array.from({ length: h }, (_, y) =>
                Array.from({ length: w }, (_, x) => {
                  const here = grid ? placeAt(grid, { x, y }) : null;
                  const fill = grid ? (here === 'pond' ? '#7cc3e8' : grid.sea[y][x] === '~' ? '#3d7fb8' : '#8cc277') : REGION_FILL[regionAt({ x, y }).id];
                  return (
                    <span key={`${x},${y}`} aria-hidden="true" className="flex items-center justify-center border border-black/15" style={{ background: fill, fontSize: cell ? cell * 0.55 : undefined }}>
                      {here === 'house' ? '🏠' : here ? <PlaceIcon id={here} /> : ''}
                    </span>
                  );
                }),
              )}
            </div>
            {job.map === 'world' && (
              <>
                <span aria-hidden="true" className="absolute inset-x-0 border-t-2 border-dashed border-white/90" style={{ top: `${(EQUATOR_ROW / h) * 100}%` }} />
                <span aria-hidden="true" className="absolute left-1 rounded bg-[#1b0f22]/70 px-1 text-[12px] font-bold leading-tight text-white" style={{ top: `calc(${(EQUATOR_ROW / h) * 100}% + 2px)` }}>
                  Equator
                </span>
                {REGIONS.map((r) => (
                  <span
                    key={r.id}
                    aria-hidden="true"
                    className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold leading-none', r.ocean ? 'italic text-white' : 'text-[#1b0f22]')}
                    style={{ left: `${(REGION_LABEL[r.id][0] / w) * 100}%`, top: `${(REGION_LABEL[r.id][1] / h) * 100}%`, fontSize: cell ? Math.max(11, Math.min(13, cell * 0.36)) : 11 }}
                  >
                    {small ? r.name.replace(/^the /, '').replace(/ Ocean$/, '').replace(/^(North|South) /, (m) => `${m[0]}. `) : r.name.replace(/^the /, '').replace(/ Ocean$/, '')}
                  </span>
                ))}
                {/* Where the world's post set off. */}
                {!(at.x === WORLD_START.x && at.y === WORLD_START.y) && (
                  <span
                    aria-hidden="true"
                    className="absolute flex items-center justify-center"
                    style={{ left: `${(WORLD_START.x / w) * 100}%`, top: `${(WORLD_START.y / h) * 100}%`, width: `${100 / w}%`, height: `${100 / h}%`, fontSize: cell ? cell * 0.4 : undefined }}
                  >
                    ✉️
                  </span>
                )}
              </>
            )}
            <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
              {runs.map((run, k) =>
                run.length > 1 ? (
                  <polyline key={k} points={run.map((c) => `${c.x + 0.5},${c.y + 0.5}`).join(' ')} fill="none" stroke="#fcd34d" strokeWidth="0.12" strokeDasharray="0.25 0.18" strokeLinecap="round" strokeLinejoin="round" />
                ) : null,
              )}
            </svg>
            <span
              data-ember
              aria-hidden="true"
              className={cn('pointer-events-none absolute flex items-center justify-center', !still && 'transition-[left,top] duration-200')}
              style={{ left: `${(at.x / w) * 100}%`, top: `${(at.y / h) * 100}%`, width: `${100 / w}%`, height: `${100 / h}%` }}
            >
              <span
                className={cn('flex aspect-square w-[86%] items-center justify-center rounded-full border-2 border-[#1b0f22] bg-amber-300 shadow-[0_0_0_2px_#fff]', done && 'bg-emerald-400')}
                style={{ fontSize: cell ? cell * 0.5 : undefined }}
              >
                🐉
              </span>
            </span>
            {/* North's up, on every map (UX review round 1: only the world's said so). */}
            <span aria-hidden="true" className="pointer-events-none absolute right-1 top-1 rounded bg-[#1b0f22]/75 px-1 text-[12px] font-black leading-tight text-amber-200">
              N ↑
            </span>
          </div>
        </div>
      </div>
      {town && (
        <div aria-hidden="true" className="flex" style={size ? { width: size, marginLeft: GUTTER } : { width: '100%' }}>
          {Array.from({ length: w }, (_, x) => (
            <span key={x} className="flex-1 text-center text-[12px] font-black leading-none text-amber-200">
              {gridRef({ x, y: h - 1 })[0]}
            </span>
          ))}
        </div>
      )}
      {job.map === 'world' && (
        <p aria-hidden="true" className="w-full text-right text-[12px] font-bold text-[#c9e3f2]">
          The map’s scale: 1 square ≈ {kmWords(KM_PER_SQUARE)}
        </p>
      )}
      <p id="am-where" className="sr-only">
        {where} {target} The arrow keys fly Ember too.
      </p>
    </div>
  );
});
MapView.displayName = 'MapView';

/** The map's key: each place's picture and name (UX and code review round 1: the pictures had no names — the lantern stamp says a key does that). */
function MapKey({ map }: { map: GridMap }) {
  return (
    <section aria-labelledby="am-key" className="flex flex-col gap-1.5">
      <h2 id="am-key" className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2]">
        Map key
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {[...map.places.map((p) => p.place), ...(map.houses.length ? (['house'] as const) : [])].map((id) => (
          <li key={id} className="flex items-center gap-1 rounded-md bg-[#fff6dc] px-1.5 py-0.5 text-[13px] font-bold text-[#1b0f22]">
            <span aria-hidden="true" className="text-base leading-none">
              {id === 'house' ? '🏠' : <PlaceIcon id={id} />}
            </span>
            {id === 'house' ? 'house' : PLACES[id].name}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Port Lantern's post office, close up (§2.2): Pidge at her counter, Ember with a parcel, letters flying. */
function PostOffice({ cheer }: { cheer: boolean }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const pidge = NPC_DEFS['port-postmaster'];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[16%] bg-[linear-gradient(#5b8fb9_0_68%,#6b4a32_68%_100%)] px-3 pb-[3%]">
      <span className={cn('absolute left-1/2 top-[12%] -translate-x-1/2 text-3xl transition-opacity', cheer ? 'opacity-100' : 'opacity-50')}>✉️ 📦 ✉️</span>
      <span>
        <EmberSprite anim={cheer ? 'cheer' : undefined} scale={3} />
      </span>
      <span className="flex items-end">{pidge && <CharacterPortrait spriteId={npcSpriteId(pidge, flags)} emoji={npcEmoji(pidge, flags)} scale={3} className="text-5xl" />}</span>
    </div>
  );
}

/**
 * Pidge's stamp album: a stamp per kind of post delivered; tapped, read out —
 * by Pidge, and under the album. One just stuck in (`fresh`) is marked new and
 * brought into sight (UX review round 1: unmarked, and half cut off at 1366 × 650).
 */
function Album({ known, read, fresh, onRead }: { known: (id: StampId) => boolean; read: StampId | null; fresh: StampId | null; onRead: (id: StampId) => void }) {
  const count = STAMPS.filter((s) => known(s.id)).length;
  const reading = read ? STAMP_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  useEffect(() => {
    if (fresh) list.current?.querySelector(`[data-stamp="${fresh}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [fresh, still]);
  return (
    <section aria-labelledby="am-album" className="mt-auto flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="am-album" className={cn(pixelHeadClass, 'text-2xl leading-none')}>
          Stamp album
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {STAMPS.length} stamps
        </span>
      </div>
      <ul ref={list} className="grid grid-cols-3 gap-1.5">
        {STAMPS.map((s) => (
          <li key={s.id} data-stamp={s.id} className="relative">
            {fresh === s.id && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 z-10 rounded-full border-2 border-[#1b0f22] bg-emerald-400 px-1.5 text-[11px] font-black leading-tight text-[#1b0f22]">
                New!
              </span>
            )}
            {known(s.id) ? (
              <button
                type="button"
                onClick={() => onRead(s.id)}
                aria-pressed={read === s.id}
                aria-label={`${s.name}${fresh === s.id ? ', new' : ''}. Read the stamp`}
                className={cn('flex h-[84px] w-full flex-col items-center justify-center gap-1 rounded border-[3px] bg-[#fff6dc] px-1 hover:bg-white', read === s.id || fresh === s.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <StampCard id={s.id} size={32} />
                <span aria-hidden="true" className="line-clamp-2 w-full text-center text-[12px] font-bold leading-tight text-[#1b0f22]">
                  {s.name}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A stamp not found yet" className="flex h-[84px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                ✉️ ?
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* The stamp read (Pidge's bubble says it too, and is the live region). */}
      {reading && (
        <div ref={panel} className="rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <b>{reading.name}</b> — {reading.note}
        </div>
      )}
    </section>
  );
}

