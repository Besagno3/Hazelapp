import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
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
  placeWords,
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
import { useFitWidth } from '../useFitWidth';
import { useSettled } from '../useSettled';
import { PictureCard } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Finding the North Star (Medium's Little Dipper); joining the stars; the fact card. */
type Step = 'north' | 'join' | 'done';

/** Vela after a picture's joined, in turn. */
const RIGHT_LINES = ['There it is — just like the old star-watchers saw it!', 'Beautiful. The sky remembers that one now.', 'You’re a natural star-finder!'];

/** Room under the sky for how many lines are joined and what Vela said (and its heading over it from `sm` up). */
const SKY_RESERVE = 120;

/** How near (in sky units, of 100) a tap must land to a star to be that star — and at least this many px, on a small sky. */
const TAP_REACH = 7;
const TAP_REACH_PX = 22;

/** The Big Dipper's bowl, drawn faint while the North Star is found. */
const GUIDE_BOWL: readonly [string, string][] = [
  ['megrez-g', 'dubhe-g'],
  ['dubhe-g', 'merak-g'],
  ['merak-g', 'phecda-g'],
  ['phecda-g', 'megrez-g'],
];

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

  /** A star tapped (or pressed): the North Star's hunt, or a join. */
  function tapStar(id: string) {
    if (step === 'done') return;
    setRead(null);
    if (step === 'north') {
      if (pointed < POINTERS.length) {
        if (id === POINTERS[pointed]) {
          sfx('select');
          setPointed((n) => n + 1);
          setSaid(pointed === 0 ? 'Merak! Now Dubhe — the star above it, at the top of the bowl’s end.' : 'Dubhe! The two of them point the way: follow the arrow to the North Star.');
        } else setSaid(pointed === 0 ? 'Not that one: Merak is the bottom star at the end of the Big Dipper’s bowl.' : 'Not that one: Dubhe is just above Merak, at the end of the bowl.');
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
    const inPicture = !!starName(picture, id);
    if (!picked) {
      if (inPicture) {
        sfx('select');
        setPicked(id);
        setSaid(null);
      } else setSaid(joinWords(picture, id, id, false));
      return;
    }
    if (picked === id) {
      setPicked(null);
      return;
    }
    const already = joined.has(lineKey(picked, id));
    setSaid(joinWords(picture, picked, id, already));
    if (!isLine(picture, picked, id) || already) {
      if (!inPicture || !isLine(picture, picked, id)) sfx('wrong');
      if (inPicture) setPicked(id);
      return;
    }
    const next = new Set(joined).add(lineKey(picked, id));
    setJoined(next);
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
  }

  /** Show one line still to join: its two stars glow. */
  function showMe() {
    const left = picture.lines.find(([a, b]) => !joined.has(lineKey(a, b)));
    if (!left) return;
    sfx('select');
    setHint(left);
    setSaid(`Try ${starName(picture, left[0])} and ${starName(picture, left[1])} — they’re glowing.`);
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

  // Focus where each step starts: the sky (its first star, described by the job); the fact card's heading.
  const skyRef = useRef<HTMLDivElement>(null);
  const factHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') factHead.current?.focus({ preventScroll: true });
    else skyRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus({ preventScroll: true });
  }, [step, done]);

  // What a step works with comes into view as it starts — never on a tap: the sky, with the side panel back at its top
  // (Vela, and what to do: it stayed scrolled to the last Next); the fact card, all of it, with Next.
  const card = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  const side = useRef<HTMLElement>(null);
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
    if (step === 'done') card.current?.scrollIntoView?.({ block: 'nearest', behavior });
    else {
      side.current?.scrollTo?.({ top: 0, behavior });
      board.current?.scrollIntoView?.({ block: 'nearest', behavior });
    }
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  let line: string;
  if (read) line = `${PICTURE_BY_ID[read].name}: ${PICTURE_BY_ID[read].note}`;
  // Her cheer when a picture's whole (the last join's words would cover it).
  else if (step === 'done') line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Ready for the next?' : 'What a night’s work!'}`;
  else if (said) line = said;
  else if (step === 'north') line = 'Before the Little Dipper, let’s find the North Star. The Big Dipper’s pointers show the way!';
  else
    line = job.outline
      ? `Here’s ${picture.called}: ${picture.looks}. Tap a star, then the next along a dotted line.`
      : `Find ${picture.called} — ${picture.looks}. Tap a star, then one it’s joined to.`;

  const [area, fit] = useFitWidth(1, SKY_RESERVE);
  const chips = job.findNorth ? ['The North Star', 'Join the stars', 'The fact card'] : ['The card', 'Join the stars', 'The fact card'];
  const chipAt = step === 'north' ? 0 : step === 'join' ? 1 : 3;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden">
      <div className="grid flex-none grid-cols-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_300px] sm:grid-rows-[minmax(0,26fr)_minmax(0,74fr)] lg:grid-cols-[minmax(0,1fr)_380px] sm:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)]">
        {/* Up to 700 px high the sky has the whole column: under the scene it was a small square (review lesson). */}
        <div aria-hidden="true" className="relative hidden overflow-hidden sm:col-start-1 sm:row-start-1 sm:block [@media(max-height:700px)]:hidden">
          <Observatory cheer={step === 'done'} />
        </div>

        <section
          ref={board}
          aria-labelledby="sc-sky"
          className="flex flex-col gap-2 bg-[#0d1236] px-2 pb-2 pt-1.5 sm:col-start-1 sm:row-start-2 sm:min-h-0 sm:border-t-4 sm:border-[#1b0f22] sm:p-4 sm:[@media(max-height:700px)]:row-start-1 sm:[@media(max-height:700px)]:border-t-0 [@media(max-height:500px)]:p-2"
        >
          {/* On a phone the card is over the sky, so the shape is in sight while joining (the ticket's further down). */}
          <p aria-hidden="true" className="flex items-center gap-2 rounded-md bg-[#fff6dc] px-2 py-1.5 text-[14px] font-bold leading-snug text-[#1b0f22] sm:hidden">
            <PictureCard id={job.picture} size={48} />
            {jobWords(job)}
          </p>
          <div ref={area} className="flex w-full justify-center sm:min-h-0 sm:flex-1 sm:items-center">
            <div className="flex w-full max-w-[360px] flex-col gap-2 sm:max-w-none" style={fit ? { width: fit } : undefined}>
              <h2 id="sc-sky" className={cn(pixelHeadClass, 'truncate text-2xl text-[#fde68a] [@media(max-width:639px)]:sr-only [@media(max-height:500px)]:sr-only')}>
                {step === 'north' ? 'Find the North Star' : picture.name}
              </h2>
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
                onTap={tapStar}
              />
              <p className="h-6 text-center text-[15px] font-bold text-[#c9c5f2]">
                {step === 'north'
                  ? pointed < 2
                    ? `Pointer stars: ${pointed} of 2`
                    : 'Now the North Star'
                  : `${joined.size} of ${total} lines joined`}
              </p>
              {/* What Vela said of the last tap, by the sky too: her bubble can be out of sight — under the sky on a
                  phone, scrolled away in the side panel (Echo's Call's review round 1). Not read out: her bubble is. */}
              <p className="min-h-[2.6rem] text-center text-[14px] font-bold leading-snug text-white">{step === 'done' ? '' : said}</p>
            </div>
          </div>
        </section>

        <aside
          ref={side}
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:overflow-y-auto sm:border-l-4 sm:p-4"
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          <div className="order-1 sm:order-none">
            <Ticket heading={picture.name.toUpperCase()} ready={step === 'done'} icon={<PictureCard id={job.picture} size={56} />} id="sc-job">
              {jobWords(job)}
            </Ticket>
          </div>

          <div ref={card} className={cn(windowClass, 'flex flex-col gap-3 p-3.5 [@media(max-height:500px)]:order-first [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:p-2.5')}>
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden">
              Picture {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'north' && (
              <>
                <h2 className={cn(pixelHeadClass, 'text-[24px] [@media(max-height:500px)]:text-[20px]')}>Find the North Star</h2>
                <p className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  Tap <b>Merak</b>, then <b>Dubhe</b>: the two stars at the end of the Big Dipper’s bowl. They point straight at the North Star — then tap it.
                </p>
              </>
            )}
            {step === 'join' && (
              <>
                <h2 className={cn(pixelHeadClass, 'text-[24px] [@media(max-height:500px)]:text-[20px]')}>Join the stars</h2>
                <p className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  It looks like {picture.looks}. Tap a star, then one it’s joined to — a line appears.
                </p>
                <button type="button" onClick={showMe} className={cn(outlineClass, 'min-h-11 border-2 px-3 text-sm')}>
                  💡 Show me a line
                </button>
              </>
            )}
            {step === 'done' && (
              <>
                <h2
                  ref={factHead}
                  tabIndex={-1}
                  aria-describedby="sc-fact"
                  className={cn(pixelHeadClass, 'self-start rounded text-[26px] text-white [@media(max-height:500px)]:text-[20px]', focusRing)}
                >
                  {picture.name}!
                </h2>
                <p id="sc-fact" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                  {lessons[lessons.length - 1]}
                  {newPage && ` ${picture.called.charAt(0).toUpperCase()}${picture.called.slice(1)} is on Vela’s chart!`}
                </p>
                <button type="button" onClick={next} className={cn(goldClass, 'text-lg [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-base')}>
                  {done + 1 < JOBS_PER_ROUND ? 'Next picture' : 'Finish the night'}
                </button>
              </>
            )}
          </div>

          <Chart known={known} read={read} onRead={(id) => settled() && setRead(id)} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 sm:flex [@media(max-height:500px)]:hidden">
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
 * nearest star (they're small to see but easy to hit). Lines drawn under them:
 * the outline dotted (Gentle), the joined ones gold.
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
  onTap: (id: string) => void;
}

const Sky = forwardRef<HTMLDivElement, SkyProps>(function Sky({ stars, picture, job, step, joined, picked, pointed, hint, still, onTap }, ref) {
  const at = useMemo(() => Object.fromEntries(stars.map((st) => [st.id, st])), [stars]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const order = useMemo(() => [...stars].sort((a, b) => a.x - b.x || a.y - b.y), [stars]);
  const tabId = focusId && at[focusId] ? focusId : (picked ?? order[0]?.id);
  const degree = (id: string) => [...joined].filter((k) => k.split('|').includes(id)).length;
  const done = step === 'done';

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

  const showNames = (id: string) => done || degree(id) > 0 || (step === 'north' && (POINTERS as readonly string[]).includes(id));
  const nameOf = (id: string) =>
    starName(picture, id) ?? (id === 'merak-g' ? 'Merak' : id === 'dubhe-g' ? 'Dubhe' : null);

  return (
    <div
      ref={ref}
      role="group"
      aria-label="The sky"
      aria-describedby="sc-job"
      className={cn(
        'relative aspect-square w-full select-none overflow-hidden rounded-lg border-4 border-[#1b0f22] bg-[radial-gradient(circle_at_50%_40%,#26306e_0%,#141a46_60%,#0b0f2c_100%)]',
        !done && 'touch-manipulation',
      )}
      onPointerDown={(e) => {
        if (done || e.button !== 0) return;
        const id = nearest(e);
        if (!id) return;
        e.preventDefault();
        onTap(id);
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
        {step === 'north' && pointed >= 2 && (
          <line
            x1={at['merak-g'].x}
            y1={at['merak-g'].y}
            x2={at['merak-g'].x + (at['dubhe-g'].x - at['merak-g'].x) * 4.2}
            y2={at['merak-g'].y + (at['dubhe-g'].y - at['merak-g'].y) * 4.2}
            stroke="#fcd34d"
            strokeWidth="1"
            strokeDasharray="3 2"
          />
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
        const label = `${placeWords(st.x, st.y, st.mag)}${showNames(st.id) && name ? `: ${name}` : ''}${isPicked ? ', picked' : ''}${n ? `, joined to ${n === 1 ? 'one star' : `${n} stars`}` : ''}${hinted ? ', glowing' : ''}`;
        const dot = st.mag === 1 ? 14 : st.mag === 2 ? 11 : 7;
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
            className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:shadow-[0_0_0_3px_#67e8f9,0_0_0_5px_#1b0f22]"
            style={{ left: `${st.x}%`, top: `${st.y}%` }}
          >
            <span
              aria-hidden="true"
              className={cn(
                'block rounded-full border-2 border-[#1b0f22]',
                st.extra ? 'bg-[#c7cbe8]' : 'bg-[#fff7d6]',
                isPicked && 'shadow-[0_0_0_3px_#fcd34d,0_0_12px_4px_rgba(252,211,77,0.8)]',
                hinted && !still && 'animate-pulse',
                hinted && 'shadow-[0_0_0_3px_#67e8f9,0_0_12px_4px_rgba(103,232,249,0.8)]',
              )}
              style={{ width: dot, height: dot }}
            />
            {showNames(st.id) && name && (
              <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap rounded bg-[#1b0f22]/80 px-1 text-[11px] font-bold leading-tight text-[#fde68a]">
                {name.replace(/, the North Star$/, '')}
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
    <section aria-labelledby="sc-chart" className="order-2 mt-auto flex flex-col gap-2 sm:order-none">
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
                className={cn('flex h-[76px] w-full flex-col items-center justify-center gap-0.5 rounded border-[3px] bg-[#fff6dc] hover:bg-white', read === p.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <PictureCard id={p.id} size={44} />
                <span aria-hidden="true" className="w-full truncate px-0.5 text-center text-[12px] font-bold leading-tight tracking-tight text-[#1b0f22]">
                  {p.name}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A star picture not found yet" className="flex h-[76px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
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
