import { forwardRef, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  CHIME,
  ECHOES_PER_ROUND,
  TUNES,
  TUNE_BY_ID,
  echoFor,
  echoWords,
  height,
  judge,
  learnedLine,
  noteWords,
  roundQueue,
  shape,
  shapeQuestion,
  shapeWords,
  spotWords,
  tapWords,
  type Echo,
  type Note,
  type Shape,
  type TuneId,
} from '../../../lib/minigames/echo';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { playTone } from '../../../lib/tones';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useSettled } from '../useSettled';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Listening; the tune's shape; which note was wrong; playing it back; echoed. */
type Step = 'listen' | 'shape' | 'spot' | 'play' | 'done';

/** How long a note of Lyra's lasts, and the pause before the first. */
const BEAT_MS = 650;
const LEAD_MS = 300;

/** Bard Lyra after a tune's echoed, in turn. */
const RIGHT_LINES = ['Bravo! That’s just how it goes.', 'La la LAAA — a perfect echo!', 'Wonderful! You have a musician’s ears.'];

/** Where a note sits on the staff, said — its place, not its name: reading it is the job. */
const PLACE: Record<Note, string> = {
  C: 'on a little line below the staff',
  D: 'just under the staff',
  E: 'on the bottom line',
  F: 'in the bottom space',
  G: 'on the second line',
};

const SHAPES: readonly { id: Shape; label: string; arrow: string }[] = [
  { id: 'higher', label: 'Higher', arrow: '↑' },
  { id: 'lower', label: 'Lower', arrow: '↓' },
  { id: 'same', label: 'The same', arrow: '→' },
];

const STEP_CHIPS: Record<Echo['mode'], readonly string[]> = {
  ear: ['Listen', 'Up or down?', 'Play it back'],
  staff: ['Read: up or down?', 'Play it'],
  wrong: ['Listen', 'Spot the wrong note', 'Play it right'],
};

/**
 * 🎵 Echo's Call (docs/DESIGN-MINIGAMES.md §5.5), in Bard Lyra's Music House:
 * Lyra plays the start of an old tune on five coloured chimes (or three); the
 * kid says whether it ended higher, lower or the same, then plays it back. On
 * Tricky the tune is read from a staff, or Lyra plays one note wrong and the
 * kid finds it on the staff. Three tunes a round, each a note longer; each a
 * page of the Songbook. The chimes light up as they ring, so it's all there
 * with the sound off. No timer. Rules: `lib/minigames/echo.ts`.
 */
export default function EchosCall({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which tunes come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue(band, (id) => !!flags[pageFlag(def.id, id)], round));
  const echo = useMemo(() => echoFor(band, round, done, queue), [band, round, done, queue]);
  const tune = TUNE_BY_ID[echo.tune];
  const first: Step = echo.mode === 'staff' ? 'shape' : 'listen';
  const [step, setStep] = useState<Step>(first);
  const [heard, setHeard] = useState(false);
  const [playing, setPlaying] = useState(false);
  // The chime lit now: Lyra's (with which note of hers it is) or the kid's tap.
  const [lit, setLit] = useState<{ note: Note; at: number | null } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [heardSaid, setHeardSaid] = useState('');
  const [got, setGot] = useState<Note[]>([]);
  const [miss, setMiss] = useState(0);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  const [read, setRead] = useState<TuneId | null>(null);
  const known = (id: TuneId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}`);

  // Lyra's playing, note by note; stopped if the kid moves on (or leaves).
  const timers = useRef<number[]>([]);
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => stop, []);

  function listen() {
    if (playing || !settled()) return;
    stop();
    setRead(null);
    setPlaying(true);
    setLit(null);
    setHeardSaid('');
    const notes = echo.played;
    notes.forEach((n, k) => {
      timers.current.push(
        window.setTimeout(() => {
          setLit({ note: n, at: k });
          playTone(CHIME[n].hz);
        }, LEAD_MS + k * BEAT_MS),
      );
      timers.current.push(window.setTimeout(() => setLit(null), LEAD_MS + k * BEAT_MS + BEAT_MS * 0.7));
    });
    timers.current.push(
      window.setTimeout(
        () => {
          setPlaying(false);
          setHeard(true);
          // For a reader (and anyone): what was played, once it's done.
          setHeardSaid(`Lyra played ${notes.length} notes: ${notes.map(noteWords).join(', ')}.`);
        },
        LEAD_MS + notes.length * BEAT_MS,
      ),
    );
  }

  // A chime the kid taps: it rings and lights; in the play step, it's judged.
  const flash = useRef<number | null>(null);
  function ring(n: Note) {
    playTone(CHIME[n].hz, 500);
    setLit({ note: n, at: null });
    if (flash.current) window.clearTimeout(flash.current);
    flash.current = window.setTimeout(() => setLit(null), 320);
  }
  useEffect(() => () => void (flash.current && window.clearTimeout(flash.current)), []);

  function tap(n: Note) {
    if (playing) return;
    ring(n);
    setRead(null);
    if (step !== 'play') return;
    const i = got.length;
    setSaid(tapWords(echo, i, n));
    if (judge(echo, i, n) !== 'right') {
      sfx('wrong');
      setMiss((m) => m + 1);
      return;
    }
    const next = [...got, n];
    setGot(next);
    if (next.length < echo.notes.length) return;
    sfx('chest');
    setNewPage(onPage(echo.tune, tune.name));
    setLessons((l) => [...l, learnedLine(echo)]);
    setRights((r) => r + 1);
    setStep('done');
  }

  function answerShape(s: Shape) {
    if (step !== 'shape' || !settled()) return;
    setRead(null);
    sfx(s === shape(echo.notes) ? 'correct' : 'select');
    setSaid(shapeWords(echo, s));
    setStep('play');
  }

  function spot(at: number) {
    if (step !== 'spot' || playing || !settled()) return;
    setRead(null);
    setSaid(spotWords(echo, at));
    if (at === echo.wrongAt) {
      sfx('correct');
      setStep('play');
    } else sfx('wrong');
  }

  function next() {
    if (step !== 'done' || !settled()) return;
    stop();
    setRead(null);
    if (done + 1 >= ECHOES_PER_ROUND) {
      onFinish({ title: 'Three tunes echoed!', learned: lessons[lessons.length - 1] ?? '' });
      return;
    }
    const e = echoFor(band, round, done + 1, queue);
    setDone((d) => d + 1);
    setStep(e.mode === 'staff' ? 'shape' : 'listen');
    setHeard(false);
    setPlaying(false);
    setLit(null);
    setSaid(null);
    setHeardSaid('');
    setGot([]);
    setNewPage(false);
  }

  // Focus where each step starts: its heading (described by what to do), the first chime to play, what was echoed.
  const stepHead = useRef<HTMLHeadingElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  const chimes = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step === 'play') chimes.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    else if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else stepHead.current?.focus({ preventScroll: true });
  }, [step, done]);

  // Each step's gold button (or the chimes) comes into view as it starts — never as a chime is tapped.
  const goRef = useRef<HTMLButtonElement>(null);
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    const how = { block: 'nearest' as const, behavior: still ? ('auto' as const) : ('smooth' as const) };
    if (step === 'play') board.current?.scrollIntoView?.(how);
    else goRef.current?.scrollIntoView?.(how);
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = echo.notes.length;
  let line: string;
  if (read) line = `${TUNE_BY_ID[read].name}: ${TUNE_BY_ID[read].note}`;
  else if (said && step !== 'listen') line = said;
  else if (step === 'listen') line = playing ? 'Listen… and watch the chimes!' : heard ? 'Again, or on to my question?' : `Here’s the start of a tune: ${n} notes. Press Listen!`;
  else if (step === 'shape') line = echo.mode === 'staff' ? 'No listening this time — read my notes on the staff!' : shapeQuestion(echo);
  else if (step === 'spot') line = 'Watch the chimes and read the staff: which note did I play wrong?';
  else if (step === 'play') line = echo.mode === 'staff' ? 'Now play what the staff says!' : 'Your turn — play it back!';
  else line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < ECHOES_PER_ROUND ? 'Ready for the next one?' : 'Take a bow!'}`;

  const chips = STEP_CHIPS[echo.mode];
  const chipAt = step === 'done' ? chips.length : echo.mode === 'staff' ? (step === 'shape' ? 0 : 1) : step === 'listen' ? 0 : step === 'play' ? 2 : 1;
  const showStaff = echo.mode !== 'ear';
  const canListen = echo.mode !== 'staff' || step === 'done';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden">
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,30fr)_minmax(0,70fr)] [@media(min-width:1024px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:500px)]:grid-cols-[minmax(440px,1fr)_minmax(0,260px)] split:[@media(max-height:500px)]:grid-rows-[minmax(0,1fr)]">
        <section aria-label="The Music House" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:500px)]:hidden">
          <MusicHouse playing={playing} cheer={step === 'done'} />
        </section>

        {/* The chimes, and the step with its buttons beside them (under them on a phone): what to do is always by them,
            and a step's card growing never moves a chime. */}
        <section
          ref={board}
          aria-labelledby="ec-step"
          className="flex flex-col gap-3 bg-[#3b2a4a] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:flex-row split:border-t-4 split:border-[#1b0f22] split:p-4 [@media(max-height:500px)]:row-start-1 [@media(max-height:500px)]:border-t-0 [@media(max-height:500px)]:p-2"
        >
          {/* On a short screen the chimes keep a fixed column (five can be tapped) and the step takes the rest. */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 split:min-h-0 [@media(max-height:500px)]:w-[236px] [@media(max-height:500px)]:flex-none">
            <div className="flex w-full items-center justify-between gap-2 [@media(max-height:500px)]:hidden">
              <span className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2]">{showStaff ? 'The staff' : 'Lyra’s notes'}</span>
              <SoundToggle />
            </div>
            {/* The staff shows what's been played on it; Lyra's notes have slots. */}
            {showStaff ? (
              <Staff echo={echo} got={got} litAt={playing ? (lit?.at ?? null) : null} spotting={step === 'spot' && !playing} onSpot={spot} />
            ) : (
              <Slots echo={echo} got={got} litAt={playing && lit ? lit.at : null} playing={step === 'play'} miss={miss} />
            )}
            <Chimes ref={chimes} notes={echo.chimes} lit={lit?.note ?? null} busy={playing} still={still} describedBy={step === 'play' ? 'ec-play' : undefined} onTap={tap} />
            {/* What Lyra played, said once it's done (a chime lighting up isn't heard). */}
            <p role="status" className="sr-only">
              {heardSaid}
            </p>
          </div>
          <div
            className={cn(
              windowClass,
              'flex flex-col gap-2.5 p-3 split:w-[min(300px,42%)] split:flex-none split:overflow-y-auto [@media(max-height:500px)]:w-auto [@media(max-height:500px)]:min-w-0 [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:gap-2 [@media(max-height:500px)]:p-2.5',
            )}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden">
              Tune {done + 1} of {ECHOES_PER_ROUND}
            </p>
            {/* On a short screen the sound switch is here (the chimes' heading is left out for room). */}
            <span className="hidden [@media(max-height:500px)]:flex">
              <SoundToggle />
            </span>
            {step === 'done' ? (
              <>
                <h2
                  id="ec-step"
                  ref={doneHead}
                  tabIndex={-1}
                  aria-describedby="ec-result"
                  className={cn(pixelHeadClass, 'self-start rounded text-[26px] text-white [@media(max-height:500px)]:text-[20px]', focusRing)}
                >
                  {tune.name}!
                </h2>
                <p id="ec-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                  {lessons[lessons.length - 1]}
                  {newPage && ` ${tune.name} is in the Songbook!`}
                </p>
                <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'text-lg [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-base')}>
                  {done + 1 < ECHOES_PER_ROUND ? 'Next tune' : 'Take a bow!'}
                </button>
                <button type="button" onClick={listen} aria-disabled={playing || undefined} className={cn(outlineClass, 'min-h-11 border-2 px-3 text-sm')}>
                  ▶ Hear it again
                </button>
              </>
            ) : (
              <>
                <h2
                  id="ec-step"
                  ref={stepHead}
                  tabIndex={-1}
                  aria-describedby={step === 'play' ? undefined : 'ec-job'}
                  className={cn(pixelHeadClass, 'self-start rounded text-[24px] [@media(max-height:500px)]:text-[19px]', focusRing)}
                >
                  {stepTitle(step, echo.mode)}
                </h2>
                {step === 'listen' && (
                  <>
                    <p className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                      {echo.mode === 'wrong' ? 'Lyra plays the tune on the staff — but one note isn’t what it says. Watch the chimes!' : `Lyra plays ${n} notes. Watch the chimes light up — and listen, if your sound is on.`}
                    </p>
                    {heard ? (
                      <>
                        <button ref={goRef} type="button" onClick={() => settled() && setStep(echo.mode === 'wrong' ? 'spot' : 'shape')} className={cn(goldClass, 'h-14 text-lg [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:text-base')}>
                          {echo.mode === 'wrong' ? 'Next — which was wrong?' : 'Next — up or down?'}
                        </button>
                        <ListenAgain onClick={listen} playing={playing} />
                      </>
                    ) : (
                      <button ref={goRef} type="button" onClick={listen} aria-disabled={playing || undefined} className={cn(goldClass, 'h-14 text-lg [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:text-base')}>
                        {playing ? '♪ Listening…' : '▶ Listen'}
                      </button>
                    )}
                  </>
                )}
                {step === 'shape' && (
                  <>
                    <p id="ec-question" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                      {shapeQuestion(echo)}
                    </p>
                    <div role="group" aria-labelledby="ec-question" className="grid grid-cols-3 gap-1.5">
                      {SHAPES.map((s, k) => (
                        <button
                          key={s.id}
                          ref={k === 0 ? goRef : undefined}
                          type="button"
                          onClick={() => answerShape(s.id)}
                          className={cn('flex min-h-[52px] flex-col items-center justify-center rounded-lg border-[3px] border-[#5a55a8] bg-[#24215a] px-1 text-[14px] font-bold hover:bg-[#2f2b70]', focusRing)}
                        >
                          <span aria-hidden="true" className="text-xl leading-none text-amber-200">
                            {s.arrow}
                          </span>
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {canListen && <ListenAgain onClick={listen} playing={playing} />}
                  </>
                )}
                {step === 'spot' && (
                  <>
                    <p className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">Tap the note on the staff that Lyra played wrong.</p>
                    <ListenAgain onClick={listen} playing={playing} goRef={goRef} />
                  </>
                )}
                {step === 'play' && (
                  <>
                    <p id="ec-play" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                      {echo.mode === 'staff' ? 'Play the staff’s notes on the chimes, left to right.' : 'Tap the chimes in the same order.'} {got.length} of {n} played.
                    </p>
                    {canListen && <ListenAgain onClick={listen} playing={playing} />}
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
            <Ticket heading={`ECHO ${tune.name.toUpperCase()}`} ready={step === 'done'} icon={<span aria-hidden="true" className="text-2xl">🎵</span>} id="ec-job">
              {echoWords(echo)}
            </Ticket>
          </div>
          <Songbook known={known} read={read} onRead={setRead} />
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

function stepTitle(step: Step, mode: Echo['mode']): string {
  if (step === 'listen') return 'Step 1 · Listen';
  if (step === 'shape') return mode === 'staff' ? 'Step 1 · Read the staff' : 'Step 2 · Up or down?';
  if (step === 'spot') return 'Step 2 · Which note was wrong?';
  return mode === 'staff' ? 'Step 2 · Play it' : mode === 'wrong' ? 'Step 3 · Play it right' : 'Step 3 · Play it back';
}

function ListenAgain({ onClick, playing, goRef }: { onClick: () => void; playing: boolean; goRef?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={goRef} type="button" onClick={onClick} aria-disabled={playing || undefined} className={cn(outlineClass, 'min-h-11 border-2 px-3 text-sm')}>
      {playing ? '♪ Listening…' : '↻ Listen again'}
    </button>
  );
}

/** Sound on or off — the device's sound-effects setting, here where it matters most. */
function SoundToggle() {
  const on = useSettingsStore((s) => s.sfx);
  const setSfx = useSettingsStore((s) => s.setSfx);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        setSfx(!on);
        if (!on) window.setTimeout(() => playTone(CHIME.E.hz, 400), 0);
      }}
      className={cn('flex min-h-11 items-center gap-1.5 rounded-lg border-2 px-2.5 text-[13px] font-bold', on ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a]', focusRing)}
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
      Chime sounds {on ? 'on' : 'off'}
    </button>
  );
}

/** The chimes: long to short, low to high, each its colour, letter and name. Lit as it rings. */
const Chimes = forwardRef<
  HTMLDivElement,
  { notes: readonly Note[]; lit: Note | null; busy: boolean; still: boolean; describedBy?: string; onTap: (n: Note) => void }
>(({ notes, lit, busy, still, describedBy, onTap }, ref) => (
  <div ref={ref} role="group" aria-label="The chimes, low to high" aria-describedby={describedBy} className="flex h-[176px] w-full max-w-[420px] items-end justify-center gap-1.5 split:h-[200px] [@media(max-height:500px)]:h-[132px] [@media(max-height:500px)]:gap-1">
    {notes.map((n) => {
      const on = lit === n;
      const k = height(n);
      return (
        <button
          key={n}
          type="button"
          onClick={() => onTap(n)}
          // A held Enter or Space rings once: its repeats would play the tune's next notes.
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
          }}
          aria-disabled={busy || undefined}
          aria-label={`${n}, ${CHIME[n].name}`}
          className={cn(
            'relative flex min-w-11 max-w-[84px] flex-1 flex-col items-center justify-between rounded-xl border-[3px] border-[#1b0f22] pb-1.5 pt-2 shadow-[0_4px_0_#1b0f22] transition-[filter,transform] duration-100',
            on && 'shadow-[0_0_0_4px_#ffffff,0_0_22px_8px_rgba(255,255,255,0.65)] brightness-125',
            on && !still && '-translate-y-1.5',
            focusRing,
          )}
          style={{ height: `${100 - k * 11}%`, background: CHIME[n].colour }}
        >
          <span aria-hidden="true" className={cn('font-pixel text-[26px] leading-none', n === 'G' ? 'text-white' : 'text-[#1b0f22]')}>
            {n}
          </span>
          <span aria-hidden="true" className="rounded bg-[#1b0f22]/80 px-1 text-[11px] font-bold leading-tight text-white">
            {CHIME[n].name}
          </span>
          {on && (
            <span aria-hidden="true" className="absolute -top-7 text-2xl text-white">
              ♪
            </span>
          )}
        </button>
      );
    })}
  </div>
));
Chimes.displayName = 'Chimes';

/** The notes to echo as slots: lit in turn as Lyra plays; filled as the kid plays them back. */
function Slots({ echo, got, litAt, playing, miss }: { echo: Echo; got: readonly Note[]; litAt: number | null; playing: boolean; miss: number }) {
  return (
    <ol aria-label={`${got.length} of ${echo.notes.length} notes played`} className="flex flex-wrap justify-center gap-1.5 [@media(max-height:500px)]:gap-1">
      {echo.notes.map((_, k) => {
        const n = got[k];
        const nextUp = playing && k === got.length;
        return (
          <li
            // A wrong chime shakes the slot it was for (a new key each miss restarts it).
            key={nextUp && miss ? `${k}-${miss}` : k}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg border-[3px] text-[17px] font-black [@media(max-height:500px)]:h-8 [@media(max-height:500px)]:w-8 [@media(max-height:500px)]:text-[14px]',
              n ? 'border-[#1b0f22]' : nextUp ? 'border-dashed border-amber-300 bg-[#24215a]' : 'border-[#5a55a8] bg-[#24215a]',
              litAt === k && 'bg-white',
              nextUp && miss > 0 && 'cg-shake',
            )}
            style={n ? { background: CHIME[n].colour, color: n === 'G' ? '#ffffff' : '#1b0f22' } : undefined}
          >
            {n ? (
              <>
                {n}
                <span className="sr-only">, {CHIME[n].name}</span>
              </>
            ) : (
              <span className="sr-only">Note {k + 1}, not played yet</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The staff (Tricky): the tune's notes on five lines, each a column — lit as
 * Lyra plays it; buttons, said by their place, when a wrong note's to be found.
 */
function Staff({ echo, got, litAt, spotting, onSpot }: { echo: Echo; got: readonly Note[]; litAt: number | null; spotting: boolean; onSpot: (at: number) => void }) {
  const head = (n: Note) => 80 - height(n) * 6; // C on a ledger line at 80, each note a half-step of the staff higher
  return (
    <div role="group" aria-label="The staff" className="flex w-full max-w-[420px] justify-center rounded-lg border-[3px] border-[#1b0f22] bg-[#fff6dc] px-1">
      <svg aria-hidden="true" viewBox="0 0 22 96" className="h-[88px] w-[20px] flex-none [@media(max-height:500px)]:h-[72px]">
        {[20, 32, 44, 56, 68].map((y) => (
          <line key={y} x1="0" x2="22" y1={y} y2={y} stroke="#1b0f22" strokeWidth="1.6" />
        ))}
        <line x1="2" x2="2" y1="20" y2="68" stroke="#1b0f22" strokeWidth="3" />
      </svg>
      {echo.notes.map((n, k) => {
        const y = head(n);
        const svg = (
          <svg aria-hidden="true" viewBox="0 0 40 96" className="h-[88px] w-full [@media(max-height:500px)]:h-[72px]">
            {[20, 32, 44, 56, 68].map((ly) => (
              <line key={ly} x1="0" x2="40" y1={ly} y2={ly} stroke="#1b0f22" strokeWidth="1.6" />
            ))}
            {n === 'C' && <line x1="10" x2="30" y1="80" y2="80" stroke="#1b0f22" strokeWidth="1.6" />}
            <ellipse cx="20" cy={y} rx="7.5" ry="5.5" transform={`rotate(-20 20 ${y})`} fill="#1b0f22" />
            <line x1="26.5" x2="26.5" y1={y - 2} y2={y - 34} stroke="#1b0f22" strokeWidth="2" />
          </svg>
        );
        const played = got[k];
        const label = `Note ${k + 1}: ${PLACE[n]}${played ? `, played: ${played}` : ''}`;
        return spotting ? (
          <button
            key={k}
            type="button"
            onClick={() => onSpot(k)}
            aria-label={label}
            className={cn('min-w-11 max-w-[56px] flex-1 rounded hover:bg-amber-200 [@media(max-height:500px)]:min-w-9', focusRing)}
          >
            {svg}
          </button>
        ) : (
          // Played: tinted its chime's colour, its letter under it.
          <span
            key={k}
            role="img"
            aria-label={label}
            className={cn('relative min-w-7 max-w-[56px] flex-1 rounded', litAt === k && 'bg-amber-200')}
            style={played ? { background: `${CHIME[played].colour}55` } : undefined}
          >
            {svg}
            {played && (
              <span aria-hidden="true" className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[11px] font-black leading-none text-[#1b0f22]">
                {played}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The Music House, close up (§2.2): Lyra by her chimes, Ember listening, notes in the air while she plays. */
function MusicHouse({ playing, cheer }: { playing: boolean; cheer: boolean }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const lyra = NPC_DEFS['chromaria-musician'];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[14%] bg-[linear-gradient(#3e2a6b_0_68%,#2a1c4a_68%_100%)] px-3 pb-[4%]">
      <span aria-hidden="true">
        <EmberSprite anim={cheer ? 'cheer' : undefined} scale={3} />
      </span>
      <span aria-hidden="true" className={cn('absolute left-1/2 top-[14%] -translate-x-1/2 text-4xl text-amber-200 transition-opacity', playing ? 'opacity-100' : 'opacity-25')}>
        ♪ ♫ ♪
      </span>
      <span aria-hidden="true" className="flex items-end">
        {lyra && <CharacterPortrait spriteId={npcSpriteId(lyra, flags)} emoji={npcEmoji(lyra, flags)} scale={3} className="text-5xl" />}
      </span>
    </div>
  );
}

/** Lyra's Songbook: a page per tune echoed, its opening in its chimes' colours; tapped, read out. */
function Songbook({ known, read, onRead }: { known: (id: TuneId) => boolean; read: TuneId | null; onRead: (id: TuneId) => void }) {
  const count = TUNES.filter((t) => known(t.id)).length;
  const reading = read ? TUNE_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="ec-book" className="mt-auto flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 id="ec-book" className={cn(pixelHeadClass, 'text-2xl')}>
          Songbook
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {TUNES.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {TUNES.map((t) => (
          <li key={t.id}>
            {known(t.id) ? (
              <button
                type="button"
                onClick={() => onRead(t.id)}
                aria-pressed={read === t.id}
                aria-label={`${t.name}. Read the page`}
                className={cn('flex min-h-[52px] w-full flex-col items-start justify-center gap-0.5 rounded border-[3px] bg-[#fff6dc] px-2 py-1 text-left hover:bg-white', read === t.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <span aria-hidden="true" className="text-[13px] font-bold leading-tight text-[#1b0f22]">
                  {t.name}
                </span>
                <span aria-hidden="true" className="flex gap-0.5">
                  {t.opening.map((n, k) => (
                    <span key={k} className="h-2.5 w-2.5 rounded-sm border border-[#1b0f22]" style={{ background: CHIME[n].colour }} />
                  ))}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A tune not echoed yet" className="flex min-h-[52px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                ♪ ?
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* The page read (Lyra's bubble says it too, and is the live region). */}
      {reading && (
        <div ref={panel} className="flex flex-col gap-1.5 rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <p>
            <b>{reading.name}</b> — {reading.note}
          </p>
          <p className="flex flex-wrap items-center gap-1 text-[13px] font-bold">
            Starts:
            {reading.opening.map((n, k) => (
              <span key={k} className="flex h-6 min-w-6 items-center justify-center rounded border-2 border-[#1b0f22] px-0.5" style={{ background: CHIME[n].colour, color: n === 'G' ? '#fff' : '#1b0f22' }}>
                {n}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  );
}
