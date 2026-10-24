import { describe, it, expect } from 'vitest';
import {
  BAND_PICTURES,
  EXTRA_GAP,
  GUIDE_BOWL,
  HUNT_WORDS,
  NAME_SPOTS,
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
  nameSpots,
  placeWords,
  pointerArrow,
  roundQueue,
  segmentGap,
  shortName,
  starName,
  turnWords,
  turned,
  FIND_GAP,
  LATITUDES,
  RADEC,
  SPREAD,
  altAz,
  expertSky,
  isRightLatitude,
  radecOf,
  realAltAz,
  turnFor,
  coordsWords,
  findWords,
  foundWords,
  gridLines,
  gridStep,
  latitudeChoices,
  latitudeWords,
  starCoords,
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
 * The real sky (`RADEC`: J2000 right ascension and declination, degrees),
 * for which way round the pictures go: a picture can be turned (the sky turns
 * through the night) but never mirrored.
 */
const realOf = (id: string) => [...radecOf(id)] as [number, number];

/**
 * A picture fitted to its stars' real places, seen from the ground (east to
 * the left, north up), by a turn and a size only: how far, at most, a star is
 * from where the fit puts it (sky units) — and the same, mirrored.
 */
function fitError(p: (typeof PICTURES)[number]): { turned: number; mirrored: number } {
  const r = Math.PI / 180;
  const ids = p.stars.map((st) => st.id);
  const raw = ids.map((id) => realOf(id));
  // Round their middle: a flat sky (gnomonic), x east-left, y south-down, as the picture's drawn.
  const v = raw.map(([ra, dec]) => [Math.cos(dec * r) * Math.cos(ra * r), Math.cos(dec * r) * Math.sin(ra * r), Math.sin(dec * r)]);
  const m = [0, 1, 2].map((i) => v.reduce((t, q) => t + q[i], 0));
  const a0 = Math.atan2(m[1], m[0]);
  const d0 = Math.atan2(m[2], Math.hypot(m[0], m[1]));
  const flat = raw.map(([ra, dec]) => {
    const [a, d] = [ra * r, dec * r];
    const c = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
    return [-(Math.cos(d) * Math.sin(a - a0)) / c, -(Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / c];
  });
  const drawn = p.stars.map((st) => [st.x, st.y]);
  const fit = (P: number[][]) => {
    const n = P.length;
    const mp = [0, 1].map((i) => P.reduce((t, q) => t + q[i], 0) / n);
    const mq = [0, 1].map((i) => drawn.reduce((t, q) => t + q[i], 0) / n);
    let A = 0;
    let B = 0;
    let pp = 0;
    P.forEach(([x, y], k) => {
      const [dx, dy] = [x - mp[0], y - mp[1]];
      const [ex, ey] = [drawn[k][0] - mq[0], drawn[k][1] - mq[1]];
      A += dx * ex + dy * ey;
      B += dx * ey - dy * ex;
      pp += dx * dx + dy * dy;
    });
    const k = Math.hypot(A, B) / pp;
    const t = Math.atan2(B, A);
    return Math.max(...P.map(([x, y], i) => {
      const [dx, dy] = [x - mp[0], y - mp[1]];
      return Math.hypot(mq[0] + k * (dx * Math.cos(t) - dy * Math.sin(t)) - drawn[i][0], mq[1] + k * (dx * Math.sin(t) + dy * Math.cos(t)) - drawn[i][1]);
    }));
  };
  return { turned: fit(flat), mirrored: fit(flat.map(([x, y]) => [-x, y])) };
}
/** Seen from the ground, does A → B → C turn anticlockwise? */
function realTurn(a: string, b: string, c: string) {
  const unit = ([ra, dec]: [number, number]) => { const r = Math.PI / 180; return [Math.cos(dec * r) * Math.cos(ra * r), Math.cos(dec * r) * Math.sin(ra * r), Math.sin(dec * r)]; };
  const [A, B, C] = [a, b, c].map((id) => unit(realOf(id)));
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

  it('each, whole, where its stars are in the sky — every star within 6 of the fit, turned; mirrored, far worse (code review round 2)', () => {
    for (const p of PICTURES) {
      const { turned, mirrored } = fitError(p);
      expect(turned, p.id).toBeLessThan(6);
      // Three in a line fit as well either way round.
      if (p.id !== 'belt') expect(mirrored, p.id).toBeGreaterThan(turned * 3);
    }
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

  it('the hunt says where its stars are as they’re drawn (UX review round 2: it said “the bottom star”, “above it”)', () => {
    const [m, d, ...bowl] = POINTER_GUIDE;
    // Merak: the bowl's highest star, at the top right; Dubhe: just left of it; the North Star: left along the arrow, at the top left.
    expect(m.y).toBeLessThan(Math.min(d.y, ...bowl.map((st) => st.y)));
    expect(placeWords(m.x, m.y, m.mag)).toMatch(/top right$/);
    expect(d.x).toBeLessThan(m.x);
    expect(Math.abs(d.y - m.y)).toBeLessThan(Math.abs(d.x - m.x));
    const polaris = PICTURE_BY_ID['little-dipper'].stars.find((st) => st.id === 'polaris')!;
    expect(polaris.x).toBeLessThan(d.x);
    expect(placeWords(polaris.x, polaris.y, polaris.mag)).toBe('A bright star near the top left');
    expect(HUNT_WORDS.notMerak).toContain('the highest star of the Big Dipper’s bowl, at the top right');
    expect(HUNT_WORDS.merak).toContain('just left of it');
    expect(HUNT_WORDS.dubhe).toContain('follow the arrow left, to the bright star near the top left');
    for (const w of Object.values(HUNT_WORDS).flat()) expect(w, w).not.toMatch(/\b(bottom|above|below)\b/);
  });

  it('the names: in the sky, off the stars and each other — every finished picture, at every sky size (code review round 2)', () => {
    const width = (font: number) => (n: string) => n.length * font * 0.6;
    let worst = 0;
    for (const band of BANDS)
      for (const j of jobs(band)) {
        const sky = j.sky.filter((st) => !st.id.endsWith('-g'));
        const p = PICTURE_BY_ID[j.picture];
        const names = Object.fromEntries(p.stars.map((st) => [st.id, shortName(p, st.id)!]));
        for (const px of [200, 250, 300, 480]) {
          const font = px < 240 ? 10 : 11;
          const spots = nameSpots(sky, names, px, font, width(font));
          const boxes = Object.entries(spots);
          expect(boxes).toHaveLength(p.stars.length);
          for (const [id, { box }] of boxes) {
            // In the sky, always.
            expect(box.x0, `${j.picture} ${id} ${px}`).toBeGreaterThanOrEqual(0);
            expect(box.x1, `${j.picture} ${id} ${px}`).toBeLessThanOrEqual(100);
            expect(box.y0, `${j.picture} ${id} ${px}`).toBeGreaterThanOrEqual(0);
            expect(box.y1, `${j.picture} ${id} ${px}`).toBeLessThanOrEqual(100);
            // Over no star of the picture but its own (its dot's middle).
            for (const st of sky.filter((x) => !x.extra)) if (st.id !== id) expect(st.x > box.x0 && st.x < box.x1 && st.y > box.y0 && st.y < box.y1, `${j.picture} ${id} over ${st.id} at ${px}`).toBe(false);
          }
          // Names on names: as little as can be — under a tenth of a name's box, summed, on the busiest sky.
          let over = 0;
          for (let a = 0; a < boxes.length; a++)
            for (let b = a + 1; b < boxes.length; b++) {
              const [p1, p2] = [boxes[a][1].box, boxes[b][1].box];
              over += Math.max(0, Math.min(p1.x1, p2.x1) - Math.max(p1.x0, p2.x0)) * Math.max(0, Math.min(p1.y1, p2.y1) - Math.max(p1.y0, p2.y0));
            }
          if (px >= 250) worst = Math.max(worst, over);
        }
      }
    expect(worst).toBeLessThan(5);
    // Placing them is what keeps them apart: all "below" would clash.
    expect(NAME_SPOTS[0]).toBe('below');
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
    expect(joinWords(dipper, 'alkaid', 'extra-2', false)).toBe('That tiny dot isn’t part of the Big Dipper — its stars are bigger. Look at the card!');
    // On Gentle, where to look is the dotted lines (UX review round 2).
    expect(joinWords(dipper, 'alkaid', 'extra-2', false, true)).toBe('That tiny dot isn’t part of the Big Dipper — its stars are on the dotted lines!');
    expect(joinWords(dipper, 'alkaid', 'dubhe', false, true)).toBe('Alkaid and Dubhe are both in the Big Dipper, but they aren’t joined. Follow a dotted line!');
  });

  it('a turned sky said as it is: on its side, upside down, tilted — and no "up" or "down" in what it looks like', () => {
    expect([90, -90, 180, 45, -45, 135].map(turnWords)).toEqual(['on its side', 'on its side', 'upside down', 'tilted', 'tilted', 'tilted, nearly upside down']);
    const belt = jobs('tricky').find((j) => j.picture === 'belt')!;
    expect(jobWords(belt)).toBe(`Join the three stars of Orion’s Belt — the sky has turned, so it’s ${turnWords(belt.turn)}. It looks like three stars in a short straight line.`);
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
    expect(placeWords(50, 50, 3, true)).toBe('A tiny dot near the middle');
    // Medium's ticket says the shape too (its card's a picture, hidden from a reader).
    expect(jobWords(jobFor('medium', 0, 0))).toBe(`Join the seven stars of the Big Dipper. It looks like ${PICTURE_BY_ID['big-dipper'].looks}.`);
    expect(jobWords(jobFor('medium', 0, 0), false)).toBe('Join the seven stars of the Big Dipper.');
  });
});

describe('Expert: sky coordinates (§8.5)', () => {
  const expert = Array.from({ length: 27 }, (_, k) => jobFor('expert', Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

  it('every picture on an altitude–azimuth grid, upright, no outline; the Little Dipper asks the latitude, the rest a bright star to find', () => {
    expect(new Set(expert.map((j) => j.picture))).toEqual(new Set(PICTURE_IDS));
    for (const j of expert) {
      expect(j.view, j.picture).not.toBeNull();
      expect([j.turn, j.outline, j.findNorth]).toEqual([0, false, false]);
      if (j.picture === 'little-dipper') expect([j.find, LATITUDES]).toEqual([null, expect.arrayContaining([j.latitude])]);
      else {
        expect(j.latitude).toBeNull();
        const st = PICTURE_BY_ID[j.picture].stars.find((o) => o.id === j.find)!;
        expect(st.mag, j.picture).toBeLessThan(3);
      }
    }
    // The younger bands have none of it.
    for (const band of BANDS) for (const j of jobs(band)) expect([j.view, j.find, j.latitude]).toEqual([null, null, null]);
  });

  it('altitude up from the horizon, azimuth round from north to the right (through east), wrapping past 360°', () => {
    const v = { facing: 0, mid: 30, k: 0.5 };
    expect(altAz(v, 50, 50)).toEqual({ alt: 30, az: 0 });
    expect(altAz(v, 60, 40)).toEqual({ alt: 35, az: 5 });
    expect(altAz(v, 40, 60)).toEqual({ alt: 25, az: 355 });
    expect(coordsWords({ alt: 57, az: 102 })).toBe('altitude 57°, azimuth 102°');
  });

  it('every star of every Expert sky is above the horizon; each grid has lines both ways, at least 15 sky units apart', () => {
    for (const j of expert) {
      for (const st of j.sky) expect(altAz(j.view!, st.x, st.y).alt, `${j.picture} ${st.id}`).toBeGreaterThan(0);
      const { step, alts, azs } = gridLines(j.view!);
      expect(step / j.view!.k, j.picture).toBeGreaterThanOrEqual(15);
      expect(alts.length, j.picture).toBeGreaterThanOrEqual(3);
      expect(azs.length, j.picture).toBeGreaterThanOrEqual(3);
      for (const a of [...alts, ...azs]) expect(a.at >= 0 && a.at <= 100, `${j.picture} ${a.v}`).toBe(true);
      // Each line at its own value: an altitude's y and an azimuth's x.
      for (const a of alts) expect(altAz(j.view!, 50, a.at).alt).toBeCloseTo(a.v, 0);
      for (const a of azs) expect(Math.abs(((((altAz(j.view!, a.at, 50).az - a.v) % 360) + 540) % 360) - 180)).toBeLessThan(0.5);
    }
  });

  it('every star where it really is from the night’s latitude, at its picture’s sidereal time — its coordinates the real sky’s (code review round 1)', () => {
    // The real sky's: Vega from 20° N at sidereal time 220°.
    const v = realAltAz(RADEC.vega, 20, 220);
    expect(Math.round(v.alt)).toBe(36);
    expect(Math.round(v.az)).toBe(56);
    // Due south at the meridian, a star on the celestial equator stands at 90° less the latitude; north, the pole at the latitude.
    expect(realAltAz([100, 0], 20, 100)).toEqual({ alt: expect.closeTo(70, 9), az: expect.closeTo(180, 9) });
    expect(realAltAz([0, 90], 20, 0).alt).toBeCloseTo(20, 9);
    // West of the meridian, azimuth past 180°; east, under it.
    expect(realAltAz([100, 0], 20, 130).az).toBeGreaterThan(180);
    expect(realAltAz([100, 0], 20, 70).az).toBeLessThan(180);
    for (const p of PICTURES)
      for (const lat of LATITUDES) {
        const { view, stars } = expertSky(p, lat);
        for (const st of stars) {
          const real = realAltAz(radecOf(st.id), lat, p.lst);
          const got = altAz(view, st.x, st.y);
          expect(Math.abs(got.alt - real.alt), `${p.id} ${lat} ${st.id}`).toBeLessThan(0.1);
          expect(Math.abs(((got.az - real.az + 540) % 360) - 180), `${p.id} ${lat} ${st.id}`).toBeLessThan(0.1);
          // Up, but not so high the grid's stretch (1 / cos altitude) bends its shape far (the Southern Cross is low from anywhere north).
          expect(real.alt, `${p.id} ${lat} ${st.id}`).toBeGreaterThan(p.id === 'crux' ? 1 : 10);
          expect(real.alt, `${p.id} ${lat} ${st.id}`).toBeLessThanOrEqual(46);
          // In the sky, with room round it for its name.
          expect(Math.max(Math.abs(st.x - 50), Math.abs(st.y - 50)), `${p.id} ${st.id}`).toBeLessThanOrEqual(SPREAD + 0.1);
        }
        // It fills the sky one way or the other.
        expect(Math.max(...stars.map((st) => Math.max(Math.abs(st.x - 50), Math.abs(st.y - 50))))).toBeCloseTo(SPREAD, 0);
      }
  });

  it('the night’s latitude, one a round along the coast; every Expert job’s sky drawn from it', () => {
    for (let round = 0; round < 9; round++) {
      const night = LATITUDES[turnFor(round, LATITUDES.length)];
      for (let i = 0; i < JOBS_PER_ROUND; i++) {
        const j = jobFor('expert', round, i);
        expect(j.view, `${round} ${i}`).toEqual(expertSky(PICTURE_BY_ID[j.picture], night).view);
        if (j.latitude !== null) expect(j.latitude).toBe(night);
      }
    }
  });

  it('the Little Dipper: the North Star within a degree of due north, at the latitude, on a grid line — where the Southern Cross and the Little Dipper both clear the horizon', () => {
    const dippers = expert.filter((j) => j.picture === 'little-dipper');
    expect(new Set(dippers.map((j) => j.latitude))).toEqual(new Set(LATITUDES));
    for (const j of dippers) {
      const pol = j.sky.find((o) => o.id === 'polaris');
      expect(pol).toBeDefined();
      if (!pol || !j.view || j.latitude === null) continue;
      const { alt, az } = altAz(j.view, pol.x, pol.y);
      expect(Math.abs(alt - j.latitude)).toBeLessThan(0.1);
      expect(Math.min(az, 360 - az)).toBeLessThan(1);
      expect(starCoords(j, 'polaris')).toEqual({ alt: j.latitude, az: 1 });
      expect(gridLines(j.view).alts.map((a) => a.v)).toContain(j.latitude);
    }
    // Acrux, at declination −63°, rises only south of 27° N.
    for (const l of LATITUDES) expect(l > 0 && l < 27).toBe(true);
  });

  it('the grid: each picture’s step, its lines at their values; a 10° grid’s fainter lines every 5° (UX review round 1)', () => {
    const steps = Object.fromEntries(PICTURE_IDS.map((id) => [id, [...new Set(LATITUDES.map((l) => gridStep(expertSky(PICTURE_BY_ID[id], l).view)))]]));
    expect(steps).toEqual({ belt: [1], triangle: [10], crux: [2], cassiopeia: [5], 'big-dipper': [5, 10], 'little-dipper': [5], orion: [5], cygnus: [5], leo: [10, 5] });
    // The Southern Cross from 20° N, pinned.
    const crux = gridLines(expertSky(PICTURE_BY_ID.crux, 20).view);
    expect(crux.alts.map((a) => a.v)).toEqual([6, 8, 10, 12]);
    expect(crux.azs.map((a) => a.v)).toEqual([168, 170, 172, 174]);
    expect(crux.minor).toEqual({ alts: [], azs: [] });
    const tri = gridLines(expertSky(PICTURE_BY_ID.triangle, 20).view);
    expect(tri.alts.map((a) => a.v)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(tri.minor.alts.map((a) => a.v)).toEqual([5, 15, 25, 35, 45]);
    expect(tri.minor.azs.every((a) => a.v % 10 === 5)).toBe(true);
    for (const a of tri.minor.alts) expect(altAz(expertSky(PICTURE_BY_ID.triangle, 20).view, 50, a.at).alt).toBeCloseTo(a.v, 0);
  });

  it('round the north: azimuth wraps past 360° — the grid, a star’s coordinates and which way to look', () => {
    const v = { facing: 355, mid: 30, k: 0.5 };
    expect(altAz(v, 60, 50).az).toBeCloseTo(0, 9);
    expect(altAz(v, 70, 50).az).toBeCloseTo(5, 9);
    expect(gridLines(v).azs.map((a) => a.v)).toEqual([330, 340, 350, 0, 10, 20]);
    expect(gridLines(v).minor.azs.map((a) => a.v)).toEqual([335, 345, 355, 5, 15]);
    // 359.6° is said as 0°.
    const j: Job = { picture: 'belt', outline: false, turn: 0, findNorth: false, view: { facing: 0, mid: 30, k: 0.5 }, find: 'alnilam', latitude: null, sky: [
      { id: 'alnitak', x: 49.2, y: 50, mag: 2, extra: false },
      { id: 'alnilam', x: 54, y: 50, mag: 2, extra: false },
      { id: 'mintaka', x: 46, y: 40, mag: 2, extra: false },
    ] };
    expect(starCoords(j, 'alnitak')).toEqual({ alt: 30, az: 0 });
    // Alnilam at 2°, Mintaka tapped at 358°: to the right, across north, and lower.
    expect(foundWords(j, 'mintaka')).toBe('That star is at altitude 35°, azimuth 358°. Alnilam is lower and to the right. Try again.');
    expect(foundWords(j, 'alnitak')).toBe('That star is at altitude 30°, azimuth 0°. Alnilam is to the right. Try again.');
    // Right where it's said: close by.
    expect(foundWords({ ...j, find: 'alnitak' }, 'alnitak')).toMatch(/^Alnitak, at altitude 30°, azimuth 0°\./);
  });

  it('the star to find: a bright one clear of the others, another each time the picture comes round — never the same question a round or three apart, whatever pages are on the chart (code review round 1)', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8])
      for (let r = 0; r < 30; r++) {
        if (n > 1) expect(turnFor(r + 1, n), `${n} ${r}`).not.toBe(turnFor(r, n));
        if (n > 1) expect(turnFor(r + 3, n), `${n} ${r}`).not.toBe(turnFor(r, n));
      }
    // A picture's own turn, every third round: every one in turn.
    for (const n of [3, 4, 5, 6, 7]) expect(new Set(Array.from({ length: n }, (_, k) => turnFor(k * 3, n))).size, `${n}`).toBe(n);
    // Every page mask and round: the same picture's question differs a round and three rounds apart.
    const ask = (j: Job) => `${j.find ?? ''}${j.latitude ?? ''}`;
    for (let mask = 0; mask < 512; mask++) {
      const byRound = Array.from({ length: 7 }, (_, round) => {
        const q = roundQueue('expert', (id) => !!(mask & (1 << PICTURE_IDS.indexOf(id))), round);
        return Object.fromEntries(Array.from({ length: JOBS_PER_ROUND }, (_, i) => jobFor('expert', round, i, q)).map((j) => [j.picture, ask(j)]));
      });
      for (let r = 0; r < 6; r++)
        for (const [pic, a] of Object.entries(byRound[r])) {
          if (byRound[r + 1][pic] !== undefined) expect(byRound[r + 1][pic], `${mask} ${r} ${pic}`).not.toBe(a);
          if (r + 3 < 7 && byRound[r + 3][pic] !== undefined) expect(byRound[r + 3][pic], `${mask} ${r} ${pic}`).not.toBe(a);
        }
    }
    for (const j of expert.filter((x) => x.find)) {
      const f = j.sky.find((o) => o.id === j.find);
      expect(f && f.mag < 3, j.picture).toBe(true);
      if (!f) continue;
      for (const o of j.sky) if (o.id !== f.id) expect(Math.hypot(o.x - f.x, o.y - f.y), `${j.picture} ${o.id}`).toBeGreaterThanOrEqual(FIND_GAP);
    }
    // Orion's belt stars, 6 apart on its sky, are never asked; three of each picture's others come round.
    expect(expert.filter((j) => j.picture === 'orion').map((j) => j.find)).toEqual(expect.not.arrayContaining(['alnitak-o', 'alnilam-o', 'mintaka-o']));
    for (const id of PICTURE_IDS.filter((x) => x !== 'little-dipper')) expect(new Set(expert.filter((j) => j.picture === id).map((j) => j.find)).size, id).toBe(3);
  });

  it('the words: what to find, where a wrong star is and which way to look, the latitude and its reason — plainly', () => {
    const j = jobFor('expert', 0, 1); // the Summer Triangle from 20° N: Vega
    expect([j.picture, j.find]).toEqual(['triangle', 'vega']);
    expect(findWords(j)).toBe('Vega is at altitude 36°, azimuth 56°. Find it on the grid and tap it.');
    expect(jobWords(j)).toBe('Find Vega at altitude 36°, azimuth 56°, then join the three stars of the Summer Triangle.');
    expect(foundWords(j, 'vega')).toBe('Vega, at altitude 36°, azimuth 56°. Now join the stars of the Summer Triangle.');
    // Altair's low in the east: Vega is higher, and to the left.
    expect(starCoords(j, 'altair')).toEqual({ alt: 14, az: 86 });
    expect(foundWords(j, 'altair')).toBe('That star is at altitude 14°, azimuth 86°. Vega is higher and to the left. Try again.');
    const dot = j.sky.find((o) => o.extra)!;
    expect(foundWords(j, dot.id)).toMatch(/^That tiny dot is at altitude \d+°, azimuth \d+°\. Vega is /);
    const ld = expert.find((x) => x.picture === 'little-dipper')!;
    const choices = latitudeChoices(ld.latitude!, gridStep(ld.view!));
    expect(choices).toHaveLength(4);
    expect(new Set(choices).size).toBe(4);
    // The answer; 90° less it (from overhead); south; a grid line off.
    expect([...choices].sort()).toEqual([`${ld.latitude}° N`, `${90 - ld.latitude!}° N`, `${ld.latitude}° S`, `${ld.latitude! + gridStep(ld.view!)}° N`].sort());
    // The answer's place moves with the latitude — and isn't first on the first night, 20° N (UX review round 1).
    expect(LATITUDES.map((l) => latitudeChoices(l, 5).indexOf(`${l}° N`))).toEqual([3, 0, 2]);
    expect(latitudeChoices(20, 5)).toEqual(['70° N', '20° S', '25° N', '20° N']);
    expect(latitudeWords(20, '20° N')).toBe('Yes — 20° N. The North Star is over the Earth’s North Pole, so its altitude is your latitude: it’s 20° up, and we’re 20° north.');
    expect(latitudeWords(20, '70° N')).toMatch(/^Not 70° N\. The North Star/);
    // South at the same number is wrong (code review round 1: untested), and the seal's check is the words'.
    expect(latitudeWords(20, '20° S')).toMatch(/^Not 20° S\. /);
    for (const c of latitudeChoices(20, 5)) expect(isRightLatitude(20, c)).toBe(c === '20° N');
    expect(jobWords(ld)).toBe('Read the North Star’s altitude for our latitude, then join the seven stars of the Little Dipper.');
    // The lesson is where it is in the sky; no cheering anywhere.
    for (const x of expert) {
      expect(learnedLine(x, 'expert')).toBe(PICTURE_BY_ID[x.picture].sky);
      expect(`${findWords(x)} ${learnedLine(x, 'expert')}`).not.toMatch(/!/);
    }
    expect(learnedLine(jobFor('tricky', 0, 0), 'tricky')).toMatch(/years ago\.$/);
  });
});
