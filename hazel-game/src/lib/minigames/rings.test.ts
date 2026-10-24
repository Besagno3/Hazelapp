import { describe, it, expect } from 'vitest';
import {
  BAND_TREES,
  DRY_MM,
  FIRST_YEAR,
  JOBS_PER_ROUND,
  LAST_YEAR,
  TREES,
  TREE_BY_ID,
  TREE_CORE,
  TREE_IDS,
  EVENTS,
  countWords,
  dateAsk,
  dateChoices,
  datedWords,
  dryAsk,
  foundWords,
  wetAsk,
  dateWords,
  dryWords,
  fitOffset,
  jobFor,
  jobWords,
  learnedLine,
  lineUpWords,
  matchWords,
  matchesAt,
  maxOffset,
  rainfall,
  ringMm,
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
  type RainJob,
} from './rings';
import { BANDS, type PlayBand } from '../../content/minigames';

const jobs = (band: PlayBand, rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
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
    expect(countWords(3, 3, 4)).toBe('Four! The last ring, right by the bark — four rings, so the tree was four years old.');
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
    expect(dateWords(m, k + 1)).toBe(`That ring is ${m.event.year + 1}: the ring by the bark is ${bark}, and each ring in is a year earlier. ${m.event.year} is further in.`);
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
    const not = away.find((o) => !thinLinedUp(t, o))!;
    expect(matchWords(t, not)).toBe('Not yet — find the thin dark rings first: slide till the beam’s sit right under the tree’s.');
    // Somewhere in Tricky the thin rings line up where the beam doesn't fit: said so (code review round 2: never asserted).
    const offsets = (j: MatchJob) => Array.from({ length: maxOffset(j) + 1 }, (_, o) => o);
    const lj = jobs('tricky').find((j) => offsets(j as MatchJob).some((o) => o !== fitOffset(j as MatchJob) && thinLinedUp(j as MatchJob, o))) as MatchJob;
    const lined = offsets(lj).find((o) => o !== fitOffset(lj) && thinLinedUp(lj, o))!;
    expect(matchWords(lj, lined)).toBe('The thin rings line up here — but not the wide ones. Slide on: thin under thin, wide under wide!');
  });

  it('as a step starts, what to do next; a dry year found again', () => {
    const rowan = as(jobs('gentle').find((j) => j.tree === 'rowan')!, 'count');
    expect(wetAsk(g)).toBe('Now tap the widest ring — its wettest year!');
    expect(wetAsk(rowan)).toBe('Now tap one of the two widest rings — its wettest years!');
    expect(dryAsk(m)).toBe(`Now find every thin ring: ${['no', 'one', 'two', 'three', 'four'][ringsOf(m.rings, 'dry').length]} dry years!`);
    expect(foundWords(2017, 1)).toBe('2017 is found already — one to go.');
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
    const kind: Record<PlayBand, Job['kind']> = { gentle: 'count', medium: 'date', tricky: 'match', expert: 'rain' };
    for (const band of [...BANDS, 'expert' as const]) expect(new Set(jobs(band).map((j) => j.kind))).toEqual(new Set([kind[band]]));
  });
});

describe('Expert: cross-dating with rainfall (§8.5)', () => {
  it('the grove’s rain follows its weather: a dry year under the dry line, a fair or wet one well over; a ring’s width follows the rain', () => {
    for (const y of years(FIRST_YEAR, LAST_YEAR)) {
      const mm = rainfall(y);
      const g = weather(y);
      if (g === 'dry') expect(mm, `${y}`).toBeLessThan(DRY_MM);
      else expect(mm, `${y}`).toBeGreaterThanOrEqual(DRY_MM + 50);
      if (g === 'wet') expect(mm, `${y}`).toBeGreaterThanOrEqual(820);
      // Thin under 1 mm, medium 1.2–1.7, wide 2 and over — to the tenth.
      const w = ringMm(y);
      expect(Math.round(w * 10) / 10).toBe(w);
      expect(g === 'dry' ? w < 1 : g === 'fair' ? w >= 1.2 && w <= 1.7 : w >= 2).toBe(true);
    }
    // Each year its own amount: not one value a weather.
    expect(new Set(ringsOf(years(FIRST_YEAR, LAST_YEAR), 'dry').map(rainfall)).size).toBeGreaterThan(8);
  });

  it('a beam of 10–12 rings slid along the 30-year record: it fits in one place only, never at an end, and has a dry year; every tree', () => {
    const record = years(LAST_YEAR - TREE_CORE + 1, LAST_YEAR);
    for (const n of [10, 11, 12])
      for (let s = 1; s <= TREE_CORE - n - 2; s++) {
        const job: RainJob = { kind: 'rain', tree: 'oak', rings: record, beam: years(record[s], record[s] + n - 1), building: 'the barn' };
        const fits = Array.from({ length: maxOffset(job) + 1 }, (_, o) => o).filter((o) => matchesAt(job, o));
        expect(fits, `${n} from ${record[s]}`).toEqual([fitOffset(job)]);
        expect(fitOffset(job)).toBeGreaterThan(0);
        expect(fitOffset(job)).toBeLessThan(maxOffset(job));
        expect(ringsOf(job.beam, 'dry').length).toBeGreaterThan(0);
      }
    const all = jobs('expert', 12).map((j) => as(j, 'rain'));
    for (const [k, job] of all.entries()) {
      expect(job.rings).toEqual(record);
      expect(job.beam).toHaveLength([10, 11, 12][k % 3]);
    }
    expect(new Set(all.map((j) => j.tree))).toEqual(new Set(TREE_IDS));
    expect(BAND_TREES.expert).toEqual(TREE_IDS);
  });

  it('lined up, or what’s wrong; the year from four; the ticket and the lesson', () => {
    const job = as(jobFor('expert', 0, 0), 'rain'); // a birch beam, 1996–2005, from the old mill
    expect(job.beam).toEqual(years(1996, 2005));
    expect(job.building).toBe('the old mill');
    expect(lineUpWords(job, fitOffset(job))).toBe('They line up: every thin ring sits under a dry year, every wide one under a wet year.');
    // Thin rings under dry years, a wide one not under a wet year (code review round 1: never reached for this beam): round 4's.
    const later = as(jobFor('expert', 4, 0), 'rain');
    expect(later.beam[0]).toBe(2006);
    expect(thinLinedUp(later, 20)).toBe(true);
    expect(lineUpWords(later, 20)).toBe('The thin rings sit under dry years here, but a wide ring isn’t under a wet year. Slide on.');
    // Under, as the beam's drawn (code review round 1: "over").
    expect(lineUpWords(job, 0)).toBe('Not lined up: a thin ring sits under a year with more than 500 mm of rain. Slide the beam’s thinnest rings under bars below the dry line.');
    expect(dateChoices(job)).toEqual([1996, 2005, 2006, 2007]);
    // How to read it, in the ask (code review round 2: the step's tip never showed).
    expect(dateAsk).toBe('Which year did its last ring grow — the one by the bark? Follow the gold line up to its tick on the record.');
    expect(datedWords(job, 2005)).toBe('Yes — 2005: its last ring sits under 2005 on the record, so its tree was cut in 2005.');
    expect(datedWords(job, 1996)).toBe('1996 is its first ring, nearest the middle of the tree. The last, by the bark, sits under 2005.');
    expect(datedWords(job, 2004)).toBe('Not 2004: the last ring sits under 2005, a year after 2004.');
    expect(datedWords(job, 2007)).toBe('Not 2007: the last ring sits under 2005, 2 years before 2007.');
    // Off a labelled fifth year: how to count from it (UX review round 1: "2015" sat right over a beam ending 2014).
    const r14 = { ...job, beam: years(2005, 2014) };
    expect(datedWords(r14, 2015)).toBe('Not 2015: the last ring sits under 2014, a year before 2015. Count the ticks from 2015, one a year.');
    // The nearest labelled year, either way (code review round 2: only ends on a fifth or a year short were tested).
    expect(datedWords({ ...job, beam: years(2002, 2011) }, 2012)).toBe('Not 2012: the last ring sits under 2011, a year before 2012. Count the ticks from 2010, one a year.');
    expect(datedWords({ ...job, beam: years(2004, 2013) }, 2012)).toMatch(/Count the ticks from 2015, one a year\.$/);
    expect(jobWords(job)).toBe('A silver birch beam from the old mill, its rings measured, and the grove’s rainfall record from 1995. Slide the beam till its thin rings sit under the dry years, then date its last ring.');
    expect(learnedLine(job)).toBe(
      `Cross-dating with rain: the silver birch beam’s thin rings grew in the record’s dry years, 1998 (416 mm) and 2005 (405 mm). Its rings run from 1996 to 2005, so its tree was cut in 2005. ${TREE_BY_ID.birch.note}`,
    );
    // Every beam: four years to pick from, the right one among them, the first ring's too, inside the record; the answer's
    // place among them moves (code and UX review round 1: always the third, the middle of three years in a row).
    const at = new Set<number>();
    for (const j of jobs('expert', 12).map((x) => as(x, 'rain'))) {
      const c = dateChoices(j);
      const end = j.beam[j.beam.length - 1];
      expect(new Set(c).size).toBe(4);
      expect(c).toContain(end);
      expect(c[0]).toBe(j.beam[0]);
      expect(Math.max(...c)).toBeLessThanOrEqual(LAST_YEAR);
      expect(c.slice(1).every((y) => Math.abs(y - end) <= 2)).toBe(true);
      at.add(c.indexOf(end));
    }
    expect([...at].sort()).toEqual([1, 2, 3]);
    // A beam ending the record's last year but one: no year after the record.
    const late = { ...job, beam: years(2014, 2023) };
    expect(Math.max(...dateChoices(late))).toBeLessThanOrEqual(2024);
  });
});
