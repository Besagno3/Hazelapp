import { describe, it, expect } from 'vitest';
import {
  BAND_TREES,
  FIRST_YEAR,
  JOBS_PER_ROUND,
  LAST_YEAR,
  TREES,
  TREE_BY_ID,
  TREE_CORE,
  TREE_IDS,
  EVENTS,
  countWords,
  dateWords,
  dryWords,
  fitOffset,
  jobFor,
  jobWords,
  learnedLine,
  matchWords,
  matchesAt,
  maxOffset,
  ringWords,
  ringsOf,
  roundQueue,
  thinLinedUp,
  weather,
  wetWords,
  years,
  type CountJob,
  type DateJob,
  type Job,
  type MatchJob,
} from './rings';
import { BANDS, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
const as = <K extends Job['kind']>(job: Job, kind: K) => {
  if (job.kind !== kind) throw new Error(`a ${kind} job`);
  return job as Extract<Job, { kind: K }>;
};

describe('the grove’s weather (docs/DESIGN-MINIGAMES.md §5.7)', () => {
  it('a year is wet, fair or dry — the same for every tree; dry years come now and then, unevenly', () => {
    const all = years(FIRST_YEAR, LAST_YEAR);
    expect(all).toHaveLength(LAST_YEAR - FIRST_YEAR + 1);
    const dry = all.filter((y) => weather(y) === 'dry');
    const wet = all.filter((y) => weather(y) === 'wet');
    expect(dry.length).toBeGreaterThan(10);
    expect(wet.length).toBeGreaterThan(10);
    // Never a dry year straight after a dry one, and the gaps between them aren't all the same.
    const gaps = dry.slice(1).map((y, k) => y - dry[k]);
    expect(Math.min(...gaps)).toBeGreaterThan(1);
    expect(new Set(gaps).size).toBeGreaterThan(4);
  });
});

describe('the trees', () => {
  it('eight, each a true note; Gentle reads four young ones, Medium four, Tricky all eight', () => {
    expect(TREES.map((t) => t.id)).toEqual([...TREE_IDS]);
    for (const t of TREES) {
      expect(t.note.length, t.id).toBeGreaterThan(30);
      expect(t.cut).toBeLessThanOrEqual(LAST_YEAR);
      if (t.scar) expect(t.scar).toBeLessThan(t.cut);
    }
    expect(BAND_TREES.gentle).toHaveLength(4);
    expect(BAND_TREES.medium).toHaveLength(4);
    expect(BAND_TREES.tricky).toEqual(TREE_IDS);
    expect(new Set([...BAND_TREES.gentle, ...BAND_TREES.medium])).toEqual(new Set(TREE_IDS));
  });

  it('trees not in the grove book first; three rounds of Tricky show all eight', () => {
    expect(roundQueue('gentle', () => false, 0).slice(0, 3)).toEqual(['birch', 'willow', 'beech']);
    expect(roundQueue('gentle', (id) => id === 'birch', 0).slice(0, 3)).toEqual(['willow', 'beech', 'rowan']);
    expect(new Set(Array.from({ length: 9 }, (_, k) => jobFor('tricky', Math.floor(k / 3), k % 3).tree)).size).toBe(8);
  });
});

describe('the jobs', () => {
  it('Gentle: a young tree’s slice, its rings its age (4–8) every round — code review round 1; a wet year to find', () => {
    for (const j of jobs('gentle')) {
      const job = as(j, 'count');
      const tree = TREE_BY_ID[job.tree];
      expect(job.rings).toHaveLength(tree.age!);
      expect(job.rings[job.rings.length - 1]).toBe(tree.cut);
      expect(ringsOf(job.rings, 'wet').length).toBeGreaterThan(0);
    }
    expect(BAND_TREES.gentle.map((id) => TREE_BY_ID[id].age)).toEqual([4, 6, 8, 5]);
    // Rowan's two wet years are as wide as each other: either is the widest.
    expect(ringsOf(jobs('gentle').find((j) => j.tree === 'rowan')!.rings, 'wet')).toEqual([2001, 2003]);
  });

  it('Medium dates cores of 10–14 rings: the year to find is inside, the same year for an event in every tree; dry years; the fires show', () => {
    const all = jobs('medium', 12).map((j) => as(j, 'date'));
    for (const job of all) {
      expect([10, 12, 14]).toContain(job.rings.length);
      const k = job.rings.indexOf(job.event.year);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThan(job.rings.length - 1);
      expect(ringsOf(job.rings, 'dry').length).toBeGreaterThan(1);
      expect(EVENTS.find((e) => e.what === job.event.what)?.year).toBe(job.event.year);
    }
    // Every event comes up, and every fire's scar is in a core.
    expect(new Set(all.map((j) => j.event.what)).size).toBe(EVENTS.length);
    for (const t of TREES.filter((x) => x.scar && BAND_TREES.medium.includes(x.id))) expect(all.some((j) => j.tree === t.id && j.rings.includes(t.scar!)), t.id).toBe(true);
  });

  it('Tricky: wherever a beam can come from, it fits in one place only, inside the tree’s core, never at an end', () => {
    const core = years(LAST_YEAR - TREE_CORE + 1, LAST_YEAR);
    for (const n of [8, 9, 10]) {
      // Every start `jobFor` can give (code review round 1: twelve rounds missed some).
      for (let s = 1; s <= TREE_CORE - n - 2; s++) {
        const job: MatchJob = { kind: 'match', tree: 'oak', rings: core, beam: years(core[s], core[s] + n - 1), building: 'the barn' };
        const fit = fitOffset(job);
        expect(fit).toBeGreaterThan(0);
        expect(fit).toBeLessThan(maxOffset(job));
        const fits = Array.from({ length: maxOffset(job) + 1 }, (_, o) => o).filter((o) => matchesAt(job, o));
        expect(fits, `${n} from ${core[s]}`).toEqual([fit]);
        expect(ringsOf(job.beam, 'dry').length).toBeGreaterThan(0);
      }
    }
    for (const j of jobs('tricky', 12)) {
      const job = as(j, 'match');
      expect(job.rings).toEqual(core);
      expect(matchesAt(job, fitOffset(job))).toBe(true);
    }
  });
});

describe('the words', () => {
  const g = as(jobFor('gentle', 0, 0), 'count'); // Silver Birch, 2016–2019
  const m = as(jobFor('medium', 0, 1), 'date') as DateJob;
  const t = as(jobFor('tricky', 0, 0), 'match') as MatchJob;

  it('a ring said; the tickets', () => {
    expect(g.rings).toEqual([2016, 2017, 2018, 2019]);
    expect(ringWords(1, 2017)).toBe('The second ring from the middle, thin');
    expect(ringWords(3, 2019)).toBe('The fourth ring from the middle, wide');
    expect(ringWords(0, 2016, false)).toBe('The first ring from the middle');
    expect(jobWords(g)).toBe('A slice from a young birch the wind blew down by the brook. Count its rings from the middle out — one ring, one year — then find its wettest year.');
    expect(jobWords(m)).toMatch(/^A core from .+, (cut|taken) in \d{4}\. Find the ring from \d{4}, when .+ — then every dry year\.$/);
    // A living tree's core — not the fallen one's (code review round 1).
    expect(jobWords(t)).toBe(`A beam from ${t.building}, and a core from a living silver birch in the grove. Slide the beam till its rings match the tree’s: when was the beam’s tree cut?`);
  });

  it('counting from the middle out, kindly', () => {
    expect(countWords(0, 0, 4)).toBe('One!');
    expect(countWords(2, 2, 4)).toBe('Three!');
    expect(countWords(3, 3, 4)).toBe('Four! That’s the bark — four rings, so the tree was four years old.');
    expect(countWords(2, 1, 4)).toBe('That one’s counted already — the next is just outside it.');
    expect(countWords(3, 0, 4)).toBe('That one’s counted already — count on from three: the fourth ring.');
    expect(countWords(1, 3, 4)).toBe('Count from the middle out: the next ring is the second, just outside the last one counted.');
    expect(countWords(0, 2, 4)).toBe('Count from the middle out: start with the first ring, right by the middle.');
  });

  it('the wet year, a date, the dry years, the match', () => {
    expect(wetWords(g as CountJob, 3)).toBe('Yes — the widest ring: 2019 was a wet year, so the tree grew a lot.');
    expect(wetWords(g as CountJob, 1)).toBe('That ring is thin — a dry year, when the tree hardly grew. The wet year’s ring is the widest.');
    expect(wetWords(g as CountJob, 0)).toBe('That one’s medium — not the widest. The wet year’s ring is the widest of all.');
    const rowan = as(jobs('gentle').find((j) => j.tree === 'rowan')!, 'count');
    expect(wetWords(rowan, rowan.rings.indexOf(2003))).toBe('Yes — one of the widest rings: 2003 was a wet year, so the tree grew a lot.');
    const k = m.rings.indexOf(m.event.year);
    const bark = m.rings[m.rings.length - 1];
    expect(dateWords(m, k)).toMatch(new RegExp(`^Yes — ${m.event.year}: [a-z]+ rings in from the bark, the year ${m.event.what}\\.$`));
    expect(dateWords(m, k + 1)).toBe(`That ring is ${m.event.year + 1}: the bark ring is ${bark}, and each ring in is a year earlier. ${m.event.year} is further in.`);
    expect(dateWords(m, k - 1)).toMatch(/is further out\.$/);
    const dry = ringsOf(m.rings, 'dry');
    expect(dryWords(m, m.rings.indexOf(dry[0]), 1)).toBe(`${dry[0]} — a dry year! One more to find.`);
    expect(dryWords(m, m.rings.indexOf(dry[0]), 0)).toBe(`${dry[0]} — and that’s every dry year!`);
    const fair = m.rings.find((y) => weather(y) !== 'dry')!;
    expect(dryWords(m, m.rings.indexOf(fair), 1)).toBe(`${fair}’s ring isn’t thin — not a dry year. Look for the narrowest rings.`);
    const end = t.beam[t.beam.length - 1];
    expect(matchWords(t, fitOffset(t))).toBe(`They match! The beam’s rings run from ${t.beam[0]} to ${end}, so its tree was cut in ${end} — and ${t.building} was built soon after.`);
    // Not yet: the thin rings first — or, lined up, the wide ones too (UX review round 1: the hint said only thin).
    const away = Array.from({ length: maxOffset(t) + 1 }, (_, o) => o).filter((o) => o !== fitOffset(t));
    const lined = away.find((o) => thinLinedUp(t, o));
    const not = away.find((o) => !thinLinedUp(t, o))!;
    expect(matchWords(t, not)).toBe('Not yet — find the thin dark rings first: slide till the beam’s sit right under the tree’s.');
    if (lined !== undefined) expect(matchWords(t, lined)).toBe('The thin rings line up here — but not the wide ones. Slide on: thin under thin, wide under wide!');
    // Somewhere in Tricky, the thin rings line up where the beam doesn't fit.
    expect(jobs('tricky').some((j) => Array.from({ length: maxOffset(j as MatchJob) + 1 }, (_, o) => o).some((o) => o !== fitOffset(j as MatchJob) && thinLinedUp(j as MatchJob, o)))).toBe(true);
  });

  it('the lessons', () => {
    expect(learnedLine(g)).toBe(`Silver Birch: four rings, four years. Its widest ring is 2019, a wet year. ${TREE_BY_ID.birch.note}`);
    // Two as wide as each other: both named (code review round 1: the first was, whichever was picked).
    const rowan = jobs('gentle').find((j) => j.tree === 'rowan')!;
    expect(learnedLine(rowan)).toBe(`Rowan: five rings, five years. Its widest rings, 2001 and 2003, were wet years. ${TREE_BY_ID.rowan.note}`);
    const md = ringsOf(m.rings, 'dry');
    expect(learnedLine(m)).toContain(`its thin rings were dry years — ${md.length > 1 ? `${md.slice(0, -1).join(', ')} and ${md[md.length - 1]}` : md[0]}.`);
    const pine = jobs('medium').find((j) => j.tree === 'pine') as DateJob;
    expect(learnedLine(pine)).toContain('The dark scar on 2013’s ring is a fire it lived through.');
    const end = t.beam[t.beam.length - 1];
    expect(learnedLine(t)).toBe(`Matching rings dates wood: the beam’s rings matched the living silver birch’s from ${t.beam[0]} to ${end}, so its tree was cut in ${end}. ${TREE_BY_ID[t.tree].note}`);
  });
});

describe('every band', () => {
  it('three jobs a round, of its kind', () => {
    const kind: Record<Band, Job['kind']> = { gentle: 'count', medium: 'date', tricky: 'match' };
    for (const band of BANDS) expect(new Set(jobs(band).map((j) => j.kind))).toEqual(new Set([kind[band]]));
  });
});
