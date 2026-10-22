import { describe, it, expect } from 'vitest';
import {
  BAND_DIRS,
  BAND_STAMPS,
  BAY,
  EQUATOR_ROW,
  JOBS_PER_ROUND,
  REGIONS,
  REGION_BY_ID,
  STAMPS,
  STAMP_IDS,
  TOWN,
  TOWN_CLUES,
  WORLD,
  WORLD_START,
  clueWords,
  delivered,
  destWords,
  farChoices,
  gridRef,
  jobFor,
  jobWords,
  learnedLine,
  mapOf,
  missWords,
  move,
  placeAt,
  regionAt,
  relWords,
  roundQueue,
  routeWords,
  STEP,
  targets,
  whereWords,
  type Cell,
  type Dir,
  type Job,
} from './airmail';
import { BANDS, MINIGAMES, type Band } from '../../content/minigames';

const jobs = (band: Band, rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

/** The fewest moves from Ember's start to a delivery, with the band's compass. */
function fewest(job: Job): number {
  const { start, w, h } = mapOf(job);
  const seen = new Set([`${start.x},${start.y}`]);
  let front: Cell[] = [start];
  for (let n = 0; n <= w * h; n++) {
    if (front.some((c) => delivered(job, c))) return n;
    const next: Cell[] = [];
    for (const c of front)
      for (const d of BAND_DIRS[job.band]) {
        const to = move(job, c, d);
        if (to && !seen.has(`${to.x},${to.y}`)) {
          seen.add(`${to.x},${to.y}`);
          next.push(to);
        }
      }
    front = next;
  }
  return Infinity;
}

describe('the stamps (docs/DESIGN-MINIGAMES.md §5.9)', () => {
  it('nine, three from each band, each a true thing about maps and the world', () => {
    expect(STAMPS.map((s) => s.id)).toEqual([...STAMP_IDS]);
    expect(new Set(BANDS.flatMap((b) => BAND_STAMPS[b]))).toEqual(new Set(STAMP_IDS));
    for (const s of STAMPS) expect(s.note.length, s.id).toBeGreaterThan(40);
    expect(MINIGAMES['ember-air-mail'].pages).toBe(STAMPS.length);
  });

  it('stamps not in the album first; a round’s three are its queue’s', () => {
    expect(roundQueue('gentle', () => false, 0)).toEqual(['letter', 'parcel', 'basket']);
    expect(roundQueue('gentle', (id) => id === 'letter', 0)).toEqual(['parcel', 'basket', 'letter']);
    const q = roundQueue('tricky', (id) => id === 'shell', 0);
    for (const i of [0, 1, 2]) expect(jobFor('tricky', 0, i, q).stamp).toBe(q[i]);
  });
});

describe('the maps', () => {
  it('the bay and the town: rows the right size, everything on the map, one thing a square; Ember starts at the post office', () => {
    for (const map of [BAY, TOWN]) {
      expect(map.sea).toHaveLength(map.h);
      for (const row of map.sea) expect(row).toHaveLength(map.w);
      const all = [...map.places, ...map.houses];
      for (const c of all) expect(c.x >= 0 && c.x < map.w && c.y >= 0 && c.y < map.h).toBe(true);
      expect(new Set(all.map((c) => `${c.x},${c.y}`)).size).toBe(all.length);
      expect(placeAt(map, map.start)).toBe('post');
      for (const c of map.houses) expect(map.sea[c.y][c.x], `${c.x},${c.y}`).toBe('.');
    }
  });

  it('the town’s squares: letter along, number up — A1 at the south-west, the post office at D3', () => {
    expect(gridRef({ x: 0, y: 5 })).toBe('A1');
    expect(gridRef({ x: 5, y: 0 })).toBe('F6');
    expect(gridRef(TOWN.start)).toBe('D3');
  });

  it('each town house is just beside one landmark, the way its clue says', () => {
    expect(TOWN_CLUES.map((c) => `${c.house.x},${c.house.y}`).sort()).toEqual(TOWN.houses.map((c) => `${c.x},${c.y}`).sort());
    for (const c of TOWN_CLUES) {
      const from = TOWN.places.find((p) => p.place === c.from)!;
      expect({ x: from.x + STEP[c.dir][0], y: from.y + STEP[c.dir][1] }, `${c.from} ${c.dir}`).toEqual(c.house);
    }
  });

  it('the world: six rows of twelve; every continent and ocean on it; the equator between the 3rd and 4th rows', () => {
    expect(WORLD).toHaveLength(6);
    for (const row of WORLD) expect(row).toHaveLength(12);
    for (const r of REGIONS) expect(WORLD.join('').includes(r.code), r.id).toBe(true);
    const rows = (id: string) => WORLD.flatMap((row, y) => (row.includes(REGION_BY_ID[id as 'asia'].code) ? [y] : []));
    // North of the equator, south of it, and across it.
    for (const id of ['europe', 'asia', 'north-america', 'arctic']) expect(Math.max(...rows(id)), id).toBeLessThan(EQUATOR_ROW);
    for (const id of ['australia', 'antarctica']) expect(Math.min(...rows(id)), id).toBeGreaterThanOrEqual(EQUATOR_ROW);
    for (const id of ['africa', 'south-america', 'pacific', 'atlantic']) {
      expect(Math.min(...rows(id)), id).toBeLessThanOrEqual(EQUATOR_ROW);
      expect(Math.max(...rows(id)), id).toBeGreaterThanOrEqual(EQUATOR_ROW - 1);
    }
    expect(regionAt(WORLD_START).id).toBe('europe');
    expect(WORLD[5]).toBe('XXXXXXXXXXXX');
  });

  it('a move: one square; off the bay or the town’s edge, nowhere; the world’s east and west edges join', () => {
    const bay = jobFor('gentle', 0, 0);
    expect(move(bay, { x: 2, y: 2 }, 'N')).toEqual({ x: 2, y: 1 });
    expect(move(bay, { x: 0, y: 0 }, 'W')).toBeNull();
    expect(move(bay, { x: 0, y: 0 }, 'N')).toBeNull();
    const town = jobFor('medium', 0, 0);
    expect(move(town, { x: 3, y: 3 }, 'NE')).toEqual({ x: 4, y: 2 });
    const world = jobFor('tricky', 0, 0);
    expect(move(world, { x: 0, y: 2 }, 'W')).toEqual({ x: 11, y: 2 });
    expect(move(world, { x: 11, y: 2 }, 'E')).toEqual({ x: 0, y: 2 });
    expect(move(world, { x: 3, y: 5 }, 'S')).toBeNull();
  });
});

describe('the jobs', () => {
  it('Gentle the bay, four directions; Medium the town, eight; Tricky the world, four — every parcel somewhere else, and reachable', () => {
    expect(BAND_DIRS.gentle).toHaveLength(4);
    expect(BAND_DIRS.medium).toHaveLength(8);
    expect(BAND_DIRS.tricky).toHaveLength(4);
    for (const band of BANDS)
      for (const j of jobs(band)) {
        expect(j.map).toBe(band === 'gentle' ? 'bay' : band === 'medium' ? 'town' : 'world');
        expect(BAND_STAMPS[band]).toContain(j.stamp);
        expect(delivered(j, mapOf(j).start), JSON.stringify(j)).toBe(false);
        const n = fewest(j);
        expect(n, JSON.stringify(j)).toBeGreaterThanOrEqual(1);
        expect(n, JSON.stringify(j)).toBeLessThanOrEqual(band === 'tricky' ? 6 : 4);
      }
  });

  it('a round’s three go to three places; over the rounds, every place, house and continent comes up — each house both ways', () => {
    for (const band of BANDS)
      for (let round = 0; round < 8; round++) {
        const to = [0, 1, 2].map((i) => JSON.stringify(jobFor(band, round, i).to));
        expect(new Set(to).size, `${band} ${round}`).toBe(3);
      }
    expect(new Set(jobs('gentle').map((j) => j.to)).size).toBe(6);
    const town = jobs('medium', 16) as Extract<Job, { map: 'town' }>[];
    for (const h of TOWN.houses) {
      const ways = new Set(town.filter((j) => j.to.x === h.x && j.to.y === h.y).map((j) => j.by));
      expect(ways, `${h.x},${h.y}`).toEqual(new Set(['square', 'landmark']));
    }
    expect(new Set(jobs('tricky', 4).map((j) => j.to)).size).toBe(10);
  });

  it('where a parcel can land: one square, or a whole continent or ocean', () => {
    expect(targets(jobFor('gentle', 0, 0))).toEqual([{ x: 4, y: 1 }]);
    const world = { band: 'tricky', stamp: 'postcard', map: 'world', to: 'australia' } as const;
    expect(targets(world)).toEqual([
      { x: 10, y: 3 },
      { x: 10, y: 4 },
    ]);
    expect(delivered(world, { x: 10, y: 4 })).toBe(true);
    expect(delivered(world, { x: 9, y: 4 })).toBe(false);
  });
});

describe('the words', () => {
  const lighthouse = jobFor('gentle', 0, 0);
  const pondHouse: Job = { band: 'medium', stamp: 'seeds', map: 'town', to: { x: 2, y: 1 }, by: 'landmark' };
  const c5: Job = { ...pondHouse, by: 'square' };
  const ice: Job = { band: 'tricky', stamp: 'globe', map: 'world', to: 'antarctica' };

  it('which way, in compass words', () => {
    expect(relWords({ x: 2, y: 2 }, { x: 0, y: 0 })).toBe('2 squares north and 2 west');
    expect(relWords({ x: 2, y: 2 }, { x: 2, y: 1 })).toBe('1 square north');
    expect(relWords({ x: 2, y: 2 }, { x: 4, y: 2 })).toBe('2 squares east');
    // Round the world the short way.
    expect(relWords({ x: 0, y: 1 }, { x: 11, y: 1 }, true)).toBe('1 square west');
  });

  it('the clue, the ticket, where Ember is', () => {
    expect(lighthouse.to).toBe('lighthouse');
    expect(clueWords(lighthouse)).toBe('A letter for the lighthouse.');
    expect(destWords(pondHouse)).toBe('the house just north-east of the duck pond');
    expect(destWords(c5)).toBe('the house at C5');
    expect(clueWords(ice)).toBe('A little globe to the icy continent at the very south of the world.');
    expect(jobWords(lighthouse)).toBe('Fly the letter to the lighthouse: steer Ember north, east, south or west.');
    expect(jobWords(c5)).toBe('Fly it to the house at C5. A square is named by its letter along, then its number up — like C5.');
    expect(whereWords(lighthouse, { x: 0, y: 2 })).toBe('at the duck pond');
    expect(whereWords(lighthouse, { x: 1, y: 1 })).toBe('over the fields');
    expect(whereWords(lighthouse, { x: 4, y: 4 })).toBe('over the sea');
    expect(whereWords(c5, { x: 4, y: 3 })).toBe('over E3, at the market');
    expect(whereWords(c5, { x: 2, y: 1 })).toBe('over C5, at a house');
    expect(whereWords(c5, { x: 4, y: 2 })).toBe('over E4');
    expect(whereWords(ice, { x: 0, y: 2 })).toBe('over the Pacific Ocean');
  });

  it('a wrong square: where Ember is, and which way to go — never scolded', () => {
    expect(missWords(lighthouse, { x: 0, y: 2 })).toBe('That’s the duck pond. The lighthouse is 1 square north and 4 east.');
    expect(missWords(lighthouse, { x: 1, y: 1 })).toBe('Nobody’s waiting here. The lighthouse is 3 squares east.');
    expect(missWords(c5, { x: 3, y: 3 })).toBe('That’s D3. The house is 2 squares north and 1 west.');
    expect(missWords(pondHouse, { x: 1, y: 1 })).toBe('That’s B5. The house is 1 square east.');
    expect(missWords(ice, { x: 6, y: 3 })).toBe('That’s Africa. Antarctica is 2 squares south.');
  });

  it('the route said in runs; the scale’s three choices; what a delivery teaches', () => {
    expect(routeWords(['E', 'E', 'N'] as Dir[])).toBe('2 east, then 1 north');
    expect(routeWords(['NE'] as Dir[])).toBe('1 north-east');
    expect(farChoices(4)).toEqual([6000, 12000, 18000]);
    expect(farChoices(1)).toEqual([3000, 9000, 15000]);
    expect(farChoices(2)).toEqual([6000, 12000, 18000]);
    expect(learnedLine(lighthouse, ['E', 'E', 'N'])).toBe(`To the lighthouse: Ember flew 2 east, then 1 north. ${STAMPS[0].note}`);
    expect(learnedLine(c5, ['N', 'NW'])).toBe(`The house was at C5: C along, 5 up. Ember flew 1 north, then 1 north-west. ${STAMPS.find((s) => s.id === 'seeds')!.note}`);
    expect(learnedLine(ice, ['S', 'S', 'S', 'S'])).toBe(`${REGION_BY_ID.antarctica.fact} Ember flew four squares — about 12,000 km.`);
    expect(learnedLine(ice, ['S'])).toMatch(/flew one square — about 3,000 km\.$/);
  });
});
