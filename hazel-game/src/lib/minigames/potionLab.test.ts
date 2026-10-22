import { describe, it, expect } from 'vitest';
import {
  JARS,
  JAR_IDS,
  TRICKY_STRIP,
  aPotion,
  fillsOrder,
  guessOptions,
  guessedRight,
  jarsFor,
  orderFor,
  orderWords,
  shadeOf,
  stripLabel,
  whyLine,
  type JarId,
} from './potionLab';
import { BANDS } from '../../content/minigames';
import { MINIGAMES } from '../../content/minigames';

const jar = (id: JarId) => JARS.find((j) => j.id === id)!;

describe('the jars (docs/DESIGN-MINIGAMES.md §5.1)', () => {
  it('one per id, and the Brew Book holds every one', () => {
    expect(JARS.map((j) => j.id)).toEqual([...JAR_IDS]);
    expect(MINIGAMES['potion-lab'].pages).toBe(JARS.length);
  });

  it('Gentle has 6 on the counter, Medium 9, Tricky all 12', () => {
    expect(jarsFor('gentle')).toHaveLength(6);
    expect(jarsFor('medium')).toHaveLength(9);
    expect(jarsFor('tricky')).toHaveLength(12);
  });

  it('each kind agrees with its pH (acids below 7, bases above, neutral about 7)', () => {
    for (const j of JARS) {
      if (j.kind === 'acid') expect(j.ph, j.id).toBeLessThan(6);
      if (j.kind === 'base') expect(j.ph, j.id).toBeGreaterThan(7.5);
      if (j.kind === 'neutral') expect(Math.abs(j.ph - 7), j.id).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('the colours red cabbage turns', () => {
  it('Gentle and Medium: acids pink, neutral purple, bases blue-green', () => {
    for (const band of ['gentle', 'medium'] as const) {
      for (const j of JARS) {
        const want = j.kind === 'acid' ? 'pink' : j.kind === 'base' ? 'teal' : 'purple';
        expect(shadeOf(j, band), `${j.id} ${band}`).toBe(want);
      }
    }
  });

  it('Tricky: five colours by pH — strong acid red, weak pink, neutral purple, weak base blue, stronger green', () => {
    expect(shadeOf(jar('lemon'), 'tricky')).toBe('red');
    expect(shadeOf(jar('vinegar'), 'tricky')).toBe('red');
    expect(shadeOf(jar('orange'), 'tricky')).toBe('pink');
    expect(shadeOf(jar('tomato'), 'tricky')).toBe('pink');
    expect(shadeOf(jar('milk'), 'tricky')).toBe('purple');
    expect(shadeOf(jar('water'), 'tricky')).toBe('purple');
    expect(shadeOf(jar('soda'), 'tricky')).toBe('blue');
    expect(shadeOf(jar('sea'), 'tricky')).toBe('blue');
    expect(shadeOf(jar('egg'), 'tricky')).toBe('green');
    expect(shadeOf(jar('soap'), 'tricky')).toBe('green');
  });

  it('Tricky: the strip covers pH 0–14 with no gap, and its labels read as whole numbers', () => {
    expect(TRICKY_STRIP[0].lo).toBe(0);
    expect(TRICKY_STRIP[TRICKY_STRIP.length - 1].hi).toBe(14);
    for (let i = 1; i < TRICKY_STRIP.length; i++) expect(TRICKY_STRIP[i].lo).toBe(TRICKY_STRIP[i - 1].hi + 1);
    expect(TRICKY_STRIP.map(stripLabel)).toEqual(['pH 0–3', 'pH 4–5', 'pH 6–7', 'pH 8', 'pH 9+']);
  });

  it('Tricky: every jar’s pH, as Tadpole says it, sits inside the strip range of the colour it turns (review round 1)', () => {
    for (const j of JARS) {
      expect(Number.isInteger(j.ph), `${j.id} says "about pH ${j.ph}"`).toBe(true);
      const range = TRICKY_STRIP.find((s) => s.shade === shadeOf(j, 'tricky'))!;
      expect(j.ph, j.id).toBeGreaterThanOrEqual(range.lo);
      expect(j.ph, j.id).toBeLessThanOrEqual(range.hi);
      expect(whyLine(j, 'tricky'), j.id).toContain(`about pH ${j.ph}.`);
    }
  });
});

describe('guesses', () => {
  it('Gentle guesses the colour, Medium the kind, Tricky a place on the five-colour strip', () => {
    expect(guessOptions('gentle').map((o) => o.id)).toEqual(['pink', 'purple', 'teal']);
    expect(guessOptions('gentle')[1].label).toBe('Stays purple');
    expect(guessOptions('medium').map((o) => o.id)).toEqual(['acid', 'neutral', 'base']);
    expect(guessOptions('medium').every((o) => !o.hex)).toBe(true);
    expect(guessOptions('tricky').map((o) => o.id)).toEqual(['red', 'pink', 'purple', 'blue', 'green']);
    expect(guessOptions('tricky').every((o) => o.sub?.startsWith('pH'))).toBe(true);
  });

  it('every jar has exactly one right guess at every band', () => {
    for (const band of BANDS) {
      for (const j of jarsFor(band)) {
        const right = guessOptions(band).filter((o) => guessedRight(o.id, j, band));
        expect(right, `${j.id} ${band}`).toHaveLength(1);
      }
    }
  });

  it('the why names the kind, and the pH only on Tricky', () => {
    expect(whyLine(jar('lemon'), 'gentle')).toBe('Lemon juice is an acid. Acids turn cabbage juice pink.');
    expect(whyLine(jar('soda'), 'medium')).toBe('Baking soda is a base. Bases turn cabbage juice blue-green.');
    expect(whyLine(jar('water'), 'gentle')).toBe('Plain water is neutral. Neutral things leave cabbage juice purple.');
    expect(whyLine(jar('lemon'), 'tricky')).toContain('about pH 2');
    expect(whyLine(jar('lemon'), 'medium')).not.toContain('pH');
  });
});

describe('orders', () => {
  it('Fern orders first; on Gentle and Medium a pink Berry Potion', () => {
    expect(orderFor('gentle', 0)).toEqual({ shade: 'pink', potion: 'Berry Potion', customer: 'Fern' });
    expect(orderFor('medium', 0).shade).toBe('pink');
    expect(orderFor('tricky', 0)).toMatchObject({ shade: 'red', customer: 'Fern' });
  });

  it('every order at every band can be filled from that band’s jars', () => {
    for (const band of BANDS) {
      for (let round = 0; round < 30; round++) {
        const order = orderFor(band, round);
        expect(jarsFor(band).some((j) => fillsOrder(j, band, order)), `${band} round ${round}: ${order.shade}`).toBe(true);
      }
    }
  });

  it('orders change from round to round', () => {
    expect(orderFor('gentle', 1)).not.toEqual(orderFor('gentle', 0));
    expect(orderFor('tricky', 1).shade).not.toBe(orderFor('tricky', 0).shade);
  });

  it('says its colour and its article', () => {
    expect(orderWords(orderFor('gentle', 0))).toBe('glows pink');
    expect(orderWords({ shade: 'purple', potion: 'Plum Draught', customer: 'Sunny' })).toBe('stays purple');
    expect(aPotion(orderFor('tricky', 0))).toBe('an Ember Tonic');
    expect(aPotion(orderFor('gentle', 0))).toBe('a Berry Potion');
  });
});
