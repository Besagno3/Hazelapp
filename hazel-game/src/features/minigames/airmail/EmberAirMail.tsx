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
  farChoices,
  gridRef,
  jobFor,
  jobWords,
  kmWords,
  learnedLine,
  mapOf,
  missWords,
  move,
  openingWords,
  placeAt,
  regionAt,
  roundQueue,
  whereWords,
  type Cell,
  type Dir,
  type GridMap,
  type Job,
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
import { useSettled } from '../useSettled';
import { StampCard } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Flying the post; on Tricky, how far she flew; the stamp's card. */
type Step = 'fly' | 'far' | 'done';

/** Pidge once a parcel's delivered, in turn. */
const RIGHT_LINES = ['Coo! Right on the doorstep!', 'Delivered — and not a feather out of place!', 'The fastest post in Port Lantern!'];

/** A split screen (the board beside the side panel, as the stage's `split`). */
const SPLIT = '(min-width: 768px), (min-width: 640px) and (max-height: 500px)';
/** The step's card: beside the map, at least this wide (the stamp's card wider, its fact being long); under it, this tall. */
const cardMin = (width: number, done: boolean) => (done ? Math.min(360, width * 0.6) : Math.min(300, Math.max(252, width * 0.4)));
/**
 * Under the map, the card's height: on a split screen under 500 px high only
 * the clue, Deliver and the compass (what Pidge says is in her bubble beside
 * the board) — a stamp's card, its fact (bench: at 640 × 400 its first line
 * was clipped, so it goes beside the map); else what she said too.
 */
const CARD_UNDER = { compact: 172, done: 220, full: 226 } as const;
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
function useMapLayout(page: RefObject<HTMLDivElement | null>, board: RefObject<HTMLElement | null>, ratio: number, gutter: number, under: number, done: boolean) {
  const [layout, setLayout] = useState<{ beside: boolean; size: number; saidUnder: boolean } | null>(null);
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
      const card = split && short ? (done ? CARD_UNDER.done : CARD_UNDER.compact) : CARD_UNDER.full;
      const side = Math.floor(Math.max(MIN_MAP, Math.min((h - under) * ratio, w - cardMin(w, done) - gap - gutter)));
      const below = Math.min(w - gutter, (h - card - gap - under) * ratio, ratio === 1 ? 440 : Infinity);
      setLayout(
        side > below
          ? { beside: true, size: side, saidUnder: !split && short && h - under - side / ratio - gap >= SAID_UNDER }
          : { beside: false, size: Math.floor(Math.max(MIN_MAP, below)), saidUnder: false },
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
  }, [page, board, ratio, gutter, under, done]);
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
  const [bump, setBump] = useState(0);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  const [read, setRead] = useState<StampId | null>(null);
  const known = (id: StampId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}`);
  const at = path[path.length - 1];

  /** One square on with the compass; off the map's edge, a bump and a word. */
  function fly(dir: Dir) {
    if (step !== 'fly' || !settled()) return;
    setRead(null);
    const to = move(job, at, dir);
    if (!to) {
      sfx('wrong');
      setBump((n) => n + 1);
      setSaid('Ember can’t fly off the edge of the map — try another way.');
      return;
    }
    sfx('select');
    setPath((p) => [...p, to]);
    setRoute((r) => [...r, dir]);
    const round = job.map === 'world' && Math.abs(to.x - at.x) > 1 ? ' Round the back of the world!' : '';
    setSaid(`${capitalise(DIR_WORDS[dir])}!${round} Ember’s ${whereWords(job, to)}.`);
  }

  function deliver() {
    if (step !== 'fly' || !settled()) return;
    setRead(null);
    if (!delivered(job, at)) {
      sfx('wrong');
      setSaid(missWords(job, at));
      return;
    }
    sfx('chest');
    if (job.map === 'world') {
      setStep('far');
      setSaid(`Delivered! Now — each square on this map is about ${kmWords(KM_PER_SQUARE)} across. Ember flew ${route.length} ${route.length === 1 ? 'square' : 'squares'}: about how far is that?`);
      return;
    }
    finish();
  }

  /** Tricky: how far she flew, by the map's scale. */
  function far(km: number) {
    if (step !== 'far' || !settled()) return;
    setRead(null);
    const right = route.length * KM_PER_SQUARE;
    if (km !== right) {
      sfx('wrong');
      setSaid(`Not quite: Ember flew ${route.length} ${route.length === 1 ? 'square' : 'squares'}, and each is about ${kmWords(KM_PER_SQUARE)} — so ${route.length} × ${KM_PER_SQUARE.toLocaleString('en-GB')}.`);
      return;
    }
    sfx('chest');
    finish();
  }

  function finish() {
    setNewPage(onPage(job.stamp, stamp.name));
    setLessons((l) => [...l, learnedLine(job, route)]);
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
      s.scrollTo?.({ top: Math.max(0, step === 'done' ? Math.max(top, show) : Math.min(top, show)), behavior });
    } else if (step !== 'done') card.current?.scrollTo?.({ top: 0, behavior });
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratio = map.w / map.h;
  const gutter = job.map === 'town' ? GUTTER : 0;
  const layout = useMapLayout(page, board, ratio, gutter, job.map === 'town' ? GUTTER : job.map === 'world' ? SCALE_LINE : 0, step === 'done');
  const beside = layout?.beside ?? false;
  const saidUnder = layout?.saidUnder ?? false;

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
  let line: string;
  if (read) line = `${STAMP_BY_ID[read].name}: ${STAMP_BY_ID[read].note}`;
  else if (step === 'done') line = cheerLine;
  else if (said) line = said;
  else line = openingWords(job);

  const chips = job.map === 'world' ? ['Steer Ember', 'Deliver', 'How far?'] : ['Read the parcel', 'Steer Ember', 'Deliver'];
  const chipAt = step === 'done' ? 3 : step === 'far' ? 2 : job.map === 'world' ? (route.length ? 1 : 0) : route.length ? 2 : 1;
  const where = `Ember is ${whereWords(job, at)}.`;

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden">
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] split:[@media(max-height:500px)]:grid-cols-[minmax(400px,1fr)_minmax(0,260px)]">
        <div aria-hidden="true" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:700px)]:hidden">
          <PostOffice cheer={step === 'done'} />
        </div>

        {/* The map, and the step's card beside it or under it — whichever lets the map be bigger: the clue, the compass and
            Deliver always by the map. */}
        <section
          ref={board}
          aria-labelledby="am-step"
          className={cn(
            'flex gap-2 bg-[#14324a] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:border-t-4 split:border-[#1b0f22] split:p-4 split:[@media(max-height:700px)]:row-start-1 split:[@media(max-height:700px)]:border-t-0 split:[@media(max-height:500px)]:p-2',
            beside ? 'flex-row' : 'flex-col',
          )}
        >
          <div className={cn('flex flex-none flex-col items-center', beside ? 'split:justify-center' : '')}>
            <MapView
              ref={mapRef}
              job={job}
              path={path}
              size={layout?.size ?? null}
              bump={bump}
              still={still}
              done={step !== 'fly'}
              where={where}
              onKey={(e) => {
                const key: Record<string, Dir> = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' };
                const d = key[e.key];
                if (!d) return;
                e.preventDefault();
                fly(d);
              }}
            />
            {saidUnder && step === 'fly' && layout && <SaidLine said={said} goRef={setGo} fallback={where} className="mt-2" width={layout.size} />}
          </div>

          <div
            ref={card}
            className={cn(
              windowClass,
              'flex min-w-0 flex-col gap-2.5 p-3 [&>*]:flex-none split:min-h-0 split:overflow-y-auto [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:p-2.5',
              beside ? 'flex-1' : 'split:flex-1',
            )}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:700px)]:hidden">
              Parcel {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                <h2 id="am-step" ref={doneHead} tabIndex={-1} aria-describedby="am-fact" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white [@media(max-height:500px)]:text-[20px]', focusRing)}>
                  {stamp.name} delivered!
                </h2>
                {/* Pidge's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                <p id="am-fact" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px]">
                  {lessons[lessons.length - 1]}
                  {/* Said to a reader only on a split screen: the album's in sight beside the board (bench: at 640 × 360 the card's heading went out of view). */}
                  {newPage && ' '}
                  {newPage && <span className="split:sr-only">The {stamp.name.toLowerCase()} stamp is in the album!</span>}
                </p>
                <button ref={setGo} type="button" onClick={next} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:text-base')}>
                  {done + 1 < JOBS_PER_ROUND ? 'Next parcel' : 'All delivered!'}
                </button>
              </>
            ) : step === 'far' ? (
              <>
                <h2 id="am-step" ref={farHead} tabIndex={-1} aria-describedby="am-far" className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none [@media(max-height:500px)]:text-[19px]', focusRing)}>
                  How far?
                </h2>
                <p id="am-far" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  Each square is about <b>{kmWords(KM_PER_SQUARE)}</b> across. Ember flew <b>{route.length}</b> {route.length === 1 ? 'square' : 'squares'}.
                </p>
                <div role="group" aria-label="About how far?" className="grid grid-cols-3 gap-2">
                  {farChoices(route.length).map((km) => (
                    <button key={km} type="button" onClick={() => far(km)} className={cn(outlineClass, 'min-h-12 border-2 px-1 text-[15px] leading-tight')}>
                      {kmWords(km)}
                    </button>
                  ))}
                </div>
                <SaidLine said={said} goRef={setGo} />
              </>
            ) : (
              <>
                {/* The parcel's label is the card's title to see; this names the board for a reader. */}
                <h2 id="am-step" className="sr-only">
                  Fly the post
                </h2>
                {/* The clue on top — but under the map on a short split screen, where it sits by Deliver (the card's compact). */}
                <ClueTag job={job} className={beside ? undefined : 'split:[@media(max-height:500px)]:hidden'} />
                {beside ? (
                  // Beside the map: the compass with Deliver by it, what Pidge said under them — on a short screen beside
                  // the compass, or under the map where there's room (on a split one, only in her bubble: there's no room,
                  // and it's in sight beside the board).
                  <>
                    <div className="flex items-stretch gap-2">
                      <Compass dirs={dirs} at={at} job={job} onFly={fly} />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <DeliverButton onDeliver={deliver} tall={saidUnder ? 'full' : true} />
                        {!saidUnder && <SaidLine said={said} goRef={setGo} fallback={where} className="hidden [@media(max-height:500px)]:block split:[@media(max-height:500px)]:hidden" />}
                      </div>
                    </div>
                    <SaidLine said={said} goRef={setGo} fallback={where} className="[@media(max-height:500px)]:hidden" />
                  </>
                ) : (
                  // Under it: the clue, what Pidge said and Deliver, the compass beside them (thumb's side) — on a short split
                  // screen without what she said (it's in her bubble), so the map has the room.
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <ClueTag job={job} className="hidden split:[@media(max-height:500px)]:flex" copy />
                      <SaidLine said={said} goRef={setGo} fallback={where} className="split:[@media(max-height:500px)]:hidden" />
                      <DeliverButton onDeliver={deliver} />
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
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] split:col-start-2 split:row-span-2 split:row-start-1 split:overflow-y-auto split:border-l-4 split:p-4"
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={stamp.name.toUpperCase()} ready={step === 'done'} icon={<StampCard id={job.stamp} size={44} />} id="am-job">
              {jobWords(job)}
            </Ticket>
          </div>
          <Album known={known} read={read} onRead={(id) => settled() && setRead(id)} />
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

/** Deliver: here, where Ember is. Beside the compass, as tall as it (`full`: on a short screen too). */
function DeliverButton({ onDeliver, tall = false }: { onDeliver: () => void; tall?: boolean | 'full' }) {
  return (
    <button
      type="button"
      onClick={onDeliver}
      aria-describedby="am-clue"
      className={cn(
        goldClass,
        'min-h-12 text-lg leading-tight [@media(max-height:500px)]:text-base',
        // Beside the compass, as tall as it — but for what Pidge said under it, on a short phone held sideways.
        tall && 'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2',
        tall === true && '[@media(max-height:500px)]:flex-none split:[@media(max-height:500px)]:flex-1',
      )}
    >
      <span aria-hidden="true">📬</span> Deliver
    </button>
  );
}

/** The parcel's label: its stamp and where it's going — on Gentle, the place's picture. */
function ClueTag({ job, className, copy = false }: { job: Job; className?: string; copy?: boolean }) {
  return (
    <p className={cn('flex items-center gap-2.5 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[15px] font-bold leading-snug text-[#1b0f22] shadow-[0_3px_0_#1b0f22] [@media(max-height:500px)]:text-[14px]', className)}>
      {job.map !== 'bay' && <StampCard id={job.stamp} size={30} />}
      {job.map === 'bay' && (
        <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-md border-2 border-[#1b0f22] bg-[#8cc277] text-2xl">
          {PLACES[job.to].emoji}
        </span>
      )}
      {/* The one Deliver's described by (a second, for a short split screen's compact card, isn't named). */}
      <span id={copy ? undefined : 'am-clue'}>{clueWords(job)}</span>
    </p>
  );
}

/** The compass: a button a direction (four or eight round Ember's square), each flying her one square that way. */
function Compass({ dirs, at, job, onFly }: { dirs: readonly Dir[]; at: Cell; job: Job; onFly: (d: Dir) => void }) {
  const ARROW: Record<Dir, string> = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
  const SPOT: Record<Dir, string> = { NW: 'col-start-1 row-start-1', N: 'col-start-2 row-start-1', NE: 'col-start-3 row-start-1', W: 'col-start-1 row-start-2', E: 'col-start-3 row-start-2', SW: 'col-start-1 row-start-3', S: 'col-start-2 row-start-3', SE: 'col-start-3 row-start-3' };
  return (
    <div role="group" aria-label="The compass" className="grid flex-none grid-cols-[repeat(3,2.75rem)] grid-rows-[repeat(3,2.75rem)] gap-1">
      {dirs.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onFly(d)}
          aria-label={`Fly ${DIR_WORDS[d]}`}
          className={cn(outlineClass, 'flex flex-col items-center justify-center border-2 p-0 leading-none', d === 'N' && 'border-amber-300', SPOT[d])}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {ARROW[d]}
          </span>
          <span aria-hidden="true" className={cn('text-[11px] font-black leading-none', d === 'N' ? 'text-amber-200' : 'text-[#c9c5f2]')}>
            {d}
          </span>
        </button>
      ))}
      <span aria-hidden="true" className="col-start-2 row-start-2 flex flex-col items-center justify-center rounded-full bg-[#1b0f22] text-base leading-none">
        🐉
        {job.map === 'town' && <span className="mt-0.5 text-[10px] font-black text-amber-200">{gridRef(at)}</span>}
      </span>
    </div>
  );
}

/** The colours of the world map's continents and oceans. */
const REGION_FILL: Record<RegionId, string> = {
  'north-america': '#e9a23b',
  'south-america': '#d97aa6',
  europe: '#a48ee0',
  africa: '#e6c24a',
  asia: '#72c46e',
  australia: '#e58a5a',
  antarctica: '#eef5f8',
  pacific: '#3d7fb8',
  atlantic: '#3d7fb8',
  indian: '#3d7fb8',
  arctic: '#a8cde3',
};
/** Where each region's name sits on the world map (in squares, its middle). */
const REGION_LABEL: Record<RegionId, [number, number]> = {
  'north-america': [3, 1.2],
  'south-america': [4, 3.6],
  europe: [6.5, 1],
  africa: [6.6, 2.9],
  asia: [9.5, 1],
  australia: [10.5, 3.9],
  antarctica: [6, 5.5],
  pacific: [1, 3],
  atlantic: [5, 1.5],
  indian: [8.6, 4],
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
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * The map: its squares (sea and land, places and houses — on Tricky the
 * world's continents and oceans, named, the equator across it), Ember on
 * hers, and her route drawn. The arrow keys fly her (the compass has every
 * direction); a reader hears where she is.
 */
const MapView = forwardRef<HTMLDivElement, MapViewProps>(function MapView({ job, path, size, bump, still, done, where, onKey }, ref) {
  const { w, h } = mapOf(job);
  const at = path[path.length - 1];
  const grid: GridMap | null = job.map === 'bay' ? BAY : job.map === 'town' ? TOWN : null;
  const town = job.map === 'town';
  const cell = size ? size / w : null;
  // Under 28 px a square, the world's names are short and only the biggest ocean's named (they ran into each other).
  const small = cell !== null && cell < 28;
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
          aria-describedby="am-where"
          tabIndex={-1}
          onKeyDown={onKey}
          className="relative w-full select-none overflow-hidden rounded-md border-4 border-[#1b0f22] outline-none focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ aspectRatio: `${w} / ${h}` }}
        >
          {/* Shaken when Ember bumps the edge (keyed, so each bump shakes; the map itself keeps its focus). */}
          <div key={bump} className={cn('absolute inset-0', bump > 0 && !still && 'cg-shake')}>
            {Array.from({ length: h }, (_, y) =>
              Array.from({ length: w }, (_, x) => {
                const here = grid ? placeAt(grid, { x, y }) : null;
                const fill = grid ? (grid.sea[y][x] === '~' ? '#3d7fb8' : '#8cc277') : REGION_FILL[regionAt({ x, y }).id];
                return (
                  <span
                    key={`${x},${y}`}
                    aria-hidden="true"
                    className="absolute flex items-center justify-center border border-black/15"
                    style={{ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%`, width: `${100 / w}%`, height: `${100 / h}%`, background: fill, fontSize: cell ? cell * 0.55 : undefined }}
                  >
                    {here === 'house' ? '🏠' : here ? PLACES[here].emoji : ''}
                  </span>
                );
              }),
            )}
            {job.map === 'world' && (
              <>
                <span aria-hidden="true" className="absolute inset-x-0 border-t-2 border-dashed border-white/90" style={{ top: `${(EQUATOR_ROW / h) * 100}%` }} />
                <span aria-hidden="true" className="absolute left-1 rounded bg-[#1b0f22]/70 px-1 text-[10px] font-bold leading-tight text-white" style={{ top: `calc(${(EQUATOR_ROW / h) * 100}% + 2px)` }}>
                  Equator
                </span>
                {REGIONS.filter((r) => !small || !r.ocean || r.id === 'pacific').map((r) => (
                  <span
                    key={r.id}
                    aria-hidden="true"
                    className={cn('pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold leading-none', r.ocean ? 'italic text-white' : 'text-[#1b0f22]')}
                    style={{ left: `${(REGION_LABEL[r.id][0] / w) * 100}%`, top: `${(REGION_LABEL[r.id][1] / h) * 100}%`, fontSize: cell ? Math.max(9, Math.min(13, cell * 0.36)) : 11 }}
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
              aria-hidden="true"
              className={cn('absolute flex items-center justify-center', !still && 'transition-[left,top] duration-200')}
              style={{ left: `${(at.x / w) * 100}%`, top: `${(at.y / h) * 100}%`, width: `${100 / w}%`, height: `${100 / h}%` }}
            >
              <span
                className={cn('flex aspect-square w-[86%] items-center justify-center rounded-full border-2 border-[#1b0f22] bg-amber-300 shadow-[0_0_0_2px_#fff]', done && 'bg-emerald-400')}
                style={{ fontSize: cell ? cell * 0.5 : undefined }}
              >
                🐉
              </span>
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
        <p aria-hidden="true" className="flex w-full items-center justify-between gap-2 text-[12px] font-bold text-[#c9e3f2]">
          <span>N ↑</span>
          <span>1 square ≈ {kmWords(KM_PER_SQUARE)}</span>
        </p>
      )}
      <p id="am-where" className="sr-only">
        {where}
      </p>
    </div>
  );
});
MapView.displayName = 'MapView';

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

/** Pidge's stamp album: a stamp per kind of post delivered; tapped, read out — by Pidge, and under the album. */
function Album({ known, read, onRead }: { known: (id: StampId) => boolean; read: StampId | null; onRead: (id: StampId) => void }) {
  const count = STAMPS.filter((s) => known(s.id)).length;
  const reading = read ? STAMP_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
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
      <ul className="grid grid-cols-3 gap-1.5">
        {STAMPS.map((s) => (
          <li key={s.id}>
            {known(s.id) ? (
              <button
                type="button"
                onClick={() => onRead(s.id)}
                aria-pressed={read === s.id}
                aria-label={`${s.name}. Read the stamp`}
                className={cn('flex h-[84px] w-full flex-col items-center justify-center gap-1 rounded border-[3px] bg-[#fff6dc] px-1 hover:bg-white', read === s.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
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

