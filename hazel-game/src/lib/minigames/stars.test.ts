import { describe, it, expect } from 'vitest';
import {
  BAND_PICTURES,
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
  placeWords,
  roundQueue,
  starName,
  turned,
} from './stars';
import { BANDS, MINIGAMES, type Band } from '../../content/minigames';

const jobs = (band: Band) => Array.from({ length: 27 }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

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
    expect(joinWords(dipper, 'alkaid', 'extra-2', false)).toBe('That star isn’t part of the Big Dipper — look for its brighter stars.');
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
  });
});
