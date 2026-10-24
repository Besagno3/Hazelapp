import type { Band } from '../../content/minigames';

/**
 * 🥧 Dot's Bakery (docs/DESIGN-MINIGAMES.md §5.2): fractions with pie. A regular
 * orders part of a pie (or more than one); the kid cuts the pies into equal
 * slices, puts slices in the box and closes it. Any cut that makes the amount
 * is right — two quarters is a half. A wrong box is said back, never scolded,
 * and can be fixed. Three orders make a morning (a round); each regular served
 * right is a page of the collection. Pure: the amounts, the
 * cuts, the orders, the check and the words.
 */

/** An amount of pie, as a fraction of one pie (it may be more than 1). */
export interface Amount {
  n: number;
  d: number;
}

const A = (n: number, d: number): Amount => ({ n, d });

/** How many equal slices each pie can be cut into, by band. */
export const CUTS: Record<Band, readonly number[]> = {
  gentle: [2, 4],
  medium: [2, 3, 4, 6, 8],
  tricky: [2, 3, 4, 6, 8],
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** In lowest terms. */
export function simplify(a: Amount): Amount {
  const g = gcd(a.n, a.d) || 1;
  return { n: a.n / g, d: a.d / g };
}

/** Below zero: `a` is less than `b`. */
export function compare(a: Amount, b: Amount): number {
  return a.n * b.d - b.n * a.d;
}

export function add(a: Amount, b: Amount): Amount {
  return simplify({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
}

/** How many pies are on the board for an amount: enough to hold it, at least one. */
export function piesFor(a: Amount): number {
  return Math.max(1, Math.ceil(a.n / a.d));
}

/** Can slices of this cut make the amount exactly? */
export function cutMakes(cut: number, a: Amount): boolean {
  return (a.n * cut) % a.d === 0;
}

/** A slice of each cut, one and many: half / halves, third / thirds… */
export const SLICE: Record<number, { one: string; many: string }> = {
  2: { one: 'half', many: 'halves' },
  3: { one: 'third', many: 'thirds' },
  4: { one: 'quarter', many: 'quarters' },
  6: { one: 'sixth', many: 'sixths' },
  8: { one: 'eighth', many: 'eighths' },
};

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
const num = (n: number) => NUMBER[n] ?? String(n);

/** "3 quarters", "1 half", "no slices" — what's in a box, by its own cut (never simplified). */
export function slicesWords(count: number, cut: number): string {
  if (count === 0) return 'no slices';
  const s = SLICE[cut];
  return `${num(count)} ${count === 1 ? s.one : s.many}`;
}

/** Part of one pie: "half", "a quarter", "three eighths". */
function partWords({ n, d }: Amount): string {
  if (d === 2) return 'half';
  const s = SLICE[d] ?? { one: `1/${d}`, many: `1/${d}s` };
  // "an eighth" (review round 2: "one and a eighth pies").
  return n === 1 ? `${/^[aeiou]/.test(s.one) ? 'an' : 'a'} ${s.one}` : `${num(n)} ${s.many}`;
}

/**
 * An amount in a kid's words: "half a pie", "a quarter of a pie", "three
 * quarters of a pie", "a whole pie", "one and a half pies", "two whole pies".
 */
export function amountWords(a: Amount): string {
  const { n, d } = simplify(a);
  const whole = Math.floor(n / d);
  const rest = n % d;
  if (rest === 0) return whole === 1 ? 'a whole pie' : `${num(whole)} whole pies`;
  const part = partWords({ n: rest, d });
  if (whole === 0) return part === 'half' ? 'half a pie' : `${part} of a pie`;
  return `${num(whole)} and ${part === 'half' ? 'a half' : part} pies`;
}

/** Tricky's way of saying an amount: "75% of a pie", "0.25 of a pie", "1.5 pies". */
export function numberWords(a: Amount, as: 'percent' | 'decimal'): string {
  const v = a.n / a.d;
  if (as === 'percent') return `${Math.round(v * 100)}% of a pie`;
  return `${Math.round(v * 1000) / 1000} ${v > 1 ? 'pies' : v === 1 ? 'pie' : 'of a pie'}`;
}

/** The regulars: eight townsfolk of Lumina Village, each with a favourite pie (the collection, §5.2). */
export const REGULAR_IDS = ['wick', 'sol', 'marigold', 'rook', 'nib', 'pip', 'bramble', 'poppy'] as const;
export type RegularId = (typeof REGULAR_IDS)[number];

export interface Regular {
  id: RegularId;
  /** Their NPC: the portrait and the name. */
  npc: string;
  /** What they're called on a ticket ("Grandmother Wick"). */
  name: string;
  pie: string;
  /** The pie's filling, for the art. */
  filling: string;
  /** Their page in the book: why it's their favourite. */
  note: string;
}

export const REGULARS: readonly Regular[] = [
  { id: 'wick', npc: 'village-elder', name: 'Grandmother Wick', pie: 'plum pie', filling: '#8e44c9', note: 'Plum pie, still warm. Grandmother Wick says it tastes like being small again.' },
  { id: 'sol', npc: 'village-keeper', name: 'Keeper Sol', pie: 'honey pie', filling: '#f2b233', note: 'Keeper Sol eats his honey pie by lantern light, very slowly.' },
  { id: 'marigold', npc: 'village-mayor', name: 'Mayor Marigold', pie: 'peach pie', filling: '#ff9b52', note: 'Mayor Marigold orders peach pie for every town meeting. The meetings are very popular.' },
  { id: 'rook', npc: 'village-guard', name: 'Guard Rook', pie: 'apple pie', filling: '#e3c25a', note: 'Guard Rook says apple pie is a guard’s pie: plain, strong and always on time.' },
  { id: 'nib', npc: 'village-kid', name: 'Nib', pie: 'cherry pie', filling: '#d8304a', note: 'Nib likes cherry pie because it turns his tongue red. He shows everyone.' },
  { id: 'pip', npc: 'hub-kid', name: 'Pip', pie: 'blueberry pie', filling: '#4c5fd0', note: 'Pip once ate a whole blueberry pie, and his fingers were blue for a week.' },
  { id: 'bramble', npc: 'village-friend', name: 'Bramble', pie: 'blackberry pie', filling: '#5a2a6a', note: 'Bramble picks the blackberries himself, from the hedges at the edge of town.' },
  { id: 'poppy', npc: 'hub-innkeeper', name: 'Innkeeper Poppy', pie: 'pumpkin pie', filling: '#e07a2c', note: 'Innkeeper Poppy saves pumpkin pie for sleepy travellers at the Sleepy Sheep Inn.' },
];

export const REGULAR_BY_ID = Object.fromEntries(REGULARS.map((r) => [r.id, r])) as Record<RegularId, Regular>;

/** One order: who, how much in all, and how it's asked for. On Tricky an order may be two people's, in one box. */
export interface Order {
  regular: RegularId;
  amount: Amount;
  /** How the order is asked for ("three quarters of a pie", "75% of a pie"). */
  words: string;
  /** Asked for as a number (Tricky's percentages and decimals). */
  asNumber?: boolean;
  /** A second customer's share, boxed with the first (Tricky). */
  with?: { regular: RegularId; amount: Amount; mine: Amount };
}

/** What each band orders, in turn. Every amount can be made with that band's cuts (tested). */
type Ask = { amount: Amount; say?: 'percent' | 'decimal' } | { mine: Amount; theirs: Amount };
const ASKS: Record<Band, readonly Ask[]> = {
  gentle: [{ amount: A(1, 2) }, { amount: A(1, 4) }, { amount: A(3, 4) }, { amount: A(1, 1) }, { amount: A(1, 2) }, { amount: A(3, 4) }, { amount: A(1, 4) }],
  medium: [{ amount: A(2, 3) }, { amount: A(1, 2) }, { amount: A(3, 8) }, { amount: A(3, 2) }, { amount: A(5, 6) }, { amount: A(1, 3) }, { amount: A(5, 4) }, { amount: A(5, 8) }],
  tricky: [
    { amount: A(3, 4), say: 'percent' },
    { mine: A(1, 2), theirs: A(1, 4) },
    { amount: A(1, 4), say: 'decimal' },
    { mine: A(1, 3), theirs: A(1, 6) },
    { amount: A(3, 2), say: 'decimal' },
    { mine: A(3, 4), theirs: A(1, 2) },
    { amount: A(1, 2), say: 'percent' },
    { mine: A(1, 4), theirs: A(3, 8) },
  ],
};

/** Orders in a morning (a round). */
export const ORDERS_PER_ROUND = 3;

/**
 * Who comes in, in a morning: regulars not in the book yet first, so every
 * morning can fill pages — the stage starts each visit at round 0, and a kid
 * who plays one morning a visit must still meet all eight (review round 1) —
 * then the rest, in turn from where the round would have them.
 */
export function morningQueue(known: (id: RegularId) => boolean, round: number): RegularId[] {
  const start = (round * ORDERS_PER_ROUND) % REGULAR_IDS.length;
  const turn = [...REGULAR_IDS.slice(start), ...REGULAR_IDS.slice(0, start)];
  return [...turn.filter((id) => !known(id)), ...turn.filter((id) => known(id))];
}

/**
 * The `i`th order of the kid's `round`th morning at a band: what's asked goes
 * by the slot; who asks is the morning's `queue` (`morningQueue`) or, without
 * one, the regulars in turn (three mornings meet all eight). A shared order's
 * second customer is someone else in the village.
 */
export function orderFor(band: Band, round: number, i: number, queue?: readonly RegularId[]): Order {
  const slot = round * ORDERS_PER_ROUND + i;
  const regular = queue?.[i] ?? REGULAR_IDS[slot % REGULAR_IDS.length];
  const ask = ASKS[band][slot % ASKS[band].length];
  if ('mine' in ask) {
    const other = REGULAR_IDS[(REGULAR_IDS.indexOf(regular) + 3) % REGULAR_IDS.length];
    return {
      regular,
      amount: add(ask.mine, ask.theirs),
      words: `${amountWords(ask.mine)}, and ${amountWords(ask.theirs)} for ${REGULAR_BY_ID[other].name} — in one box`,
      with: { regular: other, amount: ask.theirs, mine: ask.mine },
    };
  }
  return ask.say
    ? { regular, amount: ask.amount, words: numberWords(ask.amount, ask.say), asNumber: true }
    : { regular, amount: ask.amount, words: amountWords(ask.amount) };
}

/** What the box holds, against the order. */
export type Verdict = 'right' | 'too-little' | 'too-much';

export function check(count: number, cut: number, order: Order): Verdict {
  const c = compare(A(count, cut), order.amount);
  return c === 0 ? 'right' : c < 0 ? 'too-little' : 'too-much';
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * What's in the box, said back: "Three quarters of a pie.", and the amount too
 * when it's another way of saying it or more than one pie ("Two quarters —
 * that's half a pie.", "Five quarters — that's one and a quarter pies.").
 */
export function boxWords(count: number, cut: number): string {
  if (count === 0) return 'The box is empty.';
  const boxed = simplify(A(count, cut));
  const said = cap(slicesWords(count, cut));
  return boxed.d !== cut || count > cut ? `${said} — that’s ${amountWords(boxed)}.` : `${said} of a pie.`;
}

/**
 * The order as it was asked — never worked out for the kid: Tricky's numbers
 * stay numbers ("75% of a pie") and a shared order stays two shares ("half a
 * pie and a quarter of a pie"), so the conversion and the sum are theirs to
 * do (review round 1).
 */
export function askedWords(order: Order): string {
  if (order.with) return `${amountWords(order.with.mine)} and ${amountWords(order.with.amount)}`;
  return order.asNumber ? order.words : amountWords(order.amount);
}

/** After a box is closed: what happened, in a kid's words. */
export function verdictWords(count: number, cut: number, order: Order): string {
  const v = check(count, cut, order);
  if (v === 'right') return 'Just right!';
  return v === 'too-little' ? `A little more — the order is ${askedWords(order)}.` : `A little less — the order is ${askedWords(order)}.`;
}

/**
 * What a right box teaches, for the reward: two ways to say the same amount
 * ("Two quarters is the same as half a pie."), a number and its fraction
 * ("75% of a pie is three quarters of a pie."), two shares added, or slices
 * counted.
 */
export function learnedLine(count: number, cut: number, order: Order): string {
  const boxed = simplify(A(count, cut));
  if (order.with) return `${cap(amountWords(order.with.mine))} and ${amountWords(order.with.amount)} make ${amountWords(order.amount)}.`;
  if (order.asNumber) return `${cap(order.words)} is ${amountWords(order.amount)}.`;
  // More slices than one pie has ("three halves"): a pie can't be cut in two and give three (review round 1).
  if (boxed.d !== cut || count > cut) return `${cap(slicesWords(count, cut))} is the same as ${amountWords(order.amount)}.`;
  return `${cap(amountWords(order.amount))}: cut a pie into ${num(cut)} equal slices and take ${num(count)}.`;
}

/** Can this cut make the order? If not, why, for the step card: "Quarters can’t make a third of a pie exactly." */
export function cutHint(cut: number, order: Order): string | null {
  if (cutMakes(cut, order.amount)) return null;
  return `${cap(SLICE[cut].many)} can’t make ${askedWords(order)} exactly. Try another cut!`;
}
