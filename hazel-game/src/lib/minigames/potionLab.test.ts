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
  orderNudge,
  orderWords,
  guessVerdict,
  pageLine,
  phRange,
  scaleWords,
  shadeOf,
  stepsOut,
  stripLabel,
  timesWords,
  whyLine,
  type JarId,
} from './potionLab';
import { PLAY_BANDS } from '../../content/minigames';
import { MINIGAMES } from '../../content/minigames';

const jar = (id: JarId) => JARS.find((j) => j.id === id)!;

describe('the jars (docs/DESIGN-MINIGAMES.md §5.1)', () => {
  it('one per id, and the Brew Book holds every one', () => {
    expect(JARS.map((j) => j.id)).toEqual([...JAR_IDS]);
    expect(MINIGAMES['potion-lab'].pages).toBe(JARS.length);
  });

  it('Gentle has 6 on the counter, Medium 9, Tricky and Expert all 12', () => {
    expect(jarsFor('gentle')).toHaveLength(6);
    expect(jarsFor('medium')).toHaveLength(9);
    expect(jarsFor('tricky')).toHaveLength(12);
    expect(jarsFor('expert')).toHaveLength(12);
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

  it('every jar has exactly one right guess at every band — on Expert, each whole number of its pH range', () => {
    for (const band of PLAY_BANDS) {
      for (const j of jarsFor(band)) {
        const right = guessOptions(band).filter((o) => guessedRight(o.id, j, band));
        const [lo, hi] = phRange(j);
        expect(right, `${j.id} ${band}`).toHaveLength(band === 'expert' ? hi - lo + 1 : 1);
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
    for (const band of PLAY_BANDS) {
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

describe('Expert: the pH scale in numbers, counted in tens (§8.5)', () => {
  it('guesses the pH, 0–14, with no colours by them; right anywhere in the jar’s range — real ones vary (UX review round 1); how many steps out', () => {
    expect(guessOptions('expert').map((o) => o.id)).toEqual(Array.from({ length: 15 }, (_, n) => String(n)));
    expect(guessOptions('expert').every((o) => !o.hex && !o.sub)).toBe(true);
    expect(guessedRight('2', jar('lemon'), 'expert')).toBe(true);
    expect(guessedRight('3', jar('lemon'), 'expert')).toBe(false);
    // Charts print vinegar 2 or 3, soap 9 to 12: each spot on.
    expect(['2', '3'].map((g) => guessedRight(g, jar('vinegar'), 'expert'))).toEqual([true, true]);
    expect(['9', '10', '11', '12', '13'].map((g) => guessedRight(g, jar('soap'), 'expert'))).toEqual([true, true, true, true, false]);
    expect(stepsOut('3', jar('lemon'))).toBe(1);
    expect(stepsOut('7', jar('soap'))).toBe(2);
    expect(stepsOut('5', jar('vinegar'))).toBe(2);
    // Tricky's one number sits in Expert's range; the colours are the strip's.
    for (const j of JARS) {
      const [lo, hi] = phRange(j);
      expect(j.ph, j.id).toBeGreaterThanOrEqual(lo);
      expect(j.ph, j.id).toBeLessThanOrEqual(hi);
      expect(shadeOf(j, 'expert'), j.id).toBe(shadeOf(j, 'tricky'));
    }
  });

  it('each step from 7 is ten times, in words — a range from end to end', () => {
    expect(scaleWords(7)).toBe('neutral, like pure water');
    expect(scaleWords(8)).toBe('one step above 7, so ten times as alkaline as pure water');
    expect(scaleWords(4)).toBe('three steps below 7, so a thousand times as acidic as pure water');
    expect(scaleWords(2)).toBe('five steps below 7, so a hundred thousand times as acidic as pure water');
    expect(scaleWords(2, 3)).toBe('four or five steps below 7, so ten thousand to a hundred thousand times as acidic as pure water');
    expect(scaleWords(9, 12)).toBe('two to five steps above 7, so a hundred to a hundred thousand times as alkaline as pure water');
    expect(scaleWords(6, 7)).toBe('neutral, or up to one step below — up to ten times as acidic as pure water');
    expect(whyLine(jar('lemon'), 'expert')).toBe('Lemon juice is about pH 2: five steps below 7, so a hundred thousand times as acidic as pure water. A base neutralises it.');
    expect(whyLine(jar('soap'), 'expert')).toBe('Soapy water is about pH 9–12: two to five steps above 7, so a hundred to a hundred thousand times as alkaline as pure water. An acid neutralises it.');
    expect(whyLine(jar('water'), 'expert')).toBe('Plain water is about pH 7: neutral, like pure water.');
    // Milk: "a tiny bit on the acid side", as its page says.
    expect(whyLine(jar('milk'), 'expert')).toBe('Milk is about pH 6–7: neutral, or up to one step below — up to ten times as acidic as pure water.');
    expect(pageLine(jar('sea'), 'expert')).toBe(`Sea water: about pH 8 — one step above 7, so ten times as alkaline as pure water. ${jar('sea').fact}`);
    // A range on its page, end to end (code review round 2: only one with no range was tested).
    expect(pageLine(jar('orange'), 'expert')).toBe(`Orange juice: about pH 3–4 — three or four steps below 7, so a thousand to ten thousand times as acidic as pure water. ${jar('orange').fact}`);
  });

  it('a guess said back in tens, and which way — the other side of 7 said first (UX review round 1: "Not quite" said nothing)', () => {
    expect(guessVerdict('2', jar('lemon'))).toBe('Spot on: lemon juice is about pH 2.');
    expect(guessVerdict('3', jar('vinegar'))).toBe('Spot on: vinegar is about pH 2–3.');
    expect(guessVerdict('3', jar('lemon'))).toBe('Lemon juice is about pH 2 — one step below your 3: ten times more acidic.');
    expect(guessVerdict('9', jar('lemon'))).toBe('pH 9 is alkaline. Lemon juice is about pH 2 — seven steps below your 9: ten million times more acidic.');
    // Code and UX review round 2: past seven steps ("undefined"), in the jar's own words, a range from end to end.
    expect(guessVerdict('14', jar('lemon'))).toBe('pH 14 is alkaline. Lemon juice is about pH 2 — twelve steps below your 14: a trillion times more acidic.');
    expect(guessVerdict('0', jar('lemon'))).toBe('Lemon juice is about pH 2 — two steps above your 0: a hundred times less acidic.');
    expect(guessVerdict('7', jar('soap'))).toBe('pH 7 is neutral. Soapy water is about pH 9–12 — two to five steps above your 7: a hundred to a hundred thousand times more alkaline.');
    expect(guessVerdict('10', jar('egg'))).toBe('Egg white is about pH 8–9 — one or two steps below your 10: ten to a hundred times less alkaline.');
    expect(guessVerdict('8', jar('vinegar'))).toBe('pH 8 is alkaline. Vinegar is about pH 2–3 — five or six steps below your 8: a hundred thousand to a million times more acidic.');
    expect(guessVerdict('9', jar('water'))).toBe('pH 9 is alkaline. Plain water is about pH 7 — two steps below your 9: a hundred times less alkaline.');
    // Milk can be on the acid side (6–7): a guess of 5 isn't told it's the wrong side.
    expect(guessVerdict('5', jar('milk'))).toBe('Milk is about pH 6–7 — one or two steps above your 5: ten to a hundred times less acidic.');
  });

  it('every jar against every guess, 0–14: a number of steps that’s true, in words, and the jar said as what it is (code and UX review round 2)', () => {
    for (const j of JARS) {
      const [lo, hi] = phRange(j);
      for (let g = 0; g <= 14; g++) {
        const said = guessVerdict(String(g), j);
        const at = `${j.id} ${g}`;
        expect(said, at).not.toMatch(/undefined|NaN/);
        if (g >= lo && g <= hi) {
          expect(said, at).toMatch(/^Spot on: /);
          continue;
        }
        // The near end's steps first, in words; the times to match.
        const near = g > hi ? g - hi : lo - g;
        expect(said, at).toContain(` ${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'][near]} `);
        expect(said, at).toContain(g > hi ? `below your ${g}` : `above your ${g}`);
        // An acid is never "more alkaline", a base never "more acidic"; a neutral jar is only ever "less" of either.
        if (j.kind === 'acid') expect(said, at).not.toMatch(/alkaline\.$/);
        if (j.kind === 'base') expect(said, at).not.toMatch(/acidic\.$/);
        if (j.kind === 'neutral') expect(said, at).toMatch(/ less (acidic|alkaline)\.$/);
      }
    }
    expect(timesWords(12)).toBe('a trillion times');
  });

  it('after a jar that doesn’t fill the order, which way to look — in the order’s words (UX review round 2)', () => {
    const owl = orderFor('expert', 0); // pH 4
    const thunder = orderFor('expert', 1); // pH 10
    expect(orderNudge(owl, jar('lemon'))).toBe('less acidic');
    expect(orderNudge(owl, jar('water'))).toBe('more acidic');
    expect(orderNudge(thunder, jar('lemon'))).toBe('more alkaline');
    expect(orderNudge(thunder, jar('soap'))).toBeNull();
    expect(orderNudge(orderFor('expert', 3), jar('soap'))).toBe('less alkaline'); // pH 8
    expect(orderNudge(orderFor('gentle', 0), jar('soap'))).toBeNull();
  });

  it('an order asks for a pH in tens from pure water — never neutral, named apart from the colours (UX review round 1); each jar whose range holds it fills it', () => {
    expect(orderFor('expert', 0)).toEqual({ shade: 'pink', potion: 'Owl Tonic', customer: 'Fern', ph: 4 });
    expect(orderWords(orderFor('expert', 0))).toBe('is a thousand times as acidic as pure water');
    expect(orderWords(orderFor('expert', 1))).toBe('is a thousand times as alkaline as pure water');
    const fills = Array.from({ length: 6 }, (_, r) => {
      const order = orderFor('expert', r);
      return `${order.ph}: ${JARS.filter((j) => fillsOrder(j, 'expert', order)).map((j) => j.id).join(',')}`;
    });
    // Code review round 1: the exact-pH fill was untested (a colour fill passed every test).
    expect(fills).toEqual(['4: orange,tomato', '10: soap', '2: lemon,vinegar', '8: soda,egg,sea', '3: vinegar,orange', '9: soda,soap,egg']);
    expect(new Set(Array.from({ length: 6 }, (_, r) => orderFor('expert', r).potion)).size).toBe(6);
  });
});
