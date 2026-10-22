import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  CUTS,
  ORDERS_PER_ROUND,
  REGULARS,
  REGULAR_BY_ID,
  SLICE,
  amountWords,
  boxWords,
  check,
  cutHint,
  learnedLine,
  orderFor,
  piesFor,
  simplify,
  verdictWords,
  type Order,
  type RegularId,
  type Verdict,
} from '../../../lib/minigames/bakery';
import { BAND_LABEL, pageFlag } from '../../../content/minigames';
import { NPC_DEFS, npcEmoji, npcSpriteId } from '../../../content/npcs';
import { CharacterPortrait } from '../../../components/CharacterPortrait';
import { sfx } from '../../../lib/audio';
import { cn } from '../../../lib/utils';
import { useSaveStore } from '../../../store/saveStore';
import { EmberSprite, HostBubble, StepChips, Ticket } from '../parts';
import { focusRing, goldClass, outlineClass, pixelHeadClass, windowClass } from '../styles';
import type { PlayProps } from '../types';
import { PieArt } from './art';

type Step = 'cut' | 'fill' | 'closed';

const EMPTY_FLAGS: Record<string, boolean> = {};

/** A cut's name on its button: "Halves", "Thirds"… */
const cutName = (cut: number) => SLICE[cut].many.charAt(0).toUpperCase() + SLICE[cut].many.slice(1);

/** Dot after a right box, in turn. */
const RIGHT_LINES = ['Perfect — fair and square!', 'Just what they ordered. You’ve got a baker’s eye!', 'Spot on! The regulars will be back tomorrow.'];

/**
 * 🥧 Dot's Bakery (docs/DESIGN-MINIGAMES.md §5.2), in Baker Dot's shop: three
 * regulars order part of a pie each morning. The kid cuts the pies into equal
 * slices, taps slices into the box (or uses − / +) and closes it. Any cut that
 * makes the amount is right; a box that's off is said back in words and can be
 * fixed. Each regular served right the first time is a page of the Regulars'
 * Book. No timer. Rules: `lib/minigames/bakery.ts`.
 */
export default function DotsBakery({ def, band, round, onPage, onFinish }: PlayProps) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const still = useReducedMotion() ?? false;
  const [served, setServed] = useState(0);
  const order = useMemo(() => orderFor(band, round, served), [band, round, served]);
  const regular = REGULAR_BY_ID[order.regular];
  const pies = piesFor(order.amount);
  const [step, setStep] = useState<Step>('cut');
  const [cut, setCut] = useState<number | null>(null);
  // Which slices are in the box: pie by pie, slice by slice.
  const [taken, setTaken] = useState<boolean[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [lessons, setLessons] = useState<string[]>([]);
  const [newPage, setNewPage] = useState(false);
  const [read, setRead] = useState<RegularId | null>(null);
  const [rights, setRights] = useState(0);
  const count = taken.filter(Boolean).length;
  const known = (id: RegularId) => !!flags[pageFlag(def.id, id)];

  // Focus follows the order, from the start: the cut (described by the order),
  // the box, what happened.
  const cutHead = useRef<HTMLHeadingElement>(null);
  const fillHead = useRef<HTMLHeadingElement>(null);
  const resultHead = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const to = step === 'cut' ? cutHead.current : step === 'fill' ? fillHead.current : resultHead.current;
    to?.focus({ preventScroll: first.current });
    first.current = false;
  }, [step, served]);

  // The step's gold button comes into view once it can be pressed.
  const goRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if ((step === 'fill' && count > 0) || step === 'closed') goRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [step, count > 0, still]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickCut(c: number) {
    sfx('select');
    setCut(c);
    setTaken(Array(c * pies).fill(false));
    setVerdict(null);
    setRead(null);
    setStep('fill');
  }

  function toggle(i: number) {
    if (step !== 'fill') return;
    sfx('select');
    setTaken((t) => t.map((on, k) => (k === i ? !on : on)));
  }

  /** − / +: take the last slice out, or put the next one in. */
  function more() {
    if (step !== 'fill') return;
    const i = taken.indexOf(false);
    if (i >= 0) toggle(i);
  }
  function less() {
    if (step !== 'fill') return;
    const i = taken.lastIndexOf(true);
    if (i >= 0) toggle(i);
  }

  function close() {
    if (step !== 'fill' || cut === null || count === 0) return;
    setRead(null);
    const v = check(count, cut, order);
    setVerdict(v);
    if (v === 'right') {
      sfx('chest');
      setNewPage(onPage(order.regular, regular.name));
      setLessons((l) => [...l, learnedLine(count, cut, order)]);
      setRights((n) => n + 1);
    } else sfx('wrong');
    setStep('closed');
  }

  /** Back to the box as it was, to fix it. */
  function fix() {
    setVerdict(null);
    setStep('fill');
  }

  function recut() {
    setCut(null);
    setTaken([]);
    setVerdict(null);
    setStep('cut');
  }

  function serve() {
    if (verdict !== 'right') return;
    setRead(null);
    if (served + 1 >= ORDERS_PER_ROUND) {
      // An "is the same as" lesson is the one worth keeping, if the morning had one.
      const learned = lessons.find((l) => l.includes('the same as')) ?? lessons[lessons.length - 1] ?? '';
      onFinish({ title: 'Morning served!', learned });
      return;
    }
    setServed((n) => n + 1);
    setCut(null);
    setTaken([]);
    setVerdict(null);
    setNewPage(false);
    setStep('cut');
  }

  const hint = cut !== null && step === 'fill' ? cutHint(cut, order) : null;
  const stepIndex = step === 'cut' ? 0 : step === 'fill' ? 1 : 2;
  const who = regular.name;

  let line: string;
  const readRegular = read ? REGULAR_BY_ID[read] : null;
  if (readRegular) line = `${readRegular.name} — ${readRegular.pie}. ${readRegular.note}`;
  else if (step === 'cut') line = `${who} wants ${order.words}. How many equal slices should each pie be cut into?`;
  else if (step === 'fill') line = hint ?? `Now tap slices into the box: ${who} wants ${order.words}.`;
  else if (verdict === 'right') line = `${RIGHT_LINES[(rights - 1 + RIGHT_LINES.length) % RIGHT_LINES.length]} ${served + 1 < ORDERS_PER_ROUND ? 'Hand it over, then the next customer!' : 'That’s the last order of the morning!'}`;
  else line = 'Ooh, close! Have another look — you can change the slices, or cut it another way.';

  const board = (compact: boolean) => (
    <PieBoard pies={pies} cut={cut ?? 1} taken={taken} filling={regular.filling} onSlice={step === 'fill' ? toggle : undefined} compact={compact} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto sm:overflow-hidden">
      <div className="grid flex-none grid-cols-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[minmax(0,1fr)_300px] sm:grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Dot’s bakery" className="relative h-[150px] overflow-hidden sm:col-start-1 sm:row-start-1 sm:h-auto sm:min-h-[150px]">
          <BakeryScene customer={order.regular} closed={step === 'closed'} right={verdict === 'right'} />
        </section>

        {/* The pies on the board (from `sm` up, if the screen's tall enough; else they're in the step card). */}
        <div role="group" aria-labelledby="bk-board" aria-describedby="bk-order" className="hidden border-t-4 border-[#1b0f22] bg-[#6f4127] px-3 pb-3 pt-1.5 sm:col-start-1 sm:row-start-2 sm:[@media(min-height:501px)]:block">
          <h2 id="bk-board" className={cn(pixelHeadClass, 'mb-1.5 text-lg text-[#fde68a]')}>
            The pies on the board
          </h2>
          {board(false)}
        </div>

        <aside className="flex flex-col gap-3 border-[#1b0f22] bg-[#1e1b4b] p-3 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:overflow-y-auto sm:border-l-4 sm:p-4">
          <HostBubble npcId={def.host} line={line} phoneStrip />
          {/* On a phone the ticket follows the step card (Dot's line says the order too), so the pies come up sooner. */}
          <div className="order-1 sm:order-none">
            <Ticket heading={`ORDER FOR ${who.toUpperCase()}`} ready={verdict === 'right'} icon={<AmountIcon order={order} />} id="bk-order">
              {orderSentence(order)}
            </Ticket>
          </div>

          <div className={cn(windowClass, 'flex flex-col gap-3 p-3.5 [@media(max-height:500px)]:order-first')}>
            <p className="text-[13px] font-bold uppercase tracking-wide text-[#c9c5f2]">
              Order {served + 1} of {ORDERS_PER_ROUND}
            </p>

            {step === 'cut' && (
              <>
                <h2 ref={cutHead} tabIndex={-1} aria-describedby="bk-order" className={cn(pixelHeadClass, 'self-start rounded text-[26px]', focusRing)}>
                  Step 1 · Cut the pie
                </h2>
                <OrderLine order={order} />
                {/* Dot's bubble asks it just above on a phone; here where there's room. */}
                <p className="hidden text-[15px] leading-snug text-[#e4e1ff] sm:[@media(min-height:501px)]:block">How many equal slices should each pie be cut into?</p>
                <div role="group" aria-label="Cuts" className="grid grid-cols-2 gap-2">
                  {CUTS[band].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => pickCut(c)}
                      className={cn('flex min-h-[64px] items-center gap-2 rounded-lg border-[3px] border-[#5a55a8] bg-[#24215a] px-2 text-left font-bold hover:bg-[#2f2b70]', focusRing)}
                    >
                      <span className="flex-none">
                        <PieArt cut={c} size={40} filling={regular.filling} />
                      </span>
                      <span className="min-w-0 leading-tight">
                        {cutName(c)}
                        <span className="block text-[13px] font-semibold text-[#c9c5f2]">{c} slices</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 'fill' && cut !== null && (
              <>
                <h2 ref={fillHead} tabIndex={-1} aria-describedby="bk-order" className={cn(pixelHeadClass, 'self-start rounded text-[26px]', focusRing)}>
                  Step 2 · Fill the box
                </h2>
                <OrderLine order={order} />
                {/* The pies, where the kid is looking on a phone or a short screen. */}
                <div className="sm:[@media(min-height:501px)]:hidden">{board(true)}</div>
                <p className="text-[15px] leading-snug text-[#e4e1ff]">
                  Each pie is cut into {cut} {SLICE[cut].many}. Tap slices to put them in the box — or use − and +.
                </p>
                {hint && <p className="rounded-md bg-[#fde68a] px-2.5 py-1.5 text-[15px] font-bold text-[#1b0f22]">{hint}</p>}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={less} aria-disabled={count === 0 || undefined} aria-label="Take a slice out" className={cn(outlineClass, 'min-w-11 px-0 text-2xl aria-disabled:opacity-50')}>
                    −
                  </button>
                  <p role="status" className="min-w-0 flex-1 text-center text-[16px] font-bold leading-tight">
                    <span className="block text-[13px] font-semibold uppercase tracking-wide text-[#c9c5f2]">In the box</span>
                    {boxWords(count, cut)}
                  </p>
                  <button type="button" onClick={more} aria-disabled={count === taken.length || undefined} aria-label="Put a slice in" className={cn(outlineClass, 'min-w-11 px-0 text-2xl aria-disabled:opacity-50')}>
                    +
                  </button>
                </div>
                <button ref={goRef} type="button" onClick={close} aria-disabled={count === 0 || undefined} className={cn(goldClass, 'h-14 text-lg')}>
                  {count === 0 ? 'Put a slice in first' : 'Close the box'}
                </button>
                <button type="button" onClick={recut} className={cn(outlineClass, 'min-h-11 border-2 text-sm')}>
                  Cut it another way
                </button>
              </>
            )}

            {step === 'closed' && cut !== null && verdict && (
              <>
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex flex-none gap-1">
                    {Array.from({ length: pies }, (_, p) => (
                      <PieArt key={p} cut={cut} taken={taken.slice(p * cut, (p + 1) * cut)} filling={regular.filling} size={pies > 1 ? 44 : 56} />
                    ))}
                  </span>
                  <div className="min-w-0">
                    <h2 ref={resultHead} tabIndex={-1} className={cn(pixelHeadClass, 'rounded text-[28px] text-white', focusRing)}>
                      {verdict === 'right' ? 'Just right!' : verdict === 'too-little' ? 'Not quite enough' : 'A bit too much'}
                    </h2>
                    <p className="mt-1 text-[15px] leading-snug text-[#e4e1ff]">{boxWords(count, cut)}</p>
                  </div>
                </div>
                <p className={cn('rounded-lg px-3 py-2 text-[15px] font-bold text-[#1b0f22]', verdict === 'right' ? 'bg-amber-300' : 'bg-[#d4d0f5]')}>
                  {verdict === 'right' ? learnedLine(count, cut, order) : verdictWords(count, cut, order)}
                  {verdict === 'right' && newPage && ` ${regular.name}’s page is in your book!`}
                </p>
                {verdict === 'right' ? (
                  <button ref={goRef} type="button" onClick={serve} className={cn(goldClass, 'text-lg')}>
                    {served + 1 < ORDERS_PER_ROUND ? `Hand it to ${who}` : `Hand it to ${who} — the last one!`}
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 lg:flex-row">
                    <button ref={goRef} type="button" onClick={fix} className={cn(goldClass, 'flex-1')}>
                      Fix the box
                    </button>
                    <button type="button" onClick={recut} className={cn(outlineClass, 'flex-1')}>
                      Cut it another way
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <RegularsBook known={known} read={read} onRead={(id) => setRead(id)} />
        </aside>
      </div>

      <footer className="hidden flex-none flex-wrap items-center gap-3 border-t-4 border-[#1b0f22] bg-[#1e1b4b] px-5 py-2 sm:flex [@media(max-height:500px)]:hidden">
        <StepChips steps={['Cut', 'Fill', 'Close']} current={stepIndex} />
        <span className="ml-auto text-[15px] text-[#c9c5f2]">
          {BAND_LABEL[band]} · No timer. Take your time.
        </span>
      </footer>
    </div>
  );
}

/** The order as a sentence, for its ticket (and what the board and steps are described by). */
function orderSentence(order: Order): string {
  if (order.with) return `${capFirst(amountWords(order.with.mine))}, and ${amountWords(order.with.amount)} for ${REGULAR_BY_ID[order.with.regular].name} — both in one box.`;
  return `${capFirst(order.words)}.`;
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The order, in the step card on a phone or a short screen (the ticket is further down there). */
function OrderLine({ order }: { order: Order }) {
  return (
    <p aria-hidden="true" className="flex items-center gap-2 rounded-md bg-[#fff6dc] px-2.5 py-1.5 text-[15px] leading-snug text-[#1b0f22] sm:[@media(min-height:501px)]:hidden">
      <span className="flex-none">
        <AmountIcon order={order} />
      </span>
      <span>
        For {REGULAR_BY_ID[order.regular].name}: <b>{order.words}</b>
      </span>
    </p>
  );
}

/** The amount ordered, drawn: a pie cut by its own denominator with that many slices lifted (two pies for more than one). */
function AmountIcon({ order }: { order: Order }) {
  const { n, d } = simplify(order.amount);
  const whole = Math.floor(n / d);
  const rest = n % d;
  const filling = REGULAR_BY_ID[order.regular].filling;
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: whole }, (_, k) => (
        <PieArt key={k} cut={1} taken={[true]} filling={filling} size={30} />
      ))}
      {rest > 0 && <PieArt cut={d} taken={Array.from({ length: d }, (_, k) => k < rest)} filling={filling} size={30} />}
    </span>
  );
}

/** The pies on the board, cut and taken; a tap on a slice moves it in or out of the box. */
function PieBoard({
  pies,
  cut,
  taken,
  filling,
  onSlice,
  compact,
}: {
  pies: number;
  cut: number;
  taken: readonly boolean[];
  filling: string;
  onSlice?: (i: number) => void;
  compact: boolean;
}) {
  // On the counter, small enough to leave the scene its sign and oven; in a phone's step card, as big as fits.
  const size = compact ? (pies > 1 ? 128 : 150) : pies > 1 ? 128 : 150;
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      {Array.from({ length: pies }, (_, p) => (
        <PieArt
          key={p}
          cut={cut}
          taken={taken.slice(p * cut, (p + 1) * cut)}
          filling={filling}
          size={size}
          onSlice={onSlice ? (i) => onSlice(p * cut + i) : undefined}
        />
      ))}
    </div>
  );
}

/**
 * The Regulars' Book: a page per regular served right. A found page shows them
 * and their pie; tapped, it's read out — by Dot, and under the book.
 */
function RegularsBook({ known, read, onRead }: { known: (id: RegularId) => boolean; read: RegularId | null; onRead: (id: RegularId) => void }) {
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  const count = REGULARS.filter((r) => known(r.id)).length;
  const reading = read ? REGULAR_BY_ID[read] : null;
  const panel = useRef<HTMLParagraphElement>(null);
  const still = useReducedMotion() ?? false;
  useEffect(() => {
    if (read) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [read, still]);
  return (
    <section aria-labelledby="bk-book" className="order-2 mt-auto flex flex-col gap-2 sm:order-none">
      <div className="flex items-baseline justify-between">
        <h2 id="bk-book" className={cn(pixelHeadClass, 'text-2xl')}>
          Regulars’ Book
        </h2>
        <span className="text-sm text-[#c9c5f2]">
          {count} of {REGULARS.length} pages
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-1.5">
        {REGULARS.map((r) => {
          const npc = NPC_DEFS[r.npc];
          return (
            <li key={r.id}>
              {known(r.id) ? (
                <button
                  type="button"
                  onClick={() => onRead(r.id)}
                  aria-pressed={read === r.id}
                  aria-label={`${r.name}: ${r.pie}. Read the page`}
                  className={cn(
                    'flex h-[72px] w-full flex-col items-center justify-end overflow-hidden rounded border-[3px] bg-[#fff6dc] hover:bg-white',
                    read === r.id ? 'border-amber-400' : 'border-[#1b0f22]',
                    focusRing,
                  )}
                >
                  {npc && <CharacterPortrait spriteId={npcSpriteId(npc, flags)} emoji={npcEmoji(npc, flags)} scale={1.25} className="text-2xl" />}
                  <span aria-hidden="true" className="w-full truncate px-0.5 text-center text-[11px] font-bold leading-tight text-[#1b0f22]">
                    {r.name.split(' ').pop()}
                  </span>
                  <span aria-hidden="true" className="mt-0.5 h-2 w-full flex-none border-t-2 border-[#1b0f22]" style={{ background: r.filling }} />
                </button>
              ) : (
                <span role="img" aria-label="A regular not served yet" className="flex h-[72px] items-center justify-center rounded border-[3px] border-dashed border-[#6c67b8] text-base font-bold text-[#8f8ad0]">
                  ?
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {/* The page read (Dot's bubble says it too, and is the live region — this one isn't, so it's heard once). */}
      {reading && (
        <p ref={panel} className="flex items-start gap-2 rounded-md border-[3px] border-[#1b0f22] bg-[#fff6dc] px-2.5 py-2 text-[15px] leading-snug text-[#1b0f22]">
          <span aria-hidden="true" className="h-4 w-4 flex-none translate-y-0.5 rounded-full border-2 border-[#1b0f22]" style={{ background: reading.filling }} />
          <span>
            <b>{reading.name}</b> — {reading.pie}. {reading.note}
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * The bakery, close up (§2.2): Dot's back wall of shelves and loaves, the oven
 * glowing, the counter, today's customer waiting at it and Ember by the oven.
 * Drawn in an SVG; the customer and Ember stand over it as HTML (no
 * `foreignObject`, which Safari mis-renders).
 */
function BakeryScene({ customer, closed, right }: { customer: RegularId; closed: boolean; right: boolean }) {
  const r = REGULAR_BY_ID[customer];
  const npc = NPC_DEFS[r.npc];
  const flags = useSaveStore((s) => s.save?.flags ?? EMPTY_FLAGS);
  return (
    <>
      <svg viewBox="0 0 900 470" preserveAspectRatio="xMidYMax slice" role="img" aria-label={`Dot’s bakery: ${r.name} waits at the counter`} className="absolute inset-0 h-full w-full">
        <rect width="900" height="470" fill="#f0d9b5" />
        {/* Wallpaper stripes. */}
        {Array.from({ length: 15 }, (_, i) => (
          <rect key={i} x={i * 60} width="28" height="470" fill="#e8cda3" />
        ))}
        <rect width="900" height="26" fill="#8a5a3b" />
        <rect y="22" width="900" height="4" fill="#1b0f22" />
        {/* The sign. */}
        <g>
          <rect x="300" y="44" width="300" height="60" rx="8" fill="#8a5a3b" stroke="#1b0f22" strokeWidth="4" />
          <text x="450" y="86" textAnchor="middle" fontFamily="'Jersey 15', 'Arial Narrow', sans-serif" fontSize="36" fill="#fde68a" stroke="#1b0f22" strokeWidth="1.5" paintOrder="stroke">
            DOT’S BAKERY
          </text>
        </g>
        {/* Shelves of loaves and pies. */}
        {[150, 250].map((y) => (
          <g key={y}>
            <rect x="560" y={y} width="300" height="16" fill="#a8743f" stroke="#1b0f22" strokeWidth="4" />
            {[0, 1, 2, 3].map((k) => (
              <ellipse key={k} cx={600 + k * 70} cy={y - 18} rx="28" ry="18" fill={k % 2 ? '#d99a4e' : '#c9803c'} stroke="#1b0f22" strokeWidth="3" />
            ))}
          </g>
        ))}
        {/* The oven, glowing. */}
        <g>
          <path d="M40 150 Q40 110 130 110 Q220 110 220 150 V330 H40 Z" fill="#b5654a" stroke="#1b0f22" strokeWidth="5" />
          <path d="M80 220 Q80 180 130 180 Q180 180 180 220 V300 H80 Z" fill="#2a1a1a" stroke="#1b0f22" strokeWidth="4" />
          <path d="M100 300 C100 270 120 262 118 246 C130 256 128 270 136 276 C142 266 140 256 146 250 C160 270 162 300 150 300 Z" fill="#ec7424" />
          <path d="M112 300 C112 286 124 282 124 272 C132 280 134 292 140 300 Z" fill="#fcd34d" />
        </g>
        {/* The counter. */}
        <rect x="0" y="380" width="900" height="90" fill="#a8743f" stroke="#1b0f22" strokeWidth="5" />
        <rect x="0" y="372" width="900" height="16" fill="#c48a52" stroke="#1b0f22" strokeWidth="4" />
        {/* The box on the counter: open while the order's being filled, tied once it's closed right. */}
        <g transform="translate(380 300)">
          <path d="M0 40 H140 V84 H0 Z" fill="#f4e3c3" stroke="#1b0f22" strokeWidth="4" />
          {closed && right ? (
            <>
              <path d="M0 26 H140 V44 H0 Z" fill="#fff6dc" stroke="#1b0f22" strokeWidth="4" />
              <path d="M62 26 V84 M78 26 V84" stroke="#e8483f" strokeWidth="6" />
            </>
          ) : (
            <path d="M0 40 L20 8 H120 L140 40" fill="#fff6dc" stroke="#1b0f22" strokeWidth="4" strokeLinejoin="round" />
          )}
        </g>
      </svg>
      {/* Today's customer, at the counter; Ember by the oven. */}
      <span aria-hidden="true" className="absolute bottom-[14%] right-[6%] flex items-end">
        {npc && <CharacterPortrait spriteId={npcSpriteId(npc, flags)} emoji={npcEmoji(npc, flags)} scale={3} className="text-5xl" />}
      </span>
      <span aria-hidden="true" className="absolute bottom-[8%] left-[24%]">
        <EmberSprite anim={right ? 'cheer' : undefined} scale={3} />
      </span>
    </>
  );
}
