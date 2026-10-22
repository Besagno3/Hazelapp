import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  GUIDE_BOWL,
  capitalise,
  JOBS_PER_ROUND,
  PICTURES,
  PICTURE_BY_ID,
  POINTERS,
  isLine,
  jobFor,
  jobWords,
  joinWords,
  learnedLine,
  lineKey,
  looksWords,
  placeWords,
  pointerArrow,
  roundQueue,
  starName,
  type PictureId,
  type SkyStar,
} from '../../../lib/minigames/stars';
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
import { PictureCard } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Finding the North Star (Medium's Little Dipper); joining the stars; the fact card. */
type Step = 'north' | 'join' | 'done';

/** Vela after a picture's joined, in turn. */
const RIGHT_LINES = ['There it is — just like the old star-watchers saw it!', 'Beautiful. The sky remembers that one now.', 'You’re a natural star-finder!'];

/** How near (in sky units, of 100) a tap must land to a star to be that star — and at least this many px, on a small sky. */
const TAP_REACH = 7;
const TAP_REACH_PX = 22;
/** A press that moves this far (px) before it lifts is a swipe, scrolling the page — not a tap (UX review round 1). */
const SWIPE_PX = 10;

/** A split screen (the board beside the job, as the stage's `split`); a board held sideways (the step's card beside the sky). */
const SPLIT = '(min-width: 768px), (min-width: 640px) and (max-height: 500px)';
const SIDEWAYS = '(min-width: 560px) and (min-aspect-ratio: 6/5)';
/** Room kept under the sky on a board held upright: on a phone, for the picture card over it and the step card's top; split, all the card. */
const UPRIGHT_KEEP = { phone: 290, split: 250 } as const;
/** The smallest sky (px). */
const MIN_SKY = 160;

/** Beside the sky, the step's card is at least this wide (px): the fact card's wider, its fact being long. */
function cardMin(width: number, done: boolean) {
  return done ? Math.min(340, width * 0.5) : Math.min(300, width * 0.42);
}

/**
 * The sky's size (px), as big as fits (UX review round 1: at 568 × 320 it
 * was taller than the screen; on short screens it had a narrow column, the
 * card out of sight). On a board held sideways: as high as the board (on a
 * phone, the screen under the header), with the card beside it. Held
 * upright: as wide as the board, with room for the card under it — on a
 * phone, at most 360 px and the card's top in sight. Null where it can't be
 * measured (tests): the sky takes the width.
 */
function useSkySize(page: RefObject<HTMLDivElement | null>, board: RefObject<HTMLElement | null>, done: boolean) {
  const [size, setSize] = useState<number | null>(null);
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
      const fits = window.matchMedia(SIDEWAYS).matches
        ? Math.min(h, w - cardMin(w, done) - px(cs.columnGap))
        : Math.min(w, split ? h - UPRIGHT_KEEP.split : Math.min(360, h - UPRIGHT_KEEP.phone));
      setSize(Math.max(MIN_SKY, Math.floor(fits)));
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
  }, [page, board, done]);
  return size;
}

/**
 * ✨ Vela's Star Charts (docs/DESIGN-MINIGAMES.md §5.6), in Vela's Observatory
 * on Starfall Coast: Vela names a star picture; its card shows the shape. The
 * kid joins its stars — tap one, then another; a line appears if they're
 * joined in the picture — till it's whole, then reads its fact card. Gentle
 * shows the outline dotted; Medium finds the North Star from the Big Dipper's
 * pointers first; Tricky turns the sky and says how long the light took. Three
 * pictures a round, each a page of Vela's chart. No timer. Rules:
 * `lib/minigames/stars.ts`.
 */
export default function StarCharts({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which pictures come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue(band, (id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const picture = PICTURE_BY_ID[job.picture];
  const [step, setStep] = useState<Step>(job.findNorth ? 'north' : 'join');
  const [joined, setJoined] = useState<ReadonlySet<string>>(() => new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [pointed, setPointed] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [hint, setHint] = useState<readonly [string, string] | null>(null);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  const [read, setRead] = useState<PictureId | null>(null);
  const known = (id: PictureId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}`);
  const sky = useMemo(() => (job.findNorth && step !== 'north' ? job.sky.filter((st) => !st.id.endsWith('-g')) : job.sky), [job, step]);
  const total = picture.lines.length;

  /**
   * What Vela says as a star's picked: what to tap next — the glowing one, if
   * it's half of the line shown. Picked again, it stays picked (UX review
   * round 1: a second tap let it go, unseen, so following the hint did nothing).
   */
  function pickWords(id: string, again: boolean) {
    const name = (starName(picture, id) ?? '').replace(/, the North Star$/, '');
    const other = hint?.includes(id) ? hint.find((h) => h !== id) : undefined;
    const next = other ? `${starName(picture, other)} — it’s glowing` : job.outline ? 'the next star along a dotted line' : 'a star it’s joined to';
    return `${again ? `You’ve picked ${name}.` : `${name}!`} Now tap ${next}.`;
  }

  /** A star tapped (or pressed): the North Star's hunt, or a join. */
  function tapStar(id: string) {
    if (step === 'done' || !settled()) return;
    setRead(null);
    if (step === 'north') {
      if (pointed < POINTERS.length) {
        if (id === POINTERS[pointed]) {
          sfx('select');
          setPointed((n) => n + 1);
          setSaid(pointed === 0 ? 'Merak! Now Dubhe — the star above it, at the top of the bowl’s end.' : 'Dubhe! The two of them point the way: follow the arrow to the North Star.');
        } else if (id === 'polaris')
          setSaid(
            pointed === 0
              ? 'That’s the North Star! Now find it the star-watchers’ way: tap Merak, then Dubhe — they point to it.'
              : 'That’s the North Star! Tap Dubhe first — Merak and Dubhe point to it.',
          );
        else setSaid(pointed === 0 ? 'Not that one: Merak is the bottom star at the end of the Big Dipper’s bowl.' : 'Not that one: Dubhe is just above Merak, at the end of the bowl.');
        return;
      }
      if (id === 'polaris') {
        sfx('chest');
        setStep('join');
        setPicked('polaris');
        setSaid('The North Star! It’s the end of the Little Dipper’s handle — join its stars from here.');
      } else setSaid('Follow the arrow from Merak through Dubhe — the North Star is further along it.');
      return;
    }
    if (!starName(picture, id)) {
      if (picked) sfx('wrong');
      setSaid(joinWords(picture, id, id, false));
      return;
    }
    if (!picked || picked === id) {
      if (!picked) sfx('select');
      setPicked(id);
      setSaid(pickWords(id, !!picked));
      return;
    }
    const already = joined.has(lineKey(picked, id));
    // Every line from the star picked joined: a tap on another starts the next stroke (code review round 1: it was
    // "they aren't joined", wrong sound — Orion, Cygnus and the Southern Cross can't be joined in one).
    const spent = picture.lines.every(([a, b]) => (a !== picked && b !== picked) || joined.has(lineKey(a, b)));
    if (isLine(picture, picked, id) && !already) {
      const next = new Set(joined).add(lineKey(picked, id));
      setJoined(next);
      setSaid(joinWords(picture, picked, id, false));
      setHint(null);
      setPicked(id);
      sfx('select');
      if (next.size === total) {
        sfx('chest');
        setPicked(null);
        setNewPage(onPage(job.picture, picture.name));
        setLessons((l) => [...l, learnedLine(job, band)]);
        setRights((n) => n + 1);
        setStep('done');
      }
      return;
    }
    // The next stroke, or off to the line shown from another star: start from this one (not "they aren't joined").
    if (spent || (hint?.includes(id) && !hint.includes(picked))) {
      sfx('select');
      setPicked(id);
      setSaid(pickWords(id, false));
      return;
    }
    if (!already) sfx('wrong');
    setPicked(id);
    setSaid(joinWords(picture, picked, id, already));
  }

  /** Show one line still to join — from the star picked, if one's left from it: its two stars glow, and one's picked. */
  function showMe() {
    if (step !== 'join' || !settled()) return;
    const left = picture.lines.filter(([a, b]) => !joined.has(lineKey(a, b)));
    const line = left.find(([a, b]) => a === picked || b === picked) ?? left[0];
    if (!line) return;
    const [from, to] = line[1] === picked ? [line[1], line[0]] : line;
    sfx('select');
    setRead(null);
    setHint(line);
    setPicked(from);
    setSaid(`Here’s one: ${starName(picture, from)} to ${starName(picture, to)} — they’re glowing. ${from === picked ? 'Now' : `I’ve picked ${starName(picture, from)}:`} tap ${starName(picture, to)}!`);
  }

  function next() {
    if (step !== 'done' || !settled()) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'Three star pictures!', learned: lessons[lessons.length - 1] ?? '' });
      return;
    }
    const nextJob = jobFor(band, round, done + 1, queue);
    setDone((n) => n + 1);
    setStep(nextJob.findNorth ? 'north' : 'join');
    setJoined(new Set());
    setPicked(null);
    setPointed(0);
    setSaid(null);
    setHint(null);
    setNewPage(false);
  }

  // Focus where each step starts: the sky itself (described by the job — not a star: its ring looked like "tap this one",
  // UX review round 1; a Tab goes to a star); the fact card's heading.
  const skyRef = useRef<HTMLDivElement>(null);
  const factHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') factHead.current?.focus({ preventScroll: true });
    else skyRef.current?.focus({ preventScroll: true });
  }, [step, done]);

  // As each step starts, on a phone the page scrolls back to the board's top, as far as its card's last line allows (a
  // picture joined: at least to its Next); on a split screen the side panel's back at its top (Vela), the card at its.
  const page = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const side = useRef<HTMLElement>(null);
  const goRef = useRef<HTMLElement | null>(null);
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
      s.scrollTo?.({ top: Math.max(0, step === 'done' ? Math.max(top, show) : Math.min(top, show)), behavior });
    } else card.current?.scrollTo?.({ top: 0, behavior });
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const size = useSkySize(page, board, step === 'done');

  let line: string;
  if (read) line = `${PICTURE_BY_ID[read].name}: ${PICTURE_BY_ID[read].note}`;
  // Her cheer when a picture's whole (the last join's words would cover it).
  else if (step === 'done') line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Ready for the next?' : 'What a night’s work!'}`;
  else if (said) line = said;
  else if (step === 'north') line = 'Before the Little Dipper, let’s find the North Star: tap Merak, then Dubhe — the Big Dipper’s pointers show the way!';
  else
    line = job.outline
      ? `Here’s ${picture.called}: ${looksWords(job)}. Tap a star, then the next along a dotted line.`
      : `Find ${picture.called} — ${looksWords(job)}. Tap a star, then one it’s joined to.`;

  // What to do, in the card till Vela says something (then what she said).
  const doing =
    step === 'north'
      ? 'Tap Merak, then Dubhe: the two stars at the end of the Big Dipper’s bowl. They point at the North Star — then tap it.'
      : job.outline
        ? 'Tap a star, then the next along a dotted line — a line appears.'
        : 'Tap a star, then one it’s joined to — a line appears.';
  const counter = step === 'north' ? (pointed < 2 ? `Pointer stars: ${pointed} of 2` : 'Now the North Star') : `${joined.size} of ${total} lines joined`;
  const chips = job.findNorth ? ['The North Star', 'Join the stars', 'The fact card'] : ['The card', 'Join the stars', 'The fact card'];
  const chipAt = step === 'north' ? 0 : step === 'join' ? 1 : 3;

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden">
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] split:[@media(max-height:500px)]:grid-cols-[minmax(440px,1fr)_minmax(0,260px)]">
        {/* Up to 700 px high the sky has the whole column: under the scene it was a small square (review lesson). */}
        <div aria-hidden="true" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:700px)]:hidden">
          <Observatory cheer={step === 'done'} />
        </div>

        {/* The sky, and the step's card beside it on a board held sideways (under it, upright): the picture card, what Vela
            said and the hint are always by the sky (UX review round 1: on short screens they were out of sight). */}
        <section
          ref={board}
          aria-labelledby="sc-step"
          className="flex flex-col gap-2 bg-[#0d1236] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:border-t-4 split:border-[#1b0f22] split:p-4 [@media(min-width:560px)_and_(min-aspect-ratio:6/5)]:flex-row split:[@media(max-height:700px)]:row-start-1 split:[@media(max-height:700px)]:border-t-0 split:[@media(max-height:500px)]:p-2"
        >
          {/* On a phone held upright the picture card's over the sky, so the shape's in sight while joining. */}
          {step !== 'done' && (
            <p aria-hidden="true" className="flex items-center gap-2 rounded-md bg-[#fff6dc] px-2 py-1.5 text-[14px] font-bold leading-snug text-[#1b0f22] split:hidden [@media(min-width:560px)_and_(min-aspect-ratio:6/5)]:hidden">
              <PictureCard id={job.picture} size={48} />
              {jobWords(job)}
            </p>
          )}
          <div className="flex flex-none flex-col items-center split:justify-center">
            <div className="w-full max-w-[360px] split:max-w-none" style={size ? { width: size } : undefined}>
              <Sky
                ref={skyRef}
                stars={sky}
                picture={picture}
                job={job}
                step={step}
                joined={joined}
                picked={picked}
                pointed={pointed}
                hint={hint}
                still={still}
                size={size}
                onTap={tapStar}
              />
            </div>
          </div>

          <div
            ref={card}
            className={cn(
              windowClass,
              'flex min-w-0 flex-col gap-2.5 p-3 [&>*]:flex-none split:min-h-0 split:flex-1 split:overflow-y-auto [@media(min-width:560px)_and_(min-aspect-ratio:6/5)]:flex-1 [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:p-2.5',
            )}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:700px)]:hidden">
              Picture {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                <h2
                  id="sc-step"
                  ref={factHead}
                  tabIndex={-1}
                  aria-describedby="sc-fact"
                  className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white [@media(max-height:500px)]:text-[20px]', focusRing)}
                >
                  {picture.name}!
                </h2>
                {/* Vela's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{line}</p>
                <p id="sc-fact" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                  {lessons[lessons.length - 1]}
                  {newPage && ` ${capitalise(picture.called)} is on Vela’s chart!`}
                </p>
                <button ref={(el) => void (goRef.current = el)} type="button" onClick={next} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:text-base')}>
                  {done + 1 < JOBS_PER_ROUND ? 'Next picture' : 'Finish the night'}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  {/* Beside the sky, and on a split screen, the picture card's here (on a phone held upright, over the sky). */}
                  {step === 'join' && (
                    <span aria-hidden="true" className="hidden flex-none split:block [@media(min-width:560px)_and_(min-aspect-ratio:6/5)]:block">
                      <PictureCard id={job.picture} size={60} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <h2 id="sc-step" className={cn(pixelHeadClass, 'text-[24px] leading-none [@media(max-height:500px)]:text-[20px]')}>
                      {step === 'north' ? 'Find the North Star' : picture.name}
                    </h2>
                    <p className="mt-1 text-[14px] font-bold leading-snug text-[#c9c5f2]">{counter}</p>
                  </div>
                </div>
                {step === 'join' && (
                  <>
                    <p aria-hidden="true" className="hidden text-[15px] leading-snug text-[#e4e1ff] [@media(min-width:560px)_and_(min-aspect-ratio:6/5)_and_(min-height:501px)]:block [@media(min-width:768px)_and_(min-height:501px)]:block">
                      It looks like {looksWords(job)}.
                    </p>
                    <button type="button" onClick={showMe} className={cn(outlineClass, 'min-h-11 border-2 px-3 text-sm')}>
                      💡 Show me a line
                    </button>
                  </>
                )}
                {/* What Vela said of the last tap, by the sky too: her bubble can be out of sight (under the board on a phone).
                    Under the hint, so a long one moves nothing a finger's going to. Not read out: her bubble is. */}
                <p
                  ref={(el) => void (goRef.current = el)}
                  className={cn('min-h-[4.1rem] text-[15px] leading-snug [@media(max-height:500px)]:min-h-[3.4rem] [@media(max-height:500px)]:text-[14px]', said ? 'font-bold text-white' : 'text-[#e4e1ff]')}
                >
                  {said ?? doing}
                </p>
              </>
            )}
          </div>
        </section>

        <aside
          ref={side}
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] split:col-start-2 split:row-span-2 split:row-start-1 split:overflow-y-auto split:border-l-4 split:p-4"
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={picture.name.toUpperCase()} ready={step === 'done'} icon={<PictureCard id={job.picture} size={56} />} id="sc-job">
              {jobWords(job)}
            </Ticket>
          </div>
          <Chart known={known} read={read} onRead={(id) => settled() && setRead(id)} />
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
 * The sky: its stars as buttons — one in the tab order at a time, the arrow
 * keys moving to the nearest star that way, Enter / Space tapping it — each
 * named by where it is and what it's joined to. A tap anywhere picks the
 * nearest star (they're small to see but easy to hit), as the finger lifts —
 * one that moves first is scrolling the page. The picture's stars are bigger
 * and brighter than the sky's others. Lines drawn under them: the outline
 * dotted (Gentle), the joined ones gold.
 */
interface SkyProps {
  stars: readonly SkyStar[];
  picture: (typeof PICTURES)[number];
  job: ReturnType<typeof jobFor>;
  step: Step;
  joined: ReadonlySet<string>;
  picked: string | null;
  pointed: number;
  hint: readonly [string, string] | null;
  still: boolean;
  /** Its width, px (null: not measured). */
  size: number | null;
  onTap: (id: string) => void;
}

/** One of the sky's others, drawn tiny (not the Big Dipper's bowl, drawn for the North Star's hunt). */
const isTiny = (st: SkyStar) => st.extra && !st.id.endsWith('-g');

const Sky = forwardRef<HTMLDivElement, SkyProps>(function Sky({ stars, picture, job, step, joined, picked, pointed, hint, still, size, onTap }, ref) {
  const at = useMemo(() => Object.fromEntries(stars.map((st) => [st.id, st])), [stars]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const order = useMemo(() => [...stars].sort((a, b) => a.x - b.x || a.y - b.y), [stars]);
  // The star in the tab order: the last focused, the one picked, or the picture's first — never one of the others.
  const tabId = focusId && at[focusId] ? focusId : (picked ?? order.find((st) => !st.extra)?.id);
  const degree = (id: string) => [...joined].filter((k) => k.split('|').includes(id)).length;
  const done = step === 'done';
  const press = useRef<{ id: string; pointer: number; x: number; y: number } | null>(null);
  const small = size !== null && size < 240;

  // How each star's said: by where it is — two said alike numbered, left to right (UX review round 1).
  const placed = useMemo(() => {
    const words = order.map((st) => placeWords(st.x, st.y, st.mag, isTiny(st)));
    const count = (w: string) => words.filter((x) => x === w).length;
    return Object.fromEntries(order.map((st, k) => [st.id, count(words[k]) > 1 ? `${words[k]} (${words.slice(0, k + 1).filter((x) => x === words[k]).length} of ${count(words[k])})` : words[k]]));
  }, [order]);

  function nearest(e: PointerEvent<HTMLDivElement>): string | null {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    let best: string | null = null;
    let d = Math.max(TAP_REACH, (TAP_REACH_PX / r.width) * 100);
    for (const st of stars) {
      const dd = Math.hypot(st.x - x, st.y - y);
      if (dd < d) {
        d = dd;
        best = st.id;
      }
    }
    return best;
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    const dir: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dir[e.key];
    if (!d) {
      if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
      return;
    }
    e.preventDefault();
    const from = at[id];
    let best: SkyStar | null = null;
    let score = Infinity;
    for (const st of stars) {
      const dx = st.x - from.x;
      const dy = st.y - from.y;
      const along = dx * d[0] + dy * d[1];
      if (along <= 0.5) continue;
      const across = Math.abs(dx * d[1] - dy * d[0]);
      const sc = along + across * 2;
      if (sc < score) {
        score = sc;
        best = st;
      }
    }
    if (!best) return;
    setFocusId(best.id);
    e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-star="${best.id}"]`)?.focus();
  }

  // Named once joined, or picked (a word with its gold ring: code review round 1), and the pointers in the hunt.
  const showNames = (id: string) => done || degree(id) > 0 || picked === id || (step === 'north' && (POINTERS as readonly string[]).includes(id));
  // A star's name, said in full; and as it's written on the sky (short).
  const fullName = (id: string) => starName(picture, id) ?? (id === 'merak-g' ? 'Merak' : id === 'dubhe-g' ? 'Dubhe' : null);
  const nameOf = (id: string) => fullName(id)?.replace(/, the North Star$/, '') ?? null;
  // Where each name goes: under its star, or over it where under would cover another star or name, or run off the sky
  // (UX review round 1: names covered stars, and each other). Worked out for every star that can be named, left to right,
  // so a name never jumps as others appear. Near a side, a name keeps inside the sky.
  const above = useMemo(() => {
    const u = 100 / (size ?? 400);
    const off = 16 * u;
    const h = (small ? 13 : 15) * u;
    const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const out: Record<string, boolean> = {};
    for (const st of order) {
      const name = nameOf(st.id);
      if (!name) continue;
      const w = (name.length * (small ? 5.6 : 6.2) + (small ? 4 : 8)) * u;
      const x0 = st.x < 14 ? st.x - off : st.x > 86 ? st.x + off - w : st.x - w / 2;
      const box = (up: boolean) => ({ x0, x1: x0 + w, y0: up ? st.y - off - h : st.y + off, y1: up ? st.y - off : st.y + off + h });
      const clash = (b: (typeof boxes)[number]) =>
        b.y0 < 0 ||
        b.y1 > 100 ||
        boxes.some((o) => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1) ||
        stars.some((o) => o !== st && !isTiny(o) && o.x > b.x0 - 2 && o.x < b.x1 + 2 && o.y > b.y0 - 2 && o.y < b.y1 + 2);
      out[st.id] = clash(box(false)) && !clash(box(true));
      boxes.push(box(out[st.id]));
    }
    return out;
  }, [order, stars, size, small]); // eslint-disable-line react-hooks/exhaustive-deps
  const arrow = step === 'north' && pointed >= 2 && at.polaris ? pointerArrow(at.polaris) : null;

  return (
    <div
      ref={ref}
      role="group"
      aria-label="The sky"
      aria-describedby="sc-job"
      tabIndex={-1}
      className={cn(
        'relative aspect-square w-full select-none overflow-hidden rounded-lg border-4 border-[#1b0f22] bg-[radial-gradient(circle_at_50%_40%,#26306e_0%,#141a46_60%,#0b0f2c_100%)] outline-none focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        !done && 'touch-manipulation',
      )}
      onPointerDown={(e) => {
        press.current = null;
        if (done || e.button !== 0) return;
        const id = nearest(e);
        if (!id) return;
        press.current = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY };
        // A mouse press would focus the star under it and start a selection (a finger's left free to scroll the page).
        if (e.pointerType === 'mouse') e.preventDefault();
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (p && p.pointer === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SWIPE_PX) press.current = null;
      }}
      onPointerCancel={() => {
        press.current = null;
      }}
      onPointerUp={(e) => {
        const p = press.current;
        press.current = null;
        if (p && p.pointer === e.pointerId && !done) onTap(p.id);
      }}
    >
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {/* Gentle's outline, dotted, under the lines joined. */}
        {job.outline &&
          picture.lines.map(([a, b]) =>
            at[a] && at[b] ? (
              <line key={`o-${a}-${b}`} x1={at[a].x} y1={at[a].y} x2={at[b].x} y2={at[b].y} stroke="#a5b4fc" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.8" />
            ) : null,
          )}
        {/* The North Star's hunt: the Big Dipper's bowl, and once both pointers are tapped, the arrow through them. */}
        {step === 'north' &&
          GUIDE_BOWL.map(([a, b]) => <line key={`g-${a}-${b}`} x1={at[a].x} y1={at[a].y} x2={at[b].x} y2={at[b].y} stroke="#a5b4fc" strokeWidth="0.8" opacity="0.7" />)}
        {arrow && (
          <>
            <line x1={at['merak-g'].x} y1={at['merak-g'].y} x2={arrow.x - arrow.ux * 3} y2={arrow.y - arrow.uy * 3} stroke="#fcd34d" strokeWidth="1" strokeDasharray="3 2" />
            <polygon
              points={`${arrow.x},${arrow.y} ${arrow.x - arrow.ux * 4 - arrow.uy * 2.2},${arrow.y - arrow.uy * 4 + arrow.ux * 2.2} ${arrow.x - arrow.ux * 4 + arrow.uy * 2.2},${arrow.y - arrow.uy * 4 - arrow.ux * 2.2}`}
              fill="#fcd34d"
            />
          </>
        )}
        {[...joined].map((k) => {
          const [a, b] = k.split('|');
          return <line key={k} x1={at[a].x} y1={at[a].y} x2={at[b].x} y2={at[b].y} stroke="#fcd34d" strokeWidth="1.6" strokeLinecap="round" />;
        })}
      </svg>
      {stars.map((st) => {
        const name = nameOf(st.id);
        const isPicked = picked === st.id;
        const hinted = hint?.includes(st.id) ?? false;
        const n = degree(st.id);
        const label = `${placed[st.id]}${showNames(st.id) && name ? `: ${fullName(st.id)}` : ''}${isPicked ? ', picked' : ''}${n ? `, joined to ${n === 1 ? 'one star' : `${n} stars`}` : ''}${hinted ? ', glowing' : ''}`;
        const tiny = isTiny(st);
        const dot = tiny ? 5 : st.mag === 1 ? 14 : st.mag === 2 ? 11 : 9;
        return (
          <button
            key={st.id}
            type="button"
            data-star={st.id}
            tabIndex={st.id === tabId ? 0 : -1}
            aria-label={label}
            aria-pressed={isPicked}
            aria-disabled={done || undefined}
            onClick={(e) => {
              // A press from the keyboard (a pointer press is the sky's).
              if (e.detail === 0) onTap(st.id);
            }}
            onFocus={() => setFocusId(st.id)}
            onKeyDown={(e) => onKey(e, st.id)}
            className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-white"
            style={{ left: `${st.x}%`, top: `${st.y}%` }}
          >
            {/* The line shown glows round its two stars, dashed (picked is a solid gold ring) — round the star, so a star
                picked shows its gold too. */}
            {hinted && <span aria-hidden="true" className={cn('absolute inset-0.5 rounded-full border-2 border-dashed border-[#67e8f9] shadow-[0_0_10px_3px_rgba(103,232,249,0.7)]', !still && 'animate-pulse')} />}
            <span
              aria-hidden="true"
              className={cn(
                'block rounded-full',
                tiny ? 'bg-[#8b90c0] opacity-70' : 'border-[1.5px] border-[#1b0f22] bg-[#fff7d6] shadow-[0_0_6px_1px_rgba(255,247,214,0.55)]',
                isPicked && 'shadow-[0_0_0_3px_#fcd34d,0_0_12px_4px_rgba(252,211,77,0.8)]',
              )}
              style={{ width: dot, height: dot }}
            />
            {showNames(st.id) && name && (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute whitespace-nowrap rounded bg-[#1b0f22]/80 font-bold leading-tight text-[#fde68a]',
                  small ? 'px-0.5 text-[10px]' : 'px-1 text-[11px]',
                  above[st.id] ? 'bottom-full' : 'top-full',
                  st.x < 14 ? 'left-0' : st.x > 86 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                )}
              >
                {name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

/** Vela's Observatory, close up (§2.2): the dome open on the night, Vela at her telescope, Ember looking up. */
function Observatory({ cheer }: { cheer: boolean }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const vela = NPC_DEFS['coast-stargazer'];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[16%] bg-[linear-gradient(#0b0f2c_0_72%,#2a2350_72%_100%)] px-3 pb-[3%]">
      <svg aria-hidden="true" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {[
          [30, 20],
          [80, 45],
          [140, 15],
          [210, 35],
          [260, 12],
          [330, 40],
          [370, 18],
          [180, 60],
          [300, 62],
          [60, 70],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#fff7d6" />
        ))}
      </svg>
      <span aria-hidden="true" className="relative">
        <EmberSprite anim={cheer ? 'cheer' : undefined} scale={3} />
      </span>
      <span aria-hidden="true" className="relative flex items-end">
        {vela && <CharacterPortrait spriteId={npcSpriteId(vela, flags)} emoji={npcEmoji(vela, flags)} scale={3} className="text-5xl" />}
      </span>
    </div>
  );
}

/** Vela's chart: a page per picture joined, its shape in gold; tapped, read out — by Vela, and under the chart. */
function Chart({ known, read, onRead }: { known: (id: PictureId) => boolean; read: PictureId | null; onRead: (id: PictureId) => void }) {
  const count = PICTURES.filter((p) => known(p.id)).length;
  const reading = read ? PICTURE_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="sc-chart" className="mt-auto flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="sc-chart" className={cn(pixelHeadClass, 'text-2xl')}>
          Star chart
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {PICTURES.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-1.5">
        {PICTURES.map((p) => (
          <li key={p.id}>
            {known(p.id) ? (
              <button
                type="button"
                onClick={() => onRead(p.id)}
                aria-pressed={read === p.id}
                aria-label={`${p.name}. Read the page`}
                className={cn('flex h-[84px] w-full flex-col items-center justify-center gap-0.5 rounded border-[3px] bg-[#fff6dc] hover:bg-white', read === p.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <PictureCard id={p.id} size={40} />
                {/* Two lines for a long name (UX review round 1: "Summer Tr…" in a narrow side panel). */}
                <span aria-hidden="true" className="line-clamp-2 w-full px-0.5 text-center text-[12px] font-bold leading-tight tracking-tight text-[#1b0f22]">
                  {p.name}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A star picture not found yet" className="flex h-[84px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                ✦ ?
              </span>
            )}
          </li>
        ))}
      </ul>
      {reading && (
        <div ref={panel} className="rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <b>{reading.name}</b> — {reading.note}
        </div>
      )}
    </section>
  );
}
