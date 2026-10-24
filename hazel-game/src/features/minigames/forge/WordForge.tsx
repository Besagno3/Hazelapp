import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FAMILIES, FAMILY_BY_ID, JOBS_PER_ROUND, PART_MEANS, builtLine, capitalise, forgeWords, jobFor, jobWords, keepHyphens, learnedLine, partText, rootAsk, rootChoices, rootWords, roundQueue, type FamilyId } from '../../../lib/minigames/forge';
import { BAND_LABEL, pageFlag, type PlayBand } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { noRepeat, useFocusMoved } from '../keys';
import { lastInputWasKey } from '../lastInput';
import { useSettled } from '../useSettled';
import { FamilyMark } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Forging the word; on Expert, what one of its roots means; its card. */
type Step = 'forge' | 'root' | 'done';

/** Dot once a word's forged, in turn — on Expert, plainly (§8.3). */
const RIGHT_LINES = ['Clang! A real word, hot off the anvil!', 'Perfect — I’ll write it on the wall in my best letters.', 'You’re a born word-smith!'];
const EXPERT_RIGHT_LINES = ['Forged.', 'That’s the word.', 'Right.'];

/** The steps, along the footer: each part, then Hammer (UX review round 1: "Read the meaning" was ticked before a tap). */
const STEP_CHIPS = ['Pick the first part', 'Then the second', 'Hammer!'];
const EXPERT_CHIPS = ['Forge the word', 'What a root means', 'Its page'];

const quote = (t: string) => `“${t}”`;

/**
 * 🔨 Word Forge (docs/DESIGN-MINIGAMES.md §5.10), at Scrivener Dot's ink forge
 * in Inkwell Cove: Dot says what a word means; the kid taps two parts in the
 * tray — each goes on the anvil in the next place (one on the anvil tapped
 * comes back) — and hammers. The word meant goes on Dot's word wall; any
 * other is said kindly — a real word that means something else, the other
 * way round, -s for -es, or no word, with a hint — and its parts float back.
 * Gentle joins two words, or makes more than one; Medium builds on a root
 * word; Tricky joins Greek and Latin roots, each saying what it means; Expert
 * (§8.5) forges from roots that don't say, then picks what one of them means.
 * Three words a round. No timer. Rules: `lib/minigames/forge.ts`.
 */
export default function WordForge({ def, band, round, onPage, onFinish }: PlayProps) {
  // Expert (§8.5): Latin and Greek roots, their tiles plain, and what a root means once the word's forged.
  const expert = band === 'expert';
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which families come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue(band, (id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const family = FAMILY_BY_ID[job.family];
  const [step, setStep] = useState<Step>('forge');
  const [anvil, setAnvil] = useState<(string | null)[]>([null, null]);
  // The parts that just floated back (they fade in where they sit).
  const [back, setBack] = useState<readonly string[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  // Each time Dot says something: the same words again are read again (code and UX review round 1: a second "The anvil
  // holds two parts" was silent).
  const [beat, setBeat] = useState(0);
  // Wrong hammers on this word: the buttons wait after each (code and UX review round 1: a double tap on Hammer after a
  // wrong try said "Two parts on the anvil first" over the hint).
  const [tries, setTries] = useState(0);
  const [newPage, setNewPage] = useState(false);
  const [rights, setRights] = useState(0);
  // Expert's seal (§8.3): each word forged at the first hammer and its root's meaning picked first time.
  const [missed, setMissed] = useState(false);
  const [spotOn, setSpotOn] = useState(0);
  // Expert's reward teaches the first word missed, not the round's (as the other games' Expert).
  const missedLesson = useRef<string | null>(null);
  // Expert's meanings picked and wrong, marked.
  const [tried, setTried] = useState<readonly string[]>([]);
  const [read, setRead] = useState<FamilyId | null>(null);
  const known = (id: FamilyId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}:${tries}`);
  // A press to act on: a key's at once (no click count), a tap's once settled.
  const ready = (e: { detail: number }) => e.detail === 0 || settled();
  const moved = useFocusMoved();
  const inTray = (p: string) => !anvil.includes(p);
  const left = anvil.filter((p) => !p).length;

  const tray = useRef<HTMLDivElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const tile = (p: string) => tray.current?.querySelector<HTMLButtonElement>(`[data-part="${p}"]`) ?? null;
  // Where focus goes once the anvil's drawn, the part pressed gone from the tray (code and UX review round 1: focus fell
  // out of the game — 14 keys a word): from the keyboard, the next part or Hammer; from a pointer, the tray (no ring).
  const focusTo = useRef<string | null>(null);

  function say(words: string | null) {
    setSaid(words);
    setBeat((b) => b + 1);
  }

  /** A part in the tray tapped: it goes on the anvil, in the next place. */
  function place(p: string, e: MouseEvent) {
    if (step !== 'forge' || !settled() || moved.tooSoon(p, e)) return;
    setRead(null);
    const k = anvil.indexOf(null);
    if (k < 0) {
      say('The anvil holds two parts — tap one on it to take it off.');
      return;
    }
    const next = anvil.map((x, j) => (j === k ? p : x));
    setAnvil(next);
    setBack([]);
    say(null);
    if (document.activeElement === tile(p)) {
      const rest = job.tiles.filter((x) => x !== p && !next.includes(x));
      const from = job.tiles.indexOf(p);
      focusTo.current = (next.includes(null) && [...rest.filter((x) => job.tiles.indexOf(x) > from), ...rest][0]) || 'hammer';
    }
    sfx('select');
  }

  /** A place on the anvil tapped: its part comes back to the tray; an empty one says how. */
  function takeBack(k: number) {
    if (step !== 'forge' || !settled()) return;
    setRead(null);
    const p = anvil[k];
    if (!p) {
      say('Tap a part in the tray — it goes on the anvil.');
      return;
    }
    setAnvil(anvil.map((x, j) => (j === k ? null : x)));
    say(`${quote(partText(p, band))} is back in the tray.`);
    sfx('select');
  }

  function hammer(e: MouseEvent) {
    if (step !== 'forge' || !settled() || moved.tooSoon('hammer', e)) return;
    setRead(null);
    if (left) {
      say(`Two parts on the anvil first — ${left === 1 ? 'one more' : 'two'} to go.`);
      return;
    }
    const parts = anvil as [string, string];
    const { right, said: words } = forgeWords(job, parts);
    say(words);
    if (right) {
      sfx('chest');
      // Expert: forged, then what one of its roots means.
      if (expert) return void setStep('root');
      fileWord(missed);
      return;
    }
    sfx('wrong');
    if (expert) setMissed(true);
    setTries((t) => t + 1);
    setBack(parts);
    setAnvil([null, null]);
    if (document.activeElement === goRef.current) focusTo.current = job.tiles[0];
  }

  /** The word's on the wall: its page, Dot's cheer, and on Expert the seal's count (`miss`: a wrong hammer or meaning on the way). */
  function fileWord(miss: boolean) {
    setNewPage(onPage(job.family, family.name));
    setRights((r) => r + 1);
    if (expert && !miss) setSpotOn((n) => n + 1);
    if (expert && miss) missedLesson.current ??= learnedLine(job);
    setStep('done');
  }

  /** Expert: a meaning picked for the word's root — right, the word's filed; wrong, said, and picked again. */
  function pickRoot(m: string, e: { detail: number }) {
    if (step !== 'root' || !ready(e)) return;
    setRead(null);
    const { right, said: words } = rootWords(job, m);
    say(words);
    if (!right) {
      sfx('wrong');
      setMissed(true);
      setTried((t) => (t.includes(m) ? t : [...t, m]));
      return;
    }
    sfx('chest');
    fileWord(missed);
  }

  function next(e: { detail: number }) {
    if (step !== 'done' || !ready(e)) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      // The round's three words, each how it's built (UX review round 2: only the last was named); on Expert the first
      // missed word's lesson, the seal's count.
      const built = Array.from({ length: JOBS_PER_ROUND }, (_, i) => builtLine(jobFor(band, round, i, queue)));
      onFinish({ title: 'Three words forged!', learned: (expert && missedLesson.current) || keepHyphens(built.join(' ')), spotOn: expert ? { right: spotOn, of: JOBS_PER_ROUND } : undefined });
      return;
    }
    setDone((d) => d + 1);
    setStep('forge');
    setAnvil([null, null]);
    setBack([]);
    setTries(0);
    say(null);
    setNewPage(false);
    setMissed(false);
    setTried([]);
  }

  // Focus where each step starts: from the keyboard, the tray's first part; from a pointer, the tray — no ring, which lit
  // up the first part as if picked (code and UX review round 1); the word forged.
  const doneHead = useRef<HTMLHeadingElement>(null);
  const rootHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else if (step === 'root') rootHead.current?.focus({ preventScroll: true });
    else if (lastInputWasKey()) tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    else tray.current?.focus({ preventScroll: true });
  }, [step, done]);
  useEffect(() => {
    const to = focusTo.current;
    focusTo.current = null;
    if (!to) return;
    if (!lastInputWasKey()) return void tray.current?.focus({ preventScroll: true });
    (to === 'hammer' ? goRef.current : tile(to))?.focus({ preventScroll: true });
    moved.mark(to);
  }, [anvil]); // eslint-disable-line react-hooks/exhaustive-deps

  // As each step starts, the page scrolls back to the board's top on a phone (a word forged: at least that, with Next);
  // where the page doesn't scroll, the step's gold button comes into view. A new page on the wall, in a side panel, comes
  // into sight (UX review round 1: it was below the panel's fold) — clear of Dot's bubble, kept at the panel's top.
  const page = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  const side = useRef<HTMLElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
    const a = side.current;
    const fresh = step === 'done' && newPage ? a?.querySelector<HTMLElement>(`[data-family="${job.family}"]`) : null;
    if (a && fresh && a.scrollHeight > a.clientHeight && getComputedStyle(a).overflowY !== 'visible') {
      const cover = bubble.current && getComputedStyle(bubble.current).position === 'sticky' ? bubble.current.offsetHeight : 0;
      const top = fresh.getBoundingClientRect().top - a.getBoundingClientRect().top;
      const below = top + fresh.offsetHeight + 8 - a.clientHeight;
      if (below > 0 || top < cover) a.scrollTo?.({ top: a.scrollTop + (top < cover ? top - cover - 8 : below), behavior });
    }
    const go = goRef.current;
    const s = page.current;
    const b = board.current;
    if (s && b && s.scrollHeight > s.clientHeight && getComputedStyle(s).overflowY !== 'hidden') {
      const base = s.getBoundingClientRect().top - s.scrollTop;
      const top = b.getBoundingClientRect().top - base;
      const bottom = go ? go.getBoundingClientRect().bottom - base : top;
      const show = bottom + 12 - s.clientHeight;
      s.scrollTo?.({ top: Math.max(0, step === 'done' ? Math.max(top, show) : Math.min(top, show)), behavior });
    } else go?.scrollIntoView?.({ block: 'nearest', behavior });
  }, [step, done]); // eslint-disable-line react-hooks/exhaustive-deps

  // On Expert after a miss, not "Forged." — it read as the last answer's (Echo's Call's UX review round 1).
  const cheerLine = expert
    ? `${missed ? 'Forged, with a miss on the way.' : EXPERT_RIGHT_LINES[(rights - 1 + EXPERT_RIGHT_LINES.length) % EXPERT_RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Next word.' : 'That’s three.'}`
    : `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Another?' : 'The wall’s filling up!'}`;
  // What Dot says — once a part's on the anvil, which (UX review round 1: a reader never heard what landed). A page of the
  // wall is read under the wall, not by her: her bubble growing moved the page tapped, so a second tap to close it hit
  // another (UX review round 2).
  const [first, second] = anvil.map((p) => (p ? quote(partText(p, band)) : null));
  let line: string;
  if (step === 'done') line = cheerLine;
  else if (step === 'root') line = said ? (said.startsWith('Not ') ? said : `${said} ${rootAsk(job)}`) : rootAsk(job);
  else if (said) line = said;
  else if (left === 2) line = `I need a word that means “${job.word.meaning}”. Which two parts make it?`;
  else if (left === 1) line = `${first ?? second} is on the anvil. And the second part? Tap it in the tray.`;
  else line = `${first} and ${second} are on the anvil — hammer them together${expert ? '.' : '!'}`;
  line = keepHyphens(line);
  if (beat % 2) line += '​';

  // The next part goes in the first empty place (UX review round 2: with only the second filled, it said "Then the second").
  // Expert's three: forging, the root, and the word's card (its page).
  const chipAt = expert ? (step === 'done' ? 2 : step === 'root' ? 1 : 0) : step === 'done' ? 3 : !anvil[0] ? 0 : !anvil[1] ? 1 : 2;
  const forming = anvil.map((p) => p ?? '').join('');

  return (
    <div ref={page} className="flex min-h-0 flex-1 flex-col overflow-y-auto split:overflow-hidden">
      <div className="grid flex-none grid-cols-1 split:min-h-0 split:flex-1 split:grid-cols-[minmax(0,1fr)_300px] split:grid-rows-[minmax(0,24fr)_minmax(0,76fr)] [@media(min-width:1024px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_380px] split:[@media(max-height:700px)]:grid-rows-[minmax(0,1fr)] split:[@media(max-height:500px)]:grid-cols-[minmax(400px,1fr)_minmax(0,260px)]">
        <div aria-hidden="true" className="relative hidden overflow-hidden split:col-start-1 split:row-start-1 split:block [@media(max-height:700px)]:hidden">
          <Forge cheer={step === 'done'} />
        </div>

        {/* The anvil and the tray, and the step with its buttons beside them on a screen held sideways from 560 px (under them
            held upright; on a short screen, a bar under them). */}
        <section
          ref={board}
          aria-labelledby="wf-step"
          className="flex flex-col gap-3 bg-[#2b1d3d] p-2 split:col-start-1 split:row-start-2 split:min-h-0 split:overflow-y-auto split:border-t-4 split:border-[#1b0f22] split:p-4 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-row [@media(max-height:500px)]:gap-1.5 split:[@media(max-height:700px)]:row-start-1 split:[@media(max-height:700px)]:border-t-0 split:[@media(max-height:500px)]:p-2"
        >
          <div className="flex min-w-0 flex-col gap-3 [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-1 [@media(max-height:500px)]:gap-1.5">
            <Anvil anvil={anvil} band={band} forming={step !== 'forge' ? job.word.word : forming} done={step !== 'forge'} still={still} onTap={takeBack} />
            {step === 'forge' && (
              <div
                ref={tray}
                role="group"
                tabIndex={-1}
                aria-label={`The tray of word parts: ${left} to place`}
                aria-describedby="wf-do"
                className="flex flex-col gap-1.5 focus:outline-none"
              >
                <p aria-hidden="true" className="text-[13px] font-bold uppercase tracking-wide text-[#f5d0a9] [@media(max-height:500px)]:hidden">
                  Word parts
                </p>
                {/* Each part keeps its spot in the tray, so placing one never moves the others under a finger. On a short screen
                    held sideways, one row — but Tricky's roots and their meanings one row only where the board's the screen's
                    width, not a split screen's narrower one (UX review round 1: "graphy" ran out of a 45 px tile). */}
                <div
                  className={cn(
                    'grid grid-cols-3 gap-1.5',
                    band === 'tricky' || expert
                      ? '[@media(min-width:560px)_and_(max-width:639px)_and_(max-height:500px)]:grid-flow-col [@media(min-width:560px)_and_(max-width:639px)_and_(max-height:500px)]:auto-cols-fr [@media(min-width:560px)_and_(max-width:639px)_and_(max-height:500px)]:grid-cols-none'
                      : '[@media(min-width:560px)_and_(max-height:500px)]:grid-flow-col [@media(min-width:560px)_and_(max-height:500px)]:auto-cols-fr [@media(min-width:560px)_and_(max-height:500px)]:grid-cols-none',
                  )}
                >
                  {job.tiles.map((p) =>
                    inTray(p) ? (
                      <PartButton key={p} part={p} band={band} back={back.includes(p)} onTap={(e) => place(p, e)} />
                    ) : (
                      <span key={p} aria-hidden="true" className="min-h-[56px] rounded-md border-2 border-dashed border-[#7c5a46] [@media(max-height:500px)]:min-h-[48px]" />
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
          <div
            className={cn(
              windowClass,
              // On a short screen, a bar kept in sight at the bottom, should the tray run past it — and on a small phone held
              // upright, while forging, the same compact bar (bench: at 320 × 568 Hammer was under the fold). On a short split
              // screen, while forging, one row: the meaning and Hammer — what Dot said is in her bubble beside the board (bench:
              // at 640 × 400 the bar covered Tricky's second row of parts).
              'flex flex-col gap-2.5 p-3 [&>*]:flex-none split:overflow-y-auto [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:w-[min(300px,40%)] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-none [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:sticky [@media(max-height:500px)]:bottom-0 [@media(max-height:500px)]:z-10 [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible [@media(max-height:500px)]:p-2',
              step === 'forge' &&
                '[@media(max-width:559px)_and_(max-height:640px)]:sticky [@media(max-width:559px)_and_(max-height:640px)]:bottom-0 [@media(max-width:559px)_and_(max-height:640px)]:z-10 [@media(max-width:559px)_and_(max-height:640px)]:p-2 split:[@media(max-height:500px)]:flex-row split:[@media(max-height:500px)]:items-center',
            )}
          >
            <p className={cn('text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden', step === 'forge' && '[@media(max-width:559px)_and_(max-height:640px)]:hidden')}>
              Word {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                {/* Focused from script: no ring (code review round 1). */}
                <h2 id="wf-step" ref={doneHead} tabIndex={-1} aria-describedby="wf-result" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white focus:outline-none [@media(max-height:500px)]:text-[20px]')}>
                  {capitalise(job.word.word)}
                  {expert ? '' : '!'}
                </h2>
                {/* Dot's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                <div className="flex flex-col gap-2.5 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-end [@media(max-height:500px)]:gap-2">
                  <p id="wf-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px]">
                    {keepHyphens(learnedLine(job))}
                    {/* Not "Graph, “write” are on the word wall!" (UX review round 1). */}
                    {newPage && ` A new page on the word wall: ${family.name}${expert ? '.' : '!'}`}
                  </p>
                  <button ref={goRef} type="button" onClick={(e) => next(e)} onKeyDown={noRepeat} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:text-base')}>
                    {done + 1 < JOBS_PER_ROUND ? 'Next word' : expert ? 'All forged' : 'All forged!'}
                  </button>
                </div>
              </>
            ) : step === 'root' ? (
              <>
                {/* Expert: the word forged, what one of its roots means — four to pick from; what Dot said of a wrong one under
                    them, in a box kept its height, so the meanings never move. */}
                <h2 id="wf-step" ref={rootHead} tabIndex={-1} aria-describedby="wf-root" className={cn(pixelHeadClass, 'self-start rounded text-[24px] leading-none focus:outline-none [@media(max-height:500px)]:text-[18px]')}>
                  What does it mean?
                </h2>
                <p id="wf-root" className="rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[16px] font-bold leading-snug text-[#1b0f22] shadow-[0_3px_0_#1b0f22] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[14px]">
                  {rootAsk(job)}
                </p>
                <div role="group" aria-labelledby="wf-step" aria-describedby="wf-root" className="grid grid-cols-2 gap-2 [@media(min-width:560px)_and_(max-height:500px)]:grid-cols-4">
                  {rootChoices(job).map((m, k, all) => (
                    <button
                      key={m}
                      ref={k === all.length - 1 ? goRef : undefined}
                      type="button"
                      onClick={(e) => pickRoot(m, e)}
                      onKeyDown={noRepeat}
                      aria-label={`“${m}”${tried.includes(m) ? ', tried' : ''}`}
                      className={cn(
                        'min-h-12 rounded-lg border-[3px] border-[#5a55a8] bg-[#24215a] px-1.5 text-[16px] font-bold leading-tight hover:bg-[#2f2b70] [@media(max-height:500px)]:min-h-11 [@media(max-height:500px)]:text-[14px]',
                        tried.includes(m) && 'border-dashed text-[#a8a4d8] line-through',
                        focusRing,
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p className="flex min-h-[4.5rem] items-center rounded-md bg-[#24215a] px-2.5 py-1.5 text-[15px] leading-snug [@media(max-height:500px)]:min-h-[3.25rem] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px]">
                  {said && said.startsWith('Not ') ? <span className="font-bold">{said}</span> : <span className="text-[#e4e1ff]">{said ?? 'One of the meanings is the root’s.'}</span>}
                </p>
              </>
            ) : (
              <>
                <h2 id="wf-step" className={cn(pixelHeadClass, 'self-start text-[24px] leading-none [@media(max-height:500px)]:sr-only [@media(max-width:559px)_and_(max-height:640px)]:sr-only')}>
                  Forge a word
                </h2>
                {/* What Dot asks for, in sight by the anvil — in a bar, with the word's count (UX review round 1: it was hidden). */}
                <p id="wf-do" className="rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[16px] font-bold leading-snug text-[#1b0f22] shadow-[0_3px_0_#1b0f22] split:[@media(max-height:500px)]:!flex-1 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[14px] [@media(max-width:559px)_and_(max-height:640px)]:py-1 [@media(max-width:559px)_and_(max-height:640px)]:text-[14px]">
                  {/* On a short screen, on one line (bench: at 568 × 320 the bar covered the tray). */}
                  <span className="text-[12px] font-bold uppercase tracking-wide text-[#a3195b] [@media(max-height:500px)]:mr-1.5">
                    <span className="hidden [@media(max-height:500px)]:inline [@media(max-width:559px)_and_(max-height:640px)]:inline">
                      Word {done + 1} of {JOBS_PER_ROUND} ·{' '}
                    </span>
                    {/* On a short screen, read out but not shown, so the meaning's one line (code and UX review round 2: at
                        568 × 320, two, and the bar covered half of Tricky's meanings on the tiles). */}
                    <span className="[@media(max-height:500px)]:sr-only">A word that means</span>
                  </span>
                  <br className="[@media(max-height:500px)]:hidden" />“{job.word.meaning}”
                </p>
                {/* Hammer, then what Dot said of the last hammer — under it, so a long verdict never moves it (code and UX review
                    round 1: 52 px at 1024 × 768); in a bar, beside it, Hammer at its top. Dot's words are by the anvil too: on a
                    phone her bubble's below the fold. Not read out — her bubble is. */}
                <div className="flex flex-col gap-2.5 [@media(max-height:500px)]:flex-row-reverse [@media(max-height:500px)]:items-start [@media(max-height:500px)]:gap-2 [@media(max-width:559px)_and_(max-height:640px)]:flex-row-reverse [@media(max-width:559px)_and_(max-height:640px)]:items-start [@media(max-width:559px)_and_(max-height:640px)]:gap-2">
                  <button
                    ref={goRef}
                    type="button"
                    onClick={hammer}
                    onKeyDown={noRepeat}
                    aria-disabled={left > 0 || undefined}
                    aria-describedby="wf-do"
                    className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-[15px] [@media(max-width:559px)_and_(max-height:640px)]:flex-none [@media(max-width:559px)_and_(max-height:640px)]:px-3 [@media(max-width:559px)_and_(max-height:640px)]:text-[15px]')}
                  >
                    🔨 Hammer!
                  </button>
                  {/* All of it, never cut short (code and UX review round 1: what Dot wants, or the hint, was clamped off). */}
                  <p className="flex min-h-[4.5rem] items-center rounded-md bg-[#24215a] px-2.5 py-1.5 text-[15px] font-bold leading-snug split:[@media(max-height:500px)]:hidden [@media(max-height:500px)]:min-h-[2.75rem] [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px] [@media(max-width:559px)_and_(max-height:640px)]:min-h-[3.25rem] [@media(max-width:559px)_and_(max-height:640px)]:flex-1 [@media(max-width:559px)_and_(max-height:640px)]:py-1 [@media(max-width:559px)_and_(max-height:640px)]:text-[13px]">
                    {said ? (
                      <span>{keepHyphens(said)}</span>
                    ) : (
                      // Till Dot's said something: what to do now (an empty box looked like a field to fill).
                      <span className="font-normal text-[#e4e1ff]">{left === 2 ? 'Tap two parts in the tray, in order.' : left ? 'And the second part?' : 'Both on the anvil — hammer them!'}</span>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>

        <aside
          ref={side}
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] split:col-start-2 split:row-span-2 split:row-start-1 split:overflow-y-auto split:border-l-4 split:p-4"
        >
          {/* On a split screen, kept at the panel's top as the wall scrolls under it: on a short one it's the only place what Dot
              said is (code review round 2: a new page brought into sight scrolled it away). */}
          <div ref={bubble} className="split:sticky split:top-0 split:z-10 split:-mx-4 split:-mt-4 split:bg-[#1e1b4b] split:px-4 split:pb-2 split:pt-4">
            <HostBubble npcId={def.host} line={line} phoneStrip />
          </div>
          <div className="[@media(max-height:500px)]:hidden">
            {/* The family named once its word's forged, not before (UX review round 1: "TELE, “FAR”" and a part on the ticket
                gave the word away). */}
            <Ticket heading={step === 'done' ? family.name.toUpperCase() : `WORD ${done + 1} OF ${JOBS_PER_ROUND}`} ready={step === 'done'} icon={<FamilyMark id={step === 'done' ? job.family : null} size={44} />}>
              {jobWords(job)}
            </Ticket>
          </div>
          <WordWall
            known={known}
            read={read}
            fresh={step === 'done' && newPage ? job.family : null}
            onRead={(id) => {
              if (!settled()) return;
              // Pressed again, the page closes (UX review round 1: it stayed open).
              setRead((r) => (r === id ? null : id));
            }}
          />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 split:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={expert ? EXPERT_CHIPS : STEP_CHIPS} current={chipAt} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

/**
 * A part's tile: its letters (an add-on with its hyphen); on Tricky, what it
 * means under them (not "wave" under wave); just floated back, a fade where it
 * sits — no shake under the finger that taps it next (code and UX review round
 * 1).
 */
function PartButton({ part, band, back, onTap }: { part: string; band: PlayBand; back: boolean; onTap: (e: MouseEvent) => void }) {
  const means = band === 'tricky' && PART_MEANS[part] !== part ? PART_MEANS[part] : undefined;
  return (
    <button
      type="button"
      data-part={part}
      onClick={onTap}
      onKeyDown={noRepeat}
      aria-label={`${partText(part, band)}${means ? `, meaning “${means}”` : ''}`}
      className={cn(
        'flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-md border-[3px] border-[#1b0f22] bg-[#fdba74] px-1 py-1 text-center text-[#1b0f22] shadow-[2px_2px_0_#1b0f22] hover:bg-[#fed7aa] [@media(max-height:500px)]:min-h-[48px] [@media(max-height:500px)]:py-0.5',
        back && 'wf-back',
        focusRing,
      )}
    >
      <span className="text-[19px] font-black leading-tight [@media(max-height:500px)]:text-[16px]">{partText(part, band)}</span>
      {means && <span className="rounded bg-[#1b0f22] px-1 text-[12px] font-bold leading-tight text-amber-200">“{means}”</span>}
    </button>
  );
}

/**
 * The anvil: two places for parts, in order — a part on it tapped comes back
 * to the tray — and the word they make, glowing; once forged, the word, with a
 * pop and sparks (UX review round 1: the scene's sparks are hidden on a phone).
 */
function Anvil({ anvil, band, forming, done, still, onTap }: { anvil: readonly (string | null)[]; band: PlayBand; forming: string; done: boolean; still: boolean; onTap: (k: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg bg-[#3b2a52] px-2 py-2 [@media(max-height:500px)]:gap-1 [@media(max-height:500px)]:py-1">
      <ol aria-label="The anvil" aria-describedby={done ? undefined : 'wf-do'} className="flex w-full max-w-[420px] items-center justify-center gap-2">
        {anvil.map((p, k) => (
          <li key={k} className="flex flex-1 items-center gap-2">
            {k === 1 && (
              <span aria-hidden="true" className="text-2xl font-black text-[#fdba74]">
                +
              </span>
            )}
            <button
              type="button"
              onClick={() => onTap(k)}
              onKeyDown={noRepeat}
              aria-disabled={done || undefined}
              aria-label={`${k === 0 ? 'First' : 'Second'} part${p ? `: ${partText(p, band)}${done ? '' : ' (take it back)'}` : ', empty'}`}
              className={cn(
                'flex min-h-[56px] w-full items-center justify-center rounded-md border-[3px] text-[19px] font-black [@media(max-height:500px)]:min-h-[44px] [@media(max-height:500px)]:text-[16px]',
                p ? 'border-[#1b0f22] bg-[#fdba74] text-[#1b0f22] shadow-[2px_2px_0_#1b0f22]' : 'border-dashed border-[#9b7bc0] bg-[#2b1d3d] text-[#9b7bc0]',
                focusRing,
              )}
            >
              {p ? partText(p, band) : k + 1}
            </button>
          </li>
        ))}
      </ol>
      {/* The anvil itself, and the word the parts make, hot. */}
      <div aria-hidden="true" className="h-3 w-full max-w-[420px] rounded-b-md bg-[#4b5563] shadow-[0_3px_0_#1b0f22] [@media(max-height:500px)]:h-2" />
      <p className={cn('min-h-[1.75rem] text-center font-mono text-[22px] font-black leading-tight tracking-wide [@media(max-height:500px)]:min-h-[1.25rem] [@media(max-height:500px)]:text-[16px]', done ? 'text-amber-300' : 'text-[#fdba74]')}>
        {done ? (
          <>
            <span aria-hidden="true">✨ </span>
            <span className={cn('inline-block', !still && 'wf-pop')}>{forming}</span>
            <span aria-hidden="true"> ✨</span>
          </>
        ) : (
          forming
        )}
      </p>
    </div>
  );
}

/** Inkwell Cove's ink forge, close up (§2.2): Dot at her desk, Ember breathing on the forge, sparks when a word's made. */
function Forge({ cheer }: { cheer: boolean }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const dot = NPC_DEFS['ink-dot'];
  return (
    <div className="absolute inset-0 flex items-end justify-center gap-[16%] bg-[linear-gradient(#1f1530_0_70%,#3b2a22_70%_100%)] px-3 pb-[3%]">
      <span className={cn('absolute left-1/2 top-[12%] -translate-x-1/2 text-3xl transition-opacity', cheer ? 'opacity-100' : 'opacity-30')}>✨ 🔨 ✨</span>
      <span>
        <EmberSprite anim={cheer ? 'cheer' : undefined} scale={3} />
      </span>
      <span className="flex items-end">{dot && <CharacterPortrait spriteId={npcSpriteId(dot, flags)} emoji={npcEmoji(dot, flags)} scale={3} className="text-5xl" />}</span>
    </div>
  );
}

/**
 * Dot's word wall: a page per family forged — a new one marked "New!" (UX
 * review round 1) — tapped, read under the wall in a place kept for it, so
 * nothing moves and a second tap on the page closes it (UX review round 2:
 * the page read opened under the wall and scrolled into sight, and the page
 * tapped moved from under the finger).
 */
function WordWall({ known, read, fresh, onRead }: { known: (id: FamilyId) => boolean; read: FamilyId | null; fresh: FamilyId | null; onRead: (id: FamilyId) => void }) {
  const count = FAMILIES.filter((f) => known(f.id)).length;
  const reading = read ? FAMILY_BY_ID[read] : null;
  return (
    <section aria-labelledby="wf-wall" className="mt-auto flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="wf-wall" className={cn(pixelHeadClass, 'text-2xl leading-none')}>
          Word wall
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {FAMILIES.length} families
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-1.5 [@media(max-width:700px)_and_(max-height:500px)]:grid-cols-2">
        {FAMILIES.map((f) =>
          known(f.id) ? (
            <li key={f.id} data-family={f.id} className="relative">
              {fresh === f.id && (
                <span aria-hidden="true" className="absolute -right-1 -top-1 z-10 rounded-full border-2 border-[#1b0f22] bg-emerald-400 px-1.5 text-[11px] font-black leading-tight text-[#1b0f22]">
                  New!
                </span>
              )}
              <button
                type="button"
                onClick={() => onRead(f.id)}
                onKeyDown={noRepeat}
                aria-pressed={read === f.id}
                aria-label={`${f.name}${fresh === f.id ? ', new' : ''}. Read the page`}
                className={cn('flex h-[76px] w-full flex-col items-center justify-center gap-1 rounded border-[3px] bg-[#fff6dc] px-1 hover:bg-white', read === f.id || fresh === f.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <FamilyMark id={f.id} size={32} />
                <span aria-hidden="true" className="line-clamp-2 w-full break-words text-center text-[12px] font-bold leading-tight text-[#1b0f22]">
                  {f.name}
                </span>
              </button>
            </li>
          ) : (
            // Not read out one by one: "0 of 9 families" says it (UX review round 2).
            <li key={f.id} data-family={f.id} aria-hidden="true" className="flex h-[76px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
              🔨 ?
            </li>
          ),
        )}
      </ul>
      {/* The page read, said as it opens; held at the longest page's height where the wall sits at the panel's foot. */}
      <div aria-live="polite" className="rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[14px] leading-snug text-[#1b0f22] split:[@media(min-height:501px)]:min-h-[9.5rem]">
        {reading ? (
          <>
            <b>{reading.name}</b> — {keepHyphens(reading.note)} <i>{reading.words.map((x) => x.word).join(', ')}.</i>
          </>
        ) : (
          <span className="text-[#5b4a6b]">{count ? 'Tap a page to read it.' : 'Forge a word to start the wall.'}</span>
        )}
      </div>
    </section>
  );
}
