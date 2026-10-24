import type { Band, PlayBand } from '../../content/minigames';

/**
 * 🧪 Potion Lab (docs/DESIGN-MINIGAMES.md §5.1): a real experiment. Red cabbage
 * juice is purple; an acid turns it pink (a strong one red), a base turns it
 * blue and then green. Trader Tadpole has an order — a potion of one colour —
 * and the kid pours one jar at a time into fresh cabbage juice, guesses what
 * will happen, then stirs and sees. On Expert (§8.5) the pH is a number, and
 * the scale counts in tens: an order asks for "a thousand times as acidic as
 * pure water", and the kid guesses the jar's pH. Pure: the jars, the colours,
 * the guesses and the orders.
 */

export type Kind = 'acid' | 'base' | 'neutral';
/** The colours cabbage juice turns. Gentle and Medium use three (pink, purple, teal); Tricky five. */
export type Shade = 'red' | 'pink' | 'purple' | 'blue' | 'teal' | 'green';

export const JAR_IDS = ['lemon', 'vinegar', 'soda', 'soap', 'water', 'sugar', 'orange', 'milk', 'egg', 'tomato', 'salt', 'sea'] as const;
export type JarId = (typeof JAR_IDS)[number];

/** What's in a jar, drawn on it. */
export type Look = 'liquid' | 'powder' | 'bubbles' | 'crystals' | 'pulp';

export interface Jar {
  id: JarId;
  name: string;
  /** One word, under its Brew Book page. */
  short: string;
  kind: Kind;
  /** About how acidic it is, to the nearest whole number (0–14; 7 is neutral) — what Tricky says. */
  ph: number;
  /** What Expert says where a real one varies: the whole numbers it spans (`phRange`; else just `ph`). */
  range?: readonly [number, number];
  /** Its colour in the jar. */
  fill: string;
  look: Look;
  /** The first band it's on the counter. */
  from: Band;
  /** A true fact, for its Brew Book page. */
  fact: string;
}

export const JARS: readonly Jar[] = [
  { id: 'lemon', name: 'Lemon juice', short: 'Lemon', kind: 'acid', ph: 2, fill: '#ffd84a', look: 'liquid', from: 'gentle', fact: 'Lemons are full of citric acid. That’s what makes them taste sour.' },
  { id: 'vinegar', name: 'Vinegar', short: 'Vinegar', kind: 'acid', ph: 3, range: [2, 3], fill: '#f2e3b8', look: 'liquid', from: 'gentle', fact: 'Vinegar is mostly water with a little acetic acid in it.' },
  { id: 'soda', name: 'Baking soda', short: 'Soda', kind: 'base', ph: 8, range: [8, 9], fill: '#fbfbf7', look: 'powder', from: 'gentle', fact: 'Baking soda is a base. Bakers use it to help cakes rise.' },
  { id: 'soap', name: 'Soapy water', short: 'Soap', kind: 'base', ph: 10, range: [9, 12], fill: '#a8dcff', look: 'bubbles', from: 'gentle', fact: 'Soap is a base. That’s part of why it feels slippery.' },
  { id: 'water', name: 'Plain water', short: 'Water', kind: 'neutral', ph: 7, fill: '#cdeeff', look: 'liquid', from: 'gentle', fact: 'Pure water is neutral: not an acid and not a base.' },
  { id: 'sugar', name: 'Sugar water', short: 'Sugar', kind: 'neutral', ph: 7, fill: '#ffffff', look: 'crystals', from: 'gentle', fact: 'Sugar melts into water, but it doesn’t make it an acid or a base.' },
  { id: 'orange', name: 'Orange juice', short: 'Orange', kind: 'acid', ph: 4, range: [3, 4], fill: '#ffa53a', look: 'pulp', from: 'medium', fact: 'Oranges have citric acid too, a little less than lemons.' },
  { id: 'milk', name: 'Milk', short: 'Milk', kind: 'neutral', ph: 7, range: [6, 7], fill: '#fffaf0', look: 'liquid', from: 'medium', fact: 'Milk is very nearly neutral: just a tiny bit on the acid side.' },
  { id: 'egg', name: 'Egg white', short: 'Egg', kind: 'base', ph: 9, range: [8, 9], fill: '#eef2d8', look: 'liquid', from: 'medium', fact: 'Egg white is a base, and it gets more basic as an egg gets older.' },
  { id: 'tomato', name: 'Tomato juice', short: 'Tomato', kind: 'acid', ph: 4, range: [4, 5], fill: '#e8483f', look: 'pulp', from: 'tricky', fact: 'Tomatoes are a little acidic, about pH 4. That’s part of their tang.' },
  { id: 'salt', name: 'Salt water', short: 'Salt', kind: 'neutral', ph: 7, fill: '#e6f5ff', look: 'crystals', from: 'tricky', fact: 'Salt water tastes strong, but it’s neutral.' },
  { id: 'sea', name: 'Sea water', short: 'Sea', kind: 'base', ph: 8, fill: '#7fc4e8', look: 'liquid', from: 'tricky', fact: 'The sea is a little bit basic, about pH 8.' },
];

export const JAR_BY_ID = Object.fromEntries(JARS.map((j) => [j.id, j])) as Record<JarId, Jar>;

const BAND_ORDER: Record<PlayBand, number> = { gentle: 0, medium: 1, tricky: 2, expert: 3 };

/** The jars on the counter at a band: Gentle 6, Medium 9, Tricky and Expert all 12. */
export function jarsFor(band: PlayBand): Jar[] {
  return JARS.filter((j) => BAND_ORDER[j.from] <= BAND_ORDER[band]);
}

export interface ShadeInfo {
  label: string;
  /** The liquid's colour, and a lighter one for its shine and bubbles. */
  hex: string;
  hi: string;
  /** Ink that reads on it. */
  ink: string;
}

export const SHADES: Record<Shade, ShadeInfo> = {
  red: { label: 'Red', hex: '#c81e3c', hi: '#ff8fa3', ink: '#ffffff' },
  pink: { label: 'Pink', hex: '#ff5fa8', hi: '#ffb0d4', ink: '#1b0f22' },
  purple: { label: 'Purple', hex: '#8e44c9', hi: '#c08ae6', ink: '#ffffff' },
  blue: { label: 'Blue', hex: '#2f62c8', hi: '#9cc4ff', ink: '#ffffff' },
  teal: { label: 'Blue-green', hex: '#22b39a', hi: '#9cf0dd', ink: '#1b0f22' },
  green: { label: 'Green', hex: '#2fbf5a', hi: '#a6f0b8', ink: '#1b0f22' },
};

/** Fresh cabbage juice, before anything's poured in. */
export const CABBAGE: Shade = 'purple';

/**
 * The colour strip on Tricky: five colours, each over a range of pH. Real red
 * cabbage goes red, pink, purple, blue and green across it. The guess shows
 * these ranges, and the colour a jar turns comes from them, so the two always
 * agree (review round 1: the labels and the rule had drifted apart).
 */
export const TRICKY_STRIP: readonly { shade: Shade; lo: number; hi: number }[] = [
  { shade: 'red', lo: 0, hi: 3 },
  { shade: 'pink', lo: 4, hi: 5 },
  { shade: 'purple', lo: 6, hi: 7 },
  { shade: 'blue', lo: 8, hi: 8 },
  { shade: 'green', lo: 9, hi: 14 },
];

/** A strip colour's range in words: "pH 0–3", "pH 8", "pH 9+". */
export function stripLabel({ lo, hi }: { lo: number; hi: number }): string {
  if (hi >= 14) return `pH ${lo}+`;
  return lo === hi ? `pH ${lo}` : `pH ${lo}–${hi}`;
}

/** Tricky and Expert read the five-colour strip. */
const onStrip = (band: PlayBand) => band === 'tricky' || band === 'expert';

/** Where a pH sits on the strip. */
const stripShade = (ph: number): Shade => (TRICKY_STRIP.find((s) => Math.round(ph) <= s.hi) ?? TRICKY_STRIP[TRICKY_STRIP.length - 1]).shade;

/**
 * What colour a jar turns the juice. Gentle and Medium in three colours (acids
 * pink, neutral purple, bases blue-green); Tricky and Expert in five, by where
 * its pH sits on the strip.
 */
export function shadeOf(jar: Jar, band: PlayBand): Shade {
  if (!onStrip(band)) return jar.kind === 'acid' ? 'pink' : jar.kind === 'base' ? 'teal' : 'purple';
  return stripShade(jar.ph);
}

/**
 * "ten times", "a hundred times" … "a hundred trillion times": a number of steps on the scale, up to its whole width
 * (code and UX review round 2: they stopped at seven, and a guess of 10 for lemon juice read "undefined steps").
 */
const TIMES = [
  '',
  'ten times',
  'a hundred times',
  'a thousand times',
  'ten thousand times',
  'a hundred thousand times',
  'a million times',
  'ten million times',
  'a hundred million times',
  'a billion times',
  'ten billion times',
  'a hundred billion times',
  'a trillion times',
  'ten trillion times',
  'a hundred trillion times',
];

const STEPS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
const steps = (n: number) => `${STEPS[n]} step${n === 1 ? '' : 's'}`;

/**
 * A jar's pH as Expert has it: the whole numbers a real one spans — charts
 * print vinegar 2 or 3, soap anywhere from 9 to 12 (UX review round 1: one
 * number made a textbook answer "one step out").
 */
export const phRange = (jar: Jar): readonly [number, number] => jar.range ?? [jar.ph, jar.ph];

/** "pH 2", "pH 2–3". */
export function phWords(jar: Jar): string {
  const [lo, hi] = phRange(jar);
  return lo === hi ? `pH ${lo}` : `pH ${lo}–${hi}`;
}

/**
 * Where a pH (or a range, `lo`–`hi`, on one side of 7) sits against pure
 * water's 7, counted in tens (Expert, §8.5): "three steps below 7, so a
 * thousand times as acidic as pure water"; "four or five steps below 7, so ten
 * thousand to a hundred thousand times…"; "neutral, or up to one step below —
 * up to ten times as acidic…".
 */
export function scaleWords(lo: number, hi = lo): string {
  const acid = hi <= 7;
  const near = acid ? 7 - hi : lo - 7;
  const far = acid ? 7 - lo : hi - 7;
  const side = acid ? 'below' : 'above';
  const kind = acid ? 'acidic' : 'alkaline';
  if (far === 0) return 'neutral, like pure water';
  if (near === far) return `${steps(near)} ${side} 7, so ${TIMES[near]} as ${kind} as pure water`;
  if (near === 0) return `neutral, or up to ${steps(far)} ${side} — up to ${TIMES[far]} as ${kind} as pure water`;
  return `${STEPS[near]} ${far - near === 1 ? 'or' : 'to'} ${STEPS[far]} steps ${side} 7, so ${TIMES[near].replace(/ times$/, '')} to ${TIMES[far]} as ${kind} as pure water`;
}

export const KIND_LABEL: Record<Kind, string> = { acid: 'Acid', base: 'Base', neutral: 'Neutral' };
const KIND_A: Record<Kind, string> = { acid: 'an acid', base: 'a base', neutral: 'neutral' };

/** One answer the kid can guess. */
export interface GuessOption {
  id: string;
  label: string;
  /** A colour to show (colour guesses); none for an acid / base / neutral guess. */
  hex?: string;
  /** Under the label: Tricky's pH range. */
  sub?: string;
}

/**
 * What the kid guesses: Gentle the colour (pink, stays purple, blue-green);
 * Medium what kind of thing it is (acid, neutral, base — the colour follows);
 * Tricky where it lands on the five-colour strip; Expert its pH, 0–14, as a
 * number — no colours by it: the colour's what happens.
 */
export function guessOptions(band: PlayBand): GuessOption[] {
  if (band === 'expert') return Array.from({ length: 15 }, (_, n) => ({ id: String(n), label: String(n) }));
  if (band === 'gentle') {
    return (['pink', 'purple', 'teal'] as const).map((s) => ({
      id: s,
      label: s === 'purple' ? 'Stays purple' : SHADES[s].label,
      hex: SHADES[s].hex,
    }));
  }
  if (band === 'medium') return (['acid', 'neutral', 'base'] as const).map((k) => ({ id: k, label: KIND_LABEL[k] }));
  return TRICKY_STRIP.map((s) => ({ id: s.shade, label: SHADES[s.shade].label, hex: SHADES[s.shade].hex, sub: stripLabel(s) }));
}

/** The question the step card asks. */
export function guessPrompt(band: PlayBand): string {
  if (band === 'expert') return 'What’s its pH, 0 to 14?';
  if (band === 'gentle') return 'What colour will the potion turn?';
  if (band === 'medium') return 'Is it an acid, a base, or neutral?';
  return 'Where will it land on the colour strip?';
}

/**
 * Medium's key, under its guesses: the order asks for a colour but the guess is
 * a kind, so this says which colour each kind makes (review round 1).
 */
export function guessKey(band: PlayBand): string | null {
  if (band === 'expert') return '7 is neutral. Each step down is ten times as acidic; each step up, ten times as alkaline.';
  return band === 'medium' ? 'Acids turn it pink, neutral things leave it purple, bases turn it blue-green.' : null;
}

/** What the kid guessed, in words: "pink", "an acid", "blue", "pH 4". */
export function guessWords(guess: string, band: PlayBand): string {
  if (band === 'expert') return `pH ${guess}`;
  if (band === 'medium') return KIND_A[guess as Kind] ?? guess;
  return guess === 'purple' ? 'it stays purple' : (SHADES[guess as Shade]?.label.toLowerCase() ?? guess);
}

/** A Brew Book page read out: what the jar does (on Expert, its pH on the scale), then its fact. */
export function pageLine(jar: Jar, band: PlayBand): string {
  if (band === 'expert') return `${jar.name}: about ${phWords(jar)} — ${scaleWords(...phRange(jar))}. ${jar.fact}`;
  const shade = shadeOf(jar, band);
  const does = shade === CABBAGE ? 'leaves it purple' : `turns it ${SHADES[shade].label.toLowerCase()}`;
  return `${jar.name} ${does} — it’s ${KIND_A[jar.kind]}. ${jar.fact}`;
}

/** Was the guess right? Medium guesses the kind; Expert the pH, within the jar's range; the others the colour. */
export function guessedRight(guess: string, jar: Jar, band: PlayBand): boolean {
  if (band === 'expert') return stepsOut(guess, jar) === 0;
  return band === 'medium' ? guess === jar.kind : guess === shadeOf(jar, band);
}

/** On Expert, how many steps of the scale a pH guess was out of the jar's range. */
export function stepsOut(guess: string, jar: Jar): number {
  const g = Number(guess);
  const [lo, hi] = phRange(jar);
  return g < lo ? lo - g : g > hi ? g - hi : 0;
}

const kindAt = (ph: number) => (ph < 7 ? 'acidic' : ph > 7 ? 'alkaline' : 'neutral');

/** "a hundred times": how far a guess was, for the result's line. */
export const timesWords = (n: number) => TIMES[n];

/** "two steps", "four or five steps", "two to five steps" — from the near end of a range to the far. */
function stepsBetween(near: number, far: number): string {
  return near === far ? steps(near) : `${STEPS[near]} ${far - near === 1 ? 'or' : 'to'} ${STEPS[far]} steps`;
}
function timesBetween(near: number, far: number): string {
  return near === far ? TIMES[near] : `${TIMES[near].replace(/ times$/, '')} to ${TIMES[far]}`;
}

/**
 * Expert's guess said back, in tens and which way (UX review round 1: "Not
 * quite" said nothing of how far, or which side of 7): "Spot on: lemon juice
 * is about pH 2."; "pH 9 is alkaline. Lemon juice is about pH 2 — seven steps
 * below your 9: ten million times more acidic." The jar is said in its own
 * words — an acid more or less acidic than the guess, a base more or less
 * alkaline, a neutral one less of whichever the guess was — and a range from
 * end to end (code and UX review round 2: lemon juice "a hundred times more
 * alkaline" than a guess of 0; vinegar "five steps" below 8, which is five or
 * six).
 */
export function guessVerdict(guess: string, jar: Jar): string {
  const g = Number(guess);
  const [lo, hi] = phRange(jar);
  const name = jar.name.charAt(0).toLowerCase() + jar.name.slice(1);
  if (g >= lo && g <= hi) return `Spot on: ${name} is about ${phWords(jar)}.`;
  // The jar below the guess, or above it.
  const below = g > hi;
  const near = below ? g - hi : lo - g;
  const far = below ? g - lo : hi - g;
  // A guess on a side of 7 the jar is never on says so first (milk, 6–7, guessed 5: no — milk can be acidic).
  const sides = new Set(Array.from({ length: hi - lo + 1 }, (_, k) => kindAt(lo + k)));
  const side = sides.has(kindAt(g)) ? '' : `pH ${g} is ${kindAt(g)}. `;
  const than = jar.kind === 'acid' ? (below ? 'more acidic' : 'less acidic') : jar.kind === 'base' ? (below ? 'less alkaline' : 'more alkaline') : below ? 'less alkaline' : 'less acidic';
  return `${side}${jar.name} is about ${phWords(jar)} — ${stepsBetween(near, far)} ${below ? 'below' : 'above'} your ${g}: ${timesBetween(near, far)} ${than}.`;
}

/**
 * Which way to look after a jar that doesn't fill an Expert order — the order's
 * pH against the jar's, in the order's own words: "more acidic", "less
 * alkaline"… (UX review round 2: "try another jar" said nothing of which).
 */
export function orderNudge(order: Order, jar: Jar): string | null {
  if (order.ph === undefined) return null;
  const [lo, hi] = phRange(jar);
  if (order.ph < lo) return order.ph < 7 ? 'more acidic' : 'less alkaline';
  if (order.ph > hi) return order.ph > 7 ? 'more alkaline' : 'less acidic';
  return null;
}

/** Why it turned that colour (and, on Tricky, the pH; on Expert, where that sits on the scale, and what neutralises it). */
export function whyLine(jar: Jar, band: PlayBand): string {
  if (band === 'expert') {
    const fix = jar.kind === 'acid' ? ' A base neutralises it.' : jar.kind === 'base' ? ' An acid neutralises it.' : '';
    return `${jar.name} is about ${phWords(jar)}: ${scaleWords(...phRange(jar))}.${fix}`;
  }
  const what = `${jar.name} is ${KIND_A[jar.kind]}${band === 'tricky' ? `, about pH ${jar.ph}` : ''}.`;
  if (band !== 'tricky') {
    if (jar.kind === 'acid') return `${what} Acids turn cabbage juice pink.`;
    if (jar.kind === 'base') return `${what} Bases turn cabbage juice blue-green.`;
    return `${what} Neutral things leave cabbage juice purple.`;
  }
  if (jar.kind === 'acid') return `${what} Strong acids turn cabbage juice red; weaker ones pink.`;
  if (jar.kind === 'base') return `${what} Weak bases turn cabbage juice blue; stronger ones green.`;
  return `${what} Neutral things leave cabbage juice purple.`;
}

/** An order: a potion of one colour, for someone in Verdara — on Expert, of one pH. */
export interface Order {
  shade: Shade;
  potion: string;
  customer: string;
  /** Expert: the pH it must be, said in tens from pure water's 7. */
  ph?: number;
}

export const POTION_NAME: Record<Shade, string> = {
  red: 'Ember Tonic',
  pink: 'Berry Potion',
  purple: 'Plum Draught',
  blue: 'Sky Syrup',
  teal: 'Moss Tonic',
  green: 'Leaf Elixir',
};

/** Who orders, in turn. Fern always orders first. */
export const CUSTOMERS = ['Fern', 'Beekeeper Hilda', 'Professor Petal', 'Sunny', 'Innkeeper Willow', 'Sprout'] as const;

/** The colours ordered, in turn, at each band — every one of them brewable from that band's jars. */
const ORDER_SHADES: Record<Band, readonly Shade[]> = {
  gentle: ['pink', 'teal', 'purple'],
  medium: ['pink', 'teal', 'purple'],
  tricky: ['red', 'blue', 'green', 'pink', 'purple'],
};

/**
 * Expert's orders, in turn, by pH: each one some jar's, and never neutral
 * (that's no counting) — named apart from the colours, so a potion's name
 * doesn't give its place on the strip (UX review round 1: a pink Berry Potion
 * was pH 4–5 to a Tricky player).
 */
const EXPERT_ORDERS = [
  { ph: 4, potion: 'Owl Tonic' },
  { ph: 10, potion: 'Thunder Draught' },
  { ph: 2, potion: 'Comet Elixir' },
  { ph: 8, potion: 'Mist Syrup' },
  { ph: 3, potion: 'Fox Tonic' },
  { ph: 9, potion: 'Moon Draught' },
] as const;

/** The order for the kid's `round`th round at a band (0 = the first: pink, or red on Tricky, or pH 4 on Expert). */
export function orderFor(band: PlayBand, round: number): Order {
  const customer = CUSTOMERS[round % CUSTOMERS.length];
  if (band === 'expert') {
    const { ph, potion } = EXPERT_ORDERS[round % EXPERT_ORDERS.length];
    return { shade: stripShade(ph), potion, customer, ph };
  }
  const shades = ORDER_SHADES[band];
  const shade = shades[round % shades.length];
  return { shade, potion: POTION_NAME[shade], customer };
}

/** Did this jar fill the order? On Expert, the pH asked for is in the jar's range. */
export function fillsOrder(jar: Jar, band: PlayBand, order: Order): boolean {
  if (order.ph !== undefined) return stepsOut(String(order.ph), jar) === 0;
  return shadeOf(jar, band) === order.shade;
}

/** "a Berry Potion", "an Ember Tonic". */
export function aPotion(order: Order): string {
  return `${/^[AEIOU]/.test(order.potion) ? 'an' : 'a'} ${order.potion}`;
}

/** The colour's word for an order ("glows pink", "stays purple"); on Expert, its pH in tens ("is a thousand times as acidic as pure water"). */
export function orderWords(order: Order): string {
  if (order.ph !== undefined) return `is ${TIMES[Math.abs(order.ph - 7)]} as ${order.ph < 7 ? 'acidic' : 'alkaline'} as pure water`;
  return order.shade === 'purple' ? 'stays purple' : `glows ${SHADES[order.shade].label.toLowerCase()}`;
}
