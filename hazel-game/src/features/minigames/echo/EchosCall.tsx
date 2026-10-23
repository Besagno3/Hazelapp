import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  CHIME,
  ECHOES_PER_ROUND,
  INTERVALS,
  INTERVAL_NAME,
  PLACE,
  STAFF_LINES,
  TUNES,
  TUNE_BY_ID,
  echoFor,
  echoWords,
  asked,
  height,
  intervalQuestion,
  intervalWords,
  judge,
  learnedLine,
  noteWords,
  roundQueue,
  shape,
  shapeQuestion,
  shapeWords,
  spotWords,
  staffY,
  tapWords,
  type Echo,
  type Interval,
  type Note,
  type Shape,
  type TuneId,
} from '../../../lib/minigames/echo';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { playTone, wakeTones } from '../../../lib/tones';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useSettled } from '../useSettled';

const EMPTY_FLAGS: Record<string, boolean> = {};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Listening; the tune's shape (on Expert, an interval in it); which note was wrong; playing it back; echoed. */
type Step = 'listen' | 'shape' | 'interval' | 'spot' | 'play' | 'done';

/** How long a note of Lyra's lasts, and the pause before the first (time to look from the button to the chimes). */
const BEAT_MS = 650;
const LEAD_MS = 700;

/** Bard Lyra after a tune's echoed, in turn — on Expert, plainly (§8.3). */
const RIGHT_LINES = ['Bravo! That’s just how it goes.', 'La la LAAA — a perfect echo!', 'Wonderful! You have a musician’s ears.'];
const EXPERT_RIGHT_LINES = ['Right.', 'That’s it.', 'Exactly.'];

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
/** Expert's, an interval asked where the others ask the shape. */
const EXPERT_CHIPS: Partial<Record<Echo['mode'], readonly string[]>> = {
  ear: ['Listen', 'The interval', 'Play it back'],
  staff: ['Read: the interval', 'Play it'],
};

/**
 * 🎵 Echo's Call (docs/DESIGN-MINIGAMES.md §5.5), in Bard Lyra's Music House:
 * Lyra plays the start of an old tune on five coloured chimes (or three); the
 * kid says whether it ended higher, lower or the same, then plays it back. On
 * Tricky the tune is read from a staff, or Lyra plays one note wrong and the
 * kid finds it on the staff. On Expert (§8.5) the kid names the interval
 * between two of its notes instead of its shape. Three tunes a round, each a
 * note longer; each a page of the Songbook. The chimes light up as they ring,
 * so it's all there with the sound off. No timer. Rules:
 * `lib/minigames/echo.ts`.
 */
export default function EchosCall({ def, band, round, onPage, onFinish }: PlayProps) {
  const expert = band === 'expert';
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const soundOn = useSettingsStore((s) => s.sfx);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which tunes come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue(band, (id) => !!flags[pageFlag(def.id, id)], round));
  const echo = useMemo(() => echoFor(band, round, done, queue), [band, round, done, queue]);
  const tune = TUNE_BY_ID[echo.tune];
  // What follows the listening (or starts a staff tune): the shape — on Expert, the interval.
  const ask: Step = expert ? 'interval' : 'shape';
  const first: Step = echo.mode === 'staff' ? ask : 'listen';
  const [step, setStep] = useState<Step>(first);
  const [heard, setHeard] = useState(false);
  const [playing, setPlaying] = useState(false);
  // The chime lit now: Lyra's (with which note of hers it is) or the kid's tap.
  const [lit, setLit] = useState<{ note: Note; at: number | null } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [heardSaid, setHeardSaid] = useState('');
  const [got, setGot] = useState<Note[]>([]);
  // The slot a wrong chime was for, shaken (`n` restarts it each miss); gone with the next right one (review round 1).
  const [shake, setShake] = useState<{ at: number; n: number } | null>(null);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  // Expert's seal (§8.3): each tune's interval named at the first pick and played back with no wrong chime.
  const [missed, setMissed] = useState(false);
  const [spotOn, setSpotOn] = useState(0);
  const [read, setRead] = useState<TuneId | null>(null);
  const known = (id: TuneId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts; the listen step's Next as it first appears too, when Lyra's done (review
  // round 1: a kid tapping Listen again and again went on, then answered) — that wait is Next's alone (round 2: keyed
  // for every button, it swallowed Listen again, and Next tune after a staff tune's first hearing).
  const settled = useSettled(`${step}:${done}`);
  const nextSettled = useSettled(`${step}:${done}:${heard}`);
  // A press to act on: a key's at once (no click count — a quick keyboard kid isn't held back), a tap's once settled.
  const ready = (e: { detail: number }) => e.detail === 0 || settled();
  // Every tune the band plays already in the Songbook as the round starts (Gentle's chimes play five of the eight).
  const [knewAll] = useState(() => queue.every((id) => !!flags[pageFlag(def.id, id)]));

  // Lyra's playing, note by note; stopped if the kid moves on (or leaves).
  const timers = useRef<number[]>([]);
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => stop, []);
  /** Stop her mid-tune: the kid answered while she played (review round 1: the chimes stayed dead till she'd done). */
  function halt() {
    if (!playing) return;
    stop();
    setPlaying(false);
    setLit(null);
  }

  function listen(e: { detail: number }) {
    if (playing || !ready(e)) return;
    stop();
    // In the tap, so a browser lets her notes (rung a moment later) be heard.
    wakeTones();
    setRead(null);
    setPlaying(true);
    setLit(null);
    setHeardSaid('');
    // Once the wrong note's found, she plays it as written (review round 1: the celebration replayed the mistake).
    const notes = step === 'play' || step === 'done' ? echo.notes : echo.played;
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
          timers.current = [];
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
    // Spotting, a chime that sounded wrong is the likely tap: it rings, and says where to look (review round 2).
    if (step === 'spot') setSaid('That chime just rings — tap the note on the staff that didn’t match it.');
    if (step !== 'play') return;
    const i = got.length;
    setSaid(tapWords(echo, i, n));
    // No buzzer on a miss: it would drown the chime's own note, the one to compare (review round 2) — the words and the
    // red ring say it.
    if (judge(echo, i, n) !== 'right') {
      setShake((s) => ({ at: i, n: (s?.n ?? 0) + 1 }));
      setMissed(true);
      return;
    }
    setShake(null);
    const next = [...got, n];
    setGot(next);
    if (next.length < echo.notes.length) return;
    cheer();
    setNewPage(onPage(echo.tune, tune.name));
    setLessons((l) => [...l, learnedLine(echo)]);
    setRights((r) => r + 1);
    if (!missed) setSpotOn((k) => k + 1);
    setStep('done');
  }

  /**
   * A tune echoed: the jingle after its last note has rung, and a light running up the chimes, low to high — there with
   * the sound off and the Music House out of sight on a phone (review round 2). Still with motion turned down.
   */
  function cheer() {
    timers.current.push(window.setTimeout(() => sfx('chest'), 350));
    if (still) return;
    echo.chimes.forEach((c, k) => timers.current.push(window.setTimeout(() => setLit({ note: c, at: null }), 380 + k * 90)));
    timers.current.push(window.setTimeout(() => setLit(null), 380 + echo.chimes.length * 90 + 60));
  }

  function answerShape(s: Shape, e: { detail: number }) {
    if (step !== 'shape' || !ready(e)) return;
    halt();
    setRead(null);
    sfx(s === shape(echo.notes) ? 'correct' : 'select');
    setSaid(shapeWords(echo, s));
    setStep('play');
  }

  /** Expert: the interval named — said with how it's counted either way; on to playing it. */
  function answerInterval(iv: Interval, e: { detail: number }) {
    const q = asked(echo);
    if (step !== 'interval' || !q || !ready(e)) return;
    halt();
    setRead(null);
    sfx(iv === q.interval ? 'correct' : 'select');
    if (iv !== q.interval) setMissed(true);
    setSaid(intervalWords(echo, iv));
    setStep('play');
  }

  // A note on the staff picked as the wrong one — while she plays, too: it stops her (the kid saw it light).
  function spot(at: number, e: { detail: number }) {
    if (step !== 'spot' || echo.mode !== 'wrong' || !ready(e)) return;
    halt();
    setRead(null);
    setSaid(spotWords(echo, at));
    if (at === echo.wrongAt) {
      sfx('correct');
      setStep('play');
    } else sfx('wrong');
  }

  function next(ev: { detail: number }) {
    if (step !== 'done' || !ready(ev)) return;
    stop();
    setRead(null);
    if (done + 1 >= ECHOES_PER_ROUND) {
      onFinish({ title: 'Three tunes echoed!', learned: lessons[lessons.length - 1] ?? '', spotOn: expert ? { right: spotOn, of: ECHOES_PER_ROUND } : undefined });
      return;
    }
    const e = echoFor(band, round, done + 1, queue);
    setDone((d) => d + 1);
    setMissed(false);
    setStep(e.mode === 'staff' ? ask : 'listen');
    setHeard(false);
    setPlaying(false);
    setLit(null);
    setSaid(null);
    setHeardSaid('');
    setGot([]);
    setShake(null);
    setNewPage(false);
  }

  // Focus where each step starts: its heading (described by what to do), the first chime to play, the first note on the
  // staff to pick, what was echoed. Listen keeps it as Lyra plays: the same button, "Listen again" once she's done.
  const stepHead = useRef<HTMLHeadingElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  const chimes = useRef<HTMLDivElement>(null);
  const staff = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step === 'play') chimes.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    else if (step === 'spot') staff.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    else if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else stepHead.current?.focus({ preventScroll: true });
  }, [step, done]);

  // As each step starts — never as a chime is tapped — what it's played on comes into view: its gold button, the chimes,
  // the staff. Stacked (a phone), the page scrolls back to the board's top, so the staff or slots are whole, keeping the
  // gold button in if there's room (review round 1: the next tune's staff started half under the header).
  const goRef = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
    const go = step === 'play' ? chimes.current : step === 'spot' ? staff.current : goRef.current;
    const s = page.current;
    const b = board.current;
    if (s && b && s.scrollHeight > s.clientHeight && getComputedStyle(s).overflowY !== 'hidden') {
      const base = s.getBoundingClientRect().top - s.scrollTop;
      const top = b.getBoundingClientRect().top - base;
      const bottom = go ? go.getBoundingClientRect().bottom - base : top;
      // As little as shows the step's own (no further than the board's top); a tune's result, at least that, with Next.
      const show = bottom + 12 - s.clientHeight;
      s.scrollTo?.({ top: Math.max(0, step === 'done' ? Math.max(top, show) : Math.min(top, show)), behavior });
    } else go?.scrollIntoView?.({ block: 'nearest', behavior });
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = echo.notes.length;
  const cheerLine = expert
    ? `${EXPERT_RIGHT_LINES[(rights - 1 + EXPERT_RIGHT_LINES.length) % EXPERT_RIGHT_LINES.length]} ${done + 1 < ECHOES_PER_ROUND ? 'Next tune.' : 'That’s the last.'}`
    : `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < ECHOES_PER_ROUND ? 'Ready for the next one?' : 'Take a bow!'}`;
  let line: string;
  if (read) line = `${TUNE_BY_ID[read].name}: ${TUNE_BY_ID[read].note}`;
  else if (playing) line = expert ? (soundOn ? 'Listen, and watch the chimes.' : 'Watch the chimes.') : soundOn ? 'Listen… and watch the chimes!' : 'Watch the chimes light up!';
  else if (step === 'done') line = cheerLine;
  else if (said && step !== 'listen') line = said;
  else if (expert) {
    // Expert, plainly (§8.3): what to do, no cheering.
    if (step === 'listen') line = heard ? 'Again, or on to my question?' : `The start of a tune: ${n} notes. ${soundOn ? 'Press Listen.' : 'My chimes are quiet: tap 🔇 Sounds to hear them, or watch them light.'}`;
    else if (step === 'interval') line = intervalQuestion(echo);
    else line = echo.mode === 'staff' ? 'Now play what the staff says.' : 'Now play it back.';
  } else if (step === 'listen') {
    if (heard) line = echo.mode === 'wrong' ? 'Again, or on to the wrong note?' : 'Again, or on to my question?';
    // The sound's off till it's turned on (review round 1: a kid pressed Listen and heard nothing, never asked).
    else {
      // Every tune her chimes play already known: say there are more, on all five chimes (review round 2).
      const more = knewAll && done === 0 && band === 'gentle' ? 'You know every tune my three chimes can play — try Medium for three more! ' : '';
      line = `${more}Here’s the start of a tune: ${n} notes. ${soundOn ? 'Press Listen!' : 'My chimes are quiet — tap 🔇 Sounds to hear them, or just watch them light up!'}`;
    }
  } else if (step === 'shape') line = echo.mode === 'staff' ? 'No listening this time — read my notes on the staff!' : shapeQuestion(echo);
  else if (step === 'spot') line = 'Watch the chimes and read the staff: which note did I play wrong?';
  else line = echo.mode === 'staff' ? 'Now play what the staff says!' : echo.mode === 'wrong' ? 'Now play what the staff says — with the right note!' : 'Your turn — play it back!';

  const chips = (expert && EXPERT_CHIPS[echo.mode]) || STEP_CHIPS[echo.mode];
  const chipAt = step === 'done' ? chips.length : echo.mode === 'staff' ? (step === 'shape' || step === 'interval' ? 0 : 1) : step === 'listen' ? 0 : step === 'play' ? 2 : 1;
  // The two notes Expert asks about, marked on the staff or the slots while it's asked.
  const marked = step === 'interval' ? (asked(echo)?.at ?? null) : null;
  const showStaff = echo.mode !== 'ear';
  const canListen = echo.mode !== 'staff' || step === 'done';
  const spotting = step === 'spot';

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden">
      {/* Split, the board sits under the Music House, beside the aside; on a short split screen it's all there is. */}
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] split:[@media(orientation:portrait)]:grid-rows-[minmax(0,22fr)_minmax(0,78fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:500px)]:grid-cols-[minmax(440px,1fr)_minmax(0,260px)] split:[@media(max-height:500px)]:grid-rows-[minmax(0,1fr)]">
        <div aria-hidden="true" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:500px)]:hidden">
          <MusicHouse playing={playing} cheer={step === 'done'} />
        </div>

        {/* The chimes, and the step with its buttons beside them on a screen held sideways from 560 px (under them on one
            held upright — a phone, or a split screen, where side by side both were squeezed: review round 1): what to do is
            always by them, and a step's card growing never moves a chime. */}
        <section
          ref={board}
          aria-labelledby="ec-step"
          className="flex flex-col gap-3 bg-[#3b2a4a] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:border-t-4 split:border-[#1b0f22] split:p-4 [@media(min-width:560px)_and_(orientation:landscape)]:flex-row split:[@media(max-height:500px)]:row-start-1 split:[@media(max-height:500px)]:border-t-0 split:[@media(max-height:500px)]:p-2"
        >
          {/* On a short screen the chimes keep a column wide enough for five, and the step takes the rest. Not on a split
              screen the board grows with the step's card, so the chimes keep to the top (centred, they moved as it grew). */}
          <div className="flex min-w-0 flex-col items-center justify-start gap-2 split:min-h-0 split:justify-center [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-1 [@media(min-width:560px)_and_(max-height:500px)]:w-[max(236px,min(420px,55%))] [@media(min-width:560px)_and_(max-height:500px)]:flex-none">
            {/* Under 640 px high the heading's left out for room, and the sound switch is in the step's card. */}
            <div className="flex w-full items-center justify-between gap-2 [@media(max-height:640px)]:hidden">
              <span className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2]">{showStaff ? 'The staff' : 'Lyra’s notes'}</span>
              <SoundToggle />
            </div>
            {/* The staff shows what's been played on it; Lyra's notes have slots. */}
            {showStaff ? (
              <Staff
                ref={staff}
                echo={echo}
                got={got}
                litAt={playing ? (lit?.at ?? null) : null}
                nextAt={step === 'play' ? got.length : null}
                shake={shake}
                spotting={spotting}
                marked={marked}
                describedBy={spotting ? 'ec-spot' : undefined}
                onSpot={spot}
              />
            ) : (
              <Slots echo={echo} got={got} litAt={playing && lit ? lit.at : null} playing={step === 'play'} shake={shake} marked={marked} />
            )}
            <Chimes
              ref={chimes}
              notes={echo.chimes}
              lit={lit?.note ?? null}
              busy={playing}
              still={still}
              named={!expert}
              describedBy={step === 'play' ? 'ec-play' : undefined}
              onTap={tap}
            />
            {/* Which way is higher, in sight: a higher note is a shorter chime, so a tune going up can look like it's going
                down (review round 2). Its group is named low to high for a reader. Its room is the chimes' (they're 16 px
                shorter), so nothing under them moved down. */}
            <p aria-hidden="true" className="flex w-full max-w-[420px] justify-between px-1 text-[12px] font-bold leading-none text-[#c9c5f2]">
              <span>◀ lower · longer</span>
              <span>shorter · higher ▶</span>
            </p>
            {/* What Lyra played, said once it's done (a chime lighting up isn't heard). */}
            <p role="status" className="sr-only">
              {heardSaid}
            </p>
          </div>
          <div
            className={cn(
              windowClass,
              'flex flex-col gap-2.5 p-3 [&>*]:flex-none split:overflow-y-auto split:[@media(orientation:portrait)]:min-h-0 split:[@media(orientation:portrait)]:flex-1 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:w-[min(300px,46%)] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-none [@media(min-width:560px)_and_(max-height:500px)]:min-w-0 [@media(min-width:560px)_and_(max-height:500px)]:flex-1 [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:p-2.5',
            )}
          >
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden">
              Tune {done + 1} of {ECHOES_PER_ROUND}
            </p>
            {/* Under 640 px high the sound switch is by the step's heading (round 2: on a row of its own it pushed Next
                below the fold on a phone on its side). */}
            <div className="flex items-start justify-between gap-2">
              {step === 'done' ? (
                <h2
                  id="ec-step"
                  ref={doneHead}
                  tabIndex={-1}
                  aria-describedby="ec-result"
                  className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white [@media(max-height:500px)]:text-[20px]', focusRing)}
                >
                  {tune.name}!
                </h2>
              ) : (
                <h2
                  id="ec-step"
                  ref={stepHead}
                  tabIndex={-1}
                  aria-describedby={step === 'play' ? undefined : 'ec-job'}
                  className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none [@media(max-height:500px)]:text-[19px]', focusRing)}
                >
                  {stepTitle(step, echo.mode)}
                </h2>
              )}
              <span className="hidden flex-none [@media(max-height:640px)]:flex">
                <SoundToggle />
              </span>
            </div>
            {step === 'done' ? (
              <>
                {/* Her cheer, in the card too: on a phone her bubble's below the fold (review round 2) — not on a split
                    screen, where her bubble's beside the board, nor a short one: the card hasn't the room. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                <p id="ec-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:py-1.5 [@media(max-height:500px)]:text-[14px]">
                  {lessons[lessons.length - 1]}
                  {newPage && ` ${tune.name} is in the Songbook!`}
                </p>
                <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'text-lg [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-base')}>
                  {done + 1 < ECHOES_PER_ROUND ? 'Next tune' : 'Take a bow!'}
                </button>
                <button type="button" onClick={listen} aria-disabled={playing || undefined} className={cn(outlineClass, 'min-h-11 border-2 px-3 text-sm')}>
                  {playing ? '♪ Listening…' : '▶ Hear it again'}
                </button>
              </>
            ) : (
              <>
                {step === 'listen' && (
                  <>
                    <p className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                      {echo.mode === 'wrong'
                        ? 'One of Lyra’s notes won’t match the staff. Watch the chimes and find it!'
                        : `Lyra plays ${n} notes. Watch the chimes light up${soundOn ? ' — and listen!' : ' — or tap 🔇 Sounds to hear them too.'}`}
                    </p>
                    {/* One button for Listen, then Listen again — where a kid taps again; Next comes in under it, its room
                        kept from the start, so nothing moves (review round 1). */}
                    <button
                      type="button"
                      onClick={listen}
                      aria-disabled={playing || undefined}
                      className={cn(heard ? cn(outlineClass, 'border-2 px-3') : goldClass, 'min-h-14 py-1.5 text-lg leading-tight [@media(max-height:640px)]:min-h-12 [@media(max-height:640px)]:text-base')}
                    >
                      {playing ? '♪ Listening…' : heard ? '↻ Listen again' : '▶ Listen'}
                    </button>
                    <button
                      ref={goRef}
                      type="button"
                      onClick={(e) => heard && (e.detail === 0 || nextSettled()) && setStep(echo.mode === 'wrong' ? 'spot' : ask)}
                      aria-hidden={!heard || undefined}
                      tabIndex={heard ? undefined : -1}
                      className={cn(goldClass, 'min-h-14 py-1.5 text-lg leading-tight [@media(max-height:640px)]:min-h-12 [@media(max-height:640px)]:text-base', !heard && 'invisible')}
                    >
                      {echo.mode === 'wrong' ? 'Next — which was wrong?' : expert ? 'Next — the interval' : 'Next — up or down?'}
                    </button>
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
                          onClick={(e) => answerShape(s.id, e)}
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
                {step === 'interval' && (
                  <>
                    <p id="ec-question" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                      {intervalQuestion(echo)}
                    </p>
                    <div role="group" aria-labelledby="ec-question" className="grid grid-cols-2 gap-1.5">
                      {INTERVALS.map((iv, k) => (
                        <button
                          key={iv}
                          ref={k === 0 ? goRef : undefined}
                          type="button"
                          onClick={(e) => answerInterval(iv, e)}
                          className={cn(
                            'flex min-h-11 items-center justify-center rounded-lg border-[3px] border-[#5a55a8] bg-[#24215a] px-1 text-[14px] font-bold hover:bg-[#2f2b70] [@media(max-height:500px)]:min-h-10 [@media(max-height:500px)]:text-[13px]',
                            focusRing,
                          )}
                        >
                          {cap(INTERVAL_NAME[iv])}
                        </button>
                      ))}
                    </div>
                    {canListen && <ListenAgain onClick={listen} playing={playing} />}
                  </>
                )}
                {step === 'spot' && (
                  <>
                    <p id="ec-spot" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                      Tap the note on the staff that Lyra played wrong.
                    </p>
                    <Said text={said ?? 'Which one didn’t match the chimes?'} />
                    <ListenAgain onClick={listen} playing={playing} goRef={goRef} />
                  </>
                )}
                {step === 'play' && (
                  <>
                    <p id="ec-play" className="text-[15px] leading-snug text-[#e4e1ff] [@media(max-height:500px)]:text-[14px]">
                      {echo.mode === 'staff' ? 'Play the staff’s notes on the chimes, left to right.' : echo.mode === 'wrong' ? 'Play what the staff says — with the right note.' : 'Tap the chimes in the same order.'} {got.length} of {n} played.
                    </p>
                    <Said text={said ?? ''} />
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
  if (step === 'interval') return mode === 'staff' ? 'Step 1 · Name the interval' : 'Step 2 · Name the interval';
  if (step === 'shape') return mode === 'staff' ? 'Step 1 · Read the staff' : 'Step 2 · Up or down?';
  if (step === 'spot') return 'Step 2 · Which note was wrong?';
  return mode === 'staff' ? 'Step 2 · Play it' : mode === 'wrong' ? 'Step 3 · Play it right' : 'Step 3 · Play it back';
}

/**
 * What Lyra said of the last answer, in the step's card by the chimes too: on a phone her bubble's below the fold (review
 * round 1: a wrong chime went unexplained). Room for the longest, so nothing under it moves; not read out — her bubble is.
 */
function Said({ text }: { text: string }) {
  return (
    <p className="flex min-h-[4.25rem] flex-none items-center rounded-md bg-[#24215a] px-2.5 text-[15px] font-bold leading-snug [@media(max-height:500px)]:min-h-[3.5rem] [@media(max-height:500px)]:text-[14px]">
      {text}
    </p>
  );
}

function ListenAgain({ onClick, playing, goRef }: { onClick: (e: { detail: number }) => void; playing: boolean; goRef?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={goRef} type="button" onClick={onClick} aria-disabled={playing || undefined} className={cn(outlineClass, 'min-h-11 border-2 px-3 text-sm')}>
      {playing ? '♪ Listening…' : '↻ Listen again'}
    </button>
  );
}

/**
 * Sound on or off — the device's sound effects (all of them, not just the chimes: so "Sounds"), here where they matter
 * most. Its name stays put; pressed is on. Turned on, a chime rings at once, in the tap.
 */
function SoundToggle() {
  const on = useSettingsStore((s) => s.sfx);
  const setSfx = useSettingsStore((s) => s.setSfx);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        setSfx(!on);
        if (!on) playTone(CHIME.E.hz, 400);
      }}
      className={cn('flex min-h-11 items-center gap-1.5 rounded-lg border-2 px-2.5 text-[13px] font-bold', on ? 'border-amber-300 bg-[#3a3486]' : 'border-[#5a55a8] bg-[#24215a]', focusRing)}
    >
      <span aria-hidden="true">{on ? '🔊' : '🔇'}</span>
      Sounds
      <span aria-hidden="true" className={cn('rounded px-1 text-[11px] uppercase', on ? 'bg-amber-300 text-[#1b0f22]' : 'bg-[#1b0f22] text-[#c9c5f2]')}>
        {on ? 'on' : 'off'}
      </span>
    </button>
  );
}

/**
 * The chimes: long to short, low to high, each its colour, letter and name. Lit as it rings. The arrow keys move along
 * them (right and up are higher).
 */
const Chimes = forwardRef<
  HTMLDivElement,
  { notes: readonly Note[]; lit: Note | null; busy: boolean; still: boolean; named: boolean; describedBy?: string; onTap: (n: Note) => void }
>(({ notes, lit, busy, still, named, describedBy, onTap }, ref) => {
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    // A held Enter or Space rings once: its repeats would play the tune's next notes.
    if ((e.key === 'Enter' || e.key === ' ') && e.repeat) {
      e.preventDefault();
      return;
    }
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const all = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    all[all.indexOf(e.currentTarget) + d]?.focus();
  }
  return (
    <div
      ref={ref}
      role="group"
      aria-label="The chimes, low to high"
      aria-describedby={describedBy}
      className="flex h-[160px] w-full max-w-[420px] items-end justify-center gap-1.5 split:h-[184px] [@media(max-height:500px)]:h-[120px] [@media(max-height:500px)]:gap-1 [@media(min-height:501px)_and_(max-height:640px)]:h-[124px]"
    >
      {notes.map((n) => {
        const on = lit === n;
        const k = height(n);
        return (
          <button
            key={n}
            type="button"
            onClick={() => onTap(n)}
            onKeyDown={onKey}
            aria-disabled={busy || undefined}
            aria-label={named ? `${n}, ${CHIME[n].name}` : n}
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
            {/* Its colour's name — not on Expert, where the letter is what's known (§8.3). */}
            {named && (
              <span aria-hidden="true" className="rounded bg-[#1b0f22]/80 px-1 text-[11px] font-bold leading-tight text-white">
                {CHIME[n].name}
              </span>
            )}
            {on && (
              <span aria-hidden="true" className="absolute -top-7 text-2xl text-white">
                ♪
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
Chimes.displayName = 'Chimes';

/**
 * The notes to echo as slots: lit in turn as Lyra plays (played ones too); filled as the kid plays them back. A wrong
 * chime shakes the slot it was for and rings it red, which stays when motion's turned down.
 */
function Slots({
  echo,
  got,
  litAt,
  playing,
  shake,
  marked,
}: {
  echo: Echo;
  got: readonly Note[];
  litAt: number | null;
  playing: boolean;
  shake: { at: number; n: number } | null;
  /** Expert: the two notes whose interval is asked. */
  marked: readonly [number, number] | null;
}) {
  return (
    <ol aria-label={`${got.length} of ${echo.notes.length} notes played`} className="flex flex-wrap justify-center gap-1.5 [@media(max-height:500px)]:gap-1">
      {echo.notes.map((_, k) => {
        const n = got[k];
        const nextUp = playing && k === got.length;
        const shaken = nextUp && shake?.at === k;
        const lit = litAt === k;
        const asked = !!marked && marked.includes(k);
        return (
          <li
            // A new key each miss restarts the shake.
            key={shaken ? `${k}-${shake.n}` : k}
            data-shake={shaken || undefined}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg border-[3px] text-[17px] font-black [@media(max-height:500px)]:h-8 [@media(max-height:500px)]:w-8 [@media(max-height:500px)]:text-[14px]',
              // Shaken first: lit as Lyra passes it, it keeps its shake (round 2: it restarted) and its red ring.
              shaken ? 'cg-shake border-red-400 bg-[#24215a]' : n || lit ? 'border-[#1b0f22]' : nextUp ? 'border-dashed border-amber-300 bg-[#24215a]' : 'border-[#8f8ad0] bg-[#24215a]',
              lit && 'shadow-[0_0_0_3px_#ffffff]',
              asked && !lit && 'border-solid border-amber-300 shadow-[0_0_0_3px_#fbbf24]',
            )}
            style={lit ? { background: '#ffffff', color: '#1b0f22' } : n ? { background: CHIME[n].colour, color: n === 'G' ? '#ffffff' : '#1b0f22' } : undefined}
          >
            {n ? (
              <>
                {n}
                <span className="sr-only">, {CHIME[n].name}</span>
              </>
            ) : (
              <span className="sr-only">
                Note {k + 1}
                {asked ? ', asked about' : ''}, not played yet
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A staff column's height (a strip under the lines holds each played note's letter, clear of C's ledger line). */
const STAFF_H = 110;

/**
 * The staff (Tricky): five lines drawn once, right across (review round 1: drawn per note, they broke between notes), a
 * treble clef, and the tune's notes, each a column — marked as Lyra plays it; the next to play outlined, and a miss
 * shaking it ringed red, as the slots do (round 2); buttons, said by their place and looking like ones (dashed), when a
 * wrong note's to be found (while she plays too: picking one stops her).
 */
const Staff = forwardRef<
  HTMLDivElement,
  {
    echo: Echo;
    got: readonly Note[];
    litAt: number | null;
    nextAt: number | null;
    shake: { at: number; n: number } | null;
    spotting: boolean;
    /** Expert: the two notes whose interval is asked. */
    marked: readonly [number, number] | null;
    describedBy?: string;
    onSpot: (at: number, e: { detail: number }) => void;
  }
>(({ echo, got, litAt, nextAt, shake, spotting, marked, describedBy, onSpot }, ref) => (
  <div
    ref={ref}
    role="group"
    aria-label="The staff"
    aria-describedby={describedBy}
    className="relative flex h-[88px] w-full max-w-[420px] justify-center rounded-lg border-[3px] border-[#1b0f22] bg-[#fff6dc] px-1 [@media(max-height:640px)]:h-[76px]"
  >
    <svg aria-hidden="true" viewBox={`0 0 100 ${STAFF_H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {STAFF_LINES.map((y) => (
        <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#1b0f22" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
    <svg aria-hidden="true" viewBox={`0 0 26 ${STAFF_H}`} className="relative h-full w-[24px] flex-none">
      <TrebleClef />
    </svg>
    {echo.notes.map((n, k) => {
      const y = staffY(n);
      const on = litAt === k;
      const svg = (
        <svg aria-hidden="true" viewBox={`0 0 30 ${STAFF_H}`} className="h-full w-full">
          {on && <path data-marker="" d="M9 2 h12 l-6 8 z" fill="#1b0f22" />}
          {n === 'C' && <line data-ledger="" x1="6" x2="24" y1={y} y2={y} stroke="#1b0f22" strokeWidth="1.6" />}
          <ellipse cx="15" cy={y} rx="7.5" ry="5.5" transform={`rotate(-20 15 ${y})`} fill="#1b0f22" />
          <line x1="21.5" x2="21.5" y1={y - 2} y2={y - 34} stroke="#1b0f22" strokeWidth="2" />
        </svg>
      );
      const played = got[k];
      const shaken = nextAt === k && shake?.at === k;
      const askedHere = !!marked && marked.includes(k);
      const label = `Note ${k + 1}: ${PLACE[n]}${askedHere ? ', asked about' : ''}${played ? `, played: ${played}` : ''}`;
      // Lit: an ink ring and a ▼ over it (review round 1: a pale tint on cream was too faint). Tints are see-through,
      // so the lines show.
      const look = cn(
        'relative h-full max-w-[56px] flex-1 rounded',
        on && 'bg-amber-300/50 ring-[3px] ring-inset ring-[#1b0f22]',
        !on && shaken && 'cg-shake ring-[3px] ring-inset ring-red-500',
        !on && !shaken && nextAt === k && 'outline-dashed outline-2 -outline-offset-2 outline-amber-600',
        // The two Expert asks about: a gold tint and an ink ring.
        !on && askedHere && 'bg-amber-300/60 ring-[3px] ring-inset ring-amber-700',
      );
      return spotting ? (
        <button
          key={k}
          type="button"
          onClick={(e) => onSpot(k, e)}
          aria-label={label}
          // Dashed and tinted, so they look like what to tap (round 2); the focus ring in ink (cyan on cream was faint).
          className={cn(
            look,
            'min-w-11 border-2 border-dashed border-[#1b0f22]/60 bg-amber-100/60 hover:bg-amber-300/40 [@media(max-height:500px)]:min-w-9',
            focusRing,
            'focus-visible:outline-[#1b0f22]',
          )}
        >
          {svg}
        </button>
      ) : (
        // Played: tinted its chime's colour, its letter in the strip under the lines.
        <span
          key={shaken ? `${k}-${shake.n}` : k}
          role="img"
          aria-label={label}
          className={cn(look, 'min-w-7')}
          style={played && !on ? { background: `${CHIME[played].colour}55` } : undefined}
        >
          {svg}
          {played && (
            <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[11px] font-black leading-none text-[#1b0f22]">
              {played}
            </span>
          )}
        </span>
      );
    })}
  </div>
));
Staff.displayName = 'Staff';

/** A treble (G) clef: its curl round the second line up, where G sits — what makes the bottom line E. */
function TrebleClef() {
  return (
    <g fill="none" stroke="#1b0f22" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 57 C9.5 57 9 52 13 51.5 C18 51 20.5 56.5 18 61 C15 66 6.5 65.5 5.5 59 C4.5 51 11 46 14.5 39 C18 32 19 18 15 11 C12 7 9 12 10 22 L13.5 80 C14 87 8 88 7.5 84" />
      <circle cx="9" cy="83.5" r="2.2" fill="#1b0f22" stroke="none" />
    </g>
  );
}

/** The Music House, close up (§2.2): Lyra by her chimes, Ember listening, notes in the air while she plays. */
function MusicHouse({ playing, cheer }: { playing: boolean; cheer: boolean }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const lyra = NPC_DEFS['chromaria-musician'];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[14%] bg-[linear-gradient(#3e2a6b_0_68%,#2a1c4a_68%_100%)] px-3 pb-[4%]">
      <span>
        <EmberSprite anim={cheer ? 'cheer' : undefined} scale={3} />
      </span>
      <span className={cn('absolute left-1/2 top-[14%] -translate-x-1/2 text-4xl text-amber-200 transition-opacity', playing ? 'opacity-100' : 'opacity-25')}>♪ ♫ ♪</span>
      <span className="flex items-end">{lyra && <CharacterPortrait spriteId={npcSpriteId(lyra, flags)} emoji={npcEmoji(lyra, flags)} scale={3} className="text-5xl" />}</span>
    </div>
  );
}

/** A note as a little chip: its chime's colour and its letter (a colour's never alone). */
function NoteChip({ n, big = false }: { n: Note; big?: boolean }) {
  return (
    <span
      className={cn('flex items-center justify-center rounded-sm border border-[#1b0f22] font-black leading-none', big ? 'h-6 min-w-6 rounded border-2 px-0.5 text-[13px]' : 'h-4 min-w-4 text-[10px]')}
      style={{ background: CHIME[n].colour, color: n === 'G' ? '#ffffff' : '#1b0f22' }}
    >
      {n}
    </span>
  );
}

/** Lyra's Songbook: a page per tune echoed, its opening in its chimes' colours and letters; tapped, read out. */
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
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
                <span aria-hidden="true" className="flex flex-wrap gap-0.5">
                  {t.opening.map((n, k) => (
                    <NoteChip key={k} n={n} />
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
              <NoteChip key={k} n={n} big />
            ))}
          </p>
        </div>
      )}
    </section>
  );
}
