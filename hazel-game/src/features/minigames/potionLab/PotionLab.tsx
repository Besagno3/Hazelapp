import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  CABBAGE,
  JARS,
  JAR_BY_ID,
  SHADES,
  aPotion,
  fillsOrder,
  guessOptions,
  guessKey,
  guessVerdict,
  guessPrompt,
  guessWords,
  guessedRight,
  jarsFor,
  orderFor,
  orderNudge,
  orderWords,
  pageLine,
  phWords,
  shadeOf,
  stepsOut,
  timesWords,
  whyLine,
  type Jar,
  type JarId,
  type Shade,
} from '../../../lib/minigames/potionLab';
import { BANDS, BAND_LABEL, pageFlag, type PlayBand } from '../../../content/minigames';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { useSettled } from '../useSettled';

/** Plain glass: Expert's order bottle, and a Brew Book page that waits — a colour would give the pH away (PR 11 UX review round 1). */
const GLASS = '#dfe7ee';

/** How long the stir takes before the colour shows (none with reduced motion). */
export const STIR_MS = 900;

type Step = 'pick' | 'guess' | 'stirring' | 'brewed';

interface Brewed {
  jar: Jar;
  /** What the kid guessed (an option's id). */
  guess: string;
  shade: Shade;
  right: boolean;
  fills: boolean;
  newPage: boolean;
}

const EMPTY_FLAGS: Record<string, boolean> = {};

/** The counter's screens by how many jars (`tailwind.config.js`), and what each shows or hides there: literal, for Tailwind. */
const JARS_AT = {
  6: { block: 'jars-6:block', hidden: 'jars-6:hidden', inline: 'jars-6:inline', none: 'jars-6:order-none' },
  9: { block: 'jars-9:block', hidden: 'jars-9:hidden', inline: 'jars-9:inline', none: 'jars-9:order-none' },
  12: { block: 'jars-12:block', hidden: 'jars-12:hidden', inline: 'jars-12:inline', none: 'jars-12:order-none' },
} as const;

/**
 * 🧪 Potion Lab (docs/DESIGN-MINIGAMES.md §5.1), in Trader Tadpole's shop: the
 * real red-cabbage experiment. An order wants a potion of one colour; the kid
 * pours one jar into fresh purple cabbage juice, guesses what will happen
 * (Gentle the colour, Medium acid / base / neutral, Tricky where it lands on a
 * five-colour strip, Expert its pH as a number — the order said in tens from
 * pure water's 7), stirs, and sees. Each jar's first brew is a Brew Book
 * page; the right colour (or pH) fills the order and finishes the round. No
 * timer; a wrong guess is explained, never punished. Rules:
 * `lib/minigames/potionLab.ts`.
 */
export default function PotionLab({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const order = useMemo(() => orderFor(band, round), [band, round]);
  const counter = useMemo(() => jarsFor(band), [band]);
  const [step, setStep] = useState<Step>('pick');
  const [jarId, setJarId] = useState<JarId | null>(null);
  const [guess, setGuess] = useState<string | null>(null);
  const [brewed, setBrewed] = useState<Brewed | null>(null);
  // A Brew Book page being read (Tadpole says it, and it shows under the book) — until the next brew or jar.
  const [read, setRead] = useState<JarId | null>(null);
  // Wrong guesses this round, so Tadpole doesn't say the same thing every time.
  const [misses, setMisses] = useState(0);
  // On Expert, the round's guesses spot on, of how many (the seal: all of them — §8.3).
  const [tally, setTally] = useState({ right: 0, of: 0 });
  // The jars brewed this round: on Expert a Brew Book page gives a jar's pH only once it's been brewed (PR 11 review round
  // 1: read before the guess, it was the answer, and the seal one tap away).
  const [brewedNow, setBrewedNow] = useState<readonly JarId[]>([]);
  const jar = jarId ? JAR_BY_ID[jarId] : null;
  const known = (id: JarId) => !!flags[pageFlag(def.id, id)];

  // Focus follows the round, from the start: the jars (the counter's label
  // where the counter shows, else the step card's heading, each described by
  // the order — a reader hears the goal before the jars, review round 2), the
  // guess, then what happened, then back to the jars.
  const guessHead = useRef<HTMLHeadingElement>(null);
  const resultHead = useRef<HTMLHeadingElement>(null);
  const counterHead = useRef<HTMLHeadingElement>(null);
  const pickHead = useRef<HTMLHeadingElement>(null);
  const guessGroup = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const counter = counterHead.current;
    const to =
      step === 'guess' ? guessHead.current : step === 'brewed' ? resultHead.current : step === 'pick' ? (counter && counter.getClientRects().length > 0 ? counter : pickHead.current) : null;
    // Opening, the scene stays in view; after that, where focus goes comes into view.
    to?.focus({ preventScroll: first.current });
    // The guesses, as the step starts, clear of the sticky Stir (the scroll padding): at 320 × 568 and 740 × 360 they started
    // under it, and a tap on one pressed Stir (PR 11 bench, review round 1). Never as a guess is tapped.
    if (step === 'guess') guessGroup.current?.scrollIntoView?.({ block: 'nearest' });
    first.current = false;
  }, [step]);

  // What happened comes with its gold button in view — Give it / Try another — on a phone it starts below the fold. Stir is
  // kept at the foot of the panel as the kid guesses (sticky), so nothing scrolls as a guess is tapped (PR 11 UX review
  // round 1: Expert's fifteen pH buttons moved up to 214 px under the finger, and a changed mind picked the wrong one).
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (step === 'brewed') goRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [step, still]);

  // The stir: the colour shows when it's done. Leaving the stir (another jar,
  // Back) stops it, so an old stir never lands on a new jar (review round 1).
  const timer = useRef<number | null>(null);
  function stopStir() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => stopStir, []);

  // A step's buttons wait a moment as it starts (§2.4), so a double tap's second tap doesn't press what's come under the
  // finger: a jar's second tap picked a guess, Stir's (no stir with reduced motion) gave the potion or wiped the result
  // with "Try another jar" (UX review round 2). Stir itself needs a guess first.
  const settled = useSettled(step);
  // A press to act on: a key's at once (no click count — a quick keyboard kid isn't held back, PR 12 UX review round 2),
  // a tap's once the step's settled.
  const ready = (e: { detail: number }) => e.detail === 0 || settled();

  function pick(id: JarId, e: { detail: number }) {
    if (!ready(e)) return;
    sfx('select');
    setJarId(id);
    setGuess(null);
    setBrewed(null);
    setRead(null);
    setStep('guess');
  }

  function brew() {
    if (!jar || !guess || step !== 'guess') return;
    sfx('spell');
    setRead(null);
    const shade = shadeOf(jar, band);
    const result: Brewed = {
      jar,
      guess,
      shade,
      right: guessedRight(guess, jar, band),
      fills: fillsOrder(jar, band, order),
      newPage: false,
    };
    const show = () => {
      timer.current = null;
      result.newPage = onPage(jar.id, jar.name);
      // A page read during the stir gives way to what happened (review round 2).
      setRead(null);
      if (!result.right) setMisses((n) => n + 1);
      setTally((t) => ({ right: t.right + (result.right ? 1 : 0), of: t.of + 1 }));
      setBrewedNow((b) => (b.includes(jar.id) ? b : [...b, jar.id]));
      setBrewed(result);
      setStep('brewed');
      if (result.fills) sfx('chest');
      else if (result.right) sfx('correct');
    };
    if (still) show();
    else {
      setStep('stirring');
      timer.current = window.setTimeout(show, STIR_MS);
    }
  }

  function another(e: { detail: number }) {
    if (step === 'stirring' || !ready(e)) return; // the stir finishes first
    stopStir();
    setRead(null);
    setJarId(null);
    setGuess(null);
    setBrewed(null);
    setStep('pick');
  }

  function deliver(e: { detail: number }) {
    if (!brewed?.fills || !ready(e)) return;
    setRead(null);
    onFinish({
      title: `${order.potion} brewed!`,
      learned: whyLine(brewed.jar, band),
      swatch: SHADES[brewed.shade].hex,
      spotOn: band === 'expert' ? tally : undefined,
    });
  }

  const expert = band === 'expert';
  // On Expert the order's bottle is plain glass: its colour would give its place on the strip (PR 11 UX review round 1).
  const bottle = expert ? GLASS : SHADES[order.shade].hex;
  const liquid: Shade = step === 'brewed' && brewed ? brewed.shade : CABBAGE;
  const options = guessOptions(band);
  const key = guessKey(band);
  const stepIndex = step === 'pick' ? 0 : step === 'guess' ? 1 : step === 'stirring' ? 2 : 3;
  // While Stir is sticky at the foot of the panel, the panel's scroll padding keeps what's focused or scrolled to clear of it.
  const guessing = step === 'guess' || step === 'stirring';

  const readJar = read ? JAR_BY_ID[read] : null;
  // On Expert a page waits till its jar's been brewed this round: its colour, its kind and two of its facts gave the pH
  // away (code review rounds 1 and 2: tomato's "about pH 4" filled the first order).
  const held = (j: Jar) => expert && !brewedNow.includes(j.id);
  const pageOf = (j: Jar) => (held(j) ? `${j.name}: brew it this round to read its page.` : pageLine(j, band));
  let line: string;
  if (readJar) line = pageOf(readJar);
  else if (step === 'pick')
    // Plainer on Expert (§8.3): the order, the question.
    line = expert ? `${order.customer} needs ${aPotion(order)} that ${orderWords(order)}. Which jar?` : `${order.customer} wants ${aPotion(order)} that ${orderWords(order)}. Pour in ONE jar — which one will do it?`;
  else if (step === 'guess' && jar) line = guessLine(jar, band);
  else if (step === 'stirring') line = 'Stir, stir, stir…';
  else if (brewed && expert) {
    // How far, and which way, in tens — and the jar's pH, so a reader hears it (PR 11 UX review round 1).
    line = guessVerdict(brewed.guess, brewed.jar);
    // Which way to look next, in the order's words (UX review round 2: "try another jar" said nothing of which).
    const nudge = orderNudge(order, brewed.jar);
    line += brewed.fills ? ` That’s what ${order.customer} needs.` : ` Not what ${order.customer} needs — try ${nudge ? `a ${nudge} jar` : 'another jar'}.`;
  } else if (brewed) {
    line = brewed.right ? 'Ribbit-tastic! You guessed it before you saw it. That’s real science!' : WRONG_LINES[(misses - 1 + WRONG_LINES.length) % WRONG_LINES.length];
    line += brewed.fills ? ` And that’s just what ${order.customer} ordered!` : ` Not ${order.customer}’s ${order.potion} yet — try another jar!`;
  } else line = '';

  // A jar already in the Brew Book says so — not its kind, which is Medium's
  // very question (review round 2); the book has the rest.
  const jarButtons = (compact: boolean) =>
    counter.map((j) => (
      <JarButton
        key={j.id}
        jar={j}
        compact={compact}
        artSize={compact ? 38 : counter.length >= 9 ? 44 : 52}
        on={jarId === j.id && step !== 'pick'}
        inBook={known(j.id)}
        onPick={(e) => pick(j.id, e)}
        disabled={step === 'stirring'}
      />
    ));
  // Where the counter shows: where its jars fit under the scene (the `jars-*` screens, by how many — PR 11 review round 1);
  // elsewhere they're in the step card, first in the side panel.
  const at = JARS_AT[counter.length >= 12 ? 12 : counter.length >= 9 ? 9 : 6];
  // The counter in one row where it fits, else two even ones (review round 2: a lone twelfth jar squeezed the scene).
  const counterCols = counter.length >= 12 ? 'grid-cols-6 xl:grid-cols-12' : counter.length >= 9 ? 'grid-cols-5 [@media(min-width:924px)]:grid-cols-9' : 'grid-cols-3 [@media(min-width:780px)]:grid-cols-6';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden', guessing && 'scroll-pb-24')}>
      <div className="grid flex-none grid-cols-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_300px] sm:grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* The scene gives way to the counter: at 150 px at least, it covered the counter's first row of jars at 640 × 505 and
            700 × 540 (Expert's bench, PR 11). */}
        <section aria-label="Tadpole’s potion lab" className="relative h-[150px] overflow-hidden [@media(max-width:639px)_and_(max-height:500px)]:h-[96px] sm:col-start-1 sm:row-start-1 sm:h-auto sm:min-h-[80px]">
          <LabScene liquid={liquid} splash={step === 'guess' && jar ? jar.fill : null} stirring={step === 'stirring'} brewed={step === 'brewed' ? brewed : null} still={still} />
        </section>

        {/* The counter's jars (from `sm` up, if the screen's tall enough — over 620 px: under that its two rows of twelve ran
            under the scene at 640 × 505, Expert's bench, PR 11; else they're in the step card). */}
        <div role="group" aria-labelledby="pl-counter" aria-describedby="pl-order" className={cn('hidden border-t-4 border-[#1b0f22] bg-[#6f4127] px-2.5 pb-2.5 pt-1.5 sm:col-start-1 sm:row-start-2', at.block)}>
          <h2 id="pl-counter" ref={counterHead} tabIndex={-1} aria-describedby="pl-order" className={cn(pixelHeadClass, 'mb-1.5 inline-block rounded text-lg text-[#fde68a]', 'focus:outline-none')}>
            Jars on the counter
          </h2>
          <div className={cn('grid gap-2', counterCols)}>{jarButtons(false)}</div>
        </div>

        <aside
          aria-label={`The job and the ${def.collection}`}
          className={cn('flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:overflow-y-auto sm:border-l-4 sm:p-4', guessing && 'scroll-pb-24')}
        >
          <HostBubble npcId={def.host} line={line} phoneStrip />
          {/* On a phone the ticket follows the step card (Tadpole's line says the order too), so the jars come up sooner. */}
          <div className="order-1 sm:order-none">
            <Ticket heading={`ORDER FOR ${order.customer.toUpperCase()}`} ready={!!brewed?.fills} icon={<Bottle hex={bottle} />} id="pl-order">
              {/* The key read after the order with a space, not run into it ("…water.7 is neutral"). */}
              One {order.potion} that <b>{orderWords(order)}</b>.{key && ' '}
              {key && <span className="mt-1 block text-[14px] text-[#5b3a1a]">{key}</span>}
            </Ticket>
          </div>

          {/* The step card. On a short screen (a phone on its side) it comes first, so the jars and the gold button are in view —
              and on a side panel up to 620 px high, where it holds the jars too. */}
          <div className={cn(windowClass, 'flex flex-col gap-3 p-3.5 [@media(max-height:500px)]:order-first sm:order-first', at.none)}>
            {step === 'pick' && (
              <>
                <h2 ref={pickHead} tabIndex={-1} aria-describedby="pl-order" className={cn(pixelHeadClass, 'self-start rounded text-[26px]', 'focus:outline-none')}>
                  Step 1 · Pick a jar
                </h2>
                {/* The goal, where the kid is looking on a phone or a short screen (the ticket is further down there: review round 2). */}
                <p aria-hidden="true" className={cn('flex items-center gap-2 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[15px] leading-snug text-[#1b0f22]', at.hidden)}>
                  <span className="flex-none [&>svg]:h-8 [&>svg]:w-6">
                    <Bottle hex={bottle} />
                  </span>
                  <span>
                    For {order.customer}: {aPotion(order)} that <b>{orderWords(order)}</b>
                  </span>
                </p>
                <p className="text-[15px] leading-snug text-[#e4e1ff]">
                  <span className={at.hidden}>Tap a jar below.</span>
                  {/* The rest where there's room: on a phone the order above says what matters. */}
                  <span className={cn('hidden', at.inline)}>Tap a jar on the counter. It pours straight into fresh purple cabbage juice.</span>
                </p>
                {/* A phone's jars (or a short screen's): here, where the kid is looking. */}
                <div role="group" aria-label="Jars" className={cn('grid grid-cols-3 gap-2', at.hidden)}>
                  {jarButtons(true)}
                </div>
              </>
            )}

            {(step === 'guess' || step === 'stirring') && jar && (
              <>
                <h2 ref={guessHead} tabIndex={-1} className={cn(pixelHeadClass, 'self-start rounded text-[26px]', 'focus:outline-none')}>
                  Step 2 · Make a guess
                </h2>
                <p className="text-[15px] leading-snug text-[#e4e1ff]">
                  <b className="text-white">{jar.name}</b> is in. {guessPrompt(band)}
                </p>
                {/* Tricky's five colours in one row only where they fit with their pH words; Expert's fifteen pH numbers in
                    rows of five — four in the 300 px side panel, where five were 40 px wide (bench). */}
                <div ref={guessGroup} role="group" aria-label="Your guess" className={cn('grid gap-2', expert ? 'grid-cols-5 sm:grid-cols-4 lg:grid-cols-5' : options.length === 5 ? 'grid-cols-3 lg:grid-cols-5' : 'grid-cols-3')}>
                  {options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={guess === o.id}
                      aria-disabled={step === 'stirring' || undefined}
                      onClick={(e) => {
                        if (step !== 'guess' || !ready(e)) return;
                        sfx('select');
                        setGuess(o.id);
                      }}
                      aria-label={expert ? `pH ${o.label}` : undefined}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-lg border-[3px] px-1 text-center text-sm font-bold leading-tight',
                        expert ? 'min-h-12 font-pixel text-2xl' : options.length === 5 ? 'min-h-[76px]' : 'min-h-[84px]',
                        guess === o.id ? 'border-amber-300 bg-[#3d3a8a]' : 'border-[#5a55a8] bg-[#24215a] hover:bg-[#2f2b70]',
                        focusRing,
                      )}
                    >
                      {expert ? null : o.hex ? (
                        <span aria-hidden="true" className="h-9 w-9 rounded-full border-[3px] border-[#1b0f22] shadow-[inset_-5px_-5px_0_rgba(0,0,0,0.2)]" style={{ background: o.hex }} />
                      ) : (
                        <span aria-hidden="true" className="font-pixel text-3xl leading-none text-amber-200">
                          {o.label[0]}
                        </span>
                      )}
                      {o.label}
                      {o.sub && <span className="whitespace-nowrap text-[13px] font-semibold text-[#d8d5f5]">{o.sub}</span>}
                    </button>
                  ))}
                </div>
                {/* The key here where the ticket's out of sight; under the ticket, once (PR 11 UX review round 1: twice). */}
                {key && <p className={cn('text-[14px] font-semibold text-[#d8d5f5]', at.hidden)}>{key}</p>}
                {/* Stir kept at the foot of the panel while a guess is made: nothing scrolls under the finger (PR 11 UX review
                    round 1). Only Stir, and a scroll padding of its height and the panel's padding (`scroll-pb-24`; 80 px left
                    the last row's foot under it, round 2), so focus and the step's start keep a guess clear of it — with "Pick
                    a different jar" in it too it was 120 px and covered them (review round 1 bench). */}
                <div className="sticky bottom-0 z-10 -mx-3.5 bg-[#2a2766] px-3.5 py-2">
                  <button
                    type="button"
                    aria-disabled={!guess || step === 'stirring' || undefined}
                    onClick={brew}
                    className={cn(goldClass, 'h-14 w-full text-lg')}
                  >
                    {step === 'stirring' ? 'Stirring…' : guess ? 'Stir and brew!' : 'Make a guess first'}
                  </button>
                </div>
                <button
                  type="button"
                  aria-disabled={step === 'stirring' || undefined}
                  onClick={another}
                  className={cn(outlineClass, 'min-h-11 border-2 text-sm aria-disabled:opacity-60', at.hidden)}
                >
                  Pick a different jar
                </button>
              </>
            )}

            {step === 'brewed' && brewed && (
              <>
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="h-14 w-14 flex-none rounded-full border-4 border-[#1b0f22] shadow-[inset_-7px_-7px_0_rgba(0,0,0,0.2)]" style={{ background: SHADES[brewed.shade].hex }} />
                  <div className="min-w-0">
                    <h2 ref={resultHead} tabIndex={-1} className={cn(pixelHeadClass, 'rounded text-[28px] text-white', 'focus:outline-none')}>
                      {brewed.shade === CABBAGE ? 'It stayed purple!' : `It turned ${SHADES[brewed.shade].label.toLowerCase()}!`}
                    </h2>
                    <p className="mt-1 text-[15px] leading-snug text-[#e4e1ff]">{whyLine(brewed.jar, band)}</p>
                  </div>
                </div>
                <p className={cn('rounded-lg px-3 py-2 text-[15px] font-bold text-[#1b0f22]', brewed.right ? 'bg-amber-300' : 'bg-[#d4d0f5]')}>
                  {/* The guess named beside what happened, so the two can be compared (review round 2). */}
                  {expert
                    ? brewed.right
                      ? `You said ${guessWords(brewed.guess, band)} — spot on.`
                      : // How far in tens too, where Tadpole's bubble is out of sight (UX review round 2: 1280 × 505, 844 × 390).
                        `You said ${guessWords(brewed.guess, band)}; it’s about ${phWords(brewed.jar)} — ${stepsOut(brewed.guess, brewed.jar)} step${stepsOut(brewed.guess, brewed.jar) > 1 ? 's' : ''} out: ${timesWords(stepsOut(brewed.guess, brewed.jar))} off.`
                    : brewed.right
                      ? `You guessed ${guessWords(brewed.guess, band)} — right!`
                      : `You guessed ${guessWords(brewed.guess, band)}. Now you know!`}
                  {brewed.newPage && ' New Brew Book page!'}
                </p>
                {/* Stacked in a narrow column; side by side where there's room. */}
                <div className="flex flex-col gap-2 lg:flex-row">
                  {brewed.fills && (
                    <button ref={goRef} type="button" onClick={deliver} className={cn(goldClass, 'flex-1 text-lg')}>
                      Give it to {order.customer}
                    </button>
                  )}
                  <button ref={brewed.fills ? undefined : goRef} type="button" onClick={another} className={cn(brewed.fills ? outlineClass : goldClass, 'flex-1')}>
                    Try another jar
                  </button>
                </div>
              </>
            )}
          </div>

          <BrewBook band={band} known={known} read={read} onRead={(j) => setRead(j.id)} pageOf={pageOf} held={held} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 sm:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={['Pick', 'Guess', 'Brew']} current={stepIndex} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

/** Tadpole after a wrong guess, in turn. */
const WRONG_LINES = [
  'Ha! That surprised me too, the first time. A wrong guess is how scientists learn.',
  'Ooh, not what you thought! Now you know something new about that jar.',
  'Ribbit — a surprise! Scientists love those. Every one teaches you something.',
];

function guessLine(jar: Jar, band: PlayBand): string {
  const name = jar.name.toLowerCase();
  if (band === 'expert') return `${jar.name}. What’s its pH? Guess, then stir.`;
  if (band === 'medium') return `Ooh, ${name}! Is it an acid, a base, or neutral? Guess first, then stir.`;
  if (band === 'tricky') return `Ooh, ${name}! Where on the colour strip will it land? Guess first, then stir.`;
  return `Ooh, ${name}! Scientists always guess first. What colour do YOU think it will turn?`;
}

/** A jar on the counter: its picture, its name, and (once brewed) what kind it is. */
function JarButton({
  jar,
  on,
  inBook,
  onPick,
  disabled,
  compact,
  artSize,
}: {
  jar: Jar;
  on: boolean;
  inBook: boolean;
  onPick: (e: { detail: number }) => void;
  disabled: boolean;
  compact: boolean;
  artSize: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onPick}
      className={cn(
        // A container, so the chip's word shows only where the jar is wide enough for it.
        'flex min-w-0 flex-col items-center justify-end gap-1 rounded-lg border-4 px-1 text-white [container-type:inline-size]',
        compact ? 'pb-1.5 pt-1' : 'pb-2 pt-1.5',
        on ? 'border-amber-300 bg-[#8a5634]' : 'border-[#1b0f22] bg-[#55301b] hover:bg-[#663b22]',
        focusRing,
      )}
    >
      <JarArt jar={jar} size={artSize} />
      <span className={cn('text-center font-bold leading-tight', compact ? 'text-[13px]' : 'text-sm')}>{jar.name}</span>
      {/* In the Brew Book already — on the counter kept the same height before, so the row doesn't jump. */}
      {(inBook || !compact) && (
        <span
          aria-hidden={inBook ? undefined : true}
          className={cn('flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[13px] font-bold', inBook ? 'bg-[#f4e9ff] text-[#1b0f22]' : 'invisible')}
        >
          {inBook ? (
            <>
              <span aria-hidden="true">📖</span>
              <span className="sr-only">in your Brew Book</span>
              {/* The word only where the jar has room for it — 📖 alone where it's narrower (code review rounds 1 and 2: the
                  83 px chip spilled under the jars beside it, 47–73 px wide, from 640 to 1280 px). */}
              <span aria-hidden="true" className="hidden [@container(min-width:84px)]:inline">
                In book
              </span>
            </>
          ) : (
            '·'
          )}
        </span>
      )}
    </button>
  );
}

/** A glass jar with its contents drawn on it. */
function JarArt({ jar, size }: { jar: Jar; size: number }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 80 104" aria-hidden="true">
      <rect x="27" y="3" width="26" height="15" rx="3" fill="#a8743f" stroke="#1b0f22" strokeWidth="3" />
      <rect x="22" y="16" width="36" height="11" rx="2" fill="#d6eefc" stroke="#1b0f22" strokeWidth="3" />
      <rect x="8" y="25" width="64" height="76" rx="15" fill="#e6f5ff" stroke="#1b0f22" strokeWidth="3" />
      <path d="M11 50 H69 V84 Q69 98 55 98 H25 Q11 98 11 84 Z" fill={jar.fill} />
      {jar.look === 'bubbles' && (
        <g fill="#ffffff" stroke="#3f8fd6" strokeWidth="2">
          <circle cx="22" cy="58" r="5" />
          <circle cx="58" cy="90" r="4" />
          <circle cx="44" cy="40" r="4" />
        </g>
      )}
      {jar.look === 'powder' && (
        <g fill="#b9b2a2">
          <rect x="18" y="86" width="3" height="3" />
          <rect x="30" y="90" width="3" height="3" />
          <rect x="58" y="86" width="3" height="3" />
          <rect x="46" y="92" width="3" height="3" />
          <rect x="62" y="56" width="3" height="3" />
          <rect x="16" y="54" width="3" height="3" />
        </g>
      )}
      {jar.look === 'crystals' && (
        <g fill="#ffffff" stroke="#8fb3cc" strokeWidth="1.5">
          <rect x="15" y="84" width="7" height="7" />
          <rect x="57" y="86" width="7" height="7" />
          <rect x="60" y="54" width="6" height="6" />
          <rect x="15" y="54" width="6" height="6" />
        </g>
      )}
      {jar.look === 'pulp' && (
        <g fill="#ffffff" opacity="0.55">
          <circle cx="20" cy="88" r="3" />
          <circle cx="60" cy="58" r="3" />
          <circle cx="56" cy="90" r="2.5" />
        </g>
      )}
      <rect x="15" y="31" width="6" height="40" rx="3" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}

/** A little potion bottle in the order's colour. */
function Bottle({ hex }: { hex: string }) {
  return (
    <svg width="34" height="44" viewBox="0 0 44 56" aria-hidden="true">
      <path d="M16 12 H28 V22 L40 46 Q42 54 34 54 H10 Q2 54 4 46 L16 22 Z" fill={hex} stroke="#1b0f22" strokeWidth="3" strokeLinejoin="round" />
      <rect x="13" y="3" width="18" height="11" rx="2" fill="#a8743f" stroke="#1b0f22" strokeWidth="3" />
      <rect x="12" y="30" width="5" height="14" rx="2" fill="#ffffff" opacity="0.8" />
    </svg>
  );
}

/**
 * The Brew Book: a page per jar. A found page shows the jar and its name, over
 * the colour it turns the juice at this band; tapped, it's read out — by
 * Tadpole, and under the book, where a phone can see it (review round 2: his
 * bubble had scrolled away). A page not found yet is a "?"; one whose jar is
 * only on a harder band is locked, and a line under the book says where those are.
 */
function BrewBook({
  band,
  known,
  read,
  onRead,
  pageOf,
  held,
}: {
  band: PlayBand;
  known: (id: JarId) => boolean;
  read: JarId | null;
  onRead: (j: Jar) => void;
  pageOf: (j: Jar) => string;
  /** A page that waits (Expert, till its jar's brewed this round): no colour on it, said or drawn. */
  held: (j: Jar) => boolean;
}) {
  const onCounter = new Set(jarsFor(band).map((j) => j.id));
  const count = JARS.filter((j) => known(j.id)).length;
  const elsewhere = JARS.filter((j) => !onCounter.has(j.id) && !known(j.id));
  const bands = BANDS.filter((b) => elsewhere.some((j) => j.from === b)).map((b) => BAND_LABEL[b]);
  const reading = read ? JAR_BY_ID[read] : null;
  // The page read comes into view under the book (on a phone the page tapped is near the foot of the screen).
  const panel = useRef<HTMLParagraphElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="pl-book" className="order-2 mt-auto flex flex-col gap-2 sm:order-none">
      <div className="flex items-baseline justify-between">
        <h2 id="pl-book" className={cn(pixelHeadClass, 'text-2xl')}>
          Brew Book
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {JARS.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-1.5 lg:grid-cols-6">
        {JARS.map((j) => {
          const found = known(j.id);
          const shade = SHADES[shadeOf(j, band)];
          const waits = held(j);
          return (
            <li key={j.id}>
              {found ? (
                <button
                  type="button"
                  onClick={() => onRead(j)}
                  aria-pressed={read === j.id}
                  aria-label={waits ? `${j.name}. Read the page` : `${j.name}: turns it ${shade.label.toLowerCase()}. Read the page`}
                  className={cn(
                    'flex h-[64px] w-full flex-col items-center justify-end overflow-hidden rounded border-[3px] bg-[#fff6dc] hover:bg-white',
                    read === j.id ? 'border-amber-400' : 'border-[#1b0f22]',
                    focusRing,
                  )}
                >
                  <JarArt jar={j} size={20} />
                  <span aria-hidden="true" className="w-full truncate px-0.5 text-center text-[11px] font-bold leading-tight text-[#1b0f22] lg:text-[10px]">
                    {j.short}
                  </span>
                  <span aria-hidden="true" className="mt-0.5 h-2 w-full flex-none border-t-2 border-[#1b0f22]" style={{ background: waits ? GLASS : shade.hex }} />
                </button>
              ) : (
                <span
                  role="img"
                  aria-label={onCounter.has(j.id) ? 'A page not found yet' : `A page for ${BAND_LABEL[j.from]}`}
                  className="flex h-[64px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]"
                >
                  {onCounter.has(j.id) ? '?' : '🔒'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {/* The page read (Tadpole's bubble says it too, and is the live region — this one isn't, so it's heard once). */}
      {reading && (
        <p ref={panel} className="flex items-start gap-2 rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <span aria-hidden="true" className="h-4 w-4 flex-none translate-y-0.5 rounded-full border-2 border-[#1b0f22]" style={{ background: held(reading) ? GLASS : SHADES[shadeOf(reading, band)].hex }} />
          <span>{pageOf(reading)}</span>
        </p>
      )}
      {elsewhere.length > 0 && (
        <p className="text-[14px] text-[#c9c5f2]">
          <span aria-hidden="true">🔒 </span>
          {elsewhere.length} more page{elsewhere.length > 1 ? 's' : ''} on {bands.join(' and ')}.
        </p>
      )}
    </section>
  );
}

/**
 * The lab, close up (§2.2): Tadpole's back wall with its round window onto
 * Verdara, the sign and his shelves, and the cauldron on its fire with Ember
 * breathing on the flames. The juice is `liquid`; a jar just poured in makes a
 * ring of `splash`; a brew shows its colour's name over the pot.
 */
function LabScene({
  liquid,
  splash,
  stirring,
  brewed,
  still,
}: {
  liquid: Shade;
  splash: string | null;
  stirring: boolean;
  brewed: Brewed | null;
  still: boolean;
}) {
  const shade = SHADES[liquid];
  const anim = !still;
  return (
    <svg viewBox="0 0 900 470" preserveAspectRatio="xMidYMax slice" role="img" aria-label={brewed ? `The cauldron glows ${shade.label.toLowerCase()}` : 'The cauldron bubbles with purple cabbage juice'} className="absolute inset-0 h-full w-full">
      <defs>
        <pattern id="pl-planks" width="61" height="470" patternUnits="userSpaceOnUse">
          <rect width="61" height="470" fill="#26503f" />
          <rect x="58" width="3" height="470" fill="#1f4434" />
        </pattern>
        <clipPath id="pl-window">
          <circle cx="144" cy="154" r="88" />
        </clipPath>
      </defs>
      <rect width="900" height="470" fill="url(#pl-planks)" />
      <rect width="900" height="26" fill="#6b4229" />
      <rect y="22" width="900" height="4" fill="#1b0f22" />

      {/* The round window onto Verdara. */}
      <g>
        <image href="/backgrounds/verdara.png" x="40" y="54" width="208" height="200" preserveAspectRatio="xMidYMid slice" clipPath="url(#pl-window)" style={{ imageRendering: 'pixelated' }} />
        <circle cx="144" cy="154" r="94" fill="none" stroke="#8a5a3b" strokeWidth="14" />
        <circle cx="144" cy="154" r="102" fill="none" stroke="#1b0f22" strokeWidth="4" />
        <circle cx="144" cy="154" r="87" fill="none" stroke="#1b0f22" strokeWidth="3" />
        <rect x="136" y="62" width="16" height="184" fill="#8a5a3b" stroke="#1b0f22" strokeWidth="3" />
        <rect x="52" y="146" width="184" height="16" fill="#8a5a3b" stroke="#1b0f22" strokeWidth="3" />
      </g>

      {/* A hanging vine. */}
      <g>
        <path d="M280 22 C288 52 270 82 282 112 C290 134 276 152 280 178" fill="none" stroke="#2f7a3e" strokeWidth="5" strokeLinecap="round" />
        {[
          'M280 50 C266 44 262 56 266 62 C274 62 280 56 280 50 Z',
          'M278 78 C292 70 298 82 294 88 C286 90 280 84 278 78 Z',
          'M283 108 C268 104 264 116 268 121 C276 122 282 116 283 108 Z',
          'M280 138 C294 132 298 144 294 149 C286 150 281 144 280 138 Z',
        ].map((d) => (
          <path key={d} d={d} fill="#3ccf6e" stroke="#1b0f22" strokeWidth="2.5" />
        ))}
      </g>

      {/* The shop's sign. */}
      <g>
        <rect x="344" y="26" width="3" height="32" fill="#1b0f22" />
        <rect x="554" y="26" width="3" height="32" fill="#1b0f22" />
        <rect x="318" y="56" width="264" height="58" rx="6" fill="#8a5a3b" stroke="#1b0f22" strokeWidth="4" />
        <rect x="322" y="100" width="256" height="10" fill="#6b4229" />
        <text x="450" y="96" textAnchor="middle" fontFamily="'Jersey 15', 'Arial Narrow', sans-serif" fontSize="34" fill="#fde68a" stroke="#1b0f22" strokeWidth="1.5" paintOrder="stroke">
          TADPOLE’S TONICS
        </text>
      </g>

      {/* Shelves of bottles and a purple cabbage. */}
      <g>
        <g transform="translate(620 96)">
          <rect x="30" y="18" width="16" height="28" fill="#d6eefc" stroke="#1b0f22" strokeWidth="3" />
          <rect x="27" y="10" width="22" height="10" rx="2" fill="#a8743f" stroke="#1b0f22" strokeWidth="3" />
          <circle cx="38" cy="70" r="28" fill="#d6eefc" />
          <path d="M11 72 A27 27 0 0 0 65 72 Z" fill="#3ccf6e" />
          <circle cx="38" cy="70" r="28" fill="none" stroke="#1b0f22" strokeWidth="3" />
          <rect x="86" y="10" width="14" height="22" fill="#d6eefc" stroke="#1b0f22" strokeWidth="3" />
          <rect x="76" y="30" width="34" height="68" rx="6" fill="#4f8fe0" stroke="#1b0f22" strokeWidth="3" />
          <rect x="82" y="52" width="22" height="18" fill="#fff6dc" stroke="#1b0f22" strokeWidth="2" />
          <rect x="128" y="44" width="52" height="54" rx="8" fill="#e6f5ff" stroke="#1b0f22" strokeWidth="3" />
          <rect x="126" y="36" width="56" height="12" rx="3" fill="#a8743f" stroke="#1b0f22" strokeWidth="3" />
          <path d="M134 74 Q146 56 158 74 Z" fill="#e8483f" stroke="#1b0f22" strokeWidth="2.5" />
          <path d="M154 80 Q164 66 174 80 Z" fill="#fcd34d" stroke="#1b0f22" strokeWidth="2.5" />
          <path d="M210 40 L222 40 L222 54 L236 90 Q238 98 230 98 L202 98 Q194 98 196 90 L210 54 Z" fill="#ff8ac0" stroke="#1b0f22" strokeWidth="3" strokeLinejoin="round" />
          <rect x="207" y="30" width="18" height="12" rx="2" fill="#a8743f" stroke="#1b0f22" strokeWidth="3" />
        </g>
        <rect x="606" y="194" width="286" height="18" fill="#a8743f" stroke="#1b0f22" strokeWidth="4" />
        <g transform="translate(620 236)">
          <rect x="14" y="26" width="20" height="72" fill="#e8483f" stroke="#1b0f22" strokeWidth="3" />
          <rect x="34" y="16" width="18" height="82" fill="#4f8fe0" stroke="#1b0f22" strokeWidth="3" />
          <rect x="52" y="34" width="22" height="64" fill="#fcd34d" stroke="#1b0f22" strokeWidth="3" />
          <circle cx="160" cy="70" r="28" fill="#7b3fa0" stroke="#1b0f22" strokeWidth="3" />
          <path d="M136 62 C146 48 160 50 160 70 M184 62 C174 48 160 50 160 70 M144 86 C152 78 168 78 176 86" fill="none" stroke="#b37ad6" strokeWidth="4" strokeLinecap="round" />
          <rect x="204" y="52" width="40" height="46" rx="10" fill="#e6f5ff" stroke="#1b0f22" strokeWidth="3" />
          <path d="M207 72 H241 V86 Q241 95 232 95 H216 Q207 95 207 86 Z" fill="#8e44c9" />
          <rect x="214" y="42" width="20" height="12" rx="2" fill="#a8743f" stroke="#1b0f22" strokeWidth="3" />
        </g>
        <rect x="606" y="334" width="286" height="18" fill="#a8743f" stroke="#1b0f22" strokeWidth="4" />
      </g>

      {/* A potted plant. */}
      <g transform="translate(36 324)">
        <path d="M55 96 C30 70 10 70 6 52 C26 50 44 62 55 90 Z" fill="#3ccf6e" stroke="#1b0f22" strokeWidth="3" />
        <path d="M55 96 C78 66 100 64 104 46 C84 44 64 58 55 90 Z" fill="#2fa35a" stroke="#1b0f22" strokeWidth="3" />
        <path d="M55 96 C46 60 50 26 60 6 C72 30 66 66 55 96 Z" fill="#3ccf6e" stroke="#1b0f22" strokeWidth="3" />
        <path d="M24 94 H86 L80 144 H30 Z" fill="#c4643a" stroke="#1b0f22" strokeWidth="3" />
        <rect x="20" y="90" width="70" height="14" rx="3" fill="#d97a4a" stroke="#1b0f22" strokeWidth="3" />
      </g>

      {/* The cauldron on its fire. */}
      <g transform="translate(290 188)">
        {brewed && (
          <g>
            <path className={anim ? 'animate-pulse' : undefined} d="M118 62 C106 48 130 38 118 22" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
            <path className={anim ? 'animate-pulse [animation-delay:500ms]' : undefined} d="M200 60 C188 46 212 36 200 20" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
          </g>
        )}
        <rect x="106" y="264" width="108" height="12" rx="5" fill="#8a5a3b" stroke="#1b0f22" strokeWidth="3" />
        <path d="M160 270 C130 270 122 246 138 228 C140 242 148 244 150 236 C148 222 156 210 166 202 C164 218 176 224 180 236 C184 230 186 224 184 218 C198 232 196 270 160 270 Z" fill="#ec7424" stroke="#1b0f22" strokeWidth="4" strokeLinejoin="round" />
        <path d="M160 264 C146 264 142 250 150 240 C152 248 158 248 158 242 C158 234 164 228 168 224 C168 236 176 242 176 250 C176 258 170 264 160 264 Z" fill="#fcd34d" />
        <path d="M86 210 L70 260 L98 260 L110 218 Z" fill="#2a2440" stroke="#1b0f22" strokeWidth="4" strokeLinejoin="round" />
        <path d="M234 210 L250 260 L222 260 L210 218 Z" fill="#2a2440" stroke="#1b0f22" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="22" cy="108" r="14" fill="none" stroke="#1b0f22" strokeWidth="7" />
        <circle cx="298" cy="108" r="14" fill="none" stroke="#1b0f22" strokeWidth="7" />
        <path d="M28 98 C28 176 68 226 124 234 L196 234 C252 226 292 176 292 98 Z" fill="#3a3355" stroke="#1b0f22" strokeWidth="5" strokeLinejoin="round" />
        <path d="M262 114 C262 168 238 206 200 222 C236 216 276 176 278 114 Z" fill="#2a2440" />
        <path d="M58 126 C62 162 78 190 104 208" fill="none" stroke="#6a5f94" strokeWidth="9" strokeLinecap="round" />
        <path d="M36 150 C92 172 228 172 284 150" fill="none" stroke="#1b0f22" strokeWidth="4" />
        <ellipse cx="160" cy="98" rx="140" ry="32" fill="#4a4270" stroke="#1b0f22" strokeWidth="5" />
        <ellipse cx="160" cy="100" rx="122" ry="24" fill="#1b0f22" />
        <ellipse cx="160" cy="102" rx="118" ry="21" fill={shade.hex} style={{ transition: still ? undefined : 'fill 600ms ease' }} />
        <ellipse cx="138" cy="97" rx="66" ry="8" fill={shade.hi} opacity="0.85" />
        {splash && (
          <g>
            <ellipse cx="198" cy="104" rx="32" ry="9" fill="none" stroke={splash === '#ffffff' || splash === '#fbfbf7' ? '#ffffff' : splash} strokeWidth="5" />
            <circle cx="174" cy="86" r="5" fill={splash} stroke="#1b0f22" strokeWidth="2" />
            <circle cx="222" cy="82" r="4" fill={splash} stroke="#1b0f22" strokeWidth="2" />
          </g>
        )}
        <g className={anim ? (stirring ? 'animate-bounce' : 'animate-pulse') : undefined}>
          <circle cx="110" cy="96" r="7" fill={shade.hi} stroke="#1b0f22" strokeWidth="2" />
          <circle cx="196" cy="94" r="8" fill={shade.hi} stroke="#1b0f22" strokeWidth="2" />
          <circle cx="232" cy="102" r="5" fill={shade.hi} stroke="#1b0f22" strokeWidth="2" />
        </g>
        {stirring && <path d="M150 30 L210 104" stroke="#a8743f" strokeWidth="10" strokeLinecap="round" />}
      </g>

      {/* Ember, breathing on the fire. */}
      <foreignObject x="190" y="350" width="128" height="128">
        <div className="flex h-full w-full items-end justify-center">
          <EmberSprite anim={brewed ? 'cheer' : 'breath'} scale={4} />
        </div>
      </foreignObject>

      {/* What colour it turned, over the pot. */}
      {brewed && (
        <g>
          <rect x="350" y="198" width="200" height="56" rx="28" fill={shade.hex} stroke="#1b0f22" strokeWidth="4" />
          <text x="450" y="238" textAnchor="middle" fontFamily="'Jersey 15', 'Arial Narrow', sans-serif" fontSize="38" fill={shade.ink}>
            {shade.label.toUpperCase()}!
          </text>
        </g>
      )}

      <rect y="462" width="900" height="8" fill="#c48a52" />
      <rect y="460" width="900" height="3" fill="#1b0f22" />
    </svg>
  );
}
