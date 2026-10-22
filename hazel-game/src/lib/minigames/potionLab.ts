import type { Band } from '../../content/minigames';

/**
 * 🧪 Potion Lab (docs/DESIGN-MINIGAMES.md §5.1): a real experiment. Red cabbage
 * juice is purple; an acid turns it pink (a strong one red), a base turns it
 * blue and then green. Trader Tadpole has an order — a potion of one colour —
 * and the kid pours one jar at a time into fresh cabbage juice, guesses what
 * will happen, then stirs and sees. Pure: the jars, the colours, the guesses
 * and the orders.
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
  kind: Kind;
  /** About how acidic it is, to the nearest whole number (0–14; 7 is neutral) — what Tricky says. */
  ph: number;
  /** Its colour in the jar. */
  fill: string;
  look: Look;
  /** The first band it's on the counter. */
  from: Band;
  /** A true fact, for its Brew Book page. */
  fact: string;
}

export const JARS: readonly Jar[] = [
  { id: 'lemon', name: 'Lemon juice', kind: 'acid', ph: 2, fill: '#ffd84a', look: 'liquid', from: 'gentle', fact: 'Lemons are full of citric acid. That’s what makes them taste sour.' },
  { id: 'vinegar', name: 'Vinegar', kind: 'acid', ph: 3, fill: '#f2e3b8', look: 'liquid', from: 'gentle', fact: 'Vinegar is mostly water with a little acetic acid in it.' },
  { id: 'soda', name: 'Baking soda', kind: 'base', ph: 8, fill: '#fbfbf7', look: 'powder', from: 'gentle', fact: 'Baking soda is a base. Bakers use it to help cakes rise.' },
  { id: 'soap', name: 'Soapy water', kind: 'base', ph: 10, fill: '#a8dcff', look: 'bubbles', from: 'gentle', fact: 'Soap is a base. That’s part of why it feels slippery.' },
  { id: 'water', name: 'Plain water', kind: 'neutral', ph: 7, fill: '#cdeeff', look: 'liquid', from: 'gentle', fact: 'Pure water is neutral: not an acid and not a base.' },
  { id: 'sugar', name: 'Sugar water', kind: 'neutral', ph: 7, fill: '#ffffff', look: 'crystals', from: 'gentle', fact: 'Sugar melts into water, but it doesn’t make it an acid or a base.' },
  { id: 'orange', name: 'Orange juice', kind: 'acid', ph: 4, fill: '#ffa53a', look: 'pulp', from: 'medium', fact: 'Oranges have citric acid too, a little less than lemons.' },
  { id: 'milk', name: 'Milk', kind: 'neutral', ph: 7, fill: '#fffaf0', look: 'liquid', from: 'medium', fact: 'Milk is very nearly neutral: just a tiny bit on the acid side.' },
  { id: 'egg', name: 'Egg white', kind: 'base', ph: 9, fill: '#eef2d8', look: 'liquid', from: 'medium', fact: 'Egg white is a base, and it gets more basic as an egg gets older.' },
  { id: 'tomato', name: 'Tomato juice', kind: 'acid', ph: 4, fill: '#e8483f', look: 'pulp', from: 'tricky', fact: 'Tomatoes are a little acidic, about pH 4. That’s part of their tang.' },
  { id: 'salt', name: 'Salt water', kind: 'neutral', ph: 7, fill: '#e6f5ff', look: 'crystals', from: 'tricky', fact: 'Salt water tastes strong, but it’s neutral.' },
  { id: 'sea', name: 'Sea water', kind: 'base', ph: 8, fill: '#7fc4e8', look: 'liquid', from: 'tricky', fact: 'The sea is a little bit basic, about pH 8.' },
];

export const JAR_BY_ID = Object.fromEntries(JARS.map((j) => [j.id, j])) as Record<JarId, Jar>;

const BAND_ORDER: Record<Band, number> = { gentle: 0, medium: 1, tricky: 2 };

/** The jars on the counter at a band: Gentle 6, Medium 9, Tricky all 12. */
export function jarsFor(band: Band): Jar[] {
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

/**
 * What colour a jar turns the juice. Gentle and Medium in three colours (acids
 * pink, neutral purple, bases blue-green); Tricky in five, by where its pH sits
 * on the strip.
 */
export function shadeOf(jar: Jar, band: Band): Shade {
  if (band !== 'tricky') return jar.kind === 'acid' ? 'pink' : jar.kind === 'base' ? 'teal' : 'purple';
  const ph = Math.round(jar.ph);
  return (TRICKY_STRIP.find((s) => ph <= s.hi) ?? TRICKY_STRIP[TRICKY_STRIP.length - 1]).shade;
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
 * Tricky where it lands on the five-colour strip.
 */
export function guessOptions(band: Band): GuessOption[] {
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
export function guessPrompt(band: Band): string {
  if (band === 'gentle') return 'What colour will the potion turn?';
  if (band === 'medium') return 'Is it an acid, a base, or neutral?';
  return 'Where will it land on the colour strip?';
}

/**
 * Medium's key, under its guesses: the order asks for a colour but the guess is
 * a kind, so this says which colour each kind makes (review round 1).
 */
export function guessKey(band: Band): string | null {
  return band === 'medium' ? 'Acids → pink · Neutral → purple · Bases → blue-green' : null;
}

/** Was the guess right? Medium guesses the kind; the others the colour. */
export function guessedRight(guess: string, jar: Jar, band: Band): boolean {
  return band === 'medium' ? guess === jar.kind : guess === shadeOf(jar, band);
}

/** Why it turned that colour (and, on Tricky, the pH). */
export function whyLine(jar: Jar, band: Band): string {
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

/** An order: a potion of one colour, for someone in Verdara. */
export interface Order {
  shade: Shade;
  potion: string;
  customer: string;
}

export const POTION_NAME: Record<Shade, string> = {
  red: 'Ember Tonic',
  pink: 'Berry Potion',
  purple: 'Plum Draught',
  blue: 'Sky Syrup',
  teal: 'Moss Tonic',
  green: 'Leaf Elixir',
};

/** Who orders, in turn. Fern always orders first (the first Berry Potion is hers). */
export const CUSTOMERS = ['Fern', 'Beekeeper Hilda', 'Professor Petal', 'Sunny', 'Innkeeper Willow', 'Sprout'] as const;

/** The colours ordered, in turn, at each band — every one of them brewable from that band's jars. */
const ORDER_SHADES: Record<Band, readonly Shade[]> = {
  gentle: ['pink', 'teal', 'purple'],
  medium: ['pink', 'teal', 'purple'],
  tricky: ['red', 'blue', 'green', 'pink', 'purple'],
};

/** The order for the kid's `round`th round at a band (0 = the first). */
export function orderFor(band: Band, round: number): Order {
  const shades = ORDER_SHADES[band];
  const shade = round === 0 ? (band === 'tricky' ? 'red' : 'pink') : shades[round % shades.length];
  return { shade, potion: POTION_NAME[shade], customer: CUSTOMERS[round % CUSTOMERS.length] };
}

/** Did this jar fill the order? */
export function fillsOrder(jar: Jar, band: Band, order: Order): boolean {
  return shadeOf(jar, band) === order.shade;
}

/** "a Berry Potion", "an Ember Tonic". */
export function aPotion(order: Order): string {
  return `${/^[AEIOU]/.test(order.potion) ? 'an' : 'a'} ${order.potion}`;
}

/** The colour's word for an order ("glows pink", "stays purple"). */
export function orderWords(order: Order): string {
  return order.shade === 'purple' ? 'stays purple' : `glows ${SHADES[order.shade].label.toLowerCase()}`;
}
