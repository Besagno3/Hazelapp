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
  farSeed,
  gridRef,
  howToFind,
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
  rulerTo,
  squaresAway,
  targetWords,
  targets,
  whereWords,
  CITIES,
  CITY_BY_ID,
  CITY_IDS,
  DEG,
  GLOBE,
  GLOBE_H,
  GLOBE_START,
  GLOBE_W,
  LONDON_HOURS,
  bandWords,
  cellAt,
  cityHour,
  clockWords,
  coordsOf,
  globeRegionAt,
  openingWords,
  timeAsk,
  timeChoices,
  timeWords,
  zoneWords,
  type Cell,
  type Dir,
  type Job,
} from './airmail';
import { BANDS, MINIGAMES, type Band } from '../../content/minigames';

const jobs = (band: Band | 'expert', rounds = 8): Job[] => Array.from({ length: rounds * JOBS_PER_ROUND }, (_, k) => jobFor(band, Math.floor(k / JOBS_PER_ROUND), k % JOBS_PER_ROUND));

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

  it('the world’s squares where real places are (code review round 1: north of Moscow was Asia, Addis Ababa too)', () => {
    // A square: 30° each way, from 180° west and the North Pole.
    const at = (lat: number, lon: number) => regionAt({ x: Math.floor((lon + 180) / 30), y: Math.floor((90 - lat) / 30) }).id;
    expect(at(48.9, 2.3)).toBe('europe'); // Paris
    expect(at(64.5, 40.5)).toBe('europe'); // Arkhangelsk, north of Moscow
    expect(at(9, 38.7)).toBe('africa'); // Addis Ababa
    expect(at(29.9, 31.2)).toBe('africa'); // Cairo
    expect(at(-1.3, 36.8)).toBe('africa'); // Nairobi
    expect(at(-4.3, 15.3)).toBe('africa'); // Kinshasa
    expect(at(39.9, 116.4)).toBe('asia'); // Beijing
    expect(at(28.6, 77.2)).toBe('asia'); // Delhi
    expect(at(40.7, -74)).toBe('north-america'); // New York
    expect(at(-22.9, -43.2)).toBe('south-america'); // Rio de Janeiro
    expect(at(-25, 135)).toBe('australia'); // the middle of Australia
    expect(at(-80, 0)).toBe('antarctica');
    // Each continent and the three big oceans in one piece (the Atlantic was two, joined at a corner).
    for (const r of REGIONS.filter((x) => x.id !== 'arctic')) {
      const cells = WORLD.flatMap((row, y) => [...row].flatMap((c, x) => (c === r.code ? [{ x, y }] : [])));
      const seen = new Set([`${cells[0].x},${cells[0].y}`]);
      const todo = [cells[0]];
      while (todo.length) {
        const c = todo.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = { x: (c.x + dx + 12) % 12, y: c.y + dy };
          if (n.y >= 0 && n.y < 6 && WORLD[n.y][n.x] === r.code && !seen.has(`${n.x},${n.y}`)) {
            seen.add(`${n.x},${n.y}`);
            todo.push(n);
          }
        }
      }
      expect(seen.size, r.id).toBe(cells.length);
    }
  });

  it('a move: one square; off the bay or the town’s edge, nowhere; the world’s east and west edges join', () => {
    const bay = jobFor('gentle', 0, 0);
    expect(move(bay, { x: 2, y: 2 }, 'N')).toEqual({ x: 2, y: 1 });
    expect(move(bay, { x: 0, y: 0 }, 'W')).toBeNull();
    expect(move(bay, { x: 0, y: 0 }, 'N')).toBeNull();
    const town = jobFor('medium', 0, 0);
    expect(move(town, { x: 3, y: 3 }, 'NE')).toEqual({ x: 4, y: 2 });
    // A diagonal off the town's corners and edges: nowhere.
    expect(move(town, { x: 5, y: 0 }, 'NE')).toBeNull();
    expect(move(town, { x: 0, y: 5 }, 'SW')).toBeNull();
    expect(move(town, { x: 2, y: 0 }, 'NW')).toBeNull();
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

  it('which way, in compass words — with eight directions, along a diagonal', () => {
    expect(relWords({ x: 2, y: 2 }, { x: 0, y: 0 })).toBe('2 squares north and 2 west');
    expect(relWords({ x: 2, y: 2 }, { x: 2, y: 1 })).toBe('1 square north');
    expect(relWords({ x: 2, y: 2 }, { x: 4, y: 2 })).toBe('2 squares east');
    // Round the world the short way.
    expect(relWords({ x: 0, y: 1 }, { x: 11, y: 1 }, true)).toBe('1 square west');
    // Medium's compass has the diagonals (code review round 1: the pond's "north-east" was "north and east").
    expect(relWords({ x: 1, y: 2 }, { x: 2, y: 1 }, false, true)).toBe('1 square north-east');
    expect(relWords({ x: 0, y: 0 }, { x: 2, y: 2 }, false, true)).toBe('2 squares south-east');
    // Off the exact diagonal, the diagonal first (UX review round 2: Medium's hints never used one).
    expect(relWords({ x: 0, y: 0 }, { x: 1, y: 2 }, false, true)).toBe('1 square south-east, then 1 south');
    expect(relWords({ x: 3, y: 3 }, { x: 0, y: 2 }, false, true)).toBe('1 square north-west, then 2 west');
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

  it('a wrong square: where Ember is — the first time on the town and the world, how to find the place; then which way — never scolded', () => {
    // Gentle's lesson is the way: said at once.
    expect(missWords(lighthouse, { x: 0, y: 2 }, 1)).toBe('That’s the duck pond. The lighthouse is 1 square north and 4 east.');
    expect(missWords(lighthouse, { x: 1, y: 1 }, 1)).toBe('Nobody’s waiting here. The lighthouse is 3 squares east.');
    // The first miss reads the map (UX review round 1: the way at once, and the map was never read).
    expect(missWords(c5, { x: 3, y: 3 }, 1)).toBe('That’s D3. C5 is C along the bottom, then 5 up the side.');
    expect(missWords(c5, { x: 3, y: 3 }, 2)).toBe('That’s D3. The house is 1 square north-west, then 1 north.');
    // Not flown yet: said (UX review round 2: it read as the line already by the map).
    expect(missWords(c5, { x: 3, y: 3 }, 1, false)).toBe('That’s D3. Ember hasn’t flown yet! C5 is C along the bottom, then 5 up the side.');
    expect(missWords(pondHouse, { x: 1, y: 1 }, 1)).toBe('That’s B5. Find the duck pond first, then look north-east of it.');
    expect(missWords(pondHouse, { x: 1, y: 1 }, 2)).toBe('That’s B5. The house is 1 square east.');
    expect(missWords(pondHouse, { x: 1, y: 2 }, 2)).toBe('That’s B4. The house is 1 square north-east.');
    expect(missWords(ice, { x: 6, y: 3 }, 1)).toBe('That’s Africa. Antarctica is the icy one, all along the bottom — find its name on the map.');
    expect(missWords(ice, { x: 6, y: 3 }, 2)).toBe('That’s Africa. Antarctica is 2 squares south.');
    // Tricky's four directions counted as it flies (code review round 1: from Africa, 2 north and 2 west, not 3 west).
    const america: Job = { band: 'tricky', stamp: 'postcard', map: 'world', to: 'north-america' };
    expect(missWords(america, { x: 6, y: 2 }, 2)).toBe('That’s Africa. North America is 3 squares west.');
  });

  it('for a reader, where the parcel’s going; by the map till the first move, how to find it', () => {
    expect(targetWords(lighthouse, { x: 2, y: 2 })).toBe('The lighthouse is 1 square north and 2 east.');
    expect(targetWords(lighthouse, { x: 4, y: 1 })).toBe('The lighthouse is here.');
    expect(targetWords(pondHouse, { x: 3, y: 3 })).toBe('The duck pond is at B4.');
    expect(targetWords(c5, { x: 3, y: 3 })).toBe('');
    // The world's place isn't named till a wrong delivery has (UX review round 2: which place fits the clue is the work).
    expect(targetWords(ice, WORLD_START)).toBe('');
    expect(targetWords(ice, WORLD_START, 1)).toBe('Antarctica is the icy one, all along the bottom.');
    expect(howToFind(lighthouse)).toBe('Find the lighthouse’s picture on the map, then steer Ember there.');
    expect(howToFind(c5)).toBe('C5 is C along the bottom, then 5 up the side.');
    expect(howToFind(pondHouse)).toBe('Find the duck pond first, then look north-east of it.');
    expect(howToFind(ice)).toBe('Which place fits the clue? Read the names on the map.');
  });

  it('the route said in runs, or past three, how many squares; what a delivery teaches', () => {
    expect(routeWords(['E', 'E', 'N'] as Dir[])).toBe('2 squares east, then 1 north');
    expect(routeWords(['NE'] as Dir[])).toBe('1 square north-east');
    // A wandering route (code review round 1: every run, too long for a phone's card).
    expect(routeWords(['N', 'S', 'N', 'S', 'E', 'E', 'N'] as Dir[])).toBe('7 squares');
    expect(learnedLine(lighthouse, ['E', 'E', 'N'])).toBe(`Ember flew 2 squares east, then 1 north. ${STAMPS[0].note}`);
    expect(learnedLine(c5, ['N', 'NW'])).toBe(`The house was at C5: C along, 5 up. Ember flew 1 square north, then 1 north-west. ${STAMPS.find((s) => s.id === 'seeds')!.note}`);
    // The map stamp's note says what "C along, 5 up" has (UX review round 2: seven lines on a phone).
    expect(learnedLine({ ...c5, stamp: 'map' }, ['N', 'NW'])).toBe('The house was at C5: C along, 5 up. Ember flew 1 square north, then 1 north-west.');
    // The world's: how far from Europe in a straight line — however Ember flew (UX review round 1).
    expect(learnedLine(ice, ['E', 'S', 'S', 'S', 'S', 'W'])).toBe(`${REGION_BY_ID.antarctica.fact} From Europe it’s about four squares in a straight line — about 12,000 km by the map’s scale.`);
  });

  it('how far: from Europe to the place’s nearest square, in a straight line — wherever Ember delivered (code and UX review round 2)', () => {
    const to = (id: (typeof REGIONS)[number]['id']): Job => ({ band: 'tricky', stamp: 'globe', map: 'world', to: id });
    const away = Object.fromEntries(REGIONS.filter((r) => r.id !== 'europe').map((r) => [r.id, squaresAway(to(r.id))]));
    // A ruler's straight line, not across and down: the Arctic 1, not 2; North America 2, not 3; the Pacific 4, not 5.
    expect(away).toEqual({ arctic: 1, atlantic: 1, africa: 1, asia: 1, 'north-america': 2, 'south-america': 3, indian: 3, pacific: 4, australia: 4, antarctica: 4 });
    // Its ruler to the nearest square: the Pacific's round the back of the world, east of Asia.
    expect(rulerTo(to('antarctica'))).toEqual({ x: 6, y: 5 });
    expect(rulerTo(to('pacific'))).toEqual({ x: 10, y: 2 });
  });

  it('how far: three choices, the right one first, in the middle or last — not by the parcel’s number (code and UX review rounds 1 and 2)', () => {
    expect(farChoices(4, 0)).toEqual([12000, 15000, 18000]);
    expect(farChoices(4, 1)).toEqual([9000, 12000, 15000]);
    expect(farChoices(4, 2)).toEqual([6000, 9000, 12000]);
    // Under one square, a half and a place-value slip, so even one square's answer moves (UX review round 2).
    expect(farChoices(1, 1)).toEqual([1500, 3000, 6000]);
    expect(farChoices(1, 2)).toEqual([300, 1500, 3000]);
    expect(farChoices(2, 2)).toEqual([600, 3000, 6000]);
    for (let n = 1; n <= 10; n++)
      for (const seed of [0, 1, 2]) {
        const c = farChoices(n, seed);
        expect(c.indexOf(n * 3000), `${n} ${seed}`).toBe(seed);
        expect(new Set(c).size).toBe(3);
        expect(Math.min(...c)).toBeGreaterThan(0);
      }
    // Over the rounds, each parcel's answer comes up in every place (code review round 2: parcel 1's was always first).
    for (const i of [0, 1, 2]) {
      const at = Array.from({ length: 40 }, (_, round) => {
        const j = jobFor('tricky', round, i);
        return farChoices(squaresAway(j), farSeed(j, round)).indexOf(squaresAway(j) * 3000);
      });
      expect(new Set(at), `parcel ${i + 1}`).toEqual(new Set([0, 1, 2]));
    }
  });
});

describe('Expert (docs/DESIGN-MINIGAMES.md §8.5): latitude and longitude on a 15° grid, and time zones', () => {
  const globe = (j: Job) => {
    if (j.map !== 'globe') throw new Error('a globe job');
    return j;
  };

  it('the world in 15° squares, 24 by 12, every continent and ocean on it; London’s square, Europe, to start', () => {
    expect([GLOBE_W, GLOBE_H, DEG]).toEqual([24, 12, 15]);
    expect(GLOBE).toHaveLength(GLOBE_H);
    for (const row of GLOBE) expect(row).toHaveLength(GLOBE_W);
    expect(new Set(GLOBE.join('').split('').map((code) => REGIONS.find((r) => r.code === code)?.id))).toEqual(new Set(REGIONS.map((r) => r.id)));
    // Real places in their squares: Britain Europe (a quarter of the world map's square, it was the Atlantic), Japan Asia, Peru South America.
    expect(globeRegionAt(cellAt(51.5, -0.1)).id).toBe('europe');
    expect(globeRegionAt(cellAt(52, 5)).id).toBe('europe');
    expect(globeRegionAt(cellAt(-34, 18)).id).toBe('africa');
    expect(globeRegionAt(cellAt(-32, 116)).id).toBe('australia');
    expect(globeRegionAt(cellAt(25, -150)).id).toBe('pacific');
    expect(globeRegionAt(cellAt(-80, 0)).id).toBe('antarctica');
    // South of Australia, west of Tasmania's 147° E, is the Indian Ocean (code review round 1: it was the Pacific).
    expect(globeRegionAt(cellAt(-50, 140)).id).toBe('indian');
    expect(globeRegionAt(cellAt(-50, 155)).id).toBe('pacific');
    // London, 51.5° N, 0.1° W.
    expect(cellAt(51.5, -0.1)).toEqual(GLOBE_START);
    expect(bandWords(GLOBE_START)).toEqual({ lat: '45°–60° N', long: '0°–15° W' });
    expect(bandWords({ x: 12, y: 6 })).toEqual({ lat: '0°–15° S', long: '0°–15° E' });
    expect(bandWords({ x: 0, y: 11 })).toEqual({ lat: '75°–90° S', long: '165°–180° W' });
    expect(bandWords({ x: 23, y: 0 })).toEqual({ lat: '75°–90° N', long: '165°–180° E' });
  });

  it('fifteen cities: none on a line, each in its own continent’s square, its January clock the 15° line nearest its longitude', () => {
    expect(CITIES.map((c) => c.id)).toEqual([...CITY_IDS]);
    const continent: Record<string, string> = {
      tokyo: 'asia', 'new-york': 'north-america', johannesburg: 'africa', beijing: 'asia', 'los-angeles': 'north-america', athens: 'europe', rio: 'south-america', bangkok: 'asia',
      chicago: 'north-america', luanda: 'africa', 'hong-kong': 'asia', lima: 'south-america', tashkent: 'asia', phoenix: 'north-america', 'addis-ababa': 'africa',
    };
    for (const c of CITIES) {
      expect(c.lat % DEG, c.id).not.toBe(0);
      expect(c.long % DEG, c.id).not.toBe(0);
      expect(Number.isInteger(c.lat) && Number.isInteger(c.long), c.id).toBe(true);
      expect(globeRegionAt(cellAt(c.lat, c.long)).id, c.id).toBe(continent[c.id]);
      expect(c.zone, c.id).toBe(Math.round(c.long / DEG));
      expect(c.fact.length, c.id).toBeGreaterThan(30);
    }
    // The real January clocks against London's (UTC): Tokyo +9, New York −5, Los Angeles −8, Rio −3, Athens +2.
    expect(['tokyo', 'new-york', 'los-angeles', 'rio', 'athens'].map((id) => CITY_BY_ID[id as keyof typeof CITY_BY_ID].zone)).toEqual([9, -5, -8, -3, 2]);
    // No wars, disasters or religion in a fact (a product rule).
    const text = CITIES.map((c) => c.fact).join(' ').toLowerCase();
    for (const word of ['war', 'battle', 'army', 'soldier', 'weapon', 'flood', 'earthquake', 'plague', 'god', 'temple', 'church', 'religio', 'pray']) expect(text, word).not.toMatch(new RegExp(`\\b${word}`));
    expect(coordsOf(CITY_BY_ID.tokyo)).toBe('36° N, 140° E');
    expect(coordsOf(CITY_BY_ID.rio)).toBe('23° S, 43° W');
    // Every city's coordinates and January clock, pinned to the atlas (code review round 1: a sign flipped passed).
    expect(Object.fromEntries(CITIES.map((c) => [c.id, [c.lat, c.long, c.zone]]))).toEqual({
      tokyo: [36, 140, 9], 'new-york': [41, -74, -5], johannesburg: [-26, 28, 2], beijing: [40, 116, 8], 'los-angeles': [34, -118, -8], athens: [38, 24, 2], rio: [-23, -43, -3],
      bangkok: [14, 101, 7], chicago: [42, -88, -6], luanda: [-9, 13, 1], 'hong-kong': [22, 114, 8], lima: [-12, -77, -5], tashkent: [41, 69, 5], phoenix: [33, -112, -7], 'addis-ababa': [9, 39, 3],
    });
  });

  it('the jobs: the globe, eight directions, every stamp; a city a parcel, a round’s three on three continents; London’s hour one its clock keeps the same day', () => {
    expect(BAND_DIRS.expert).toHaveLength(8);
    expect(BAND_STAMPS.expert).toEqual(STAMP_IDS);
    const all = jobs('expert', 10).map(globe);
    expect(new Set(all.map((j) => j.to))).toEqual(new Set(CITY_IDS));
    for (let r = 0; r < 10; r++) expect(new Set(all.slice(r * 3, r * 3 + 3).map((j) => globeRegionAt(targets(j)[0]).id)).size, `${r}`).toBe(3);
    for (const j of all) {
      expect(mapOf(j)).toEqual({ w: 24, h: 12, start: GLOBE_START, wraps: true });
      expect(LONDON_HOURS).toContain(j.hour);
      expect(cityHour(j) >= 0 && cityHour(j) < 24, j.to).toBe(true);
      expect(delivered(j, GLOBE_START)).toBe(false);
      expect(fewest(j), j.to).toBeLessThanOrEqual(12);
    }
    expect(new Set(all.map((j) => j.hour))).toEqual(new Set(LONDON_HOURS));
    expect(LONDON_HOURS).toEqual([9, 12, 15]);
    // Each time round the cities, a city's hour moves on (code review round 1: each was always asked at the same hour, a
    // round's questions back every five rounds): every hour its clock keeps the same day — Tokyo's 9:00 and 12:00 (at 15:00
    // it's tomorrow there).
    const by = jobs('expert', 15).map(globe);
    for (const id of CITY_IDS) expect(new Set(by.filter((j) => j.to === id).map((j) => j.hour)).size, id).toBe(id === 'tokyo' ? 2 : 3);
    expect([...new Set(by.filter((j) => j.to === 'tokyo').map((j) => j.hour))].sort()).toEqual([12, 9]);
    expect(by.slice(15).map((j) => j.hour)).not.toEqual(by.slice(0, 15).map((j) => j.hour));
    // Round the back of the world: west off the map's edge comes back from the east.
    expect(move(all[0], { x: 0, y: 3 }, 'W')).toEqual({ x: 23, y: 3 });
    expect(move(all[0], { x: 23, y: 3 }, 'NE')).toEqual({ x: 0, y: 2 });
  });

  it('the words: the clue by coordinates; where Ember is by its square’s lines; a wrong square, how to find it, then which way', () => {
    const j = globe(jobFor('expert', 0, 0)); // Tokyo
    expect(j.to).toBe('tokyo');
    expect(clueWords(j)).toMatch(/^A [a-z -]+ for Tokyo, 36° N, 140° E\.$/);
    expect(openingWords(j)).toMatch(/Find its square by the grid’s lines, then steer Ember there\.$/);
    expect(jobWords(j)).toBe('Fly it to Tokyo, 36° N, 140° E: its square is between the grid’s lines, every 15°. Then say what time it is there.');
    expect(howToFind(j)).toMatch(/^Latitude up the side/);
    expect(destWords(j)).toBe('Tokyo');
    expect(targets(j)).toEqual([{ x: 21, y: 3 }]);
    expect(whereWords(j, GLOBE_START)).toBe('over Europe, 45°–60° N, 0°–15° W');
    expect(targetWords(j, GLOBE_START)).toBe('');
    expect(missWords(j, { x: 20, y: 2 }, 1)).toBe('This square is 45°–60° N, 120°–135° E. Tokyo, 36° N, 140° E, is in the square between 30°–45° N and 135°–150° E.');
    expect(missWords(j, { x: 20, y: 2 }, 2)).toBe('This square is 45°–60° N, 120°–135° E. Tokyo is 1 square south-east.');
    // Plainly (code review round 1: "yet!").
    expect(missWords(j, GLOBE_START, 2, false)).toMatch(/Ember hasn’t flown yet\. Tokyo is/);
    // Far off, the way's across the 24-wide map (code review round 1: by the 12 of the world's, it was the wrong way).
    expect(missWords(j, GLOBE_START, 2)).toBe('This square is 45°–60° N, 0°–15° W. Tokyo is 1 square south-east, then 9 east.');
    // The other side of the equator or of 0°, said (UX review round 1: one letter apart).
    const jo = { ...j, to: 'johannesburg' as const };
    expect(missWords(jo, cellAt(26, 28), 1)).toBe('This square is 15°–30° N, 15°–30° E. Johannesburg, 26° S, 28° E, is in the square between 15°–30° S and 15°–30° E. S is south of the equator.');
    expect(missWords({ ...j, to: 'lima' as const }, cellAt(-12, 77), 1)).toMatch(/ W is west of 0°\.$/);
    expect(missWords(j, cellAt(-36, -140), 1)).toMatch(/ N is north of the equator\. E is east of 0°\.$/);
    // The short way round: from the Americas to Tokyo, west across the Pacific.
    expect(relWords({ x: 3, y: 3 }, { x: 21, y: 3 }, true, true, GLOBE_W)).toBe('6 squares west');
  });

  it('the time: four choices — the right one and an hour off by the other line, both the wrong way — and how it’s worked out', () => {
    const j = globe(jobFor('expert', 0, 0)); // Tokyo at London's 9:00
    expect(j.hour).toBe(9);
    // Its longitude first, what the time hangs on (UX review round 1: only on the ticket).
    expect(timeAsk(j)).toBe('Tokyo is at 140° E. It’s 09:00 in London, in January: what time is it there?');
    // Which way picks a pair, the nearest line picks in it (code review round 1: of three, the wrong way was the odd one).
    expect(timeChoices(j)).toEqual([0, 18, 19, 23]);
    expect(timeWords(j, 18)).toBe('Tokyo is at 140° E: the nearest 15° line is 135° E, so its clock is 9 hours ahead of London’s. 09:00 + 9 = 18:00.');
    expect(timeWords(j, 18)).toBe(zoneWords(j));
    expect(timeWords(j, 0)).toBe('Not 00:00: east of London, clocks are ahead — later in the day.');
    expect(timeWords(j, 23)).toBe('Not 23:00: east of London, clocks are ahead — later in the day.');
    expect(timeWords(j, 19)).toBe('Not 19:00: take the 15° line nearest 140° E — an hour for each 15° from 0°.');
    // Luanda's other line is 0°, London's own hour: the line beyond instead of a second London.
    const lu = { ...j, to: 'luanda' as const, hour: 12 };
    expect(timeChoices(lu)).toEqual([11, 12, 13, 14]);
    expect(timeWords(lu, 12)).toMatch(/^Not 12:00: take the 15° line nearest 13° E/);
    expect(timeWords(lu, 14)).toMatch(/^Not 14:00: take the 15° line/);
    expect(timeWords(lu, 11)).toMatch(/^Not 11:00: east of London, clocks are ahead/);
    // On a 24-hour clock: Tokyo at London's 15:00 is midnight (a job never asks it — tomorrow there).
    expect(cityHour({ ...j, hour: 15 })).toBe(0);
    const ny = globe(jobFor('expert', 0, 1));
    expect(ny.to).toBe('new-york');
    expect(timeWords(ny, cityHour(ny))).toBe(`New York is at 74° W: the nearest 15° line is 75° W, so its clock is 5 hours behind London’s. ${clockWords(ny.hour)} − 5 = ${clockWords(ny.hour - 5)}.`);
    expect(timeWords(ny, ny.hour + 5)).toMatch(/west of London, clocks are behind — earlier in the day\.$/);
    for (const x of jobs('expert', 15).map(globe)) {
      const c = timeChoices(x);
      expect(c, x.to).toHaveLength(4);
      expect(c).toContain(cityHour(x));
      expect(c.every((h) => h >= 0 && h < 24)).toBe(true);
      // Every wrong one says what's wrong with it.
      for (const h of c) if (h !== cityHour(x)) expect(timeWords(x, h), `${x.to} ${h}`).toMatch(/^Not \d\d:00: /);
    }
    expect([9, 0, 21].map(clockWords)).toEqual(['09:00', '00:00', '21:00']);
  });

  it('the lesson: its coordinates, its clock, a true thing about it — plainly', () => {
    const j = globe(jobFor('expert', 0, 0));
    expect(learnedLine(j, [])).toBe(`Tokyo, 36° N, 140° E: 140 ÷ 15 is about 9, so its clock is 9 hours ahead of London’s in January. ${CITY_BY_ID.tokyo.fact}`);
    for (const x of jobs('expert', 5)) expect(learnedLine(x, []), JSON.stringify(x)).not.toMatch(/!/);
    // Luanda's one hour.
    const lu = { ...j, to: 'luanda' as const };
    expect(learnedLine(lu, [])).toMatch(/so its clock is 1 hour ahead of London’s/);
  });
});
