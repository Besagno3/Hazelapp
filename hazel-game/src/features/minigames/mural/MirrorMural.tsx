import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  FREE_PALETTE,
  GLYPH,
  HEX,
  JOBS_PER_ROUND,
  MOVES,
  MOVE_NAME,
  NAME,
  PATTERNS,
  PATTERN_BY_ID,
  POTS,
  SIZE,
  decodeMine,
  encodeMine,
  given,
  jobFor,
  jobWords,
  learnedLine,
  markWords,
  mirrorWords,
  mirrored,
  mismatches,
  mix,
  mixWords,
  nameWords,
  num,
  pImage,
  paint,
  paintFirstWords,
  pointWords,
  roundQueue,
  ruleWords,
  source,
  start,
  toPaint,
  type Cell,
  type Colour,
  type Grid,
  type Job,
  type Kind,
  type Move,
  type PatternId,
  type Pot,
} from '../../../lib/minigames/mural';
import { BAND_LABEL, mineFlag, pageFlag, type PlayBand } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { PixelPicture } from './art';
import { useSettled } from '../useSettled';
import { useStickyHeight } from '../useStickyHeight';
import { stepScroll } from '../stepScroll';
import { fitCanvas, type Controls, type Fit } from './layout';
import { AXIS, AskPicture, Axes, MoveMarks, type Overlay } from './marks';

const EMPTY_FLAGS: Record<string, boolean> = {};
/** Expert's canvas while the move's named: bare, but for A and A′ (review round 1: the painted part's shape gave the move away). */
const BARE: Grid = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));

/**
 * Mixing (on Expert, naming the move), painting (the mirror's marks stay on the canvas till they're fixed), a perfect
 * match, the kid's own canvas.
 */
type Step = 'mix' | 'name' | 'paint' | 'matched' | 'free';
/** What the brush puts down: a paint, or bare wall again. */
type Brush = Colour | 'rub';

/** Madame Hue after a picture matches, in turn — on Expert, plainly (§8.3). */
const RIGHT_LINES = ['Magnifique! It’s a perfect reflection.', 'Darling, the mirror couldn’t have done it better!', 'Exquisite! Straight onto the Gallery wall.'];
const EXPERT_RIGHT_LINES = ['Exact.', 'That’s the image.', 'Right.'];

/** The colours each picture shows in the Gallery (its own, whatever band it was painted at) — this round's in the kid's. */
const GALLERY_COLOURS: Record<PatternId, [Colour, Colour]> = {
  butterfly: ['purple', 'yellow'],
  window: ['blue', 'orange'],
  flower: ['pink', 'green'],
  diamond: ['orange', 'blue'],
  snowflake: ['sky', 'purple'],
  lantern: ['red', 'yellow'],
  castle: ['green', 'red'],
  star: ['yellow', 'purple'],
  bloom: ['purple', 'orange'],
};

/** Opposites: an opposite mirror's paints come in these pairs, side by side (review round 1: they were only in the reward). */
const PAIRS: readonly [Colour, Colour][] = [
  ['red', 'green'],
  ['yellow', 'purple'],
  ['blue', 'orange'],
];

/** A paint's letter in white on the dark ones, ink on the rest (each at least 4.7:1). */
const LIGHT_GLYPH: ReadonlySet<Colour> = new Set(['blue', 'purple', 'brown']);
const glyphInk = (c: Colour) => (LIGHT_GLYPH.has(c) ? '#ffffff' : '#1b0f22');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const key = (r: number, c: number) => `${r},${c}`;

/** `gap-2` under the heading. */
const GAP_UNDER = 8;

const MIRROR_HINT: Record<Kind, string> = {
  across: 'Each square on the right copies the square across the mirror line.',
  down: 'Each square on the bottom copies the square across the mirror line.',
  four: 'Two mirror lines: every quarter copies the top-left one, flipped.',
  turn: 'Half a turn: the bottom half is the top half upside down — the bottom-right corner copies the top-left.',
  opposite: 'Each square on the right is the opposite colour of the square across the line: red and green, yellow and purple, blue and orange are opposites.',
  diag: 'Each square in the bottom-right triangle copies the square across the corner-to-corner line.',
  quarter: 'Each quarter is the top-left one turned: a quarter turn, a half, three quarters.',
  shift: 'Each square on the right copies the square three to its left.',
};

/**
 * 🪞 Mirror Mural (docs/DESIGN-MINIGAMES.md §5.4), in Madame Hue's Grand
 * Gallery: half of each picture is painted. The kid mixes the paint it needs
 * from two pots, paints the rest (tap or drag across the squares; or the
 * arrow keys and Enter), and holds up the mirror: what doesn't match yet is
 * marked on the canvas, to fix there and then. Three pictures a round — paid
 * as the third matches — then a free canvas: the kid paints the left half, the
 * mirror the rest, and it hangs in the Gallery. No timer. Rules:
 * `lib/minigames/mural.ts`.
 */
export default function MirrorMural({ def, band, round, onPage, onFinish, onClaim }: PlayProps) {
  // Expert (§8.5): transformations on a coordinate grid — the move named from A and A′ instead of a paint mixed.
  const expert = band === 'expert';
  const first: Step = expert ? 'name' : 'mix';
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const update = useSaveStore((s) => s.update);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which pictures come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue((id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const pattern = PATTERN_BY_ID[job.pattern];
  const [step, setStep] = useState<Step>(first);
  const [chosen, setChosen] = useState<Pot[]>([]);
  const [mixSaid, setMixSaid] = useState<string | null>(null);
  // Expert's move picked, and what was said of it.
  const [move, setMove] = useState<Move | null>(null);
  const [nameSaid, setNameSaid] = useState<string | null>(null);
  const [grid, setGrid] = useState<Cell[][]>(() => start(job));
  const [brush, setBrush] = useState<Brush>(job.mixColour);
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  // Whether the mirror has found squares to fix in this picture; how many times it's been held up (focus follows it);
  // whether it was held up before a square was painted.
  const [fixing, setFixing] = useState(false);
  const [checks, setChecks] = useState(0);
  const [tooSoon, setTooSoon] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  // Expert's reward teaches the first picture missed, not the last (UX review round 1, as Clocktower Gears).
  const [missedLesson, setMissedLesson] = useState<string | null>(null);
  const [newPage, setNewPage] = useState(false);
  const [read, setRead] = useState<PatternId | 'mine' | null>(null);
  const [rights, setRights] = useState(0);
  // Expert's seal (§8.3): each picture's move named at the first try and its image exact at the first check.
  const [missed, setMissed] = useState(false);
  const [spotOn, setSpotOn] = useState(0);
  // This round's finished pictures, as painted: the Gallery shows them in the kid's colours.
  const [finished, setFinished] = useState<Partial<Record<PatternId, Grid>>>({});
  const [free, setFree] = useState<Cell[][]>(() => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null)));
  const known = (id: PatternId) => !!flags[pageFlag(def.id, id)];
  const mine = useMemo(() => {
    const prefix = mineFlag(def.id);
    const k = Object.keys(flags).find((f) => f.startsWith(prefix) && flags[f]);
    return k ? decodeMine(k.slice(prefix.length)) : null;
  }, [flags, def.id]);
  const painting = step === 'paint' || step === 'free';
  const matched = step === 'matched';
  const shown = step === 'free' ? mirrored(free) : step === 'name' ? BARE : grid;
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}:${checks}`);
  // A press to act on: a key's at once (no click count — a quick keyboard kid isn't held back), a tap's once settled.
  const ready = (e: { detail: number }) => e.detail === 0 || settled();

  // Focus follows the picture: the mix or Expert's move (described by the job); the first square to paint — or, once
  // the mirror has marked some, the first marked (review round 1); what a perfect match showed; the free canvas's first
  // square.
  const mixHead = useRef<HTMLHeadingElement>(null);
  const resultHead = useRef<HTMLHeadingElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step === 'mix' || step === 'name') mixHead.current?.focus({ preventScroll: true });
    else if (step === 'matched') resultHead.current?.focus({ preventScroll: true });
    else (canvas.current?.querySelector<HTMLButtonElement>('button[data-marked]') ?? canvas.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]'))?.focus({ preventScroll: true });
  }, [step, done, checks]);

  // What a step works with comes into view as it starts — never as a square is painted: the pots and Mix; the canvas
  // with its paints and the mirror (on a phone, from the top under the header: a small one can't show it all), and
  // again with the mirror's marks; what a match showed, with Next.
  const goRef = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [hue, hueH] = useStickyHeight<HTMLDivElement>();
  const board = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const ask = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
    const sc = page.current;
    const b = board.current;
    const phone = !!window.matchMedia?.('(max-width: 639px)').matches && !!sc && typeof sc.scrollTo === 'function';
    if ((step === 'paint' || step === 'free') && phone && sc && b) {
      // A phone scrolls just the game (scrollIntoView's "start" scrolled the stage under its header too).
      sc.scrollTo({ top: sc.scrollTop + b.getBoundingClientRect().top - sc.getBoundingClientRect().top, behavior });
    } else if (step === 'name' && phone && sc && goRef.current) {
      // Expert's ask, A and A′ drawn small, with the moves and That's the move: the ask first where they don't all fit
      // (UX review round 1: the canvas with A and A′ was scrolled away above them).
      const by = stepScroll({ go: goRef.current.getBoundingClientRect(), keep: ask.current?.getBoundingClientRect() ?? null, view: sc.getBoundingClientRect(), cover: 0, keepWins: true });
      sc.scrollTo({ top: sc.scrollTop + by, behavior });
    } else if (step === 'paint' || step === 'free') {
      b?.scrollIntoView?.({ block: 'nearest', behavior });
      // A canvas held at its floor scrolls in the board (`tight`): the gold button into sight there too, the canvas's
      // top kept (UX review round 1: Check the image was under the footer at 683 × 600).
      if (b && goRef.current && canvas.current && typeof b.scrollTo === 'function' && b.scrollHeight > b.clientHeight) {
        const by = stepScroll({ go: goRef.current.getBoundingClientRect(), keep: canvas.current.getBoundingClientRect(), view: b.getBoundingClientRect(), cover: 0, keepWins: true });
        b.scrollTo({ top: b.scrollTop + by, behavior });
      }
    }
    else if (step === 'matched') card.current?.scrollIntoView?.({ block: 'nearest', behavior });
    else goRef.current?.scrollIntoView?.({ block: 'nearest', behavior });
  }, [step, done, checks]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickPot(p: Pot, e: { detail: number }) {
    if (!ready(e)) return;
    sfx('select');
    setRead(null);
    setMixSaid(null);
    setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p].slice(-2)));
  }

  function doMix(e: { detail: number }) {
    if (step !== 'mix' || chosen.length < 2 || !ready(e)) return;
    const [a, b] = chosen;
    setMixSaid(mixWords(a, b, job.mixColour));
    setRead(null);
    if (a !== b && mix(a, b) === job.mixColour) {
      sfx('chest');
      setBrush(job.mixColour);
      setStep('paint');
    } else {
      sfx('wrong');
      setChosen([]);
    }
  }

  function pickMove(m: Move, e: { detail: number }) {
    if (!ready(e)) return;
    sfx('select');
    setRead(null);
    setNameSaid(null);
    setMove(m);
  }

  /** Expert: the move named from A and A′ — the right one goes on to the painting; another says where it takes A. */
  function nameIt(e: { detail: number }) {
    if (step !== 'name' || move === null || !ready(e)) return;
    setNameSaid(nameWords(job, move));
    setRead(null);
    if (move === job.kind) {
      sfx('chest');
      setBrush(job.palette[0]);
      setStep('paint');
    } else {
      sfx('wrong');
      setMissed(true);
      setMove(null);
    }
  }

  /** Paint a square with the brush (the kid's squares only; on the free canvas, the left half). */
  function paintAt(r: number, c: number) {
    if (step === 'free') {
      if (c >= SIZE / 2) return;
      setFree((g) => withCell(g, r, c, brush === 'rub' ? null : brush));
      return;
    }
    if (step !== 'paint' || given(job.kind, r, c)) return;
    const v = brush === 'rub' ? null : brush;
    if (grid[r][c] === v) return;
    setTooSoon(false);
    setGrid((g) => withCell(g, r, c, v));
    setMarks((m) => {
      if (!m.has(key(r, c))) return m;
      const next = new Set(m);
      next.delete(key(r, c));
      return next;
    });
  }

  function pickBrush(b: Brush) {
    sfx('select');
    setRead(null);
    setBrush(b);
  }

  /** Hold up the mirror: a perfect match pays the page (and, the third, the round); else it marks what to fix. */
  function check(e: { detail: number }) {
    if (step !== 'paint' || !ready(e)) return;
    setRead(null);
    setMixSaid(null);
    setNameSaid(null);
    // Nothing painted yet: nothing to mark — paint first (review round 2: it marked every square).
    if (toPaint(job.kind).every(([r, c]) => grid[r][c] === null)) {
      sfx('select');
      setTooSoon(true);
      return;
    }
    setChecks((n) => n + 1);
    const off = mismatches(job, grid);
    if (off.length > 0) {
      sfx('wrong');
      setMarks(new Set(off.map(([r, c]) => key(r, c))));
      setFixing(true);
      setMissed(true);
      return;
    }
    sfx('chest');
    setMarks(new Set());
    setFixing(false);
    setNewPage(onPage(job.pattern, pattern.name));
    setLessons((l) => [...l, learnedLine(job)]);
    if (missed) setMissedLesson((l) => l ?? learnedLine(job));
    setRights((n) => n + 1);
    const spot = spotOn + (missed ? 0 : 1);
    setSpotOn(spot);
    setFinished((f) => ({ ...f, [job.pattern]: job.goal }));
    setStep('matched');
    // The round is earned now: the free canvas is just for fun, and leaving from it keeps the pay (review round 1) —
    // and Expert's seal.
    if (done + 1 >= JOBS_PER_ROUND) onClaim?.(expert ? { right: spot, of: JOBS_PER_ROUND } : undefined);
  }

  function next(e: { detail: number }) {
    if (step !== 'matched' || !ready(e)) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      setStep('free');
      setBrush(FREE_PALETTE[0]);
      return;
    }
    const nextJob = jobFor(band, round, done + 1, queue);
    setDone((n) => n + 1);
    setGrid(start(nextJob));
    setChosen([]);
    setMixSaid(null);
    setMove(null);
    setNameSaid(null);
    setMissed(false);
    setMarks(new Set());
    setFixing(false);
    setTooSoon(false);
    setNewPage(false);
    setBrush(nextJob.mixColour);
    setStep(first);
  }

  const learned = (expert && missedLesson) || (lessons[lessons.length - 1] ?? '');
  function finish(hung: boolean, e: { detail: number }) {
    if (!ready(e)) return;
    const spot = expert ? { spotOn: { right: spotOn, of: JOBS_PER_ROUND } } : {};
    onFinish(
      hung
        ? {
            ...spot,
            title: 'Three pictures — and one of yours!',
            learned,
            // The picture hung, on the reward (review round 2: it was only in the next round's Gallery).
            picture: (
              <span className="block rounded-sm border-[6px] border-[#c48a52] bg-[#1b0f22] p-1 shadow-[0_4px_0_#1b0f22]">
                <PixelPicture grid={mirrored(free)} size={80} />
              </span>
            ),
          }
        : { ...spot, title: 'Three pictures finished!', learned },
    );
  }

  /** Hang the free canvas in the Gallery: one picture at a time, in the kid's save (§3.5). */
  function hang(e: { detail: number }) {
    if (step !== 'free' || !free.some((row) => row.some(Boolean)) || !ready(e)) return;
    const prefix = mineFlag(def.id);
    update((s) => ({
      ...s,
      flags: { ...Object.fromEntries(Object.entries(s.flags).filter(([k]) => !k.startsWith(prefix))), [mineFlag(def.id, encodeMine(free))]: true },
    }));
    sfx('chest');
    finish(true, e);
  }

  const stepIndex = step === 'mix' || step === 'name' ? 0 : step === 'paint' ? 1 : step === 'matched' ? 2 : 3;
  const freeEmpty = !free.some((row) => row.some(Boolean));
  const hint = MIRROR_HINT[job.kind];

  // Madame Hue's line is the one live region: steady through the mix (its result is the step card's status, read
  // once — review round 1), then what to do, what the mirror found, a match.
  let line: string;
  const readPage = read === 'mine' ? null : read ? PATTERN_BY_ID[read] : null;
  if (read === 'mine') line = expert ? 'Your own picture — the right half is the left half’s reflection in x = 3. Paint another after three pictures and it takes its place.' : 'Your own picture, darling — the mirror painted the right half. Paint another after three pictures and it takes its place.';
  else if (readPage) line = `${readPage.name}: ${readPage.note}`;
  else if (expert) {
    // Expert, plainly (§8.3): what to do, what's wrong and one thing to try — no cheering.
    if (step === 'name') line = `The ${pattern.name}. ${jobWords(job, false)}`;
    else if (step === 'paint' && tooSoon) line = paintFirstWords(job.kind, true);
    else if (step === 'paint' && marks.size > 0) line = markWords(marks.size, job);
    else if (step === 'paint' && fixing) line = 'All fixed? Check it again.';
    else if (step === 'paint') line = nameSaid ? `${nameSaid} Now paint the image.` : mirrorWords(job.kind, true);
    else if (matched) line = `${EXPERT_RIGHT_LINES[(rights - 1 + EXPERT_RIGHT_LINES.length) % EXPERT_RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Next picture.' : 'Now one of your own.'}`;
    else line = 'Your turn. Paint the left half; its reflection in x = 3 paints itself, and it hangs in the Gallery.';
  } else if (step === 'mix') line = `The ${pattern.name} needs ${NAME[job.mixColour]}. Pick two pots and mix them, darling!`;
  else if (step === 'paint' && tooSoon) line = paintFirstWords(job.kind);
  // The marks left, counted as they're fixed (review round 2: the count went stale); then a nudge.
  else if (step === 'paint' && marks.size > 0) line = `Nearly, darling! ${markWords(marks.size)}`;
  else if (step === 'paint' && fixing) line = 'All fixed? Hold up the mirror again, darling!';
  else if (step === 'paint') line = mixSaid ? `${mixSaid} Now paint: ${hint.charAt(0).toLowerCase()}${hint.slice(1)}` : hint;
  else if (matched) line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'On to the next picture!' : 'Now one of your own!'}`;
  else line = 'Your turn! Paint the left half — the mirror paints the rest — and it hangs in my Gallery.';

  const palette: readonly Colour[] = step === 'free' ? FREE_PALETTE : job.palette;
  // Expert's mark for the move on the canvas: A and A′ while it's named; the line or the centre once the mirror's
  // found something to fix (§8.3: a hint after a miss, not a label before).
  const overlay: Overlay = !expert || step === 'free' ? null : step === 'name' ? 'points' : step === 'paint' && fixing ? 'move' : null;
  const pairs = step !== 'free' && job.kind === 'opposite';
  const { area, head, fit } = useCanvasSize({ paints: palette.length, pairs, free: step === 'free', axes: expert ? AXIS : 0 });
  const { beside, compact, tight } = fit ?? { beside: false, compact: true, tight: false };
  const size = fit?.size ?? null;

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden">
      {/* The Gallery above the canvas from `sm` up; a phone and a short screen keep just the canvas. */}
      <div className="grid flex-none grid-cols-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_300px] sm:grid-rows-[minmax(0,32fr)_minmax(0,68fr)] lg:grid-cols-[minmax(0,1fr)_380px] sm:[@media(max-height:500px)]:grid-cols-[minmax(0,1fr)_260px] sm:[@media(max-height:500px)]:grid-rows-[minmax(0,1fr)]">
        <section aria-label="This round’s frames" className="relative hidden overflow-hidden sm:col-start-1 sm:row-start-1 sm:block [@media(max-height:500px)]:hidden">
          <GalleryScene queue={queue} done={done} matched={matched} finished={finished} band={band} round={round} />
        </section>

        <section
          ref={board}
          aria-labelledby="mm-canvas"
          className={cn(
            'flex flex-col gap-2 bg-[#3b2a4a] px-2 pb-2 pt-1.5 sm:col-start-1 sm:row-start-2 sm:min-h-0 sm:border-t-4 sm:border-[#1b0f22] sm:p-4 [@media(max-height:500px)]:row-start-1 [@media(max-height:500px)]:border-t-0 [@media(max-height:500px)]:p-2',
            // Too small a space to tap in: the canvas keeps a size to tap, and this scrolls (review round 2). Its
            // scrollbar's room is always kept, so one coming and going can't change the space it's fitted to.
            'sm:overflow-y-auto sm:[scrollbar-gutter:stable]',
          )}
        >
          {/* On a phone the job is over the canvas, so painting needs no scroll down to read it (review round 1); the
              free canvas has none, so its Hang it fits on a small phone too. */}
          {step !== 'free' && <PhoneLine job={job} step={step} fixing={fixing} />}
          {/* The canvas as big as its space allows, with its paints and the mirror beside it or under it — whichever
              leaves it bigger — so they always fit (`layout.ts`, review rounds 1 and 2). */}
          <div ref={area} className={cn('flex w-full justify-center sm:min-h-0 sm:flex-1', tight ? 'sm:items-start' : 'sm:items-center')}>
            <div className={cn('flex w-full max-w-[340px] flex-col gap-2 sm:max-w-none', beside && 'max-h-full flex-row justify-center gap-3')}>
              <div className={cn('flex flex-none flex-col gap-2', size && 'self-center')} style={size ? { width: size } : undefined}>
                <h2 ref={head} id="mm-canvas" className={cn(pixelHeadClass, 'truncate text-lg text-[#fde68a] sm:text-2xl [@media(max-width:639px)]:sr-only [@media(max-height:500px)]:sr-only')}>
                  {step === 'free' ? 'Your canvas' : `The ${pattern.name}`}
                </h2>
                <Axes on={expert}>
                  <Canvas
                    key={step === 'free' ? 'free' : done}
                    ref={canvas}
                    label={step === 'free' ? 'Your picture' : 'The picture'}
                    describedBy={step === 'free' ? 'mm-free' : 'mm-job'}
                    grid={shown}
                    kind={step === 'free' ? 'across' : job.kind}
                    editable={(r, c) => (step === 'free' ? c < SIZE / 2 : step === 'paint' && !given(job.kind, r, c))}
                    isGiven={(r, c) => step !== 'free' && step !== 'name' && given(job.kind, r, c)}
                    echo={(_, c) => step === 'free' && c >= SIZE / 2}
                    marks={step === 'paint' ? marks : EMPTY_MARKS}
                    painting={painting}
                    job={step === 'free' ? null : job}
                    coords={expert}
                    overlay={overlay}
                    onPaint={paintAt}
                  />
                </Axes>
              </div>
              {/* Kept in place (unseen) while mixing and after a match, so the canvas never changes size under the
                  kid; on a phone, only while painting. */}
              {/* Drawn at fixed sizes (`layout.ts` knows how tall they stand). */}
              <div className={cn('flex flex-col gap-2', beside && 'min-h-0 min-w-[180px] max-w-[22rem] flex-1 overflow-y-auto', !painting && 'hidden sm:flex sm:invisible')}>
                <div className={cn('flex flex-col gap-2 pb-1', beside && 'my-auto')}>
                  {pairs && (
                    <p aria-hidden="true" className="h-[18px] text-center text-[13px] font-bold leading-[18px] text-[#fde68a]">
                      Opposites side by side ↔
                    </p>
                  )}
                  <div role="group" aria-label="Paints" className="flex flex-wrap justify-center gap-1.5">
                    {pairs
                      ? PAIRS.map(([a, b]) => (
                          <span key={a} role="group" aria-label={`${cap(NAME[a])} and ${NAME[b]}: opposites`} className="flex items-center gap-0.5">
                            <PaintButton colour={a} on={brush === a} compact={compact} onPick={() => pickBrush(a)} />
                            <span aria-hidden="true" className="w-3.5 text-center font-black text-[#fde68a]">
                              ↔
                            </span>
                            <PaintButton colour={b} on={brush === b} compact={compact} onPick={() => pickBrush(b)} />
                          </span>
                        ))
                      : palette.map((c) => <PaintButton key={c} colour={c} on={brush === c} compact={compact} onPick={() => pickBrush(c)} />)}
                    <RubButton on={brush === 'rub'} compact={compact} onPick={() => pickBrush('rub')} />
                  </div>
                  {step !== 'free' ? (
                    <button ref={step === 'paint' ? goRef : undefined} type="button" onClick={check} className={cn(goldClass, 'h-14', beside ? 'px-3 text-base leading-tight' : 'text-lg')}>
                      {expert ? '🪞 Check the image' : '🪞 Hold up the mirror'}
                    </button>
                  ) : (
                    // Side by side under the canvas, so it keeps its size (review round 1).
                    <div className={cn('flex gap-2', beside ? 'flex-col' : 'items-stretch')}>
                      <button
                        ref={goRef}
                        type="button"
                        onClick={hang}
                        aria-disabled={freeEmpty || undefined}
                        className={cn(goldClass, 'h-14 px-3 leading-tight', beside ? 'text-base' : 'flex-1 text-lg')}
                      >
                        {freeEmpty ? 'Paint a square first' : '🖼️ Hang it in the Gallery'}
                      </button>
                      <button type="button" onClick={(e) => finish(false, e)} className={cn(outlineClass, 'border-2 px-3 text-sm', beside ? 'h-11' : 'h-14')}>
                        Not this time
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Nothing in here is anchored to the scroll: a longer line never moves the pots under a finger (review round 1). */}
        <aside
          aria-label={`The job and the ${def.collection}`}
          style={hueH ? { scrollPaddingTop: hueH } : undefined}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:overflow-y-auto sm:border-l-4 sm:p-4"
        >
          {/* Kept in sight as the panel scrolls on a tall enough screen (review round 2: it went under the header on a
              laptop); the panel scrolls what it brings into view out from under it. */}
          <div
            ref={hue}
            className="[@media(min-width:640px)_and_(min-height:700px)]:sticky [@media(min-width:640px)_and_(min-height:700px)]:-top-4 [@media(min-width:640px)_and_(min-height:700px)]:z-10 [@media(min-width:640px)_and_(min-height:700px)]:-mx-4 [@media(min-width:640px)_and_(min-height:700px)]:-mt-4 [@media(min-width:640px)_and_(min-height:700px)]:bg-[#1e1b4b] [@media(min-width:640px)_and_(min-height:700px)]:px-4 [@media(min-width:640px)_and_(min-height:700px)]:pb-1 [@media(min-width:640px)_and_(min-height:700px)]:pt-4"
          >
            <HostBubble npcId={def.host} line={line} phoneStrip />
          </div>
          {step !== 'free' && (
            <div className="order-1 sm:order-none">
              <Ticket heading={`PAINT THE ${pattern.name.toUpperCase()}`} ready={matched} icon={<KindBadge kind={step === 'name' ? null : job.kind} />} id="mm-job">
                {jobWords(job, step !== 'name')}
              </Ticket>
            </div>
          )}

          {/* On a short screen it's first, and tighter after a match, so the result and Next fit in view together. */}
          <div ref={card} className={cn(windowClass, 'flex flex-col gap-3 p-3.5 [@media(max-height:500px)]:order-first [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:p-2.5')}>
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden">
              {step === 'free' ? 'Your own picture' : `Picture ${done + 1} of ${JOBS_PER_ROUND}`}
            </p>

            {step === 'mix' && (
              <>
                <h2 ref={mixHead} tabIndex={-1} aria-describedby="mm-job" className={cn(pixelHeadClass, 'self-start rounded text-[26px] [@media(max-height:500px)]:text-[22px]', focusRing)}>
                  Step 1 · Mix the paint
                </h2>
                {/* On a short screen it all fits under the heading: a line, the pots in a row (review round 2). */}
                <p className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                  The picture needs <ColourWord colour={job.mixColour} />.<span className="[@media(max-height:500px)]:hidden"> Pick two pots, then mix them.</span>
                </p>
                <div role="group" aria-label="Paint pots" className="grid grid-cols-2 gap-2 [@media(max-height:500px)]:flex [@media(max-height:500px)]:gap-1.5">
                  {(band === 'expert' ? [] : POTS[band]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={(e) => pickPot(p, e)}
                      aria-pressed={chosen.includes(p)}
                      className={cn(
                        'flex min-h-[52px] items-center gap-2 rounded-lg border-[3px] px-2 text-left font-bold',
                        '[@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:flex-col [@media(max-height:500px)]:justify-center [@media(max-height:500px)]:gap-0.5 [@media(max-height:500px)]:px-0.5 [@media(max-height:500px)]:text-[12px] [@media(max-height:500px)]:leading-none',
                        chosen.includes(p) ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a] hover:bg-[#2f2b70]',
                        focusRing,
                      )}
                    >
                      <PotArt colour={p} />
                      {cap(p)}
                    </button>
                  ))}
                </div>
                {/* Room for the longest mix said, so Mix them never moves (review round 1). */}
                <p
                  role="status"
                  className="flex min-h-[4.25rem] items-center justify-center text-center text-[15px] font-bold leading-snug [@media(max-height:500px)]:min-h-[3.75rem] [@media(max-height:500px)]:text-[14px]"
                >
                  {mixSaid ?? (chosen.length === 0 ? 'No pots picked yet.' : chosen.length === 1 ? `${cap(chosen[0])} — and one more.` : `${cap(chosen[0])} and ${chosen[1]}.`)}
                </p>
                <button
                  ref={goRef}
                  type="button"
                  onClick={doMix}
                  aria-disabled={chosen.length < 2 || undefined}
                  className={cn(goldClass, 'h-14 text-lg [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:text-base')}
                >
                  {chosen.length < 2 ? 'Pick two pots' : 'Mix them'}
                </button>
              </>
            )}

            {step === 'name' && (
              <>
                <h2 ref={mixHead} tabIndex={-1} aria-describedby="mm-job" className={cn(pixelHeadClass, 'self-start rounded text-[26px] [@media(max-height:500px)]:text-[22px]', focusRing)}>
                  Step 1 · Name the move
                </h2>
                {/* On a phone, A and A′ drawn small beside the ask — the canvas is above, out of sight — and on a phone on its
                    side the moves beside them too, three across (UX review round 1). */}
                <div ref={ask} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:grid-cols-1 [@media(max-height:500px)]:gap-y-1.5">
                  <AskPicture job={job} />
                  <p className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                    <b>A {pointWords(job.p)}</b> maps to <b>A′ {pointWords(pImage(job))}</b>.<span className="[@media(max-height:500px)]:hidden"> Which move does that?</span>
                  </p>
                  <div
                    role="group"
                    aria-label="Moves"
                    className={cn(
                      'col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 [@media(max-height:500px)]:gap-1.5',
                      '[@media(max-width:639px)_and_(max-height:500px)]:col-span-1 [@media(max-width:639px)_and_(max-height:500px)]:grid-cols-3',
                    )}
                  >
                    {MOVES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={(e) => pickMove(m, e)}
                        aria-pressed={move === m}
                        className={cn(
                          'flex min-h-[52px] items-center rounded-lg border-[3px] px-2 py-1 text-left text-[14px] font-bold leading-tight',
                          '[@media(max-height:500px)]:min-h-[40px] [@media(max-height:500px)]:text-[12px]',
                          move === m ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a] hover:bg-[#2f2b70]',
                          focusRing,
                        )}
                      >
                        {MOVE_NAME[m]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Room for the longest said, so Name it never moves. */}
                <p
                  role="status"
                  className="flex min-h-[4.25rem] items-center justify-center text-center text-[15px] font-bold leading-snug sm:[@media(max-height:500px)]:min-h-[3.75rem] [@media(max-height:500px)]:text-[13px] [@media(max-width:639px)_and_(max-height:500px)]:min-h-[2.5rem]"
                >
                  {nameSaid ?? (move ? `${MOVE_NAME[move]}.` : 'No move picked yet.')}
                </p>
                <button
                  ref={goRef}
                  type="button"
                  onClick={nameIt}
                  aria-disabled={move === null || undefined}
                  className={cn(goldClass, 'h-14 text-lg [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:text-base')}
                >
                  {move === null ? 'Pick a move' : 'That’s the move'}
                </button>
              </>
            )}

            {step === 'paint' && expert && (
              <>
                <h2 className={cn(pixelHeadClass, 'text-[26px] [@media(max-height:500px)]:text-[22px]')}>Step 2 · Paint the image</h2>
                <JobLine job={job} />
                <p className="text-[15px] leading-snug text-[#e4e1ff]">
                  Pick a paint, then tap or drag across the squares: each is the image of a square in the painted part — leave it bare where that one is bare.
                  {fixing && ` ${ruleWords(job.kind)} It’s marked on the canvas.`}
                </p>
                {marks.size > 0 && (
                  <p className="rounded-md bg-[#fde68a] px-2.5 py-1.5 text-[15px] font-bold text-[#1b0f22]">
                    {marks.size === 1 ? 'One square to fix — it has a ! mark.' : `${cap(num(marks.size))} squares to fix — each has a ! mark.`}
                  </p>
                )}
              </>
            )}

            {step === 'paint' && !expert && (
              <>
                <h2 className={cn(pixelHeadClass, 'text-[26px] [@media(max-height:500px)]:text-[22px]')}>Step 2 · Paint the other half</h2>
                <JobLine job={job} />
                <p className="text-[15px] leading-snug text-[#e4e1ff]">Pick a paint, then tap or drag across the squares. {hint}</p>
                {marks.size > 0 && (
                  <p className="rounded-md bg-[#fde68a] px-2.5 py-1.5 text-[15px] font-bold text-[#1b0f22]">
                    {marks.size === 1 ? 'One square to fix — it has a ! mark.' : `${cap(num(marks.size))} squares to fix — each has a ! mark.`}
                  </p>
                )}
              </>
            )}

            {matched && (
              <>
                <h2
                  ref={resultHead}
                  tabIndex={-1}
                  aria-describedby="mm-result"
                  className={cn(pixelHeadClass, 'self-start rounded text-[28px] text-white [@media(max-height:500px)]:text-[22px]', focusRing)}
                >
                  {expert ? 'An exact image' : 'A perfect match!'}
                </h2>
                <p id="mm-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold text-[#1b0f22] [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                  {learnedLine(job)}
                  {newPage && ` The ${pattern.name} is in the Gallery!`}
                </p>
                <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'text-lg [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-base')}>
                  {done + 1 < JOBS_PER_ROUND ? 'Next picture' : expert ? 'Next — paint your own' : 'Next — paint your own!'}
                </button>
              </>
            )}

            {step === 'free' && (
              <>
                <h2 className={cn(pixelHeadClass, 'self-start text-[26px]')}>{expert ? 'Your turn' : 'Your turn!'}</h2>
                <p id="mm-free" className="text-[15px] leading-snug text-[#e4e1ff]">
                  Paint the left half — the mirror paints the right. Hang it and it takes the place of any you painted before.
                </p>
              </>
            )}
          </div>

          <GalleryBook
            known={known}
            painted={finished}
            mine={mine}
            read={read}
            onRead={(id, e) => {
              if (ready(e)) setRead(id);
            }}
          />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 sm:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={expert ? ['Name', 'Paint', 'Check'] : ['Mix', 'Paint', 'Mirror']} current={stepIndex} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

const EMPTY_MARKS: ReadonlySet<string> = new Set();

/** A square's corners in Expert's coordinates: "(1, 4) to (2, 5)". */
const squareWords = (r: number, c: number) => `${pointWords([c, SIZE - 1 - r])} to ${pointWords([c + 1, SIZE - r])}`;
/**
 * The canvas's fit from `sm` up (`layout.ts`): the space measured, the rest
 * worked out — so nothing it draws can change what it measures. On a phone the
 * page scrolls and the canvas takes its width: null.
 */
function useCanvasSize(controls: Controls) {
  const area = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const { paints, pairs, free, axes } = controls;
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (!window.matchMedia?.('(min-width: 640px)').matches) return setFit(null);
      const { width: w, height: h } = el.getBoundingClientRect();
      // The heading over the canvas takes room, unless it's only for a reader (a short screen).
      const heading = head.current && getComputedStyle(head.current).position !== 'absolute' ? head.current.offsetHeight + GAP_UNDER : 0;
      const next = fitCanvas({ w, h, heading, short: window.matchMedia('(max-height: 500px)').matches }, { paints, pairs, free, axes });
      setFit((f) => (f && f.size === next.size && f.beside === next.beside && f.compact === next.compact && f.tight === next.tight ? f : next));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [paints, pairs, free, axes]);
  return { area, head, fit };
}

function withCell(g: readonly (readonly Cell[])[], r: number, c: number, v: Cell): Cell[][] {
  return g.map((row, rr) => (rr === r ? row.map((x, cc) => (cc === c ? v : x)) : [...row]));
}

/** A paint's swatch with its letter (review round 1: colour alone was all a square said). Decorative. */
function Swatch({ colour, className }: { colour: Colour; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex flex-none items-center justify-center border-2 border-[#1b0f22] font-black leading-none', className)}
      style={{ background: HEX[colour], color: glyphInk(colour) }}
    >
      {GLYPH[colour]}
    </span>
  );
}

/** A colour, said and shown: "purple" with its swatch. */
function ColourWord({ colour }: { colour: Colour }) {
  return (
    <b className="whitespace-nowrap">
      <span aria-hidden="true" className="mr-1 inline-block h-3.5 w-3.5 translate-y-0.5 rounded-sm border-2 border-[#1b0f22]" style={{ background: HEX[colour] }} />
      {NAME[colour]}
    </b>
  );
}

/** A paint pot, drawn. */
function PotArt({ colour }: { colour: Pot }) {
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true" className="h-[30px] w-[30px] flex-none [@media(max-height:500px)]:h-6 [@media(max-height:500px)]:w-6">
      <path d="M10 18 h40 l-5 36 h-30 z" fill={HEX[colour]} stroke="#1b0f22" strokeWidth="5" strokeLinejoin="round" />
      <rect x="6" y="10" width="48" height="10" rx="3" fill="#cbd5e1" stroke="#1b0f22" strokeWidth="5" />
    </svg>
  );
}

const paintClass = (on: boolean, compact: boolean) =>
  cn(
    'rounded-lg border-[3px] font-bold',
    // Fixed sizes: `layout.ts` works out how they wrap (PAINT_W, PAINT_H).
    compact ? 'flex h-11 w-14 flex-none flex-col items-center justify-center gap-0.5 whitespace-nowrap px-0.5 text-[11px] leading-none tracking-tight' : 'flex h-11 w-[112px] flex-none items-center gap-1.5 px-2 text-[13px]',
    on ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a]',
    focusRing,
  );

/** A paint in the palette: its colour, its letter and its name — compact (the name under it) beside the canvas. */
function PaintButton({ colour, on, compact, onPick }: { colour: Colour; on: boolean; compact: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={on} className={paintClass(on, compact)}>
      <Swatch colour={colour} className={cn('rounded-full', compact ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]')} />
      {cap(NAME[colour])}
    </button>
  );
}

function RubButton({ on, compact, onPick }: { on: boolean; compact: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={on} className={paintClass(on, compact)}>
      <span aria-hidden="true" className={cn('flex-none rounded border-2 border-dashed border-[#c9c5f2] bg-[#f4ecdc]', compact ? 'h-5 w-5' : 'h-6 w-6')} />
      Rub out
    </button>
  );
}

/** The kind of mirror, as a small sign for the ticket — or, while Expert's move is to be named (null), A and A′. */
function KindBadge({ kind }: { kind: Kind | null }) {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-md border-[3px] border-[#1b0f22] bg-[#f4ecdc]">
      <svg width="24" height="24" viewBox="0 0 24 24">
        {kind === null && (
          <>
            <path d="M6 8 L17 17" stroke="#1b0f22" strokeWidth="2" strokeDasharray="3 2" />
            <circle cx="6" cy="8" r="3.5" fill="#ffffff" stroke="#1b0f22" strokeWidth="2" />
            <circle cx="18" cy="18" r="3.5" fill="#22d3ee" stroke="#1b0f22" strokeWidth="2" />
          </>
        )}
        {kind === 'diag' && <path d="M2 22 L22 2" stroke="#0e7490" strokeWidth="3" strokeDasharray="3 2" />}
        {kind === 'quarter' && (
          <>
            <path d="M12 4 A8 8 0 0 1 20 12" fill="none" stroke="#0e7490" strokeWidth="3" />
            <path d="M16.5 12 H23.5 L20 16.5 Z" fill="#0e7490" />
            <circle cx="12" cy="12" r="2.5" fill="#1b0f22" />
          </>
        )}
        {kind === 'shift' && <path d="M3 12 H17 M13 6 L20 12 L13 18" fill="none" stroke="#0e7490" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {(kind === 'across' || kind === 'four' || kind === 'opposite') && <path d="M12 1 V23" stroke="#0e7490" strokeWidth="3" strokeDasharray="3 2" />}
        {(kind === 'down' || kind === 'four') && <path d="M1 12 H23" stroke="#0e7490" strokeWidth="3" strokeDasharray="3 2" />}
        {kind === 'turn' && <path d="M12 4 A8 8 0 1 1 4 12" fill="none" stroke="#0e7490" strokeWidth="3" />}
        {kind === 'opposite' && (
          <>
            <rect x="3" y="8" width="7" height="8" fill={HEX.red} />
            <rect x="14" y="8" width="7" height="8" fill={HEX.green} />
          </>
        )}
      </svg>
    </span>
  );
}

/** The job, in the step card on a short screen (the ticket is further down there). */
function JobLine({ job }: { job: Job }) {
  return (
    <p aria-hidden="true" className="hidden items-center gap-2 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[15px] leading-snug text-[#1b0f22] sm:[@media(max-height:500px)]:flex">
      <span className="flex-none">
        <KindBadge kind={job.kind} />
      </span>
      <b>{jobWords(job)}</b>
    </p>
  );
}

/**
 * On a phone, over the canvas: the mirror's rule (the ticket and the step card are below it) — on Expert after a
 * miss, the move's (UX review round 1: it was only below the fold). Said there too.
 */
function PhoneLine({ job, step, fixing }: { job: Job; step: Step; fixing: boolean }) {
  return (
    <p aria-hidden="true" className="flex items-center gap-2 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[14px] font-bold leading-snug text-[#1b0f22] sm:hidden">
      <span className="flex-none">
        <KindBadge kind={step === 'name' ? null : job.kind} />
      </span>
      {step === 'mix' || step === 'name' ? jobWords(job, step !== 'name') : job.expert && fixing ? ruleWords(job.kind) : mirrorWords(job.kind, job.expert)}
    </p>
  );
}

/**
 * The mirror's mark on a square that doesn't match yet: a dashed red frame
 * edged in ink, and a ! in the very corner — sized from the canvas, so the
 * square's letter shows inside it at any size (review round 2).
 */
function Mark() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-[2px] rounded-sm border-dashed border-[#e8483f] shadow-[0_0_0_1.5px_#1b0f22] [border-width:max(2px,0.8cqw)]"
    >
      <span className="absolute -right-[3px] -top-[3px] flex h-[max(10px,4.4cqw)] w-[max(10px,4.4cqw)] flex-none items-center justify-center rounded-full border-[1.5px] border-[#1b0f22] bg-[#e8483f] text-[length:max(7px,2.6cqw)] font-black leading-none text-white ring-2 ring-white">
        !
      </span>
    </span>
  );
}

/**
 * The canvas: a grid of squares with its mirror line(s). Each painted square
 * shows its paint's letter; the kid's bare squares are outlined. The kid's
 * squares are buttons — one in the tab order at a time, arrow keys move
 * between them, Enter / Space paints — named by place, colour, the square
 * they copy and a mark; a press or a drag across them paints (one finger, the
 * main button). Given squares are pictures — on Expert, while painting, read
 * in the arrow keys' grid too, but not painted, and the kid's squares say the
 * square they're the image of only once the mirror's marked them (review
 * round 1: it gave the image away). On the free canvas, the mirror's half is
 * hatched (`echo`).
 */
/** A square in the arrow keys' grid. Two-tone focus, cyan over ink, so it shows on any paint (review round 1) — drawn over the mark too (round 2: the mark hid it). */
const squareClass =
  'relative border-[0.5px] border-[#1b0f22]/25 outline-none after:pointer-events-none after:absolute after:inset-0 after:z-10 focus-visible:z-10 focus-visible:after:shadow-[inset_0_0_0_4px_#67e8f9,inset_0_0_0_7px_#1b0f22]';
/** A given square left bare. */
const HATCH = 'bg-[repeating-linear-gradient(45deg,#efe4cf_0_4px,#f4ecdc_4px_8px)]';

const Canvas = forwardRef<
  HTMLDivElement,
  {
    label: string;
    describedBy: string;
    grid: Grid;
    kind: Kind;
    editable: (r: number, c: number) => boolean;
    isGiven: (r: number, c: number) => boolean;
    echo: (r: number, c: number) => boolean;
    marks: ReadonlySet<string>;
    painting: boolean;
    job: Job | null;
    /** Expert: squares said by their corners' coordinates, no mirror line till a miss (`overlay`) — but the free canvas's. */
    coords: boolean;
    overlay: Overlay;
    onPaint: (r: number, c: number) => void;
  }
>(function Canvas({ label, describedBy, grid, kind, editable, isGiven, echo, marks, painting, job, coords, overlay, onPaint }, ref) {
  // The square in the tab order (roving): the first editable one until the kid moves (a new picture starts afresh: keyed).
  const [at, setAt] = useState<[number, number] | null>(null);
  const firstEditable = useMemo(() => {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (editable(r, c)) return [r, c] as [number, number];
    return null;
  }, [editable]);
  // In the arrow keys' grid: the kid's squares — and on Expert, while painting, the given ones, to read.
  const reading = coords && painting && job !== null;
  const inGrid = (r: number, c: number) => editable(r, c) || (reading && isGiven(r, c));
  const focusAt = at && inGrid(at[0], at[1]) ? at : firstEditable;
  // No line till a miss on Expert — but the free canvas has its mirror.
  const lines = !coords || !job;
  // The pointer painting, by id: a second finger or another button never starts or ends it (review round 1).
  const dragging = useRef<number | null>(null);
  const lift = (e: PointerEvent) => {
    if (dragging.current === e.pointerId) dragging.current = null;
  };

  function cellFrom(e: PointerEvent): [number, number] | null {
    const el = document.elementFromPoint?.(e.clientX, e.clientY) as HTMLElement | null;
    const k = el?.closest<HTMLElement>('[data-cell]')?.dataset.cell;
    if (!k) return null;
    const [r, c] = k.split(',').map(Number);
    return [r, c];
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) {
    const step: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    let rr = r + d[0];
    let cc = c + d[1];
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && !inGrid(rr, cc)) {
      rr += d[0];
      cc += d[1];
    }
    if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return;
    setAt([rr, cc]);
    const host = (e.currentTarget.parentElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-cell="${rr},${cc}"]`);
    host?.focus();
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className={cn('relative grid aspect-square w-full grid-cols-6 overflow-hidden rounded-md border-4 border-[#1b0f22] bg-[#f4ecdc] [container-type:inline-size]', painting && 'touch-none')}
      onPointerDown={(e) => {
        // The main button only; a new pointer while one paints only if it's the primary (the last one's lift was lost).
        if (!painting || e.button !== 0 || (dragging.current !== null && !e.isPrimary)) return;
        dragging.current = e.pointerId;
        const at = cellFrom(e);
        if (at && editable(at[0], at[1])) onPaint(at[0], at[1]);
      }}
      onPointerMove={(e) => {
        if (dragging.current !== e.pointerId) return;
        const at = cellFrom(e);
        if (at && editable(at[0], at[1])) onPaint(at[0], at[1]);
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onPointerLeave={lift}
    >
      {grid.map((row, r) =>
        row.map((v, c) => {
          const style = { background: v ? HEX[v] : undefined };
          const marked = marks.has(key(r, c));
          const glyph = v && (
            // Over Expert's line (UX review round 1: y = x hid the letters on it).
            <span
              aria-hidden="true"
              className={cn('pointer-events-none absolute inset-0 flex items-center justify-center text-[length:max(10px,4cqw)] font-black leading-none', coords && 'z-[1]')}
              style={{ color: glyphInk(v) }}
            >
              {GLYPH[v]}
            </span>
          );
          const tab = focusAt && focusAt[0] === r && focusAt[1] === c ? 0 : -1;
          const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
            // A held Enter or Space presses once: its repeats would paint the square focus just came to (review
            // round 2: holding Enter on Mix them painted the first square).
            if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
            else onKey(e, r, c);
          };
          if (!editable(r, c) && inGrid(r, c)) {
            // Expert's given square, to read: in the grid, not painted.
            return (
              <button
                key={key(r, c)}
                type="button"
                data-cell={key(r, c)}
                tabIndex={tab}
                aria-disabled="true"
                aria-label={`Square ${squareWords(r, c)}: ${v ? NAME[v] : 'bare'}, given.`}
                onFocus={() => setAt([r, c])}
                onKeyDown={keys}
                className={cn(squareClass, !v && HATCH)}
                style={style}
              >
                {glyph}
              </button>
            );
          }
          if (!editable(r, c)) {
            return (
              <div
                key={key(r, c)}
                data-cell={key(r, c)}
                aria-hidden="true"
                className={cn('relative border-[0.5px] border-[#1b0f22]/15', !v && 'bg-[#f4ecdc]', isGiven(r, c) && !v && HATCH)}
                style={style}
              >
                {echo(r, c) && <span className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.5)_0_3px,transparent_3px_8px)]" />}
                {glyph}
                {marked && <Mark />}
              </div>
            );
          }
          const [sr, sc] = source(kind, r, c);
          const from = grid[sr][sc];
          // Expert's says which square it's the image of only once it's marked — the hint after a miss, as the line is.
          const copy = !job
            ? ''
            : coords
              ? marked
                ? `It’s the image of the square ${squareWords(sr, sc)}: ${from ? NAME[from] : 'bare'}.`
                : ''
              : `It copies the square at row ${sr + 1}, square ${sc + 1}: ${from ? NAME[from] : 'bare'}${kind === 'opposite' && from ? ` — paint its opposite` : ''}.`;
          const place = coords ? `Square ${squareWords(r, c)}` : `Row ${r + 1}, square ${c + 1}`;
          return (
            <button
              key={key(r, c)}
              type="button"
              data-cell={key(r, c)}
              data-marked={marked || undefined}
              tabIndex={tab}
              aria-label={`${place}: ${v ? NAME[v] : 'bare'}.${copy ? ` ${copy}` : ''}${marked ? ' Doesn’t match yet.' : ''}`}
              onClick={(e) => {
                // A press from the keyboard (a pointer press paints on pointer down).
                if (e.detail === 0) onPaint(r, c);
              }}
              onFocus={() => setAt([r, c])}
              onKeyDown={keys}
              className={squareClass}
              style={style}
            >
              {glyph}
              {!v && <span aria-hidden="true" className="pointer-events-none absolute inset-[3px] rounded-sm border-2 border-dashed border-[#1b0f22]/30" />}
              {marked && <Mark />}
            </button>
          );
        }),
      )}
      {/* Expert's mark (A and A′, or the move after a miss). */}
      {coords && job && overlay && <MoveMarks job={job} overlay={overlay} />}
      {/* The mirror line(s), and a half turn's middle — cyan and white with ink edges, clear on any paint. */}
      {lines && (kind === 'across' || kind === 'four' || kind === 'opposite') && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 bg-[repeating-linear-gradient(180deg,#22d3ee_0_8px,#ffffff_8px_13px)] shadow-[0_0_0_1.5px_#1b0f22]"
        />
      )}
      {lines && (kind === 'down' || kind === 'four') && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-[repeating-linear-gradient(90deg,#22d3ee_0_8px,#ffffff_8px_13px)] shadow-[0_0_0_1.5px_#1b0f22]"
        />
      )}
      {lines && kind === 'turn' && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-[#22d3ee] shadow-[0_0_0_1.5px_#1b0f22]" />}
      {lines && kind === 'turn' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[#1b0f22] bg-white text-xl font-black text-[#0e7490]"
        >
          ↻
        </span>
      )}
    </div>
  );
});

/**
 * The Grand Gallery, close up (§2.2): this round's three frames on the wall —
 * a finished picture as the kid painted it, the one being painted behind a
 * cloth, the next ones waiting — with Madame Hue and Ember below.
 */
function GalleryScene({
  queue,
  done,
  matched,
  finished,
  band,
  round,
}: {
  queue: readonly PatternId[];
  done: number;
  matched: boolean;
  finished: Partial<Record<PatternId, Grid>>;
  band: PlayBand;
  round: number;
}) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const hue = NPC_DEFS['chromaria-curator'];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(#7c3a5c_0_70%,#5b2a43_70%_100%)] px-3 pt-2">
      <div className="flex items-end justify-center gap-[4%]">
        {[0, 1, 2].map((i) => {
          const pic = finished[jobFor(band, round, i, queue).pattern];
          return (
            <div key={i} className="rounded-sm border-[6px] border-[#c48a52] bg-[#1b0f22] p-1 shadow-[0_4px_0_#1b0f22]">
              {pic ? (
                <PixelPicture grid={pic} size={72} />
              ) : (
                <span aria-hidden="true" className={cn('flex h-[72px] w-[72px] items-center justify-center text-2xl font-black', i === done ? 'bg-[#a3195b] text-amber-200' : 'bg-[#4b4799] text-[#c9c5f2]')}>
                  {i === done ? '🎨' : '?'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <span aria-hidden="true" className="absolute bottom-[4%] left-[6%]">
        <EmberSprite anim={matched ? 'cheer' : undefined} scale={3} />
      </span>
      <span aria-hidden="true" className="absolute bottom-[4%] right-[6%] flex items-end">
        {hue && <CharacterPortrait spriteId={npcSpriteId(hue, flags)} emoji={npcEmoji(hue, flags)} scale={3} className="text-5xl" />}
      </span>
      <span className="sr-only">
        Picture {Math.min(done + 1, JOBS_PER_ROUND)} of {JOBS_PER_ROUND}
        {matched ? ', finished' : ''}.
      </span>
    </div>
  );
}

/**
 * The Gallery: a page per picture finished — in the kid's colours if it was
 * painted this round, else its own; tapped, read out — by Madame Hue, and
 * under the book. The kid's own picture hangs beside them.
 */
function GalleryBook({
  known,
  painted,
  mine,
  read,
  onRead,
}: {
  known: (id: PatternId) => boolean;
  painted: Partial<Record<PatternId, Grid>>;
  mine: Grid | null;
  read: PatternId | 'mine' | null;
  onRead: (id: PatternId | 'mine', e: { detail: number }) => void;
}) {
  const count = PATTERNS.filter((p) => known(p.id)).length;
  const reading = read && read !== 'mine' ? PATTERN_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="mm-book" className="order-2 mt-auto flex flex-col gap-2 sm:order-none">
      <div className="flex items-baseline justify-between">
        <h2 id="mm-book" className={cn(pixelHeadClass, 'text-2xl')}>
          Gallery
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {PATTERNS.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-1.5">
        {PATTERNS.map((p) => (
          <li key={p.id}>
            {known(p.id) ? (
              <button
                type="button"
                onClick={(e) => onRead(p.id, e)}
                aria-pressed={read === p.id}
                aria-label={`${p.name}. Read the page`}
                className={cn('flex h-[72px] w-full flex-col items-center justify-center gap-0.5 rounded border-[3px] bg-[#fff6dc] hover:bg-white', read === p.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <PixelPicture grid={painted[p.id] ?? paint(p, ...GALLERY_COLOURS[p.id])} size={40} />
                <span aria-hidden="true" className="w-full truncate text-center text-[12px] font-bold leading-tight tracking-tight text-[#1b0f22]">
                  {p.name}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A picture not painted yet" className="flex h-[72px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                ?
              </span>
            )}
          </li>
        ))}
      </ul>
      {mine && (
        <button
          type="button"
          onClick={(e) => onRead('mine', e)}
          aria-pressed={read === 'mine'}
          aria-label="Your own picture. Look at it"
          className={cn('flex items-center gap-3 rounded border-[3px] bg-[#fff6dc] p-1.5 text-left text-[15px] font-bold text-[#1b0f22]', read === 'mine' ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
        >
          <PixelPicture grid={mine} size={56} />
          Yours — hanging in the Gallery
        </button>
      )}
      {/* The page read (Madame Hue's bubble says it too, and is the live region). */}
      {reading && (
        <div ref={panel} className="rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <b>{reading.name}</b> — {reading.note}
        </div>
      )}
      {read === 'mine' && mine && (
        <div ref={panel} className="flex justify-center rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] p-2">
          <PixelPicture grid={mine} size={144} />
        </div>
      )}
    </section>
  );
}
