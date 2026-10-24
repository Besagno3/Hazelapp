import { describe, it, expect } from 'vitest';
import { BCE_WORDS, MIN_GAP, SETS, SET_BY_ID, SET_IDS, JOBS_PER_ROUND, check, checkWords, clueFor, deal, jobFor, jobWords, learnedLine, roundQueue, whenWords, yearsApart, yearWords, type Job } from './timeline';
import { BANDS, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
/** The longest run going up, by brute force. */
const longestRun = (xs: readonly number[]): number => {
  let best = 0;
  for (let mask = 1; mask < 1 << xs.length; mask++) {
    const ys = xs.filter((_, k) => (mask >> k) & 1);
    if (ys.every((y, j) => j === 0 || y > ys[j - 1])) best = Math.max(best, ys.length);
  }
  return best;
};
const at = (job: Job, ids: readonly string[]) => ids.map((id) => job.events.findIndex((ev) => ev.id === id));

describe('the timeline sets (docs/DESIGN-MINIGAMES.md §5.8)', () => {
  it('eight sets of seven, oldest first, no two at once; each event a hint and a page note', () => {
    expect(SETS.map((s) => s.id)).toEqual([...SET_IDS]);
    for (const s of SETS) {
      expect(s.events, s.id).toHaveLength(7);
      for (let k = 1; k < 7; k++) expect(s.events[k].year, `${s.id} ${s.events[k].id}`).toBeGreaterThan(s.events[k - 1].year);
      for (const ev of s.events) {
        expect(ev.why.length, ev.id).toBeGreaterThan(15);
        // A clue names no other card (code review round 1: each named the card before it in the set, often not dealt).
        for (const other of s.events) if (other !== ev) expect(ev.why.toLowerCase(), `${ev.id} names ${other.id}`).not.toContain(other.name.toLowerCase());
      }
      expect(s.note.length).toBeGreaterThan(30);
    }
    expect(new Set(SETS.flatMap((s) => s.events.map((ev) => `${s.id}:${ev.id}`))).size).toBe(56);
  });

  it('no wars, disasters or religion — in any card, clue or note (a product rule)', () => {
    const text = SETS.flatMap((s) => [s.name, s.note, ...s.events.flatMap((ev) => [ev.name, ev.said, ev.why])]).join(' ').toLowerCase();
    for (const word of ['war', 'battle', 'army', 'soldier', 'weapon', 'flood', 'earthquake', 'fire destroyed', 'plague', 'god', 'temple', 'church', 'religio', 'pray'])
      expect(text, word).not.toMatch(new RegExp(`\\b${word}`));
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
  it('Gentle 3–4 cards, Medium five, Tricky 6–7 with years; each a set’s events, oldest first; dealt well out of order', () => {
    const sizes: Record<Band, number[]> = { gentle: [3, 4], medium: [5], tricky: [6, 7] };
    for (const band of BANDS) {
      for (const job of jobs(band, 16)) {
        expect(sizes[band]).toContain(job.events.length);
        expect(job.years).toBe(band === 'tricky');
        for (let k = 1; k < job.events.length; k++) expect(job.events[k].year).toBeGreaterThan(job.events[k - 1].year);
        expect([...job.dealt].sort()).toEqual(job.events.map((ev) => ev.id).sort());
        // At most a third where they go, none of three (code review rounds 1 and 2: some were a swap from done); no run in
        // order longer than half, so tapping them as they lie leaves most to do.
        const n = job.events.length;
        expect(job.dealt.filter((id, k) => id === job.events[k].id).length, `${band} ${job.set}`).toBeLessThanOrEqual(n <= 3 ? 0 : Math.floor(n / 3));
        expect(longestRun(at(job, job.dealt)), `${band} ${job.set}`).toBeLessThanOrEqual(Math.max(2, Math.floor(n / 2)));
      }
    }
  });

  it('a deal with no shuffle that does: the other way round, none in its place (code review round 2)', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      const ids = SET_BY_ID.light.events.slice(0, n).map((ev) => ev.id);
      const out = deal(ids, 1, 0);
      expect([...out].sort()).toEqual([...ids].sort());
      const where = out.map((id) => ids.indexOf(id));
      expect(where.filter((x, k) => x === k), `${n}`).toEqual([]);
      expect(longestRun(where), `${n}`).toBeLessThanOrEqual(2);
    }
  });

  it('with no years on the cards (Gentle, Medium), two side by side are at least MIN_GAP years apart — code review round 1', () => {
    expect(MIN_GAP).toBe(30);
    expect(yearsApart(SET_BY_ID.writing.events[1], SET_BY_ID.writing.events[2])).toBe(3304); // 3200 BCE to 105 CE: no year 0
    for (const band of ['gentle', 'medium'] as const)
      for (const job of jobs(band, 16)) for (let k = 1; k < job.events.length; k++) expect(yearsApart(job.events[k - 1], job.events[k]), `${band} ${job.set} ${job.events[k].id}`).toBeGreaterThanOrEqual(MIN_GAP);
    // A set's three picks for Medium differ.
    for (const s of SETS) {
      const picks = new Set([0, 1, 2].map((i) => jobFor('medium', 0, i, [s.id]).events.map((ev) => ev.id).join()));
      expect(picks.size, s.id).toBe(3);
    }
  });

  it('Medium runs across the centuries: the set’s oldest always in, two thousand years and more (code review round 2)', () => {
    for (const job of jobs('medium', 16)) {
      expect(job.events[0], job.set).toBe(SET_BY_ID[job.set].events[0]);
      expect(yearsApart(job.events[0], job.events[4]), job.set).toBeGreaterThanOrEqual(2000);
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

  it('a year said, BCE and CE (Tricky); with no years on the cards, “years ago” (UX review round 1: BCE unexplained there)', () => {
    expect(yearWords(SET_BY_ID.light.events[4])).toBe('1879');
    expect(yearWords(SET_BY_ID.light.events[0])).toBe('about 400,000 BCE');
    expect(yearWords(SET_BY_ID.travel.events[1])).toBe('about 3500 BCE');
    expect(yearWords(SET_BY_ID.writing.events[2])).toBe('about 105 CE');
    expect(yearWords(SET_BY_ID.buildings.events[2])).toBe('312 BCE');
    expect(whenWords(SET_BY_ID.light.events[0])).toBe('about 400,000 years ago');
    expect(whenWords(SET_BY_ID.buildings.events[1])).toBe('about 4,600 years ago');
    expect(whenWords(SET_BY_ID.writing.events[2])).toBe('about the year 105');
    expect(whenWords(SET_BY_ID.light.events[4])).toBe('1879');
  });

  it('a check: which places’ cards stay — all, or the longest run in order (each to its own place), and the clue', () => {
    expect(g.events.map((ev) => ev.id)).toEqual(['fire', 'gas-lamp', 'led']);
    expect(check(g, ['fire', 'gas-lamp', 'led'])).toEqual([true, true, true]);
    expect(checkWords(g, [true, true, true])).toBe('All in order! Firelight in caves first, the first LED light last.');
    // Firelight, then the LED: in order, so both stay — the LED to its own place; the gas lamps go in between.
    const stay = check(g, ['fire', 'led', 'gas-lamp']);
    expect(stay).toEqual([true, false, true]);
    expect(checkWords(g, stay)).toBe('Two in order! After firelight in caves came gas street lamps — lighting a whole street took gas pipes under the roads.');
    // All the wrong way round: only the one in its place stays (code review round 1: the oldest's clue was never reached).
    expect(check(g, ['led', 'gas-lamp', 'fire'])).toEqual([false, true, false]);
    expect(checkWords(g, check(g, ['led', 'gas-lamp', 'fire']))).toBe('One in the right place! Oldest of these: firelight in caves — people have lit the dark with fire for hundreds of thousands of years.');
    // Four the wrong way round, none in its place: nothing stays — a lone card isn't moved to show where it goes.
    const w = jobFor('gentle', 0, 2); // Writing: cave paintings, paper, the typewriter, email
    expect(w.set).toBe('writing');
    const back = [...w.events].reverse().map((ev) => ev.id);
    expect(check(w, back)).toEqual([false, false, false, false]);
    expect(checkWords(w, check(w, back))).toBe('Not yet! Oldest of these: cave paintings — pictures on cave walls came long before letters.');
  });

  it('one slip — the oldest put last — keeps the rest in order (UX review round 2: every card went back); a card in its place always stays', () => {
    const ids = t.events.map((ev) => ev.id);
    const stay = check(t, [...ids.slice(1), ids[0]]);
    expect(stay).toEqual([false, true, true, true, true, true]);
    // Tricky's oldest BCE: how BCE years count, at the first place too (code review round 2).
    expect(checkWords(t, stay)).toBe('Five in order! Oldest of these: dugout canoes — in BCE, a bigger year is longer ago.');
    // The wheel and the steam train in their places stay, though the four around them make a longer run in order.
    expect(check(t, [ids[3], ids[4], ids[2], ids[0], ids[1], ids[5]])).toEqual([false, false, true, false, false, true]);
    // The first and third of Tricky's Light swapped: the oldest's clue says how BCE years count (code review round 2).
    const l = jobFor('tricky', 0, 0); // Light, six
    const lids = l.events.map((ev) => ev.id);
    expect(checkWords(l, check(l, [lids[2], lids[1], lids[0], ...lids.slice(3)]))).toBe('Four in order! Oldest of these: firelight in caves — in BCE, a bigger year is longer ago.');
  });

  it('the clue: the first empty place, and the card that goes there — naming only cards dealt, for every arrangement', () => {
    expect(t.set).toBe('travel');
    const ids = t.events.map((ev) => ev.id);
    // On Tricky, BCE years counted down; and into CE.
    expect(clueFor(t, [true, false, true, true, true, true])).toBe('After dugout canoes came the wheel — in BCE, a bigger year is longer ago.');
    expect(clueFor(t, [true, true, false, true, true, true])).toBe('After the wheel came the steam train — BCE years come before year 1, CE years after it.');
    expect(clueFor(t, ids.map(() => true))).toBe('');
    // Every way a band's cards can go, for a round's jobs: only cards dealt are named.
    const perms = <T,>(xs: readonly T[]): T[][] => (xs.length < 2 ? [[...xs]] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const others = (job: Job) => SET_BY_ID[job.set].events.filter((ev) => !job.events.includes(ev));
    for (const band of ['gentle', 'medium'] as const)
      for (const job of jobs(band, 3))
        for (const p of perms(job.events.map((ev) => ev.id))) {
          const stay = check(job, p);
          // Every card already in its place stays.
          p.forEach((id, k) => id === job.events[k].id && expect(stay[k], `${job.set} ${p.join()}`).toBe(true));
          const words = checkWords(job, stay).toLowerCase();
          for (const ev of others(job)) expect(words, `${job.set} ${p.join()} names ${ev.id}`).not.toContain(ev.said.toLowerCase());
        }
  });

  it('the ticket and the lesson', () => {
    expect(jobWords(g)).toBe('Light: put the three cards in order, oldest first.');
    expect(jobWords(t)).toBe(`Travel: put the six cards in order, oldest first. Their years are on them. ${BCE_WORDS}`);
    expect(learnedLine(g)).toBe(`Light: firelight in caves (about 400,000 years ago) came long before the first LED light (1962). ${SET_BY_ID.light.note}`);
    expect(learnedLine(t)).toBe(`Travel: dugout canoes (about 8000 BCE) came long before the bullet train (1964). ${SET_BY_ID.travel.note}`);
  });
});
