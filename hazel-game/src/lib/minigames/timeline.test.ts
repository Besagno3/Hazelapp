import { describe, it, expect } from 'vitest';
import { SETS, SET_BY_ID, SET_IDS, JOBS_PER_ROUND, check, checkWords, hintFor, jobFor, jobWords, learnedLine, roundQueue, yearWords, type Job } from './timeline';
import { BANDS, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

describe('the timeline sets (docs/DESIGN-MINIGAMES.md §5.8)', () => {
  it('eight sets of seven, oldest first, no two at once; each event a hint and a page note', () => {
    expect(SETS.map((s) => s.id)).toEqual([...SET_IDS]);
    for (const s of SETS) {
      expect(s.events, s.id).toHaveLength(7);
      for (let k = 1; k < 7; k++) expect(s.events[k].year, `${s.id} ${s.events[k].id}`).toBeGreaterThan(s.events[k - 1].year);
      for (const ev of s.events) expect(ev.because.length, ev.id).toBeGreaterThan(15);
      expect(s.note.length).toBeGreaterThan(30);
    }
    expect(new Set(SETS.flatMap((s) => s.events.map((ev) => `${s.id}:${ev.id}`))).size).toBe(56);
  });

  it('the years people know: the light bulb 1879, the first aeroplane 1903, the Moon 1969, the printing press about 1440', () => {
    const year = (set: (typeof SET_IDS)[number], id: string) => SET_BY_ID[set].events.find((ev) => ev.id === id)!.year;
    expect(year('light', 'bulb')).toBe(1879);
    expect(year('flight', 'first-plane')).toBe(1903);
    expect(year('flight', 'moon')).toBe(1969);
    expect(year('writing', 'printing')).toBe(1440);
    expect(year('buildings', 'eiffel')).toBe(1889);
    expect(year('medicine', 'penicillin')).toBe(1928);
  });
});

describe('the jobs', () => {
  it('Gentle 3–4 cards, Medium five, Tricky 6–7 with years; each a set’s events, oldest first; dealt out of order', () => {
    const sizes: Record<Band, number[]> = { gentle: [3, 4], medium: [5], tricky: [6, 7] };
    for (const band of BANDS) {
      for (const job of jobs(band)) {
        expect(sizes[band]).toContain(job.events.length);
        expect(job.years).toBe(band === 'tricky');
        for (let k = 1; k < job.events.length; k++) expect(job.events[k].year).toBeGreaterThan(job.events[k - 1].year);
        expect([...job.dealt].sort()).toEqual(job.events.map((ev) => ev.id).sort());
        expect(job.dealt).not.toEqual(job.events.map((ev) => ev.id));
      }
    }
  });

  it('sets not in the book first; three rounds show all eight', () => {
    expect(roundQueue(() => false, 0).slice(0, 3)).toEqual(['light', 'travel', 'writing']);
    expect(roundQueue((id) => id === 'light', 0).slice(0, 3)).toEqual(['travel', 'writing', 'flight']);
    expect(new Set(Array.from({ length: 9 }, (_, k) => jobFor('medium', Math.floor(k / 3), k % 3).set)).size).toBe(8);
  });
});

describe('the checks and the words', () => {
  const g = jobFor('gentle', 0, 0); // Light: firelight, gas lamps, LEDs
  const t = jobFor('tricky', 0, 1); // Travel, six with years

  it('a year said, BCE and CE', () => {
    expect(yearWords(SET_BY_ID.light.events[4])).toBe('1879');
    expect(yearWords(SET_BY_ID.light.events[0])).toBe('about 400,000 BCE');
    expect(yearWords(SET_BY_ID.travel.events[1])).toBe('about 3500 BCE');
    expect(yearWords(SET_BY_ID.writing.events[2])).toBe('about 105 CE');
    expect(yearWords(SET_BY_ID.buildings.events[2])).toBe('312 BCE');
  });

  it('a check: which places are right; all right, or how many and a hint for one placed wrong', () => {
    expect(g.events.map((ev) => ev.id)).toEqual(['fire', 'gas-lamp', 'led']);
    expect(check(g, ['fire', 'gas-lamp', 'led'])).toEqual([true, true, true]);
    expect(checkWords(g, [true, true, true], ['fire', 'gas-lamp', 'led'])).toBe('All in order! Firelight in caves first, LED lights last.');
    const placed = ['gas-lamp', 'fire', 'led'];
    const right = check(g, placed);
    expect(right).toEqual([false, false, true]);
    expect(checkWords(g, right, placed)).toBe('One in the right place! Lighting a whole street took gas pipes — long after candles.');
    expect(checkWords(g, check(g, ['led', null, 'fire']), ['led', null, 'fire'])).toBe('Not yet! LEDs are tiny electronic lights — much newer than bulbs.');
  });

  it('the hint: why it comes after the one before it; the oldest goes first; on Tricky, BCE years counted down', () => {
    expect(hintFor(g, 'fire')).toBe('Firelight in caves is the oldest of these — it goes first.');
    const bikes = jobFor('gentle', 3, 0); // Travel: canoe, bicycle, bullet train
    expect(bikes.events.map((ev) => ev.id)).toEqual(['canoe', 'bicycle', 'bullet-train']);
    expect(hintFor(bikes, 'bicycle')).toBe('The first bicycle (with no pedals yet!) came just after the first steam trains.');
    expect(hintFor(bikes, 'no-such-card')).toBe('');
    expect(t.set).toBe('travel');
    expect(hintFor(t, 'wheel')).toBe('The wheel came after Dugout canoes — in BCE, a bigger year is longer ago.');
  });

  it('the ticket and the lesson', () => {
    expect(jobWords(g)).toBe('Light: put the three cards in order, oldest first.');
    expect(jobWords(t)).toBe('Travel: put the six cards in order, oldest first. Their years are on them — BCE years count down to year 1.');
    expect(learnedLine(g)).toBe(`Light: Firelight in caves (about 400,000 BCE) came long before LED lights (1962). ${SET_BY_ID.light.note}`);
  });
});
