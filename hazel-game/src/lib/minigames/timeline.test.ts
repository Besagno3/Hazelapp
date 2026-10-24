import { describe, it, expect } from 'vitest';
import {
  BCE_WORDS,
  CENTURY_UP_TO,
  MIN_GAP,
  SETS,
  SET_BY_ID,
  SET_IDS,
  JOBS_PER_ROUND,
  byCentury,
  cardDate,
  centuryOf,
  centuryTip,
  centuryWords,
  centuryYears,
  check,
  checkWords,
  clueFor,
  deal,
  jobFor,
  jobWords,
  learnedLine,
  roundQueue,
  spanAsk,
  spanChoices,
  spanFor,
  spanRight,
  spanWords,
  EXPERT_FIRST,
  whenWords,
  yearsApart,
  yearWords,
  type Job,
} from './timeline';
import { BANDS, type Band } from '../../content/minigames';

const jobs = (band: Band | 'expert', rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
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
    const text = SETS.flatMap((s) => [s.name, s.note, s.led, ...s.events.flatMap((ev) => [ev.name, ev.said, ev.why])]).join(' ').toLowerCase();
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

describe('Expert (docs/DESIGN-MINIGAMES.md §8.5): centuries, years across BCE and CE, what led to what', () => {
  const card = (job: Job) => job.events.map((ev) => cardDate(job, ev));

  it('a century said, and its years: the 1st is 1 to 100, the 19th 1801 to 1900; BCE counts down, 400 to 301 BCE the 4th', () => {
    expect([1, 100, 101, 1440, 1900, 1901, 2010].map(centuryOf)).toEqual([1, 1, 2, 15, 19, 20, 21]);
    expect([-1, -100, -101, -312, -2560].map(centuryOf)).toEqual([1, 1, 2, 4, 26]);
    expect(centuryWords(1440)).toBe('the 15th century');
    expect(centuryWords(-312)).toBe('the 4th century BCE');
    expect(centuryWords(2010, true)).toBe('21st century');
    expect([105, 250, 1050, 1150, 1250, 2150, 2250, -1050, -2250].map((y) => centuryWords(y, true))).toEqual([
      '2nd century',
      '3rd century',
      '11th century',
      '12th century',
      '13th century',
      '22nd century',
      '23rd century',
      '11th century BCE',
      '23rd century BCE',
    ]);
    expect(centuryYears(1816)).toBe('1801 to 1900');
    expect(centuryYears(50)).toBe('1 to 100');
    expect(centuryYears(-312)).toBe('400 to 301 BCE');
    expect(centuryYears(-50)).toBe('100 to 1 BCE');
  });

  it('every drawer all seven, dated; a card gives its century where no other card is in it — not the Stone Age’s, nor a whole hundred CE', () => {
    for (const job of jobs('expert', 16)) {
      expect(job.events, job.set).toBe(SET_BY_ID[job.set].events);
      expect(job.years).toBe(true);
      expect([...job.dealt].sort()).toEqual(job.events.map((ev) => ev.id).sort());
      expect(longestRun(at(job, job.dealt)), job.set).toBeLessThanOrEqual(3);
      for (const ev of job.events) {
        const shared = job.events.some((o) => o !== ev && Math.sign(o.year) === Math.sign(ev.year) && centuryOf(o.year) === centuryOf(ev.year));
        expect(byCentury(job, ev), `${job.set} ${ev.id}`).toBe(!shared && Math.abs(ev.year) < CENTURY_UP_TO && !(ev.year > 0 && ev.year % 100 === 0));
      }
    }
    const medicine = jobFor('expert', 0, 0, ['medicine']);
    expect(card(medicine)).toEqual(['15th century BCE', '13th century', '16th century', '18th century', '1816', '1895', '20th century']);
    expect(card(jobFor('expert', 0, 0, ['buildings']))).toEqual(['about 9000 BCE', '26th century BCE', '4th century BCE', '1885', '1889', '20th century', '21st century']);
    // The piano, about 1700: the card says so (is 1700 the 17th century or the 18th?).
    expect(card(jobFor('expert', 0, 0, ['music']))).toEqual(['about 38,000 BCE', '25th century BCE', 'about 1700', '19th century', '1920', '1963', '1993']);
    // Every set has a century card or more.
    for (const s of SETS) expect(s.events.some((ev) => byCentury(jobFor('expert', 0, 0, [s.id]), ev)), s.id).toBe(true);
    // The younger bands' cards as they were.
    const t = jobFor('tricky', 0, 0);
    expect(card(t)).toEqual(t.events.map(yearWords));
  });

  it('the order can always be told from the cards: each card’s years — its century’s, or its year — wholly before the next’s', () => {
    const span = (ev: Job['events'][number], job: Job): [number, number] => {
      if (!byCentury(job, ev)) return [ev.year, ev.year];
      const n = centuryOf(ev.year);
      return ev.year < 0 ? [-n * 100, -(n - 1) * 100 - 1] : [(n - 1) * 100 + 1, n * 100];
    };
    for (const s of SETS) {
      const job = jobFor('expert', 0, 0, [s.id]);
      for (let k = 1; k < 7; k++) expect(span(job.events[k - 1], job)[1], `${s.id} ${job.events[k].id}`).toBeLessThan(span(job.events[k], job)[0]);
    }
  });

  it('how many years: from a BCE card dated in centuries to a CE card, no year 0 — another pair as a set comes round', () => {
    for (const job of jobs('expert', 16)) {
      const { from, to } = job.expert!.span;
      expect(job.events).toContain(from);
      expect(job.events).toContain(to);
      expect(from.year, job.set).toBeLessThan(0);
      expect(-from.year).toBeLessThan(CENTURY_UP_TO);
      expect(to.year).toBeGreaterThan(0);
      expect(spanRight(job)).toBe(to.year - from.year - 1);
      // Three pairs a year apart: the answer and the year 0 counted, a hundred out and that with the year 0, the years
      // taken away and one more — six, none the same, all years.
      const right = spanRight(job);
      const slip = job.expert!.seed % 2 ? right + 100 : right - 100;
      const away = Math.abs(to.year + from.year);
      const c = spanChoices(job);
      expect([...c].sort((a, b) => a - b)).toEqual([right, right + 1, slip, slip + 1, away, away + 1].sort((a, b) => a - b));
      expect(new Set(c).size).toBe(6);
      expect(Math.min(...c)).toBeGreaterThan(0);
      // Nothing but the sum finds it (code and UX review round 2: it was the smaller of the only two a year apart): three
      // are the smaller of a pair, and four share their last two digits with another.
      expect(c.filter((x) => c.includes(x + 1))).toHaveLength(3);
      expect(c.filter((x) => c.includes(x + 1))).toContain(right);
      expect(c.filter((x) => c.some((y) => y !== x && y % 100 === x % 100))).toContain(right);
    }
    // Where the answer is moves (UX review round 1: sorted, it was always the middle of three) — every place over 16 rounds,
    // none more than a third of the time; and in each drawer of a round (code review round 2: last in every odd round's first).
    const all = jobs('expert', 16);
    const places = all.map((job) => spanChoices(job).indexOf(spanRight(job)));
    expect(new Set(places)).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    for (const k of [0, 1, 2, 3, 4, 5]) expect(places.filter((x) => x === k).length, `${k}`).toBeLessThanOrEqual(places.length / 3);
    for (const slot of [0, 1, 2]) {
      const mine = places.filter((_, n) => n % JOBS_PER_ROUND === slot);
      expect(new Set(mine).size, `drawer ${slot + 1}`).toBeGreaterThanOrEqual(4);
      expect(new Set(mine.filter((_, r) => r % 2)).size, `drawer ${slot + 1}, odd rounds`).toBeGreaterThan(1);
    }
    expect(jobFor('expert', 2, 1).expert!.seed).toBe(2 * JOBS_PER_ROUND + 1 + 1);
    // Buildings has two BCE cards in centuries, and both come up; every set's CE end turns.
    for (const s of SETS) {
      const pairs = new Set(Array.from({ length: 8 }, (_, r) => spanFor(s, r, 0)).map((p) => `${p.from.id}-${p.to.id}`));
      expect(pairs.size, s.id).toBeGreaterThanOrEqual(4);
    }
    expect(new Set(Array.from({ length: 8 }, (_, r) => spanFor(SET_BY_ID.buildings, r, 0).from.id))).toEqual(new Set(['pyramid', 'aqueduct']));
    // The drawer's place in the round turns the pair too (code review round 2: untested).
    expect(spanFor(SET_BY_ID.buildings, 0, 1).from.id).not.toBe(spanFor(SET_BY_ID.buildings, 0, 0).from.id);
    expect(spanFor(SET_BY_ID.food, 2, 1)).toEqual(spanFor(SET_BY_ID.food, 3, 0));
    expect(jobFor('tricky', 0, 0).expert).toBeUndefined();
    expect(spanChoices(jobFor('tricky', 0, 0))).toEqual([]);
  });

  it('the question, the method and what’s wrong with a wrong one', () => {
    const job = jobFor('expert', 0, 0, ['light']); // candles to gas street lamps
    // Candles are about 500 BCE: the year taken as it is (UX review round 1: "about", and the answer to the year).
    expect(spanAsk(job)).toBe('Say candles came in 500 BCE and gas street lamps in 1807: how many years from one to the other?');
    expect(job.expert!.seed).toBe(1);
    expect([...spanChoices(job)].sort((a, b) => a - b)).toEqual([1307, 1308, 2306, 2307, 2406, 2407]);
    expect(spanWords(job, 2306)).toBe('500 + 1807 = 2,307, less 1 — there’s no year 0, as 1 BCE is followed by 1 CE: 2,306 years.');
    expect(spanWords(job, 2307)).toBe('Not 2,307: there’s no year 0 — 1 BCE is followed by 1 CE, so take 1.');
    expect(spanWords(job, 2406)).toBe('Not 2,406: add 500 BCE and 1807 again, carefully — then take 1.');
    expect(spanWords(job, 2407)).toBe('Not 2,407: add 500 BCE and 1807 again — and there’s no year 0, so take 1.');
    // Short: the two years are in the ask (UX review round 2: three lines at 667 × 375, and the answers moved).
    expect(spanWords(job, 1307)).toBe('Not 1,307: BCE years count back, so the two years add up — then take 1.');
    expect(spanWords(job, 1308)).toBe(spanWords(job, 1307).replace('1,307', '1,308'));
    // An "about" CE year, and a first card in CE: each said as it is (code review round 2: no set has them today).
    const [b, c] = [SET_BY_ID.light.events[1], SET_BY_ID.light.events[4]];
    const made = { ...job, expert: { span: { from: { ...b, about: false }, to: { ...c, about: true } }, seed: 1 } };
    expect(spanAsk(made)).toMatch(/^Say /);
    const ce = { ...job, events: job.events.filter((ev) => ev.year > 0) };
    expect(clueFor(ce, ce.events.map((_, k) => k > 0))).toMatch(/is the earliest of these dates\.$/);
    // Two years as they are: asked as they are.
    expect(spanAsk(jobFor('expert', 1, 0, ['buildings']))).toBe('From Roman aqueducts (312 BCE) to the Eiffel Tower (1889): how many years?');
    // A CE year under 1000 says so; the card's "about" left out of the sum; an even seed's slip a hundred under.
    const w = { ...job, set: 'writing' as const, events: SET_BY_ID.writing.events, expert: { span: { from: SET_BY_ID.writing.events[1], to: SET_BY_ID.writing.events[2] }, seed: 2 } };
    expect(spanAsk(w)).toBe('Say writing on clay came in 3200 BCE and paper in 105 CE: how many years from one to the other?');
    expect(spanRight(w)).toBe(3304);
    expect(spanChoices(w)).toContain(3204);
    expect(spanWords(w, 3204)).toBe('Not 3,204: add 3200 BCE and 105 CE again, carefully — then take 1.');
  });

  it('a new teen’s first round starts with Writing — three CE centuries to place (UX review round 1: Light and Travel had none)', () => {
    expect(roundQueue(() => false, 0, 'expert')[0]).toBe(EXPERT_FIRST);
    expect(EXPERT_FIRST).toBe('writing');
    expect(jobFor('expert', 0, 0).set).toBe('writing');
    const w = jobFor('expert', 0, 0);
    expect(w.events.filter((ev) => ev.year > 0 && byCentury(w, ev)).length).toBeGreaterThanOrEqual(3);
    // The younger bands as they were; pages known still come last.
    expect(roundQueue(() => false, 0)[0]).toBe('light');
    expect(roundQueue((id) => id === 'writing', 0, 'expert').at(-1)).toBe('writing');
  });

  it('a century’s card told apart by its era (code review round 1: 150 BCE and 105 CE are both the 2nd), and Expert dates in years from 5000 BCE (pinned)', () => {
    const base = jobFor('expert', 0, 0, ['writing']);
    const [a, b] = SET_BY_ID.writing.events;
    const made = { ...base, events: [{ ...a, year: -150 }, { ...b, year: 105 }] };
    expect(made.events.map((ev) => byCentury(made, ev))).toEqual([true, true]);
    expect(made.events.map((ev) => cardDate(made, ev))).toEqual(['2nd century BCE', '2nd century']);
    expect(CENTURY_UP_TO).toBe(5000);
    // Food's bread, about 4000 BCE, by its century; farming, about 10,000 BCE, by its year.
    expect(card(jobFor('expert', 0, 0, ['food']))).toEqual(['about 10,000 BCE', '40th century BCE', '15th century BCE', '19th century', '1913', '1928', '1947']);
  });

  it('plainly (§8.3): the check, the clue with a century’s years, the ticket and the lesson — what led to what, and the years', () => {
    const job = jobFor('expert', 0, 0, ['medicine']);
    const ids = job.events.map((ev) => ev.id);
    expect(checkWords(job, ids.map(() => true))).toBe('All in order. Willow bark for aches first, penicillin last.');
    // The stethoscope and the 18th century's vaccine swapped: the clue gives the century's years.
    const swapped = [...ids.slice(0, 3), ids[4], ids[3], ...ids.slice(5)];
    expect(checkWords(job, check(job, swapped))).toBe('Six in order. After the microscope came the first vaccine — the 18th century is the years 1701 to 1800.');
    // The oldest: its century's years.
    expect(clueFor(job, [false, true, true, true, true, true, true])).toBe('Oldest of these: willow bark for aches — the 15th century BCE is the years 1500 to 1401 BCE.');
    // Two year cards: the two dates, plainly (code review round 1: Tricky's words, a young kid's).
    expect(clueFor(job, [true, true, true, true, true, false, true])).toBe('After the stethoscope came X-ray pictures — 1816 is before 1895.');
    // From a BCE century to a CE year: how BCE and CE count, not the BCE century's years (code and UX review round 1).
    const light = jobFor('expert', 0, 0, ['light']);
    expect(clueFor(light, [true, true, true, false, true, true, true])).toBe('After candles came gas street lamps — BCE years come before year 1, CE years after it.');
    // The card before's century, in its era: what the year after it is past (code review round 1: untested).
    const flight = jobFor('expert', 0, 0, ['flight']);
    expect(cardDate(flight, flight.events[2])).toBe('19th century');
    expect(clueFor(flight, [true, true, true, false, true, true, true])).toBe('After the glider with a pilot came the first aeroplane — the 19th century is the years 1801 to 1900.');
    // Two BCE years: which way they run.
    expect(clueFor(light, [true, false, true, true, true, true, true])).toBe('After firelight in caves came stone oil lamps — in BCE, a bigger year is longer ago.');
    // No card's young words on Expert (UX review round 1: "riders pushed with their feet!").
    for (const s of SETS) {
      const j = jobFor('expert', 0, 0, [s.id]);
      for (let k = 0; k < 7; k++) expect(clueFor(j, j.events.map((_, x) => x !== k)), `${s.id} ${k}`).not.toMatch(/!/);
    }
    expect(checkWords(job, ids.map(() => false))).toMatch(/^Not yet\. /);
    expect(centuryTip(job)).toBe('The 15th century BCE is the years 1500 to 1401 BCE.');
    expect(jobWords(job)).toBe(
      'Medicine: put the seven cards in order, oldest first. A card gives its century where that’s enough to place it, else its year. The 15th century BCE is the years 1500 to 1401 BCE. Then: how many years from one to another?',
    );
    const { from, to } = job.expert!.span;
    expect(learnedLine(job)).toBe(`${SET_BY_ID.medicine.led} From ${yearWords({ ...from, about: false })} to ${yearWords({ ...to, about: false })} is ${spanRight(job).toLocaleString('en-GB')} years: there’s no year 0.`);
    expect(learnedLine(job)).not.toMatch(/!/);
    // Every set's what-led-to-what names one of its own cards' years or more, and every year it names is one of its cards'
    // (code review round 1: the comment said two, and a year not on a card wasn't caught).
    for (const s of SETS) {
      const years = s.events.map((ev) => (Math.abs(ev.year) < 10000 ? String(Math.abs(ev.year)) : Math.abs(ev.year).toLocaleString('en-GB')));
      expect(years.filter((y) => s.led.includes(`(${y})`) || s.led.includes(`(about ${y}`)).length, s.id).toBeGreaterThanOrEqual(1);
      for (const m of s.led.matchAll(/\((?:about )?([\d,]+)( BCE)?\)/g)) {
        const named = Number(m[1].replace(/,/g, '')) * (m[2] ? -1 : 1);
        expect(s.events.map((ev) => ev.year), `${s.id} ${m[0]}`).toContain(named);
      }
      expect(s.led, s.id).not.toMatch(/!/);
    }
    // Only what holds (code review round 1): the Burj Khalifa stands on concrete walls; arc lamps came before the bulb.
    expect(SET_BY_ID.buildings.led).toMatch(/up to the Burj Khalifa \(2010\), needs lifts\.$/);
    expect(SET_BY_ID.light.led).toMatch(/^Every light on these cards before the electric bulb/);
  });
});
