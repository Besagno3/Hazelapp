import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  BAND_DIRS,
  BAY,
  CITY_BY_ID,
  DIR_WORDS,
  EQUATOR_ROW,
  GLOBE_START,
  JOBS_PER_ROUND,
  KM_PER_SQUARE,
  PLACES,
  REGIONS,
  STAMPS,
  STAMP_BY_ID,
  TOWN,
  WORLD_START,
  WORLD_W,
  capitalise,
  clockWords,
  clueWords,
  cityHour,
  delivered,
  destWords,
  farChoices,
  farSeed,
  bandWords,
  globeRegionAt,
  keepRanges,
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
  rulerTo,
  squaresAway,
  targetWords,
  timeAsk,
  timeChoices,
  timeWords,
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
import { noRepeat } from '../keys';
import { lastInputWasKey } from '../lastInput';
import { useLiftTap } from '../useLiftTap';
import { useSettled } from '../useSettled';
import { StampCard } from './art';
import { GLOBE_LAT_ROWS, GUTTER, SCALE_LINE, fitMap, globeLabels, latLabel, longLabel, type Fit } from './layout';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Flying the post; on Tricky, how far she flew; on Expert, what time it is there; the stamp's card. */
type Step = 'fly' | 'far' | 'time' | 'done';

/** Pidge once a parcel's delivered, in turn; on Expert, plainly (§8.3). */
// Praise for care, not speed: there's no timer (UX review round 2: "the fastest post").
const RIGHT_LINES = ['Coo! Right on target!', 'Delivered — and not a feather out of place!', 'The finest post-dragon in Port Lantern!'];
const EXPERT_RIGHT_LINES = ['Delivered.', 'Right square, right time.', 'Right.'];

/** Expert's grid's labels: the latitudes up the map's side, the longitudes under it (px). */
const LAT_GUTTER = 34;
const LONG_ROW = 16;

/**
 * A split screen (the board beside the side panel), as the `wide` screen: from
 * 768 px wide and over 500 px high, or from 1000 px wide — not, as the stage's
 * `split`, a phone held sideways from 640: there the side panel left the
 * world's map 176 × 88 px (UX review round 1), and at 844 × 390, the way most
 * phones are held for a game, 290 × 145 (UX review round 2); the board takes
 * the screen's width, the side panel under it, as at 568 × 320.
 */
const SPLIT = '(min-width: 768px) and (min-height: 501px), (min-width: 1000px)';

/**
 * Where the step's card goes and how big the map is (`fitMap`), measured:
 * on a split screen in the board's room, on a phone in the screen's height
 * under the header. Null where it can't be measured (tests): the map takes the
 * width.
 */
function useMapLayout(page: RefObject<HTMLDivElement | null>, board: RefObject<HTMLElement | null>, ratio: number, gutter: number, under: number, done: boolean, parcel: number) {
  const [layout, setLayout] = useState<Fit | null>(null);
  // The clue's height as last measured under the map — a stamp's card has none, and the map mustn't change size as it comes
  // (bench: Next went under the fold on a phone); beside it, it's narrower and taller (UX review round 2: 26 px too much).
  const clueH = useRef(50);
  const beside = useRef(false);
  useLayoutEffect(() => {
    const p = page.current;
    const b = board.current;
    if (!p || !b || typeof ResizeObserver === 'undefined' || !window.matchMedia) return;
    const fit = () => {
      const cs = getComputedStyle(b);
      const px = (v: string) => parseFloat(v) || 0;
      const split = window.matchMedia(SPLIT).matches;
      const measured = b.querySelector('[data-clue]')?.getBoundingClientRect().height;
      if (measured && !beside.current) clueH.current = measured;
      const next = fitMap({
        w: b.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
        h: (split ? b.clientHeight : window.innerHeight - p.getBoundingClientRect().top) - px(cs.paddingTop) - px(cs.paddingBottom),
        split,
        screenH: window.innerHeight,
        clue: clueH.current,
        ratio,
        gutter,
        under,
        done,
      });
      beside.current = next.beside;
      // The same fit again changes nothing (code review round 2: each new object re-rendered the game).
      setLayout((was) => (was && (Object.keys(next) as (keyof Fit)[]).every((k) => was[k] === next[k]) ? was : next));
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
  // Expert (§8.5): latitude and longitude on a 15° grid, and time zones.
  const expert = band === 'expert';
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
  const [saidSr, setSaidSr] = useState<string | null>(null);
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
  // Expert's seal (§8.3): delivered at the first Deliver and the time right first; the first missed parcel's lesson.
  const [missed, setMissed] = useState(false);
  const [spotOn, setSpotOn] = useState(0);
  const missedLesson = useRef<string | null>(null);
  const known = (id: StampId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger —
  // and after a wrong delivery (code review round 2: a double tap on Deliver skipped the "how to find it" hint).
  const settled = useSettled(`${step}:${done}:${misses}`);
  // A tap waits; a key acts at once (Expert's time).
  const ready = (e: { detail: number }) => e.detail === 0 || settled();
  const at = path[path.length - 1];
  // `sr`: words for a reader only, after what's said (Expert's square's lines).
  function say(words: string | null, sr: string | null = null) {
    setSaid(words);
    setSaidSr(sr);
    setBeat((b) => b + 1);
  }

  /**
   * One square on with the compass; off the map's edge, a bump and a word. A tap waits as a step starts; a key acts at
   * once (Expert's UX review round 1: an arrow key as a parcel started went nowhere, unsaid).
   */
  function fly(dir: Dir, key = false) {
    if (step !== 'fly' || (!key && !settled())) return;
    setRead(null);
    const to = move(job, at, dir);
    if (!to) {
      // A soft bump, not a "wrong" (UX review round 2: a buzz and a shake was the harshest thing in the game).
      sfx('block');
      setBump((n) => n + 1);
      if (job.map === 'world' || job.map === 'globe') say(`That’s the ${dir.startsWith('N') ? 'top' : 'bottom'} of the world — Ember can’t fly any further ${DIR_WORDS[dir]}${expert ? '.' : '!'}`);
      else say('Ember can’t fly off the edge of the map — try another way.');
      return;
    }
    sfx('select');
    setPath((p) => [...p, to]);
    setRoute((r) => [...r, dir]);
    const wrapped = (job.map === 'world' || job.map === 'globe') && Math.abs(to.x - at.x) > 1 ? ` Round the back of the world${expert ? '.' : '!'}` : '';
    // On Gentle, there: what to do now (UX review round 2: no nudge — the youngest's lesson is the way, not finding Deliver).
    const there = job.map === 'bay' && delivered(job, to) ? ' Now tap Deliver!' : '';
    // Expert's: the way and the continent or ocean, its lines for a reader only — read off the grid, not the words (UX review
    // round 1: flown east till the words held 140° E, the grid needn't be read).
    if (job.map === 'globe') return void say(`${capitalise(DIR_WORDS[dir])}.${wrapped} Ember’s over ${globeRegionAt(to).name}.`, `${bandWords(to).lat}, ${bandWords(to).long}.`);
    say(`${capitalise(DIR_WORDS[dir])}${expert ? '.' : '!'}${wrapped} Ember’s ${whereWords(job, to)}.${there}`);
  }

  /** A square on the map tapped: next to Ember (a way the compass has), she flies there; else, how to fly her (UX review round 1: a tap did nothing). */
  function tapSquare(c: Cell) {
    if (step !== 'fly' || !settled()) return;
    // Her words over a stamp being read (code review round 2: the stamp's note kept the bubble).
    setRead(null);
    if (c.x === at.x && c.y === at.y) {
      say(`That’s Ember${expert ? '.' : '!'} Tap the compass arrows to fly her.`);
      return;
    }
    const d = dirs.find((k) => {
      const to = move(job, at, k);
      return to !== null && to.x === c.x && to.y === c.y;
    });
    if (d) fly(d);
    // A corner on a four-way compass is next to her too (UX and code review round 2: it was told to tap one next to her).
    else if (dirs.length === 4 && Math.abs(c.y - at.y) === 1 && (Math.abs(c.x - at.x) === 1 || (map.wraps && Math.abs(c.x - at.x) === map.w - 1)))
      say('No corners on this compass — north, east, south or west, one square at a time.');
    else say(`Ember flies one square at a time — tap a square next to her, or the compass: ${dirs.map((k) => DIR_WORDS[k]).join(', ')}.`);
  }

  function deliver() {
    if (step !== 'fly' || !settled()) return;
    setRead(null);
    if (!delivered(job, at)) {
      sfx('wrong');
      say(missWords(job, at, misses + 1, route.length > 0));
      setMisses((m) => m + 1);
      setMissed(true);
      return;
    }
    sfx('chest');
    // Expert: what time it is there (§8.5) — asked in the card and Pidge's bubble.
    if (job.map === 'globe') {
      say(null);
      setStep('time');
      return;
    }
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
    const n = squaresAway(job);
    if (km !== n * KM_PER_SQUARE) {
      sfx('wrong');
      say(`Not quite: it’s ${n} ${n === 1 ? 'square' : 'squares'} in a straight line, and each counts as about ${kmWords(KM_PER_SQUARE)} — so ${n} × ${KM_PER_SQUARE.toLocaleString('en-GB')}.`);
      return;
    }
    sfx('chest');
    finish();
  }

  /** Expert: the time there, picked — a wrong one says what's wrong with it, and stays to pick again. */
  function pickTime(h: number, e: { detail: number }) {
    if (step !== 'time' || job.map !== 'globe' || !ready(e)) return;
    setRead(null);
    if (h !== cityHour(job)) {
      sfx('wrong');
      setMissed(true);
      say(timeWords(job, h));
      return;
    }
    sfx('chest');
    finish(timeWords(job, h));
  }

  /** The parcel's card (`why`: what Pidge says of it first, on Expert the time worked out). */
  function finish(why: string | null = null) {
    const lesson = learnedLine(job, route);
    setNewPage(onPage(job.stamp, stamp.name));
    setLessons((l) => [...l, lesson]);
    setRights((n) => n + 1);
    if (expert && !missed) setSpotOn((n) => n + 1);
    if (expert && missed) missedLesson.current ??= lesson;
    setSaid(why);
    setStep('done');
  }

  function next(e: { detail: number }) {
    if (step !== 'done' || !ready(e)) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'The sack’s empty!', learned: (expert && missedLesson.current) || (lessons[lessons.length - 1] ?? ''), spotOn: expert ? { right: spotOn, of: JOBS_PER_ROUND } : undefined });
      return;
    }
    const j = jobFor(band, round, done + 1, queue);
    setDone((n) => n + 1);
    setStep('fly');
    setPath([mapOf(j).start]);
    setRoute([]);
    setSaid(null);
    setMisses(0);
    setMissed(false);
    setNewPage(false);
  }

  // Focus where each step starts: the map (described by where Ember is; the arrow keys fly her); the distance question; the
  // stamp's card.
  const mapRef = useRef<HTMLDivElement>(null);
  const farHead = useRef<HTMLHeadingElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else if (step === 'far' || step === 'time') farHead.current?.focus({ preventScroll: true });
    else mapRef.current?.focus({ preventScroll: true });
  }, [step, done]);

  // As each step starts, on a phone the page scrolls back to the board's top, as far as the card's last line allows (a
  // parcel delivered: at least to its Next); on a split screen the side panel's back at its top (Pidge), the card at its —
  // but a stamp just stuck in brought into its sight (the album's own scroll was undone by this one: code and UX review
  // round 2).
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
    const fresh = step === 'done' && newPage ? side.current?.querySelector(`[data-stamp="${job.stamp}"]`) : null;
    if (fresh) fresh.scrollIntoView?.({ block: 'nearest', behavior });
    else side.current?.scrollTo?.({ top: 0, behavior });
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
  // Room beside the map for its labels: the town's numbers, Expert's latitudes; under it, the town's letters, the world's scale,
  // Expert's longitudes.
  const gutter = job.map === 'town' ? GUTTER : job.map === 'globe' ? LAT_GUTTER : 0;
  const layout = useMapLayout(page, board, ratio, gutter, job.map === 'town' ? GUTTER : job.map === 'world' ? SCALE_LINE : job.map === 'globe' ? LONG_ROW : 0, step === 'done', done);
  const beside = layout?.beside ?? false;
  const saidUnder = layout?.saidUnder ?? false;
  const stack = layout?.stack ?? false;

  // A wrong delivery: what Pidge said brought into sight, if it's under the fold (bench: at 320 × 568, its last lines were) —
  // with Deliver over it (the bench: at 740 × 360, the line alone scrolled Deliver off the top).
  useEffect(() => {
    if (misses) goRef.current?.parentElement?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
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

  const cheerLine = expert
    ? `${missed ? 'Delivered, with a miss on the way.' : EXPERT_RIGHT_LINES[(rights - 1 + EXPERT_RIGHT_LINES.length) % EXPERT_RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Next parcel.' : 'That’s the last one.'}`
    : `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Next parcel?' : 'The sack’s empty!'}`;
  // Tricky's question: how far the place is from where the post set off, in a straight line — its ruler drawn on the map —
  // whichever way Ember flew (UX review rounds 1 and 2). Pidge just asks: the card has it all, and the heading's described
  // by it (UX review round 2: a reader heard it twice).
  const away = job.map === 'world' ? squaresAway(job) : 0;
  const farAsk = 'Delivered! Now, by the map’s scale: about how far is it?';
  let line: string;
  if (read) line = `${STAMP_BY_ID[read].name}: ${STAMP_BY_ID[read].note}`;
  // Expert's: the time worked out, then the cheer.
  else if (step === 'done') line = said ? `${said} ${cheerLine}` : cheerLine;
  else if (said) line = said;
  else if (step === 'far') line = farAsk;
  // The card has it all, the heading's described by it (UX review round 1: a reader heard it twice).
  else if (step === 'time' && job.map === 'globe') line = `Delivered. What time is it in ${CITY_BY_ID[job.to].name}?`;
  else line = openingWords(job);
  // A zero-width space, every other time: the same words said again are read again.
  if (beat % 2) line += '\u200b';

  const chips = job.map === 'world' ? ['Steer Ember', 'Deliver', 'How far?'] : job.map === 'globe' ? ['Find the square', 'Deliver', 'What time?'] : ['Read the parcel', 'Steer Ember', 'Deliver'];
  // Steering till it's delivered (UX review round 2: a square flown ticked "Steer Ember" done).
  const chipAt = step === 'done' ? 3 : step === 'far' || step === 'time' ? 2 : job.map === 'world' || job.map === 'globe' ? 0 : 1;
  const where = `Ember is ${whereWords(job, at)}.`;
  // For a reader (the map's squares are pictures): where the place is, as a kid sees it (code review round 1: only a wrong
  // delivery said it) — the world's only once a wrong delivery's named it (UX review round 2).
  const target = targetWords(job, at, misses);
  // By the map till the first move: how to find the place (UX review round 1: on a phone, it was below the fold).
  const fallback = route.length || misses ? (job.map === 'globe' ? `Ember is over ${globeRegionAt(at).name}.` : where) : howToFind(job);

  // The post office scene over the board — not for the world's maps, wide and short, nor on a tablet held upright (UX review
  // round 2: at 1024 × 768 it left the world 310 px wide; as Index's Timeline leaves it out there; Expert's review round 1:
  // its globe 297 px).
  const scene = job.map === 'bay' || job.map === 'town';
  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto wide:overflow-hidden">
      <div
        className={cn(
          'grid flex-none grid-cols-1 wide:min-h-0 wide:flex-1 wide:grid-cols-[minmax(0,1fr)_300px] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] wide:[@media(max-height:500px)]:grid-cols-[minmax(400px,1fr)_minmax(0,260px)]',
          scene
            ? 'wide:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] wide:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] wide:[@media(orientation:portrait)]:grid-rows-[minmax(0,1fr)]'
            : 'wide:grid-rows-[minmax(0,1fr)]',
        )}
      >
        {scene && (
          <div aria-hidden="true" className="relative hidden overflow-hidden wide:col-start-1 wide:row-start-1 wide:block [@media(max-height:700px)]:hidden wide:[@media(orientation:portrait)]:hidden">
            <PostOffice cheer={step === 'done'} />
          </div>
        )}

        {/* The map, and the step's card beside it or under it — whichever lets the map be bigger: the clue, the compass and
            Deliver always by the map. */}
        <section
          ref={board}
          aria-labelledby="am-step"
          className={cn(
            'flex gap-2 bg-[#14324a] p-2 wide:col-start-1 wide:min-h-0 wide:border-[#1b0f22] wide:p-4 wide:[@media(max-height:500px)]:p-2',
            scene
              ? 'wide:row-start-2 wide:border-t-4 wide:[@media(max-height:700px)]:row-start-1 wide:[@media(max-height:700px)]:border-t-0 wide:[@media(orientation:portrait)]:row-start-1 wide:[@media(orientation:portrait)]:border-t-0'
              : 'wide:row-start-1',
            beside ? 'flex-row' : 'flex-col',
          )}
        >
          <div className={cn('flex flex-none flex-col items-center', beside ? 'wide:justify-center' : '')}>
            <MapView
              ref={mapRef}
              job={job}
              path={path}
              size={layout?.size ?? null}
              bump={bump}
              still={still}
              done={step !== 'fly'}
              ruler={step !== 'fly' && job.map === 'world'}
              where={where}
              target={target}
              first={done === 0}
              onTap={tapSquare}
              onKey={(e) => {
                const key: Partial<Record<string, Dir>> = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' };
                const d = key[e.key];
                if (!d) return;
                e.preventDefault();
                // Held down, one square: its repeats fly nowhere (code review round 1: five squares, round the world).
                if (!e.repeat) fly(d, true);
              }}
            />
            {saidUnder && step === 'fly' && layout && <SaidLine said={said} goRef={setGo} fallback={fallback} className="mt-2" width={layout.size} />}
          </div>

          <div
            ref={card}
            className={cn(
              windowClass,
              'flex min-w-0 flex-col gap-2.5 p-3 [&>*]:flex-none wide:min-h-0 wide:overflow-y-auto [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:p-2.5',
              beside ? 'flex-1' : 'wide:flex-1',
            )}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:700px)]:hidden">
              Parcel {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                {/* Focused from script, no ring (as the other games' — code review round 1). */}
                <h2 id="am-step" ref={doneHead} tabIndex={-1} aria-describedby="am-fact" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white focus:outline-none [@media(max-height:500px)]:text-[20px]')}>
                  {stamp.name} delivered{expert ? '.' : '!'}
                </h2>
                {/* Pidge's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 wide:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                {/* 14 px at least, 13 on the shortest screens (UX review round 2: 13 px for a 6-year-old with room to spare). */}
                <p id="am-fact" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1 [@media(min-height:341px)_and_(max-height:500px)]:text-[14px] [@media(max-height:340px)]:text-[13px]">
                  {lessons[lessons.length - 1]}
                  {/* Said to a reader only on a split screen over 500 px high: the album's in sight beside the board (bench: at
                      640 × 360 the card's heading went out of view; UX review round 2: at 1100 × 480 the album wasn't). */}
                  {newPage && ' '}
                  {newPage && <span className="wide:[@media(min-height:501px)]:sr-only">The {stamp.name.toLowerCase()} stamp is in the album{expert ? '.' : '!'}</span>}
                </p>
                <button ref={setGo} type="button" onClick={next} onKeyDown={noRepeat} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:text-base')}>
                  {done + 1 < JOBS_PER_ROUND ? 'Next parcel' : expert ? 'Finish the round' : 'All delivered!'}
                </button>
              </>
            ) : step === 'time' && job.map === 'globe' ? (
              <>
                {/* Expert (§8.5): what time it is there, by its time zone — the 15° line nearest its longitude. */}
                <h2 id="am-step" ref={farHead} tabIndex={-1} aria-describedby="am-far" className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none focus:outline-none [@media(max-height:500px)]:text-[19px]')}>
                  What time is it?
                </h2>
                <p id="am-far" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  {/* Why 15° is an hour (UX review round 1: the rule was said, never why). */}
                  {timeAsk(job)} The Earth turns 360° in 24 hours, so each 15° of longitude is an hour: ahead to the east, behind to the west.
                </p>
                {/* Four in a row (review round 1: in two, the last was under a short screen's foot at 568 × 320). */}
                <div ref={setGo} role="group" aria-label={`What time is it in ${CITY_BY_ID[job.to].name}?`} className="grid grid-cols-4 gap-1.5">
                  {timeChoices(job).map((h) => (
                    <button key={h} type="button" onClick={(e) => pickTime(h, e)} onKeyDown={noRepeat} className={cn(outlineClass, 'min-h-12 whitespace-nowrap border-2 px-0.5 text-[16px] leading-tight [@media(max-height:500px)]:min-h-11')}>
                      {clockWords(h)}
                    </button>
                  ))}
                </div>
                {/* After a wrong time only, under the times: they never move. */}
                {said && <SaidLine said={said} goRef={setGo} />}
              </>
            ) : step === 'far' ? (
              <>
                <h2 id="am-step" ref={farHead} tabIndex={-1} aria-describedby="am-far" className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none focus:outline-none [@media(max-height:500px)]:text-[19px]')}>
                  How far?
                </h2>
                <p id="am-far" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  On this map each square counts as about <b>{kmWords(KM_PER_SQUARE)}</b>. From Europe to {destWords(job)} is about <b>{away}</b> {away === 1 ? 'square' : 'squares'} in a straight line (the
                  ruler on the map){route.length > away ? `; Ember flew ${route.length}` : ''}.
                </p>
                <div ref={setGo} role="group" aria-label="About how far?" className="grid grid-cols-3 gap-2">
                  {farChoices(away, farSeed(job, round)).map((km) => (
                    <button key={km} type="button" onClick={() => far(km)} onKeyDown={noRepeat} className={cn(outlineClass, 'min-h-12 whitespace-nowrap border-2 px-1 text-[15px] leading-tight')}>
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
                <ClueTag job={job} parcel={done} className={beside ? undefined : 'wide:[@media(max-height:500px)]:hidden'} />
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
                        {!saidUnder && <SaidLine said={said} goRef={setGo} fallback={fallback} className="hidden [@media(max-height:500px)]:block wide:[@media(max-height:500px)]:hidden" />}
                      </div>
                    </div>
                    <SaidLine said={said} goRef={setGo} fallback={fallback} className="[@media(max-height:500px)]:hidden" />
                  </>
                ) : (
                  // Under it: the clue, Deliver and what Pidge said, the compass beside them (thumb's side) — Deliver first, so
                  // a long line can't push it under the fold (UX review round 1: after a miss, at 320 × 568) — on a short
                  // split screen without what she said (it's in her bubble), so the map has the room. The compass first for
                  // the keyboard, as beside the map (UX review round 2); Deliver over it where the column's too narrow for its
                  // word (code review round 2: at 280 px wide it ran into the compass).
                  <>
                    {layout?.narrow && <DeliverButton onDeliver={deliver} />}
                    <div className="flex flex-row-reverse items-start gap-3">
                      <Compass dirs={dirs} at={at} job={job} onFly={fly} />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <ClueTag job={job} parcel={done} className="hidden wide:[@media(max-height:500px)]:flex" copy />
                        {!layout?.narrow && <DeliverButton onDeliver={deliver} />}
                        <SaidLine said={said} goRef={setGo} fallback={fallback} className="wide:[@media(max-height:500px)]:hidden" />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </section>

        <aside
          ref={side}
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] wide:col-start-2 wide:row-span-2 wide:row-start-1 wide:overflow-y-auto wide:border-l-4 wide:p-4"
        >
          <HostBubble
            npcId={def.host}
            line={
              <>
                {keepRanges(line)}
                {saidSr && said && !read && step === 'fly' && <span className="sr-only"> {saidSr}</span>}
              </>
            }
            phoneStrip
          />
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={stamp.name.toUpperCase()} ready={step === 'done'} icon={<StampCard id={job.stamp} size={44} />} id="am-job">
              {jobWords(job)}
            </Ticket>
          </div>
          {/* The bay's and the town's: their places' pictures (Expert's review round 1: on the globe, a town's key). */}
          {(job.map === 'bay' || job.map === 'town') && <MapKey map={job.map === 'bay' ? BAY : TOWN} />}
          <Album known={known} read={read} fresh={step === 'done' && newPage ? job.stamp : null} onRead={(id) => settled() && setRead(id)} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 wide:flex [@media(max-height:500px)]:hidden">
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
        // 14 px at least, 13 on the shortest screens (UX review round 2: 12 px, with room to spare).
        'min-h-[4.1rem] rounded-md bg-[#24215a] px-2.5 py-1.5 text-[15px] leading-snug [@media(max-height:500px)]:min-h-[3.4rem] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:leading-tight [@media(min-height:341px)_and_(max-height:500px)]:text-[14px] [@media(max-height:340px)]:text-[13px]',
        said ? 'font-bold text-white' : 'text-[#e4e1ff]',
        className,
      )}
    >
      {keepRanges(said ?? fallback ?? '')}
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
function Compass({ dirs, at, job, onFly }: { dirs: readonly Dir[]; at: Cell; job: Job; onFly: (d: Dir, key: boolean) => void }) {
  const ARROW: Record<Dir, string> = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
  const SPOT: Record<Dir, string> = { NW: 'col-start-1 row-start-1', N: 'col-start-2 row-start-1', NE: 'col-start-3 row-start-1', W: 'col-start-1 row-start-2', E: 'col-start-3 row-start-2', SW: 'col-start-1 row-start-3', S: 'col-start-2 row-start-3', SE: 'col-start-3 row-start-3' };
  return (
    // 52 px buttons where the screen's over 600 px high (UX review round 1: the main control was the smallest thing on screen).
    <div role="group" aria-label="The compass" className="grid flex-none grid-cols-[repeat(3,2.75rem)] grid-rows-[repeat(3,2.75rem)] gap-1 [@media(min-height:601px)]:grid-cols-[repeat(3,3.25rem)] [@media(min-height:601px)]:grid-rows-[repeat(3,3.25rem)]">
      {dirs.map((d) => (
        <button
          key={d}
          type="button"
          onClick={(e) => onFly(d, e.detail === 0)}
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
/** Where each region's name sits on Expert's world map, in its squares — on its own region, clear of the equator and London. */
const GLOBE_LABEL: Record<RegionId, [number, number]> = {
  'north-america': [5.5, 2.5],
  'south-america': [7.8, 6.6],
  europe: [13.6, 1.5],
  africa: [13, 4.5],
  asia: [19, 1.5],
  australia: [21, 7.6],
  antarctica: [6, 11.5],
  pacific: [2, 7.3],
  atlantic: [9.5, 4],
  indian: [16.5, 8.4],
  arctic: [17, 0.5],
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
  // Its far-left square: by Europe, "Arctic" ran into "Europe" (UX review round 2).
  arctic: [0.55, 0.5],
};

interface MapViewProps {
  job: Job;
  path: readonly Cell[];
  /** The squares' width, px (null: not measured — the width of the column). */
  size: number | null;
  bump: number;
  still: boolean;
  done: boolean;
  /** "How far?" and after: the ruler from where the post set off to the place, straight (UX review round 2). */
  ruler: boolean;
  where: string;
  /** For a reader: where the parcel's going. */
  target: string;
  /** The round's first parcel: the map's described by the clue too (later, Pidge's opening's just said it: UX review round 2). */
  first: boolean;
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
const MapView = forwardRef<HTMLDivElement, MapViewProps>(function MapView({ job, path, size, bump, still, done, ruler, where, target, first, onTap, onKey }, ref) {
  const { w, h } = mapOf(job);
  const at = path[path.length - 1];
  const grid: GridMap | null = job.map === 'bay' ? BAY : job.map === 'town' ? TOWN : null;
  const town = job.map === 'town';
  const globe = job.map === 'globe';
  const world = job.map === 'world' || globe;
  // Expert's world in 15° squares, each its region on the world map; its equator the 6th row's foot.
  const regionOf = globe ? globeRegionAt : regionAt;
  const equator = globe ? EQUATOR_ROW * 2 : EQUATOR_ROW;
  const start = globe ? GLOBE_START : WORLD_START;
  const k = globe ? 2 : 1;
  // Room beside the map for its labels (the town's numbers, Expert's latitudes).
  const side = town ? GUTTER : globe ? LAT_GUTTER : 0;
  const cell = size ? size / w : null;
  // Under 28 px a square, the world's names are short (they ran into each other) — but all there (UX review round 1).
  const small = cell !== null && cell < 28;
  // Its frame from the keyboard only: a Tab in, a key, or a key's press that started the round (UX review round 1: after
  // "Let's fly!" pressed with a mouse, a dashed frame; code review round 2: pressed with Enter, none).
  const [keys, setKeys] = useState(lastInputWasKey);
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
  const label = job.map === 'bay' ? 'The map of the bay' : town ? 'The map of the town, squares A1 to F6' : globe ? 'The map of the world, on a grid of latitude and longitude every 15°' : 'The map of the world';
  // Expert's lines labelled: every 30° of latitude; of longitude by the squares' size (`globeLabels`: every 30° where a
  // number fits, bare under 24 px), its continents' names where they fit.
  const latLines = globe ? GLOBE_LAT_ROWS : [];
  const labels = globeLabels(cell);
  const named = !globe || labels.named;
  const longLines = globe ? Array.from({ length: w / labels.longStep + 1 }, (_, n) => n * labels.longStep).filter((col) => labels.ends || (col > 0 && col < w)) : [];
  return (
    <div className="flex flex-col items-center gap-1">
      {/* The town's numbers up its side, 1 at the bottom; its letters along the bottom. */}
      <div className="relative" style={size ? { width: size + side, paddingLeft: side } : { width: '100%', maxWidth: 420, paddingLeft: side }}>
        {/* Expert's latitudes up the side, each at its line. */}
        {globe && (
          <div aria-hidden="true" className="absolute inset-y-1 left-0" style={{ width: LAT_GUTTER }}>
            {latLines.map((row) => (
              <span key={row} className="absolute right-1 -translate-y-1/2 whitespace-nowrap text-[11px] font-black leading-none text-amber-200" style={{ top: `${(row / h) * 100}%` }}>
                {latLabel(row)}
              </span>
            ))}
          </div>
        )}
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
          aria-describedby={first ? 'am-clue am-where' : 'am-where'}
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
          {/* Nudged when Ember bumps the edge, once and softly (keyed, so each bump does; the map itself keeps its focus — UX
              review round 2: a shake read as "wrong!"). Its squares a grid: placed by percentages, they left thin dark lines
              between them (UX review round 1). */}
          <div key={bump} {...handlers} className={cn('absolute inset-0', bump > 0 && !still && 'am-nudge')}>
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, gridTemplateRows: `repeat(${h}, 1fr)` }}>
              {Array.from({ length: h }, (_, y) =>
                Array.from({ length: w }, (_, x) => {
                  const here = grid ? placeAt(grid, { x, y }) : null;
                  const fill = grid ? (here === 'pond' ? '#7cc3e8' : grid.sea[y][x] === '~' ? '#3d7fb8' : '#8cc277') : REGION_FILL[regionOf({ x, y }).id];
                  return (
                    // Expert's lines are the grid's: darker (UX: what the coordinates are read against).
                    <span key={`${x},${y}`} aria-hidden="true" className={cn('flex items-center justify-center border', globe ? 'border-black/35' : 'border-black/15')} style={{ background: fill, fontSize: cell ? cell * 0.55 : undefined }}>
                      {here === 'house' ? '🏠' : here ? <PlaceIcon id={here} /> : ''}
                    </span>
                  );
                }),
              )}
            </div>
            {world && (
              <>
                <span aria-hidden="true" className="absolute inset-x-0 border-t-2 border-dashed border-white/90" style={{ top: `${(equator / h) * 100}%` }} />
                {/* Expert: the prime meridian, 0°, where east and west meet. */}
                {globe && <span aria-hidden="true" className="absolute inset-y-0 border-l-2 border-dashed border-white/90" style={{ left: '50%' }} />}
                {/* Just under the line, over the Indian Ocean: clear of every place's name (UX review round 2: on S. America's). */}
                {named && (
                  <span
                    aria-hidden="true"
                    className="absolute -translate-x-1/2 rounded bg-[#1b0f22]/70 px-1 text-[12px] font-bold leading-tight text-white"
                    style={{ left: `${((8.7 * k) / w) * 100}%`, top: `calc(${(equator / h) * 100}% + 2px)` }}
                  >
                    Equator
                  </span>
                )}
                {(named ? REGIONS : []).map((r) => (
                  <span
                    key={r.id}
                    aria-hidden="true"
                    // The oceans' names white with an ink edge, the pale Arctic's ink (UX review round 2: 1.7 : 1, unreadable).
                    className={cn(
                      'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold leading-none',
                      r.id === 'arctic' ? 'italic text-[#1b0f22]' : r.ocean ? 'italic text-white [text-shadow:0_0_2px_#1b0f22,0_0_2px_#1b0f22]' : 'text-[#1b0f22]',
                    )}
                    style={{ left: `${((globe ? GLOBE_LABEL : REGION_LABEL)[r.id][0] / w) * 100}%`, top: `${((globe ? GLOBE_LABEL : REGION_LABEL)[r.id][1] / h) * 100}%`, fontSize: cell ? Math.max(11, Math.min(13, cell * k * 0.36)) : 11 }}
                  >
                    {small ? r.name.replace(/^the /, '').replace(/ Ocean$/, '').replace(/^(North|South) /, (m) => `${m[0]}. `) : r.name.replace(/^the /, '').replace(/ Ocean$/, '')}
                  </span>
                ))}
                {/* Where the world's post set off. */}
                {!(at.x === start.x && at.y === start.y) && (
                  <span
                    aria-hidden="true"
                    className="absolute flex items-center justify-center"
                    style={{ left: `${(start.x / w) * 100}%`, top: `${(start.y / h) * 100}%`, width: `${100 / w}%`, height: `${100 / h}%`, fontSize: cell ? cell * (globe ? 0.7 : 0.4) : undefined }}
                  >
                    ✉️
                  </span>
                )}
              </>
            )}
            <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
              {/* Her route: gold on an ink edge (UX review round 2: gold on Africa's yellow didn't show). */}
              {runs.map((run, k) =>
                run.length > 1 ? (
                  <g key={k}>
                    <polyline points={run.map((c) => `${c.x + 0.5},${c.y + 0.5}`).join(' ')} fill="none" stroke="#1b0f22" strokeWidth="0.2" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={run.map((c) => `${c.x + 0.5},${c.y + 0.5}`).join(' ')} fill="none" stroke="#fcd34d" strokeWidth="0.12" strokeDasharray="0.25 0.18" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                ) : null,
              )}
              {ruler && <Ruler job={job} />}
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
          </div>
        </div>
        {/* North's up, on every map (UX review round 1: only the world's said so) — on its frame's corner, over no square Ember
            can fly to (UX review round 2). */}
        <span aria-hidden="true" className="pointer-events-none absolute -right-1.5 -top-2.5 z-10 rounded border-2 border-[#1b0f22] bg-[#fff6dc] px-1 text-[12px] font-black leading-tight text-[#1b0f22]">
          N ↑
        </span>
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
      {/* Expert's longitudes under the map, each at its line. */}
      {globe && (
        <div aria-hidden="true" className="relative" style={size ? { width: size, marginLeft: side, height: LONG_ROW } : { width: '100%', height: LONG_ROW }}>
          {longLines.map((col) => (
            <span
              key={col}
              className={cn('absolute top-0.5 whitespace-nowrap text-[11px] font-black leading-none text-amber-200', col === 0 ? '' : col === w ? '-translate-x-full' : '-translate-x-1/2')}
              style={{ left: `${(col / w) * 100}%` }}
            >
              {longLabel(col, labels.bare)}
            </span>
          ))}
        </div>
      )}
      <p id="am-where" className="sr-only">
        {[where, target, 'The arrow keys fly Ember too.'].filter(Boolean).join(' ')}
      </p>
    </div>
  );
});
MapView.displayName = 'MapView';

/**
 * "How far?"'s ruler: a straight line from where the post set off to the
 * place's nearest square — the way a map's scale is used (UX review round 2:
 * the count went across and down). Round the back of the world, in two parts.
 */
function Ruler({ job }: { job: Job }) {
  const { start } = mapOf(job);
  const to = rulerTo(job);
  let dx = to.x - start.x;
  if (Math.abs(dx) > WORLD_W / 2) dx -= Math.sign(dx) * WORLD_W;
  const dy = to.y - start.y;
  const line = (x: number, y: number) => <line x1={x + 0.5} y1={y + 0.5} x2={x + dx + 0.5} y2={y + dy + 0.5} />;
  return (
    <g stroke="#fff" strokeWidth="0.09" strokeDasharray="0.12 0.1" strokeLinecap="round">
      {line(start.x, start.y)}
      {start.x + dx !== to.x && line(to.x - dx, to.y - dy)}
    </g>
  );
}

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
 * by Pidge, and under the album. One just stuck in (`fresh`) is marked new —
 * and brought into sight by the game, which owns the side panel's scroll (UX
 * review round 1: unmarked, and half cut off at 1366 × 650).
 */
function Album({ known, read, fresh, onRead }: { known: (id: StampId) => boolean; read: StampId | null; fresh: StampId | null; onRead: (id: StampId) => void }) {
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

