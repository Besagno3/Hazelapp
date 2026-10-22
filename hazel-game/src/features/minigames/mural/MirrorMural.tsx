import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  FREE_PALETTE,
  HEX,
  JOBS_PER_ROUND,
  NAME,
  PATTERNS,
  PATTERN_BY_ID,
  POTS,
  SIZE,
  checkWords,
  decodeMine,
  encodeMine,
  given,
  jobFor,
  jobWords,
  learnedLine,
  mirrored,
  mismatches,
  mix,
  mixWords,
  paint,
  roundQueue,
  source,
  start,
  type Cell,
  type Colour,
  type Grid,
  type Job,
  type Kind,
  type PatternId,
  type Pot,
} from '../../../lib/minigames/mural';
import { BAND_LABEL, mineFlag, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { PixelPicture } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

type Step = 'mix' | 'paint' | 'checked' | 'free';
/** What the brush puts down: a paint, or bare wall again. */
type Brush = Colour | 'rub';

/** Madame Hue after a picture matches, in turn. */
const RIGHT_LINES = ['Magnifique! It’s a perfect reflection.', 'Darling, the mirror couldn’t have done it better!', 'Exquisite! Straight onto the Gallery wall.'];

/** The colours each picture shows in the Gallery (its own, whatever band it was painted at). */
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const key = (r: number, c: number) => `${r},${c}`;

/** Room kept under the canvas from `sm` up for its paints and the mirror button; beside it on a short screen. */
const UNDER_CANVAS_PX = 150;
const BESIDE_CANVAS_PX = 176;

const MIRROR_HINT: Record<Kind, string> = {
  across: 'Each square on the right copies the square across the mirror line.',
  down: 'Each square on the bottom copies the square across the mirror line.',
  four: 'Two mirror lines: every quarter copies the top-left one, flipped.',
  turn: 'Half a turn: the bottom half is the top half upside down — the bottom-right corner copies the top-left.',
  opposite: 'Each square on the right is the opposite colour of the square across the line.',
};

/**
 * 🪞 Mirror Mural (docs/DESIGN-MINIGAMES.md §5.4), in Madame Hue's Grand
 * Gallery: half of each picture is painted. The kid mixes the paint it needs
 * from two pots, paints the rest (tap or drag across the squares; or the
 * arrow keys and Enter), and holds up the mirror: what doesn't match yet is
 * marked and can be fixed. Three pictures a round, then a free canvas — the
 * kid paints the left half, the mirror the rest, and it hangs in the Gallery.
 * No timer. Rules: `lib/minigames/mural.ts`.
 */
export default function MirrorMural({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const update = useSaveStore((s) => s.update);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which pictures come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue((id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const pattern = PATTERN_BY_ID[job.pattern];
  const [step, setStep] = useState<Step>('mix');
  const [chosen, setChosen] = useState<Pot[]>([]);
  const [mixSaid, setMixSaid] = useState<string | null>(null);
  const [grid, setGrid] = useState<Cell[][]>(() => start(job));
  const [brush, setBrush] = useState<Brush>(job.mixColour);
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  const [right, setRight] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [newPage, setNewPage] = useState(false);
  const [read, setRead] = useState<PatternId | 'mine' | null>(null);
  const [rights, setRights] = useState(0);
  const [free, setFree] = useState<Cell[][]>(() => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null)));
  const known = (id: PatternId) => !!flags[pageFlag(def.id, id)];
  const mine = useMemo(() => {
    const prefix = mineFlag(def.id);
    const k = Object.keys(flags).find((f) => f.startsWith(prefix) && flags[f]);
    return k ? decodeMine(k.slice(prefix.length)) : null;
  }, [flags, def.id]);
  const painting = step === 'paint' || step === 'free';
  const shown = step === 'free' ? mirrored(free) : grid;

  // Focus follows the picture: the mix (described by the job), the first square to paint, what the mirror showed,
  // the free canvas.
  const mixHead = useRef<HTMLHeadingElement>(null);
  const resultHead = useRef<HTMLHeadingElement>(null);
  const freeHead = useRef<HTMLHeadingElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (step === 'mix') mixHead.current?.focus({ preventScroll: true });
    else if (step === 'paint') canvas.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus({ preventScroll: true });
    else if (step === 'checked') resultHead.current?.focus({ preventScroll: true });
    else freeHead.current?.focus({ preventScroll: true });
  }, [step, done, again]);

  // What a step works with comes into view as it starts — never as a square is painted: the pots and Mix; the canvas
  // with its paints and the mirror (on a phone, all together under the header); what the mirror showed.
  const goRef = useRef<HTMLButtonElement>(null);
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    const how = { block: 'nearest' as const, behavior: still ? ('auto' as const) : ('smooth' as const) };
    if (step === 'paint' || step === 'free') board.current?.scrollIntoView?.(how);
    else goRef.current?.scrollIntoView?.(how);
  }, [step, done, again]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickPot(p: Pot) {
    sfx('select');
    setRead(null);
    setMixSaid(null);
    setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p].slice(-2)));
  }

  function doMix() {
    if (step !== 'mix' || chosen.length < 2) return;
    const [a, b] = chosen;
    const words = mixWords(a, b, job.mixColour);
    setMixSaid(words);
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

  function check() {
    if (step !== 'paint') return;
    setRead(null);
    const off = mismatches(job, grid);
    if (off.length === 0) {
      sfx('chest');
      setRight(true);
      setNewPage(onPage(job.pattern, pattern.name));
      setLessons((l) => [...l, learnedLine(job)]);
      setRights((n) => n + 1);
    } else {
      sfx('wrong');
      setRight(false);
      setMarks(new Set(off.map(([r, c]) => key(r, c))));
    }
    setStep('checked');
  }

  function fix() {
    setStep('paint');
    setAgain((n) => n + 1);
  }

  function next() {
    if (!right) return;
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
    setMarks(new Set());
    setRight(false);
    setNewPage(false);
    setBrush(nextJob.mixColour);
    setStep('mix');
  }

  const learned = lessons[lessons.length - 1] ?? '';
  function finish() {
    onFinish({ title: 'Three pictures finished!', learned });
  }

  /** Hang the free canvas in the Gallery: one picture at a time, in the kid's save (§3.5). */
  function hang() {
    if (step !== 'free' || !free.some((row) => row.some(Boolean))) return;
    const prefix = mineFlag(def.id);
    update((s) => ({
      ...s,
      flags: { ...Object.fromEntries(Object.entries(s.flags).filter(([k]) => !k.startsWith(prefix))), [mineFlag(def.id, encodeMine(free))]: true },
    }));
    sfx('chest');
    finish();
  }

  const stepIndex = step === 'mix' ? 0 : step === 'paint' ? 1 : 2;
  const freeEmpty = !free.some((row) => row.some(Boolean));
  const off = step === 'checked' && !right ? mismatches(job, grid).length : 0;

  let line: string;
  const readPage = read === 'mine' ? null : read ? PATTERN_BY_ID[read] : null;
  if (read === 'mine') line = 'Your own picture, darling — the mirror painted the right half. Paint another after three pictures and it takes its place.';
  else if (readPage) line = `${readPage.name}: ${readPage.note}`;
  else if (step === 'mix') line = mixSaid ?? `The ${pattern.name} needs ${NAME[job.mixColour]}. Pick two pots and mix them, darling!`;
  else if (step === 'paint') line = mixSaid && !marks.size ? `${mixSaid} Now paint: ${MIRROR_HINT[job.kind].charAt(0).toLowerCase()}${MIRROR_HINT[job.kind].slice(1)}` : MIRROR_HINT[job.kind];
  else if (step === 'checked' && right)
    line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'On to the next picture!' : 'Now one of your own!'}`;
  else if (step === 'checked') line = 'Nearly, darling! The mirror has marked the squares that don’t match yet.';
  else line = 'Your turn! Paint the left half — the mirror paints the rest — and it hangs in my Gallery.';

  const palette: readonly Colour[] = step === 'free' ? FREE_PALETTE : job.palette;
  const [area, fit, short] = useCanvasSize();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden">
      {/* The Gallery above the canvas from `sm` up; a phone and a short screen keep just the canvas. */}
      <div className="grid flex-none grid-cols-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_300px] sm:grid-rows-[minmax(0,32fr)_minmax(0,68fr)] lg:grid-cols-[minmax(0,1fr)_380px] sm:[@media(max-height:500px)]:grid-rows-[minmax(0,1fr)]">
        <section aria-label="The Grand Gallery" className="relative hidden overflow-hidden sm:col-start-1 sm:row-start-1 sm:block [@media(max-height:500px)]:hidden">
          <GalleryScene queue={queue} done={done} right={right} band={band} round={round} />
        </section>

        <section
          ref={board}
          aria-labelledby="mm-canvas"
          className="flex flex-col gap-2 bg-[#3b2a4a] px-2 pb-2 pt-1.5 sm:col-start-1 sm:row-start-2 sm:min-h-0 sm:border-t-4 sm:border-[#1b0f22] sm:p-4 [@media(max-height:500px)]:row-start-1 [@media(max-height:500px)]:border-t-0 [@media(max-height:500px)]:p-2"
        >
          {/* The canvas as big as its space allows, its paints and the mirror under it — beside it on a short screen,
              where under it they'd go below the fold. */}
          <div ref={area} className="flex w-full justify-center sm:min-h-0 sm:flex-1 sm:items-center">
            <div
              className={cn('flex w-full max-w-[340px] flex-col gap-2 sm:max-w-none', short && 'flex-row items-center gap-3')}
              style={fit && !short ? { width: fit } : undefined}
            >
              <div className="flex flex-none flex-col gap-2" style={fit && short ? { width: fit } : undefined}>
                <h2 id="mm-canvas" className={cn(pixelHeadClass, 'text-lg text-[#fde68a] sm:text-2xl [@media(max-width:639px)]:sr-only [@media(max-height:500px)]:sr-only')}>
                  {step === 'free' ? 'Your canvas' : `The ${pattern.name}`}
                </h2>
                <Canvas
                  ref={canvas}
                  grid={shown}
                  kind={step === 'free' ? 'across' : job.kind}
                  editable={(r, c) => (step === 'free' ? c < SIZE / 2 : step === 'paint' && !given(job.kind, r, c))}
                  isGiven={(r, c) => step !== 'free' && given(job.kind, r, c)}
                  marks={step === 'paint' || step === 'checked' ? marks : EMPTY_MARKS}
                  painting={painting}
                  job={step === 'free' ? null : job}
                  onPaint={paintAt}
                />
              </div>
              <div className={cn('flex flex-col gap-2', short && 'min-w-0 flex-1')}>
                {painting && (
                  <div role="group" aria-label="Paints" className="flex flex-wrap justify-center gap-1.5">
                    {palette.map((c) => (
                      <PaintButton key={c} colour={c} on={brush === c} onPick={() => pickBrush(c)} />
                    ))}
                    <button
                      type="button"
                      onClick={() => pickBrush('rub')}
                      aria-pressed={brush === 'rub'}
                      className={cn(
                        'flex min-h-11 items-center gap-1.5 rounded-lg border-[3px] px-2 text-[13px] font-bold',
                        brush === 'rub' ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a]',
                        focusRing,
                      )}
                    >
                      <span aria-hidden="true" className="h-5 w-5 rounded border-2 border-dashed border-[#c9c5f2] bg-[#f4ecdc]" />
                      Rub out
                    </button>
                  </div>
                )}
                {step === 'paint' && (
                  <button ref={goRef} type="button" onClick={check} className={cn(goldClass, 'h-14 text-lg')}>
                    🪞 Hold up the mirror
                  </button>
                )}
                {step === 'free' && (
                  <div className="flex flex-col gap-2">
                    <button ref={goRef} type="button" onClick={hang} aria-disabled={freeEmpty || undefined} className={cn(goldClass, 'h-14 text-lg')}>
                      {freeEmpty ? 'Paint a square first' : '🖼️ Hang it in the Gallery'}
                    </button>
                    <button type="button" onClick={finish} className={cn(outlineClass, 'min-h-11 border-2 text-sm')}>
                      Not this time
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:overflow-y-auto sm:border-l-4 sm:p-4">
          <HostBubble npcId={def.host} line={line} phoneStrip />
          {step !== 'free' && (
            <div className="order-1 sm:order-none">
              <Ticket heading={`PAINT THE ${pattern.name.toUpperCase()}`} ready={right} icon={<KindBadge kind={job.kind} />} id="mm-job">
                {jobWords(job)}
              </Ticket>
            </div>
          )}

          <div className={cn(windowClass, 'flex flex-col gap-3 p-3.5 [@media(max-height:500px)]:order-first')}>
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2]">
              {step === 'free' ? 'Your own picture' : `Picture ${done + 1} of ${JOBS_PER_ROUND}`}
            </p>

            {step === 'mix' && (
              <>
                <h2 ref={mixHead} tabIndex={-1} aria-describedby="mm-job" className={cn(pixelHeadClass, 'self-start rounded text-[26px]', focusRing)}>
                  Step 1 · Mix the paint
                </h2>
                <p className="text-[15px] leading-snug text-[#e4e1ff]">
                  The picture needs <ColourWord colour={job.mixColour} />. Pick two pots, then mix them.
                </p>
                <div role="group" aria-label="Paint pots" className="grid grid-cols-2 gap-2">
                  {POTS[band].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => pickPot(p)}
                      aria-pressed={chosen.includes(p)}
                      className={cn(
                        'flex min-h-[52px] items-center gap-2 rounded-lg border-[3px] px-2 text-left font-bold',
                        chosen.includes(p) ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a] hover:bg-[#2f2b70]',
                        focusRing,
                      )}
                    >
                      <PotArt colour={p} />
                      {cap(p)}
                    </button>
                  ))}
                </div>
                <p role="status" className="min-h-[1.25rem] text-center text-[15px] font-bold">
                  {mixSaid ?? (chosen.length === 0 ? 'No pots picked yet.' : chosen.length === 1 ? `${cap(chosen[0])} — and one more.` : `${cap(chosen[0])} and ${chosen[1]}.`)}
                </p>
                <button ref={goRef} type="button" onClick={doMix} aria-disabled={chosen.length < 2 || undefined} className={cn(goldClass, 'h-14 text-lg')}>
                  {chosen.length < 2 ? 'Pick two pots' : 'Mix them'}
                </button>
              </>
            )}

            {step === 'paint' && (
              <>
                <h2 className={cn(pixelHeadClass, 'text-[26px]')}>Step 2 · Paint the other half</h2>
                <JobLine job={job} />
                <p className="text-[15px] leading-snug text-[#e4e1ff]">
                  Pick a paint, then tap or drag across the squares. {MIRROR_HINT[job.kind]}
                </p>
                {marks.size > 0 && (
                  <p className="rounded-md bg-[#fde68a] px-2.5 py-1.5 text-[15px] font-bold text-[#1b0f22]">
                    {marks.size === 1 ? 'One square to fix — it’s marked !' : `${cap(numWord(marks.size))} squares to fix — they’re marked !`}
                  </p>
                )}
              </>
            )}

            {step === 'checked' && (
              <>
                <h2 ref={resultHead} tabIndex={-1} aria-describedby="mm-result" className={cn(pixelHeadClass, 'self-start rounded text-[28px] text-white', focusRing)}>
                  {right ? 'A perfect match!' : 'Not quite yet'}
                </h2>
                <p id="mm-result" className={cn('rounded-lg px-3 py-2 text-[15px] font-bold text-[#1b0f22]', right ? 'bg-amber-300' : 'bg-[#d4d0f5]')}>
                  {right ? learnedLine(job) : checkWords(job, grid)}
                  {right && newPage && ` The ${pattern.name} is in the Gallery!`}
                </p>
                {right ? (
                  <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'text-lg')}>
                    {done + 1 < JOBS_PER_ROUND ? 'Next picture' : 'Next — paint your own!'}
                  </button>
                ) : (
                  <button ref={goRef} type="button" onClick={fix} className={cn(goldClass, 'text-lg')} aria-describedby={off ? 'mm-result' : undefined}>
                    Fix the picture
                  </button>
                )}
              </>
            )}

            {step === 'free' && (
              <>
                <h2 ref={freeHead} tabIndex={-1} className={cn(pixelHeadClass, 'self-start rounded text-[26px]', focusRing)}>
                  Your turn!
                </h2>
                <p className="text-[15px] leading-snug text-[#e4e1ff]">Paint the left half — the mirror paints the right. Hang it and it takes the place of any you painted before.</p>
              </>
            )}
          </div>

          <GalleryBook known={known} mine={mine} read={read} onRead={(id) => setRead(id)} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 sm:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={['Mix', 'Paint', 'Mirror']} current={step === 'free' ? 3 : stepIndex} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

const EMPTY_MARKS: ReadonlySet<string> = new Set();

/**
 * The canvas's size from `sm` up: as big as its space allows, keeping room
 * under it for the paints and the mirror — or, on a short screen, beside it
 * (`short`). On a phone the page scrolls and the canvas takes its width: null.
 */
function useCanvasSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ size: number | null; short: boolean }>({ size: null, short: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (!window.matchMedia?.('(min-width: 640px)').matches) return setFit({ size: null, short: false });
      const short = window.matchMedia('(max-height: 500px)').matches;
      const { width: w, height: h } = el.getBoundingClientRect();
      const size = short ? Math.min(h - 8, w - BESIDE_CANVAS_PX) : Math.min(w, h - UNDER_CANVAS_PX);
      setFit({ size: size > 120 ? Math.floor(size) : null, short });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  return [ref, fit.size, fit.short] as const;
}
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const numWord = (n: number) => NUM[n] ?? String(n);

function withCell(g: readonly (readonly Cell[])[], r: number, c: number, v: Cell): Cell[][] {
  return g.map((row, rr) => (rr === r ? row.map((x, cc) => (cc === c ? v : x)) : [...row]));
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
    <svg width="30" height="30" viewBox="0 0 60 60" aria-hidden="true" className="flex-none">
      <path d="M10 18 h40 l-5 36 h-30 z" fill={HEX[colour]} stroke="#1b0f22" strokeWidth="5" strokeLinejoin="round" />
      <rect x="6" y="10" width="48" height="10" rx="3" fill="#cbd5e1" stroke="#1b0f22" strokeWidth="5" />
    </svg>
  );
}

/** A paint in the palette: its colour and its name. */
function PaintButton({ colour, on, onPick }: { colour: Colour; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn('flex min-h-11 items-center gap-1.5 rounded-lg border-[3px] px-2 text-[13px] font-bold', on ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a]', focusRing)}
    >
      <span aria-hidden="true" className="h-5 w-5 rounded-full border-2 border-[#1b0f22]" style={{ background: HEX[colour] }} />
      {cap(NAME[colour])}
    </button>
  );
}

/** The kind of mirror, as a small sign for the ticket. */
function KindBadge({ kind }: { kind: Kind }) {
  return (
    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-md border-[3px] border-[#1b0f22] bg-[#f4ecdc]">
      <svg width="24" height="24" viewBox="0 0 24 24">
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

/** The job, in the step card on a phone or a short screen (the ticket is further down there). */
function JobLine({ job }: { job: Job }) {
  return (
    <p aria-hidden="true" className="flex items-center gap-2 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[15px] leading-snug text-[#1b0f22] sm:[@media(min-height:501px)]:hidden">
      <span className="flex-none">
        <KindBadge kind={job.kind} />
      </span>
      <b>{jobWords(job)}</b>
    </p>
  );
}

/**
 * The canvas: a grid of squares with its mirror line(s). The kid's squares are
 * buttons — one in the tab order at a time, arrow keys move between them,
 * Enter / Space paints — named by place, colour, the square they copy and a
 * mark; a press or a drag across them paints. Given squares are pictures.
 */
const Canvas = forwardRef<
  HTMLDivElement,
  {
    grid: Grid;
    kind: Kind;
    editable: (r: number, c: number) => boolean;
    isGiven: (r: number, c: number) => boolean;
    marks: ReadonlySet<string>;
    painting: boolean;
    job: Job | null;
    onPaint: (r: number, c: number) => void;
  }
>(function Canvas({ grid, kind, editable, isGiven, marks, painting, job, onPaint }, ref) {
  // The square in the tab order (roving): the first editable one until the kid moves.
  const [at, setAt] = useState<[number, number] | null>(null);
  const firstEditable = useMemo(() => {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (editable(r, c)) return [r, c] as [number, number];
    return null;
  }, [editable]);
  const focusAt = at && editable(at[0], at[1]) ? at : firstEditable;
  const dragging = useRef(false);

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
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && !editable(rr, cc)) {
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
      aria-label="The picture"
      aria-describedby="mm-job"
      className={cn('relative grid aspect-square w-full grid-cols-6 overflow-hidden rounded-md border-4 border-[#1b0f22] bg-[#f4ecdc]', painting && 'touch-none')}
      onPointerDown={(e) => {
        if (!painting) return;
        dragging.current = true;
        const at = cellFrom(e);
        if (at && editable(at[0], at[1])) onPaint(at[0], at[1]);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const at = cellFrom(e);
        if (at && editable(at[0], at[1])) onPaint(at[0], at[1]);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onPointerLeave={() => (dragging.current = false)}
    >
      {grid.map((row, r) =>
        row.map((v, c) => {
          const style = { background: v ? HEX[v] : undefined };
          const marked = marks.has(key(r, c));
          if (!editable(r, c)) {
            return (
              <div
                key={key(r, c)}
                data-cell={key(r, c)}
                aria-hidden="true"
                className={cn('border-[0.5px] border-[#1b0f22]/15', !v && 'bg-[#f4ecdc]', isGiven(r, c) && !v && 'bg-[repeating-linear-gradient(45deg,#efe4cf_0_4px,#f4ecdc_4px_8px)]')}
                style={style}
              />
            );
          }
          const [sr, sc] = source(kind, r, c);
          const from = grid[sr][sc];
          const copy = job
            ? `It copies the square at row ${sr + 1}, square ${sc + 1}: ${from ? NAME[from] : 'bare'}${kind === 'opposite' && from ? ` — paint its opposite` : ''}.`
            : '';
          return (
            <button
              key={key(r, c)}
              type="button"
              data-cell={key(r, c)}
              tabIndex={focusAt && focusAt[0] === r && focusAt[1] === c ? 0 : -1}
              aria-label={`Row ${r + 1}, square ${c + 1}: ${v ? NAME[v] : 'bare'}.${copy ? ` ${copy}` : ''}${marked ? ' Doesn’t match yet.' : ''}`}
              onClick={(e) => {
                // A press from the keyboard (a pointer press paints on pointer down).
                if (e.detail === 0) onPaint(r, c);
              }}
              onFocus={() => setAt([r, c])}
              onKeyDown={(e) => onKey(e, r, c)}
              className={cn('relative border-[0.5px] border-[#1b0f22]/25 outline-none focus-visible:z-10 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-cyan-300')}
              style={style}
            >
              {marked && (
                <span aria-hidden="true" className="absolute inset-0.5 flex items-start justify-end rounded-sm border-[3px] border-dashed border-[#e8483f]">
                  <span className="m-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#e8483f] text-[11px] font-black leading-none text-white">!</span>
                </span>
              )}
            </button>
          );
        }),
      )}
      {/* The mirror line(s), and a half turn's middle. */}
      {(kind === 'across' || kind === 'four' || kind === 'opposite') && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 bg-[repeating-linear-gradient(180deg,#22d3ee_0_8px,transparent_8px_13px)]" />
      )}
      {(kind === 'down' || kind === 'four') && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-[repeating-linear-gradient(90deg,#22d3ee_0_8px,transparent_8px_13px)]" />
      )}
      {kind === 'turn' && (
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[#1b0f22] bg-white text-xl font-black text-[#0e7490]">
          ↻
        </span>
      )}
      {kind === 'turn' && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-[#22d3ee]/60" />
      )}
    </div>
  );
});

/**
 * The Grand Gallery, close up (§2.2): this round's three frames on the wall —
 * a finished picture in its own colours, the one being painted behind a cloth,
 * the next ones waiting — with Madame Hue and Ember below.
 */
function GalleryScene({ queue, done, right, band, round }: { queue: readonly PatternId[]; done: number; right: boolean; band: PlayProps['band']; round: number }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const hue = NPC_DEFS['chromaria-curator'];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[linear-gradient(#7c3a5c_0_70%,#5b2a43_70%_100%)] px-3 pt-2">
      <div className="flex items-end justify-center gap-[4%]">
        {[0, 1, 2].map((i) => {
          const finished = i < done || (i === done && right);
          const job = jobFor(band, round, i, queue);
          return (
            <div key={i} className="rounded-sm border-[6px] border-[#c48a52] bg-[#1b0f22] p-1 shadow-[0_4px_0_#1b0f22]">
              {finished ? (
                <PixelPicture grid={job.goal} size={72} />
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
        <EmberSprite anim={right ? 'cheer' : undefined} scale={3} />
      </span>
      <span aria-hidden="true" className="absolute bottom-[4%] right-[6%] flex items-end">
        {hue && <CharacterPortrait spriteId={npcSpriteId(hue, flags)} emoji={npcEmoji(hue, flags)} scale={3} className="text-5xl" />}
      </span>
      <span className="sr-only">
        Picture {Math.min(done + 1, JOBS_PER_ROUND)} of {JOBS_PER_ROUND}
        {right ? ', finished' : ''}.
      </span>
    </div>
  );
}

/**
 * The Gallery: a page per picture finished, each in its own colours; tapped,
 * read out — by Madame Hue, and under the book. The kid's own picture hangs
 * beside them.
 */
function GalleryBook({ known, mine, read, onRead }: { known: (id: PatternId) => boolean; mine: Grid | null; read: PatternId | 'mine' | null; onRead: (id: PatternId | 'mine') => void }) {
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
                onClick={() => onRead(p.id)}
                aria-pressed={read === p.id}
                aria-label={`${p.name}. Read the page`}
                className={cn('flex h-[72px] w-full flex-col items-center justify-center gap-0.5 rounded border-[3px] bg-[#fff6dc] hover:bg-white', read === p.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <PixelPicture grid={paint(p, ...GALLERY_COLOURS[p.id])} size={40} />
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
          onClick={() => onRead('mine')}
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
