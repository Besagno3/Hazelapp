import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FAMILIES, FAMILY_BY_ID, JOBS_PER_ROUND, PART_MEANS, capitalise, forgeWords, jobFor, jobWords, learnedLine, roundQueue, type FamilyId } from '../../../lib/minigames/forge';
import { BAND_LABEL, pageFlag, type Band } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useSettled } from '../useSettled';
import { FamilyTile } from './art';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** Forging the word; its card. */
type Step = 'forge' | 'done';

/** Dot once a word's forged, in turn. */
const RIGHT_LINES = ['Clang! A real word, hot off the anvil!', 'Perfect — I’ll write it on the wall in my best letters.', 'You’re a born word-smith!'];

/** The steps, along the footer. */
const STEP_CHIPS = ['Read the meaning', 'Pick two parts', 'Hammer!'];

/** Parts that go at a word's front, and at its back: drawn with their hyphen ("un-", "-ful"). */
const FRONT = ['un', 're', 'pre'];
const BACK = ['ful', 'less', 'er', 'est', 's', 'es'];

/** A part as its tile shows it: an add-on with its hyphen; Tricky's roots plain (each says what it means). */
function partText(p: string, band: Band): string {
  if (band === 'tricky') return p;
  return FRONT.includes(p) ? `${p}-` : BACK.includes(p) ? `-${p}` : p;
}

/**
 * 🔨 Word Forge (docs/DESIGN-MINIGAMES.md §5.10), at Scrivener Dot's ink forge
 * in Inkwell Cove: Dot says what a word means; the kid taps two parts in the
 * tray — each goes on the anvil in the next place (one on the anvil tapped
 * comes back) — and hammers. The word meant goes on Dot's word wall; any
 * other is said kindly — the other way round, a real word that means
 * something else, or no word, with a hint — and its parts float back. Gentle
 * joins two words, or makes more than one; Medium builds on a root word;
 * Tricky joins Greek and Latin roots, each saying what it means. Three words
 * a round. No timer. Rules: `lib/minigames/forge.ts`.
 */
export default function WordForge({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [done, setDone] = useState(0);
  // Which families come up this round, settled as it starts (the stage mounts a game afresh each round).
  const [queue] = useState(() => roundQueue(band, (id) => !!flags[pageFlag(def.id, id)], round));
  const job = useMemo(() => jobFor(band, round, done, queue), [band, round, done, queue]);
  const family = FAMILY_BY_ID[job.family];
  const [step, setStep] = useState<Step>('forge');
  const [anvil, setAnvil] = useState<(string | null)[]>([null, null]);
  // The parts that just floated back (a shake as they land).
  const [back, setBack] = useState<readonly string[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [newPage, setNewPage] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);
  const [rights, setRights] = useState(0);
  const [read, setRead] = useState<FamilyId | null>(null);
  const known = (id: FamilyId) => !!flags[pageFlag(def.id, id)];
  // A step's buttons wait a moment as it starts: a double tap's second tap would press what just came under the finger.
  const settled = useSettled(`${step}:${done}`);
  const inTray = (p: string) => !anvil.includes(p);
  const left = anvil.filter((p) => !p).length;

  /** A part in the tray tapped: it goes on the anvil, in the next place. */
  function place(p: string) {
    if (step !== 'forge' || !settled()) return;
    setRead(null);
    const k = anvil.indexOf(null);
    if (k < 0) {
      setSaid('The anvil holds two parts — tap one on it to take it off.');
      return;
    }
    setAnvil(anvil.map((x, j) => (j === k ? p : x)));
    setBack([]);
    setSaid(null);
    sfx('select');
  }

  /** A place on the anvil tapped: its part comes back to the tray; an empty one says how. */
  function takeBack(k: number) {
    if (step !== 'forge' || !settled()) return;
    setRead(null);
    const p = anvil[k];
    if (!p) {
      setSaid('Tap a part in the tray — it goes on the anvil.');
      return;
    }
    setAnvil(anvil.map((x, j) => (j === k ? null : x)));
    setSaid(`${partText(p, band)} is back in the tray.`);
    sfx('select');
  }

  function hammer() {
    if (step !== 'forge' || !settled()) return;
    setRead(null);
    if (left) {
      setSaid(`Two parts on the anvil first — ${left === 1 ? 'one more' : 'two'} to go.`);
      return;
    }
    const parts = anvil as [string, string];
    const { right, said: words } = forgeWords(job, parts);
    setSaid(words);
    if (right) {
      sfx('chest');
      setNewPage(onPage(job.family, family.name));
      setLessons((l) => [...l, learnedLine(job)]);
      setRights((r) => r + 1);
      setStep('done');
      return;
    }
    sfx('wrong');
    setBack(parts);
    setAnvil([null, null]);
  }

  function next() {
    if (step !== 'done' || !settled()) return;
    setRead(null);
    if (done + 1 >= JOBS_PER_ROUND) {
      onFinish({ title: 'Three words forged!', learned: lessons[lessons.length - 1] ?? '' });
      return;
    }
    setDone((d) => d + 1);
    setStep('forge');
    setAnvil([null, null]);
    setBack([]);
    setSaid(null);
    setNewPage(false);
  }

  // Focus where each step starts: the tray's first part; the word forged.
  const tray = useRef<HTMLDivElement>(null);
  const doneHead = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === 'done') doneHead.current?.focus({ preventScroll: true });
    else tray.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [step, done]);

  // As each step starts, the page scrolls back to the board's top on a phone (a word forged: at least that, with Next);
  // where the page doesn't scroll, the step's gold button comes into view.
  const goRef = useRef<HTMLButtonElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    const behavior = still ? ('auto' as const) : ('smooth' as const);
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

  const cheerLine = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${done + 1 < JOBS_PER_ROUND ? 'Another?' : 'The wall’s filling up!'}`;
  let line: string;
  if (read) line = `${FAMILY_BY_ID[read].name}: ${FAMILY_BY_ID[read].note}`;
  else if (step === 'done') line = cheerLine;
  else if (said) line = said;
  else if (left === 2) line = `I need a word that means “${job.word.meaning}”. Which two parts make it?`;
  else line = left ? 'And the second part? Tap it in the tray.' : 'Both on the anvil — hammer them together!';

  const chipAt = step === 'done' ? 3 : left === 0 ? 2 : 1;
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
            <Anvil anvil={anvil} band={band} forming={step === 'done' ? job.word.word : forming} done={step === 'done'} onTap={takeBack} />
            {step === 'forge' && (
              <div ref={tray} role="group" aria-label={`The tray of word parts: ${left} to place`} className="flex flex-col gap-1.5">
                <p aria-hidden="true" className="text-[13px] font-bold uppercase tracking-wide text-[#f5d0a9] [@media(max-height:500px)]:hidden">
                  Word parts
                </p>
                {/* Each part keeps its spot in the tray, so placing one never moves the others under a finger. */}
                <div className="grid grid-cols-3 gap-1.5 [@media(min-width:560px)_and_(max-height:500px)]:grid-flow-col [@media(min-width:560px)_and_(max-height:500px)]:auto-cols-fr [@media(min-width:560px)_and_(max-height:500px)]:grid-cols-none">
                  {job.tiles.map((p) =>
                    inTray(p) ? (
                      <PartButton key={p} part={p} band={band} splash={back.includes(p) && !still} onTap={() => place(p)} />
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
              // upright, while forging, the same compact bar (bench: at 320 × 568 Hammer was under the fold).
              'flex flex-col gap-2.5 p-3 [&>*]:flex-none split:overflow-y-auto [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:w-[min(300px,40%)] [@media(min-width:560px)_and_(orientation:landscape)_and_(min-height:501px)]:flex-none [@media(max-height:640px)]:gap-2 [@media(max-height:500px)]:sticky [@media(max-height:500px)]:bottom-0 [@media(max-height:500px)]:z-10 [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:overflow-visible [@media(max-height:500px)]:p-2',
              step === 'forge' && '[@media(max-width:559px)_and_(max-height:640px)]:sticky [@media(max-width:559px)_and_(max-height:640px)]:bottom-0 [@media(max-width:559px)_and_(max-height:640px)]:z-10 [@media(max-width:559px)_and_(max-height:640px)]:p-2',
            )}
          >
            <p className={cn('text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2] [@media(max-height:500px)]:hidden', step === 'forge' && '[@media(max-width:559px)_and_(max-height:640px)]:hidden')}>
              Word {done + 1} of {JOBS_PER_ROUND}
            </p>
            {step === 'done' ? (
              <>
                <h2 id="wf-step" ref={doneHead} tabIndex={-1} aria-describedby="wf-result" className={cn(pixelHeadClass, 'self-start rounded text-[26px] leading-none text-white [@media(max-height:500px)]:text-[20px]', focusRing)}>
                  {capitalise(job.word.word)}!
                </h2>
                {/* Dot's cheer, in the card too: on a phone her bubble's below the fold — not on a split screen or a short one. */}
                <p className="text-[15px] font-bold leading-snug text-amber-200 split:hidden [@media(max-height:500px)]:hidden">{cheerLine}</p>
                <div className="flex flex-col gap-2.5 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-end [@media(max-height:500px)]:gap-2">
                  <p id="wf-result" className="rounded-lg bg-amber-300 px-3 py-2 text-[15px] font-bold leading-snug text-[#1b0f22] [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px]">
                    {lessons[lessons.length - 1]}
                    {newPage && ` ${family.name} are on the word wall!`}
                  </p>
                  <button ref={goRef} type="button" onClick={next} className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-4 [@media(max-height:500px)]:text-base')}>
                    {done + 1 < JOBS_PER_ROUND ? 'Next word' : 'All forged!'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="wf-step" className={cn(pixelHeadClass, 'self-start text-[24px] leading-none [@media(max-height:500px)]:sr-only [@media(max-width:559px)_and_(max-height:640px)]:sr-only')}>
                  Forge a word
                </h2>
                {/* What Dot asks for, in sight by the anvil. */}
                <p id="wf-do" className="rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[16px] font-bold leading-snug text-[#1b0f22] shadow-[0_3px_0_#1b0f22] [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[14px] [@media(max-width:559px)_and_(max-height:640px)]:py-1 [@media(max-width:559px)_and_(max-height:640px)]:text-[14px]">
                  {/* On a short screen, on one line (bench: at 568 × 320 the bar covered the tray). */}
                  <span className="text-[12px] font-bold uppercase tracking-wide text-[#a3195b] [@media(max-height:500px)]:mr-1.5">A word that means</span>
                  <br className="[@media(max-height:500px)]:hidden" />“{job.word.meaning}”
                </p>
                <div className="flex flex-col gap-2.5 [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-center [@media(max-height:500px)]:gap-2 [@media(max-width:559px)_and_(max-height:640px)]:flex-row [@media(max-width:559px)_and_(max-height:640px)]:items-center [@media(max-width:559px)_and_(max-height:640px)]:gap-2">
                  {/* What Dot said of the last hammer, by the anvil too: on a phone her bubble's below the fold. Room for the
                      longest, so nothing under it moves; not read out — her bubble is. */}
                  <p className="flex min-h-[4.5rem] items-center rounded-md bg-[#24215a] px-2.5 text-[15px] font-bold leading-snug [@media(max-height:500px)]:min-h-[2.75rem] [@media(max-height:500px)]:flex-1 [@media(max-height:500px)]:py-1 [@media(max-height:500px)]:text-[13px] [@media(max-width:559px)_and_(max-height:640px)]:min-h-[3.25rem] [@media(max-width:559px)_and_(max-height:640px)]:flex-1 [@media(max-width:559px)_and_(max-height:640px)]:py-1 [@media(max-width:559px)_and_(max-height:640px)]:text-[13px]">
                    {said ? (
                      <span className="[@media(max-height:500px)]:line-clamp-3 [@media(max-width:559px)_and_(max-height:640px)]:line-clamp-4">{said}</span>
                    ) : (
                      // Till Dot's said something: what to do now (an empty box looked like a field to fill).
                      <span className="font-normal text-[#e4e1ff]">{left === 2 ? 'Tap two parts in the tray, in order.' : left ? 'And the second part?' : 'Both on the anvil — hammer them!'}</span>
                    )}
                  </p>
                  <button
                    ref={goRef}
                    type="button"
                    onClick={hammer}
                    aria-disabled={left > 0 || undefined}
                    aria-describedby="wf-do"
                    className={cn(goldClass, 'min-h-12 text-lg leading-tight [@media(max-height:500px)]:flex-none [@media(max-height:500px)]:px-3 [@media(max-height:500px)]:text-[15px] [@media(max-width:559px)_and_(max-height:640px)]:flex-none [@media(max-width:559px)_and_(max-height:640px)]:px-3 [@media(max-width:559px)_and_(max-height:640px)]:text-[15px]')}
                  >
                    🔨 Hammer!
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <aside
          aria-label={`The job and the ${def.collection}`}
          className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 [overflow-anchor:none] split:col-start-2 split:row-span-2 split:row-start-1 split:overflow-y-auto split:border-l-4 split:p-4"
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          <div className="[@media(max-height:500px)]:hidden">
            <Ticket heading={family.name.toUpperCase()} ready={step === 'done'} icon={<FamilyTile id={job.family} size={48} />} id="wf-job">
              {jobWords(job)}
            </Ticket>
          </div>
          <WordWall known={known} read={read} onRead={(id) => settled() && setRead(id)} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 split:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={STEP_CHIPS} current={chipAt} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

/** A part's tile: its letters (an add-on with its hyphen); on Tricky, what it means under them; just floated back, a shake. */
function PartButton({ part, band, splash, onTap }: { part: string; band: Band; splash: boolean; onTap: () => void }) {
  const means = band === 'tricky' ? PART_MEANS[part] : undefined;
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${partText(part, band)}${means ? `, meaning “${means}”` : ''}`}
      className={cn(
        'flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-md border-[3px] border-[#1b0f22] bg-[#fdba74] px-1 py-1 text-center text-[#1b0f22] shadow-[2px_2px_0_#1b0f22] hover:bg-[#fed7aa] [@media(max-height:500px)]:min-h-[48px] [@media(max-height:500px)]:py-0.5',
        splash && 'cg-shake',
        focusRing,
      )}
    >
      <span className="text-[19px] font-black leading-tight [@media(max-height:500px)]:text-[16px]">{partText(part, band)}</span>
      {means && <span className="rounded bg-[#1b0f22] px-1 text-[11px] font-bold leading-tight text-amber-200">“{means}”</span>}
    </button>
  );
}

/**
 * The anvil: two places for parts, in order — a part on it tapped comes back
 * to the tray — and the word they make, glowing; once forged, the word.
 */
function Anvil({ anvil, band, forming, done, onTap }: { anvil: readonly (string | null)[]; band: Band; forming: string; done: boolean; onTap: (k: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg bg-[#3b2a52] px-2 py-2 [@media(max-height:500px)]:gap-1 [@media(max-height:500px)]:py-1">
      <ol aria-label="The anvil" aria-describedby="wf-do" className="flex w-full max-w-[420px] items-center justify-center gap-2">
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
              aria-disabled={done || undefined}
              aria-label={`${k === 0 ? 'First' : 'Second'} part${p ? `: ${partText(p, band)}` : ', empty'}`}
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
        {forming}
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

/** Dot's word wall: a page per family forged; tapped, read out — by Dot, and under the wall. */
function WordWall({ known, read, onRead }: { known: (id: FamilyId) => boolean; read: FamilyId | null; onRead: (id: FamilyId) => void }) {
  const count = FAMILIES.filter((f) => known(f.id)).length;
  const reading = read ? FAMILY_BY_ID[read] : null;
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
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
        {FAMILIES.map((f) => (
          <li key={f.id}>
            {known(f.id) ? (
              <button
                type="button"
                onClick={() => onRead(f.id)}
                aria-pressed={read === f.id}
                aria-label={`${f.name}. Read the page`}
                className={cn('flex h-[76px] w-full flex-col items-center justify-center gap-1 rounded border-[3px] bg-[#fff6dc] px-1 hover:bg-white', read === f.id ? 'border-amber-400' : 'border-[#1b0f22]', focusRing)}
              >
                <FamilyTile id={f.id} size={36} />
                <span aria-hidden="true" className="line-clamp-2 w-full break-words text-center text-[12px] font-bold leading-tight text-[#1b0f22]">
                  {f.name}
                </span>
              </button>
            ) : (
              <span role="img" aria-label="A word family not forged yet" className="flex h-[76px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                🔨 ?
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* The page read (Dot's bubble says it too, and is the live region). */}
      {reading && (
        <div ref={panel} className="rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <b>{reading.name}</b> — {reading.note} <i>{reading.words.map((x) => x.word).join(', ')}.</i>
        </div>
      )}
    </section>
  );
}
