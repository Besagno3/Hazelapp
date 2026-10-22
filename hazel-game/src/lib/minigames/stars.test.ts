import { describe, it, expect } from 'vitest';
import {
  BAND_PICTURES,
  EXTRA_GAP,
  GUIDE_BOWL,
  JOBS_PER_ROUND,
  PICTURES,
  PICTURE_BY_ID,
  PICTURE_IDS,
  POINTERS,
  POINTER_GUIDE,
  isLine,
  jobFor,
  jobWords,
  joinWords,
  learnedLine,
  lineKey,
  looksWords,
  placeWords,
  pointerArrow,
  roundQueue,
  segmentGap,
  starName,
  turnWords,
  turned,
  type Job,
} from './stars';
import { BANDS, MINIGAMES, type Band } from '../../content/minigames';

const jobs = (band: Band) => Array.from({ length: 27 }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));
/** Every job a kid can meet: each band's rounds, whatever pages are on the chart. */
function everyJob(): Job[] {
  const out: Job[] = [];
  for (const band of BANDS) {
    const can = BAND_PICTURES[band];
    for (let mask = 0; mask < 2 ** can.length; mask += band === 'tricky' ? 7 : 1)
      for (let round = 0; round < 6; round++) {
        const q = roundQueue(band, (id) => !!(mask & (1 << can.indexOf(id))), round);
        for (let i = 0; i < JOBS_PER_ROUND; i++) out.push(jobFor(band, round, i, q));
      }
  }
  return out;
}

/**
 * The real sky (J2000 right ascension and declination, degrees) of three
 * stars per picture, for which way round they go: a picture can be turned
 * (the sky turns through the night) but never mirrored.
 */
const hms = (h: number, m: number) => (h + m / 60) * 15;
const REAL: Record<string, [number, number]> = {
  alnitak: [hms(5, 40.8), -1.94], alnilam: [hms(5, 36.2), -1.2], mintaka: [hms(5, 32), -0.3],
  vega: [hms(18, 36.9), 38.78], deneb: [hms(20, 41.4), 45.28], altair: [hms(19, 50.8), 8.87],
  acrux: [hms(12, 26.6), -63.1], mimosa: [hms(12, 47.7), -59.69], gacrux: [hms(12, 31.2), -57.11], imai: [hms(12, 15.1), -58.75],
  caph: [hms(0, 9.2), 59.15], schedar: [hms(0, 40.5), 56.54], navi: [hms(0, 56.7), 60.72], ruchbah: [hms(1, 25.8), 60.24], segin: [hms(1, 54.4), 63.67],
  dubhe: [hms(11, 3.7), 61.75], merak: [hms(11, 1.8), 56.38], phecda: [hms(11, 53.8), 53.69], megrez: [hms(12, 15.4), 57.03], alkaid: [hms(13, 47.5), 49.31],
  polaris: [hms(2, 31.8), 89.26], yildun: [hms(17, 32.2), 86.59], 'zeta-umi': [hms(15, 44.1), 77.79], kochab: [hms(14, 50.7), 74.16], pherkad: [hms(15, 20.7), 71.83],
  betelgeuse: [hms(5, 55.2), 7.41], bellatrix: [hms(5, 25.1), 6.35], rigel: [hms(5, 14.5), -8.2], saiph: [hms(5, 47.8), -9.67],
  'deneb-c': [hms(20, 41.4), 45.28], gienah: [hms(20, 46.2), 33.97], albireo: [hms(19, 30.7), 27.96], 'delta-cyg': [hms(19, 45), 45.13],
  regulus: [hms(10, 8.4), 11.97], algieba: [hms(10, 20), 19.84], rasalas: [hms(9, 52.8), 26.01], zosma: [hms(11, 14.1), 20.52], denebola: [hms(11, 49.1), 14.57],
};
/** Seen from the ground, does A → B → C turn anticlockwise? */
function realTurn(a: string, b: string, c: string) {
  const unit = ([ra, dec]: [number, number]) => { const r = Math.PI / 180; return [Math.cos(dec * r) * Math.cos(ra * r), Math.cos(dec * r) * Math.sin(ra * r), Math.sin(dec * r)]; };
  const [A, B, C] = [a, b, c].map((id) => unit(REAL[id.replace(/-g$/, '')]));
  const u = B.map((v, i) => v - A[i]);
  const v = C.map((x, i) => x - A[i]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return n[0] * A[0] + n[1] * A[1] + n[2] * A[2] < 0;
}
/** On the screen (y down), does A → B → C turn anticlockwise? */
const gameTurn = (A: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number }) => (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) < 0;

describe('the star pictures (docs/DESIGN-MINIGAMES.md §5.6)', () => {
  it('nine, each line joining two of its own stars and every star on a line', () => {
    expect(PICTURES.map((p) => p.id)).toEqual([...PICTURE_IDS]);
    for (const p of PICTURES) {
      const ids = p.stars.map((st) => st.id);
      expect(new Set(ids).size, p.id).toBe(ids.length);
      for (const [a, b] of p.lines) {
        expect(ids, p.id).toContain(a);
        expect(ids, p.id).toContain(b);
        expect(a).not.toBe(b);
      }
      for (const id of ids) expect(p.lines.some(([a, b]) => a === id || b === id), `${p.id} ${id}`).toBe(true);
      expect(new Set(p.lines.map(([a, b]) => lineKey(a, b))).size, p.id).toBe(p.lines.length);
      expect(p.note.length).toBeGreaterThan(30);
    }
    expect(MINIGAMES['star-charts'].pages).toBe(PICTURES.length);
  });

  it('each the way round it is in the sky — turned maybe, never mirrored (code review round 1: Cassiopeia, Leo and the Big Dipper beside the Little were)', () => {
    const triples: [string, string, string][] = [
      ['alnitak', 'alnilam', 'mintaka'],
      ['vega', 'deneb', 'altair'],
      ['gacrux', 'mimosa', 'acrux'],
      ['gacrux', 'imai', 'acrux'],
      ['caph', 'schedar', 'segin'],
      ['schedar', 'navi', 'ruchbah'],
      ['caph', 'navi', 'segin'],
      ['merak', 'dubhe', 'megrez'],
      ['merak', 'dubhe', 'alkaid'],
      ['polaris', 'zeta-umi', 'kochab'],
      ['yildun', 'kochab', 'pherkad'],
      ['betelgeuse', 'bellatrix', 'rigel'],
      ['bellatrix', 'rigel', 'saiph'],
      ['deneb-c', 'gienah', 'albireo'],
      ['deneb-c', 'delta-cyg', 'albireo'],
      ['regulus', 'algieba', 'denebola'],
      ['regulus', 'zosma', 'denebola'],
      ['algieba', 'rasalas', 'zosma'],
    ];
    const all = Object.fromEntries(PICTURES.flatMap((p) => p.stars).map((st) => [st.id, st]));
    for (const [a, b, c] of triples) {
      // Three in a line (the Belt) turn neither way much: only check those that do.
      if (Math.abs((all[b].x - all[a].x) * (all[c].y - all[a].y) - (all[b].y - all[a].y) * (all[c].x - all[a].x)) < 40) continue;
      expect(gameTurn(all[a], all[b], all[c]), `${a} ${b} ${c}`).toBe(realTurn(a, b, c));
    }
    // The North Star's hunt: the Big Dipper's bowl the right way round, and on the right side of the Little Dipper.
    const hunt = { ...all, ...Object.fromEntries(POINTER_GUIDE.map((st) => [st.id, st])) };
    for (const [a, b, c] of [
      ['merak-g', 'dubhe-g', 'megrez-g'],
      ['merak-g', 'dubhe-g', 'phecda-g'],
      ['dubhe-g', 'polaris', 'kochab'],
      ['merak-g', 'polaris', 'pherkad'],
      ['megrez-g', 'polaris', 'zeta-umi'],
    ] as const)
      expect(gameTurn(hunt[a], hunt[b], hunt[c]), `${a} ${b} ${c}`).toBe(realTurn(a, b, c));
  });

  it('Gentle joins 3–5 stars; Medium the bigger ones, 6–8; Tricky all nine', () => {
    for (const id of BAND_PICTURES.gentle) expect(PICTURE_BY_ID[id].stars.length).toBeLessThanOrEqual(5);
    for (const id of BAND_PICTURES.medium) expect(PICTURE_BY_ID[id].stars.length).toBeGreaterThanOrEqual(6);
    expect([...BAND_PICTURES.tricky]).toEqual([...PICTURE_IDS]);
    expect(new Set([...BAND_PICTURES.gentle, ...BAND_PICTURES.medium])).toEqual(new Set(PICTURE_IDS));
  });
});

describe('the jobs', () => {
  it('Gentle shows the outline; Medium doesn’t; Tricky turns the sky — never upright', () => {
    expect(jobs('gentle').every((j) => j.outline && j.turn === 0)).toBe(true);
    expect(jobs('medium').every((j) => !j.outline && j.turn === 0)).toBe(true);
    expect(jobs('tricky').every((j) => !j.outline && j.turn !== 0 && j.turn % 360 !== 0)).toBe(true);
  });

  it('a turned sky keeps the picture’s shape: every distance the same', () => {
    for (const j of jobs('tricky')) {
      const p = PICTURE_BY_ID[j.picture];
      const sky = Object.fromEntries(j.sky.map((st) => [st.id, st]));
      for (const [a, b] of p.lines) {
        const up = Math.hypot(p.stars.find((x) => x.id === a)!.x - p.stars.find((x) => x.id === b)!.x, p.stars.find((x) => x.id === a)!.y - p.stars.find((x) => x.id === b)!.y);
        expect(Math.hypot(sky[a].x - sky[b].x, sky[a].y - sky[b].y)).toBeCloseTo(up, 0);
      }
    }
    expect(turned(50, 20, 90)).toEqual([80, 50]);
  });

  it('every sky: in bounds, its stars apart, the picture’s all there and the others faint', () => {
    for (const band of BANDS) {
      for (const j of jobs(band)) {
        // The others keep clear of every star, and of every line drawn (code review round 1: one sat on the Summer Triangle's
        // dotted outline, and on the North Star's arrow).
        const at = Object.fromEntries(j.sky.map((st) => [st.id, st]));
        const drawn = [...PICTURE_BY_ID[j.picture].lines, ...(j.findNorth ? [...GUIDE_BOWL, ['merak-g', 'polaris'] as const] : [])];
        for (const ex of j.sky.filter((st) => st.id.startsWith('extra-'))) {
          for (const st of j.sky) if (st !== ex) expect(Math.hypot(st.x - ex.x, st.y - ex.y), `${j.picture} ${ex.id} ${st.id}`).toBeGreaterThanOrEqual(EXTRA_GAP.star);
          for (const [a, b] of drawn) expect(segmentGap(ex, at[a], at[b]), `${j.picture} ${ex.id} ${a}–${b}`).toBeGreaterThanOrEqual(EXTRA_GAP.line);
        }
        const p = PICTURE_BY_ID[j.picture];
        for (const st of p.stars) expect(j.sky.find((x) => x.id === st.id && !x.extra), `${j.picture} ${st.id}`).toBeTruthy();
        for (const st of j.sky) {
          expect(st.x).toBeGreaterThanOrEqual(4);
          expect(st.x).toBeLessThanOrEqual(96);
          expect(st.y).toBeGreaterThanOrEqual(4);
          expect(st.y).toBeLessThanOrEqual(96);
        }
        for (let a = 0; a < j.sky.length; a++)
          for (let b = a + 1; b < j.sky.length; b++) expect(Math.hypot(j.sky[a].x - j.sky[b].x, j.sky[a].y - j.sky[b].y), `${j.picture} ${j.sky[a].id} ${j.sky[b].id}`).toBeGreaterThanOrEqual(9);
        expect(j.sky.filter((st) => st.id.startsWith('extra-')).every((st) => st.mag === 3)).toBe(true);
        expect(j.sky.filter((st) => st.id.startsWith('extra-')).length).toBeGreaterThan(0);
      }
    }
  });

  it('Medium’s Little Dipper: the Big Dipper’s pointers aim at the North Star', () => {
    const j = jobs('medium').find((x) => x.picture === 'little-dipper')!;
    expect(j.findNorth).toBe(true);
    const [m, d] = POINTERS.map((id) => j.sky.find((st) => st.id === id)!);
    const polaris = j.sky.find((st) => st.id === 'polaris')!;
    // Polaris is on the line from Merak through Dubhe, beyond Dubhe.
    const off = Math.abs((d.x - m.x) * (polaris.y - m.y) - (d.y - m.y) * (polaris.x - m.x)) / Math.hypot(d.x - m.x, d.y - m.y);
    expect(off).toBeLessThan(2);
    expect(Math.hypot(polaris.x - m.x, polaris.y - m.y)).toBeGreaterThan(Math.hypot(d.x - m.x, d.y - m.y));
    expect(POINTER_GUIDE.filter((st) => !st.extra).map((st) => st.id)).toEqual([...POINTERS]);
    expect(jobs('tricky').some((x) => x.findNorth)).toBe(false);
    // The arrow ends just short of the North Star (code review round 1: 7 short, out of a tap's reach), on the pointers' line.
    const tip = pointerArrow(polaris);
    expect(Math.hypot(polaris.x - tip.x, polaris.y - tip.y)).toBeCloseTo(5, 0);
    expect(segmentGap(tip, m, { x: m.x + (d.x - m.x) * 10, y: m.y + (d.y - m.y) * 10 })).toBeLessThan(0.01);
    // Every hunt's sky has every star clear of the arrow.
    for (const j of everyJob().filter((x) => x.findNorth))
      for (const st of j.sky.filter((x) => !['merak-g', 'dubhe-g', 'polaris'].includes(x.id))) expect(segmentGap(st, m, polaris), st.id).toBeGreaterThanOrEqual(EXTRA_GAP.line);
  });

  it('a job’s sky is the same each time it comes up; another round, the others move', () => {
    expect(jobFor('medium', 1, 2)).toEqual(jobFor('medium', 1, 2));
    const extrasOf = (j: Job) => j.sky.filter((st) => st.extra).map((st) => `${st.x},${st.y}`);
    const q = ['orion', 'orion', 'orion'] as const;
    expect(extrasOf(jobFor('medium', 0, 0, q))).not.toEqual(extrasOf(jobFor('medium', 1, 0, q)));
  });

  it('pictures not on the chart come first; a round’s three are its queue’s first three; three Tricky rounds show all nine', () => {
    expect(roundQueue('tricky', () => false, 0).slice(0, 3)).toEqual(['belt', 'triangle', 'crux']);
    const q = roundQueue('tricky', (id) => id === 'belt', 0);
    expect(q.slice(0, 3)).toEqual(['triangle', 'crux', 'cassiopeia']);
    for (const i of [0, 1, 2]) expect(jobFor('tricky', 0, i, q).picture).toBe(q[i]);
    expect(new Set(Array.from({ length: 9 }, (_, k) => jobFor('tricky', Math.floor(k / 3), k % 3).picture)).size).toBe(9);
    expect(roundQueue('gentle', () => false, 0)).toHaveLength(4);
  });
});

describe('joining and the words', () => {
  const dipper = PICTURE_BY_ID['big-dipper'];
  it('a line is a line either way round', () => {
    expect(isLine(dipper, 'merak', 'dubhe')).toBe(true);
    expect(isLine(dipper, 'dubhe', 'merak')).toBe(true);
    expect(isLine(dipper, 'alkaid', 'dubhe')).toBe(false);
    expect(lineKey('b', 'a')).toBe(lineKey('a', 'b'));
    expect(starName(dipper, 'dubhe')).toBe('Dubhe');
    expect(starName(dipper, 'extra-1')).toBeNull();
  });

  it('joins said kindly', () => {
    expect(joinWords(dipper, 'merak', 'dubhe', false)).toBe('Merak to Dubhe — joined!');
    expect(joinWords(dipper, 'merak', 'dubhe', true)).toBe('Merak and Dubhe are joined already.');
    expect(joinWords(dipper, 'alkaid', 'dubhe', false)).toBe('Alkaid and Dubhe are both in the Big Dipper, but they aren’t joined. Look at the card again!');
    // A star of the sky's others: they're tiny, the picture's bigger (code review round 1: "brighter" wasn't so).
    expect(joinWords(dipper, 'alkaid', 'extra-2', false)).toBe('That tiny star isn’t part of the Big Dipper — its stars are bigger. Look at the card!');
  });

  it('a turned sky said as it is: on its side, upside down, tilted — and no "up" or "down" in what it looks like', () => {
    expect([90, -90, 180, 45, -45, 135].map(turnWords)).toEqual(['on its side', 'on its side', 'upside down', 'tilted', 'tilted', 'tilted, nearly upside down']);
    const belt = jobs('tricky').find((j) => j.picture === 'belt')!;
    expect(jobWords(belt)).toBe(`Join the three stars of Orion’s Belt — the sky has turned, so it’s ${turnWords(belt.turn)}.`);
    for (const j of jobs('tricky')) expect(looksWords(j), j.picture).not.toMatch(/\b(up|down|bottom|top|left|right)\b/);
    expect(looksWords(jobFor('gentle', 0, 0))).toBe(PICTURE_BY_ID.belt.looks);
  });

  it('every light’s journey, as far as it’s known — and only on Tricky', () => {
    const far: Record<string, string> = {
      belt: 'Alnilam left it at least 1,000',
      triangle: 'Vega left it 25',
      crux: 'Acrux left it about 320',
      cassiopeia: 'Schedar left it about 230',
      'big-dipper': 'Dubhe left it about 120',
      'little-dipper': 'Polaris left it about 430',
      orion: 'Betelgeuse left it about 550',
      cygnus: 'Deneb left it at least 1,400',
      leo: 'Regulus left it 79',
    };
    for (const j of jobs('tricky')) expect(learnedLine(j, 'tricky')).toBe(`${PICTURE_BY_ID[j.picture].note} The light you see from ${far[j.picture]} years ago.`);
    for (const j of jobs('medium')) expect(learnedLine(j, 'medium')).toBe(PICTURE_BY_ID[j.picture].note);
  });

  it('the ticket, the lesson (and on Tricky, the light’s journey), a star’s place', () => {
    expect(jobWords(jobFor('gentle', 0, 0))).toBe('Join the three stars of Orion’s Belt along the dotted lines.');
    expect(jobWords(jobs('medium').find((j) => j.findNorth)!)).toMatch(/^First find the North Star/);
    expect(jobWords(jobFor('tricky', 0, 0))).toMatch(/the sky has turned/);
    const triangle = jobs('tricky').find((j) => j.picture === 'triangle')!;
    expect(learnedLine(triangle, 'tricky')).toMatch(/The light you see from Vega left it 25 years ago\.$/);
    expect(learnedLine(jobs('tricky').find((j) => j.picture === 'cygnus')!, 'tricky')).toMatch(/left it at least 1,400 years ago\.$/);
    expect(learnedLine(triangle, 'gentle')).toBe(PICTURE_BY_ID.triangle.note);
    expect(placeWords(20, 20, 1)).toBe('A bright star near the top left');
    expect(placeWords(50, 50, 3)).toBe('A faint star near the middle');
    expect(placeWords(80, 50, 2)).toBe('A star near the middle right');
    expect(placeWords(50, 50, 3, true)).toBe('A tiny star near the middle');
  });
});
