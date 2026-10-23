import { describe, it, expect } from 'vitest';
import { BCE_WORDS, MIN_GAP, SETS, SET_BY_ID, SET_IDS, JOBS_PER_ROUND, check, checkWords, clueFor, jobFor, jobWords, learnedLine, roundQueue, whenWords, yearWords, type Job } from './timeline';
import { BANDS, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

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
        // At most a third where they go (code review round 1: some were a swap from done).
        expect(job.dealt.filter((id, k) => id === job.events[k].id).length, `${band} ${job.set}`).toBeLessThanOrEqual(Math.floor(job.events.length / 3));
      }
    }
  });

  it('with no years on the cards (Gentle, Medium), two side by side are at least MIN_GAP years apart — code review round 1', () => {
    expect(MIN_GAP).toBe(30);
    for (const band of ['gentle', 'medium'] as const)
      for (const job of jobs(band, 16)) for (let k = 1; k < job.events.length; k++) expect(job.events[k].year - job.events[k - 1].year, `${band} ${job.set} ${job.events[k].id}`).toBeGreaterThanOrEqual(MIN_GAP);
    // Medium's three a round are different picks of a set.
    for (const s of SETS) {
      const picks = new Set([0, 1, 2].map((i) => jobFor('medium', 0, i, [s.id]).events.map((ev) => ev.id).join()));
      expect(picks.size, s.id).toBe(3);
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

  it('a check: which places are right; all right, or how many and the clue', () => {
    expect(g.events.map((ev) => ev.id)).toEqual(['fire', 'gas-lamp', 'led']);
    expect(check(g, ['fire', 'gas-lamp', 'led'])).toEqual([true, true, true]);
    expect(checkWords(g, [true, true, true], ['fire', 'gas-lamp', 'led'])).toBe('All in order! Firelight in caves first, the first LED light last.');
    const placed = ['fire', 'led', 'gas-lamp'];
    const right = check(g, placed);
    expect(right).toEqual([true, false, false]);
    expect(checkWords(g, right, placed)).toBe('One in the right place! After firelight in caves came gas street lamps — lighting a whole street took gas pipes under the roads.');
    // All the wrong way round: the oldest (code review round 1: that clue was never reached).
    expect(checkWords(g, check(g, ['led', 'gas-lamp', 'fire']), ['led', 'gas-lamp', 'fire'])).toBe('One in the right place! Oldest of these: firelight in caves — people have lit the dark with fire for hundreds of thousands of years.');
  });

  it('the clue: the first place that’s wrong, and the card that goes there — naming only cards dealt, for every arrangement', () => {
    expect(t.set).toBe('travel');
    const ids = t.events.map((ev) => ev.id);
    // On Tricky, BCE years counted down; and into CE.
    expect(clueFor(t, [ids[0], ids[2], ids[1], ...ids.slice(3)])).toBe('After dugout canoes came the wheel — in BCE, a bigger year is longer ago.');
    expect(clueFor(t, [ids[0], ids[1], ids[3], ids[2], ...ids.slice(4)])).toBe('After the wheel came the steam train — BCE years come before year 1, CE years after it.');
    expect(clueFor(t, ids)).toBe('');
    // Every way a band's cards can go, for a round's jobs: only cards dealt are named.
    const perms = <T,>(xs: readonly T[]): T[][] => (xs.length < 2 ? [[...xs]] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const others = (job: Job) => SET_BY_ID[job.set].events.filter((ev) => !job.events.includes(ev));
    for (const band of ['gentle', 'medium'] as const)
      for (const job of jobs(band, 3))
        for (const p of perms(job.events.map((ev) => ev.id))) {
          const words = checkWords(job, check(job, p), p).toLowerCase();
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
